// The mood map's quadrants, and the front page's demo: film photos placed on the map, so dragging
// across it shows the idea behind mixtake.
import { useEffect, useState } from "react";
import type { Showcase } from "./api";
import { fetchShowcase } from "./client";
import type { FontId, Pos } from "./canvas";
import type { Domain } from "./domain";
import { mockShowcase } from "./mock";

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

// a photo on the front page's mood map; author and href are empty for the placeholders
export type ShowcasePhoto = {
    src: string;
    mood: number;
    energy: number;
    author: string;
    href: string;
};

// a showcase photo's image: medium is plenty for a frame a few hundred pixels wide
function toShowcase(s: Showcase): ShowcasePhoto[] {
    return s.photos.flatMap(({ mood, energy, photo }) => {
        const img =
            photo.images.find((i) => i.resolution === "medium") ??
            photo.images.find((i) => i.resolution === "high") ??
            photo.images[0];
        return img
            ? [{ src: img.url, mood, energy, author: photo.author, href: photo.permalink }]
            : [];
    });
}

// the front page's photos: real analogdb photos from /api/showcase, or the mock set in mock mode.
// If the showcase can't be loaded, the mock set stands in without credits, since its authors are
// made up. null while loading.
export function useShowcase(mock: boolean, ready: boolean): ShowcasePhoto[] | null {
    const [photos, setPhotos] = useState<ShowcasePhoto[] | null>(null);
    useEffect(() => {
        if (!ready) {
            return;
        }
        let live = true;
        fetchShowcase(mock)
            .then((s) => toShowcase(s))
            .then((ps) => (ps.length ? ps : Promise.reject(new Error("no photos"))))
            .catch(() =>
                mockShowcase().then((s) =>
                    toShowcase(s).map((p) => ({ ...p, author: "", href: "" })),
                ),
            )
            .then((ps) => live && setPhotos(ps));
        return () => {
            live = false;
        };
    }, [mock, ready]);
    return photos;
}

// the photo placed nearest a point on the map
export function nearestPhoto(
    photos: ShowcasePhoto[],
    mood: number,
    energy: number,
): ShowcasePhoto | undefined {
    let best: ShowcasePhoto | undefined;
    let bestD = Infinity;
    for (const p of photos) {
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

// the front page's hero: four made-up mixes, one in each quadrant, drawn as finished covers from
// the showcase photos. the fonts and corners vary so the stack shows what the studio can do
export type HeroCover = {
    title: string;
    sub: string;
    font: FontId;
    pos: Pos;
    mood: number;
    energy: number;
};

export const HERO_COVERS: HeroCover[] = [
    { title: "slow sundays", sub: "24 songs", font: "serif", pos: "bl", mood: 0.8, energy: 0.22 },
    { title: "summer static", sub: "", font: "display", pos: "tl", mood: 0.82, energy: 0.8 },
    { title: "after the rain", sub: "", font: "script", pos: "bc", mood: 0.2, energy: 0.24 },
    {
        title: "night shift",
        sub: "for the drive home",
        font: "mono",
        pos: "tr",
        mood: 0.2,
        energy: 0.78,
    },
];

// a photo for each cover: the nearest to its point on the map, never the same photo twice (each
// cover takes its pick in order, from what's left)
export function pickHeroPhotos(
    photos: ShowcasePhoto[],
    covers: { mood: number; energy: number }[],
): (ShowcasePhoto | undefined)[] {
    let left = photos;
    return covers.map((c) => {
        const p = nearestPhoto(left, c.mood, c.energy) ?? nearestPhoto(photos, c.mood, c.energy);
        left = left.filter((q) => q !== p);
        return p;
    });
}
