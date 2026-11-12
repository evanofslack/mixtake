import { PointerEvent, useMemo, useState } from "react";
import { energy, Features, mood, TrackResult } from "../lib/api";
import { artistNames } from "../lib/format";
import { useWidth } from "../lib/useWidth";
import Panel from "./Panel";

type Props = {
    tracks: TrackResult[];
};

type Dot = { id: string; title: string; artist: string; x: number; y: number };

// room for the axis labels around the plot
const PAD = { top: 12, right: 12, bottom: 30, left: 30 };
// how near the pointer has to be to a dot to show it
const HIT = 22;

// every analysed song on mood (x) × energy (y); dots develop in as results arrive
export default function MoodMap({ tracks }: Props) {
    const [ref, width] = useWidth<HTMLDivElement>();
    const height = Math.round(Math.min(440, Math.max(260, width * 0.72)));
    const [hover, setHover] = useState<Dot | null>(null);

    const dots = useMemo<Dot[]>(
        () =>
            tracks
                .filter((t) => t.status === "done" && t.features)
                .map((t) => ({
                    id: t.track.id,
                    title: t.track.title,
                    artist: artistNames(t.track),
                    x: mood(t.features as Features),
                    y: energy(t.features as Features),
                })),
        [tracks],
    );
    const mean = useMemo(() => {
        if (dots.length === 0) {
            return null;
        }
        const mx = dots.reduce((a, d) => a + d.x, 0) / dots.length;
        const my = dots.reduce((a, d) => a + d.y, 0) / dots.length;
        const sx = Math.sqrt(dots.reduce((a, d) => a + (d.x - mx) ** 2, 0) / dots.length);
        const sy = Math.sqrt(dots.reduce((a, d) => a + (d.y - my) ** 2, 0) / dots.length);
        return { x: mx, y: my, sx, sy };
    }, [dots]);

    const plotW = Math.max(0, width - PAD.left - PAD.right);
    const plotH = height - PAD.top - PAD.bottom;
    const px = (v: number) => PAD.left + v * plotW;
    const py = (v: number) => PAD.top + (1 - v) * plotH;
    const r = width < 480 ? 4 : 5;

    const onPointer = (e: PointerEvent<SVGSVGElement>) => {
        const box = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - box.left;
        const y = e.clientY - box.top;
        let best: Dot | null = null;
        let bestD = HIT;
        for (const d of dots) {
            const dist = Math.hypot(px(d.x) - x, py(d.y) - y);
            if (dist < bestD) {
                best = d;
                bestD = dist;
            }
        }
        setHover(best);
    };

    const label = mean
        ? `Mood map of ${dots.length} songs. Average mood ${pct(mean.x)} of 100, energy ${pct(mean.y)} of 100.`
        : "Mood map, waiting for the first songs.";

    return (
        <Panel
            title="Mood map"
            info="Each dot is a song: sad to happy across, calm to energetic up. The orange dot is the average."
            className="lg:col-span-7"
        >
            <div ref={ref} className="relative w-full" style={{ height }}>
                {width > 0 && (
                    <svg
                        width={width}
                        height={height}
                        role="img"
                        aria-label={label}
                        className="block select-none"
                        onPointerMove={onPointer}
                        onPointerDown={onPointer}
                        onPointerLeave={() => setHover(null)}
                    >
                        <Frame
                            px={px}
                            py={py}
                            width={width}
                            height={height}
                            plotW={plotW}
                            plotH={plotH}
                        />
                        {mean && dots.length > 2 && (
                            <ellipse
                                cx={px(mean.x)}
                                cy={py(mean.y)}
                                rx={Math.max(8, mean.sx * plotW)}
                                ry={Math.max(8, mean.sy * plotH)}
                                fill="var(--mix-accent)"
                                fillOpacity={0.1}
                                stroke="var(--mix-accent)"
                                strokeOpacity={0.35}
                                strokeDasharray="2 3"
                                className="transition-all duration-700 motion-reduce:transition-none"
                            />
                        )}
                        <g aria-hidden>
                            {dots.map((d) => (
                                <circle
                                    key={d.id}
                                    cx={px(d.x)}
                                    cy={py(d.y)}
                                    r={hover?.id === d.id ? r + 2 : r}
                                    fill={hover?.id === d.id ? "var(--mix-ink)" : "var(--mix-mark)"}
                                    fillOpacity={hover?.id === d.id ? 1 : 0.72}
                                    stroke="var(--mix-surface)"
                                    strokeWidth={1.5}
                                    className="develop"
                                />
                            ))}
                        </g>
                        {mean && (
                            <g
                                aria-hidden
                                style={{ transform: `translate(${px(mean.x)}px, ${py(mean.y)}px)` }}
                                className="transition-transform duration-700 ease-out motion-reduce:transition-none"
                            >
                                <circle r={9} fill="var(--mix-accent)" fillOpacity={0.2} />
                                <circle
                                    r={5.5}
                                    fill="var(--mix-accent)"
                                    stroke="var(--mix-surface)"
                                    strokeWidth={2}
                                />
                                <text
                                    x={px(mean.x) > width - 70 ? -12 : 12}
                                    y={py(mean.y) < PAD.top + 16 ? 14 : -8}
                                    textAnchor={px(mean.x) > width - 70 ? "end" : "start"}
                                    className="fill-ink text-[11px] font-medium tabular-nums"
                                    paintOrder="stroke"
                                    stroke="var(--mix-surface)"
                                    strokeWidth={3}
                                >
                                    {pct(mean.x)} · {pct(mean.y)}
                                </text>
                            </g>
                        )}
                    </svg>
                )}
                {hover && (
                    <div
                        className="pointer-events-none absolute z-10 max-w-56 -translate-x-1/2 rounded-sm border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md"
                        style={{
                            left: Math.min(Math.max(px(hover.x), 90), width - 90),
                            top: py(hover.y) > 70 ? py(hover.y) - 56 : py(hover.y) + 14,
                        }}
                    >
                        <p className="truncate font-medium">{hover.title}</p>
                        <p className="truncate text-muted">{hover.artist}</p>
                    </div>
                )}
            </div>
        </Panel>
    );
}

