import { ReactNode, useState } from "react";
import { Collapse, SegmentedControl, Switch, TextInput, UnstyledButton } from "@mantine/core";
import { FiAlignCenter, FiAlignLeft, FiAlignRight, FiChevronDown } from "react-icons/fi";
import {
    Align,
    alignFor,
    FONT_IDS,
    FONTS,
    Pos,
    POSITIONS,
    SIZE_MAX,
    OUTLINE_MAX,
    SIZE_MIN,
    SLANT_MAX,
    TextItem,
    TRACKING_MAX,
    TRACKING_MIN,
    WIDTH_MAX,
    WIDTH_MIN,
} from "../../lib/canvas";
import Info from "../Info";
import { Choice, ColourRow, SectionTitle, SliderField } from "./ui";

type Props = {
    item: TextItem;
    // the first item is the cover's title
    first?: boolean;
    onChange: (update: Partial<TextItem>) => void;
    // the photo's colours and the mix's
    photo: string[];
    palette: string[];
};

export const POS_LABEL: Record<Pos, string> = {
    tl: "top left",
    tc: "top center",
    tr: "top right",
    ml: "middle left",
    mc: "center",
    mr: "middle right",
    bl: "bottom left",
    bc: "bottom center",
    br: "bottom right",
};

export default function TextTab({ item, first, onChange, photo, palette }: Props) {
    const spec = FONTS[item.font];
    return (
        <div className="flex flex-col gap-5">
            <section aria-label="Text">
                <div className="flex flex-col gap-3">
                    <TextInput
                        label={first ? "Title" : "Text"}
                        value={item.text}
                        maxLength={120}
                        placeholder={first ? "no title" : "no text"}
                        onChange={(e) => onChange({ text: e.currentTarget.value })}
                    />
                    <TextInput
                        label={first ? "Subtitle" : "Second line"}
                        value={item.sub}
                        maxLength={160}
                        placeholder="optional"
                        onChange={(e) => onChange({ sub: e.currentTarget.value })}
                    />
                </div>
            </section>

            <section aria-label="Type">
                <SectionTitle>Type</SectionTitle>
                <fieldset>
                    <legend className="mb-1.5 text-sm font-medium">Typeface</legend>
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                        {FONT_IDS.map((id) => (
                            <Choice
                                key={id}
                                name="cover-font"
                                checked={item.font === id}
                                // a new face starts at its usual weight and width
                                onSelect={() =>
                                    onChange({
                                        font: id,
                                        weight: FONTS[id].weight,
                                        width: FONTS[id].width,
                                    })
                                }
                                label={FONTS[id].label}
                                className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-sm px-1"
                            >
                                <span
                                    aria-hidden
                                    className="text-xl leading-none"
                                    style={{
                                        fontFamily: `"${FONTS[id].family}"`,
                                        fontWeight: FONTS[id].weight,
                                        fontStretch: FONTS[id].stretch
                                            ? `${FONTS[id].width}%`
                                            : undefined,
                                        textTransform: FONTS[id].upper ? "uppercase" : undefined,
                                    }}
                                >
                                    Aa
                                </span>
                                <span className="text-[0.68rem] text-muted">{FONTS[id].label}</span>
                            </Choice>
                        ))}
                    </div>
                </fieldset>

                <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-4">
                    <PositionGrid
                        name="cover-pos"
                        legend="Position"
                        info="Or drag the text on the cover"
                        value={item.pos === "free" ? null : item.pos}
                        // follow the column; the alignment control can override it
                        onChange={(p) => onChange({ pos: p, align: alignFor(p, "left") })}
                    />
                    <div className="flex min-w-40 grow flex-col gap-3">
                        <div>
                            <p className="mb-1.5 text-sm font-medium" id="cover-align">
                                Alignment
                            </p>
                            <SegmentedControl
                                aria-labelledby="cover-align"
                                size="sm"
                                value={item.align}
                                onChange={(v) => onChange({ align: v as Align })}
                                data={[
                                    {
                                        value: "left",
                                        label: <AlignLabel icon={<FiAlignLeft />} name="left" />,
                                    },
                                    {
                                        value: "center",
                                        label: (
                                            <AlignLabel icon={<FiAlignCenter />} name="center" />
                                        ),
                                    },
                                    {
                                        value: "right",
                                        label: <AlignLabel icon={<FiAlignRight />} name="right" />,
                                    },
                                ]}
                            />
                        </div>
                        <SliderField
                            label="Size"
                            min={SIZE_MIN}
                            max={SIZE_MAX}
                            step={0.5}
                            value={item.size}
                            format={(v) => `${v}%`}
                            onChange={(v) => onChange({ size: v })}
                            reset={11}
                        />
                        <SliderField
                            label="Weight"
                            min={spec.weights[0]}
                            max={spec.weights[1]}
                            step={10}
                            value={Math.min(
                                spec.weights[1],
                                Math.max(spec.weights[0], item.weight),
                            )}
                            format={(v) => String(Math.round(v))}
                            onChange={(v) => onChange({ weight: v })}
                            reset={spec.weight}
                        />
                    </div>
                </div>
                <div className="mt-4">
                    <p className="mb-1.5 text-sm font-medium" id="cover-rotate">
                        Direction
                    </p>
                    <SegmentedControl
                        aria-labelledby="cover-rotate"
                        size="xs"
                        value={String(item.rotate)}
                        onChange={(v) => onChange({ rotate: Number(v) })}
                        data={[
                            { value: "-90", label: "Up" },
                            { value: "0", label: "Across" },
                            { value: "90", label: "Down" },
                        ]}
                    />
                </div>
                <More item={item} onChange={onChange} photo={photo} palette={palette} />
            </section>

            <section aria-label="Text color">
                <SectionTitle>Color</SectionTitle>
                <ColourRow
                    name="cover-colour"
                    label="Text color"
                    value={item.color}
                    onChange={(color) => onChange({ color })}
                    photo={photo}
                    palette={palette}
                    auto
                />
                <Switch
                    className="mt-3"
                    label="Shade"
                    checked={item.scrim}
                    onChange={(e) => onChange({ scrim: e.currentTarget.checked })}
                    color="var(--mix-ink)"
                />
            </section>

            <section aria-label="Badge">
                <div className="flex items-center justify-between">
                    <SectionTitle>Badge</SectionTitle>
                    <Switch
                        aria-label="badge behind the text"
                        checked={!!item.badge}
                        onChange={(e) =>
                            onChange({
                                badge: e.currentTarget.checked ? (photo[0] ?? "#f7f4ee") : "",
                            })
                        }
                        color="var(--mix-ink)"
                    />
                </div>
                {item.badge && (
                    <div className="mt-1 flex flex-col gap-3">
                        <ColourRow
                            name="cover-badge"
                            label="Badge color"
                            value={item.badge}
                            onChange={(badge) => onChange({ badge })}
                            photo={photo}
                            palette={palette}
                        />
                        <SliderField
                            label="Corners"
                            min={0}
                            max={1}
                            step={0.01}
                            value={item.badgeRadius}
                            format={(v) => `${Math.round(v * 100)}%`}
                            onChange={(v) => onChange({ badgeRadius: v })}
                            reset={0.3}
                        />
                    </div>
                )}
            </section>
        </div>
    );
}

