import { FormEvent, useState } from "react";
import { ActionIcon, Button, CopyButton, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import { FiArrowLeft, FiDroplet, FiSearch, FiShuffle } from "react-icons/fi";
import type { Photo, PhotoSet } from "../lib/api";
import { thumbFor } from "../lib/photos";

type Props = {
    set: PhotoSet | null;
    loading: boolean;
    selected: number | null;
    // set when the strip shows the photos like this one
    like: Photo | null;
    vibe: string;
    onSelect: (p: Photo) => void;
    onVibe: (vibe: string) => void;
    onShuffle: () => void;
    onBack: () => void;
};

const SKELETONS = 8;

// how the photos were found, a re-search box, shuffle and the thumbnails
export default function PhotoStrip(props: Props) {
    const { set, loading, selected, like, onSelect } = props;
    return (
        <div className="min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <Why
                    set={set}
                    like={like}
                    loading={loading}
                    onBack={props.onBack}
                    onVibe={props.onVibe}
                />
                <div className="flex shrink-0 items-center gap-1.5">
                    <VibeForm
                        key={props.vibe}
                        vibe={props.vibe}
                        onVibe={props.onVibe}
                        disabled={loading}
                    />
                    {!like && (
                        <Tooltip label="shuffle: new photos, same vibe" withArrow>
                            <ActionIcon
                                variant="default"
                                size={30}
                                aria-label="shuffle photos"
                                onClick={props.onShuffle}
                                disabled={loading}
                            >
                                <FiShuffle aria-hidden />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </div>
            </div>
            <ul
                aria-label={like ? "photos like the selected one" : "cover photos"}
                aria-busy={loading}
                className="strip -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pt-1 pb-2"
            >
                {!set || loading
                    ? Array.from({ length: SKELETONS }, (_, i) => (
                          <li
                              key={i}
                              className="size-18 shrink-0 animate-pulse rounded-sm bg-line motion-reduce:animate-none sm:size-20"
                              aria-hidden
                          />
                      ))
                    : set.photos.map((p) => (
                          <li key={p.id} className="shrink-0">
                              <Thumb
                                  photo={p}
                                  selected={p.id === selected}
                                  onClick={() => onSelect(p)}
                              />
                          </li>
                      ))}
            </ul>
        </div>
    );
}

function Thumb({
    photo,
    selected,
    onClick,
}: {
    photo: Photo;
    selected: boolean;
    onClick: () => void;
}) {
    const img = thumbFor(photo);
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            aria-label={`${photo.title || "untitled"} by u/${photo.author}`}
            title={photo.title}
            className={`block size-18 overflow-hidden rounded-sm bg-line transition sm:size-20 ${
                selected
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
                    : "opacity-80 hover:opacity-100"
            }`}
        >
            {img && (
                <img
                    src={img.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                />
            )}
        </button>
    );
}

// the searches as pills (tap one to search only that) and the colours the ranking aimed for
function Why({
    set,
    like,
    loading,
    onBack,
    onVibe,
}: {
    set: PhotoSet | null;
    like: Photo | null;
    loading: boolean;
    onBack: () => void;
    onVibe: (vibe: string) => void;
}) {
    if (like) {
        return (
            <Button
                variant="subtle"
                size="compact-sm"
                leftSection={<FiArrowLeft />}
                onClick={onBack}
                className="self-start"
            >
                All photos
            </Button>
        );
    }
    if (!set) {
        return (
            <p className="text-sm text-muted" role="status">
                {loading ? "Finding photos…" : ""}
            </p>
        );
    }
    return (
        <div className="flex min-w-0 flex-col gap-2">
            {set.queries.length > 0 && (
                <div className="flex min-w-0 items-start gap-2">
                    <Tooltip label="analogdb searches" withArrow>
                        <span className="mt-1 shrink-0 text-muted">
                            <FiSearch aria-hidden className="size-3.5" />
                        </span>
                    </Tooltip>
                    <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label="analogdb searches">
                        {set.queries.map((q) => (
                            <li key={q}>
                                <Tooltip label="search only this" withArrow openDelay={300}>
                                    <UnstyledButton
                                        onClick={() => onVibe(q)}
                                        className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink transition-colors hover:border-line-strong hover:bg-bg"
                                    >
                                        {q}
                                    </UnstyledButton>
                                </Tooltip>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {set.palette.length > 0 && (
                <div className="flex items-center gap-2">
                    <Tooltip label="colours the photos are ranked towards" withArrow>
                        <span className="shrink-0 text-muted">
                            <FiDroplet aria-hidden className="size-3.5" />
                        </span>
                    </Tooltip>
                    <ul className="flex" aria-label="target colours">
                        {set.palette.map((hex) => (
                            <li key={hex} className="-mr-1.5">
                                <CopyButton value={hex}>
                                    {({ copied, copy }) => (
                                        <Tooltip label={copied ? "copied" : hex} withArrow>
                                            <UnstyledButton
                                                onClick={copy}
                                                aria-label={`copy ${hex}`}
                                                className="relative block size-6 rounded-full border-2 border-surface transition-transform hover:z-10 hover:scale-110"
                                                style={{ background: hex }}
                                            />
                                        </Tooltip>
                                    )}
                                </CopyButton>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function VibeForm({
    vibe,
    onVibe,
    disabled,
}: {
    vibe: string;
    onVibe: (v: string) => void;
    disabled: boolean;
}) {
    const [value, setValue] = useState(vibe);
    const submit = (e: FormEvent) => {
        e.preventDefault();
        onVibe(value.trim());
    };
    return (
        <form onSubmit={submit} className="w-full sm:w-60" role="search">
            <TextInput
                size="xs"
                aria-label="search again with different words"
                placeholder="other words…"
                value={value}
                maxLength={200}
                onChange={(e) => setValue(e.currentTarget.value)}
                rightSectionPointerEvents="all"
                rightSection={
                    <ActionIcon
                        type="submit"
                        variant="subtle"
                        size="sm"
                        aria-label="search"
                        disabled={disabled || value.trim() === vibe}
                    >
                        <FiSearch />
                    </ActionIcon>
                }
            />
        </form>
    );
}
