// The mood map's quadrants, and the front page's demo: where each mock film photo sits on the map,
// so dragging across it shows the idea behind mixtake without a backend.
import type { Domain } from "./domain";
import { MOCK_SCENES } from "./mock";

export type Corner = "tl" | "tr" | "bl" | "br";

// each quadrant's name, and the plot corner that is its outer corner
export const QUADRANTS: { name: string; corner: Corner; x: Domain; y: Domain }[] = [
    { name: "tense", corner: "tl", x: [0, 0.5], y: [0.5, 1] },
    { name: "euphoric", corner: "tr", x: [0.5, 1], y: [0.5, 1] },
    { name: "melancholy", corner: "bl", x: [0, 0.5], y: [0, 0.5] },
    { name: "serene", corner: "br", x: [0.5, 1], y: [0, 0.5] },
];

// the quadrant a point on the map falls in
export function quadrantAt(mood: number, energy: number): string {
    const corner = `${energy >= 0.5 ? "t" : "b"}${mood >= 0.5 ? "r" : "l"}`;
    return QUADRANTS.find((q) => q.corner === corner)?.name ?? "";
}

export type ShowcasePhoto = { file: string; caption: string; mood: number; energy: number };

// hand-placed by eye: warm and bright to the right, cool and dark to the left, busy at the top
const PLACES: Record<string, [number, number]> = {
    "neon-bokeh": [0.72, 0.86],
    "hill-sunset": [0.84, 0.62],
    "desert-dunes": [0.6, 0.72],
    "golden-field": [0.82, 0.3],
    "pastel-morning": [0.66, 0.14],
    "snow-trees": [0.56, 0.1],
    "grey-beach": [0.32, 0.16],
    "forest-fog": [0.16, 0.32],
    "alpine-lake": [0.38, 0.42],
    "rain-window": [0.12, 0.58],
    "dusk-water": [0.34, 0.7],
    "bw-street": [0.18, 0.88],
};

export const SHOWCASE_PHOTOS: ShowcasePhoto[] = MOCK_SCENES.filter((s) => PLACES[s.file]).map(
    (s) => ({
        file: `/mock/${s.file}.jpg`,
        caption: s.caption,
        mood: PLACES[s.file][0],
        energy: PLACES[s.file][1],
    }),
);

// the photo placed nearest a point on the map
export function nearestPhoto(mood: number, energy: number): ShowcasePhoto {
    let best = SHOWCASE_PHOTOS[0];
    let bestD = Infinity;
    for (const p of SHOWCASE_PHOTOS) {
        const d = (p.mood - mood) ** 2 + (p.energy - energy) ** 2;
        if (d < bestD) {
            best = p;
            bestD = d;
        }
    }
    return best;
}

// a few points scattered around a centre, the same every render (a tiny seeded generator, so the
// server and the browser agree)
export function scatter(
    mood: number,
    energy: number,
    n: number,
    spread: number,
    seed: number,
): { x: number; y: number }[] {
    let s = seed >>> 0 || 1;
    const rand = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
    const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));
    return Array.from({ length: n }, () => ({
        x: clamp(mood + (rand() - 0.5) * 2 * spread),
        y: clamp(energy + (rand() - 0.5) * 2 * spread),
    }));
}
