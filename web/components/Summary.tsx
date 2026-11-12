import { ReactNode, useMemo } from "react";
import { Tooltip } from "@mantine/core";
import { FiActivity, FiCompass, FiMusic, FiSmile, FiZap } from "react-icons/fi";
import { energy, Features, mood, type Profile, type TrackResult } from "../lib/api";
import { keyName, QUADRANT_LABEL } from "../lib/format";

type Props = {
    profile?: Profile;
    tracks: TrackResult[];
    final: boolean;
};

// the tempo gauge's ends; songs outside sit at the ends
const BPM: [number, number] = [50, 200];
// columns in each gauge's little histogram
const BINS = 24;

// the headline, the mix's character (feel and key) and its numbers as gauges; dimmed until the
// analysis is finished
export default function Summary({ profile, tracks, final }: Props) {
    const features = useMemo(
        () =>
            tracks.flatMap((t) =>
                t.status === "done" && t.features ? [t.features as Features] : [],
            ),
        [tracks],
    );
    if (!profile?.summary) {
        return <p className="font-serif text-2xl text-muted italic sm:text-3xl">Listening…</p>;
    }
    const a = profile.averages;
    let minor = 0;
    let total = 0;
    for (const k of profile.keys) {
        total += k.count;
        if (k.mode === "minor") {
            minor += k.count;
        }
    }
    const share = total ? minor / total : 0.5;
    const modes = share >= 0.6 ? "mostly minor" : share <= 0.4 ? "mostly major" : "major + minor";
    const top = profile.keys[0];
    return (
        <div className={`transition-opacity duration-700 ${final ? "" : "opacity-70"}`}>
            <p
                className="font-serif text-2xl leading-snug text-balance letterpress sm:text-3xl"
                aria-live="polite"
            >
                {profile.summary}
                {!final && (
                    <span className="ml-2 align-middle font-sans text-xs text-muted">so far</span>
                )}
            </p>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-6">
                <div className="flex shrink-0 flex-row gap-5 sm:flex-col sm:gap-3 sm:pr-6 sm:groove-r">
                    <Facet
                        icon={<FiCompass />}
                        label="feel"
                        tip="where the average lands on the map"
                    >
                        {QUADRANT_LABEL[profile.quadrant]}
                    </Facet>
                    <Facet
                        icon={<FiMusic />}
                        label="key"
                        tip={`${Math.round(share * 100)}% of songs in minor keys`}
                    >
                        {modes}
                        {top && (
                            <span className="ml-1.5 text-xs font-normal text-muted">
                                {keyName(top.key, top.mode)} most
                            </span>
                        )}
                    </Facet>
                </div>
                <div className="grid min-w-0 grow grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                    <Gauge
                        icon={<FiActivity />}
                        label="tempo"
                        value={a.tempo}
                        display={`${Math.round(a.tempo)}`}
                        unit="bpm"
                        range={BPM}
                        ends={[`${BPM[0]}`, `${BPM[1]}`]}
                        values={features.map((f) => f.tempo)}
                        tip="average tempo with every song below"
                    />
                    <Gauge
                        icon={<FiSmile />}
                        label="mood"
                        value={a.mood * 100}
                        display={`${Math.round(a.mood * 100)}`}
                        range={[0, 100]}
                        ends={["sad", "happy"]}
                        values={features.map((f) => mood(f) * 100)}
                        tip="average mood from sad to happy"
                    />
                    <Gauge
                        icon={<FiZap />}
                        label="energy"
                        value={a.energy * 100}
                        display={`${Math.round(a.energy * 100)}`}
                        range={[0, 100]}
                        ends={["calm", "intense"]}
                        values={features.map((f) => energy(f) * 100)}
                        tip="average energy from calm to intense"
                    />
                </div>
            </div>
        </div>
    );
}

