import { useState } from "react";
import { Tabs } from "@mantine/core";
import type { Photo } from "../lib/api";
import { CoverState, DARK, DEFAULT_FILL, Fill, LIGHT, TextItem } from "../lib/canvas";
import { photoColours, pickPair } from "../lib/colours";
import { LayoutId, LAYOUTS } from "../lib/layouts";
import BackgroundTab from "./cover/BackgroundTab";
import LayoutTab from "./cover/LayoutTab";
import TextTab from "./cover/TextTab";

export type Tab = "layout" | "background" | "text";

type Props = {
    state: CoverState;
    photo: Photo | null;
    // the colours the mix's photos were ranked towards
    palette: string[];
    // every edit goes through here, so the studio can keep the crop inside the photo
    onEdit: (fn: (s: CoverState) => CoverState) => void;
};

// the editor's settings, in three tabs: the layout and photo, the background, the text
export default function CoverControls({ state, photo, palette, onEdit }: Props) {
    const [tab, setTab] = useState<Tab>("text");
    const fromPhoto = photoColours(photo?.colors ?? [], [LIGHT, DARK]);
    const mixColours = palette.map((h) => h.toLowerCase());
    const pool = [...fromPhoto, ...mixColours];
    const item = state.texts[0];

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
    // a framed layout over the untouched default background takes its colours from the photo
    const applyLayout = (id: LayoutId) => {
        const l = LAYOUTS.find((x) => x.id === id)!;
        onEdit((s) => {
            const framed = l.frame.w < 1 || l.frame.h < 1;
            const untouched =
                s.bg.kind === DEFAULT_FILL.kind &&
                s.bg.a === DEFAULT_FILL.a &&
                s.bg.b === DEFAULT_FILL.b;
            return {
                ...s,
                frame: l.frame,
                bg: framed && untouched && pool.length ? shuffled(s.bg) : s.bg,
                texts: l.text
                    ? s.texts.map((t, i) => (i === 0 ? { ...t, ...l.text } : t))
                    : s.texts,
            };
        });
    };

    return (
        <Tabs value={tab} onChange={(v) => v && setTab(v as Tab)} keepMounted={false}>
            <Tabs.List grow className="mb-4">
                <Tabs.Tab value="layout">Layout</Tabs.Tab>
                <Tabs.Tab value="background">Background</Tabs.Tab>
                <Tabs.Tab value="text">Text</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="layout">
                <LayoutTab
                    state={state}
                    onLayout={applyLayout}
                    onFrame={(frame) => onEdit((s) => ({ ...s, frame }))}
                    onZoom={(zoom) => onEdit((s) => ({ ...s, zoom }))}
                    onResetCrop={() => onEdit((s) => ({ ...s, x: 0.5, y: 0.5, zoom: 1 }))}
                />
            </Tabs.Panel>
            <Tabs.Panel value="background">
                <BackgroundTab
                    bg={state.bg}
                    frame={state.frame}
                    onChange={(bg) => onEdit((s) => ({ ...s, bg }))}
                    onShuffle={() => onEdit((s) => ({ ...s, bg: shuffled(s.bg) }))}
                    onInset={() => applyLayout("inset")}
                    photo={fromPhoto}
                    palette={mixColours}
                />
            </Tabs.Panel>
            <Tabs.Panel value="text">
                {item && (
                    <TextTab item={item} onChange={onItem} photo={fromPhoto} palette={mixColours} />
                )}
            </Tabs.Panel>
        </Tabs>
    );
}
