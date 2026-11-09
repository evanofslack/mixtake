import { ReactNode } from "react";
import { Accordion, Button, SegmentedControl, Slider, Switch, TextInput } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { FiAlignCenter, FiAlignLeft, FiAlignRight, FiRotateCcw } from "react-icons/fi";
import type { Photo } from "../lib/api";
import {
    Align,
    CoverState,
    DARK,
    FONT_IDS,
    FONTS,
    LIGHT,
    Pos,
    POSITIONS,
    SIZE_MAX,
    SIZE_MIN,
    ZOOM_MAX,
} from "../lib/canvas";

type Props = {
    state: CoverState;
    photo: Photo | null;
    onChange: (update: Partial<CoverState>) => void;
    onZoom: (zoom: number) => void;
};

const POS_LABEL: Record<Pos, string> = {
    tl: "top left",
    tc: "top centre",
    tr: "top right",
    ml: "middle left",
    mc: "centre",
    mr: "middle right",
    bl: "bottom left",
    bc: "bottom centre",
    br: "bottom right",
};

// the editor's settings: stacked beside the preview on wide screens, an accordion on phones
export default function CoverControls({ state, photo, onChange, onZoom }: Props) {
    const wide = useMediaQuery("(min-width: 64em)", false);
    const sections: { value: string; label: string; body: ReactNode }[] = [
        {
            value: "text",
            label: "Text",
            body: <TextSection state={state} onChange={onChange} />,
        },
        {
            value: "type",
            label: "Typeface and layout",
            body: <TypeSection state={state} onChange={onChange} />,
        },
        {
            value: "colour",
            label: "Colour",
            body: <ColourSection state={state} photo={photo} onChange={onChange} />,
        },
        {
            value: "crop",
            label: "Crop",
            body: <CropSection state={state} onZoom={onZoom} onChange={onChange} />,
        },
    ];

    if (wide) {
        return (
            <div className="flex flex-col gap-5">
                {sections.map((s) => (
                    <section key={s.value} aria-label={s.label}>
                        <h3 className="mb-2 text-xs font-medium tracking-wider text-muted uppercase">
                            {s.label}
                        </h3>
                        {s.body}
                    </section>
                ))}
            </div>
        );
    }
    return (
        <Accordion multiple defaultValue={["text"]} variant="contained" radius="sm">
            {sections.map((s) => (
                <Accordion.Item key={s.value} value={s.value}>
                    <Accordion.Control>{s.label}</Accordion.Control>
                    <Accordion.Panel>{s.body}</Accordion.Panel>
                </Accordion.Item>
            ))}
        </Accordion>
    );
}

function TextSection({ state, onChange }: Pick<Props, "state" | "onChange">) {
    return (
        <div className="flex flex-col gap-3">
            <TextInput
                label="Title"
                value={state.title}
                maxLength={120}
                placeholder="no title"
                onChange={(e) => onChange({ title: e.currentTarget.value })}
            />
            <TextInput
                label="Subtitle"
                value={state.sub}
                maxLength={160}
                placeholder="optional, e.g. a date or your name"
                onChange={(e) => onChange({ sub: e.currentTarget.value })}
            />
        </div>
    );
}

function TypeSection({ state, onChange }: Pick<Props, "state" | "onChange">) {
    return (
        <div className="flex flex-col gap-4">
            <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Typeface</legend>
                <div className="grid grid-cols-5 gap-1.5">
                    {FONT_IDS.map((id) => (
                        <Choice
                            key={id}
                            name="cover-font"
                            checked={state.font === id}
                            onSelect={() => onChange({ font: id })}
                            label={FONTS[id].label}
                            className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-sm border border-line px-1"
                        >
                            <span
                                aria-hidden
                                className="text-xl leading-none"
                                style={{
                                    fontFamily: `"${FONTS[id].family}"`,
                                    fontWeight: FONTS[id].weight,
                                }}
                            >
                                Aa
                            </span>
                            <span className="text-[0.68rem] text-muted">{FONTS[id].label}</span>
                        </Choice>
                    ))}
                </div>
            </fieldset>

            <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
                <fieldset>
                    <legend className="mb-1.5 text-sm font-medium">Position</legend>
                    <div className="grid w-fit grid-cols-3 gap-1">
                        {POSITIONS.map((p) => (
                            <Choice
                                key={p}
                                name="cover-pos"
                                checked={state.pos === p}
                                onSelect={() =>
                                    onChange({
                                        pos: p,
                                        // follow the column; the alignment control can override it
                                        align:
                                            p[1] === "l"
                                                ? "left"
                                                : p[1] === "r"
                                                  ? "right"
                                                  : "center",
                                    })
                                }
                                label={POS_LABEL[p]}
                                className="flex size-8 items-center justify-center rounded-xs border border-line"
                            >
                                <span
                                    aria-hidden
                                    className="size-1.5 rounded-full bg-mark-soft peer-checked:bg-ink"
                                />
                            </Choice>
                        ))}
                    </div>
                </fieldset>

                <div className="min-w-40 grow">
                    <p className="mb-1.5 text-sm font-medium" id="cover-align">
                        Alignment
                    </p>
                    <SegmentedControl
                        aria-labelledby="cover-align"
                        size="sm"
                        value={state.align}
                        onChange={(v) => onChange({ align: v as Align })}
                        data={[
                            {
                                value: "left",
                                label: <AlignLabel icon={<FiAlignLeft />} name="left" />,
                            },
                            {
                                value: "center",
                                label: <AlignLabel icon={<FiAlignCenter />} name="centre" />,
                            },
                            {
                                value: "right",
                                label: <AlignLabel icon={<FiAlignRight />} name="right" />,
                            },
                        ]}
                    />
                    <p className="mt-3 mb-1 text-sm font-medium" id="cover-size">
                        Size
                    </p>
                    <Slider
                        aria-labelledby="cover-size"
                        thumbLabel="title size"
                        min={SIZE_MIN}
                        max={SIZE_MAX}
                        step={0.5}
                        value={state.size}
                        onChange={(v) => onChange({ size: v })}
                        label={(v) => `${v}%`}
                        color="var(--mix-ink)"
                    />
                </div>
            </div>
        </div>
    );
}

