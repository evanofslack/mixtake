// The cover's edits live in the page's query string, so a link reproduces the cover. Values that
// match the defaults are left out to keep links short.
import {
    Align,
    CoverState,
    DEFAULT_STATE,
    FONT_IDS,
    FontId,
    Pos,
    POSITIONS,
    SIZE_MAX,
    SIZE_MIN,
    ZOOM_MAX,
} from "./canvas";

// which photos the strip shows: the mix's set (optionally re-searched with `vibe`) or the photos
// like `like`; `photo` is the one in the editor
export interface Shared {
    photo: number | null;
    vibe: string;
    like: number | null;
    state: CoverState;
}

export const SHARE_KEYS = [
    "photo",
    "vibe",
    "like",
    "x",
    "y",
    "zoom",
    "title",
    "sub",
    "font",
    "pos",
    "align",
    "color",
    "size",
    "scrim",
] as const;

type Query = Record<string, string | string[] | undefined>;

function str(q: Query, k: string): string | undefined {
    const v = q[k];
    return typeof v === "string" ? v : undefined;
}

function num(q: Query, k: string, lo: number, hi: number, fallback: number): number {
    const v = Number(str(q, k));
    return str(q, k) !== undefined && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

function id(q: Query, k: string): number | null {
    const v = Number(str(q, k));
    return Number.isInteger(v) && v > 0 ? v : null;
}

// the title defaults to the playlist's name, so it's only in the link when it differs
export function readShared(q: Query, defaultTitle: string): Shared {
    const d = DEFAULT_STATE;
    const font = str(q, "font") as FontId | undefined;
    const pos = str(q, "pos") as Pos | undefined;
    const align = str(q, "align") as Align | undefined;
    const color = str(q, "color");
    return {
        photo: id(q, "photo"),
        vibe: (str(q, "vibe") ?? "").slice(0, 200),
        like: id(q, "like"),
        state: {
            x: num(q, "x", 0, 1, d.x),
            y: num(q, "y", 0, 1, d.y),
            zoom: num(q, "zoom", 1, ZOOM_MAX, d.zoom),
            title: (str(q, "title") ?? defaultTitle).slice(0, 120),
            sub: (str(q, "sub") ?? d.sub).slice(0, 160),
            font: font && FONT_IDS.includes(font) ? font : d.font,
            pos: pos && POSITIONS.includes(pos) ? pos : d.pos,
            align: align === "left" || align === "center" || align === "right" ? align : d.align,
            color: color && /^[0-9a-f]{6}$/i.test(color) ? `#${color.toLowerCase()}` : d.color,
            size: num(q, "size", SIZE_MIN, SIZE_MAX, d.size),
            scrim: str(q, "scrim") === "1",
        },
    };
}

export function writeShared(s: Shared, defaultTitle: string): Record<string, string> {
    const d = DEFAULT_STATE;
    const st = s.state;
    const out: Record<string, string> = {};
    if (s.photo !== null) {
        out.photo = String(s.photo);
    }
    if (s.vibe) {
        out.vibe = s.vibe;
    }
    if (s.like !== null) {
        out.like = String(s.like);
    }
    if (st.zoom !== d.zoom || st.x !== d.x || st.y !== d.y) {
        out.x = String(st.x);
        out.y = String(st.y);
        out.zoom = String(st.zoom);
    }
    if (st.title !== defaultTitle) {
        out.title = st.title;
    }
    if (st.sub) {
        out.sub = st.sub;
    }
    if (st.font !== d.font) {
        out.font = st.font;
    }
    if (st.pos !== d.pos) {
        out.pos = st.pos;
    }
    if (st.align !== d.align) {
        out.align = st.align;
    }
    if (st.color !== d.color) {
        out.color = st.color.replace("#", "");
    }
    if (st.size !== d.size) {
        out.size = String(st.size);
    }
    if (st.scrim) {
        out.scrim = "1";
    }
    return out;
}

// the page's other params (id, mock) with the cover's replaced
export function mergeQuery(current: Query, shared: Record<string, string>): Record<string, string> {
    const keep: Record<string, string> = {};
    for (const [k, v] of Object.entries(current)) {
        if (typeof v === "string" && !(SHARE_KEYS as readonly string[]).includes(k)) {
            keep[k] = v;
        }
    }
    return { ...keep, ...shared };
}

export function slug(name: string | undefined): string {
    const s = (name ?? "")
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
        .replace(/-+$/, "");
    return s || "cover";
}
