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

    return (
        <Panel
            title="Tempo and key"
            info="A histogram of each song's tempo in beats per minute, and the keys that come up most."
            className="lg:col-span-5"
        >
            {!profile ? (
                <Waiting className="h-56">After ten songs</Waiting>
            ) : (
                <div className="grid gap-5 sm:grid-cols-[3fr_2fr] lg:grid-cols-1 xl:grid-cols-[3fr_2fr]">
                    <div className="min-w-0">
                        <h3 className="mb-1 text-xs text-muted">BPM</h3>
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
                        <h3 className="mb-2 text-xs text-muted">Keys</h3>
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
