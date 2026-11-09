import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Alert, Button, Collapse, Textarea, TextInput, UnstyledButton } from "@mantine/core";
import { FiAlertCircle, FiArrowRight, FiCheck, FiChevronDown } from "react-icons/fi";
import { createMix } from "../lib/client";
import { RequestError } from "../lib/errors";
import { canSubmit, Detected, detectInput, MAX_TRACKS } from "../lib/input";
import { EXAMPLES } from "../lib/examples";
import { plural } from "../lib/format";

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
            <form
                onSubmit={onSubmit}
                className="rounded-md border border-line bg-surface p-4 sm:p-5"
            >
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
                        description="Optional. A few words to steer the cover photo."
                        placeholder="rainy night drive"
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
                        Analyse
                    </Button>
                </div>

                {error && <ErrorAlert error={error} onClose={() => setError(null)} />}
            </form>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">or try</span>
                {EXAMPLES.map((ex) => (
                    <Button
                        key={ex.url}
                        variant="default"
                        size="compact-sm"
                        radius="xl"
                        disabled={busy}
                        onClick={() => {
                            setInput(ex.url);
                            submit(ex.url);
                        }}
                    >
                        {ex.label}
                    </Button>
                ))}
            </div>

            <div className="mt-6 border-t border-line pt-4 text-sm">
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
                    How do I copy tracks from Spotify?
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

function Kbd({ children }: { children: string }) {
    return (
        <kbd className="rounded-xs border border-line-strong px-1 py-px font-mono text-xs text-ink">
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
            text = "A playlist link, an album link, or track links copied from the desktop app.";
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
    const neutral = detected.kind === "empty";
    return (
        <p
            id={id}
            aria-live="polite"
            className={`mt-1.5 flex items-start gap-1.5 text-xs ${ok ? "text-ink" : "text-muted"}`}
        >
            {!neutral &&
                (ok ? (
                    <FiCheck className="mt-px shrink-0 text-accent" aria-hidden />
                ) : (
                    <FiAlertCircle className="mt-px shrink-0" aria-hidden />
                ))}
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
