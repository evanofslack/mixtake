// The cover's edits live in the page's query string, so a link reproduces the cover. `photo`,
// `vibe`, `like` and `seed` choose the photos and stay readable params; the cover itself is one
// `c` param: short-key JSON, base64url, with values that match the defaults left out. Links from
// before `c` (one param per setting) are still read.
import { MAX_SEED } from "./api";
import { MAX_TEXTS } from "./texts";
import {
    Align,
    clamp,
    CoverState,
    DEFAULT_STATE,
    DEFAULT_TEXT,
    Fill,
    FillKind,
    FONT_IDS,
    FontId,
    Frame,
    FULL_FRAME,
    Placement,
    POSITIONS,
    SIZE_MAX,
    SIZE_MIN,
    TextItem,
    textItem,
    ZOOM_MAX,
    OUTLINE_MAX,
    SLANT_MAX,
    TRACKING_MAX,
    TRACKING_MIN,
    WIDTH_MAX,
    WIDTH_MIN,
    withFont,
} from "./canvas";

// which photos the strip shows: the mix's set (optionally re-searched with `vibe`) or the photos
// like `like`; `photo` is the one in the editor
export interface Shared {
    photo: number | null;
    vibe: string;
    like: number | null;
    // the shuffle seed; 0 is the mix's usual set
    seed: number;
    state: CoverState;
}

// params from before `c`, read for old links and dropped when the URL is rewritten
const LEGACY_KEYS = [
    "x",
    "y",
    "zoom",
    "title",
    "sub",
    "font",
    "pos",
    "tx",
    "ty",
    "align",
    "color",
    "size",
    "scrim",
] as const;

export const SHARE_KEYS = ["photo", "vibe", "like", "seed", "c", ...LEGACY_KEYS] as const;

const FORMAT = 2;

type Query = Record<string, string | string[] | undefined>;

function str(q: Query, k: string): string | undefined {
    const v = q[k];
    return typeof v === "string" ? v : undefined;
}

function id(q: Query, k: string): number | null {
    const v = Number(str(q, k));
    return Number.isInteger(v) && v > 0 ? v : null;
}

// each field's short key and a reader that returns a valid value or undefined
type Reader<V> = (raw: unknown) => V | undefined;
type Schema<T> = { [K in keyof T]?: [string, Reader<T[K]>] };

const numIn =
    (lo: number, hi: number): Reader<number> =>
    (v) =>
        typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : undefined;
const textOf =
    (max: number): Reader<string> =>
    (v) =>
        typeof v === "string" ? v.slice(0, max) : undefined;
const oneOf =
    <V extends string>(values: readonly V[]): Reader<V> =>
    (v) =>
        values.includes(v as V) ? (v as V) : undefined;
const bool: Reader<boolean> = (v) => (typeof v === "boolean" ? v : undefined);
const hex: Reader<string> = (v) =>
    typeof v === "string" && /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : undefined;
const colour: Reader<string> = (v) => (v === "auto" ? "auto" : hex(v));

const FILL_KINDS: FillKind[] = ["solid", "horizontal", "vertical", "radial", "diagonal"];
const ALIGNS: Align[] = ["left", "center", "right"];
const PLACEMENTS: Placement[] = [...POSITIONS, "free"];

const FRAME: Schema<Frame> = {
    x: ["x", numIn(0, 1)],
    y: ["y", numIn(0, 1)],
    w: ["w", numIn(0.2, 1)],
    h: ["h", numIn(0.2, 1)],
    radius: ["r", numIn(0, 0.5)],
};

const FILL: Schema<Fill> = {
    kind: ["k", oneOf(FILL_KINDS)],
    a: ["a", hex],
    b: ["b", hex],
};

const TEXT: Schema<TextItem> = {
    text: ["t", textOf(120)],
    sub: ["s", textOf(160)],
    font: ["f", oneOf(FONT_IDS)],
    pos: ["p", oneOf(PLACEMENTS)],
    tx: ["x", numIn(0, 1)],
    ty: ["y", numIn(0, 1)],
    align: ["a", oneOf(ALIGNS)],
    color: ["c", colour],
    size: ["z", numIn(SIZE_MIN, SIZE_MAX)],
    scrim: ["m", bool],
    weight: ["w", numIn(100, 900)],
    width: ["d", numIn(WIDTH_MIN, WIDTH_MAX)],
    slant: ["k", numIn(-SLANT_MAX, SLANT_MAX)],
    tracking: ["g", numIn(TRACKING_MIN, TRACKING_MAX)],
    rotate: ["r", numIn(-90, 90)],
    outline: ["o", numIn(0, OUTLINE_MAX)],
    outlineColor: ["q", hex],
    shadow: ["h", bool],
    badge: ["b", (v) => (v === "" ? "" : hex(v))],
    badgeRadius: ["u", numIn(0, 1)],
};

const CROP: Schema<Pick<CoverState, "x" | "y" | "zoom">> = {
    x: ["x", numIn(0, 1)],
    y: ["y", numIn(0, 1)],
    zoom: ["z", numIn(1, ZOOM_MAX)],
};

// the fields of `value` that differ from `defaults`, under their short keys
function pack<T extends object>(value: T, defaults: T, schema: Schema<T>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(schema) as (keyof T)[]) {
        const [short] = schema[k]!;
        const v = value[k];
        if (v !== defaults[k]) {
            out[short] = typeof v === "string" && v.startsWith("#") ? v.slice(1) : v;
        }
    }
    return out;
}

