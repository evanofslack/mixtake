// Cover drawing: one pure function renders the cover at any size, so the preview and the
// downloaded JPG are the same picture. Everything is in fractions of the square, never pixels.
//
// A cover is three layers: a background fill, the photo in a (rounded) frame, and a list of text
// items drawn in order on top. A full-bleed frame hides the background entirely.

export type FontId = "serif" | "grotesk" | "display" | "mono" | "script" | "wide";
export type Pos = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
// one of the nine presets, or "free": dragged somewhere else, centred on (tx, ty)
export type Placement = Pos | "free";
export type Align = "left" | "center" | "right";
export type FillKind = "solid" | "horizontal" | "vertical" | "radial" | "diagonal";

export interface Fill {
    kind: FillKind;
    // "#rrggbb"; a solid fill only uses `a`
    a: string;
    b: string;
}

// where the photo sits, as fractions of the square: its centre, size and corner radius
export interface Frame {
    x: number;
    y: number;
    w: number;
    h: number;
    // as a fraction of the frame's shorter side
    radius: number;
}

export interface TextItem {
    id: string;
    text: string;
    // a smaller line under the text
    sub: string;
    font: FontId;
    pos: Placement;
    // the text box's centre as fractions of the square, used when pos is "free"
    tx: number;
    ty: number;
    align: Align;
    // "auto" picks light or dark from what's under the text; otherwise "#rrggbb"
    color: string;
    // text size as a percentage of the cover's side
    size: number;
    // a soft gradient behind the text, inside the photo
    scrim: boolean;
    // the face's weight axis (clamped to what the face has)
    weight: number;
    // width as a percentage: the face's own width axis where it has one, stretched beyond that
    width: number;
    // degrees the letters lean right (negative leans left)
    slant: number;
    // letter spacing in ems
    tracking: number;
    // degrees clockwise, around the text's centre
    rotate: number;
    // outline width in ems; 0 is none
    outline: number;
    outlineColor: string;
    // a soft shadow under the letters
    shadow: boolean;
}

export interface CoverState {
    // the centre of the crop, as a fraction of the image's width and height
    x: number;
    y: number;
    // 1 fits the photo's short side into the frame; higher crops in
    zoom: number;
    frame: Frame;
    bg: Fill;
    texts: TextItem[];
}

export const ZOOM_MAX = 2.5;
export const SIZE_MIN = 4;
export const SIZE_MAX = 20;

export const LIGHT = "#f7f4ee";
export const DARK = "#141210";

export const FULL_FRAME: Frame = { x: 0.5, y: 0.5, w: 1, h: 1, radius: 0 };
export const DEFAULT_FILL: Fill = { kind: "solid", a: LIGHT, b: DARK };

export const DEFAULT_TEXT: Omit<TextItem, "id" | "text"> = {
    sub: "",
    font: "serif",
    pos: "bl",
    tx: 0.5,
    ty: 0.5,
    align: "left",
    color: "auto",
    size: 11,
    scrim: false,
    weight: 400,
    width: 100,
    slant: 0,
    tracking: 0,
    rotate: 0,
    outline: 0,
    outlineColor: "#141210",
    shadow: true,
};

export const WIDTH_MIN = 50;
export const WIDTH_MAX = 150;
export const SLANT_MAX = 20;
export const TRACKING_MIN = -0.1;
export const TRACKING_MAX = 0.5;
export const OUTLINE_MAX = 0.1;

export const DEFAULT_STATE: Omit<CoverState, "texts"> = {
    x: 0.5,
    y: 0.5,
    zoom: 1,
    frame: FULL_FRAME,
    bg: DEFAULT_FILL,
};

export function textItem(id: string, u: Partial<TextItem> = {}): TextItem {
    return { id, text: "", ...DEFAULT_TEXT, ...u };
}

// the item in another face, at that face's usual weight and width
export function withFont(item: TextItem, font: FontId): TextItem {
    return { ...item, font, weight: FONTS[font].weight, width: FONTS[font].width };
}

