// A fake backend for UI work: `?mock=1` on any page, or NEXT_PUBLIC_MOCK=1. The POST encodes
// everything the stream needs into the id, so reloading /mix?id=…&mock=1 replays the same mix.
//
// Tracks and artists are invented. To see the error states, submit a playlist whose 22-character
// id starts with "private" (403), "busy0" (503) or "limit" (429), e.g.
// https://open.spotify.com/playlist/privateAAAAAAAAAAAAAAA
import type {
    Coverage,
    Features,
    Genre,
    MixEvent,
    Snapshot,
    Source,
    SourceKind,
    Track,
    TrackResult,
} from "./api";
import { RequestError } from "./errors";
import { EXAMPLES } from "./examples";
import { detectInput } from "./input";
import { computeProfile } from "./profile";

type Family = "electronic" | "hiphop" | "pop" | "rock" | "folk" | "jazz";

// where a mix sits on the mood map and what it sounds like
interface Character {
    name: string;
    subtitle: string;
    mood: number;
    energy: number;
    families: Family[];
    palette: string[];
}

const EXAMPLE_CHARACTERS: Character[] = [
    {
        name: "Today's Top Hits",
        subtitle: "The hottest 50. Cover: a pop star",
        mood: 0.62,
        energy: 0.64,
        families: ["pop", "hiphop", "electronic"],
        palette: ["#1f3b57", "#e86a5c", "#f4d7b5"],
    },
    {
        name: "lofi beats",
        subtitle: "chill beats, lofi vibes, new tracks every week",
        mood: 0.42,
        energy: 0.24,
        families: ["hiphop", "jazz", "electronic"],
        palette: ["#2e3a4f", "#8a6f9e", "#f2c3a7"],
    },
    {
        name: "All Out 80s",
        subtitle: "The biggest songs of the 1980s.",
        mood: 0.66,
        energy: 0.6,
        families: ["rock", "pop", "electronic"],
        palette: ["#3b1f4a", "#e2497a", "#f6d26b"],
    },
];

const NAMES = [
    "late trains",
    "kitchen radio",
    "after the rain",
    "sunday, slowly",
    "night swim",
    "the long way home",
    "warehouse hours",
    "postcards",
];
const ALBUMS = ["Paper Weather", "Low Tide Hotel", "Second Exposure", "Halation", "Fixer"];
const PALETTES = [
    ["#23303a", "#b9774a", "#e8dcc6"],
    ["#1c2a24", "#6e8f6a", "#e4d8b8"],
    ["#2b2034", "#b0596a", "#f0cfa8"],
    ["#14232f", "#4f7da0", "#d9e3e8"],
];

const ARTISTS: { name: string; family: Family; mood: number; energy: number }[] = [
    { name: "Marlow Vane", family: "pop", mood: 0.7, energy: 0.7 },
    { name: "The Quiet Arcades", family: "rock", mood: 0.4, energy: 0.55 },
    { name: "Juno Okafor", family: "pop", mood: 0.75, energy: 0.6 },
    { name: "Halide", family: "electronic", mood: 0.55, energy: 0.8 },
    { name: "Sable & Kin", family: "folk", mood: 0.35, energy: 0.2 },
    { name: "Dot Matrix Choir", family: "electronic", mood: 0.65, energy: 0.72 },
    { name: "Ines Laurent", family: "jazz", mood: 0.5, energy: 0.25 },
    { name: "Tape Hiss", family: "hiphop", mood: 0.45, energy: 0.2 },
    { name: "Coastal Static", family: "rock", mood: 0.3, energy: 0.65 },
    { name: "Kid Meridian", family: "hiphop", mood: 0.55, energy: 0.68 },
    { name: "Velvet Fathom", family: "electronic", mood: 0.3, energy: 0.35 },
    { name: "Ruby Lanes", family: "pop", mood: 0.82, energy: 0.78 },
    { name: "Northbound Owls", family: "folk", mood: 0.6, energy: 0.35 },
    { name: "Sundial", family: "jazz", mood: 0.62, energy: 0.4 },
    { name: "Mirela", family: "pop", mood: 0.25, energy: 0.3 },
    { name: "Concrete Garden", family: "hiphop", mood: 0.35, energy: 0.75 },
    { name: "Neon Parish", family: "rock", mood: 0.72, energy: 0.66 },
    { name: "Ota Brandt", family: "electronic", mood: 0.45, energy: 0.6 },
    { name: "Low Orchard", family: "folk", mood: 0.48, energy: 0.15 },
    { name: "Slow Shutter", family: "hiphop", mood: 0.38, energy: 0.18 },
    { name: "Polly Rae", family: "pop", mood: 0.68, energy: 0.5 },
    { name: "Glasshouse", family: "rock", mood: 0.55, energy: 0.82 },
    { name: "Amaro", family: "jazz", mood: 0.4, energy: 0.3 },
    { name: "Kestrel FM", family: "electronic", mood: 0.78, energy: 0.85 },
];

