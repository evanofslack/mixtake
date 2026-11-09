import { useMemo } from "react";
import { LineChart } from "@mantine/charts";
import { energy, Features, mood, TrackResult } from "../lib/api";
import Panel, { Waiting } from "./Panel";

type Props = {
    trackIds: string[];
    tracks: TrackResult[];
};

// rolling mean over this many analysed neighbours, so the arc reads as a shape, not noise
const WINDOW = 5;

// energy and mood in playlist order: how the mix builds and falls
export default function EnergyArc({ trackIds, tracks }: Props) {
    const data = useMemo(() => {
        const byId = new Map(tracks.map((t) => [t.track.id, t]));
        const order = trackIds.length ? trackIds : tracks.map((t) => t.track.id);
        const points = order.map((id, i) => {
            const t = byId.get(id);
            const f = t?.status === "done" ? (t.features as Features) : null;
            return { n: i + 1, e: f ? energy(f) : null, m: f ? mood(f) : null };
        });
        return points.map((p, i) => {
            if (p.e === null) {
                return { n: p.n, energy: null, mood: null };
            }
            const near = points
                .slice(Math.max(0, i - (WINDOW >> 1)), i + (WINDOW >> 1) + 1)
                .filter((q) => q.e !== null);
            const avg = (k: "e" | "m") =>
                Math.round((near.reduce((a, q) => a + (q[k] as number), 0) / near.length) * 100);
            return { n: p.n, energy: avg("e"), mood: avg("m") };
        });
    }, [trackIds, tracks]);
    const analysed = data.filter((d) => d.energy !== null).length;

    return (
        <Panel
            title="Energy arc"
            caption="Energy and mood in playlist order, smoothed over five songs."
            className="lg:col-span-7"
        >
            {analysed < 3 ? (
                <Waiting className="h-56">The arc draws itself as songs are analysed.</Waiting>
            ) : (
                <LineChart
                    h={224}
                    data={data}
                    dataKey="n"
                    series={[
                        { name: "energy", color: "var(--mix-mark)" },
                        { name: "mood", color: "var(--mix-accent)", strokeDasharray: "4 3" },
                    ]}
                    curveType="monotone"
                    connectNulls
                    withDots={false}
                    withLegend
                    legendProps={{ verticalAlign: "top", height: 32 }}
                    classNames={{ legendItemName: "text-xs text-muted", legendItemColor: "size-2" }}
                    strokeWidth={2}
                    gridAxis="y"
                    gridColor="var(--mix-line)"
                    textColor="var(--mix-muted)"
                    tickLine="none"
                    yAxisProps={{ domain: [0, 100], ticks: [0, 50, 100], width: 32 }}
                    xAxisProps={{ interval: "preserveStartEnd", minTickGap: 24 }}
                    xAxisLabel="song"
                    tooltipAnimationDuration={150}
                />
            )}
        </Panel>
    );
}
