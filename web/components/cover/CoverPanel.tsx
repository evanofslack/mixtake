// The Cover mode: everything that isn't text, as folds. Layout presets, then the photo (crop, and
// its frame when inset), then the background, which only exists while the photo is inset.
import { useEffect, useState } from "react";
import { Accordion, ActionIcon, Button, SegmentedControl, Tooltip } from "@mantine/core";
import { FiRepeat, FiRotateCcw } from "react-icons/fi";
import { cssFill, CoverState, Fill, FillKind, Frame, Pos, ZOOM_MAX } from "../../lib/canvas";
import {
    anchorOf,
    FRAME_MIN,
    frameSize,
    Layout,
    LayoutId,
    layoutOf,
    LAYOUTS,
    RADIUS_MAX,
    reframe,
    Shape,
    shapeOf,
    SHAPES,
} from "../../lib/layouts";
import { Choice, ColourDot, Row, Section, SECTIONS_CLASSES, SliderField } from "./ui";

export type CoverSection = "layout" | "photo" | "background";

// a click on the preview asks for a section; n changes on every click, so a repeat still opens it
export type Reveal = { section: CoverSection; n: number };

const OPEN: CoverSection[] = ["layout", "photo", "background"];
// phones open only the presets, to keep the page short
const PHONE_OPEN: CoverSection[] = ["layout"];

const KINDS: { id: FillKind; label: string }[] = [
    { id: "solid", label: "Solid" },
    { id: "horizontal", label: "Horizontal" },
    { id: "vertical", label: "Vertical" },
    { id: "radial", label: "Radial" },
    { id: "diagonal", label: "Diagonal" },
];

type Props = {
    state: CoverState;
    onLayout: (id: LayoutId) => void;
    onFrame: (frame: Frame) => void;
    onZoom: (zoom: number) => void;
    onResetCrop: () => void;
    onFill: (bg: Fill) => void;
    onShuffleFill: () => void;
    reveal: Reveal | null;
    // the photo's colours and the mix's
    photo: string[];
    palette: string[];
};