// a full-bleed cover with one block of text, as the home page's examples use
export function simpleCover(u: Partial<TextItem>): CoverState {
    const base = u.font ? withFont(textItem("t0"), u.font) : textItem("t0");
    return { ...DEFAULT_STATE, texts: [{ ...base, ...u }] };
}

// the alignment that suits a preset's column
export function alignFor(pos: Placement, fallback: Align): Align {
    if (pos === "free") {
        return fallback;
    }
    return pos[1] === "l" ? "left" : pos[1] === "r" ? "right" : "center";
}

interface FontSpec {
    label: string;
    family: string;
    // the usual weight, and the range the face has
    weight: number;
    weights: [number, number];
    // the usual width, and the range of the face's width axis, if it has one
    width: number;
    stretch: [number, number] | null;
    // evens out how big each face looks at the same size
    scale: number;
    // line height, in ems
    leading: number;
    upper?: boolean;
    // the subtitle's face, when the title's doesn't read well small
    sub?: FontId;
}

// variable faces, self-hosted from public/fonts (see styles/index.css)
export const FONTS: Record<FontId, FontSpec> = {
    serif: {
        label: "Serif",
        family: "Fraunces",
        weight: 400,
        weights: [100, 900],
        width: 100,
        stretch: null,
        scale: 0.98,
        leading: 1.0,
    },
    grotesk: {
        label: "Grotesk",
        family: "Bricolage Grotesque",
        weight: 600,
        weights: [200, 800],
        width: 100,
        stretch: [75, 100],
        scale: 0.9,
        leading: 1.0,
    },
    display: {
        label: "Display",
        family: "Anybody",
        weight: 800,
        weights: [100, 900],
        width: 62.5,
        stretch: [50, 150],
        scale: 1.05,
        leading: 0.92,
        upper: true,
        sub: "grotesk",
    },
    wide: {
        label: "Wide",
        family: "Unbounded",
        weight: 700,
        weights: [200, 900],
        width: 100,
        stretch: null,
        scale: 0.78,
        leading: 1.02,
        sub: "grotesk",
    },
    mono: {
        label: "Mono",
        family: "Martian Mono",
        weight: 400,
        weights: [100, 800],
        width: 100,
        stretch: [75, 112.5],
        scale: 0.74,
        leading: 1.12,
    },
    script: {
        label: "Script",
        family: "Caveat",
        weight: 600,
        weights: [400, 700],
        width: 100,
        stretch: null,
        scale: 1.25,
        leading: 0.95,
        sub: "grotesk",
    },
};

export const FONT_IDS = Object.keys(FONTS) as FontId[];
export const POSITIONS: Pos[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];

export function cssFont(id: FontId, px: number, weight = FONTS[id].weight): string {
    const f = FONTS[id];
    return `${Math.round(clamp(weight, ...f.weights))} ${px}px "${f.family}"`;
}

const loadedFonts = new Set<FontId>();

// whether every face the cover uses has loaded, so a redraw needn't wait
export function fontsLoaded(state: CoverState): boolean {
    return state.texts.every((t) => loadedFonts.has(t.font));
}

// resolves once the faces of every text item can be drawn on a canvas
export async function loadFonts(state: CoverState): Promise<void> {
    await Promise.all(state.texts.map((t) => loadFont(t.font)));
}

// resolves once a face (and its subtitle face) can be drawn on a canvas
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

type CropState = Pick<CoverState, "x" | "y" | "zoom">;

// the frame's width over its height
export function aspectOf(frame: Frame): number {
    return frame.w / frame.h;
}

// the photo's rectangle that lands in the frame, in source pixels
export function cropRect(
    w: number,
    h: number,
    s: CropState,
    aspect = 1,
): { sx: number; sy: number; sw: number; sh: number } {
    let sw = w;
    let sh = w / aspect;
    if (sh > h) {
        sh = h;
        sw = h * aspect;
    }
    const z = clampZoom(s.zoom);
    sw /= z;
    sh /= z;
    const cx = clamp(s.x * w, sw / 2, w - sw / 2);
    const cy = clamp(s.y * h, sh / 2, h - sh / 2);
    return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh };
}

