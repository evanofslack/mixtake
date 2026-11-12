// Cover drawing: one pure function renders the crop and the text at any size, so the preview and
// the downloaded JPG are the same picture. Everything is in fractions of the square, never pixels.

export type FontId = "serif" | "grotesk" | "display" | "mono" | "script";
export type Pos = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
// one of the nine presets, or "free": dragged somewhere else, centred on (tx, ty)
export type Placement = Pos | "free";
export type Align = "left" | "center" | "right";

export interface CoverState {
    // the centre of the square crop, as a fraction of the image's width and height
    x: number;
    y: number;
    // 1 fits the short side of the photo into the square; higher crops in
    zoom: number;
    title: string;
    sub: string;
    font: FontId;
    pos: Placement;
    // the text box's centre as fractions of the square, used when pos is "free"
    tx: number;
    ty: number;
    align: Align;
    // "auto" picks light or dark from the photo under the text; otherwise "#rrggbb"
    color: string;
    // title size as a percentage of the cover's side
    size: number;
    // a soft gradient behind the text
    scrim: boolean;
}

export const ZOOM_MAX = 2.5;
export const SIZE_MIN = 4;
export const SIZE_MAX = 20;

export const DEFAULT_STATE: Omit<CoverState, "title"> = {
    x: 0.5,
    y: 0.5,
    zoom: 1,
    sub: "",
    font: "serif",
    pos: "bl",
    tx: 0.5,
    ty: 0.5,
    align: "left",
    color: "auto",
    size: 11,
    scrim: false,
};

interface FontSpec {
    label: string;
    family: string;
    weight: number;
    // evens out how big each face looks at the same size
    scale: number;
    // line height, in ems
    leading: number;
    upper?: boolean;
    // the subtitle's face, when the title's doesn't read well small
    sub?: FontId;
}

// self-hosted from public/fonts (see styles/index.css)
export const FONTS: Record<FontId, FontSpec> = {
    serif: { label: "Serif", family: "Instrument Serif", weight: 400, scale: 1.15, leading: 0.98 },
    grotesk: { label: "Grotesk", family: "Space Grotesk", weight: 600, scale: 0.86, leading: 1.02 },
    display: {
        label: "Display",
        family: "Bebas Neue",
        weight: 400,
        scale: 1.1,
        leading: 0.92,
        upper: true,
        sub: "grotesk",
    },
    mono: { label: "Mono", family: "IBM Plex Mono", weight: 500, scale: 0.78, leading: 1.1 },
    script: {
        label: "Script",
        family: "Caveat",
        weight: 600,
        scale: 1.25,
        leading: 0.95,
        sub: "grotesk",
    },
};

export const FONT_IDS = Object.keys(FONTS) as FontId[];
export const POSITIONS: Pos[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];

export const LIGHT = "#f7f4ee";
export const DARK = "#141210";

export function cssFont(id: FontId, px: number): string {
    const f = FONTS[id];
    return `${f.weight} ${px}px "${f.family}"`;
}

const loadedFonts = new Set<FontId>();

// whether loadFont(id) has finished, so a redraw needn't wait
export function fontLoaded(id: FontId): boolean {
    return loadedFonts.has(id);
}

// resolves once the title and subtitle faces can be drawn on a canvas
export async function loadFont(id: FontId): Promise<void> {
    if (loadedFonts.has(id) || typeof document === "undefined" || !document.fonts) {
        return;
    }
    const subId = FONTS[id].sub ?? id;
    try {
        await Promise.all([
            document.fonts.load(cssFont(id, 64)),
            document.fonts.load(cssFont(subId, 64)),
        ]);
    } catch {
        // draw with the fallback face rather than not at all
    }
    loadedFonts.add(id);
}

// the photo's rectangle that lands in the square, in source pixels
export function cropRect(
    w: number,
    h: number,
    s: Pick<CoverState, "x" | "y" | "zoom">,
): { sx: number; sy: number; side: number } {
    const side = Math.min(w, h) / clampZoom(s.zoom);
    const cx = clamp(s.x * w, side / 2, w - side / 2);
    const cy = clamp(s.y * h, side / 2, h - side / 2);
    return { sx: cx - side / 2, sy: cy - side / 2, side };
}

