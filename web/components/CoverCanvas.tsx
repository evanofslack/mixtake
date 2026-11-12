import { KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { Loader } from "@mantine/core";
import {
    Box,
    clampCrop,
    CoverState,
    drawCover,
    fontLoaded,
    loadFont,
    panBy,
    Pos,
    presetCentres,
    textBox,
    ZOOM_MAX,
} from "../lib/canvas";
import { useWidth } from "../lib/useWidth";

type Props = {
    image: HTMLImageElement | null;
    loading: boolean;
    state: CoverState;
    onChange: (update: (s: CoverState) => CoverState) => void;
};

// how near (as a fraction of the side) the text's centre must come to a preset to snap to it
const SNAP = 0.03;

type Drag =
    | { kind: "photo"; id: number; x: number; y: number }
    // the pointer's offset from the text's centre, in fractions of the side
    | { kind: "text"; id: number; dx: number; dy: number };

// the square preview: drag the text to move it (it snaps to the nine presets), drag elsewhere
// (or use the arrow keys) to move the photo, +/- to zoom
export default function CoverCanvas({ image, loading, state, onChange }: Props) {
    const [boxRef, width] = useWidth<HTMLDivElement>();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drag = useRef<Drag | null>(null);
    const [, setFontTick] = useState(0);
    const [overText, setOverText] = useState(false);
    // while the text is dragged: the snap targets, and the one it is snapped to
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
        if (!fontLoaded(state.font)) {
            let cancelled = false;
            loadFont(state.font).then(() => !cancelled && setFontTick((t) => t + 1));
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

    const pan = (dx: number, dy: number) =>
        image && onChange((s) => panBy(image.width, image.height, s, dx, dy));
    const zoom = (by: number) =>
        image &&
        onChange((s) =>
            clampCrop(image.width, image.height, {
                ...s,
                zoom: Math.min(ZOOM_MAX, Math.max(1, s.zoom + by)),
            }),
        );

    // the text's box as fractions of the side, measured the way drawCover lays it out
    const measure = (): Box | null => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || canvas.width === 0) {
            return null;
        }
        const b = textBox(ctx, state, canvas.width);
        const f = canvas.width;
        return b && { x: b.x / f, y: b.y / f, w: b.w / f, h: b.h / f };
    };
    // the pointer as fractions of the side
    const at = (e: PointerEvent<HTMLCanvasElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    const inside = (b: Box | null, p: { x: number; y: number }) =>
        !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

    const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
        if (e.button !== 0 || !image) {
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = at(e);
        const b = measure();
        if (b && inside(b, p)) {
            drag.current = {
                kind: "text",
                id: e.pointerId,
                dx: p.x - (b.x + b.w / 2),
                dy: p.y - (b.y + b.h / 2),
            };
            setGuides({ targets: presetCentres(b, 1), snapped: null });
        } else {
            drag.current = { kind: "photo", id: e.pointerId, x: e.clientX, y: e.clientY };
        }
    };
    const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId || width === 0) {
            if (!d && image) {
                setOverText(inside(measure(), at(e)));
            }
            return;
        }
        if (d.kind === "photo") {
            // the photo follows the pointer, so the view moves the other way
            pan(-(e.clientX - d.x) / width, -(e.clientY - d.y) / width);
            drag.current = { ...d, x: e.clientX, y: e.clientY };
            return;
        }
        const p = at(e);
        const cx = p.x - d.dx;
        const cy = p.y - d.dy;
        const near = guides?.targets.find((t) => Math.hypot(t.x - cx, t.y - cy) < SNAP);
        if (near) {
            // a preset keeps links short; the alignment follows its column, as the grid does
            const col = near.pos[1];
            onChange((s) => ({
                ...s,
                pos: near.pos,
                align: col === "l" ? "left" : col === "r" ? "right" : "center",
            }));
        } else {
            onChange((s) => ({
                ...s,
                pos: "free",
                tx: round(Math.min(1, Math.max(0, cx))),
                ty: round(Math.min(1, Math.max(0, cy))),
            }));
        }
        setGuides((g) => g && { ...g, snapped: near?.pos ?? null });
    };
    const onPointerUp = () => {
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
        } else {
            return;
        }
        e.preventDefault();
    };

    return (
        <div
            ref={boxRef}
            className="relative aspect-square w-full overflow-hidden rounded-sm bg-line shadow-sm"
        >
            <canvas
                ref={canvasRef}
                tabIndex={0}
                role="img"
                aria-label={`Cover preview${state.title ? `: ${state.title}` : ""}. Drag the text to move it. Drag or use the arrow keys to move the photo, plus and minus to zoom, 0 to reset.`}
                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0"
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
            {(loading || !image) && (
                <div className="absolute inset-0 flex items-center justify-center" role="status">
                    <Loader size="sm" color="var(--mix-accent)" aria-label="loading the photo" />
                </div>
            )}
        </div>
    );
}

// the snap targets while the text is dragged, drawn over the preview only, never into the export
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

// four decimals, as the share link writes them
function round(v: number): number {
    return Math.round(v * 10000) / 10000;
}
