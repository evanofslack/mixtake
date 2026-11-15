// A finished mix played back quickly, as if it were being analysed: the front page's examples
// open this way, so the page shows off the live analysis without making anyone wait for it.
import type { Coverage, MixEvent, Snapshot, TrackResult } from "./api";
import { computeProfile } from "./profile";

// the whole playback takes about this long, however many songs
const TOTAL_MS = 2400;
const MAX_STEP_MS = 40;
const START_MS = 250;
// a few songs finish at once, slightly out of order, like the real queue
const WINDOW = 4;

// emits a snapshot with every song pending, then each song's result, progress and a profile
// every ten songs, then the mix's own profile and done. A mix that is still running (songs
// without a preview are retried when a mix is reopened) plays back what it has, then calls live
// to pick up the stream instead of finishing. Returns a cancel function.
export function replay(
    done: Snapshot,
    emit: (e: MixEvent) => void,
    live: () => void = () => {},
): () => void {
    const results: TrackResult[] = done.tracks.map((t) => ({ track: t.track, status: "pending" }));
    const coverage: Coverage = {
        total: done.mix.track_ids.length || results.length,
        done: 0,
        failed: 0,
    };
    const pending = done.tracks.flatMap((t, i) => (t.status === "pending" ? [] : [i]));
    const step = Math.min(MAX_STEP_MS, TOTAL_MS / Math.max(1, pending.length));
    let order = 1;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = (ms: number, fn: () => void) => {
        timer = setTimeout(() => !cancelled && fn(), ms);
    };

    const tick = () => {
        if (pending.length === 0) {
            if (done.status !== "done") {
                live();
                return;
            }
            const final = done.profile?.coverage ?? coverage;
            if (done.profile) {
                emit({ name: "profile", data: done.profile });
            }
            emit({ name: "done", data: final });
            return;
        }
        // a cheap deterministic pick from the front of the queue
        order = (order * 1103515245 + 12345) >>> 0;
        const [i] = pending.splice(order % Math.min(WINDOW, pending.length), 1);
        results[i] = done.tracks[i];
        if (results[i].status === "done") {
            coverage.done++;
        } else {
            coverage.failed++;
        }
        emit({ name: "track", data: results[i] });
        emit({ name: "progress", data: { ...coverage } });
        if (coverage.done > 0 && coverage.done % 10 === 0 && results[i].status === "done") {
            emit({ name: "profile", data: computeProfile(results, { ...coverage }) });
        }
        later(step, tick);
    };

    emit({
        name: "snapshot",
        data: {
            mix: done.mix,
            status: "running",
            tracks: results.map((r) => ({ ...r })),
        },
    });
    later(START_MS, tick);
    return () => {
        cancelled = true;
        clearTimeout(timer);
    };
}