type FrameProps = {
    px: (v: number) => number;
    py: (v: number) => number;
    width: number;
    height: number;
    plotW: number;
    plotH: number;
};

// the plot's border, centre lines, corner names and axis titles
function Frame({ px, py, width, height, plotW, plotH }: FrameProps) {
    const inset = 8;
    const corner = "fill-muted text-[11px] tracking-wide uppercase";
    return (
        <g aria-hidden>
            <rect
                x={px(0)}
                y={py(1)}
                width={plotW}
                height={plotH}
                fill="none"
                stroke="var(--mix-line)"
            />
            <line
                x1={px(0.5)}
                x2={px(0.5)}
                y1={py(0)}
                y2={py(1)}
                stroke="var(--mix-line-strong)"
                strokeDasharray="3 4"
            />
            <line
                x1={px(0)}
                x2={px(1)}
                y1={py(0.5)}
                y2={py(0.5)}
                stroke="var(--mix-line-strong)"
                strokeDasharray="3 4"
            />
            <text x={px(0) + inset} y={py(1) + inset + 9} className={corner}>
                tense
            </text>
            <text x={px(1) - inset} y={py(1) + inset + 9} textAnchor="end" className={corner}>
                euphoric
            </text>
            <text x={px(0) + inset} y={py(0) - inset} className={corner}>
                melancholy
            </text>
            <text x={px(1) - inset} y={py(0) - inset} textAnchor="end" className={corner}>
                serene
            </text>

            <g className="fill-muted text-[11px]">
                <text x={px(0)} y={height - 8}>
                    sad
                </text>
                <text x={px(0.5)} y={height - 8} textAnchor="middle" className="fill-ink">
                    mood
                </text>
                <text x={width - PAD.right} y={height - 8} textAnchor="end">
                    happy
                </text>
                <g transform={`translate(${PAD.left - 12} 0) rotate(-90)`}>
                    <text x={-py(0)} y={0}>
                        calm
                    </text>
                    <text x={-py(0.5)} y={0} textAnchor="middle" className="fill-ink">
                        energy
                    </text>
                    <text x={-py(1)} y={0} textAnchor="end">
                        energetic
                    </text>
                </g>
            </g>
        </g>
    );
}

function pct(v: number): number {
    return Math.round(v * 100);
}
