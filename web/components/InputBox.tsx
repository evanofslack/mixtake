import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Alert, Button, Collapse, Textarea, TextInput, UnstyledButton } from "@mantine/core";
import { FiAlertCircle, FiArrowRight, FiCheck, FiChevronDown } from "react-icons/fi";
import { createMix } from "../lib/client";
import { RequestError } from "../lib/errors";
import { canSubmit, Detected, detectInput, MAX_TRACKS } from "../lib/input";
import { EXAMPLES } from "../lib/examples";
import { plural } from "../lib/format";
import { moodColour } from "../lib/moodColour";
import { quadrantAt, scatter } from "../lib/showcase";
import { useDark } from "../lib/useDark";

type Props = {
    mock: boolean;
};

// the paste box on the front page: a link or a list of tracks, plus an optional vibe
export default function InputBox({ mock }: Props) {
    const router = useRouter();
    const [input, setInput] = useState("");
    const [vibe, setVibe] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<RequestError | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const detected = useMemo(() => detectInput(input), [input]);

    const submit = async (text: string) => {
        setBusy(true);
        setError(null);
        try {
            const id = await createMix(text, vibe.trim(), mock);
            const query = mock ? { id, mock: "1" } : { id };
            await router.push({ pathname: "/mix", query });
        } catch (e) {
            setError(e instanceof RequestError ? e : new RequestError("Something went wrong.", 0));
            setBusy(false);
        }
    };

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (canSubmit(detected) && !busy) {
            submit(input);
        }
    };

    return (
        <div>
            <form onSubmit={onSubmit} className="rounded-2xl bg-surface p-5 shadow-raised sm:p-6">
                <Textarea
                    label="Playlist, album or tracks"
                    placeholder={
                        "https://open.spotify.com/playlist/…\nor paste tracks, one link per line"
                    }
                    autosize
                    minRows={3}
                    maxRows={10}
                    value={input}
                    onChange={(e) => setInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        // ⌘↵ / ctrl↵ submits; a plain enter is a new line, for pasted lists
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            onSubmit(e);
                        }
                    }}
                    spellCheck={false}
                    autoComplete="off"
                    aria-describedby="input-hint"
                    classNames={{ input: "font-mono text-sm" }}
                />
                <Hint id="input-hint" detected={detected} />

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <TextInput
                        className="grow"
                        label="Vibe"
                        placeholder="optional, e.g. rainy night drive"
                        maxLength={80}
                        value={vibe}
                        onChange={(e) => setVibe(e.currentTarget.value)}
                    />
                    <Button
                        type="submit"
                        loading={busy}
                        disabled={!canSubmit(detected)}
                        rightSection={<FiArrowRight />}
                        className="shrink-0"
                    >
                        Analyze
                    </Button>
                </div>

                {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
            </form>

            <div className="mt-5">
                <p className="mb-2 text-xs text-muted">or try</p>
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
                    {EXAMPLES.map((ex, i) => (
                        <ExampleCard
                            key={ex.url}
                            label={ex.label}
                            mood={ex.mood}
                            energy={ex.energy}
                            seed={i + 1}
                            disabled={busy}
                            onClick={() => {
                                setInput(ex.url);
                                submit(ex.url);
                            }}
                        />
                    ))}
                </div>
            </div>

            <div className="mt-6 pt-4 text-sm groove-t">
                <UnstyledButton
                    onClick={() => setHelpOpen((o) => !o)}
                    aria-expanded={helpOpen}
                    aria-controls="copy-help"
                    className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
                >
                    <FiChevronDown
                        className={`transition-transform ${helpOpen ? "rotate-180" : ""}`}
                        aria-hidden
                    />
                    Private playlist or Liked Songs?
                </UnstyledButton>
                <Collapse expanded={helpOpen} id="copy-help">
                    <div className="max-w-prose space-y-2 pt-3 pl-5 leading-relaxed text-muted">
                        <p>
                            <span className="text-ink">A public playlist or an album:</span> use
                            Share → Copy link and paste it here.
                        </p>
                        <p>
                            <span className="text-ink">Anything else</span>, including private
                            playlists and your Liked Songs: in the Spotify desktop app, open the
                            playlist, click a track, press <Kbd>⌘A</Kbd> (<Kbd>Ctrl A</Kbd> on
                            Windows) then <Kbd>⌘C</Kbd>, and paste. You get one track link per line.
                        </p>
                        <p>Up to {MAX_TRACKS} pasted tracks, or the first 100 of a playlist.</p>
                    </div>
                </Collapse>
            </div>
        </div>
    );
}

