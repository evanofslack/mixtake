import { KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { Loader } from "@mantine/core";
import {
    CoverState,
    drawCover,
    fontLoaded,
    loadFont,
    panBy,
    clampCrop,
    ZOOM_MAX,
} from "../lib/canvas";
import { useWidth } from "../lib/useWidth";

type Props = {
    image: HTMLImageElement | null;
    loading: boolean;
    state: CoverState;
    onChange: (update: (s: CoverState) => CoverState) => void;
};

// the square preview: drag (or arrow keys) to move the photo, +/- to zoom
export default function CoverCanvas({ image, loading, state, onChange }: Props) {
    const [boxRef, width] = useWidth<HTMLDivElement>();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drag = useRef<{ id: number; x: number; y: number } | null>(null);
    const [, setFontTick] = useState(0);

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

    const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) {
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId || width === 0) {
            return;
        }
        // the photo follows the pointer, so the view moves the other way
        pan(-(e.clientX - d.x) / width, -(e.clientY - d.y) / width);
        drag.current = { ...d, x: e.clientX, y: e.clientY };
    };
    const onPointerUp = () => {
        drag.current = null;
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
                aria-label={`Cover preview${state.title ? `: ${state.title}` : ""}. Drag or use the arrow keys to move the photo, plus and minus to zoom, 0 to reset.`}
                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0"
                className={`block size-full touch-none select-none ${image ? "cursor-grab active:cursor-grabbing" : ""}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onKeyDown={onKeyDown}
            />
            {(loading || !image) && (
                <div className="absolute inset-0 flex items-center justify-center" role="status">
                    <Loader size="sm" color="var(--mix-accent)" aria-label="loading the photo" />
                </div>
            )}
        </div>
    );
}
