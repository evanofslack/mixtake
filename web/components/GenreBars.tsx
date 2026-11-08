import type { Genre } from "../lib/api";
import { splitGenre } from "../lib/format";
import BarList from "./BarList";
import Panel, { Waiting } from "./Panel";

// the profile's strongest genres, with their Discogs parent style in grey
export default function GenreBars({ genres }: { genres?: Genre[] }) {
    const top = (genres ?? []).slice(0, 6);
    const max = Math.max(...top.map((g) => g.score), 0.0001);
    return (
        <Panel title="Genres" caption="From Essentia's Discogs genre model.">
            {top.length === 0 ? (
                <Waiting>Genres appear after the first ten songs.</Waiting>
            ) : (
                <BarList
                    label="top genres"
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
        </Panel>
    );
}
