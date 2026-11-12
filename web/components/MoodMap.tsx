import { PointerEvent, useMemo, useState } from "react";
import { SegmentedControl, Tooltip, useComputedColorScheme } from "@mantine/core";
import { FiMaximize2, FiMinimize2 } from "react-icons/fi";
import { energy, Features, mood, TrackResult } from "../lib/api";
import { Domain, fitDomain, FULL, isFull } from "../lib/domain";
import { artistNames } from "../lib/format";
import { useHighlight } from "../lib/highlight";
import { moodColour } from "../lib/moodColour";
import { useWidth } from "../lib/useWidth";
import Panel from "./Panel";

type Props = {
    tracks: TrackResult[];
};

type Dot = { id: string; title: string; artist: string; x: number; y: number };
type View = "fit" | "full";
type Corner = "tl" | "tr" | "bl" | "br";

// room for the axis labels around the plot
const PAD = { top: 12, right: 12, bottom: 30, left: 30 };
// how near the pointer has to be to a dot to show it
const HIT = 22;
// the inset's side, and its gap from the plot's edge
const INSET = 64;
const INSET_GAP = 8;

// each quadrant's name, and the plot corner that is its outer corner
const QUADRANTS: { name: string; corner: Corner; x: Domain; y: Domain }[] = [
    { name: "tense", corner: "tl", x: [0, 0.5], y: [0.5, 1] },
    { name: "euphoric", corner: "tr", x: [0.5, 1], y: [0.5, 1] },
    { name: "melancholy", corner: "bl", x: [0, 0.5], y: [0, 0.5] },
    { name: "serene", corner: "br", x: [0.5, 1], y: [0, 0.5] },
];

