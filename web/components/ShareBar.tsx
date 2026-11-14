import { useState } from "react";
import { Button, Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { FiAlertTriangle, FiCheck, FiChevronDown, FiDownload, FiLink } from "react-icons/fi";
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

const SIZES = [
    { px: 3000, label: "Large" },
    { px: 1500, label: "Medium" },
    { px: 640, label: "Small" },
] as const;
type Size = (typeof SIZES)[number]["px"];

// download the cover as a square JPG at the chosen size, or copy a link that rebuilds it
export default function ShareBar({ photo, state, filename, shareUrl }: Props) {
    const [size, setSize] = useState<Size>(3000);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    const save = async () => {
        if (!photo) {
            return;
        }
        setBusy(true);
        try {
            download(await renderCover(photo, state, size), filename);
        } catch (e) {
            notifications.show({
                color: "red",
                title: "Couldn't make the JPG",
                message: e instanceof Error ? e.message : "Try again in a moment.",
            });
        } finally {
            setBusy(false);
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

    const soft = (px: number) => !!photo && upscales(photo, state, px);
    // only behind the warning icon: most analogdb photos are smaller than 3000 px
    const note = soft(size) ? `The ${size} px download will look slightly soft` : "";
    return (
        <div>
            <div className="flex flex-wrap gap-2">
                <Button.Group className="min-w-0 grow sm:grow-0">
                    <Button
                        size="sm"
                        px="sm"
                        className="grow"
                        leftSection={<FiDownload />}
                        loading={busy}
                        disabled={!photo}
                        onClick={save}
                    >
                        Download {size} px
                    </Button>
                    <Menu position="bottom-end" withArrow>
                        <Menu.Target>
                            <Button
                                size="sm"
                                px={8}
                                disabled={!photo || busy}
                                aria-label="download size"
                                className="border-l border-l-white/25"
                            >
                                <FiChevronDown aria-hidden />
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>Size</Menu.Label>
                            {SIZES.map((s) => (
                                <Menu.Item
                                    key={s.px}
                                    onClick={() => setSize(s.px)}
                                    leftSection={
                                        <FiCheck
                                            aria-hidden
                                            className={s.px === size ? "" : "invisible"}
                                        />
                                    }
                                    rightSection={
                                        soft(s.px) && (
                                            <span className="text-xs text-muted">soft</span>
                                        )
                                    }
                                    aria-checked={s.px === size}
                                    role="menuitemradio"
                                >
                                    {s.label} · {s.px} px
                                </Menu.Item>
                            ))}
                        </Menu.Dropdown>
                    </Menu>
                </Button.Group>
                <Button
                    size="sm"
                    variant="subtle"
                    leftSection={copied ? <FiCheck /> : <FiLink />}
                    onClick={copy}
                    disabled={!photo}
                >
                    {copied ? "Copied" : "Copy link"}
                </Button>
                {note && (
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
