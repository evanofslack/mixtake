// Linked highlighting: hovering or clicking a song, genre or artist in any chart highlights the
// same songs in every other chart. Hover is temporary; a click pins it until the next click, Esc
// or a click on empty space.
import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import type { TrackResult } from "./api";

export type Focus =
    | { kind: "track"; id: string }
    | { kind: "genre"; name: string }
    | { kind: "artist"; name: string };

interface Highlight {
    // what is highlighted now: the hovered thing, or else the pinned one
    focus: Focus | null;
    pinned: Focus | null;
    // the songs it covers, or null when nothing is focused
    tracks: Set<string> | null;
    hover: (f: Focus | null) => void;
    // pins f, or unpins it when it is already pinned
    toggle: (f: Focus | null) => void;
}

// a genre counts for a song when it is the song's top genre or scores at least this
const GENRE_MIN = 0.2;

const noop = () => {};
const HighlightContext = createContext<Highlight>({
    focus: null,
    pinned: null,
    tracks: null,
    hover: noop,
    toggle: noop,
});

export function HighlightProvider({
    tracks,
    children,
}: {
    tracks: TrackResult[];
    children: ReactNode;
}) {
    const [hovered, setHovered] = useState<Focus | null>(null);
    const [pinned, setPinned] = useState<Focus | null>(null);
    const focus = hovered ?? pinned;

    const covered = useMemo(() => (focus ? songsFor(focus, tracks) : null), [focus, tracks]);

    const toggle = useCallback(
        (f: Focus | null) => setPinned((p) => (f && p && same(p, f) ? null : f)),
        [],
    );

    useEffect(() => {
        if (!pinned) {
            return;
        }
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinned(null);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [pinned]);

    const value = useMemo(
        () => ({ focus, pinned, tracks: covered, hover: setHovered, toggle }),
        [focus, pinned, covered, toggle],
    );
    return <HighlightContext.Provider value={value}>{children}</HighlightContext.Provider>;
}

export function useHighlight(): Highlight {
    return useContext(HighlightContext);
}

export function same(a: Focus | null, b: Focus | null): boolean {
    if (!a || !b || a.kind !== b.kind) {
        return false;
    }
    return a.kind === "track" ? a.id === (b as typeof a).id : a.name === (b as typeof a).name;
}

// whether a song has this genre (see GENRE_MIN)
export function hasGenre(t: TrackResult, name: string): boolean {
    const gs = t.features?.genres ?? [];
    return gs.some((g, i) => g.name === name && (i === 0 || g.score >= GENRE_MIN));
}

export function hasArtist(t: TrackResult, name: string): boolean {
    return t.track.artists.some((a) => a.name === name);
}

function songsFor(f: Focus, tracks: TrackResult[]): Set<string> {
    if (f.kind === "track") {
        return new Set([f.id]);
    }
    const match = f.kind === "genre" ? hasGenre : hasArtist;
    return new Set(tracks.filter((t) => match(t, f.name)).map((t) => t.track.id));
}
