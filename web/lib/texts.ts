// Adding, copying, reordering and removing a cover's text items. Array order is stacking order:
// later items draw on top.
import { CoverState, FONTS, TextItem, textItem } from "./canvas";

export const MAX_TEXTS = 6;

function nextId(texts: TextItem[]): string {
    const used = new Set(texts.map((t) => t.id));
    let i = texts.length;
    while (used.has(`t${i}`)) {
        i++;
    }
    return `t${i}`;
}

// a new line of small text in the middle of the cover, on top of the others
export function addText(s: CoverState): { state: CoverState; id: string } {
    if (s.texts.length >= MAX_TEXTS) {
        return { state: s, id: s.texts.at(-1)?.id ?? "" };
    }
    const id = nextId(s.texts);
    const item = textItem(id, {
        text: "Text",
        font: "grotesk",
        weight: FONTS.grotesk.weight,
        width: FONTS.grotesk.width,
        size: 5,
        pos: "mc",
        align: "center",
    });
    return { state: { ...s, texts: [...s.texts, item] }, id };
}

// a copy just above and right of the original, on top of the others
export function duplicateText(s: CoverState, id: string): { state: CoverState; id: string } {
    const src = s.texts.find((t) => t.id === id);
    if (!src || s.texts.length >= MAX_TEXTS) {
        return { state: s, id };
    }
    const copy: TextItem = { ...src, id: nextId(s.texts) };
    if (src.pos === "free") {
        copy.tx = Math.min(1, src.tx + 0.03);
        copy.ty = Math.min(1, src.ty + 0.03);
    }
    return { state: { ...s, texts: [...s.texts, copy] }, id: copy.id };
}

export function removeText(s: CoverState, id: string): CoverState {
    return { ...s, texts: s.texts.filter((t) => t.id !== id) };
}

// moves an item one step up (towards the top of the stack) or down
export function moveText(s: CoverState, id: string, by: 1 | -1): CoverState {
    const i = s.texts.findIndex((t) => t.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= s.texts.length) {
        return s;
    }
    const texts = [...s.texts];
    [texts[i], texts[j]] = [texts[j], texts[i]];
    return { ...s, texts };
}

// the item's text for a list, or its place when it has none
export function textLabel(t: TextItem, i: number): string {
    return t.text.trim() || t.sub.trim() || `Text ${i + 1}`;
}