// keeps the crop inside the photo after a pan or zoom
export function clampCrop<T extends Pick<CoverState, "x" | "y" | "zoom">>(
    w: number,
    h: number,
    s: T,
): T {
    const zoom = round(clampZoom(s.zoom), 3);
    const { sx, sy, side } = cropRect(w, h, { ...s, zoom });
    // rounded as the share link writes them, so a link redraws exactly this crop
    return { ...s, zoom, x: round((sx + side / 2) / w, 4), y: round((sy + side / 2) / h, 4) };
}

// moves the crop by a fraction of the visible square (positive moves the view right/down)
export function panBy<T extends Pick<CoverState, "x" | "y" | "zoom">>(
    w: number,
    h: number,
    s: T,
    dx: number,
    dy: number,
): T {
    const side = Math.min(w, h) / clampZoom(s.zoom);
    return clampCrop(w, h, { ...s, x: s.x + (dx * side) / w, y: s.y + (dy * side) / h });
}

// how many source pixels span the cover's side at this crop
export function sourceSide(w: number, h: number, zoom: number): number {
    return Math.min(w, h) / clampZoom(zoom);
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface Line {
    text: string;
    width: number;
}

interface TextLayout {
    title: { font: string; px: number; lines: Line[]; lead: number; cap: number };
    sub: { font: string; px: number; lines: Line[]; lead: number; cap: number } | null;
    gap: number;
    box: { x: number; y: number; w: number; h: number };
}

// draws the cover into a size×size context
export function drawCover(
    ctx: Ctx,
    image: CanvasImageSource & { width: number; height: number },
    state: CoverState,
    size: number,
): void {
    const w = image.width;
    const h = image.height;
    const { sx, sy, side } = cropRect(w, h, state);

    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);

    const layout = layoutText(ctx, state, size);
    if (layout) {
        const color =
            state.color === "auto" ? autoColor(image, state, layout.box, size) : state.color;
        const light = luminance(color) > 0.4;
        if (state.scrim) {
            drawScrim(ctx, scrimRow(state), layout.box, size, light);
        }
        drawText(ctx, state, layout, color, light, size);
    }
    ctx.restore();
}

function layoutText(ctx: Ctx, state: CoverState, size: number): TextLayout | null {
    const spec = FONTS[state.font];
    const titleText = transform(state.title.trim(), spec.upper);
    const subId = spec.sub ?? state.font;
    const subText = transform(state.sub.trim(), FONTS[subId].upper);
    if (!titleText && !subText) {
        return null;
    }

    const margin = size * MARGIN;
    const col = state.pos === "free" ? null : state.pos[1];
    // centred text can use the whole width; a corner (or free text) leaves room for the photo
    const maxW = col === "c" ? size - 2 * margin : size * 0.78;

    let px = (size * state.size * spec.scale) / 100;
    ctx.font = cssFont(state.font, px);
    let lines = wrap(ctx, titleText, maxW);
    // a single long word: shrink until it fits
    const widest = Math.max(0, ...lines.map((l) => l.width));
    if (widest > maxW) {
        px *= maxW / widest;
        ctx.font = cssFont(state.font, px);
        lines = wrap(ctx, titleText, maxW);
    }
    const cap = titleText ? ctx.measureText("H").actualBoundingBoxAscent : 0;
    const title = { font: ctx.font, px, lines, lead: px * spec.leading, cap };

    let sub: TextLayout["sub"] = null;
    if (subText) {
        const sp = Math.max(size * 0.022, Math.min(px * 0.36, size * 0.045)) * FONTS[subId].scale;
        ctx.font = cssFont(subId, sp);
        sub = {
            font: ctx.font,
            px: sp,
            lines: wrap(ctx, subText, maxW),
            lead: sp * 1.3,
            cap: ctx.measureText("H").actualBoundingBoxAscent,
        };
    }

    const gap = titleText && sub ? Math.max(sub.px * 0.9, px * 0.28) : 0;
    const titleH = lines.length ? cap + (lines.length - 1) * title.lead : 0;
    const subH = sub ? sub.cap + (sub.lines.length - 1) * sub.lead : 0;
    const boxH = titleH + gap + subH;
    const boxW = Math.max(
        0,
        ...lines.map((l) => l.width),
        ...(sub?.lines ?? []).map((l) => l.width),
    );

    const { x, y } =
        state.pos === "free"
            ? freeOrigin(state.tx, state.ty, boxW, boxH, size)
            : presetOrigin(state.pos, boxW, boxH, size);
    return { title, sub, gap, box: { x, y, w: boxW, h: boxH } };
}

