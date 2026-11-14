import { FormEvent, useState } from "react";
import { ActionIcon, Button, CopyButton, TextInput, Tooltip, UnstyledButton } from "@mantine/core";
import {
    FiArrowLeft,
    FiChevronDown,
    FiDroplet,
    FiLayers,
    FiSearch,
    FiShuffle,
} from "react-icons/fi";
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
    // show the photos like this one
    onMore: (p: Photo) => void;
    onVibe: (vibe: string) => void;
    onShuffle: () => void;
    onBack: () => void;
};

const SKELETONS = 8;

// how the photos were found, a re-search box, shuffle and the thumbnails
export default function PhotoStrip(props: Props) {
    const { set, loading, selected, like, onSelect, onMore } = props;
    return (
        <div className="min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <Why
                    set={set}
                    like={like}
                    loading={loading}
                    vibe={props.vibe}
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
                        <Tooltip label="new photos with the same vibe" withArrow>
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
                          <li key={p.id} className="relative shrink-0">
                              <Thumb
                                  photo={p}
                                  selected={p.id === selected}
                                  onClick={() => onSelect(p)}
                              />
                              {p.id !== like?.id && (
                                  <Tooltip label="more like this" withArrow>
                                      <ActionIcon
                                          size={20}
                                          radius="xl"
                                          variant="default"
                                          aria-label={`more like ${p.title || "this photo"}`}
                                          onClick={() => onMore(p)}
                                          className="absolute top-1 right-1 border-0 bg-black/45 text-white opacity-90 backdrop-blur-sm hover:bg-black/65 hover:opacity-100"
                                      >
                                          <FiLayers size="0.7rem" aria-hidden />
                                      </ActionIcon>
                                  </Tooltip>
                              )}
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

// the searches as pills behind a one-line toggle (tap one to lead with it) and the colours the ranking aimed for
function Why({
    set,
    like,
    loading,
    vibe,
    onBack,
    onVibe,
}: {
    set: PhotoSet | null;
    like: Photo | null;
    loading: boolean;
    vibe: string;
    onBack: () => void;
    onVibe: (vibe: string) => void;
}) {
    // the searches are long sentences, so they sit behind a one-line summary until asked for
    const [open, setOpen] = useState(false);
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
                    <div className="flex min-w-0 flex-col items-start gap-2">
                        <UnstyledButton
                            onClick={() => setOpen((o) => !o)}
                            aria-expanded={open}
                            aria-controls="photo-searches"
                            className="flex max-w-full min-w-0 items-center gap-1.5 py-0.5 text-xs text-muted hover:text-ink"
                        >
                            <span className="shrink-0">
                                {set.queries.length}{" "}
                                {set.queries.length === 1 ? "search" : "searches"}
                            </span>
                            {!open && (
                                <span className="min-w-0 truncate font-mono text-ink">
                                    · {set.queries[0]}
                                </span>
                            )}
                            <FiChevronDown
                                aria-hidden
                                className={`size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                            />
                        </UnstyledButton>
                        {open && (
                            <ul
                                id="photo-searches"
                                className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-2"
                                aria-label="analogdb searches"
                            >
                                {set.queries.map((q) => {
                                    // the search leading the set sits pressed in, the rest are raised
                                    const on = vibe.trim().toLowerCase() === q.toLowerCase();
                                    return (
                                        <li key={q}>
                                            <Tooltip
                                                label={
                                                    on
                                                        ? "leading the search"
                                                        : "lead with this search"
                                                }
                                                withArrow
                                                openDelay={300}
                                            >
                                                <UnstyledButton
                                                    onClick={() => onVibe(q)}
                                                    aria-pressed={on}
                                                    className={`group relative rounded-full py-1 pr-3 pl-4.5 font-mono text-xs leading-snug text-ink transition-shadow duration-150 motion-reduce:transition-none ${
                                                        on
                                                            ? "shadow-pressed-xs"
                                                            : "shadow-raised-xs hover:shadow-raised-sm active:shadow-pressed-xs"
                                                    }`}
                                                >
                                                    <span
                                                        aria-hidden
                                                        className={`absolute top-1/2 left-2 h-3 w-0.5 -translate-y-1/2 rounded-full transition-colors ${
                                                            on
                                                                ? "bg-accent"
                                                                : "bg-accent/40 group-hover:bg-accent"
                                                        }`}
                                                    />
                                                    {q}
                                                </UnstyledButton>
                                            </Tooltip>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}
            {set.palette.length > 0 && (
                <div className="flex items-center gap-2">
                    <Tooltip label="colors the photos are ranked toward" withArrow>
                        <span className="shrink-0 text-muted">
                            <FiDroplet aria-hidden className="size-3.5" />
                        </span>
                    </Tooltip>
                    <ul
                        className="flex rounded-full py-1 pr-2.5 pl-1 shadow-pressed-xs"
                        aria-label="target colors"
                    >
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
