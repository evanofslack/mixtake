import { useState } from "react";
import { Button } from "@mantine/core";
import { FiChevronDown } from "react-icons/fi";
import type { Source } from "../lib/api";

// Spotify's own player, mounted only when opened so the page doesn't load it for everyone.
// Pasted tracks have nothing to embed
export default function Listen({ source }: { source: Source }) {
    const [open, setOpen] = useState(false);
    if (source.kind === "tracks" || !source.spotify_id) {
        return null;
    }
    const src = `https://open.spotify.com/embed/${source.kind}/${encodeURIComponent(source.spotify_id)}`;
    return (
        <div className="mt-3">
            <Button
                variant="default"
                size="compact-sm"
                radius="xl"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls="listen-player"
                rightSection={
                    <FiChevronDown
                        className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                    />
                }
            >
                Listen on Spotify
            </Button>
            <div id="listen-player" hidden={!open}>
                {open && (
                    <iframe
                        title={`${source.name ?? "This " + source.kind} on Spotify`}
                        src={src}
                        width="100%"
                        height={352}
                        loading="lazy"
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        className="mt-2 block rounded-xl border-0"
                    />
                )}
            </div>
        </div>
    );
}
