import type { Profile } from "../lib/api";
import { plural } from "../lib/format";
import BarList from "./BarList";
import Panel, { Waiting } from "./Panel";

// who appears most
export default function TopArtists({ artists }: { artists?: Profile["artists"] }) {
    const top = (artists ?? []).slice(0, 6);
    const max = Math.max(...top.map((a) => a.count), 1);
    return (
        <Panel title="Top artists">
            {top.length === 0 ? (
                <Waiting className="h-28">Artists appear after the first ten songs.</Waiting>
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