// the round icon beside a facet or gauge; hovering, focusing or tapping it explains the number
function Icon({ tip, children }: { tip: string; children: ReactNode }) {
    return (
        <Tooltip
            label={tip}
            withArrow
            openDelay={150}
            events={{ hover: true, focus: true, touch: true }}
        >
            <span
                tabIndex={0}
                role="img"
                aria-label={tip}
                className="flex size-8 shrink-0 cursor-help items-center justify-center rounded-full bg-accent-soft/50 text-accent shadow-pressed-xs [&>svg]:size-3.5"
            >
                {children}
            </span>
        </Tooltip>
    );
}

// a named quality of the mix, like its feel or key
function Facet({
    icon,
    label,
    tip,
    children,
}: {
    icon: ReactNode;
    label: string;
    tip: string;
    children: ReactNode;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <Icon tip={tip}>{icon}</Icon>
            <div className="min-w-0 leading-tight">
                <p className="text-[10px] font-medium tracking-wider text-muted uppercase">
                    {label}
                </p>
                <p className="truncate text-sm font-medium">{children}</p>
            </div>
        </div>
    );
}

type GaugeProps = {
    icon: ReactNode;
    label: string;
    value: number;
    display: string;
    unit?: string;
    range: [number, number];
    ends: [string, string];
    // every song's value, drawn as a small histogram over the bar
    values: number[];
    tip: string;
};

// a number on its scale: a histogram of the songs, a bar filled to the average and the scale's
// ends
function Gauge({ icon, label, value, display, unit, range, ends, values, tip }: GaugeProps) {
    const [lo, hi] = range;
    const at = (v: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    const bins = new Array<number>(BINS).fill(0);
    for (const v of values) {
        bins[Math.min(BINS - 1, Math.floor(at(v) * BINS))]++;
    }
    const peak = Math.max(1, ...bins);
    const fill = at(value);
    const avgBin = Math.min(BINS - 1, Math.floor(fill * BINS));
    return (
        <div
            role="meter"
            aria-label={label}
            aria-valuemin={lo}
            aria-valuemax={hi}
            aria-valuenow={Math.round(value)}
            aria-valuetext={`${display}${unit ? ` ${unit}` : ""}`}
            className="min-w-0"
        >
            <div className="flex items-center gap-2.5">
                <Icon tip={tip}>{icon}</Icon>
                <div className="leading-tight">
                    <p className="text-[10px] font-medium tracking-wider text-muted uppercase">
                        {label}
                    </p>
                    <p className="text-sm font-medium tabular-nums">
                        {display}
                        {unit && (
                            <span className="ml-1 text-xs font-normal text-muted">{unit}</span>
                        )}
                    </p>
                </div>
            </div>
            <div className="mt-2 flex h-5 items-end gap-px" aria-hidden>
                {bins.map((n, i) => (
                    <span
                        key={i}
                        className={`block grow rounded-t-[1px] transition-[height] duration-500 ${
                            i === avgBin ? "bg-accent" : "bg-mark-soft"
                        }`}
                        style={{ height: n ? `${Math.max(12, (n / peak) * 100)}%` : 0 }}
                    />
                ))}
            </div>
            {/* a groove filled to the average, with a knob on it */}
            <div className="relative mt-0.5 h-1.5" aria-hidden>
                <div className="h-full overflow-hidden rounded-full shadow-pressed-xs">
                    <span
                        className="block h-full rounded-full bg-ink transition-[width] duration-500 motion-reduce:transition-none"
                        style={{ width: `${fill * 100}%` }}
                    />
                </div>
                <span
                    className="absolute top-1/2 flex size-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-bg shadow-raised-xs transition-[left] duration-500 motion-reduce:transition-none"
                    style={{ left: `${fill * 100}%` }}
                >
                    <span className="size-1.5 rounded-full bg-accent" />
                </span>
            </div>
            <div
                className="mt-1 flex justify-between text-[10px] text-muted tabular-nums"
                aria-hidden
            >
                <span>{ends[0]}</span>
                <span>{ends[1]}</span>
            </div>
        </div>
    );
}