function AlignLabel({ icon, name }: { icon: ReactNode; name: string }) {
    return (
        <span className="flex items-center justify-center px-1" title={`align ${name}`}>
            {icon}
            <span className="sr-only">align {name}</span>
        </span>
    );
}

function ColourSection({ state, photo, onChange }: Pick<Props, "state" | "photo" | "onChange">) {
    // the photo's colours, skipping any too close to one already offered
    const fromPhoto: string[] = [];
    for (const c of photo?.colors ?? []) {
        const hex = c.hex.toLowerCase();
        if (
            fromPhoto.length < 5 &&
            [LIGHT, DARK, ...fromPhoto].every((o) => distance(o, hex) > 48)
        ) {
            fromPhoto.push(hex);
        }
    }
    const options: { value: string; label: string; swatch: ReactNode }[] = [
        {
            value: "auto",
            label: "automatic: light or dark for the photo",
            swatch: (
                <span
                    className="block size-full rounded-full"
                    style={{ background: `linear-gradient(135deg, ${LIGHT} 50%, ${DARK} 50%)` }}
                />
            ),
        },
        { value: LIGHT, label: "white", swatch: <Dot hex={LIGHT} /> },
        { value: DARK, label: "black", swatch: <Dot hex={DARK} /> },
        ...fromPhoto.map((hex) => ({
            value: hex,
            label: `${hex} from the photo`,
            swatch: <Dot hex={hex} />,
        })),
    ];
    // a colour from a shared link that this photo doesn't have still shows as selected
    if (!options.some((o) => o.value === state.color)) {
        options.push({
            value: state.color,
            label: state.color,
            swatch: <Dot hex={state.color} />,
        });
    }
    return (
        <div className="flex flex-col gap-4">
            <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Text colour</legend>
                <div className="flex flex-wrap gap-2">
                    {options.map((o) => (
                        <Choice
                            key={o.value}
                            name="cover-colour"
                            checked={state.color === o.value}
                            onSelect={() => onChange({ color: o.value })}
                            label={o.label}
                            className="size-8 rounded-full border border-line p-0.5"
                            round
                        >
                            {o.swatch}
                        </Choice>
                    ))}
                </div>
                {state.color === "auto" && (
                    <p className="mt-1.5 text-xs text-muted">
                        Automatic picks light or dark from the photo under the text.
                    </p>
                )}
            </fieldset>
            <Switch
                label="Shade behind the text"
                description="A soft gradient that helps the text read on busy photos."
                checked={state.scrim}
                onChange={(e) => onChange({ scrim: e.currentTarget.checked })}
                color="var(--mix-ink)"
            />
        </div>
    );
}

function distance(a: string, b: string): number {
    const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

function Dot({ hex }: { hex: string }) {
    return (
        <span
            className="block size-full rounded-full border border-black/10"
            style={{ background: hex }}
        />
    );
}

function CropSection({ state, onZoom, onChange }: Pick<Props, "state" | "onZoom" | "onChange">) {
    return (
        <div>
            <p className="mb-1 text-sm font-medium" id="cover-zoom">
                Zoom
            </p>
            <Slider
                aria-labelledby="cover-zoom"
                thumbLabel="zoom"
                min={1}
                max={ZOOM_MAX}
                step={0.01}
                value={state.zoom}
                onChange={onZoom}
                label={(v) => `${v.toFixed(1)}×`}
                color="var(--mix-ink)"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">
                    Drag the photo to move it, or focus it and use the arrow keys.
                </p>
                <Button
                    variant="default"
                    size="compact-sm"
                    leftSection={<FiRotateCcw />}
                    onClick={() => onChange({ x: 0.5, y: 0.5, zoom: 1 })}
                    disabled={state.zoom === 1 && state.x === 0.5 && state.y === 0.5}
                >
                    Reset crop
                </Button>
            </div>
        </div>
    );
}

// a radio button drawn as a tile: arrow keys move within its group, like any radio group
function Choice({
    name,
    checked,
    onSelect,
    label,
    className,
    round,
    children,
}: {
    name: string;
    checked: boolean;
    onSelect: () => void;
    label: string;
    className: string;
    round?: boolean;
    children: ReactNode;
}) {
    return (
        <label
            className={`relative cursor-pointer transition-colors hover:border-line-strong has-checked:border-ink has-checked:ring-1 has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink ${round ? "" : "has-checked:bg-bg"} ${className}`}
            title={label}
        >
            <input
                type="radio"
                name={name}
                checked={checked}
                onChange={onSelect}
                className="peer sr-only"
                aria-label={label}
            />
            {children}
        </label>
    );
}
