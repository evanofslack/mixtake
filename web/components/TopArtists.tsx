import { useMemo } from "react";
import type { Profile, TrackResult } from "../lib/api";
import { plural } from "../lib/format";
import BarList from "./BarList";
import Panel, { Waiting } from "./Panel";

// names listed when no artist repeats
const NAMED = 4;

type Props = {
    artists?: Profile["artists"];
    // the profile only keeps the top few artists, so the distinct count comes from the tracks
    tracks: TrackResult[];
};

// who appears most
export default function TopArtists({ artists, tracks }: Props) {
    const top = (artists ?? []).slice(0, 6);
    const max = Math.max(...top.map((a) => a.count), 1);
    const distinct = useMemo(
        () => new Set(tracks.flatMap((t) => t.track.artists.map((a) => a.name))).size,
        [tracks],
    );
    // a ranked list of ones says nothing, so describe the spread instead
    const noRepeats = top.length > 1 && max === 1;
    return (
        <Panel title="Top artists">
            {top.length === 0 ? (
                <Waiting className="h-28">After ten songs</Waiting>
            ) : noRepeats ? (
                <div className="text-sm">
                    <p className="font-medium">
                        {plural(Math.max(distinct, top.length), "artist")}, no repeats
                    </p>
                    <p className="mt-1 text-muted">
                        {top
                            .slice(0, NAMED)
                            .map((a) => a.name)
                            .join(", ")}
                        {distinct > NAMED ? ` and ${distinct - NAMED} more` : ""}.
                    </p>
                </div>
            ) : (
                <BarList
                    label="top artists"
                    items={top.map((a) => ({
                        key: a.name,
                        label: a.name,
                        value: a.count / max,
                        detail: plural(a.count, "song"),
                    }))}
                />
            )}
        </Panel>
    );
}
