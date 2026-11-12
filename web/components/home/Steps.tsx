import { ReactNode, useEffect, useState } from "react";
import { useIntersection } from "@mantine/hooks";
import { FiArrowRight } from "react-icons/fi";
import { moodColour } from "../../lib/moodColour";
import { scatter } from "../../lib/showcase";
import { useDark } from "../../lib/useDark";

// the songs that land on the little map in the middle step
const SONGS = scatter(0.62, 0.36, 7, 0.22, 7);

// what happens to a paste, as three small pictures: the link, the songs on the map, the photo
export default function Steps() {
    const { ref, entry } = useIntersection<HTMLOListElement>({ threshold: 0.4 });
    const [play, setPlay] = useState(false);
    useEffect(() => {
        if (entry?.isIntersecting) {
            setPlay(true);
        }
    }, [entry?.isIntersecting]);
    const dark = useDark();
    const held = play ? "" : "held";

    return (
        <ol ref={ref} className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
            <Step n={1} word="Paste" caption="a playlist or tracks">
                <div className="flex h-full items-center px-3">
                    <span
                        className={`slide-in ${held} truncate rounded-sm px-2 py-1 font-mono text-[11px] text-ink shadow-raised-xs`}
                    >
                        open.spotify.com/playlist/…
                    </span>
                </div>
            </Step>
            <Arrow />
            <Step n={2} word="Listen" caption="Essentia hears each song">
                <svg viewBox="0 0 100 60" className="size-full" aria-hidden>
                    <line
                        x1="50"
                        x2="50"
                        y1="6"
                        y2="54"
                        stroke="var(--mix-line-strong)"
                        strokeDasharray="2 3"
                    />
                    <line
                        x1="8"
                        x2="92"
                        y1="30"
                        y2="30"
                        stroke="var(--mix-line-strong)"
                        strokeDasharray="2 3"
                    />
                    {SONGS.map((s, i) => (
                        <circle
                            key={i}
                            cx={8 + s.x * 84}
                            cy={54 - s.y * 48}
                            r={3}
                            fill={moodColour(s.x, s.y, dark)}
                            className={`develop ${held}`}
                            style={{ animationDelay: `${300 + i * 260}ms` }}
                        />
                    ))}
                </svg>
            </Step>
            <Arrow />
            <Step n={3} word="Develop" caption="a film photo to match">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/mock/golden-field.jpg"
                    alt=""
                    loading="lazy"
                    className={`print ${held} size-full rounded-md object-cover`}
                    style={{ animationDelay: "2200ms" }}
                />
            </Step>
        </ol>
    );
}

function Step({
    n,
    word,
    caption,
    children,
}: {
    n: number;
    word: string;
    caption: string;
    children: ReactNode;
}) {
    return (
        <li className="flex items-center gap-4 sm:flex-col sm:items-stretch sm:gap-3">
            <div className="h-20 w-28 shrink-0 overflow-hidden rounded-xl p-1.5 shadow-pressed sm:h-24 sm:w-auto">
                {children}
            </div>
            <div className="min-w-0 leading-tight">
                <p className="text-sm font-semibold tracking-tight">
                    <span className="mr-1.5 text-xs font-normal text-muted tabular-nums">{n}</span>
                    {word}
                </p>
                <p className="mt-0.5 text-xs text-muted">{caption}</p>
            </div>
        </li>
    );
}

function Arrow() {
    return (
        <li aria-hidden className="hidden items-center pb-9 text-muted sm:flex">
            <FiArrowRight />
        </li>
    );
}