const TITLES = [
    "Afterglow",
    "Paper Moons",
    "Slow Burn",
    "Overpass",
    "Blue Hour",
    "Static Hearts",
    "Lemonade Sky",
    "Grain",
    "Hold the Light",
    "Riverside",
    "Ghost Notes",
    "Polaroid",
    "Stay Up",
    "Undertow",
    "Golden Hour",
    "Marigold",
    "Night Bus",
    "Velvet",
    "Small Hours",
    "Driftwood",
    "Holding Pattern",
    "Satellites",
    "Second Hand",
    "Heatwave",
    "Paper Cuts",
    "Neon Rain",
    "Cassette",
    "Low Light",
    "Wildflowers",
    "Echo Park",
    "Fever Dream",
    "Soft Focus",
    "Undercurrent",
    "Tangerine",
    "Long Exposure",
    "Lighthouse",
    "Cold Coffee",
    "Rooftops",
    "Silver Lining",
    "Overexposed",
    "Moth to Flame",
    "Window Seat",
    "Daylight Savings",
    "Halogen",
    "Seafoam",
    "Weightless",
    "Late Bloomer",
    "Hourglass",
    "Afterparty",
    "Monochrome",
    "Pressure",
    "Foxglove",
    "Strangers",
    "Contact Sheet",
    "Exit Signs",
    "Honeycomb",
    "Wavelength",
    "Little Fires",
    "Pale Blue",
    "Snowblind",
    "Saltwater",
    "Dusk",
];

const GENRES: Record<Family, string[]> = {
    electronic: [
        "Electronic---House",
        "Electronic---Deep House",
        "Electronic---Synth-pop",
        "Electronic---Downtempo",
        "Electronic---Ambient",
        "Electronic---Techno",
    ],
    hiphop: [
        "Hip Hop---Boom Bap",
        "Hip Hop---Trap",
        "Hip Hop---Instrumental",
        "Electronic---Downtempo",
    ],
    pop: [
        "Pop---Indie Pop",
        "Electronic---Synth-pop",
        "Pop---Ballad",
        "Funk / Soul---Contemporary R&B",
    ],
    rock: ["Rock---Indie Rock", "Rock---New Wave", "Rock---Alternative Rock", "Rock---Shoegaze"],
    folk: ["Folk, World, & Country---Folk", "Rock---Folk Rock", "Pop---Indie Pop"],
    jazz: ["Jazz---Contemporary Jazz", "Funk / Soul---Neo Soul", "Jazz---Soul-Jazz"],
};

const ACOUSTIC: Record<Family, number> = {
    electronic: 0.08,
    hiphop: 0.2,
    pop: 0.25,
    rock: 0.2,
    folk: 0.8,
    jazz: 0.6,
};
const INSTRUMENTAL: Record<Family, number> = {
    electronic: 0.5,
    hiphop: 0.55,
    pop: 0.05,
    rock: 0.1,
    folk: 0.1,
    jazz: 0.45,
};

const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// ---- the id: "m" + kind + example + count(2, base36) + seed

const KIND_CHAR: Record<SourceKind, string> = { playlist: "p", album: "a", tracks: "t" };

interface MockSpec {
    kind: SourceKind;
    example: number | null;
    count: number;
    seed: number;
}

function encodeId(s: MockSpec): string {
    return `m${KIND_CHAR[s.kind]}${s.example ?? "x"}${s.count.toString(36).padStart(2, "0")}${s.seed.toString(36)}`;
}

function decodeId(id: string): MockSpec | null {
    const m = /^m([pat])([0-9x])([0-9a-z]{2})([0-9a-z]+)$/.exec(id);
    if (!m) {
        return null;
    }
    const kind = (Object.keys(KIND_CHAR) as SourceKind[]).find((k) => KIND_CHAR[k] === m[1])!;
    return {
        kind,
        example: m[2] === "x" ? null : Number(m[2]),
        count: parseInt(m[3], 36),
        seed: parseInt(m[4], 36),
    };
}

