import type { Quadrant, SourceKind, Track } from "./api";

// "Electronic---House" → { name: "House", parent: "Electronic" }
export function splitGenre(raw: string): { name: string; parent?: string } {
    const [parent, name] = raw.split("---");
    return name ? { name, parent } : { name: parent };
}

export function artistNames(t: Track): string {
    return t.artists.map((a) => a.name).join(", ");
}

export function keyName(key: string, mode: string): string {
    return `${key} ${mode}`;
}

export const KIND_LABEL: Record<SourceKind, string> = {
    playlist: "Playlist",
    album: "Album",
    tracks: "Pasted tracks",
};

export const QUADRANT_LABEL: Record<Quadrant, string> = {
    happy_energetic: "euphoric",
    happy_calm: "serene",
    sad_energetic: "tense",
    sad_calm: "melancholy",
};

export function plural(n: number, one: string, many = `${one}s`): string {
    return `${n} ${n === 1 ? one : many}`;
}
