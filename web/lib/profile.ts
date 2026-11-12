// A client-side profile, the same shape the Go runner sends. Only mock mode uses it; the real
// numbers come from the server.
import {
    Averages,
    Coverage,
    energy,
    Features,
    Genre,
    mood,
    Profile,
    Quadrant,
    TrackResult,
} from "./api";

const AVERAGED = [
    "tempo",
    "danceable",
    "happy",
    "sad",
    "relaxed",
    "aggressive",
    "party",
    "acoustic",
    "instrumental",
] as const;

export function computeProfile(results: TrackResult[], coverage: Coverage): Profile {
    const done = results.filter((r) => r.status === "done" && r.features);
    const fs = done.map((r) => r.features as Features);
    const averages = stat(fs, mean);
    const spread = stat(fs, stdev);

    const tempoBins = new Map<number, number>();
    const keys = new Map<string, { key: string; mode: string; count: number }>();
    const genres = new Map<string, number>();
    const artists = new Map<string, number>();
    for (const r of done) {
        const f = r.features as Features;
        const low = Math.floor(f.tempo / 10) * 10;
        tempoBins.set(low, (tempoBins.get(low) ?? 0) + 1);
        const k = `${f.key} ${f.mode}`;
        keys.set(k, { key: f.key, mode: f.mode, count: (keys.get(k)?.count ?? 0) + 1 });
        for (const g of f.genres) {
            genres.set(g.name, (genres.get(g.name) ?? 0) + g.score);
        }
        for (const a of r.track.artists) {
            artists.set(a.name, (artists.get(a.name) ?? 0) + 1);
        }
    }
    const lows = [...tempoBins.keys()];
    const tempos =
        lows.length === 0
            ? []
            : range(Math.min(...lows), Math.max(...lows), 10).map((low) => ({
                  low,
                  high: low + 10,
                  count: tempoBins.get(low) ?? 0,
              }));
    const genreList: Genre[] = [...genres.entries()]
        .map(([name, score]) => ({ name, score: score / Math.max(1, done.length) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    const quadrant = quadrantOf(averages.mood, averages.energy);
    return {
        coverage,
        averages,
        spread,
        quadrant,
        energy_arc: done.map((r, i) => ({
            index: i,
            energy: energy(r.features as Features),
            mood: mood(r.features as Features),
        })),
        tempos,
        keys: [...keys.values()].sort((a, b) => b.count - a.count).slice(0, 6),
        genres: genreList,
        artists: [...artists.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            .slice(0, 8),
        summary: summarise(averages, done.length),
    };
}

function stat(fs: Features[], agg: (xs: number[]) => number): Averages {
    const out = {
        mood: agg(fs.map(mood)),
        energy: agg(fs.map(energy)),
    } as Averages;
    for (const k of AVERAGED) {
        out[k] = agg(fs.map((f) => f[k]));
    }
    return out;
}

function mean(xs: number[]): number {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs: number[]): number {
    const m = mean(xs);
    return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function range(from: number, to: number, step: number): number[] {
    const out = [];
    for (let v = from; v <= to; v += step) {
        out.push(v);
    }
    return out;
}

function quadrantOf(m: number, e: number): Quadrant {
    return `${m >= 0.5 ? "happy" : "sad"}_${e >= 0.5 ? "energetic" : "calm"}` as Quadrant;
}

// the headline, matching summary() in internal/mix/profile.go
function summarise(a: Averages, n: number): string {
    if (n === 0) {
        return "";
    }
    const m = moodWord(a.mood);
    return `${m[0].toUpperCase()}${m.slice(1)} and ${energyWord(a.energy)}`;
}

function moodWord(m: number): string {
    return m < 0.35 ? "melancholy" : m < 0.5 ? "bittersweet" : m < 0.65 ? "warm" : "euphoric";
}

function energyWord(e: number): string {
    return e < 0.35 ? "hushed" : e < 0.5 ? "laid-back" : e < 0.65 ? "driving" : "intense";
}
