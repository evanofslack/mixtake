import { useState } from "react";
import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { FiAlertTriangle, FiCheck, FiDownload, FiLink } from "react-icons/fi";
import type { Photo } from "../lib/api";
import type { CoverState } from "../lib/canvas";
import { download, renderCover, upscales } from "../lib/photos";
import Info from "./Info";

type Props = {
    photo: Photo | null;
    state: CoverState;
    filename: string;
    shareUrl: () => string;
};

const SIZES = [1500, 3000] as const;

// download the cover as a square JPG, or copy a link that rebuilds it
export default function ShareBar({ photo, state, filename, shareUrl }: Props) {
    const [busy, setBusy] = useState<number | null>(null);
    const [copied, setCopied] = useState(false);

    const save = async (size: number) => {
        if (!photo) {
            return;
        }
        setBusy(size);
        try {
            download(await renderCover(photo, state, size), filename);
        } catch (e) {
            notifications.show({
                color: "red",
                title: "Couldn't make the JPG",
                message: e instanceof Error ? e.message : "Try again in a moment.",
            });
        } finally {
            setBusy(null);
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            notifications.show({
                title: "Couldn't copy the link",
                message: "Copy it from the address bar instead.",
            });
        }
    };

    const stretched = photo ? SIZES.filter((s) => upscales(photo, state, s)) : [];
    // only behind the warning icon: most analogdb photos are smaller than 3000 px
    const note =
        stretched.length === 0
            ? ""
            : stretched.length === SIZES.length
              ? "Both sizes will look slightly soft"
              : `The ${stretched[0]} px download will look soft`;
    return (
        <div>
            <div className="flex flex-wrap gap-2">
                <div className="flex min-w-0 grow gap-2 sm:grow-0 [&>*]:min-w-0 [&>*]:grow">
                    {SIZES.map((size) => (
                        <Button
                            key={size}
                            size="sm"
                            px="sm"
                            variant={size === 3000 ? "filled" : "default"}
                            leftSection={<FiDownload />}
                            loading={busy === size}
                            disabled={!photo || (busy !== null && busy !== size)}
                            onClick={() => save(size)}
                            aria-label={`Download ${size} px JPG`}
                        >
                            <span aria-hidden>
                                <span className="hidden sm:inline">Download </span>
                                {size}
                                <span className="sm:hidden"> px</span>
                            </span>
                        </Button>
                    ))}
                </div>
                <Button
                    size="sm"
                    variant="subtle"
                    leftSection={copied ? <FiCheck /> : <FiLink />}
                    onClick={copy}
                    disabled={!photo}
                >
                    {copied ? "Copied" : "Copy link"}
                </Button>
                {stretched.length > 0 && (
                    <div className="flex items-center">
                        <Info
                            label="this photo will be upscaled"
                            icon={<FiAlertTriangle aria-hidden className="text-accent" />}
                        >
                            {note}
                        </Info>
                    </div>
                )}
            </div>
            <p className="sr-only" aria-live="polite">
                {note}
            </p>
        </div>
    );
}
