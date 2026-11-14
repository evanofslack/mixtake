import { ReactNode } from "react";
import { SegmentedControl, Switch, TextInput } from "@mantine/core";
import { FiAlignCenter, FiAlignLeft, FiAlignRight } from "react-icons/fi";
import {
    Align,
    alignFor,
    FONT_IDS,
    FONTS,
    Pos,
    POSITIONS,
    SIZE_MAX,
    SIZE_MIN,
    TextItem,
} from "../../lib/canvas";
import Info from "../Info";
import { Choice, ColourRow, SectionTitle, SliderField } from "./ui";

type Props = {
    item: TextItem;
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

export default function TextTab({ item, onChange, photo, palette }: Props) {
    return (
        <div className="flex flex-col gap-5">
            <section aria-label="Text">
                <div className="flex flex-col gap-3">
                    <TextInput
                        label="Title"
                        value={item.text}
                        maxLength={120}
                        placeholder="no title"
                        onChange={(e) => onChange({ text: e.currentTarget.value })}
                    />
                    <TextInput
                        label="Subtitle"
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
                    <div className="grid grid-cols-5 gap-1.5">
                        {FONT_IDS.map((id) => (
                            <Choice
                                key={id}
                                name="cover-font"
                                checked={item.font === id}
                                onSelect={() => onChange({ font: id })}
                                label={FONTS[id].label}
                                className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-sm px-1"
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
                    </div>
                </div>
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
