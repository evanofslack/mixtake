import { BarChart } from "@mantine/charts";
import type { Profile } from "../lib/api";
import { keyName, plural } from "../lib/format";
import BarList from "./BarList";
import Panel, { Waiting } from "./Panel";

type Props = {
    profile?: Profile;
};

// a tempo histogram and the most common keys
export default function TempoKey({ profile }: Props) {
    const tempos = (profile?.tempos ?? []).map((b) => ({ bpm: `${b.low}`, songs: b.count }));
    const keys = (profile?.keys ?? []).slice(0, 4);
    const maxKey = Math.max(...keys.map((k) => k.count), 1);
    const caption = profile
        ? `Mostly around ${Math.round(profile.averages.tempo)} BPM.`
        : "Beats per minute and musical key.";

    return (
        <Panel title="Tempo and key" caption={caption} className="lg:col-span-5">
            {!profile ? (
                <Waiting className="h-56">Tempo and key appear after the first ten songs.</Waiting>
            ) : (
                <div className="grid gap-5 sm:grid-cols-[3fr_2fr] lg:grid-cols-1 xl:grid-cols-[3fr_2fr]">
                    <div className="min-w-0">
                        <h3 className="mb-1 text-xs text-muted">Tempo (BPM)</h3>
                        <BarChart
                            h={150}
                            data={tempos}
                            dataKey="bpm"
                            series={[{ name: "songs", color: "var(--mix-mark)" }]}
                            gridAxis="none"
                            withYAxis={false}
                            tickLine="none"
                            textColor="var(--mix-muted)"
                            barProps={{ radius: [3, 3, 0, 0] }}
                            maxBarWidth={28}
                            xAxisProps={{ interval: "preserveStartEnd", minTickGap: 8 }}
                            tooltipAnimationDuration={150}
                            aria-label="tempo histogram"
                        />
                    </div>
                    <div className="min-w-0">
                        <h3 className="mb-2 text-xs text-muted">Most common keys</h3>
                        <BarList
                            label="most common keys"
                            items={keys.map((k) => ({
                                key: `${k.key}-${k.mode}`,
                                label: keyName(k.key, k.mode),
                                value: k.count / maxKey,
                                detail: plural(k.count, "song"),
                            }))}
                        />
                    </div>
                </div>
            )}
        </Panel>
    );
}
