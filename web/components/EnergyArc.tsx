import { useMemo } from "react";
import { LineChart } from "@mantine/charts";
import { energy, Features, mood, TrackResult } from "../lib/api";
import { fitDomain } from "../lib/domain";
import { artistNames } from "../lib/format";
import { useHighlight } from "../lib/highlight";
import { Sort, SORT_LABEL, sortTracks } from "../lib/sort";
import Panel, { Waiting } from "./Panel";
import SortControl from "./SortControl";

type Props = {
    trackIds: string[];
    tracks: TrackResult[];
    sort: Sort;
    onSort: (s: Sort) => void;
};

// rolling mean over this many analysed neighbours, so the arc reads as a shape, not noise
const WINDOW = 5;
// highlighted songs get a marker each up to this many; beyond it the markers are clutter
const MARKERS = 16;

type Point = {
    n: number;
    id: string;
    // the plotted values: smoothed in playlist order, raw when sorted
    energy: number | null;
    mood: number | null;
    // the song's own values, for the tooltip
    e: number | null;
    m: number | null;
    title?: string;
    artist?: string;
    tempo?: number;
    position: number;
};

// energy and mood in playlist order (how the mix builds and falls), or sorted by a feature
export default function EnergyArc({ trackIds, tracks, sort, onSort }: Props) {
    const hl = useHighlight();
    const playlist = sort.by === "order";
    const data = useMemo<Point[]>(() => {
        const byId = new Map(tracks.map((t) => [t.track.id, t]));
        const ids = trackIds.length ? trackIds : tracks.map((t) => t.track.id);
        let rows = sortTracks(ids, byId, sort);
        // sorted, only analysed songs have a place on the line
        if (!playlist) {
            rows = rows.filter((r) => r.result?.status === "done");
        }
        const points = rows.map((r, i) => {
            const f = r.result?.status === "done" ? (r.result.features as Features) : null;
            return {
                n: i + 1,
                id: r.id,
                position: r.position,
                title: r.result?.track.title,
                artist: r.result ? artistNames(r.result.track) : undefined,
                tempo: f ? Math.round(f.tempo) : undefined,
                e: f ? Math.round(energy(f) * 100) : null,
                m: f ? Math.round(mood(f) * 100) : null,
            };
        });
        return points.map((p, i) => {
            if (p.e === null) {
                return { ...p, energy: null, mood: null };
            }
            if (!playlist) {
                return { ...p, energy: p.e, mood: p.m };
            }
            const near = points
                .slice(Math.max(0, i - (WINDOW >> 1)), i + (WINDOW >> 1) + 1)
                .filter((q) => q.e !== null);
            const avg = (k: "e" | "m") =>
                Math.round(near.reduce((a, q) => a + (q[k] as number), 0) / near.length);
            return { ...p, energy: avg("e"), mood: avg("m") };
        });
    }, [trackIds, tracks, sort, playlist]);
    const analysed = data.filter((d) => d.energy !== null).length;
    // the y-axis fits the lines, so a calm mix's arc still has a shape
    const yDomain = useMemo(() => {
        const vs = data.flatMap((d) =>
            d.energy === null ? [] : [(d.energy as number) / 100, (d.mood as number) / 100],
        );
        const [lo, hi] = fitDomain(vs, 0.04, 0.3, 0.1);
        return [Math.round(lo * 100), Math.round(hi * 100)];
    }, [data]);

    // a line at each highlighted song's place
    const markers = useMemo(() => {
        const lit = hl.tracks;
        if (!lit || lit.size > MARKERS) {
            return [];
        }
        return data.flatMap((d) =>
            lit.has(d.id)
                ? [
                      {
                          x: d.n,
                          color: "var(--mix-accent)",
                          strokeDasharray: "2 3",
                          ifOverflow: "hidden" as const,
                      },
                  ]
                : [],
        );
    }, [hl.tracks, data]);

    const at = (label: unknown) => {
        const n = Number(label);
        return Number.isInteger(n) ? data[n - 1] : undefined;
    };

    return (
        <Panel
            title="Energy arc"
            info={
                playlist
                    ? "Energy and mood in playlist order, smoothed over five songs. Sort to see the songs from calmest to most energetic, saddest to happiest, or slowest to fastest. Hover for the song; click to pin it across the page."
                    : `Each song's energy and mood, sorted by ${SORT_LABEL[sort.by]}. The song list below follows the same order. Hover for the song; click to pin it.`
            }
            actions={<SortControl sort={sort} onChange={onSort} />}
            className="lg:col-span-12"
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
                    curveType={playlist ? "monotone" : "linear"}
                    connectNulls
                    withDots={false}
                    withLegend
                    legendProps={{ verticalAlign: "top", height: 32 }}
                    classNames={{ legendItemName: "text-xs text-muted", legendItemColor: "size-2" }}
                    strokeWidth={playlist ? 2 : 1.5}
                    gridAxis="x"
                    gridColor="var(--mix-line)"
                    textColor="var(--mix-muted)"
                    tickLine="none"
                    yAxisProps={{
                        domain: yDomain,
                        ticks: [yDomain[0], Math.round((yDomain[0] + yDomain[1]) / 2), yDomain[1]],
                        width: 32,
                    }}
                    xAxisProps={{ interval: "preserveStartEnd", minTickGap: 24 }}
                    xAxisLabel={playlist ? "song" : `songs by ${SORT_LABEL[sort.by]}`}
                    tooltipAnimationDuration={150}
                    tooltipProps={{
                        content: ({ label }) => <ArcTip point={at(label)} sorted={!playlist} />,
                    }}
                    referenceLines={markers}
                    lineChartProps={{
                        onMouseMove: (state) => {
                            const id = at(state?.activeLabel)?.id;
                            if (id && !(hl.focus?.kind === "track" && hl.focus.id === id)) {
                                hl.hover({ kind: "track", id });
                            }
                        },
                        onMouseLeave: () => hl.hover(null),
                        onClick: (state) => {
                            const id = at(state?.activeLabel)?.id;
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

// the song under the pointer, with its own values (the lines are smoothed in playlist order)
function ArcTip({ point, sorted }: { point?: Point; sorted: boolean }) {
    if (!point) {
        return null;
    }
    return (
        <div className="max-w-60 rounded-sm border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md">
            <p className="text-muted tabular-nums">
                {sorted ? `#${point.n} · song ${point.position}` : `song ${point.position}`}
            </p>
            <p className="truncate font-medium">{point.title ?? "…"}</p>
            {point.artist && <p className="truncate text-muted">{point.artist}</p>}
            {point.e !== null ? (
                <p className="mt-1 flex gap-3 tabular-nums">
                    <span>
                        <span className="mr-1 inline-block size-2 rounded-full bg-mark" />
                        energy {point.e}
                    </span>
                    <span>
                        <span className="mr-1 inline-block size-2 rounded-full bg-accent" />
                        mood {point.m}
                    </span>
                    {point.tempo !== undefined && (
                        <span className="text-muted">{point.tempo} bpm</span>
                    )}
                </p>
            ) : (
                <p className="mt-1 text-muted">not analysed</p>
            )}
        </div>
    );
}
