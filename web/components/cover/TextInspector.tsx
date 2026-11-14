// The selected text item's settings, as rows: face, size and weight, place and turn, color and
// backing. The finer settings are folded under "Fine-tune" until asked for.
import { ReactNode, useState } from "react";
import { Collapse, SegmentedControl, Switch, UnstyledButton } from "@mantine/core";
import { FiChevronDown } from "react-icons/fi";
import {
    MdAlignHorizontalCenter,
    MdAlignHorizontalLeft,
    MdAlignHorizontalRight,
    MdAlignVerticalBottom,
    MdAlignVerticalCenter,
    MdAlignVerticalTop,
} from "react-icons/md";
import {
    alignFor,
    FONT_IDS,
    FONTS,
    OUTLINE_MAX,
    Pos,
    SIZE_MAX,
    SIZE_MIN,
    SLANT_MAX,
    TextItem,
    TRACKING_MAX,
    TRACKING_MIN,
    WIDTH_MAX,
    WIDTH_MIN,
} from "../../lib/canvas";
import { backingOf, BACKINGS, Backing, withBacking } from "../../lib/texts";
import { Choice, ColourDot, Row, SliderField } from "./ui";

type Props = {
    item: TextItem;
    onChange: (update: Partial<TextItem>) => void;
    // the photo's colours and the mix's
    photo: string[];
    palette: string[];
};

// text sizes (percent of the cover's side) the Size control offers; the slider under Fine-tune
// reaches everything between
const SIZES = [
    { value: "5", label: "S" },
    { value: "8", label: "M" },
    { value: "11", label: "L" },
    { value: "15", label: "XL" },
];

const TURNS = [
    { value: "-90", label: "Up" },
    { value: "0", label: "Across" },
    { value: "90", label: "Down" },
];

type Row3 = "t" | "m" | "b";
type Col3 = "l" | "c" | "r";

// the nearest third of the cover, for text dragged off the presets
const third = <T extends string>(v: number, [a, b, c]: [T, T, T]): T =>
    v < 1 / 3 ? a : v < 2 / 3 ? b : c;