// the cover's margin, as a fraction of its side
const MARGIN = 0.07;
// how close to the edge free text may go, as a fraction of the side
const FREE_EDGE = 0.02;

// the top-left of a box at one of the nine presets
function presetOrigin(pos: Pos, w: number, h: number, size: number): { x: number; y: number } {
    const margin = size * MARGIN;
    const row = pos[0];
    const col = pos[1];
    return {
        x: col === "l" ? margin : col === "c" ? (size - w) / 2 : size - margin - w,
        y: row === "t" ? margin : row === "m" ? (size - h) / 2 : size - margin - h,
    };
}

// the top-left of a box centred on (tx, ty), kept on the cover
function freeOrigin(
    tx: number,
    ty: number,
    w: number,
    h: number,
    size: number,
): { x: number; y: number } {
    const edge = size * FREE_EDGE;
    return {
        x: clamp(tx * size - w / 2, edge, Math.max(edge, size - edge - w)),
        y: clamp(ty * size - h / 2, edge, Math.max(edge, size - edge - h)),
    };
}

export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

// where the text is drawn, in pixels of a size×size cover, or null when there is no text
export function textBox(ctx: Ctx, state: CoverState, size: number): Box | null {
    ctx.save();
    const layout = layoutText(ctx, state, size);
    ctx.restore();
    return layout?.box ?? null;
}

// the centre each preset would give a box this size, as fractions of the side: the snap targets
// when dragging. Wrapping depends on the preset's column, so this is approximate for centred
// presets of long titles, which is close enough to snap to.
export function presetCentres(box: Box, size: number): { pos: Pos; x: number; y: number }[] {
    return POSITIONS.map((pos) => {
        const o = presetOrigin(pos, box.w, box.h, size);
        return { pos, x: (o.x + box.w / 2) / size, y: (o.y + box.h / 2) / size };
    });
}

function drawText(
    ctx: Ctx,
    state: CoverState,
    layout: TextLayout,
    color: string,
    light: boolean,
    size: number,
): void {
    const { box, title, sub, gap } = layout;
    const lineX = (w: number) =>
        state.align === "left"
            ? box.x
            : state.align === "center"
              ? box.x + (box.w - w) / 2
              : box.x + box.w - w;

    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    // light text gets a faint shadow so it holds on busy photos without looking like a sticker
    if (light) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
        ctx.shadowBlur = size * 0.012;
        ctx.shadowOffsetY = size * 0.002;
    }

    let baseline = box.y + title.cap;
    if (title.lines.length) {
        ctx.font = title.font;
        for (const line of title.lines) {
            ctx.fillText(line.text, lineX(line.width), baseline);
            baseline += title.lead;
        }
        baseline += gap - title.lead;
    }
    if (sub) {
        ctx.font = sub.font;
        ctx.globalAlpha = 0.88;
        baseline += sub.cap;
        for (const line of sub.lines) {
            ctx.fillText(line.text, lineX(line.width), baseline);
            baseline += sub.lead;
        }
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent";
}

// which edge the scrim fades from: the preset's row, or for free text the nearer edge
function scrimRow(state: CoverState): "t" | "m" | "b" {
    if (state.pos !== "free") {
        return state.pos[0] as "t" | "m" | "b";
    }
    return state.ty < 0.4 ? "t" : state.ty > 0.6 ? "b" : "m";
}