// keeps the crop inside the photo after a pan, zoom or frame change
export function clampCrop<T extends CropState>(w: number, h: number, s: T, aspect = 1): T {
    const zoom = round(clampZoom(s.zoom), 3);
    const { sx, sy, sw, sh } = cropRect(w, h, { ...s, zoom }, aspect);
    // rounded as the share link writes them, so a link redraws exactly this crop
    return { ...s, zoom, x: round((sx + sw / 2) / w, 4), y: round((sy + sh / 2) / h, 4) };
}

// moves the crop by a fraction of the visible frame (positive moves the view right/down)
export function panBy<T extends CropState>(
    w: number,
    h: number,
    s: T,
    dx: number,
    dy: number,
    aspect = 1,
): T {
    const { sw, sh } = cropRect(w, h, s, aspect);
    return clampCrop(w, h, { ...s, x: s.x + (dx * sw) / w, y: s.y + (dy * sh) / h }, aspect);
}

// how many source pixels span the frame's width at this crop
export function sourceWidth(w: number, h: number, zoom: number, aspect = 1): number {
    return cropRect(w, h, { x: 0.5, y: 0.5, zoom }, aspect).sw;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Image = CanvasImageSource & { width: number; height: number };

export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

// the frame in pixels of a size×size cover
export function frameBox(frame: Frame, size: number): Box {
    return {
        x: (frame.x - frame.w / 2) * size,
        y: (frame.y - frame.h / 2) * size,
        w: frame.w * size,
        h: frame.h * size,
    };
}

function isFull(frame: Frame): boolean {
    return frame.w >= 1 && frame.h >= 1;
}

// draws the cover into a size×size context
export function drawCover(ctx: Ctx, image: Image, state: CoverState, size: number): void {
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    drawBase(ctx, image, state, size);

    const fb = frameBox(state.frame, size);
    const layouts = state.texts.map((t) => ({ item: t, layout: layoutText(ctx, t, size) }));
    const colours = layouts.map(({ item, layout }) =>
        !layout
            ? LIGHT
            : item.color === "auto"
              ? autoColor(image, state, layout.bounds, size)
              : item.color,
    );
    // scrims sit on the photo, under every item's text
    layouts.forEach(({ item, layout }, i) => {
        if (layout && item.scrim) {
            ctx.save();
            clipFrame(ctx, state.frame, size);
            drawScrim(ctx, scrimRow(item), layout.bounds, fb, luminance(colours[i]) > 0.4);
            ctx.restore();
        }
    });
    layouts.forEach(({ item, layout }, i) => {
        if (layout) {
            drawText(ctx, item, layout, colours[i], size);
        }
    });
    ctx.restore();
}

// the background and the framed photo, without text
function drawBase(ctx: Ctx, image: Image, state: CoverState, size: number): void {
    const { frame } = state;
    if (!isFull(frame)) {
        ctx.fillStyle = fillStyle(ctx, state.bg, size);
        ctx.fillRect(0, 0, size, size);
    }
    const fb = frameBox(frame, size);
    const { sx, sy, sw, sh } = cropRect(image.width, image.height, state, aspectOf(frame));
    ctx.save();
    clipFrame(ctx, frame, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, sx, sy, sw, sh, fb.x, fb.y, fb.w, fb.h);
    ctx.restore();
}

function clipFrame(ctx: Ctx, frame: Frame, size: number): void {
    const fb = frameBox(frame, size);
    const r = frame.radius * Math.min(fb.w, fb.h);
    ctx.beginPath();
    if (r > 0) {
        ctx.roundRect(fb.x, fb.y, fb.w, fb.h, r);
    } else {
        ctx.rect(fb.x, fb.y, fb.w, fb.h);
    }
    ctx.clip();
}

// the canvas paint for a fill across a size×size cover
export function fillStyle(ctx: Ctx, fill: Fill, size: number): string | CanvasGradient {
    let g: CanvasGradient;
    switch (fill.kind) {
        case "solid":
            return fill.a;
        case "horizontal":
            g = ctx.createLinearGradient(0, 0, size, 0);
            break;
        case "vertical":
            g = ctx.createLinearGradient(0, 0, 0, size);
            break;
        case "diagonal":
            g = ctx.createLinearGradient(0, 0, size, size);
            break;
        case "radial":
            g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.71);
            break;
    }
    g.addColorStop(0, fill.a);
    g.addColorStop(1, fill.b);
    return g;
}

