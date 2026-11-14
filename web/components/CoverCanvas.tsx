import { KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { Loader } from "@mantine/core";
import {
    alignFor,
    aspectOf,
    Box,
    clampCrop,
    CoverState,
    drawCover,
    fontsLoaded,
    Frame,
    loadFonts,
    panBy,
    Pos,
    presetCentres,
    TextItem,
    textBox,
    ZOOM_MAX,
} from "../lib/canvas";
import { useWidth } from "../lib/useWidth";
import type { Tab } from "./CoverControls";

type Props = {
    image: HTMLImageElement | null;
    loading: boolean;
    state: CoverState;
    onChange: (update: (s: CoverState) => CoverState) => void;
    // the text item the Text tab edits, outlined on the preview while that tab is open
    selected: string | null;
    showSelection: boolean;
    // a click on text selects it; a click on the photo or background opens that tab
    onPick: (tab: Tab, id?: string) => void;
    onDelete: (id: string) => void;
};

// how near (as a fraction of the side) the text's centre must come to a preset to snap to it
const SNAP = 0.03;
// how far (in px) a pointer may move and still count as a click
const CLICK = 4;

type Drag = { id: number; startX: number; startY: number; moved: boolean } & (
    | { kind: "photo"; x: number; y: number }
    // the pointer's offset from the text's centre, in fractions of the side
    | { kind: "text"; item: string; dx: number; dy: number }
    | { kind: "background" }
);

// the square preview: drag a text item to move it (it snaps to the nine presets), drag the photo
// (or use the arrow keys) to move it, +/- to zoom, Delete removes the selected text
export default function CoverCanvas({
    image,
    loading,
    state,
    onChange,
    selected,
    showSelection,
    onPick,
    onDelete,
}: Props) {
    const [boxRef, width] = useWidth<HTMLDivElement>();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drag = useRef<Drag | null>(null);
    const [, setFontTick] = useState(0);
    const [overText, setOverText] = useState(false);
    // while text is dragged: the snap targets, and the one it is snapped to
    const [guides, setGuides] = useState<{
        targets: { pos: Pos; x: number; y: number }[];
        snapped: Pos | null;
    } | null>(null);

    // redraw on any change; the first use of a face waits for it to load
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !image || width === 0) {
            return;
        }
        if (!fontsLoaded(state)) {
            let cancelled = false;
            loadFonts(state).then(() => !cancelled && setFontTick((t) => t + 1));
            return () => {
                cancelled = true;
            };
        }
        const px = Math.round(width * Math.min(window.devicePixelRatio || 1, 2.5));
        if (canvas.width !== px) {
            canvas.width = px;
            canvas.height = px;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
            drawCover(ctx, image, state, px);
        }
    });

    // dx, dy are fractions of the frame
    const pan = (dx: number, dy: number) =>
        image && onChange((s) => panBy(image.width, image.height, s, dx, dy, aspectOf(s.frame)));
    const zoom = (by: number) =>
        image &&
        onChange((s) =>
            clampCrop(
                image.width,
                image.height,
                { ...s, zoom: Math.min(ZOOM_MAX, Math.max(1, s.zoom + by)) },
                aspectOf(s.frame),
            ),
        );
    const updateItem = (s: CoverState, id: string, u: Partial<TextItem>): CoverState => ({
        ...s,
        texts: s.texts.map((t) => (t.id === id ? { ...t, ...u } : t)),
    });

    // an item's box as fractions of the side, measured the way drawCover lays it out
    const measure = (item: TextItem | undefined): Box | null => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || canvas.width === 0 || !item) {
            return null;
        }
        const b = textBox(ctx, item, canvas.width);
        const f = canvas.width;
        return b && { x: b.x / f, y: b.y / f, w: b.w / f, h: b.h / f };
    };
    // the topmost item under a point
    const hit = (p: { x: number; y: number }): { item: TextItem; box: Box } | null => {
        for (let i = state.texts.length - 1; i >= 0; i--) {
            const box = measure(state.texts[i]);
            if (box && inside(box, p)) {
                return { item: state.texts[i], box };
            }
        }
        return null;
    };
    // the pointer as fractions of the side
    const at = (e: PointerEvent<HTMLCanvasElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };

    const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
        if (e.button !== 0 || !image) {
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = at(e);
        const base = { id: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
        const h = hit(p);
        if (h) {
            onPick("text", h.item.id);
            drag.current = {
                ...base,
                kind: "text",
                item: h.item.id,
                dx: p.x - (h.box.x + h.box.w / 2),
                dy: p.y - (h.box.y + h.box.h / 2),
            };
            setGuides({ targets: presetCentres(h.box, 1), snapped: null });
        } else if (inside(frameFraction(state.frame), p)) {
            drag.current = { ...base, kind: "photo", x: e.clientX, y: e.clientY };
        } else {
            drag.current = { ...base, kind: "background" };
        }
    };
    const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId || width === 0) {
            if (!d && image) {
                setOverText(!!hit(at(e)));
            }
            return;
        }
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > CLICK) {
            d.moved = true;
        }
        if (d.kind === "background") {
            return;
        }
        if (d.kind === "photo") {
            // the photo follows the pointer, so the view moves the other way
            const { w, h } = state.frame;
            pan(-(e.clientX - d.x) / (width * w), -(e.clientY - d.y) / (width * h));
            drag.current = { ...d, x: e.clientX, y: e.clientY };
            return;
        }
        if (!d.moved) {
            return;
        }
        const p = at(e);
        const cx = p.x - d.dx;
        const cy = p.y - d.dy;
        const near = guides?.targets.find((t) => Math.hypot(t.x - cx, t.y - cy) < SNAP);
        if (near) {
            // a preset keeps links short; the alignment follows its column, as the grid does
            onChange((s) =>
                updateItem(s, d.item, { pos: near.pos, align: alignFor(near.pos, "left") }),
            );
        } else {
            onChange((s) =>
                updateItem(s, d.item, {
                    pos: "free",
                    tx: round(Math.min(1, Math.max(0, cx))),
                    ty: round(Math.min(1, Math.max(0, cy))),
                }),
            );
        }
        setGuides((g) => g && { ...g, snapped: near?.pos ?? null });
    };
    const onPointerUp = () => {
        const d = drag.current;
        // a click (not a pan) on the photo or the background opens its tab
        if (d && !d.moved && d.kind !== "text") {
            onPick(d.kind === "photo" ? "layout" : "background");
        }
        drag.current = null;
        setGuides(null);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        const moves: Record<string, [number, number]> = {
            ArrowLeft: [step, 0],
            ArrowRight: [-step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
        };
        if (moves[e.key]) {
            pan(...moves[e.key]);
        } else if (e.key === "+" || e.key === "=") {
            zoom(0.1);
        } else if (e.key === "-" || e.key === "_") {
            zoom(-0.1);
        } else if (e.key === "0") {
            onChange((s) => ({ ...s, x: 0.5, y: 0.5, zoom: 1 }));
        } else if ((e.key === "Delete" || e.key === "Backspace") && selected && showSelection) {
            onDelete(selected);
        } else {
            return;
        }
        e.preventDefault();
    };

    const title = state.texts[0]?.text;
    const outlined =
        showSelection && state.texts.length > 1 && !guides
            ? measure(state.texts.find((t) => t.id === selected))
            : null;
    return (
        <div
            ref={boxRef}
            className="relative aspect-square w-full overflow-hidden rounded-sm bg-line shadow-raised"
        >
            <canvas
                ref={canvasRef}
                tabIndex={0}
                role="img"
                aria-label={`Cover preview${title ? `: ${title}` : ""}. Drag text to move it. Drag or use the arrow keys to move the photo, plus and minus to zoom, 0 to reset, Delete to remove the selected text.`}
                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 Delete"
                className={`block size-full touch-none select-none ${
                    !image
                        ? ""
                        : guides || overText
                          ? "cursor-move"
                          : "cursor-grab active:cursor-grabbing"
                }`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onKeyDown={onKeyDown}
            />
            {guides && <Guides {...guides} />}
            {outlined && <Selection box={outlined} />}
            {(loading || !image) && (
                <div className="absolute inset-0 flex items-center justify-center" role="status">
                    <Loader size="sm" color="var(--mix-accent)" aria-label="loading the photo" />
                </div>
            )}
        </div>
    );
}

// a dashed box around the selected text, over the preview only, never in the export
function Selection({ box }: { box: Box }) {
    const pad = 0.012;
    return (
        <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
        >
            <rect
                x={(box.x - pad) * 100}
                y={(box.y - pad) * 100}
                width={(box.w + 2 * pad) * 100}
                height={(box.h + 2 * pad) * 100}
                fill="none"
                stroke="white"
                strokeOpacity={0.85}
                strokeWidth={0.3}
                strokeDasharray="1.2 0.8"
                vectorEffect="non-scaling-stroke"
                style={{ filter: "drop-shadow(0 0 1px rgb(0 0 0 / 0.6))" }}
            />
        </svg>
    );
}

// the snap targets while text is dragged, drawn over the preview only, never into the export
function Guides({
    targets,
    snapped,
}: {
    targets: { pos: Pos; x: number; y: number }[];
    snapped: Pos | null;
}) {
    const hit = targets.find((t) => t.pos === snapped);
    return (
        <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
        >
            {hit && (
                <g stroke="white" strokeOpacity={0.7} strokeWidth={0.25} strokeDasharray="1 1">
                    <line x1={hit.x * 100} x2={hit.x * 100} y1={0} y2={100} />
                    <line x1={0} x2={100} y1={hit.y * 100} y2={hit.y * 100} />
                </g>
            )}
            {targets.map((t) => (
                <circle
                    key={t.pos}
                    cx={t.x * 100}
                    cy={t.y * 100}
                    r={t.pos === snapped ? 1.2 : 0.7}
                    fill="white"
                    fillOpacity={t.pos === snapped ? 0.95 : 0.55}
                    stroke="black"
                    strokeOpacity={0.3}
                    strokeWidth={0.2}
                />
            ))}
        </svg>
    );
}

function inside(b: Box | null, p: { x: number; y: number }): boolean {
    return !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

// the frame as a box in fractions of the side
function frameFraction(f: Frame): Box {
    return { x: f.x - f.w / 2, y: f.y - f.h / 2, w: f.w, h: f.h };
}

// four decimals, as the share link writes them
function round(v: number): number {
    return Math.round(v * 10000) / 10000;
}
