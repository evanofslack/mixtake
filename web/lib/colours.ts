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
