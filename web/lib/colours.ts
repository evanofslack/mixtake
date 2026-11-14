// Colour helpers for the cover studio. Hex strings are lowercase "#rrggbb".

const MIN_COLOURS = 4;
const MAX_COLOURS = 5;
// RGB distances below which two colours count as the same, loosened until there are enough
const THRESHOLDS = [48, 32, 20];

// 4–5 distinct colours from a photo, most prominent first, none too close to `avoid` (white and
// black are offered separately). A photo with too few colours is padded with a lighter and a
// darker shade of its main one.
export function photoColours(
    colors: { hex: string; percent: number }[],
    avoid: string[],
): string[] {
    const hexes = colors.map((c) => c.hex.toLowerCase());
    let out: string[] = [];
    for (const t of THRESHOLDS) {
        out = [];
        for (const hex of hexes) {
            if (out.length < MAX_COLOURS && [...avoid, ...out].every((o) => distance(o, hex) > t)) {
                out.push(hex);
            }
        }
        if (out.length >= MIN_COLOURS) {
            return out;
        }
    }
    const base = out[0] ?? hexes[0];
    if (!base) {
        return out;
    }
    for (const f of [0.35, -0.35, 0.6, -0.6]) {
        if (out.length >= MIN_COLOURS) {
            break;
        }
        const shade = mix(base, f);
        if ([...avoid, ...out].every((o) => distance(o, shade) > 12)) {
            out.push(shade);
        }
    }
    return out;
}

// moves a colour towards white (f > 0) or black (f < 0)
export function mix(hex: string, f: number): string {
    const target = f > 0 ? 255 : 0;
    const a = Math.abs(f);
    return (
        "#" +
        rgb(hex)
            .map((v) => Math.round(v + (target - v) * a))
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("")
    );
}

export function distance(a: string, b: string): number {
    const [x, y] = [rgb(a), rgb(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

function rgb(hex: string): [number, number, number] {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

// three colours from a photo for the light that leaks around it: the most colourful of its
// distinct colours first, with lightness pulled into a range that glows on the page (a near-black
// purple comes out as a purple, a near-white as a pale tint) and the hue left as it is
export function glowColours(colors: { hex: string; percent: number }[], dark: boolean): string[] {
    const ranked = [...colors].sort(
        (a, b) => b.percent * (0.25 + chroma(b.hex)) - a.percent * (0.25 + chroma(a.hex)),
    );
    const picked = photoColours(ranked, []).slice(0, 3);
    const [lo, hi] = dark ? [38, 60] : [48, 72];
    return picked.map((hex) => {
        const [h, s, l] = hsl(hex);
        const sat = Math.min(85, s * 1.2);
        const light = Math.min(hi, Math.max(lo, l));
        return `hsl(${h.toFixed(0)} ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
    });
}

// how far a colour is from grey, 0 to 1
function chroma(hex: string): number {
    const c = rgb(hex);
    return (Math.max(...c) - Math.min(...c)) / 255;
}

// hue in degrees, saturation and lightness in percent
function hsl(hex: string): [number, number, number] {
    const [r, g, b] = rgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) {
        return [0, 0, l * 100];
    }
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s * 100, l * 100];
}

// two colours for a background from a photo's and a mix's colours: `a` at random, and `b` one
// that differs enough to read as a gradient, or a lighter or darker shade of `a` when none does
export function pickPair(colours: string[], rand: () => number = Math.random): [string, string] {
    const pool = [...new Set(colours.map((c) => c.toLowerCase()))];
    if (pool.length === 0) {
        return ["#f7f4ee", "#141210"];
    }
    const a = pool[Math.floor(rand() * pool.length)];
    const others = pool.filter((c) => distance(a, c) > 60);
    const b = others.length
        ? others[Math.floor(rand() * others.length)]
        : mix(a, rgb(a).reduce((s, v) => s + v, 0) / 765 > 0.55 ? -0.4 : 0.4);
    return [a, b];
}