// the finer type settings, folded away until asked for
function More({ item, onChange, photo, palette }: Props) {
    const [open, setOpen] = useState(
        item.width !== FONTS[item.font].width ||
            item.slant !== 0 ||
            item.tracking !== 0 ||
            item.outline > 0,
    );
    return (
        <div className="mt-4">
            <UnstyledButton
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="flex items-center gap-1 text-sm font-medium"
            >
                More type
                <FiChevronDown
                    aria-hidden
                    className={`transition-transform ${open ? "rotate-180" : ""}`}
                />
            </UnstyledButton>
            <Collapse expanded={open}>
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 pt-3 sm:grid-cols-2">
                    <SliderField
                        label="Width"
                        min={WIDTH_MIN}
                        max={WIDTH_MAX}
                        step={1}
                        value={item.width}
                        format={(v) => `${Math.round(v)}%`}
                        onChange={(v) => onChange({ width: v })}
                        reset={FONTS[item.font].width}
                    />
                    <SliderField
                        label="Slant"
                        min={-SLANT_MAX}
                        max={SLANT_MAX}
                        step={1}
                        value={item.slant}
                        format={(v) => `${v}°`}
                        onChange={(v) => onChange({ slant: v })}
                        reset={0}
                    />
                    <SliderField
                        label="Spacing"
                        min={TRACKING_MIN}
                        max={TRACKING_MAX}
                        step={0.01}
                        value={item.tracking}
                        format={(v) => `${Math.round(v * 100)}`}
                        onChange={(v) => onChange({ tracking: v })}
                        reset={0}
                    />
                    <SliderField
                        label="Rotate"
                        min={-90}
                        max={90}
                        step={1}
                        value={item.rotate}
                        format={(v) => `${v}°`}
                        onChange={(v) => onChange({ rotate: v })}
                        reset={0}
                    />
                    <SliderField
                        label="Outline"
                        min={0}
                        max={OUTLINE_MAX}
                        step={0.002}
                        value={item.outline}
                        format={(v) => (v === 0 ? "none" : `${Math.round(v * 1000) / 10}%`)}
                        onChange={(v) => onChange({ outline: v })}
                        reset={0}
                    />
                    <Switch
                        className="self-end"
                        label="Shadow"
                        checked={item.shadow}
                        onChange={(e) => onChange({ shadow: e.currentTarget.checked })}
                        color="var(--mix-ink)"
                    />
                </div>
                {item.outline > 0 && (
                    <div className="mt-3">
                        <p className="mb-1.5 text-sm font-medium">Outline color</p>
                        <ColourRow
                            name="cover-outline"
                            label="Outline color"
                            value={item.outlineColor}
                            onChange={(outlineColor) => onChange({ outlineColor })}
                            photo={photo}
                            palette={palette}
                        />
                    </div>
                )}
            </Collapse>
        </div>
    );
}

// a 3×3 grid of radio tiles for the nine positions
export function PositionGrid({
    name,
    legend,
    info,
    value,
    onChange,
}: {
    name: string;
    legend: string;
    info?: string;
    value: Pos | null;
    onChange: (p: Pos) => void;
}) {
    return (
        <fieldset>
            <legend className="mb-1.5 flex items-center gap-1 text-sm font-medium">
                {legend}
                {info && <Info label={`about ${legend.toLowerCase()}`}>{info}</Info>}
            </legend>
            <div className="grid w-fit grid-cols-3 gap-1">
                {POSITIONS.map((p) => (
                    <Choice
                        key={p}
                        name={name}
                        checked={value === p}
                        onSelect={() => onChange(p)}
                        label={POS_LABEL[p]}
                        className="flex size-8 items-center justify-center rounded-xs"
                    >
                        <span
                            aria-hidden
                            className="size-1.5 rounded-full bg-mark-soft peer-checked:bg-ink"
                        />
                    </Choice>
                ))}
            </div>
        </fieldset>
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
