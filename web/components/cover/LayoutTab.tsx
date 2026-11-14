import { ActionIcon, SegmentedControl, Tooltip } from "@mantine/core";
import { FiRotateCcw } from "react-icons/fi";
import { CoverState, Frame, ZOOM_MAX } from "../../lib/canvas";
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
import Info from "../Info";
import { PositionGrid } from "./TextTab";
import { Choice, SectionTitle, SliderField } from "./ui";

type Props = {
    state: CoverState;
    onLayout: (id: LayoutId) => void;
    onFrame: (frame: Frame) => void;
    onZoom: (zoom: number) => void;
    onResetCrop: () => void;
};

export default function LayoutTab({ state, onLayout, onFrame, onZoom, onResetCrop }: Props) {
    const { frame } = state;
    const current = layoutOf(frame);
    const shape = shapeOf(frame);
    return (
        <div className="flex flex-col gap-5">
            <section aria-label="Layouts">
                <SectionTitle>Layout</SectionTitle>
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
            </section>

            <section aria-label="Photo">
                <SectionTitle>Photo</SectionTitle>
                <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
                    <PositionGrid
                        name="cover-frame-pos"
                        legend="Position"
                        value={frameSize(frame) < 1 ? anchorOf(frame) : null}
                        onChange={(anchor) => onFrame(reframe(frame, { anchor }))}
                    />
                    <div className="flex min-w-48 grow flex-col gap-3">
                        <div>
                            <p className="mb-1.5 text-sm font-medium" id="cover-shape">
                                Shape
                            </p>
                            <SegmentedControl
                                aria-labelledby="cover-shape"
                                size="xs"
                                fullWidth
                                value={shape ?? ""}
                                onChange={(v) => onFrame(reframe(frame, { shape: v as Shape }))}
                                data={SHAPES.map((s) => ({ value: s.id, label: s.label }))}
                            />
                        </div>
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
                    </div>
                </div>
            </section>

            <section aria-label="Crop">
                <SectionTitle>Crop</SectionTitle>
                <SliderField
                    label="Zoom"
                    min={1}
                    max={ZOOM_MAX}
                    step={0.01}
                    value={state.zoom}
                    format={(v) => `${v.toFixed(1)}×`}
                    onChange={onZoom}
                    reset={1}
                />
                <div className="mt-2 flex items-center gap-1">
                    <Info label="how to crop">Drag the photo to move it</Info>
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
                </div>
            </section>
        </div>
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
