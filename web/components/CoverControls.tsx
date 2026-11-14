import { ReactNode, useEffect, useState } from "react";
import {
    Accordion,
    ActionIcon,
    ColorInput,
    SegmentedControl,
    Slider,
    Switch,
    TextInput,
    Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { FiAlignCenter, FiAlignLeft, FiAlignRight, FiRotateCcw } from "react-icons/fi";
import type { Photo } from "../lib/api";
import { photoColours } from "../lib/colours";
import Info from "./Info";
import {
    Align,
    alignFor,
    CoverState,
    DARK,
    FONT_IDS,
    FONTS,
    LIGHT,
    Pos,
    POSITIONS,
    SIZE_MAX,
    SIZE_MIN,
    TextItem,
    ZOOM_MAX,
} from "../lib/canvas";

type Props = {
    state: CoverState;
    photo: Photo | null;
    // the colours the mix's photos were ranked towards
    palette: string[];
    onChange: (update: Partial<CoverState>) => void;
    onText: (id: string, update: Partial<TextItem>) => void;
    onZoom: (zoom: number) => void;
};

// the controls for one text item
type ItemProps = { item: TextItem; onChange: (update: Partial<TextItem>) => void };

const POS_LABEL: Record<Pos, string> = {
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

// the editor's settings: stacked beside the preview on wide screens, an accordion on phones
export default function CoverControls({ state, photo, palette, onChange, onText, onZoom }: Props) {
    const wide = useMediaQuery("(min-width: 64em)", false);
    const item = state.texts[0];
    const onItem = (u: Partial<TextItem>) => item && onText(item.id, u);
    const sections: { value: string; label: string; body: ReactNode }[] = [
        ...(item
            ? [
                  {
                      value: "text",
                      label: "Text",
                      body: <TextSection item={item} onChange={onItem} />,
                  },
                  {
                      value: "type",
                      label: "Type",
                      body: <TypeSection item={item} onChange={onItem} />,
                  },
                  {
                      value: "colour",
                      label: "Color",
                      body: (
                          <ColourSection
                              item={item}
                              photo={photo}
                              palette={palette}
                              onChange={onItem}
                          />
                      ),
                  },
              ]
            : []),
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

function TextSection({ item, onChange }: ItemProps) {
    return (
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
    );
}

function TypeSection({ item, onChange }: ItemProps) {
    return (
        <div className="flex flex-col gap-4">
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

            <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
                <fieldset>
                    <legend className="mb-1.5 flex items-center gap-1 text-sm font-medium">
                        Position
                        <Info label="about position">Or drag the text on the cover</Info>
                    </legend>
                    <div className="grid w-fit grid-cols-3 gap-1">
                        {POSITIONS.map((p) => (
                            <Choice
                                key={p}
                                name="cover-pos"
                                checked={item.pos === p}
                                // follow the column; the alignment control can override it
                                onSelect={() => onChange({ pos: p, align: alignFor(p, "left") })}
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

                <div className="min-w-40 grow">
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
                                label: <AlignLabel icon={<FiAlignCenter />} name="center" />,
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
                        value={item.size}
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

function ColourSection({
    item,
    photo,
    palette,
    onChange,
}: ItemProps & Pick<Props, "photo" | "palette">) {
    const fromPhoto = photoColours(photo?.colors ?? [], [LIGHT, DARK]);
    const fromMix = palette.map((h) => h.toLowerCase()).filter((h) => !fromPhoto.includes(h));
    const known = new Set(["auto", LIGHT, DARK, ...fromPhoto, ...fromMix]);
    const custom = known.has(item.color) ? null : item.color;
    return (
        <div className="flex flex-col gap-2.5">
            <fieldset>
                <legend className="sr-only">Text color</legend>
                <div className="flex flex-wrap items-center gap-1.5">
                    <Swatch value="auto" label="auto light or dark" item={item} onChange={onChange}>
                        <span
                            className="block size-full rounded-full"
                            style={{
                                background: `linear-gradient(135deg, ${LIGHT} 50%, ${DARK} 50%)`,
                            }}
                        />
                    </Swatch>
                    {[LIGHT, DARK, ...fromPhoto].map((hex) => (
                        <Swatch
                            key={hex}
                            value={hex}
                            label={hex === LIGHT ? "white" : hex === DARK ? "black" : hex}
                            item={item}
                            onChange={onChange}
                        >
                            <Dot hex={hex} />
                        </Swatch>
                    ))}
                    {fromMix.length > 0 && (
                        <span aria-hidden className="mx-1 h-5 w-px bg-line-strong" />
                    )}
                    {fromMix.map((hex) => (
                        <Swatch
                            key={hex}
                            value={hex}
                            label={`${hex} from the mix`}
                            item={item}
                            onChange={onChange}
                        >
                            <Dot hex={hex} />
                        </Swatch>
                    ))}
                </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <CustomColour
                    custom={custom}
                    swatches={[...fromPhoto, ...fromMix]}
                    onPick={(hex) => onChange({ color: hex })}
                />
                <Switch
                    label="Shade"
                    checked={item.scrim}
                    onChange={(e) => onChange({ scrim: e.currentTarget.checked })}
                    color="var(--mix-ink)"
                />
            </div>
        </div>
    );
}

// any color: typed, picked, or taken from the screen with the eyedropper (where the browser has
// one). The field keeps its own text while typing and commits a complete hex.
function CustomColour({
    custom,
    swatches,
    onPick,
}: {
    custom: string | null;
    swatches: string[];
    onPick: (hex: string) => void;
}) {
    const [draft, setDraft] = useState(custom ?? "");
    useEffect(() => setDraft(custom ?? ""), [custom]);
    const commit = (v: string) => {
        if (/^#[0-9a-f]{6}$/i.test(v)) {
            onPick(v.toLowerCase());
        }
    };
    return (
        <ColorInput
            size="xs"
            className="max-w-48"
            aria-label="custom text color"
            placeholder="custom #hex"
            format="hex"
            value={draft}
            onChange={setDraft}
            onChangeEnd={commit}
            onBlur={() => commit(draft)}
            swatches={swatches}
            swatchesPerRow={7}
            eyeDropperButtonProps={{ "aria-label": "pick a color from the screen" }}
            styles={
                custom
                    ? { input: { boxShadow: "var(--mix-pressed), 0 0 0 1.5px var(--mix-ink)" } }
                    : undefined
            }
        />
    );
}

function Swatch({
    value,
    label,
    item,
    onChange,
    children,
}: {
    value: string;
    label: string;
    item: TextItem;
    onChange: (u: Partial<TextItem>) => void;
    children: ReactNode;
}) {
    return (
        <Choice
            name="cover-colour"
            checked={item.color === value}
            onSelect={() => onChange({ color: value })}
            label={label}
            className="size-7 rounded-full p-0.5"
            round
        >
            {children}
        </Choice>
    );
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
            <div className="mt-2 flex items-center gap-1">
                <Info label="how to crop">Drag the photo to move it</Info>
                <Tooltip label="reset crop" withArrow>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label="reset crop"
                        onClick={() => onChange({ x: 0.5, y: 0.5, zoom: 1 })}
                        disabled={state.zoom === 1 && state.x === 0.5 && state.y === 0.5}
                    >
                        <FiRotateCcw aria-hidden />
                    </ActionIcon>
                </Tooltip>
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
            className={`relative cursor-pointer shadow-raised-sm transition-shadow has-checked:shadow-pressed-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink ${round ? "has-checked:ring-1 has-checked:ring-ink" : ""} ${className}`}
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