// the same fill as a CSS background, for swatches and previews
export function cssFill(fill: Fill): string {
    switch (fill.kind) {
        case "solid":
            return fill.a;
        case "horizontal":
            return `linear-gradient(90deg, ${fill.a}, ${fill.b})`;
        case "vertical":
            return `linear-gradient(180deg, ${fill.a}, ${fill.b})`;
        case "diagonal":
            return `linear-gradient(135deg, ${fill.a}, ${fill.b})`;
        case "radial":
            return `radial-gradient(circle, ${fill.a}, ${fill.b})`;
    }
}

interface Line {
    text: string;
    width: number;
}

// how a run of text is set: the CSS font, plus what canvas can't put in a font string
interface Style {
    font: string;
    // a font-stretch keyword within the face's width axis, or "normal"
    stretch: string;
    // a horizontal scale on top of the real stretch, for widths the face doesn't have
    sx: number;
    // letter spacing in px
    spacing: number;
    // tan of the slant angle
    shear: number;
}

interface Block {
    style: Style;
    px: number;
    lines: Line[];
    lead: number;
    cap: number;
}

interface TextLayout {
    title: Block;
    sub: Block | null;
    gap: number;
    // the text box before rotation
    box: Box;
    // the rotated box's bounds: what's placed, hit-tested and sampled for auto color
    bounds: Box;
}

// CSS font-stretch keywords, the only widths canvas takes
const STRETCHES: [number, string][] = [
    [50, "ultra-condensed"],
    [62.5, "extra-condensed"],
    [75, "condensed"],
    [87.5, "semi-condensed"],
    [100, "normal"],
    [112.5, "semi-expanded"],
    [125, "expanded"],
    [150, "extra-expanded"],
    [200, "ultra-expanded"],
];

function styleFor(
    ctx: Ctx,
    id: FontId,
    px: number,
    item: Pick<TextItem, "weight" | "width" | "tracking" | "slant">,
): Style {
    const spec = FONTS[id];
    const width = clamp(item.width, WIDTH_MIN, WIDTH_MAX);
    // the nearest width the face really has, then a stretch for the rest
    let real: [number, string] = [100, "normal"];
    if (spec.stretch && canStretch(ctx, id)) {
        const [lo, hi] = spec.stretch;
        real = STRETCHES.filter(([v]) => v >= lo && v <= hi).reduce((best, s) =>
            Math.abs(s[0] - width) < Math.abs(best[0] - width) ? s : best,
        );
    }
    return {
        font: cssFont(id, px, item.weight),
        stretch: real[1],
        sx: width / real[0],
        spacing: clamp(item.tracking, TRACKING_MIN, TRACKING_MAX) * px,
        shear: Math.tan((clamp(item.slant, -SLANT_MAX, SLANT_MAX) * Math.PI) / 180),
    };
}

function applyStyle(ctx: Ctx, st: Style): void {
    ctx.font = st.font;
    if ("fontStretch" in ctx) {
        ctx.fontStretch = st.stretch as CanvasFontStretch;
    }
    if ("letterSpacing" in ctx) {
        ctx.letterSpacing = nativeSpacing(ctx) ? `${st.spacing}px` : "0px";
    }
}

