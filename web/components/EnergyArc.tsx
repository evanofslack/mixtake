import { useMemo } from "react";
import { LineChart } from "@mantine/charts";
import { energy, Features, mood, TrackResult } from "../lib/api";
import { fitDomain } from "../lib/domain";
import { useHighlight } from "../lib/highlight";
import Panel, { Waiting } from "./Panel";

type Props = {
    trackIds: string[];
    tracks: TrackResult[];
};

// rolling mean over this many analysed neighbours, so the arc reads as a shape, not noise
const WINDOW = 5;
// highlighted songs get a marker each up to this many; beyond it the markers are clutter
const MARKERS = 16;

// energy and mood in playlist order: how the mix builds and falls
export default function EnergyArc({ trackIds, tracks }: Props) {
    const hl = useHighlight();
    const order = useMemo(
        () => (trackIds.length ? trackIds : tracks.map((t) => t.track.id)),
        [trackIds, tracks],
    );
    const data = useMemo(() => {
        const byId = new Map(tracks.map((t) => [t.track.id, t]));
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
    }, [order, tracks]);
    const analysed = data.filter((d) => d.energy !== null).length;
    // the y-axis fits the smoothed lines, so a calm mix's arc still has a shape
    const yDomain = useMemo(() => {
        const vs = data.flatMap((d) =>
            d.energy === null ? [] : [(d.energy as number) / 100, (d.mood as number) / 100],
        );
        const [lo, hi] = fitDomain(vs, 0.04, 0.3, 0.1);
        return [Math.round(lo * 100), Math.round(hi * 100)];
    }, [data]);

    // a line at each highlighted song's place in the mix
    const markers = useMemo(() => {
        const lit = hl.tracks;
        if (!lit || lit.size > MARKERS) {
            return [];
        }
        return order.flatMap((id, i) =>
            lit.has(id)
                ? [
                      {
                          x: i + 1,
                          color: "var(--mix-accent)",
                          strokeDasharray: "2 3",
                          ifOverflow: "hidden" as const,
                      },
                  ]
                : [],
        );
    }, [hl.tracks, order]);

    return (
        <Panel
            title="Energy arc"
            info="Energy and mood in playlist order, smoothed over five songs. Hover to find a song on the other charts; click to pin it."
            className="lg:col-span-7"
        >
            {analysed < 3 ? (
                <Waiting className="h-56">Drawing…</Waiting>
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
                    yAxisProps={{
                        domain: yDomain,
                        ticks: [yDomain[0], Math.round((yDomain[0] + yDomain[1]) / 2), yDomain[1]],
                        width: 32,
                    }}
                    xAxisProps={{ interval: "preserveStartEnd", minTickGap: 24 }}
                    xAxisLabel="song"
                    tooltipAnimationDuration={150}
                    referenceLines={markers}
                    lineChartProps={{
                        onMouseMove: (state) => {
                            const n = Number(state?.activeLabel);
                            const id = Number.isInteger(n) ? order[n - 1] : undefined;
                            if (id && !(hl.focus?.kind === "track" && hl.focus.id === id)) {
                                hl.hover({ kind: "track", id });
                            }
                        },
                        onMouseLeave: () => hl.hover(null),
                        onClick: (state) => {
                            const n = Number(state?.activeLabel);
                            const id = Number.isInteger(n) ? order[n - 1] : undefined;
                            if (id) {
                                hl.toggle({ kind: "track", id });
                            }
                        },
                    }}
                />
            )}
        </Panel>
    );
}