// a gradient from the text's edge of the cover, dark under light text and light under dark
function drawScrim(
    ctx: Ctx,
    row: "t" | "m" | "b",
    box: TextLayout["box"],
    size: number,
    lightText: boolean,
): void {
    const rgb = lightText ? "10, 9, 8" : "250, 248, 244";
    const strong = lightText ? 0.55 : 0.6;
    const pad = size * 0.12;
    let g: CanvasGradient;
    if (row === "t") {
        const end = Math.min(size, box.y + box.h + pad * 1.6);
        g = ctx.createLinearGradient(0, 0, 0, end);
        g.addColorStop(0, `rgba(${rgb}, ${strong})`);
        g.addColorStop(0.55, `rgba(${rgb}, ${strong * 0.6})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, end);
    } else if (row === "b") {
        const start = Math.max(0, box.y - pad * 1.6);
        g = ctx.createLinearGradient(0, start, 0, size);
        g.addColorStop(0, `rgba(${rgb}, 0)`);
        g.addColorStop(0.45, `rgba(${rgb}, ${strong * 0.6})`);
        g.addColorStop(1, `rgba(${rgb}, ${strong})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, start, size, size - start);
    } else {
        const top = Math.max(0, box.y - pad);
        const bottom = Math.min(size, box.y + box.h + pad);
        g = ctx.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0, `rgba(${rgb}, 0)`);
        g.addColorStop(0.5, `rgba(${rgb}, ${strong * 0.75})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, top, size, bottom - top);
    }
}

function wrap(ctx: Ctx, text: string, maxW: number): Line[] {
    const lines: Line[] = [];
    for (const para of text.split("\n")) {
        let current = "";
        for (const word of para.split(/\s+/).filter(Boolean)) {
            const next = current ? `${current} ${word}` : word;
            if (current && ctx.measureText(next).width > maxW) {
                lines.push({ text: current, width: ctx.measureText(current).width });
                current = word;
            } else {
                current = next;
            }
        }
        if (current) {
            lines.push({ text: current, width: ctx.measureText(current).width });
        }
    }
    return lines;
}

function transform(s: string, upper?: boolean): string {
    return upper ? s.toUpperCase() : s;
}

// light or dark text from the photo under the text box. sampled from a fixed 48 px copy of the
// crop, so the preview and every export size agree
const SAMPLE = 48;
let sampler: HTMLCanvasElement | OffscreenCanvas | null = null;
const autoCache = new Map<string, string>();

function autoColor(
    image: CanvasImageSource & { width: number; height: number },
    state: CoverState,
    box: TextLayout["box"],
    size: number,
): string {
    const f = (v: number) => Math.round((v / size) * SAMPLE);
    const key = [srcKey(image), state.x.toFixed(4), state.y.toFixed(4), state.zoom.toFixed(3)]
        .concat([box.x, box.y, box.x + box.w, box.y + box.h].map(f).map(String))
        .join("|");
    const hit = autoCache.get(key);
    if (hit) {
        return hit;
    }
    sampler ??=
        typeof OffscreenCanvas !== "undefined"
            ? new OffscreenCanvas(SAMPLE, SAMPLE)
            : Object.assign(document.createElement("canvas"), { width: SAMPLE, height: SAMPLE });
    const sctx = sampler.getContext("2d", { willReadFrequently: true }) as Ctx | null;
    if (!sctx) {
        return LIGHT;
    }
    const { sx, sy, side } = cropRect(image.width, image.height, state);
    sctx.drawImage(image, sx, sy, side, side, 0, 0, SAMPLE, SAMPLE);
    const x0 = clamp(f(box.x), 0, SAMPLE - 1);
    const y0 = clamp(f(box.y), 0, SAMPLE - 1);
    const x1 = clamp(f(box.x + box.w), x0 + 1, SAMPLE);
    const y1 = clamp(f(box.y + box.h), y0 + 1, SAMPLE);
    const data = sctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
        sum += relLum(data[i], data[i + 1], data[i + 2]);
    }
    const mean = sum / (data.length / 4);
    // the black/white crossover is ~0.18; light text keeps mid-tones since it has a shadow
    const color = mean > 0.24 ? DARK : LIGHT;
    if (autoCache.size > 200) {
        autoCache.clear();
    }
    autoCache.set(key, color);
    return color;
}

function srcKey(image: CanvasImageSource): string {
    return image instanceof HTMLImageElement ? image.currentSrc || image.src : "img";
}

// relative luminance (0–1) of "#rrggbb"
export function luminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    return relLum((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

function relLum(r: number, g: number, b: number): number {
    const c = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function clampZoom(z: number): number {
    return clamp(Number.isFinite(z) ? z : 1, 1, ZOOM_MAX);
}

function round(v: number, places: number): number {
    const f = 10 ** places;
    return Math.round(v * f) / f;
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
}
