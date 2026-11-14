import { ActionIcon, Button, Tooltip } from "@mantine/core";
import { FiRepeat, FiShuffle } from "react-icons/fi";
import { cssFill, Fill, FillKind, Frame } from "../../lib/canvas";
import { Choice, ColourRow, SectionTitle } from "./ui";

type Props = {
    bg: Fill;
    frame: Frame;
    onChange: (bg: Fill) => void;
    onShuffle: () => void;
    // shrinks a full-bleed photo so the background shows
    onInset: () => void;
    photo: string[];
    palette: string[];
};

const KINDS: { id: FillKind; label: string }[] = [
    { id: "solid", label: "Solid" },
    { id: "horizontal", label: "Horizontal" },
    { id: "vertical", label: "Vertical" },
    { id: "radial", label: "Radial" },
    { id: "diagonal", label: "Diagonal" },
];

export default function BackgroundTab({
    bg,
    frame,
    onChange,
    onShuffle,
    onInset,
    photo,
    palette,
}: Props) {
    const hidden = frame.w >= 1 && frame.h >= 1;
    const gradient = bg.kind !== "solid";
    return (
        <div className="flex flex-col gap-5">
            {hidden && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    <span>The photo covers the background</span>
                    <Button size="compact-xs" variant="default" onClick={onInset}>
                        Inset photo
                    </Button>
                </div>
            )}
            <section aria-label="Fill">
                <div className="mb-2 flex items-center justify-between">
                    <SectionTitle>Fill</SectionTitle>
                    <Tooltip label="shuffle colors" withArrow>
                        <ActionIcon
                            variant="default"
                            size="md"
                            radius="xl"
                            aria-label="shuffle background colors"
                            onClick={onShuffle}
                        >
                            <FiShuffle aria-hidden />
                        </ActionIcon>
                    </Tooltip>
                </div>
                <fieldset>
                    <legend className="sr-only">Fill</legend>
                    <div className="grid grid-cols-5 gap-1.5">
                        {KINDS.map((k) => (
                            <Choice
                                key={k.id}
                                name="cover-fill"
                                checked={bg.kind === k.id}
                                onSelect={() => onChange({ ...bg, kind: k.id })}
                                label={k.label}
                                className="flex flex-col items-center gap-1 rounded-sm px-1 pt-2 pb-1.5"
                            >
                                <span
                                    aria-hidden
                                    className="block size-7 rounded-full border border-black/10"
                                    style={{ background: cssFill({ ...bg, kind: k.id }) }}
                                />
                                <span className="text-[0.68rem] text-muted">{k.label}</span>
                            </Choice>
                        ))}
                    </div>
                </fieldset>
            </section>

            <section aria-label="Background colors">
                <div className="mb-2 flex items-center gap-2">
                    <SectionTitle>{gradient ? "From" : "Color"}</SectionTitle>
                </div>
                <ColourRow
                    name="cover-bg-a"
                    label={gradient ? "Start color" : "Background color"}
                    value={bg.a}
                    onChange={(a) => onChange({ ...bg, a })}
                    photo={photo}
                    palette={palette}
                />
                {gradient && (
                    <>
                        <div className="mt-4 mb-2 flex items-center gap-2">
                            <SectionTitle>To</SectionTitle>
                            <Tooltip label="swap colors" withArrow>
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                    aria-label="swap colors"
                                    className="-mt-2"
                                    onClick={() => onChange({ ...bg, a: bg.b, b: bg.a })}
                                >
                                    <FiRepeat aria-hidden />
                                </ActionIcon>
                            </Tooltip>
                        </div>
                        <ColourRow
                            name="cover-bg-b"
                            label="End color"
                            value={bg.b}
                            onChange={(b) => onChange({ ...bg, b })}
                            photo={photo}
                            palette={palette}
                        />
                    </>
                )}
            </section>
        </div>
    );
}
