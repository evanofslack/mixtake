import { useMemo, useState } from "react";
import { Button, Tooltip } from "@mantine/core";
import { FiAlertCircle, FiCheck, FiChevronDown, FiSearch, FiVolumeX } from "react-icons/fi";
import { energy, Features, mood, TrackResult, TrackStatus } from "../lib/api";
import { artistNames, keyName, plural } from "../lib/format";
import Panel from "./Panel";

type Props = {
    trackIds: string[];
    tracks: TrackResult[];
};

// rows shown before "show all"
const COLLAPSED = 12;

// every song with its status and a few tiny feature bars
export default function TrackList({ trackIds, tracks }: Props) {
    const [open, setOpen] = useState(false);
    const rows = useMemo(() => {
        const byId = new Map(tracks.map((t) => [t.track.id, t]));
        const order = trackIds.length ? trackIds : tracks.map((t) => t.track.id);
        return order.map((id) => ({ id, result: byId.get(id) }));
    }, [trackIds, tracks]);
    const shown = open ? rows : rows.slice(0, COLLAPSED);

    return (
        <Panel title="Songs" caption={plural(rows.length, "song")} className="lg:col-span-12">
            <div
                className="hidden grid-cols-[2rem_1fr_9rem_5.5rem_1.25rem] gap-3 border-b border-line pb-1.5 text-xs text-muted sm:grid"
                aria-hidden
            >
                <span className="text-right">#</span>
                <span>title</span>
                <span>mood · energy · dance</span>
                <span>tempo · key</span>
                <span />
            </div>
            <ol aria-label="songs">
                {shown.map((row, i) => (
                    <Row key={row.id} n={i + 1} result={row.result} />
                ))}
            </ol>
            {rows.length > COLLAPSED && (
                <Button
                    variant="subtle"
                    size="compact-sm"
                    mt="sm"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    rightSection={
                        <FiChevronDown
                            className={`transition-transform ${open ? "rotate-180" : ""}`}
                        />
                    }
                >
                    {open ? "Show fewer" : `Show all ${rows.length}`}
                </Button>
            )}
        </Panel>
    );
}

function Row({ n, result }: { n: number; result?: TrackResult }) {
    const f = result?.status === "done" ? result.features : undefined;
    const status: TrackStatus = result?.status ?? "pending";
    return (
        <li className="grid grid-cols-[1.5rem_1fr_1.25rem] items-center gap-3 border-b border-line py-2 last:border-0 sm:grid-cols-[2rem_1fr_9rem_5.5rem_1.25rem]">
            <span className="text-right text-xs text-muted tabular-nums">{n}</span>
            <div className="min-w-0">
                <p className={`truncate text-sm ${status === "done" ? "" : "text-muted"}`}>
                    {result?.track.title ?? "…"}
                </p>
                <p className="truncate text-xs text-muted">
                    {result ? artistNames(result.track) : "looking up"}
                </p>
            </div>
            <div className="hidden items-center gap-1.5 sm:flex" aria-hidden={!f}>
                {f ? (
                    <>
                        <Mini label="mood" value={mood(f)} />
                        <Mini label="energy" value={energy(f)} />
                        <Mini label="danceable" value={f.danceable} />
                    </>
                ) : null}
            </div>
            <span className="hidden truncate text-xs text-muted tabular-nums sm:block">
                {f ? `${Math.round(f.tempo)} · ${shortKey(f)}` : ""}
            </span>
            <StatusIcon status={status} />
        </li>
    );
}

// a 2.5rem bar; the value is in its accessible name
function Mini({ label, value }: { label: string; value: number }) {
    const pct = Math.round(value * 100);
    return (
        <span
            role="img"
            aria-label={`${label} ${pct}`}
            title={`${label} ${pct}`}
            className="block h-1.5 w-10 overflow-hidden rounded-full bg-line"
        >
            <span className="block h-full rounded-full bg-mark" style={{ width: `${pct}%` }} />
        </span>
    );
}

function shortKey(f: Features): string {
    return keyName(f.key, f.mode === "minor" ? "min" : "maj");
}

const STATUS: Record<TrackStatus, string> = {
    pending: "waiting",
    done: "analysed",
    failed: "analysis failed",
    no_audio: "no preview available",
    not_found: "not found on Spotify",
};

function StatusIcon({ status }: { status: TrackStatus }) {
    const label = STATUS[status];
    let icon;
    switch (status) {
        case "done":
            icon = <FiCheck className="text-muted" />;
            break;
        case "no_audio":
            icon = <FiVolumeX className="text-muted" />;
            break;
        case "failed":
            icon = <FiAlertCircle className="text-muted" />;
            break;
        case "not_found":
            icon = <FiSearch className="text-muted" />;
            break;
        default:
            icon = <span className="breathe block size-1.5 rounded-full bg-mark-soft" />;
    }
    return (
        <Tooltip label={label} openDelay={200} position="left">
            <span
                role="img"
                aria-label={label}
                tabIndex={status === "done" || status === "pending" ? undefined : 0}
                className="flex size-5 items-center justify-center"
            >
                {icon}
            </span>
        </Tooltip>
    );
}
