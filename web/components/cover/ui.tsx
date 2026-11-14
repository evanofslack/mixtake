// Small pieces shared by the cover studio's tabs.
import { ReactNode, useEffect, useId, useState } from "react";
import {
    Accordion,
    ActionIcon,
    ColorPicker,
    Popover,
    Slider,
    TextInput,
    Tooltip,
    UnstyledButton,
} from "@mantine/core";
import { FiShuffle } from "react-icons/fi";
import { LuPipette } from "react-icons/lu";
import { DARK, LIGHT, luminance, WHITE } from "../../lib/canvas";

// a radio button drawn as a tile: arrow keys move within its group, like any radio group
export function Choice({
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

export function Dot({ hex }: { hex: string }) {
    return (
        <span
            className="block size-full rounded-full border border-black/10"
            style={{ background: hex }}
        />
    );
}

// a slider in a row, with its value on the right; double-clicking the label resets it
export function SliderField({
    label,
    value,
    min,
    max,
    step,
    format,
    onChange,
    reset,
    extra,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    onChange: (v: number) => void;
    reset?: number;
    // beside the value, e.g. a reset button
    extra?: ReactNode;
}) {
    const id = useId();
    return (
        <Row
            label={
                <span
                    className="select-none"
                    id={id}
                    onDoubleClick={reset !== undefined ? () => onChange(reset) : undefined}
                    title={reset !== undefined ? "double-click to reset" : undefined}
                >
                    {label}
                </span>
            }
        >
            <Slider
                className="grow"
                aria-labelledby={id}
                thumbLabel={label.toLowerCase()}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={onChange}
                label={format}
                color="var(--mix-ink)"
            />
            <span className="w-10 shrink-0 text-right text-xs text-muted tabular-nums">
                {format(value)}
            </span>
            {extra}
        </Row>
    );
}

// a fold of the cover panel: a plain heading with a hairline above, and an optional shuffle
export function Section({
    value,
    title,
    onShuffle,
    children,
}: {
    value: string;
    title: string;
    onShuffle?: () => void;
    children: ReactNode;
}) {
    return (
        <Accordion.Item value={value} id={`cover-section-${value}`}>
            <div className="flex items-center gap-1">
                <Accordion.Control className="flex-1">{title}</Accordion.Control>
                {onShuffle && (
                    <Tooltip label={`shuffle ${title.toLowerCase()}`} withArrow>
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label={`shuffle ${title.toLowerCase()}`}
                            onClick={onShuffle}
                        >
                            <FiShuffle size="0.9rem" aria-hidden />
                        </ActionIcon>
                    </Tooltip>
                )}
            </div>
            <Accordion.Panel>
                <div className="flex flex-col gap-3 pb-3">{children}</div>
            </Accordion.Panel>
        </Accordion.Item>
    );
}

// the classes for an Accordion of Sections: plain headings split by engraved rules
export const SECTIONS_CLASSES = {
    control: "bg-transparent px-0 font-semibold hover:bg-transparent",
    chevron: "text-muted",
    label: "py-3 text-sm",
    content: "px-0",
    item: "groove-t border-b-0",
};

// one setting: its label in a narrow column on the left, the control filling the rest, so every
// setting in the panel lines up the same way
export function Row({
    label,
    children,
    className = "",
}: {
    label: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`grid min-h-8 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 ${className}`}
        >
            <span className="text-sm font-medium">{label}</span>
            <div className="flex min-w-0 items-center gap-2">{children}</div>
        </div>
    );
}

// what a colour value is called, for its swatch's label
function colourName(hex: string): string {
    return hex === "auto"
        ? "auto light or dark"
        : hex === WHITE
          ? "white"
          : hex === DARK
            ? "black"
            : hex;
}

function Swatch({ hex }: { hex: string }) {
    return hex === "auto" ? (
        <span
            className="block size-full rounded-full border border-black/10"
            style={{ background: `linear-gradient(135deg, ${LIGHT} 50%, ${DARK} 50%)` }}
        />
    ) : (
        <Dot hex={hex} />
    );
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

// how many of the photo's and the mix's colours a row offers
const FEW = 3;

// a colour setting as one row of swatches: white and black, a few of the photo's colours, a few
// of the mix's, then an eyedropper that opens a picker for any other colour
export function ColourRow({
    label,
    value,
    onChange,
    photo,
    palette,
    auto,
}: {
    label: string;
    value: string;
    onChange: (hex: string) => void;
    photo: string[];
    palette: string[];
    auto?: boolean;
}) {
    const [opened, setOpened] = useState(false);
    const name = useId();
    const basics = [...(auto ? ["auto"] : []), WHITE, DARK];
    const fromPhoto = photo.filter((h) => !basics.includes(h)).slice(0, FEW);
    const fromMix = palette
        .map((h) => h.toLowerCase())
        .filter((h) => !basics.includes(h) && !fromPhoto.includes(h))
        .slice(0, FEW);
    const known = new Set([...basics, ...fromPhoto, ...fromMix]);
    const custom = known.has(value) ? null : value;

    const group = (title: string, hexes: string[]) =>
        hexes.length > 0 && (
            <div role="group" aria-label={title} className="flex items-center gap-1">
                {hexes.map((hex) => (
                    <Choice
                        key={hex}
                        name={name}
                        checked={value === hex}
                        onSelect={() => onChange(hex)}
                        label={colourName(hex)}
                        className="size-6 shrink-0 rounded-full p-0.5"
                        round
                    >
                        <Swatch hex={hex} />
                    </Choice>
                ))}
            </div>
        );

    return (
        <fieldset className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <legend className="sr-only">{label}</legend>
            {group("basics", basics)}
            {group("from the photo", fromPhoto)}
            {group("from the mix", fromMix)}
            <Popover
                opened={opened}
                onChange={setOpened}
                position="bottom-end"
                width={236}
                closeOnEscape
                returnFocus
            >
                <Popover.Target>
                    <Tooltip label="custom color" withArrow disabled={opened}>
                        <UnstyledButton
                            onClick={() => setOpened((o) => !o)}
                            aria-label={`custom ${label.toLowerCase()}${custom ? `: ${custom}` : ""}`}
                            aria-haspopup="dialog"
                            aria-expanded={opened}
                            className={`flex size-6 shrink-0 items-center justify-center rounded-full shadow-raised-sm transition-shadow active:shadow-pressed-sm ${
                                custom ? "shadow-pressed-sm ring-1 ring-ink" : ""
                            }`}
                            style={
                                custom
                                    ? {
                                          background: custom,
                                          color: luminance(custom) > 0.4 ? DARK : WHITE,
                                      }
                                    : undefined
                            }
                        >
                            <LuPipette size="0.8rem" aria-hidden />
                        </UnstyledButton>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown aria-label={`custom ${label.toLowerCase()}`} className="p-3">
                    <CustomColour
                        label={`custom ${label.toLowerCase()}`}
                        value={custom ?? (value.startsWith("#") ? value : WHITE)}
                        onPick={onChange}
                    />
                </Popover.Dropdown>
            </Popover>
        </fieldset>
    );
}

// any colour: dragged on the picker, typed as hex, or taken from the screen where the browser has
// an eyedropper. The hex field keeps its own text while typing and commits a complete hex.
function CustomColour({
    label,
    value,
    onPick,
}: {
    label: string;
    value: string;
    onPick: (hex: string) => void;
}) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    const commit = (v: string) => {
        const hex = v.startsWith("#") ? v : `#${v}`;
        if (/^#[0-9a-f]{6}$/i.test(hex)) {
            onPick(hex.toLowerCase());
        }
    };
    const [dropper, setDropper] = useState<EyeDropperCtor | null>(null);
    useEffect(() => {
        const ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
        setDropper(() => ctor ?? null);
    }, []);
    return (
        <div className="flex flex-col gap-2">
            <ColorPicker
                size="xs"
                format="hex"
                fullWidth
                value={value}
                onChange={(v) => onPick(v.toLowerCase())}
                aria-label={label}
            />
            <div className="flex items-center gap-1.5">
                <TextInput
                    size="xs"
                    className="grow"
                    aria-label={`${label} hex`}
                    value={draft}
                    onChange={(e) => setDraft(e.currentTarget.value)}
                    onBlur={() => commit(draft)}
                    onKeyDown={(e) => e.key === "Enter" && commit(draft)}
                />
                {dropper && (
                    <Tooltip label="pick from the screen" withArrow>
                        <ActionIcon
                            variant="default"
                            size="md"
                            aria-label="pick a colour from the screen"
                            onClick={() =>
                                new dropper()
                                    .open()
                                    .then((r) => commit(r.sRGBHex))
                                    .catch(() => {})
                            }
                        >
                            <LuPipette aria-hidden />
                        </ActionIcon>
                    </Tooltip>
                )}
            </div>
        </div>
    );
}