// a run's advance with the current style applied, without spacing after the last letter
function measure(ctx: Ctx, st: Style, text: string): number {
    if (!text) {
        return 0;
    }
    const n = [...text].length;
    const w = nativeSpacing(ctx)
        ? ctx.measureText(text).width - st.spacing
        : ctx.measureText(text).width + st.spacing * (n - 1);
    return w * st.sx;
}

// draws a run with its baseline's left end at (x, y), with the current style applied
function drawRun(
    ctx: Ctx,
    st: Style,
    text: string,
    x: number,
    y: number,
    mode: "fill" | "stroke",
): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(st.sx, 0, -st.shear, 1, 0, 0);
    const draw = (s: string, at: number) =>
        mode === "fill" ? ctx.fillText(s, at, 0) : ctx.strokeText(s, at, 0);
    if (st.spacing === 0 || nativeSpacing(ctx)) {
        draw(text, 0);
    } else {
        let at = 0;
        for (const ch of text) {
            draw(ch, at);
            at += ctx.measureText(ch).width + st.spacing;
        }
    }
    ctx.restore();
}

// whether this browser's canvas takes letterSpacing; checked once
let spacingOK: boolean | null = null;
function nativeSpacing(ctx: Ctx): boolean {
    if (spacingOK !== null) {
        return spacingOK;
    }
    if (!("letterSpacing" in ctx)) {
        return (spacingOK = false);
    }
    ctx.save();
    ctx.font = "40px sans-serif";
    ctx.letterSpacing = "0px";
    const a = ctx.measureText("abc").width;
    ctx.letterSpacing = "10px";
    const b = ctx.measureText("abc").width;
    ctx.restore();
    return (spacingOK = b - a > 20);
}

// whether this browser's canvas uses a face's width axis, checked once a face that has one loads
let stretchOK: boolean | null = null;
function canStretch(ctx: Ctx, id: FontId): boolean {
    if (stretchOK !== null) {
        return stretchOK;
    }
    if (!("fontStretch" in ctx)) {
        return (stretchOK = false);
    }
    if (!loadedFonts.has(id)) {
        return false;
    }
    ctx.save();
    ctx.font = cssFont(id, 40);
    ctx.fontStretch = "normal";
    const a = ctx.measureText("MMMM").width;
    ctx.fontStretch = "condensed";
    const b = ctx.measureText("MMMM").width;
    ctx.restore();
    return (stretchOK = b < a * 0.97);
}

