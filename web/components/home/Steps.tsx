import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useIntersection } from "@mantine/hooks";
import { UnstyledButton } from "@mantine/core";
import { FiArrowRight } from "react-icons/fi";
import Info from "../Info";
import { EXAMPLES, exampleHref } from "../../lib/examples";
import { moodColour } from "../../lib/moodColour";
import { scatter } from "../../lib/showcase";
import { useDark } from "../../lib/useDark";

type Props = {
    // the mock mix for each example, in mock mode
    mockIds?: string[];
};

// how a playlist becomes a cover, worked through on the examples: the songs, how they sound, the
// words they suggest, the photo those words found and the finished cover. It plays once when it
// scrolls into view; the tabs switch which example it follows
export default function Steps({ mockIds }: Props) {
    const { ref, entry } = useIntersection<HTMLOListElement>({ threshold: 0.3 });
    const [play, setPlay] = useState(false);
    useEffect(() => {
        if (entry?.isIntersecting) {
            setPlay(true);
        }
    }, [entry?.isIntersecting]);
    const [at, setAt] = useState(0);
    const dark = useDark();
    const ex = EXAMPLES[at];
    const dots = useMemo(() => (ex ? scatter(ex.mood, ex.energy, 9, 0.2, at + 3) : []), [ex, at]);
    if (!ex) {
        return null;
    }
    const held = play ? "" : "held";
    const delay = (i: number) => ({ animationDelay: `${i * 450}ms` });

    return (
        <div>
            <h2 className="text-lg font-semibold tracking-tight">How it works</h2>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
                Paste a playlist and mixtake listens to a preview of every song for its mood,
                energy, tempo and style. It reads the track list too, the titles, artists, places
                and eras, and turns it all into a handful of search phrases. Those find real film
                photos from the analogdb community, matched to what the songs are about as well as
                how they sound. Pick one, set the type, and download a square cover.
            </p>

            <div
                role="tablist"
                aria-label="follow an example"
                className="mt-6 flex gap-2 overflow-x-auto pb-1"
            >
                {EXAMPLES.map((e, i) => (
                    <UnstyledButton
                        key={e.slug}
                        role="tab"
                        aria-selected={i === at}
                        aria-controls="how-steps"
                        onClick={() => setAt(i)}
                        className={`shrink-0 rounded-full px-3 py-1 text-xs whitespace-nowrap transition-shadow ${
                            i === at ? "text-ink shadow-pressed-sm" : "text-muted shadow-raised-sm"
                        }`}
                    >
                        {e.name}
                    </UnstyledButton>
                ))}
            </div>

            <ol
                ref={ref}
                id="how-steps"
                role="tabpanel"
                className="mt-5 grid gap-4 sm:grid-cols-5 sm:gap-3"
            >
                <Step n={1} word="Paste" caption="a playlist, album or tracks">
                    <div className={`slide-in ${held} h-full px-2.5 py-2`} style={delay(0)}>
                        <p className="truncate text-xs font-medium text-ink">{ex.name}</p>
                        <ul className="mt-1 space-y-0.5 font-mono text-[10px] leading-snug text-muted">
                            {ex.tracks.map((t) => (
                                <li key={t} className="truncate">
                                    {t}
                                </li>
                            ))}
                        </ul>
                    </div>
                </Step>
                <Step
                    n={2}
                    word="Listen"
                    caption="mood and energy, song by song"
                    info={
                        <>
                            Each 30 second preview is analysed by{" "}
                            <a href="https://essentia.upf.edu" className="underline">
                                Essentia
                            </a>{" "}
                            (CC BY-NC-SA) for mood, energy, tempo, key and style.
                        </>
                    }
                >
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
                        {dots.map((s, i) => (
                            <circle
                                key={`${at}-${i}`}
                                cx={8 + s.x * 84}
                                cy={54 - s.y * 48}
                                r={3}
                                fill={moodColour(s.x, s.y, dark)}
                                className={`develop ${held}`}
                                style={{ animationDelay: `${450 + i * 120}ms` }}
                            />
                        ))}
                    </svg>
                </Step>
                <Step
                    n={3}
                    word="Read"
                    caption="the songs become search phrases"
                    info="A language model drafts the phrases from the track list and the sound, then each one is searched on analogdb."
                >
                    <div className="flex h-full flex-col justify-center gap-1 px-2">
                        {ex.phrases.slice(0, 3).map((p, i) => (
                            <span
                                key={p}
                                title={p}
                                className={`slide-in ${held} truncate rounded-sm px-1.5 py-0.5 text-[10px] leading-tight shadow-raised-xs ${
                                    i === 0 ? "text-ink" : "text-muted"
                                }`}
                                style={{ animationDelay: `${1000 + i * 200}ms` }}
                            >
                                {p}
                            </span>
                        ))}
                    </div>
                </Step>
                <Step
                    n={4}
                    word="Develop"
                    caption={
                        <>
                            a film photo, by{" "}
                            <a
                                href={ex.credit.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline-offset-2 hover:text-ink hover:underline"
                            >
                                {ex.credit.author}
                            </a>
                        </>
                    }
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        key={ex.photo}
                        src={ex.photo}
                        alt=""
                        loading="lazy"
                        className={`print ${held} size-full rounded-md object-cover`}
                        style={{ animationDelay: "1600ms" }}
                    />
                </Step>
                <Step
                    n={5}
                    word="Make it yours"
                    caption={
                        <Link
                            href={exampleHref(ex, mockIds?.[at])}
                            className="inline-flex items-center gap-1 underline-offset-2 hover:text-ink hover:underline"
                        >
                            open this cover <FiArrowRight aria-hidden />
                        </Link>
                    }
                >
                    <div className="flex h-full justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            key={ex.cover}
                            src={ex.cover}
                            alt={`The cover made for ${ex.name}`}
                            loading="lazy"
                            className={`develop ${held} aspect-square h-full rounded-xs shadow-raised-xs`}
                            style={{ animationDelay: "2400ms" }}
                        />
                    </div>
                </Step>
            </ol>
        </div>
    );
}

function Step({
    n,
    word,
    caption,
    info,
    children,
}: {
    n: number;
    word: string;
    caption: ReactNode;
    info?: ReactNode;
    children: ReactNode;
}) {
    return (
        <li className="flex items-center gap-4 sm:flex-col sm:items-stretch sm:gap-3">
            <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl p-1.5 shadow-pressed sm:h-28 sm:w-auto">
                {children}
            </div>
            <div className="min-w-0 leading-tight">
                <div className="flex min-h-6 items-center gap-1 text-sm font-semibold tracking-tight">
                    <span className="mr-0.5 text-xs font-normal text-muted tabular-nums">{n}</span>
                    {word}
                    {info && <Info label={`about ${word.toLowerCase()}`}>{info}</Info>}
                </div>
                <p className="mt-0.5 text-xs text-muted">{caption}</p>
            </div>
        </li>
    );
}
