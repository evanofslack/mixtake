import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { ActionIcon, Alert, Button, Tooltip } from "@mantine/core";
import { FiAlertCircle, FiCamera, FiCornerUpLeft, FiCornerUpRight, FiLayers } from "react-icons/fi";
import { MAX_SEED, type Photo, type PhotoSet, type Source } from "../lib/api";
import { aspectOf, clampCrop, CoverState, TextItem } from "../lib/canvas";
import { fetchPhotos, fetchSimilar } from "../lib/client";
import { RequestError } from "../lib/errors";
import { editorImageFor, thumbFor, useImage } from "../lib/photos";
import { mergeQuery, readShared, slug, writeShared } from "../lib/share";
import { useHistory, useUndoKeys } from "../lib/useHistory";
import CoverCanvas from "./CoverCanvas";
import CoverControls from "./CoverControls";
import Info from "./Info";
import Panel, { Waiting } from "./Panel";
import PhotoStrip from "./PhotoStrip";
import ShareBar from "./ShareBar";

type Props = {
    mixId: string;
    mock: boolean;
    source: Source;
    analysed: number;
    finished: boolean;
};

// the server answers 409 below this many analysed songs
const MIN_TRACKS = 10;
const URL_DEBOUNCE_MS = 400;

type Fetch = { loading: boolean; waiting: string | null; error: string | null };