// an example playlist as a small raised card: its name, its corner of the mood map and a few dots
// where its songs roughly land
function ExampleCard({
    label,
    mood,
    energy,
    seed,
    disabled,
    onClick,
}: {
    label: string;
    mood: number;
    energy: number;
    seed: number;
    disabled: boolean;
    onClick: () => void;
}) {
    const dark = useDark();
    const dots = useMemo(() => scatter(mood, energy, 6, 0.14, seed), [mood, energy, seed]);
    return (
        <UnstyledButton
            onClick={onClick}
            disabled={disabled}
            className="group flex items-center gap-3 rounded-xl p-2.5 text-left shadow-raised-sm transition-shadow active:shadow-pressed-sm disabled:opacity-60 disabled:shadow-pressed-sm"
        >
            <svg
                viewBox="0 0 40 40"
                className="size-10 shrink-0 rounded-md shadow-pressed-xs"
                aria-hidden
            >
                <line
                    x1="20"
                    x2="20"
                    y1="4"
                    y2="36"
                    stroke="var(--mix-line-strong)"
                    strokeDasharray="1.5 2"
                />
                <line
                    x1="4"
                    x2="36"
                    y1="20"
                    y2="20"
                    stroke="var(--mix-line-strong)"
                    strokeDasharray="1.5 2"
                />
                {dots.map((d, i) => (
                    <circle
                        key={i}
                        cx={4 + d.x * 32}
                        cy={36 - d.y * 32}
                        r={2.2}
                        fill={moodColour(d.x, d.y, dark)}
                    />
                ))}
            </svg>
            <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted">{quadrantAt(mood, energy)}</span>
            </span>
        </UnstyledButton>
    );
}

function Kbd({ children }: { children: string }) {
    return (
        <kbd className="rounded-xs px-1.5 py-px font-mono text-xs text-ink shadow-raised-sm">
            {children}
        </kbd>
    );
}

// a small line under the box saying what we think was pasted
function Hint({ id, detected }: { id: string; detected: Detected }) {
    let ok = true;
    let text: string;
    switch (detected.kind) {
        case "empty":
            text = "";
            ok = false;
            break;
        case "playlist":
            text = "A playlist link";
            break;
        case "album":
            text = "An album link";
            break;
        case "tracks":
            text = plural(detected.count, "track");
            if (detected.ignored > 0) {
                text += `; ${plural(detected.ignored, "line")} that ${detected.ignored === 1 ? "isn't a track" : "aren't tracks"} will be skipped`;
            }
            break;
        case "too_many":
            text = `${detected.count} tracks is more than the ${MAX_TRACKS} we can do at once.`;
            ok = false;
            break;
        case "mixed":
            text = "One playlist or album at a time, or only track links.";
            ok = false;
            break;
        case "unsupported":
            text = `${detected.what[0].toUpperCase()}${detected.what.slice(1)} links aren't supported yet. Try a playlist, album or tracks.`;
            ok = false;
            break;
        default:
            text = "That doesn't look like a Spotify link.";
            ok = false;
    }
    if (!text) {
        return <p id={id} className="sr-only" aria-live="polite" />;
    }
    return (
        <p
            id={id}
            aria-live="polite"
            className={`mt-1.5 flex items-start gap-1.5 text-xs ${ok ? "text-ink" : "text-muted"}`}
        >
            {ok ? (
                <FiCheck className="mt-px shrink-0 text-accent" aria-hidden />
            ) : (
                <FiAlertCircle className="mt-px shrink-0" aria-hidden />
            )}
            {text}
        </p>
    );
}

function ErrorAlert({ error, onClose }: { error: RequestError; onClose: () => void }) {
    const title =
        error.status === 429
            ? "Slow down a little"
            : error.status === 503
              ? "Busy right now"
              : error.isPrivate
                ? "That playlist is private"
                : error.status === 404
                  ? "Couldn't open that playlist"
                  : "Couldn't start that mix";
    return (
        <Alert
            mt="md"
            color="red"
            variant="light"
            title={title}
            icon={<FiAlertCircle />}
            withCloseButton
            closeButtonLabel="dismiss"
            onClose={onClose}
            role="alert"
        >
            <p>{error.message}</p>
            {error.isPrivate && (
                <p className="mt-1">
                    Make it public for a minute and try again, or paste its tracks instead: in the
                    desktop app, select all tracks and copy them.
                </p>
            )}
            {error.retryAfter && (
                <p className="mt-1">Try again in about {formatWait(error.retryAfter)}.</p>
            )}
        </Alert>
    );
}

function formatWait(s: number): string {
    return s < 90 ? plural(Math.round(s), "second") : plural(Math.round(s / 60), "minute");
}
