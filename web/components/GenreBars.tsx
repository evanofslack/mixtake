import { useMemo } from "react";
import type { Genre, TrackResult } from "../lib/api";
import { splitGenre } from "../lib/format";
import { hasGenre, useHighlight } from "../lib/highlight";
import BarList from "./BarList";
import { Waiting } from "./Panel";

// the profile's strongest genres, with their Discogs parent style in grey (inside Sound)
export default function GenreBars({ genres, tracks }: { genres?: Genre[]; tracks: TrackResult[] }) {
    const top = (genres ?? []).slice(0, 6);
    const max = Math.max(...top.map((g) => g.score), 0.0001);
    const hl = useHighlight();
    // the genres of whatever songs are highlighted
    const active = useMemo(() => {
        const lit = hl.tracks;
        if (!lit) {
            return undefined;
        }
        const songs = tracks.filter((t) => lit.has(t.track.id));
        return new Set(top.map((g) => g.name).filter((n) => songs.some((t) => hasGenre(t, n))));
    }, [hl.tracks, tracks, top]);
    return (
        <>
            {top.length === 0 ? (
                <Waiting>After ten songs</Waiting>
            ) : (
                <BarList
                    label="top genres"
                    active={active}
                    pinned={hl.pinned?.kind === "genre" ? hl.pinned.name : null}
                    onHover={(k) => hl.hover(k ? { kind: "genre", name: k } : null)}
                    onSelect={(k) => hl.toggle({ kind: "genre", name: k })}
                    items={top.map((g) => {
                        const { name, parent } = splitGenre(g.name);
                        return {
                            key: g.name,
                            value: g.score / max,
                            label: (
                                <>
                                    {name}
                                    {parent && parent !== name && (
                                        <span className="ml-1.5 text-xs text-muted">{parent}</span>
                                    )}
                                </>
                            ),
                        };
                    })}
                />
            )}
        </>
    );
}
