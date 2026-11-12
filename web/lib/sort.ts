import { energy, Features, mood, TrackResult } from "./api";

// how the energy arc and the song list order the songs: one choice for the whole page
export type SortKey = "order" | "energy" | "mood" | "tempo";
export type Sort = { by: SortKey; desc: boolean };

export const PLAYLIST_ORDER: Sort = { by: "order", desc: false };

export const SORT_LABEL: Record<SortKey, string> = {
    order: "playlist",
    energy: "energy",
    mood: "mood",
    tempo: "tempo",
};

export function sortValue(by: SortKey, f: Features): number {
    switch (by) {
        case "energy":
            return energy(f);
        case "mood":
            return mood(f);
        case "tempo":
            return f.tempo;
        default:
            return 0;
    }
}

export type Ranked = { id: string; position: number; result?: TrackResult };

// ids (in playlist order) sorted by s. Songs without features keep playlist order, after the
// analysed ones; ties keep playlist order too
export function sortTracks(ids: string[], byId: Map<string, TrackResult>, s: Sort): Ranked[] {
    const rows = ids.map((id, i) => ({ id, position: i + 1, result: byId.get(id) }));
    if (s.by === "order") {
        return s.desc ? rows.reverse() : rows;
    }
    const f = (r: Ranked) => (r.result?.status === "done" ? r.result.features : undefined);
    return rows.sort((a, b) => {
        const fa = f(a);
        const fb = f(b);
        if (!fa || !fb) {
            return (fa ? 0 : 1) - (fb ? 0 : 1) || a.position - b.position;
        }
        const d = sortValue(s.by, fa) - sortValue(s.by, fb);
        return (s.desc ? -d : d) || a.position - b.position;
    });
}