export default function CoverPanel({
    state,
    onLayout,
    onFrame,
    onZoom,
    onResetCrop,
    onFill,
    onShuffleFill,
    reveal,
    photo,
    palette,
}: Props) {
    const { frame, bg } = state;
    const inset = frameSize(frame) < 1;
    const [open, setOpen] = useState<string[]>(OPEN);

    useEffect(() => {
        if (window.matchMedia("(max-width: 1023px)").matches) {
            setOpen(PHONE_OPEN);
        }
    }, []);

    // a click on the photo or the background opens its fold and brings it into view
    useEffect(() => {
        if (!reveal) {
            return;
        }
        setOpen((o) => (o.includes(reveal.section) ? o : [...o, reveal.section]));
        document
            .getElementById(`cover-section-${reveal.section}`)
            ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [reveal]);

    const current = layoutOf(frame);
    const gradient = bg.kind !== "solid";
    return (
        <Accordion
            multiple
            value={open}
            onChange={setOpen}
            chevronPosition="left"
            classNames={SECTIONS_CLASSES}
        >
            <Section value="layout" title="Layout">
                <fieldset>
                    <legend className="sr-only">Layout</legend>
                    <div className="grid grid-cols-5 gap-1.5">
                        {LAYOUTS.map((l) => (
                            <Choice
                                key={l.id}
                                name="cover-layout"
                                checked={current === l.id}
                                onSelect={() => onLayout(l.id)}
                                label={l.label}
                                className="flex flex-col items-center gap-1 rounded-sm px-1 pt-2 pb-1.5"
                            >
                                <Thumb layout={l} />
                                <span className="text-[0.68rem] text-muted">{l.label}</span>
                            </Choice>
                        ))}
                    </div>
                </fieldset>
            </Section>

            <Section value="photo" title="Photo">
                <SliderField
                    label="Zoom"
                    min={1}
                    max={ZOOM_MAX}
                    step={0.01}
                    value={state.zoom}
                    format={(v) => `${v.toFixed(1)}×`}
                    onChange={onZoom}
                    reset={1}
                    extra={
                        <Tooltip label="reset crop" withArrow>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="reset crop"
                                onClick={onResetCrop}
                                disabled={state.zoom === 1 && state.x === 0.5 && state.y === 0.5}
                            >
                                <FiRotateCcw aria-hidden />
                            </ActionIcon>
                        </Tooltip>
                    }
                />
                <p className="text-xs text-muted">Drag the photo on the cover to move it.</p>
                {inset ? (
                    <FrameControls frame={frame} onFrame={onFrame} />
                ) : (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                        <span>The photo fills the cover.</span>
                        <Button
                            size="compact-xs"
                            variant="default"
                            onClick={() => onLayout("inset")}
                        >
                            Inset photo
                        </Button>
                    </div>
                )}
            </Section>

            {inset && (
                <Section value="background" title="Background" onShuffle={onShuffleFill}>
                    <fieldset>
                        <legend className="sr-only">Fill</legend>
                        <div className="grid grid-cols-5 gap-1.5">
                            {KINDS.map((k) => (
                                <Choice
                                    key={k.id}
                                    name="cover-fill"
                                    checked={bg.kind === k.id}
                                    onSelect={() => onFill({ ...bg, kind: k.id })}
                                    label={k.label}
                                    className="flex flex-col items-center gap-1 rounded-sm px-1 pt-2 pb-1.5"
                                >
                                    <span
                                        aria-hidden
                                        className="block size-6 rounded-full border border-black/10"
                                        style={{ background: cssFill({ ...bg, kind: k.id }) }}
                                    />
                                    <span className="text-[0.68rem] text-muted">{k.label}</span>
                                </Choice>
                            ))}
                        </div>
                    </fieldset>
                    <Row label={gradient ? "Colors" : "Color"}>
                        <ColourDot
                            label={gradient ? "Start color" : "Background color"}
                            value={bg.a}
                            onChange={(a) => onFill({ ...bg, a })}
                            photo={photo}
                            palette={palette}
                        />
                        {gradient && (
                            <>
                                <Tooltip label="swap colors" withArrow>
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        size="sm"
                                        aria-label="swap colors"
                                        onClick={() => onFill({ ...bg, a: bg.b, b: bg.a })}
                                    >
                                        <FiRepeat aria-hidden />
                                    </ActionIcon>
                                </Tooltip>
                                <ColourDot
                                    label="End color"
                                    value={bg.b}
                                    onChange={(b) => onFill({ ...bg, b })}
                                    photo={photo}
                                    palette={palette}
                                />
                            </>
                        )}
                    </Row>
                </Section>
            )}
        </Accordion>
    );
}

// an inset photo's shape, size, corners and place. An anchored frame's longer side has equal
// margins, so it can only move along its shorter side: a wide frame up and down, a tall one left
// and right, and a square not at all.
function FrameControls({ frame, onFrame }: { frame: Frame; onFrame: (f: Frame) => void }) {
    const shape = shapeOf(frame);
    const anchor = anchorOf(frame);
    const wide = frame.w > frame.h + 0.001;
    const tall = frame.h > frame.w + 0.001;
    return (
        <>
            <Row label="Shape">
                <SegmentedControl
                    aria-label="photo shape"
                    size="xs"
                    fullWidth
                    className="grow"
                    value={shape ?? ""}
                    onChange={(v) => onFrame(reframe(frame, { shape: v as Shape }))}
                    data={SHAPES.map((s) => ({ value: s.id, label: s.label }))}
                />
            </Row>
            {wide && (
                <Row label="Place">
                    <SegmentedControl
                        aria-label="photo place"
                        size="xs"
                        fullWidth
                        className="grow"
                        value={anchor?.[0] ?? ""}
                        onChange={(v) => onFrame(reframe(frame, { anchor: `${v}c` as Pos }))}
                        data={[
                            { value: "t", label: "Top" },
                            { value: "m", label: "Middle" },
                            { value: "b", label: "Bottom" },
                        ]}
                    />
                </Row>
            )}
            {tall && (
                <Row label="Place">
                    <SegmentedControl
                        aria-label="photo place"
                        size="xs"
                        fullWidth
                        className="grow"
                        value={anchor?.[1] ?? ""}
                        onChange={(v) => onFrame(reframe(frame, { anchor: `m${v}` as Pos }))}
                        data={[
                            { value: "l", label: "Left" },
                            { value: "c", label: "Center" },
                            { value: "r", label: "Right" },
                        ]}
                    />
                </Row>
            )}
            <SliderField
                label="Size"
                min={FRAME_MIN}
                max={1}
                step={0.01}
                value={frameSize(frame)}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(size) => onFrame(reframe(frame, { size }))}
                reset={1}
            />
            <SliderField
                label="Corners"
                min={0}
                max={RADIUS_MAX}
                step={0.005}
                value={frame.radius}
                format={(v) => `${Math.round(v * 200)}%`}
                onChange={(radius) => onFrame({ ...frame, radius })}
                reset={0}
            />
        </>
    );
}

// a tiny drawing of a layout: the cover, the photo and a bar where the title goes
function Thumb({ layout }: { layout: Layout }) {
    const f = layout.frame;
    const pos = layout.text?.pos ?? "bl";
    const row = pos[0];
    const col = pos[1];
    return (
        <span aria-hidden className="relative block size-9 rounded-[2px] bg-line-strong/60">
            <span
                className="absolute bg-mark-soft"
                style={{
                    left: `${(f.x - f.w / 2) * 100}%`,
                    top: `${(f.y - f.h / 2) * 100}%`,
                    width: `${f.w * 100}%`,
                    height: `${f.h * 100}%`,
                    borderRadius: f.radius > 0 ? 2 : 0,
                }}
            />
            <span
                className="absolute h-[3px] w-[40%] rounded-full bg-ink"
                style={{
                    top: row === "t" ? "9%" : row === "m" ? "48%" : undefined,
                    bottom: row === "b" ? "9%" : undefined,
                    left: col === "l" ? "10%" : col === "c" ? "30%" : undefined,
                    right: col === "r" ? "10%" : undefined,
                }}
            />
        </span>
    );
}
