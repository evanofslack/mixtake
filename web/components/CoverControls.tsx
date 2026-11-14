import { SegmentedControl } from "@mantine/core";
import type { Photo } from "../lib/api";
import { CoverState, DARK, Fill, TextItem, WHITE } from "../lib/canvas";
import { photoColours, pickPair } from "../lib/colours";
import { LayoutId, LAYOUTS } from "../lib/layouts";
import CoverPanel, { Reveal } from "./cover/CoverPanel";
import TextInspector from "./cover/TextInspector";
import TextLayers from "./cover/TextLayers";

// the cover as a whole (layout, photo, background), or its text items
export type Mode = "cover" | "text";

type Props = {
    state: CoverState;
    photo: Photo | null;
    // the colours the mix's photos were ranked towards
    palette: string[];
    // every edit goes through here, so the studio can keep the crop inside the photo
    onEdit: (fn: (s: CoverState) => CoverState) => void;
    mode: Mode;
    onMode: (mode: Mode) => void;
    // a section of the Cover mode that a click on the preview asked for
    reveal: Reveal | null;
    // the text item the Text tab edits
    selected: string | null;
    onSelect: (id: string) => void;
};

// the editor's settings, in two modes: the cover as a whole, and its text items
export default function CoverControls({
    state,
    photo,
    palette,
    onEdit,
    mode,
    onMode,
    reveal,
    selected,
    onSelect,
}: Props) {
    const fromPhoto = photoColours(photo?.colors ?? [], [WHITE, DARK]);
    const mixColours = palette.map((h) => h.toLowerCase());
    const pool = [...fromPhoto, ...mixColours];
    const index = state.texts.findIndex((t) => t.id === selected);
    const item = state.texts[index];

    const onItem = (u: Partial<TextItem>) =>
        item &&
        onEdit((s) => ({
            ...s,
            texts: s.texts.map((t) => (t.id === item.id ? { ...t, ...u } : t)),
        }));
    const shuffled = (bg: Fill): Fill => {
        const [a, b] = pickPair(pool);
        return { ...bg, a, b };
    };
    // a preset keeps the background, which starts white
    const applyLayout = (id: LayoutId) => {
        const l = LAYOUTS.find((x) => x.id === id)!;
        onEdit((s) => ({
            ...s,
            frame: l.frame,
            texts: l.text ? s.texts.map((t, i) => (i === 0 ? { ...t, ...l.text } : t)) : s.texts,
        }));
    };

    return (
        <div>
            <SegmentedControl
                aria-label="edit"
                fullWidth
                className="mb-4"
                value={mode}
                onChange={(v) => onMode(v as Mode)}
                data={[
                    { value: "cover", label: "Cover" },
                    { value: "text", label: "Text" },
                ]}
            />
            {mode === "cover" ? (
                <CoverPanel
                    state={state}
                    onLayout={applyLayout}
                    onFrame={(frame) => onEdit((s) => ({ ...s, frame }))}
                    onZoom={(zoom) => onEdit((s) => ({ ...s, zoom }))}
                    onResetCrop={() => onEdit((s) => ({ ...s, x: 0.5, y: 0.5, zoom: 1 }))}
                    onFill={(bg) => onEdit((s) => ({ ...s, bg }))}
                    onShuffleFill={() => onEdit((s) => ({ ...s, bg: shuffled(s.bg) }))}
                    reveal={reveal}
                    photo={fromPhoto}
                    palette={mixColours}
                />
            ) : (
                <TextLayers
                    texts={state.texts}
                    selected={item?.id ?? null}
                    onSelect={onSelect}
                    onEdit={onEdit}
                >
                    {item && (
                        <TextInspector
                            key={item.id}
                            item={item}
                            onChange={onItem}
                            photo={fromPhoto}
                            palette={mixColours}
                        />
                    )}
                </TextLayers>
            )}
        </div>
    );
}
