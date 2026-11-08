import { Loader } from "@mantine/core";
import { FiCheck, FiAlertCircle, FiRefreshCw } from "react-icons/fi";
import type { Coverage, Source } from "../lib/api";
import { KIND_LABEL, plural } from "../lib/format";
import type { StreamStatus } from "../lib/useMixEvents";

type Props = {
    source: Source;
    coverage: Coverage;
    status: StreamStatus;
};

// the source's cover and name, and how far the analysis has got
export default function ProgressHeader({ source, coverage, status }: Props) {
    const { total, done, failed } = coverage;
    const name = source.name || (source.kind === "tracks" ? "Your tracks" : "Untitled");
    const pct = (n: number) => (total ? (n / total) * 100 : 0);

    return (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            <Cover src={source.cover} palette={source.palette} />
            <div className="min-w-0 grow">
                <p className="text-xs font-medium tracking-wider text-muted uppercase">
                    {KIND_LABEL[source.kind]}
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words sm:text-3xl">
                    {name}
                </h1>
                {source.subtitle && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{source.subtitle}</p>
                )}

                <div
                    className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-line"
                    role="progressbar"
                    aria-label="analysis progress"
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={done + failed}
                >
                    <div
                        className="h-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
                        style={{ width: `${pct(done)}%` }}
                    />
                    <div
                        className="h-full bg-mark-soft transition-[width] duration-500 ease-out motion-reduce:transition-none"
                        style={{ width: `${pct(failed)}%` }}
                    />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                    <p aria-live="polite">
                        analysed <span className="font-medium tabular-nums">{done}</span> of{" "}
                        <span className="tabular-nums">{total}</span>
                        {failed > 0 && (
                            <span className="text-muted">
                                {" "}
                                · {failed} couldn&apos;t be analysed
                            </span>
                        )}
                    </p>
                    <StatusLabel status={status} />
                </div>
            </div>
        </header>
    );
}

function Cover({ src, palette }: { src?: string; palette?: string[] }) {
    const fallback = palette?.length
        ? `linear-gradient(135deg, ${palette.join(", ")})`
        : "var(--mix-line)";
    return (
        <div
            className="size-24 shrink-0 overflow-hidden rounded-sm border border-line shadow-sm sm:size-32"
            style={{ background: fallback }}
        >
            {src && <img src={src} alt="" className="size-full object-cover" />}
        </div>
    );
}

function StatusLabel({ status }: { status: StreamStatus }) {
    const base = "flex items-center gap-1.5 text-xs text-muted";
    switch (status) {
        case "live":
            return (
                <p className={base}>
                    <span className="breathe size-1.5 rounded-full bg-accent" aria-hidden />
                    listening
                </p>
            );
        case "connecting":
            return (
                <p className={base}>
                    <FiRefreshCw className="animate-spin motion-reduce:animate-none" aria-hidden />
                    reconnecting
                </p>
            );
        case "done":
            return (
                <p className={base}>
                    <FiCheck aria-hidden />
                    done
                </p>
            );
        case "error":
            return (
                <p className={base}>
                    <FiAlertCircle aria-hidden />
                    stopped
                </p>
            );
        default:
            return <Loader size="xs" />;
    }
}