function unpack<T extends object>(raw: unknown, defaults: T, schema: Schema<T>): T {
    const out = { ...defaults };
    if (!raw || typeof raw !== "object") {
        return out;
    }
    const r = raw as Record<string, unknown>;
    for (const k of Object.keys(schema) as (keyof T)[]) {
        const [short, read] = schema[k]!;
        const v = read(r[short]);
        if (v !== undefined) {
            out[k] = v;
        }
    }
    return out;
}

// the cover as the `c` param; the first item's text defaults to the playlist's name
export function encodeCover(state: CoverState, defaultTitle: string): string {
    const body: Record<string, unknown> = { v: FORMAT, ...pack(state, DEFAULT_STATE, CROP) };
    const frame = pack(state.frame, FULL_FRAME, FRAME);
    if (Object.keys(frame).length) {
        body.f = frame;
    }
    const bg = pack(state.bg, DEFAULT_STATE.bg, FILL);
    if (Object.keys(bg).length) {
        body.b = bg;
    }
    body.t = state.texts.map((t, i) =>
        pack(t, textItem(t.id, textDefaults(i, defaultTitle)), TEXT),
    );
    return toBase64Url(JSON.stringify(body));
}

export function decodeCover(c: string, defaultTitle: string): CoverState | null {
    let body: Record<string, unknown>;
    try {
        body = JSON.parse(fromBase64Url(c));
    } catch {
        return null;
    }
    if (!body || typeof body !== "object" || body.v !== FORMAT) {
        return null;
    }
    const crop = unpack(body, { x: 0.5, y: 0.5, zoom: 1 }, CROP);
    const texts = Array.isArray(body.t)
        ? body.t
              .slice(0, MAX_TEXTS)
              .map((raw, i) => unpack(raw, textItem(`t${i}`, textDefaults(i, defaultTitle)), TEXT))
        : [];
    return {
        ...crop,
        frame: unpack(body.f, FULL_FRAME, FRAME),
        bg: unpack(body.b, DEFAULT_STATE.bg, FILL),
        texts: texts.length ? texts : [textItem("t0", { text: defaultTitle })],
    };
}

// an old link's text: its face at that face's usual weight and width
function legacyText(u: Partial<TextItem>): TextItem {
    const t = textItem("t0", u);
    return withFont(t, t.font);
}

function textDefaults(i: number, defaultTitle: string): Partial<TextItem> {
    return i === 0 ? { text: defaultTitle } : {};
}

// a link from before `c`: one param per setting, one block of text
function readLegacy(q: Query, defaultTitle: string): CoverState {
    const num = (k: string, lo: number, hi: number, fallback: number) => {
        const s = str(q, k);
        const v = Number(s);
        return s !== undefined && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
    };
    const d = DEFAULT_TEXT;
    const color = colour(str(q, "color"));
    return {
        ...DEFAULT_STATE,
        x: num("x", 0, 1, DEFAULT_STATE.x),
        y: num("y", 0, 1, DEFAULT_STATE.y),
        zoom: num("zoom", 1, ZOOM_MAX, DEFAULT_STATE.zoom),
        texts: [
            legacyText({
                text: (str(q, "title") ?? defaultTitle).slice(0, 120),
                sub: (str(q, "sub") ?? d.sub).slice(0, 160),
                font: oneOf<FontId>(FONT_IDS)(str(q, "font")) ?? d.font,
                pos: oneOf(PLACEMENTS)(str(q, "pos")) ?? d.pos,
                tx: num("tx", 0, 1, d.tx),
                ty: num("ty", 0, 1, d.ty),
                align: oneOf(ALIGNS)(str(q, "align")) ?? d.align,
                color: color && color !== "auto" ? color : d.color,
                size: num("size", SIZE_MIN, SIZE_MAX, d.size),
                scrim: str(q, "scrim") === "1",
            }),
        ],
    };
}

export function readShared(q: Query, defaultTitle: string): Shared {
    const c = str(q, "c");
    return {
        photo: id(q, "photo"),
        vibe: (str(q, "vibe") ?? "").slice(0, 200),
        like: id(q, "like"),
        seed: Math.min(id(q, "seed") ?? 0, MAX_SEED),
        state: (c && decodeCover(c, defaultTitle)) || readLegacy(q, defaultTitle),
    };
}

export function writeShared(s: Shared, defaultTitle: string): Record<string, string> {
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
    if (s.seed) {
        out.seed = String(s.seed);
    }
    const st = s.state;
    const untouched =
        st.x === DEFAULT_STATE.x &&
        st.y === DEFAULT_STATE.y &&
        st.zoom === DEFAULT_STATE.zoom &&
        Object.keys(pack(st.frame, FULL_FRAME, FRAME)).length === 0 &&
        Object.keys(pack(st.bg, DEFAULT_STATE.bg, FILL)).length === 0 &&
        st.texts.length === 1 &&
        Object.keys(pack(st.texts[0], textItem("t0", { text: defaultTitle }), TEXT)).length === 0;
    if (!untouched) {
        out.c = encodeCover(st, defaultTitle);
    }
    return out;
}

function toBase64Url(s: string): string {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
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
