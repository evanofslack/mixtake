// The front page's examples: real playlists, each with the cover made from it. The data is
// written by scripts/bake-examples.mjs from scripts/examples.src.json and the running API; the
// mixes themselves are baked into the server (internal/examples), so a cover's link opens the
// same mix and photo anywhere.
import data from "./examples.json";

export type Example = {
    slug: string;
    // the playlist's name and owner, as Spotify gives them
    name: string;
    owner: string;
    // a few words on what it sounds like, written by hand
    genre: string;
    spotify: string;
    mixId: string;
    // the studio's share query (photo, c, …) that rebuilds the cover
    query: string;
    // the finished cover and the bare photo, under public/examples
    cover: string;
    photo: string;
    credit: { author: string; href: string };
    // the search phrases behind the photo, the one that found it first
    phrases: string[];
    // a few of its songs, "title — artist"
    tracks: string[];
    // the photo's colours, most prominent first, for the glow behind the hero
    colors: { hex: string; percent: number }[];
    mood: number;
    energy: number;
};

export const EXAMPLES: Example[] = data;

// the examples beside the input
export const FEATURED = EXAMPLES.slice(0, 4);

// where an example's cover leads: its finished mix with the cover restored, replayed quickly
// as if it were being analysed. Mock mode has no baked mixes, so it opens a made-up one in the
// example's corner of the map instead
export function exampleHref(ex: Example, mockId?: string): string {
    if (mockId) {
        return `/mix?id=${mockId}&mock=1`;
    }
    // id first, so the link reads like any other mix's
    const q = new URLSearchParams({ id: ex.mixId });
    for (const [k, v] of new URLSearchParams(ex.query)) {
        q.set(k, v);
    }
    q.set("replay", "1");
    return `/mix?${q}`;
}