// pick a photo, crop it, add text, download. The edits live in the URL (see lib/share.ts): on
// load, the mix's set (re-searched with `vibe` if set) and the `like` set are fetched and `photo`
// is looked up in them; if it isn't in either, the first photo is shown and the text edits kept
export default function CoverStudio({ mixId, mock, source, analysed, finished }: Props) {
    const router = useRouter();
    const defaultTitle = source.name ?? "";
    const [initial] = useState(() => readShared(router.query, defaultTitle));

    const history = useHistory<CoverState>(initial.state);
    const state = history.value;
    // corrections the person didn't make (a new photo resets the crop) aren't undo steps
    const setState = history.replace;
    useUndoKeys(history.undo, history.redo);
    const [photoId, setPhotoId] = useState<number | null>(initial.photo);
    // false until someone picks a photo (or a link names one): the first photo may then change
    // when the final set arrives
    const [chosen, setChosen] = useState(initial.photo !== null);
    const [vibe, setVibe] = useState(initial.vibe);
    const [like, setLike] = useState<number | null>(initial.like);
    const [seed, setSeed] = useState(initial.seed);
    const [missing, setMissing] = useState(false);

    const [mainSet, setMainSet] = useState<PhotoSet | null>(null);
    const [likeSet, setLikeSet] = useState<PhotoSet | null>(null);
    const [main, setMain] = useState<Fetch>({ loading: false, waiting: null, error: null });
    const [likeFetch, setLikeFetch] = useState<Fetch>({
        loading: false,
        waiting: null,
        error: null,
    });
    const [retry, setRetry] = useState(0);
    // every photo seen, so the selection survives switching sets
    const [known, setKnown] = useState<Map<number, Photo>>(() => new Map());

    const remember = useCallback((set: PhotoSet) => {
        setKnown((m) => {
            const next = new Map(m);
            set.photos.forEach((p) => next.set(p.id, p));
            return next;
        });
    }, []);

    // the mix's set: once enough songs are analysed, again when the analysis finishes
    const ready = analysed >= MIN_TRACKS || finished;
    useEffect(() => {
        if (!ready) {
            return;
        }
        let cancelled = false;
        setMain((f) => ({ ...f, loading: true, error: null }));
        fetchPhotos(mixId, vibe, seed, mock).then(
            (set) => {
                if (cancelled) {
                    return;
                }
                remember(set);
                setMainSet(set);
                setMain({ loading: false, waiting: null, error: null });
            },
            (e: unknown) => {
                if (cancelled) {
                    return;
                }
                if (e instanceof RequestError && e.status === 409) {
                    setMain({ loading: false, waiting: e.message, error: null });
                } else {
                    setMain({
                        loading: false,
                        waiting: null,
                        error: e instanceof Error ? e.message : "Couldn't load photos.",
                    });
                }
            },
        );
        return () => {
            cancelled = true;
        };
    }, [ready, finished, mixId, vibe, seed, mock, retry, remember]);

    // the server hasn't counted enough songs yet: try again shortly
    useEffect(() => {
        if (!main.waiting || finished) {
            return;
        }
        const t = setTimeout(() => setRetry((r) => r + 1), 5000);
        return () => clearTimeout(t);
    }, [main.waiting, finished]);

    // "more like this"
    useEffect(() => {
        if (like === null) {
            return;
        }
        let cancelled = false;
        setLikeFetch({ loading: true, waiting: null, error: null });
        fetchSimilar(like, mock).then(
            (set) => {
                if (cancelled) {
                    return;
                }
                remember(set);
                setLikeSet(set);
                setLikeFetch({ loading: false, waiting: null, error: null });
            },
            (e: unknown) => {
                if (!cancelled) {
                    setLikeFetch({
                        loading: false,
                        waiting: null,
                        error: e instanceof Error ? e.message : "Couldn't find similar photos.",
                    });
                }
            },
        );
        return () => {
            cancelled = true;
        };
    }, [like, mock, remember]);

    const likePhoto = like !== null ? (known.get(like) ?? null) : null;
    // the photo itself leads its "more like this" strip, so it stays in view
    const shownSet = useMemo<PhotoSet | null>(() => {
        if (like === null) {
            return mainSet;
        }
        if (!likeSet) {
            return null;
        }
        if (!likePhoto || likeSet.photos.some((p) => p.id === likePhoto.id)) {
            return likeSet;
        }
        return { ...likeSet, photos: [likePhoto, ...likeSet.photos] };
    }, [like, mainSet, likeSet, likePhoto]);

    // choose the first photo when nothing is chosen, and fall back when a link's photo is gone
    const settled = mainSet !== null && (like === null || likeSet !== null || !!likeFetch.error);
    useEffect(() => {
        if (!settled) {
            return;
        }
        const first = shownSet?.photos[0] ?? mainSet?.photos[0];
        if (!first) {
            return;
        }
        if (!chosen && photoId !== first.id) {
            setPhotoId(first.id);
            setState((s) => ({ ...s, x: 0.5, y: 0.5, zoom: 1 }));
        } else if (photoId === null || !known.has(photoId)) {
            if (photoId !== null) {
                setMissing(true);
            }
            setPhotoId(first.id);
            setState((s) => ({ ...s, x: 0.5, y: 0.5, zoom: 1 }));
        }
    }, [settled, shownSet, mainSet, chosen, photoId, known]);

    const photo = photoId !== null ? (known.get(photoId) ?? null) : null;
    const thumb = useImage(photo ? thumbFor(photo)?.url : undefined);
    const full = useImage(photo ? editorImageFor(photo)?.url : undefined);
    const image = full.image ?? thumb.image;

    // keep the edits in the URL, without a history entry per keystroke
    const shared = useMemo(
        () => writeShared({ photo: photoId, vibe, like, seed, state }, defaultTitle),
        [photoId, vibe, like, seed, state, defaultTitle],
    );
    const routerRef = useRef(router);
    routerRef.current = router;
    useEffect(() => {
        if (photoId === null) {
            return;
        }
        const t = setTimeout(() => {
            const r = routerRef.current;
            const query = mergeQuery(r.query, shared);
            const next = new URLSearchParams(query).toString();
            if (next === window.location.search.slice(1)) {
                return;
            }
            r.replace({ pathname: r.pathname, query }, undefined, { shallow: true, scroll: false });
        }, URL_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [shared, photoId]);

    const shareUrl = () => {
        const query = new URLSearchParams(mergeQuery(router.query, shared));
        return `${window.location.origin}${window.location.pathname}?${query}`;
    };

    // any edit commits to the photo: it no longer switches when the final set arrives
    const change = (fn: (s: CoverState) => CoverState) => {
        setChosen(true);
        history.set(fn);
    };
    const update = (u: Partial<CoverState>) => change((s) => ({ ...s, ...u }));
    const updateText = (id: string, u: Partial<TextItem>) =>
        change((s) => ({ ...s, texts: s.texts.map((t) => (t.id === id ? { ...t, ...u } : t)) }));
    const zoomTo = (zoom: number) =>
        change((s) =>
            image ? clampCrop(image.width, image.height, { ...s, zoom }, aspectOf(s.frame)) : s,
        );

    const select = (p: Photo) => {
        setChosen(true);
        setMissing(false);
        if (p.id !== photoId) {
            setPhotoId(p.id);
            setState((s) => ({ ...s, x: 0.5, y: 0.5, zoom: 1 }));
        }
    };
    const moreLike = () => {
        if (!photo) {
            return;
        }
        setChosen(true);
        setLikeSet(null);
        setLike(photo.id);
    };
    const research = (v: string) => {
        setVibe(v);
        setSeed(0);
        setLike(null);
        setLikeSet(null);
        setMainSet(null);
        // the new set's first photo replaces the current one
        setChosen(false);
        setMissing(false);
    };
    // new photos for the same scenes and colours
    const shuffle = () => {
        setSeed(1 + Math.floor(Math.random() * MAX_SEED));
        setMainSet(null);
        setChosen(false);
        setMissing(false);
    };
    const back = () => {
        setLike(null);
        setLikeSet(null);
    };

    if (!ready) {
        return (
            <Panel title="Cover" className="lg:col-span-12">
                <Waiting className="h-48">
                    {Math.min(analysed, MIN_TRACKS)} / {MIN_TRACKS} songs
                </Waiting>
            </Panel>
        );
    }
    if (!mainSet && main.waiting) {
        return (
            <Panel title="Cover" className="lg:col-span-12">
                <Waiting className="h-48">
                    {finished
                        ? `${main.waiting} There weren't enough songs with previews to pick a photo.`
                        : main.waiting}
                </Waiting>
            </Panel>
        );
    }
    if (!mainSet && main.error) {
        return (
            <Panel title="Cover" className="lg:col-span-12">
                <Alert
                    color="red"
                    variant="light"
                    icon={<FiAlertCircle />}
                    title="Couldn't load cover photos"
                    role="alert"
                >
                    {main.error}
                    <div>
                        <Button
                            mt="sm"
                            size="compact-sm"
                            variant="default"
                            onClick={() => setRetry((r) => r + 1)}
                        >
                            Try again
                        </Button>
                    </div>
                </Alert>
            </Panel>
        );
    }

    const loadingStrip = like !== null ? likeFetch.loading : main.loading && !mainSet;
    return (
        <Panel title="Cover" className="lg:col-span-12">
            <PhotoStrip
                set={shownSet}
                loading={loadingStrip}
                selected={photoId}
                like={likePhoto}
                vibe={vibe}
                onSelect={select}
                onVibe={research}
                onShuffle={shuffle}
                onBack={back}
            />
            {(likeFetch.error || (mainSet && main.error)) && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
                    {likeFetch.error || main.error}
                </p>
            )}
            {missing && (
                <p className="mt-1 text-sm text-muted" role="status">
                    Linked photo gone; showing the first instead.
                </p>
            )}

            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:gap-8">
                <div className="min-w-0">
                    <CoverCanvas
                        image={image}
                        loading={!!photo && !full.image && !full.failed}
                        state={state}
                        onChange={change}
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                        {photo ? <Credit photo={photo} onMore={moreLike} like={like} /> : <span />}
                        <UndoRedo
                            onUndo={history.undo}
                            onRedo={history.redo}
                            canUndo={history.canUndo}
                            canRedo={history.canRedo}
                        />
                    </div>
                    <div className="mt-4">
                        <ShareBar
                            photo={photo}
                            state={state}
                            filename={`mixtake-${slug(source.name)}.jpg`}
                            shareUrl={shareUrl}
                        />
                    </div>
                </div>
                <CoverControls
                    state={state}
                    photo={photo}
                    palette={mainSet?.palette ?? []}
                    onChange={update}
                    onText={updateText}
                    onZoom={zoomTo}
                />
            </div>
        </Panel>
    );
}

// the photographer's credit stays on the page, one click away, never on the image
function Credit({
    photo,
    onMore,
    like,
}: {
    photo: Photo;
    onMore: () => void;
    like: number | null;
}) {
    return (
        <div className="flex items-center gap-1">
            <Info label="about this photo">
                <p className="font-medium">{photo.title || "untitled"}</p>
                {photo.caption && <p className="mt-1 text-muted">{photo.caption}</p>}
            </Info>
            <Tooltip label={`photo by u/${photo.author}`} withArrow>
                <ActionIcon
                    component="a"
                    href={photo.permalink}
                    target="_blank"
                    rel="noreferrer"
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`photo by u/${photo.author}, opens analogdb`}
                    className="text-muted"
                >
                    <FiCamera aria-hidden />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="more like this" withArrow>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="more like this"
                    onClick={onMore}
                    disabled={like === photo.id}
                    className="text-muted"
                >
                    <FiLayers aria-hidden />
                </ActionIcon>
            </Tooltip>
        </div>
    );
}

function UndoRedo({
    onUndo,
    onRedo,
    canUndo,
    canRedo,
}: {
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}) {
    return (
        <div className="flex items-center gap-1">
            <Tooltip label="undo" withArrow>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="undo"
                    aria-keyshortcuts="Meta+Z Control+Z"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="text-muted"
                >
                    <FiCornerUpLeft aria-hidden />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="redo" withArrow>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="redo"
                    aria-keyshortcuts="Meta+Shift+Z Control+Y"
                    onClick={onRedo}
                    disabled={!canRedo}
                    className="text-muted"
                >
                    <FiCornerUpRight aria-hidden />
                </ActionIcon>
            </Tooltip>
        </div>
    );
}
