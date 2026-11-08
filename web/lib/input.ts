// What the user pasted, recognised well enough to show a hint before submitting. The server does
// the real parsing; this only mirrors its rules closely enough to be helpful.

export type Detected =
    | { kind: "empty" }
    | { kind: "playlist" | "album"; id: string }
    | { kind: "tracks"; count: number; ignored: number }
    | { kind: "too_many"; count: number }
    | { kind: "mixed" }
    | { kind: "unsupported"; what: string }
    | { kind: "unknown" };

export const MAX_TRACKS = 300;

// open.spotify.com/{intl-xx/}{kind}/{id} and spotify:{kind}:{id}
const LINK =
    /(?:open\.spotify\.com\/(?:intl-[a-z-]+\/)?|spotify:)(playlist|album|track|artist|show|episode|user)[/:]([A-Za-z0-9]{22})?/g;

export function detectInput(text: string): Detected {
    const trimmed = text.trim();
    if (!trimmed) {
        return { kind: "empty" };
    }
    const collections: { kind: "playlist" | "album"; id: string }[] = [];
    const tracks = new Set<string>();
    let other: string | null = null;
    for (const m of trimmed.matchAll(LINK)) {
        const [, kind, id] = m;
        if ((kind === "playlist" || kind === "album") && id) {
            collections.push({ kind, id });
        } else if (kind === "track" && id) {
            tracks.add(id);
        } else if (kind !== "track") {
            other ??= kind;
        }
    }
    if (collections.length === 1 && tracks.size === 0) {
        return collections[0];
    }
    if (collections.length > 0) {
        return { kind: "mixed" };
    }
    if (tracks.size > MAX_TRACKS) {
        return { kind: "too_many", count: tracks.size };
    }
    if (tracks.size > 0) {
        const lines = trimmed.split(/\s+/).filter(Boolean).length;
        return { kind: "tracks", count: tracks.size, ignored: Math.max(0, lines - tracks.size) };
    }
    if (other) {
        return { kind: "unsupported", what: other };
    }
    return { kind: "unknown" };
}

export function canSubmit(d: Detected): boolean {
    return d.kind === "playlist" || d.kind === "album" || d.kind === "tracks";
}
