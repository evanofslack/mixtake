import Link from "next/link";
import type { CSSProperties } from "react";
import { FaSpotify } from "react-icons/fa";
import { Example, exampleHref } from "../../lib/examples";

type Props = {
    example: Example;
    // the mock mix to open instead of the baked one, in mock mode
    mockId?: string;
    // above the fold: load first
    eager?: boolean;
    // a slight turn, like a print dropped on a table; straightens on hover
    tilt?: number;
    onLight?: () => void;
};

// one example: its finished cover as a print, its name and genre, a link to the playlist on
// Spotify and the photographer's credit. The whole card opens the mix with the cover restored;
// the Spotify and credit links sit above that
export default function ExampleCard({ example: ex, mockId, eager, tilt = 0, onLight }: Props) {
    return (
        <article
            className="group relative"
            onPointerEnter={onLight}
            onFocus={onLight}
            style={{ "--tilt": `${tilt}deg` } as CSSProperties}
        >
            <div className="rotate-(--tilt) rounded-md bg-surface p-1.5 shadow-raised transition-transform duration-300 ease-out group-focus-within:rotate-0 group-hover:-translate-y-1 group-hover:rotate-0 motion-reduce:transition-none sm:p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={ex.cover}
                    alt={`The cover made for ${ex.name}`}
                    width={720}
                    height={720}
                    loading={eager ? "eager" : "lazy"}
                    fetchPriority={eager ? "high" : "auto"}
                    decoding="async"
                    className="aspect-square w-full rounded-xs bg-bg"
                />
            </div>
            <div className="mt-3 flex items-start gap-2 px-0.5">
                <div className="min-w-0 grow leading-tight">
                    <h3 className="truncate text-sm font-medium">
                        <Link
                            href={exampleHref(ex, mockId)}
                            className="outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-(--mix-accent)"
                        >
                            {ex.name}
                        </Link>
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-muted">{ex.genre}</p>
                </div>
                <a
                    href={ex.spotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${ex.name} on Spotify`}
                    title="Open in Spotify"
                    className="relative z-10 -m-1 shrink-0 rounded-full p-1 text-muted transition-colors hover:text-[#1db954] focus-visible:text-[#1db954]"
                >
                    <FaSpotify aria-hidden className="size-4" />
                </a>
            </div>
            <p className="mt-1 truncate px-0.5 text-[11px] text-muted">
                {ex.owner && <>playlist by {ex.owner} · </>}
                photo by{" "}
                <a
                    href={ex.credit.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative z-10 underline-offset-2 hover:text-ink hover:underline"
                >
                    {ex.credit.author}
                </a>
            </p>
        </article>
    );
}
