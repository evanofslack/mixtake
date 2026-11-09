import { useEffect, useReducer } from "react";
import type { Coverage, MixEvent, Snapshot, TrackResult } from "./api";
import { mockMixExists, streamMock } from "./mock";

// connecting: waiting for the first snapshot (or reconnecting); live: streaming; done: the job
// finished; error: the job failed or the stream couldn't be kept up; not_found: unknown id
export type StreamStatus = "connecting" | "live" | "done" | "error" | "not_found";

export interface MixState {
    snapshot: Snapshot | null;
    coverage: Coverage | null;
    status: StreamStatus;
    error: string | null;
}

type Action =
    | { type: "reset" }
    | { type: "event"; event: MixEvent }
    | { type: "status"; status: StreamStatus; error?: string };

const initial: MixState = { snapshot: null, coverage: null, status: "connecting", error: null };

const EVENTS = ["snapshot", "track", "progress", "profile", "done"] as const;
// after this many failed reconnects in a row, stop and show an error
const MAX_RETRIES = 5;

export function reduce(state: MixState, action: Action): MixState {
    if (action.type === "reset") {
        return initial;
    }
    if (action.type === "status") {
        return { ...state, status: action.status, error: action.error ?? null };
    }
    const { name, data } = action.event;
    const snap = state.snapshot;
    switch (name) {
        case "snapshot":
            return {
                snapshot: data,
                coverage: data.profile?.coverage ?? coverageOf(data),
                status: data.status === "done" ? "done" : "live",
                error: null,
            };
        case "track":
            return snap
                ? { ...state, snapshot: { ...snap, tracks: upsert(snap.tracks, data) } }
                : state;
        case "progress":
            return { ...state, coverage: data };
        case "profile":
            return snap
                ? { ...state, snapshot: { ...snap, profile: data }, coverage: data.coverage }
                : state;
        case "done":
            return {
                ...state,
                snapshot: snap && { ...snap, status: "done" },
                coverage: data,
                status: "done",
            };
        case "error":
            return {
                ...state,
                snapshot: snap && { ...snap, status: "failed" },
                status: "error",
                error: data.message,
            };
    }
}

function upsert(tracks: TrackResult[], r: TrackResult): TrackResult[] {
    const i = tracks.findIndex((t) => t.track.id === r.track.id);
    if (i < 0) {
        return [...tracks, r];
    }
    const next = tracks.slice();
    next[i] = r;
    return next;
}

function coverageOf(s: Snapshot): Coverage {
    let done = 0;
    let failed = 0;
    for (const t of s.tracks) {
        if (t.status === "done") {
            done++;
        } else if (t.status !== "pending") {
            failed++;
        }
    }
    return { total: s.mix.track_ids.length || s.tracks.length, done, failed };
}

// the live state of a mix, from GET /api/mixes/{id}/events (or the mock stream)
export function useMixEvents(id: string | null, mock: boolean): MixState {
    const [state, dispatch] = useReducer(reduce, initial);

    useEffect(() => {
        if (!id) {
            return;
        }
        dispatch({ type: "reset" });
        if (mock) {
            if (!mockMixExists(id)) {
                dispatch({ type: "status", status: "not_found" });
                return;
            }
            return streamMock(id, (event) => dispatch({ type: "event", event }));
        }

        let es: EventSource | null = null;
        let stopped = false;
        let retries = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const stop = () => {
            stopped = true;
            es?.close();
            clearTimeout(timer);
        };

        // the browser gave up on the stream (a non-200 response): find out why, then retry or stop
        const recover = async () => {
            try {
                const res = await fetch(`/api/mixes/${encodeURIComponent(id)}`);
                if (stopped) {
                    return;
                }
                if (res.status === 404) {
                    dispatch({ type: "status", status: "not_found" });
                    stop();
                    return;
                }
                if (res.ok) {
                    // show what's there while we reconnect
                    dispatch({
                        type: "event",
                        event: { name: "snapshot", data: await res.json() },
                    });
                }
            } catch {
                // offline or the API is down; retry below
            }
            if (stopped) {
                return;
            }
            if (++retries > MAX_RETRIES) {
                dispatch({
                    type: "status",
                    status: "error",
                    error: "Lost the connection to mixtake. Reload the page to try again.",
                });
                stop();
                return;
            }
            dispatch({ type: "status", status: "connecting" });
            timer = setTimeout(connect, Math.min(16_000, 1000 * 2 ** (retries - 1)));
        };

        const connect = () => {
            if (stopped) {
                return;
            }
            const source = new EventSource(`/api/mixes/${encodeURIComponent(id)}/events`);
            es = source;
            for (const name of EVENTS) {
                source.addEventListener(name, (e) => {
                    const data = JSON.parse((e as MessageEvent<string>).data);
                    if (name === "snapshot") {
                        retries = 0;
                    }
                    dispatch({ type: "event", event: { name, data } as MixEvent });
                    if (name === "done") {
                        stop();
                    }
                });
            }
            // "error" is both the server's named event (with data) and the browser's connection
            // error (without), so tell them apart
            source.addEventListener("error", (e) => {
                if (e instanceof MessageEvent && typeof e.data === "string" && e.data) {
                    let message = "Analysis failed.";
                    try {
                        message = JSON.parse(e.data).message || message;
                    } catch {
                        // keep the default
                    }
                    dispatch({ type: "event", event: { name: "error", data: { message } } });
                    stop();
                    return;
                }
                if (stopped) {
                    return;
                }
                if (source.readyState === EventSource.CLOSED) {
                    recover();
                } else {
                    // the browser is reconnecting by itself; the next snapshot replaces the state
                    dispatch({ type: "status", status: "connecting" });
                }
            });
        };

        connect();
        return stop;
    }, [id, mock]);

    return state;
}