export default function TextInspector({ item, onChange, photo, palette }: Props) {
    const spec = FONTS[item.font];
    const backing = backingOf(item);
    const free = item.pos === "free";
    const row: Row3 = free ? third(item.ty, ["t", "m", "b"]) : (item.pos[0] as Row3);
    const col: Col3 = free ? third(item.tx, ["l", "c", "r"]) : (item.pos[1] as Col3);
    // a preset, with the alignment that suits its column
    const place = (r: Row3, c: Col3) => {
        const pos = `${r}${c}` as Pos;
        onChange({ pos, align: alignFor(pos, "left") });
    };

    return (
        <div className="flex flex-col gap-2.5">
            <fieldset>
                <legend className="sr-only">Typeface</legend>
                <div className="grid grid-cols-6 gap-1.5">
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
                            className="flex h-10 items-center justify-center rounded-sm"
                        >
                            <span
                                aria-hidden
                                className="text-lg leading-none"
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
                        </Choice>
                    ))}
                </div>
            </fieldset>

            <Row label="Size">
                <SegmentedControl
                    aria-label="size"
                    size="xs"
                    fullWidth
                    className="grow"
                    value={
                        SIZES.some((s) => Number(s.value) === item.size) ? String(item.size) : ""
                    }
                    onChange={(v) => onChange({ size: Number(v) })}
                    data={SIZES}
                />
            </Row>
            <SliderField
                label="Weight"
                min={spec.weights[0]}
                max={spec.weights[1]}
                step={10}
                value={Math.min(spec.weights[1], Math.max(spec.weights[0], item.weight))}
                format={(v) => String(Math.round(v))}
                onChange={(v) => onChange({ weight: v })}
                reset={spec.weight}
            />
            <Row label="Place">
                <SegmentedControl
                    aria-label="horizontal place"
                    size="xs"
                    className="grow"
                    fullWidth
                    value={free ? "" : col}
                    onChange={(c) => place(row, c as Col3)}
                    data={[
                        {
                            value: "l",
                            label: <Icon label="left">{<MdAlignHorizontalLeft />}</Icon>,
                        },
                        {
                            value: "c",
                            label: <Icon label="center">{<MdAlignHorizontalCenter />}</Icon>,
                        },
                        {
                            value: "r",
                            label: <Icon label="right">{<MdAlignHorizontalRight />}</Icon>,
                        },
                    ]}
                />
                <SegmentedControl
                    aria-label="vertical place"
                    size="xs"
                    className="grow"
                    fullWidth
                    value={free ? "" : row}
                    onChange={(r) => place(r as Row3, col)}
                    data={[
                        { value: "t", label: <Icon label="top">{<MdAlignVerticalTop />}</Icon> },
                        {
                            value: "m",
                            label: <Icon label="middle">{<MdAlignVerticalCenter />}</Icon>,
                        },
                        {
                            value: "b",
                            label: <Icon label="bottom">{<MdAlignVerticalBottom />}</Icon>,
                        },
                    ]}
                />
            </Row>
            {free && (
                <p className="-mt-1 pl-[5.25rem] text-xs text-muted">
                    Placed by hand; pick a place to snap it back.
                </p>
            )}
            <Row label="Turn">
                <SegmentedControl
                    aria-label="turn"
                    size="xs"
                    fullWidth
                    className="grow"
                    value={
                        TURNS.some((t) => Number(t.value) === item.rotate)
                            ? String(item.rotate)
                            : ""
                    }
                    onChange={(v) => onChange({ rotate: Number(v) })}
                    data={TURNS}
                />
            </Row>
            <Row label="Color">
                <ColourDot
                    label="Text color"
                    value={item.color}
                    onChange={(color) => onChange({ color })}
                    photo={photo}
                    palette={palette}
                    auto
                />
            </Row>
            <Row label="Backing">
                <SegmentedControl
                    aria-label="backing"
                    size="xs"
                    fullWidth
                    className="grow"
                    value={backing}
                    onChange={(v) => onChange(withBacking(item, v as Backing, photo[0]))}
                    data={BACKINGS.map((b) => ({ value: b.id, label: b.label }))}
                />
                {backing === "badge" && (
                    <ColourDot
                        label="Badge color"
                        value={item.badge}
                        onChange={(badge) => onChange({ badge })}
                        photo={photo}
                        palette={palette}
                    />
                )}
                {backing === "outline" && (
                    <ColourDot
                        label="Outline color"
                        value={item.outlineColor}
                        onChange={(outlineColor) => onChange({ outlineColor })}
                        photo={photo}
                        palette={palette}
                    />
                )}
            </Row>
            <FineTune item={item} onChange={onChange} />
        </div>
    );
}

// the finer settings, folded away until asked for (or already in use)
function FineTune({ item, onChange }: Pick<Props, "item" | "onChange">) {
    const backing = backingOf(item);
    const [open, setOpen] = useState(
        !SIZES.some((s) => Number(s.value) === item.size) ||
            item.width !== FONTS[item.font].width ||
            item.slant !== 0 ||
            item.tracking !== 0 ||
            !TURNS.some((t) => Number(t.value) === item.rotate),
    );
    return (
        <div>
            <UnstyledButton
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="flex items-center gap-1 py-1 text-sm font-medium"
            >
                Fine-tune
                <FiChevronDown
                    aria-hidden
                    className={`transition-transform ${open ? "rotate-180" : ""}`}
                />
            </UnstyledButton>
            <Collapse expanded={open}>
                <div className="flex flex-col gap-2.5 pt-2">
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
                    {backing === "outline" && (
                        <SliderField
                            label="Outline"
                            min={0.005}
                            max={OUTLINE_MAX}
                            step={0.001}
                            value={item.outline}
                            format={(v) => `${Math.round(v * 1000) / 10}%`}
                            onChange={(v) => onChange({ outline: v })}
                        />
                    )}
                    {backing === "badge" && (
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
                    )}
                    <Row label="Shadow">
                        <Switch
                            aria-label="shadow under the letters"
                            checked={item.shadow}
                            onChange={(e) => onChange({ shadow: e.currentTarget.checked })}
                        />
                    </Row>
                </div>
            </Collapse>
        </div>
    );
}

function Icon({ label, children }: { label: string; children: ReactNode }) {
    return (
        <span className="flex items-center justify-center" title={label}>
            {children}
            <span className="sr-only">{label}</span>
        </span>
    );
}