// every analysed song on mood (x) × energy (y); dots develop in as results arrive. By default
// the axes fit the songs, with an inset showing where that window sits in the whole map
export default function MoodMap({ tracks }: Props) {
    const [ref, width] = useWidth<HTMLDivElement>();
    const height = Math.round(Math.min(440, Math.max(260, width * 0.72)));
    const hl = useHighlight();
    const dark = useComputedColorScheme("light", { getInitialValueInEffect: true }) === "dark";
    const [view, setView] = useState<View>("fit");

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

    const fitted = useMemo(
        () => ({ x: fitDomain(dots.map((d) => d.x)), y: fitDomain(dots.map((d) => d.y)) }),
        [dots],
    );
    const zoomable = dots.length > 1 && !(isFull(fitted.x) && isFull(fitted.y));
    const dom = view === "fit" && zoomable ? fitted : { x: FULL, y: FULL };
    const zoomed = dom === fitted;

    const plotW = Math.max(0, width - PAD.left - PAD.right);
    const plotH = height - PAD.top - PAD.bottom;
    const spanX = dom.x[1] - dom.x[0];
    const spanY = dom.y[1] - dom.y[0];
    const px = (v: number) => PAD.left + ((v - dom.x[0]) / spanX) * plotW;
    const py = (v: number) => PAD.top + (1 - (v - dom.y[0]) / spanY) * plotH;
    const r = width < 480 ? 4 : 5;

    // the inset goes in the corner with the fewest songs
    const insetCorner = useMemo<Corner>(() => {
        const midX = (dom.x[0] + dom.x[1]) / 2;
        const midY = (dom.y[0] + dom.y[1]) / 2;
        const count: Record<Corner, number> = { tl: 0, tr: 0, bl: 0, br: 0 };
        for (const d of dots) {
            count[`${d.y >= midY ? "t" : "b"}${d.x >= midX ? "r" : "l"}` as Corner]++;
        }
        return (["tr", "tl", "br", "bl"] as Corner[]).reduce((a, b) =>
            count[b] < count[a] ? b : a,
        );
    }, [dots, dom.x, dom.y]);

    // the song under the pointer, if any
    const nearest = (e: PointerEvent<SVGSVGElement>): Dot | null => {
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
        return best;
    };
    const onMove = (e: PointerEvent<SVGSVGElement>) => {
        const d = nearest(e);
        const current = hl.focus?.kind === "track" ? hl.focus.id : null;
        if ((d?.id ?? null) !== current || (!d && hl.focus)) {
            hl.hover(d ? { kind: "track", id: d.id } : null);
        }
    };
    const onClick = (e: PointerEvent<SVGSVGElement>) => {
        const d = nearest(e);
        hl.toggle(d ? { kind: "track", id: d.id } : null);
    };

    // the focused song gets a label; highlighted songs are drawn last, so they sit on top
    const hover =
        hl.focus?.kind === "track"
            ? (dots.find((d) => d.id === (hl.focus as { id: string }).id) ?? null)
            : null;
    const lit = hl.tracks;
    const ordered = lit
        ? [...dots.filter((d) => !lit.has(d.id)), ...dots.filter((d) => lit.has(d.id))]
        : dots;

    const label = mean
        ? `Mood map of ${dots.length} songs. Average mood ${pct(mean.x)} of 100, energy ${pct(mean.y)} of 100.`
        : "Mood map, waiting for the first songs.";

    const actions = zoomable ? (
        <SegmentedControl
            size="xs"
            value={view}
            onChange={(v) => setView(v as View)}
            aria-label="mood map scale"
            data={[
                {
                    value: "fit",
                    label: (
                        <Tooltip label="fit the songs" withArrow>
                            <span className="flex items-center px-0.5">
                                <FiMinimize2 aria-hidden />
                                <span className="sr-only">fit the songs</span>
                            </span>
                        </Tooltip>
                    ),
                },
                {
                    value: "full",
                    label: (
                        <Tooltip label="whole map" withArrow>
                            <span className="flex items-center px-0.5">
                                <FiMaximize2 aria-hidden />
                                <span className="sr-only">whole map</span>
                            </span>
                        </Tooltip>
                    ),
                },
            ]}
        />
    ) : undefined;

    return (
        <Panel
            title="Mood map"
            info="Click a song to pin it everywhere"
            actions={actions}
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
                        onPointerMove={onMove}
                        onPointerUp={onClick}
                        onPointerLeave={() => hl.hover(null)}
                    >
                        <Frame
                            px={px}
                            py={py}
                            dom={dom}
                            zoomed={zoomed}
                            width={width}
                            height={height}
                            plotW={plotW}
                            plotH={plotH}
                            skip={zoomed ? insetCorner : null}
                        />
                        {mean && dots.length > 2 && (
                            <ellipse
                                cx={px(mean.x)}
                                cy={py(mean.y)}
                                rx={Math.max(8, (mean.sx / spanX) * plotW)}
                                ry={Math.max(8, (mean.sy / spanY) * plotH)}
                                fill="var(--mix-accent)"
                                fillOpacity={0.1}
                                stroke="var(--mix-accent)"
                                strokeOpacity={0.35}
                                strokeDasharray="2 3"
                                className="transition-all duration-500 motion-reduce:transition-none"
                            />
                        )}
                        <g aria-hidden>
                            {ordered.map((d) => {
                                const on = lit?.has(d.id) ?? false;
                                const big = on && (hover?.id === d.id || lit!.size <= 12);
                                return (
                                    <circle
                                        key={d.id}
                                        cx={px(d.x)}
                                        cy={py(d.y)}
                                        r={big ? r + 2 : on ? r + 1 : r}
                                        fill={moodColour(d.x, d.y, dark)}
                                        fillOpacity={lit && !on ? 0.15 : 0.9}
                                        stroke={on ? "var(--mix-ink)" : "var(--mix-surface)"}
                                        strokeOpacity={lit && !on ? 0.3 : 1}
                                        strokeWidth={on ? 2 : 1.5}
                                        className="develop transition-[cx,cy,fill-opacity] duration-500 ease-out motion-reduce:transition-none"
                                    />
                                );
                            })}
                        </g>
                        {mean && (
                            <g
                                aria-hidden
                                style={{ transform: `translate(${px(mean.x)}px, ${py(mean.y)}px)` }}
                                className="transition-transform duration-500 ease-out motion-reduce:transition-none"
                            >
                                <circle r={9} fill="var(--mix-accent)" fillOpacity={0.2} />
                                <circle
                                    r={5.5}
                                    fill="var(--mix-accent)"
                                    stroke="var(--mix-surface)"
                                    strokeWidth={2}
                                />
                            </g>
                        )}
                        {zoomed && (
                            <Inset
                                corner={insetCorner}
                                dom={dom}
                                mean={mean}
                                left={PAD.left + INSET_GAP}
                                right={PAD.left + plotW - INSET - INSET_GAP}
                                top={PAD.top + INSET_GAP}
                                bottom={PAD.top + plotH - INSET - INSET_GAP}
                            />
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
    dom: { x: Domain; y: Domain };
    zoomed: boolean;
    width: number;
    height: number;
    plotW: number;
    plotH: number;
    // the corner the inset covers, which gets no quadrant name
    skip: Corner | null;
};

// the plot's border, centre lines, quadrant names and axis titles
function Frame({ px, py, dom, zoomed, width, height, plotW, plotH, skip }: FrameProps) {
    const inset = 8;
    const corner = "fill-muted text-[11px] tracking-wide uppercase";
    const inside = (d: Domain) => d[0] < 0.5 && d[1] > 0.5;
    const area = (d: Domain, q: Domain) =>
        Math.max(0, Math.min(d[1], q[1]) - Math.max(d[0], q[0])) / (d[1] - d[0]);
    const pos: Record<Corner, { x: number; y: number; anchor: "start" | "end" }> = {
        tl: { x: px(dom.x[0]) + inset, y: py(dom.y[1]) + inset + 9, anchor: "start" },
        tr: { x: px(dom.x[1]) - inset, y: py(dom.y[1]) + inset + 9, anchor: "end" },
        bl: { x: px(dom.x[0]) + inset, y: py(dom.y[0]) - inset, anchor: "start" },
        br: { x: px(dom.x[1]) - inset, y: py(dom.y[0]) - inset, anchor: "end" },
    };
    const end = (v: number) => String(Math.round(v * 100));
    // a light grid every 10, so the dots sit somewhere; the centre lines are drawn over it
    const grid = (d: Domain) => {
        const out = [];
        for (let t = Math.ceil(d[0] * 10 + 1e-6); t / 10 < d[1] - 1e-6; t++) {
            if (t !== 5) {
                out.push(t / 10);
            }
        }
        return out;
    };
    return (
        <g aria-hidden>
            <g stroke="var(--mix-line)" strokeOpacity={0.7}>
                {grid(dom.x).map((v) => (
                    <line key={`x${v}`} x1={px(v)} x2={px(v)} y1={py(dom.y[0])} y2={py(dom.y[1])} />
                ))}
                {grid(dom.y).map((v) => (
                    <line key={`y${v}`} x1={px(dom.x[0])} x2={px(dom.x[1])} y1={py(v)} y2={py(v)} />
                ))}
            </g>
            <rect
                x={px(dom.x[0])}
                y={py(dom.y[1])}
                width={plotW}
                height={plotH}
                fill="none"
                stroke="var(--mix-line)"
            />
            {inside(dom.x) && (
                <line
                    x1={px(0.5)}
                    x2={px(0.5)}
                    y1={py(dom.y[0])}
                    y2={py(dom.y[1])}
                    stroke="var(--mix-line-strong)"
                    strokeDasharray="3 4"
                />
            )}
            {inside(dom.y) && (
                <line
                    x1={px(dom.x[0])}
                    x2={px(dom.x[1])}
                    y1={py(0.5)}
                    y2={py(0.5)}
                    stroke="var(--mix-line-strong)"
                    strokeDasharray="3 4"
                />
            )}
            {QUADRANTS.filter(
                (q) => q.corner !== skip && area(dom.x, q.x) * area(dom.y, q.y) >= 0.15,
            ).map((q) => (
                <text
                    key={q.name}
                    x={pos[q.corner].x}
                    y={pos[q.corner].y}
                    textAnchor={pos[q.corner].anchor}
                    className={corner}
                >
                    {q.name}
                </text>
            ))}

            <g className="fill-muted text-[11px] tabular-nums">
                <text x={px(dom.x[0])} y={height - 8}>
                    {zoomed ? end(dom.x[0]) : "sad"}
                </text>
                <text
                    x={px((dom.x[0] + dom.x[1]) / 2)}
                    y={height - 8}
                    textAnchor="middle"
                    className="fill-ink"
                >
                    mood
                </text>
                <text x={width - PAD.right} y={height - 8} textAnchor="end">
                    {zoomed ? end(dom.x[1]) : "happy"}
                </text>
                <g transform={`translate(${PAD.left - 12} 0) rotate(-90)`}>
                    <text x={-py(dom.y[0])} y={0}>
                        {zoomed ? end(dom.y[0]) : "calm"}
                    </text>
                    <text
                        x={-py((dom.y[0] + dom.y[1]) / 2)}
                        y={0}
                        textAnchor="middle"
                        className="fill-ink"
                    >
                        energy
                    </text>
                    <text x={-py(dom.y[1])} y={0} textAnchor="end">
                        {zoomed ? end(dom.y[1]) : "energetic"}
                    </text>
                </g>
            </g>
        </g>
    );
}

type InsetProps = {
    corner: Corner;
    dom: { x: Domain; y: Domain };
    mean: { x: number; y: number } | null;
    left: number;
    right: number;
    top: number;
    bottom: number;
};

// the whole map in miniature, with the zoomed window outlined
function Inset({ corner, dom, mean, left, right, top, bottom }: InsetProps) {
    const x0 = corner[1] === "l" ? left : right;
    const y0 = corner[0] === "t" ? top : bottom;
    const ix = (v: number) => x0 + v * INSET;
    const iy = (v: number) => y0 + (1 - v) * INSET;
    return (
        <g aria-hidden className="pointer-events-none">
            <rect
                x={x0}
                y={y0}
                width={INSET}
                height={INSET}
                rx={2}
                fill="var(--mix-surface)"
                fillOpacity={0.9}
                stroke="var(--mix-line-strong)"
            />
            <line x1={ix(0.5)} x2={ix(0.5)} y1={iy(0)} y2={iy(1)} stroke="var(--mix-line)" />
            <line x1={ix(0)} x2={ix(1)} y1={iy(0.5)} y2={iy(0.5)} stroke="var(--mix-line)" />
            <rect
                x={ix(dom.x[0])}
                y={iy(dom.y[1])}
                width={(dom.x[1] - dom.x[0]) * INSET}
                height={(dom.y[1] - dom.y[0]) * INSET}
                fill="var(--mix-accent)"
                fillOpacity={0.15}
                stroke="var(--mix-accent)"
                strokeWidth={1}
                className="transition-all duration-500 motion-reduce:transition-none"
            />
            {mean && <circle cx={ix(mean.x)} cy={iy(mean.y)} r={2.5} fill="var(--mix-accent)" />}
        </g>
    );
}

function pct(v: number): number {
    return Math.round(v * 100);
}