function layoutText(ctx: Ctx, item: TextItem, size: number): TextLayout | null {
    const spec = FONTS[item.font];
    const titleText = transform(item.text.trim(), spec.upper);
    const subId = spec.sub ?? item.font;
    const subSpec = FONTS[subId];
    const subText = transform(item.sub.trim(), subSpec.upper);
    if (!titleText && !subText) {
        return null;
    }

    const margin = size * MARGIN;
    const col = item.pos === "free" ? null : item.pos[1];
    // centred text can use the whole width; a corner (or free text) leaves room for the photo
    const maxW = col === "c" ? size - 2 * margin : size * 0.78;

    let px = (size * item.size * spec.scale) / 100;
    let st = styleFor(ctx, item.font, px, item);
    applyStyle(ctx, st);
    let lines = wrap(ctx, st, titleText, maxW);
    // a single long word: shrink until it fits
    const widest = Math.max(0, ...lines.map((l) => l.width));
    if (widest > maxW) {
        px *= maxW / widest;
        st = styleFor(ctx, item.font, px, item);
        applyStyle(ctx, st);
        lines = wrap(ctx, st, titleText, maxW);
    }
    const cap = titleText ? ctx.measureText("H").actualBoundingBoxAscent : 0;
    const title: Block = { style: st, px, lines, lead: px * spec.leading, cap };

    let sub: Block | null = null;
    if (subText) {
        const sp = Math.max(size * 0.022, Math.min(px * 0.36, size * 0.045)) * subSpec.scale;
        // a subtitle in its own face keeps that face's usual weight and width
        const own = subId === item.font ? item : { ...item, ...subSpec };
        const sst = styleFor(ctx, subId, sp, { ...own, tracking: item.tracking });
        applyStyle(ctx, sst);
        sub = {
            style: sst,
            px: sp,
            lines: wrap(ctx, sst, subText, maxW),
            lead: sp * 1.3,
            cap: ctx.measureText("H").actualBoundingBoxAscent,
        };
    }

    const gap = titleText && sub ? Math.max(sub.px * 0.9, px * 0.28) : 0;
    const titleH = lines.length ? cap + (lines.length - 1) * title.lead : 0;
    const subH = sub ? sub.cap + (sub.lines.length - 1) * sub.lead : 0;
    const w = Math.max(0, ...lines.map((l) => l.width), ...(sub?.lines ?? []).map((l) => l.width));
    const h = titleH + gap + subH;

    // place the rotated box's bounds, then centre the upright box in them
    const rad = (item.rotate * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const bw = w * c + h * s;
    const bh = w * s + h * c;
    const o =
        item.pos === "free"
            ? freeOrigin(item.tx, item.ty, bw, bh, size)
            : presetOrigin(item.pos, bw, bh, size);
    const cx = o.x + bw / 2;
    const cy = o.y + bh / 2;
    return {
        title,
        sub,
        gap,
        box: { x: cx - w / 2, y: cy - h / 2, w, h },
        bounds: { x: o.x, y: o.y, w: bw, h: bh },
    };
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

// where a text item is drawn, in pixels of a size×size cover, or null when it has no text
export function textBox(ctx: Ctx, item: TextItem, size: number): Box | null {
    ctx.save();
    const layout = layoutText(ctx, item, size);
    ctx.restore();
    return layout?.bounds ?? null;
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

function drawText(ctx: Ctx, item: TextItem, layout: TextLayout, color: string, size: number): void {
    const { box, title, sub, gap } = layout;
    const lineX = (w: number) =>
        item.align === "left"
            ? box.x
            : item.align === "center"
              ? box.x + (box.w - w) / 2
              : box.x + box.w - w;

    // every line as a run, so the outline pass and the fill pass agree
    const runs: { block: Block; line: Line; y: number; alpha: number }[] = [];
    let baseline = box.y + title.cap;
    for (const line of title.lines) {
        runs.push({ block: title, line, y: baseline, alpha: 1 });
        baseline += title.lead;
    }
    if (title.lines.length) {
        baseline += gap - title.lead;
    }
    if (sub) {
        baseline += sub.cap;
        for (const line of sub.lines) {
            runs.push({ block: sub, line, y: baseline, alpha: 0.88 });
            baseline += sub.lead;
        }
    }

    ctx.save();
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((item.rotate * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.lineJoin = "round";
    // a faint shadow holds text on busy photos without looking like a sticker: dark under light
    // text, a soft light one under dark text
    const shadow = () => {
        if (!item.shadow) {
            return;
        }
        const light = luminance(color) > 0.4;
        ctx.shadowColor = light ? "rgba(0, 0, 0, 0.28)" : "rgba(255, 255, 255, 0.18)";
        ctx.shadowBlur = size * 0.012;
        ctx.shadowOffsetY = light ? size * 0.002 : 0;
    };
    const outline = clamp(item.outline, 0, OUTLINE_MAX);
    if (outline > 0) {
        // the stroke straddles the glyph's edge, so it's twice the visible width; the fill
        // then covers its inner half
        shadow();
        ctx.strokeStyle = item.outlineColor;
        for (const r of runs) {
            applyStyle(ctx, r.block.style);
            ctx.globalAlpha = r.alpha;
            ctx.lineWidth = outline * 2 * r.block.px;
            drawRun(ctx, r.block.style, r.line.text, lineX(r.line.width), r.y, "stroke");
        }
        ctx.shadowColor = "transparent";
    } else {
        shadow();
    }
    ctx.fillStyle = color;
    for (const r of runs) {
        applyStyle(ctx, r.block.style);
        ctx.globalAlpha = r.alpha;
        drawRun(ctx, r.block.style, r.line.text, lineX(r.line.width), r.y, "fill");
    }
    ctx.restore();
}

// which edge the scrim fades from: the preset's row, or for free text the nearer edge
function scrimRow(item: TextItem): "t" | "m" | "b" {
    if (item.pos !== "free") {
        return item.pos[0] as "t" | "m" | "b";
    }
    return item.ty < 0.4 ? "t" : item.ty > 0.6 ? "b" : "m";
}

// a gradient from the text's edge of the frame, dark under light text and light under dark
function drawScrim(ctx: Ctx, row: "t" | "m" | "b", box: Box, frame: Box, lightText: boolean): void {
    const rgb = lightText ? "10, 9, 8" : "250, 248, 244";
    const strong = lightText ? 0.55 : 0.6;
    const pad = Math.max(frame.w, frame.h) * 0.12;
    const fTop = frame.y;
    const fBottom = frame.y + frame.h;
    let g: CanvasGradient;
    if (row === "t") {
        const end = Math.min(fBottom, box.y + box.h + pad * 1.6);
        g = ctx.createLinearGradient(0, fTop, 0, end);
        g.addColorStop(0, `rgba(${rgb}, ${strong})`);
        g.addColorStop(0.55, `rgba(${rgb}, ${strong * 0.6})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(frame.x, fTop, frame.w, end - fTop);
    } else if (row === "b") {
        const start = Math.max(fTop, box.y - pad * 1.6);
        g = ctx.createLinearGradient(0, start, 0, fBottom);
        g.addColorStop(0, `rgba(${rgb}, 0)`);
        g.addColorStop(0.45, `rgba(${rgb}, ${strong * 0.6})`);
        g.addColorStop(1, `rgba(${rgb}, ${strong})`);
        ctx.fillStyle = g;
        ctx.fillRect(frame.x, start, frame.w, fBottom - start);
    } else {
        const top = Math.max(fTop, box.y - pad);
        const bottom = Math.min(fBottom, box.y + box.h + pad);
        g = ctx.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0, `rgba(${rgb}, 0)`);
        g.addColorStop(0.5, `rgba(${rgb}, ${strong * 0.75})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(frame.x, top, frame.w, bottom - top);
    }
}

function wrap(ctx: Ctx, st: Style, text: string, maxW: number): Line[] {
    const lines: Line[] = [];
    for (const para of text.split("\n")) {
        let current = "";
        for (const word of para.split(/\s+/).filter(Boolean)) {
            const next = current ? `${current} ${word}` : word;
            if (current && measure(ctx, st, next) > maxW) {
                lines.push({ text: current, width: measure(ctx, st, current) });
                current = word;
            } else {
                current = next;
            }
        }
        if (current) {
            lines.push({ text: current, width: measure(ctx, st, current) });
        }
    }
    return lines;
}

function transform(s: string, upper?: boolean): string {
    return upper ? s.toUpperCase() : s;
}

// light or dark text from what's under the text box: the background and framed photo, drawn
// into a fixed 48 px square so the preview and every export size agree
const SAMPLE = 48;
let sampler: HTMLCanvasElement | OffscreenCanvas | null = null;
const autoCache = new Map<string, string>();

function autoColor(image: Image, state: CoverState, box: Box, size: number): string {
    const f = (v: number) => Math.round((v / size) * SAMPLE);
    const { frame, bg } = state;
    const key = [
        srcKey(image),
        state.x.toFixed(4),
        state.y.toFixed(4),
        state.zoom.toFixed(3),
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        frame.radius,
        bg.kind,
        bg.a,
        bg.b,
    ]
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
    sctx.save();
    sctx.clearRect(0, 0, SAMPLE, SAMPLE);
    drawBase(sctx, image, state, SAMPLE);
    sctx.restore();
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

export function round(v: number, places: number): number {
    const f = 10 ** places;
    return Math.round(v * f) / f;
}

export function clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
}
