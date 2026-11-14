import { KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { Tooltip } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { FiCamera, FiMove } from "react-icons/fi";
import { moodColour } from "../../lib/moodColour";
import { nearestPhoto, QUADRANTS, quadrantAt, ShowcasePhoto } from "../../lib/showcase";
import { useDark } from "../../lib/useDark";

type Point = { mood: number; energy: number };

const START: Point = { mood: 0.7, energy: 0.32 };
const STEP = 0.05;

const clamp = (v: number) => Math.min(1, Math.max(0, v));

// where the knob drifts before anyone touches it: a slow loop through all four quadrants
function drift(t: number): Point {
    return {
        mood: 0.5 + 0.36 * Math.sin(t / 5600 + 1.2),
        energy: 0.5 + 0.34 * Math.sin(t / 4000),
    };
}

// the front page's demo: drag a knob around the mood map and the photo that fits that spot
// develops in beside it, the same idea as a mix's cover, in miniature. photos is null while the
// showcase loads
export default function MoodPad({ photos }: { photos: ShowcasePhoto[] | null }) {
    const dark = useDark();
    const reduced = useReducedMotion();
    const [p, setP] = useState<Point>(START);
    const [touched, setTouched] = useState(false);
    const [dragging, setDragging] = useState(false);
    // every photo is fetched in the background as soon as the set arrives, and only loaded ones
    // are shown, so the frame never shows a half-loaded image
    const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
    const well = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (touched || reduced) {
            return;
        }
        let frame = 0;
        const t0 = performance.now();
        const tick = (now: number) => {
            setP(drift(now - t0 + 3300));
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [touched, reduced]);

    useEffect(() => {
        let live = true;
        for (const ph of photos ?? []) {
            const img = new Image();
            img.onload = () =>
                live && setLoaded((s) => (s.has(ph.src) ? s : new Set(s).add(ph.src)));
            img.src = ph.src;
        }
        return () => {
            live = false;
        };
    }, [photos]);

    const list = photos ?? [];
    const ready = list.filter((ph) => loaded.has(ph.src));
    // the nearest photo that's ready to show
    const photo = nearestPhoto(ready, p.mood, p.energy);
    const current = photo?.src;

    const quadrant = quadrantAt(p.mood, p.energy);
    const colour = moodColour(p.mood, p.energy, dark);

    const moveTo = (e: PointerEvent<HTMLDivElement>) => {
        const box = well.current?.getBoundingClientRect();
        if (!box) {
            return;
        }
        setP({
            mood: clamp((e.clientX - box.left) / box.width),
            energy: clamp(1 - (e.clientY - box.top) / box.height),
        });
    };
    const onDown = (e: PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setTouched(true);
        setDragging(true);
        moveTo(e);
    };
    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? STEP * 2 : STEP;
        const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
        };
        const m = moves[e.key];
        if (!m) {
            return;
        }
        e.preventDefault();
        setTouched(true);
        setP((q) => ({ mood: clamp(q.mood + m[0]), energy: clamp(q.energy + m[1]) }));
    };

    return (
        <section
            aria-label="mood map demo"
            className="grid gap-6 rounded-2xl bg-surface p-5 shadow-raised sm:grid-cols-2 sm:items-center sm:p-6"
        >
            <div>
                <div
                    ref={well}
                    onPointerDown={onDown}
                    onPointerMove={(e) => dragging && moveTo(e)}
                    onPointerUp={() => setDragging(false)}
                    onPointerCancel={() => setDragging(false)}
                    className="relative aspect-square cursor-crosshair touch-none overflow-hidden rounded-xl shadow-pressed select-none"
                >
                    {/* the knob's colour washes the well around it */}
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background: `radial-gradient(circle at ${p.mood * 100}% ${(1 - p.energy) * 100}%, color-mix(in srgb, ${colour} 38%, transparent), transparent 62%)`,
                        }}
                    />
                    <div
                        aria-hidden
                        className="absolute inset-y-3 left-1/2 border-l border-dashed border-line-strong"
                    />
                    <div
                        aria-hidden
                        className="absolute inset-x-3 top-1/2 border-t border-dashed border-line-strong"
                    />

                    {QUADRANTS.map((q) => (
                        <span
                            key={q.name}
                            aria-hidden
                            className={`absolute text-xs transition-colors letterpress ${
                                q.name === quadrant ? "font-medium text-ink" : "text-muted"
                            } ${q.corner[0] === "t" ? "top-3" : "bottom-3"} ${
                                q.corner[1] === "l" ? "left-3.5" : "right-3.5"
                            }`}
                        >
                            {q.name}
                        </span>
                    ))}
                    <Edge className="top-1.5 left-1/2 -translate-x-1/2">energetic</Edge>
                    <Edge className="bottom-1.5 left-1/2 -translate-x-1/2">calm</Edge>
                    <Edge className="top-1/2 left-1.5 -translate-y-1/2 rotate-180 [writing-mode:vertical-rl]">
                        sad
                    </Edge>
                    <Edge className="top-1/2 right-1.5 -translate-y-1/2 [writing-mode:vertical-rl]">
                        happy
                    </Edge>

                    {/* every photo the demo knows, as a dot where it sits; the nearest one is lit */}
                    {list.map((ph) => {
                        const on = ph.src === current;
                        return (
                            <span
                                key={ph.src}
                                aria-hidden
                                className={`pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[opacity,transform] duration-300 ${
                                    on ? "scale-150 opacity-100" : "opacity-45"
                                }`}
                                style={{
                                    left: `${ph.mood * 100}%`,
                                    top: `${(1 - ph.energy) * 100}%`,
                                    background: moodColour(ph.mood, ph.energy, dark),
                                }}
                            />
                        );
                    })}

                    <div
                        role="slider"
                        tabIndex={0}
                        aria-label="mood and energy"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(p.mood * 100)}
                        aria-valuetext={`${quadrant}, mood ${Math.round(p.mood * 100)}, energy ${Math.round(p.energy * 100)}`}
                        onKeyDown={onKey}
                        onFocus={() => setTouched(true)}
                        className={`absolute flex size-8 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-bg ${
                            dragging ? "cursor-grabbing shadow-pressed-sm" : "shadow-raised-sm"
                        }`}
                        style={{ left: `${p.mood * 100}%`, top: `${(1 - p.energy) * 100}%` }}
                    >
                        <span className="size-3 rounded-full" style={{ background: colour }} />
                    </div>

                    {!touched && (
                        <span
                            aria-hidden
                            className="pointer-events-none absolute right-3 bottom-8 flex items-center gap-1 rounded-full bg-bg/80 px-2 py-0.5 text-[10px] text-muted shadow-raised-xs"
                        >
                            <FiMove /> drag
                        </span>
                    )}
                </div>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
                <div className="rounded-xl p-2 shadow-pressed">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-sunk">
                        {ready.map((ph) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                key={ph.src}
                                src={ph.src}
                                alt={ph.src === current ? `a ${quadrant} film photo` : ""}
                                aria-hidden={ph.src !== current}
                                className={`absolute inset-0 size-full object-cover transition-[opacity,filter] duration-700 motion-reduce:transition-none ${
                                    ph.src === current
                                        ? "opacity-100"
                                        : "opacity-0 blur-[2px] sepia"
                                }`}
                            />
                        ))}
                    </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <p
                        aria-live="polite"
                        className="font-serif text-2xl leading-none letterpress sm:text-3xl"
                    >
                        {quadrant}
                    </p>
                    {photo?.author && (
                        <Tooltip label={photo.author} withArrow openDelay={100}>
                            <a
                                href={photo.href}
                                aria-label={`photo by ${photo.author}`}
                                className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-ink"
                            >
                                <FiCamera aria-hidden />
                            </a>
                        </Tooltip>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <MiniGauge label="mood" value={p.mood} ends={["sad", "happy"]} />
                    <MiniGauge label="energy" value={p.energy} ends={["calm", "energetic"]} />
                </div>
            </div>
        </section>
    );
}

