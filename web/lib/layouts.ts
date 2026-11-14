// The photo frame's controls (size, shape, position) and the layout presets, as pure functions
// over the Frame that canvas.ts draws. The frame is stored as a free rectangle; the controls
// read it back as the nearest size, shape and 3×3 anchor.
import { Align, Frame, FULL_FRAME, INSET_FRAME, Pos, TextItem } from "./canvas";

export type Shape = "square" | "wide" | "tall" | "band";

export const SHAPES: { id: Shape; label: string; aspect: number }[] = [
    { id: "square", label: "Square", aspect: 1 },
    { id: "wide", label: "Wide", aspect: 4 / 3 },
    { id: "tall", label: "Tall", aspect: 3 / 4 },
    { id: "band", label: "Band", aspect: 2 },
];

export const FRAME_MIN = 0.5;
export const RADIUS_MAX = 0.5;

// the frame's longer side, as a fraction of the cover
export function frameSize(f: Frame): number {
    return Math.max(f.w, f.h);
}

export function shapeOf(f: Frame): Shape | null {
    const a = f.w / f.h;
    return SHAPES.find((s) => Math.abs(s.aspect - a) < 0.02)?.id ?? null;
}

function aspectFor(shape: Shape): number {
    return SHAPES.find((s) => s.id === shape)!.aspect;
}

// a frame of this size and aspect at one of the nine anchors. The longer side gets equal margins,
// so an anchored frame lines up with the cover's edges the way a printed border would.
export function frameAt(size: number, aspect: number, anchor: Pos, radius = 0): Frame {
    const w = aspect >= 1 ? size : size * aspect;
    const h = aspect >= 1 ? size / aspect : size;
    const g = (1 - size) / 2;
    const along = (c: string, len: number) =>
        c === "l" || c === "t" ? g + len / 2 : c === "r" || c === "b" ? 1 - g - len / 2 : 0.5;
    return {
        x: r4(along(anchor[1], w)),
        y: r4(along(anchor[0], h)),
        w: r4(w),
        h: r4(h),
        radius,
    };
}

// which of the nine anchors the frame sits at, if any. Along a side the frame fills, every anchor
// gives the same place, so that side reads as centred.
export function anchorOf(f: Frame): Pos | null {
    const side = (v: number, lo: string, hi: string) =>
        Math.abs(v - 0.5) < 0.002 ? "c" : v < 0.5 ? lo : hi;
    const row = side(f.y, "t", "b").replace("c", "m");
    const p = `${row}${side(f.x, "l", "r")}` as Pos;
    const g = frameAt(frameSize(f), f.w / f.h, p);
    return Math.abs(g.x - f.x) < 0.002 && Math.abs(g.y - f.y) < 0.002 ? p : null;
}

// the frame with one of its controls changed, keeping the others
export function reframe(
    f: Frame,
    u: { size?: number; shape?: Shape; anchor?: Pos; radius?: number },
): Frame {
    const size = u.size ?? frameSize(f);
    const aspect = u.shape ? aspectFor(u.shape) : f.w / f.h;
    const anchor = u.anchor ?? anchorOf(f) ?? "mc";
    return frameAt(size, aspect, anchor, u.radius ?? f.radius);
}

export type LayoutId = "full" | "inset" | "poster" | "polaroid" | "band";

export interface Layout {
    id: LayoutId;
    label: string;
    frame: Frame;
    // where the first text item goes; left alone when absent
    text?: Pick<TextItem, "pos" | "align" | "size">;
}

const text = (pos: Pos, align: Align, size: number) => ({ pos, align, size });

export const LAYOUTS: Layout[] = [
    { id: "full", label: "Full", frame: FULL_FRAME },
    { id: "inset", label: "Inset", frame: INSET_FRAME },
    {
        id: "poster",
        label: "Poster",
        frame: frameAt(0.84, 4 / 3, "bc", 0.03),
        text: text("tc", "center", 11),
    },
    {
        id: "polaroid",
        label: "Polaroid",
        frame: frameAt(0.86, 4 / 3, "tc"),
        text: text("bc", "center", 8),
    },
    { id: "band", label: "Band", frame: frameAt(1, 2, "mc"), text: text("tc", "center", 10) },
];

// the preset this frame matches, if any
export function layoutOf(f: Frame): LayoutId | null {
    const near = (a: number, b: number) => Math.abs(a - b) < 0.002;
    return (
        LAYOUTS.find(
            (l) =>
                near(l.frame.x, f.x) &&
                near(l.frame.y, f.y) &&
                near(l.frame.w, f.w) &&
                near(l.frame.h, f.h),
        )?.id ?? null
    );
}

function r4(v: number): number {
    return Math.round(v * 10000) / 10000;
}
