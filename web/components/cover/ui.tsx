// Small pieces shared by the cover studio's tabs.
import { ReactNode, useEffect, useId, useState } from "react";
import { ColorInput, Slider } from "@mantine/core";
import { DARK, LIGHT } from "../../lib/canvas";

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

export function SectionTitle({ children }: { children: ReactNode }) {
    return (
        <h3 className="mb-2 text-xs font-medium tracking-wider text-muted uppercase">{children}</h3>
    );
}

// a labelled slider that shows its value; double-clicking the label resets it
export function SliderField({
    label,
    value,
    min,
    max,
    step,
    format,
    onChange,
    reset,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
    onChange: (v: number) => void;
    reset?: number;
}) {
    const id = useId();
    return (
        <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
                <p
                    className="text-sm font-medium select-none"
                    id={id}
                    onDoubleClick={reset !== undefined ? () => onChange(reset) : undefined}
                    title={reset !== undefined ? "double-click to reset" : undefined}
                >
                    {label}
                </p>
                <span className="text-xs text-muted tabular-nums">{format(value)}</span>
            </div>
            <Slider
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
        </div>
    );
}

// a row of colour swatches: optionally "auto", white and black, the photo's colours, the mix's,
// and a field for any other colour
export function ColourRow({
    name,
    label,
    value,
    onChange,
    photo,
    palette,
    auto,
}: {
    name: string;
    label: string;
    value: string;
    onChange: (hex: string) => void;
    photo: string[];
    palette: string[];
    auto?: boolean;
}) {
    const fromMix = palette.map((h) => h.toLowerCase()).filter((h) => !photo.includes(h));
    const known = new Set(["auto", LIGHT, DARK, ...photo, ...fromMix]);
    const custom = known.has(value) ? null : value;
    const swatch = (hex: string, title: string, body: ReactNode) => (
        <Choice
            key={hex}
            name={name}
            checked={value === hex}
            onSelect={() => onChange(hex)}
            label={title}
            className="size-7 rounded-full p-0.5"
            round
        >
            {body}
        </Choice>
    );
    return (
        <div className="flex flex-col gap-2.5">
            <fieldset>
                <legend className="sr-only">{label}</legend>
                <div className="flex flex-wrap items-center gap-1.5">
                    {auto &&
                        swatch(
                            "auto",
                            "auto light or dark",
                            <span
                                className="block size-full rounded-full"
                                style={{
                                    background: `linear-gradient(135deg, ${LIGHT} 50%, ${DARK} 50%)`,
                                }}
                            />,
                        )}
                    {[LIGHT, DARK, ...photo].map((hex) =>
                        swatch(
                            hex,
                            hex === LIGHT ? "white" : hex === DARK ? "black" : hex,
                            <Dot hex={hex} />,
                        ),
                    )}
                    {fromMix.length > 0 && (
                        <span aria-hidden className="mx-1 h-5 w-px bg-line-strong" />
                    )}
                    {fromMix.map((hex) => swatch(hex, `${hex} from the mix`, <Dot hex={hex} />))}
                </div>
            </fieldset>
            <CustomColour
                label={`custom ${label.toLowerCase()}`}
                custom={custom}
                swatches={[...photo, ...fromMix]}
                onPick={onChange}
            />
        </div>
    );
}

// any color: typed, picked, or taken from the screen with the eyedropper (where the browser has
// one). The field keeps its own text while typing and commits a complete hex.
function CustomColour({
    label,
    custom,
    swatches,
    onPick,
}: {
    label: string;
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
            aria-label={label}
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
