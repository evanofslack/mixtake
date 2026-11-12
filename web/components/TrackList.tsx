import { useEffect, useMemo, useState } from "react";
import { Button, Tooltip, useComputedColorScheme } from "@mantine/core";
import { FiAlertCircle, FiCheck, FiChevronDown, FiSearch, FiVolumeX } from "react-icons/fi";
import { energy, Features, mood, TrackResult, TrackStatus } from "../lib/api";
import { artistNames, keyName, plural } from "../lib/format";
import { useHighlight } from "../lib/highlight";
import { moodColour } from "../lib/moodColour";
import { Sort, sortTracks } from "../lib/sort";
import Panel from "./Panel";
import SortControl from "./SortControl";

type Props = {
    trackIds: string[];
    tracks: TrackResult[];
    sort: Sort;
    onSort: (s: Sort) => void;
};

// rows shown before "show all"
const COLLAPSED = 12;

// every song with its status and a few tiny feature bars, in the page's sort order; the number
// is always the song's place in the playlist
export default function TrackList({ trackIds, tracks, sort, onSort }: Props) {
    const [open, setOpen] = useState(false);
    const rows = useMemo(() => {
        const byId = new Map(tracks.map((t) => [t.track.id, t]));
        const order = trackIds.length ? trackIds : tracks.map((t) => t.track.id);
        return sortTracks(order, byId, sort);
    }, [trackIds, tracks, sort]);
    const hl = useHighlight();
    const dark = useComputedColorScheme("light", { getInitialValueInEffect: true }) === "dark";
    const lit = hl.tracks;
    // a song pinned from a chart: show it, even when the list is collapsed
    const pinnedId = hl.pinned?.kind === "track" ? hl.pinned.id : null;
    useEffect(() => {
        if (!pinnedId) {
            return;
        }
        if (rows.findIndex((r) => r.id === pinnedId) >= COLLAPSED) {
            setOpen(true);
        }
        // after the list has expanded
        const t = setTimeout(
            () =>
                document
                    .getElementById(rowId(pinnedId))
                    ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
            50,
        );
        return () => clearTimeout(t);
    }, [pinnedId, rows]);
    const shown = open ? rows : rows.slice(0, COLLAPSED);

    return (
        <Panel
            title="Songs"
            caption={plural(rows.length, "song")}
            actions={<SortControl sort={sort} onChange={onSort} />}
            className="lg:col-span-12"
        >
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
                {shown.map((row) => (
                    <Row
                        key={row.id}
                        id={row.id}
                        n={row.position}
                        result={row.result}
                        dark={dark}
                        state={
                            !lit
                                ? "plain"
                                : lit.has(row.id)
                                  ? "lit"
                                  : // one song focused: tint it, don't fade the rest of the list
                                    hl.focus?.kind === "track"
                                    ? "plain"
                                    : "dim"
                        }
                        pinned={pinnedId === row.id}
                        onHover={(on) => hl.hover(on ? { kind: "track", id: row.id } : null)}
                        onSelect={() => hl.toggle({ kind: "track", id: row.id })}
                    />
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

function rowId(trackId: string): string {
    return `song-${trackId}`;
}

type RowProps = {
    id: string;
    n: number;
    result?: TrackResult;
    dark: boolean;
    state: "plain" | "lit" | "dim";
    pinned: boolean;
    onHover: (on: boolean) => void;
    onSelect: () => void;
};

function Row({ id, n, result, dark, state, pinned, onHover, onSelect }: RowProps) {
    const f = result?.status === "done" ? result.features : undefined;
    const status: TrackStatus = result?.status ?? "pending";
    return (
        <li
            id={rowId(id)}
            onMouseEnter={() => f && onHover(true)}
            onMouseLeave={() => f && onHover(false)}
            onClick={() => f && onSelect()}
            onKeyDown={(e) => {
                if (f && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelect();
                }
            }}
            tabIndex={f ? 0 : undefined}
            aria-current={pinned || undefined}
            className={`-mx-2 grid scroll-mt-24 grid-cols-[1.5rem_1fr_1.25rem] items-center gap-3 rounded-xs border-b border-line px-2 py-2 transition-[background-color,opacity] last:border-0 focus-visible:outline-2 focus-visible:outline-ink sm:grid-cols-[2rem_1fr_9rem_5.5rem_1.25rem] ${
                f ? "cursor-pointer hover:bg-bg" : ""
            } ${state === "lit" ? "bg-bg" : ""} ${state === "dim" ? "opacity-45" : ""} ${
                pinned ? "ring-1 ring-accent" : ""
            }`}
        >
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
                        <Mini
                            label="mood"
                            value={mood(f)}
                            colour={moodColour(mood(f), energy(f), dark)}
                        />
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
function Mini({ label, value, colour }: { label: string; value: number; colour?: string }) {
    const pct = Math.round(value * 100);
    return (
        <span
            role="img"
            aria-label={`${label} ${pct}`}
            title={`${label} ${pct}`}
            className="block h-1.5 w-10 overflow-hidden rounded-full bg-line"
        >
            <span
                className="block h-full rounded-full bg-mark"
                style={{ width: `${pct}%`, background: colour }}
            />
        </span>
    );
}

function shortKey(f: Features): string {
    return keyName(f.key, f.mode === "minor" ? "min" : "maj");
}

const STATUS: Record<TrackStatus, string> = {
    pending: "waiting",
    done: "analyzed",
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
