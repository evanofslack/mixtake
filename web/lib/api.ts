// Types mirroring the Go JSON in internal/mix. Keep in sync with internal/mix/types.go and events.go.

export type SourceKind = "playlist" | "album" | "tracks";

export interface Source {
    kind: SourceKind;
    spotify_id?: string;
    name?: string;
    subtitle?: string;
    cover?: string;
    palette?: string[];
}

export interface Artist {
    name: string;
    spotify_id?: string;
}

export interface Track {
    id: string;
    title: string;
    artists: Artist[];
    duration_ms: number;
    explicit: boolean;
    cover?: string;
    release_date?: string;
}

export interface Genre {
    name: string; // "Electronic---House"
    score: number;
}

export interface Features {
    tempo: number;
    key: string;
    mode: "major" | "minor";
    danceable: number;
    happy: number;
    sad: number;
    relaxed: number;
    aggressive: number;
    party: number;
    acoustic: number;
    instrumental: number;
    valence: number;
    arousal: number;
    genres: Genre[];
}

export interface Mix {
    id: string;
    source: Source;
    track_ids: string[];
    vibe?: string;
    created_at: string;
}

export type Status = "queued" | "running" | "done" | "failed";
export type TrackStatus = "pending" | "done" | "failed" | "no_audio" | "not_found";

export interface TrackResult {
    track: Track;
    status: TrackStatus;
    features?: Features;
}

export interface Coverage {
    total: number;
    done: number;
    failed: number;
}

export type Quadrant = "happy_energetic" | "happy_calm" | "sad_energetic" | "sad_calm";

export interface Averages {
    mood: number;
    energy: number;
    tempo: number;
    danceable: number;
    happy: number;
    sad: number;
    relaxed: number;
    aggressive: number;
    party: number;
    acoustic: number;
    instrumental: number;
}

export interface Profile {
    coverage: Coverage;
    averages: Averages;
    spread: Averages;
    quadrant: Quadrant;
    energy_arc: { index: number; energy: number; mood: number }[];
    tempos: { low: number; high: number; count: number }[];
    keys: { key: string; mode: string; count: number }[];
    genres: Genre[];
    artists: { name: string; count: number }[];
    summary: string;
}

export interface Snapshot {
    mix: Mix;
    status: Status;
    tracks: TrackResult[];
    profile?: Profile;
}

// server-sent events from GET /api/mixes/{id}/events, in the order they can arrive
export type MixEvent =
    | { name: "snapshot"; data: Snapshot }
    | { name: "track"; data: TrackResult }
    | { name: "progress"; data: Coverage }
    | { name: "profile"; data: Profile }
    | { name: "done"; data: Coverage }
    | { name: "error"; data: { message: string } };

export interface PhotoImage {
    resolution: "low" | "medium" | "high" | "raw";
    url: string;
    width: number;
    height: number;
}

export interface Photo {
    id: number;
    title: string;
    author: string;
    permalink: string;
    caption: string;
    score: number;
    grayscale: boolean;
    images: PhotoImage[];
    colors: { hex: string; percent: number }[];
    keywords: string[];
}

// GET /api/mixes/{id}/photos and /api/photos/{id}/similar. Image URLs are /api/img/{name} proxy
// paths, so the canvas can export them.
export interface PhotoSet {
    queries: string[]; // analogdb searches used, for the "why this cover" line
    palette: string[]; // target colours "#rrggbb" the ranking aimed for
    photos: Photo[];
}

export interface ApiError {
    error: string;
}

// mood and energy axes, matching Features.Mood and Features.Energy in Go
export function mood(f: Features): number {
    return clamp01(0.5 + (f.happy - f.sad) / 2);
}

export function energy(f: Features): number {
    return clamp01(0.4 * f.party + 0.3 * f.aggressive + 0.3 * (1 - f.relaxed));
}

function clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
}

// a ranked list of cover candidates and how they were chosen (GET /api/mixes/{id}/photos)
export interface PhotoSet {
    queries: string[]; // the analogdb searches used, for the "why this cover" line
    palette: string[]; // target colours "#rrggbb" the ranking aimed for
    photos: Photo[];
}