export async function mockCreateMix(input: string, vibe: string): Promise<string> {
    await sleep(500);
    const d = detectInput(input);
    if (d.kind === "playlist" || d.kind === "album") {
        if (d.id.startsWith("private")) {
            throw new RequestError("This playlist is private, so we can't read it.", 403);
        }
        if (d.id.startsWith("busy0")) {
            throw new RequestError("mixtake is busy analysing other mixes. Try again soon.", 503);
        }
        if (d.id.startsWith("limit")) {
            throw new RequestError("You've started a lot of mixes. Slow down a little.", 429, 30);
        }
    }
    const seed = hash(`${input.trim()}\n${vibe.trim()}`);
    const rand = rng(seed);
    switch (d.kind) {
        case "playlist":
        case "album": {
            const example = EXAMPLES.findIndex((e) => e.url.endsWith(d.id));
            const count =
                d.kind === "album" ? 9 + Math.floor(rand() * 8) : 52 + Math.floor(rand() * 40);
            return encodeId({ kind: d.kind, example: example < 0 ? null : example, count, seed });
        }
        case "tracks":
            return encodeId({ kind: "tracks", example: null, count: d.count, seed });
        case "empty":
            throw new RequestError("Paste a playlist, an album or some track links.", 400);
        case "too_many":
            throw new RequestError(`That's ${d.count} tracks; the limit is 300.`, 400);
        default:
            throw new RequestError(
                "That doesn't look like a Spotify playlist, album or track link.",
                400,
            );
    }
}

// ---- the stream

export function mockMixExists(id: string): boolean {
    return decodeId(id) !== null;
}

// emits the events a real job would, then stops; returns a cancel function
export function streamMock(id: string, emit: (e: MixEvent) => void): () => void {
    const spec = decodeId(id);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = (ms: number, fn: () => void) => {
        timer = setTimeout(() => !cancelled && fn(), ms);
    };

    if (!spec) {
        later(300, () => emit({ name: "error", data: { message: "mix not found" } }));
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }

    const rand = rng(spec.seed);
    const character = characterFor(spec, rand);
    const tracks = makeTracks(spec, character, rand);
    const features = new Map(tracks.map((t) => [t.id, makeFeatures(t, character, rand)]));
    const outcome = new Map(
        tracks.map((t) => {
            const r = rand();
            return [t.id, r < 0.05 ? "no_audio" : r < 0.075 ? "failed" : "done"] as const;
        }),
    );

    const results: TrackResult[] = tracks.map((track) => ({ track, status: "pending" }));
    const coverage: Coverage = { total: tracks.length, done: 0, failed: 0 };
    const snapshot: Snapshot = {
        mix: {
            id,
            source: makeSource(spec, character),
            track_ids: tracks.map((t) => t.id),
            created_at: new Date().toISOString(),
        },
        status: "running",
        tracks: results.map((r) => ({ ...r })),
    };

    const pending = tracks.map((t) => t.id);
    const step = () => {
        if (pending.length === 0) {
            emit({ name: "profile", data: computeProfile(results, { ...coverage }) });
            emit({ name: "done", data: { ...coverage } });
            return;
        }
        // a few run at once, so they finish slightly out of order
        const [tid] = pending.splice(Math.floor(rand() * Math.min(4, pending.length)), 1);
        const i = results.findIndex((r) => r.track.id === tid);
        const status = outcome.get(tid)!;
        results[i] =
            status === "done"
                ? { track: results[i].track, status, features: features.get(tid) }
                : { track: results[i].track, status };
        if (status === "done") {
            coverage.done++;
        } else {
            coverage.failed++;
        }
        emit({ name: "track", data: results[i] });
        emit({ name: "progress", data: { ...coverage } });
        if (coverage.done > 0 && coverage.done % 10 === 0 && status === "done") {
            emit({ name: "profile", data: computeProfile(results, { ...coverage }) });
        }
        later(150 + rand() * 250, step);
    };

    later(400, () => {
        emit({ name: "snapshot", data: snapshot });
        later(600, step);
    });
    return () => {
        cancelled = true;
        clearTimeout(timer);
    };
}

