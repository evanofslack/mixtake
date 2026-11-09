import { FormEvent, useState } from "react";
import { ActionIcon, Button, TextInput } from "@mantine/core";
import { FiArrowLeft, FiSearch } from "react-icons/fi";
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
    onBack: () => void;
};

const SKELETONS = 8;

// how the photos were found, a re-search box and the thumbnails
export default function PhotoStrip(props: Props) {
    const { set, loading, selected, like, onSelect } = props;
    return (
        <div className="min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <Why set={set} like={like} loading={loading} onBack={props.onBack} />
                <VibeForm vibe={props.vibe} onVibe={props.onVibe} disabled={loading} />
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

// "searched for 'rain on a window' · 'foggy forest'", with the colours the ranking aimed for
function Why({
    set,
    like,
    loading,
    onBack,
}: {
    set: PhotoSet | null;
    like: Photo | null;
    loading: boolean;
    onBack: () => void;
}) {
    if (like) {
        return (
            <div className="flex min-w-0 items-center gap-2 text-sm">
                <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<FiArrowLeft />}
                    onClick={onBack}
                >
                    All photos
                </Button>
                <p className="min-w-0 truncate text-muted">
                    like <span className="text-ink">‘{like.title || "this photo"}’</span>
                </p>
            </div>
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
        <div className="min-w-0 text-sm">
            {set.queries.length > 0 && (
                <p className="text-muted">
                    searched analogdb for{" "}
                    {set.queries.map((q, i) => (
                        <span key={q}>
                            {i > 0 && <span aria-hidden> · </span>}
                            <span className="text-ink">‘{q}’</span>
                        </span>
                    ))}
                </p>
            )}
            {set.palette.length > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-xs text-muted">aiming for</span>
                    <ul className="flex" aria-label="target colours">
                        {set.palette.map((hex) => (
                            <li
                                key={hex}
                                title={hex}
                                className="-mr-1 size-4 rounded-full border-2 border-surface"
                                style={{ background: hex }}
                            >
                                <span className="sr-only">{hex}</span>
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
        <form onSubmit={submit} className="w-full sm:w-72" role="search">
            <TextInput
                size="xs"
                aria-label="search again with different words"
                placeholder="try other words, e.g. neon rain"
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