function Edge({ className, children }: { className: string; children: string }) {
    return (
        <span
            aria-hidden
            className={`pointer-events-none absolute text-[10px] tracking-wider text-muted/80 uppercase ${className}`}
        >
            {children}
        </span>
    );
}

// a groove filled to a value with a knob on it, like the summary's gauges on a mix
function MiniGauge({
    label,
    value,
    ends,
}: {
    label: string;
    value: number;
    ends: [string, string];
}) {
    return (
        <div aria-hidden className="min-w-0">
            <div className="flex items-baseline justify-between">
                <span className="text-[10px] font-medium tracking-wider text-muted uppercase">
                    {label}
                </span>
                <span className="text-sm font-medium tabular-nums">{Math.round(value * 100)}</span>
            </div>
            <div className="relative mt-1.5 h-1.5">
                <div className="h-full overflow-hidden rounded-full shadow-pressed-xs">
                    <span
                        className="block h-full rounded-full bg-ink"
                        style={{ width: `${value * 100}%` }}
                    />
                </div>
                <span
                    className="absolute top-1/2 flex size-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-bg shadow-raised-xs"
                    style={{ left: `${value * 100}%` }}
                >
                    <span className="size-1.5 rounded-full bg-accent" />
                </span>
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted">
                <span>{ends[0]}</span>
                <span>{ends[1]}</span>
            </div>
        </div>
    );
}