function characterFor(spec: MockSpec, rand: () => number): Character {
    if (spec.example !== null && EXAMPLE_CHARACTERS[spec.example]) {
        return EXAMPLE_CHARACTERS[spec.example];
    }
    const families = Object.keys(GENRES) as Family[];
    const first = pick(families, rand);
    const second = pick(families, rand);
    const album = spec.kind === "album";
    return {
        name: album ? pick(ALBUMS, rand) : pick(NAMES, rand),
        subtitle: "",
        mood: 0.25 + rand() * 0.5,
        energy: 0.2 + rand() * 0.6,
        families: [first, second],
        palette: pick(PALETTES, rand),
    };
}

function makeSource(spec: MockSpec, c: Character): Source {
    if (spec.kind === "tracks") {
        return { kind: "tracks" };
    }
    return {
        kind: spec.kind,
        spotify_id: "mock" + spec.seed.toString(36),
        name: c.name,
        subtitle:
            c.subtitle || (spec.kind === "album" ? "Marlow Vane · 2024" : "made with mixtake"),
        cover: coverArt(c.palette),
        palette: c.palette,
    };
}

function makeTracks(spec: MockSpec, c: Character, rand: () => number): Track[] {
    const artists = ARTISTS.filter((a) => c.families.includes(a.family));
    const albumArtist = pick(artists, rand);
    const titles = shuffle([...TITLES], rand);
    return Array.from({ length: spec.count }, (_, i) => {
        const a = spec.kind === "album" ? albumArtist : pick(artists, rand);
        const feat = rand() < 0.12 ? [{ name: pick(ARTISTS, rand).name }] : [];
        return {
            id: `mock${spec.seed.toString(36)}${i.toString().padStart(3, "0")}`.padEnd(22, "x"),
            title: titles[i % titles.length] + (i >= titles.length ? " (Reprise)" : ""),
            artists: [{ name: a.name }, ...feat],
            duration_ms: 150_000 + Math.floor(rand() * 120_000),
            explicit: rand() < 0.1,
        };
    });
}

function makeFeatures(t: Track, c: Character, rand: () => number): Features {
    const artist = ARTISTS.find((a) => a.name === t.artists[0].name) ?? ARTISTS[0];
    const fam = artist.family;
    const n = (s: number) => (rand() - 0.5) * 2 * s;
    // between the artist's and the mix's character, with some scatter
    const m = clamp(0.5 * artist.mood + 0.5 * c.mood + n(0.18));
    const e = clamp(0.5 * artist.energy + 0.5 * c.energy + n(0.18));
    const genres = shuffle([...GENRES[fam]], rand)
        .slice(0, 3)
        .map((name, i): Genre => ({ name, score: round(clamp(0.7 - i * 0.22 + n(0.1))) }));
    const tempoBase = fam === "electronic" ? 122 : fam === "hiphop" ? 86 : 100;
    return {
        tempo: Math.round(tempoBase + (e - 0.5) * 40 + n(8)),
        key: pick(KEYS, rand),
        mode: rand() < m ? "major" : "minor",
        danceable: round(clamp(e * 0.7 + (fam === "electronic" ? 0.25 : 0.05) + n(0.1))),
        happy: round(clamp(m * 0.9 + n(0.08))),
        sad: round(clamp((1 - m) * 0.9 + n(0.08))),
        relaxed: round(clamp(1 - e + n(0.1))),
        aggressive: round(clamp(e * e * 0.8 + n(0.08))),
        party: round(clamp(e + n(0.1))),
        acoustic: round(clamp(ACOUSTIC[fam] + n(0.15))),
        instrumental: round(clamp(INSTRUMENTAL[fam] + n(0.2))),
        valence: round(0.36 + m * 0.28),
        arousal: round(0.36 + e * 0.28),
        genres,
    };
}

// a soft gradient square standing in for the playlist's cover
function coverArt(palette: string[]): string {
    const [a, b, c] = palette;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".65" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ---- small helpers

function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return (h >>> 0) % 2_000_000_000;
}

// mulberry32
function rng(seed: number): () => number {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick<T>(xs: T[], rand: () => number): T {
    return xs[Math.floor(rand() * xs.length)];
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
    for (let i = xs.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
}

function clamp(v: number): number {
    return Math.min(1, Math.max(0, v));
}

function round(v: number): number {
    return Math.round(v * 1000) / 1000;
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
