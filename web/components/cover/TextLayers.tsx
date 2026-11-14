// The Text mode: the cover's text items as a list of layers, the top of the stack first. Each row
// is its text, editable in place; the selected row carries its actions and opens its settings
// beneath it, so it's always plain which item they change.
import { ReactNode, useEffect, useRef } from "react";
import { ActionIcon, Button, TextInput, Tooltip } from "@mantine/core";
import { FiArrowDown, FiArrowUp, FiCopy, FiPlus, FiTrash2 } from "react-icons/fi";
import { CoverState, FONTS, TextItem } from "../../lib/canvas";
import {
    addText,
    duplicateText,
    MAX_TEXTS,
    moveText,
    removeText,
    textLabel,
} from "../../lib/texts";

type Props = {
    texts: TextItem[];
    selected: string | null;
    onSelect: (id: string) => void;
    onEdit: (fn: (s: CoverState) => CoverState) => void;
    // the selected item's settings
    children: ReactNode;
};

export default function TextLayers({ texts, selected, onSelect, onEdit, children }: Props) {
    const i = texts.findIndex((t) => t.id === selected);
    const full = texts.length >= MAX_TEXTS;

    // the new item's id is the same whichever state it's computed from, so select it up front
    const add = () => {
        onSelect(addText({ texts } as CoverState).id);
        onEdit((s) => addText(s).state);
    };
    const duplicate = (id: string) => {
        onSelect(duplicateText({ texts } as CoverState, id).id);
        onEdit((s) => duplicateText(s, id).state);
    };
    const remove = (id: string) => {
        const rest = texts.filter((t) => t.id !== id);
        const next = rest[Math.min(i, rest.length - 1)];
        if (next) {
            onSelect(next.id);
        }
        onEdit((s) => removeText(s, id));
    };
    const setText = (id: string, text: string) =>
        onEdit((s) => ({
            ...s,
            texts: s.texts.map((t) => (t.id === id ? { ...t, text } : t)),
        }));

    // a selection made elsewhere (a click on the preview) brings its row into view; not on the
    // first render, which would scroll the page
    const mounted = useRef(false);
    useEffect(() => {
        if (mounted.current && selected) {
            document
                .getElementById(`text-layer-${selected}`)
                ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        mounted.current = true;
    }, [selected]);

    // the top of the stack (the end of the array) first
    const rows = texts.map((t, n) => ({ t, n })).reverse();
    return (
        <div className="flex flex-col gap-2">
            <ul className="flex flex-col gap-2" aria-label="text layers">
                {rows.map(({ t, n }) => {
                    const sel = t.id === selected;
                    return (
                        <li
                            key={t.id}
                            id={`text-layer-${t.id}`}
                            className={`rounded-lg transition-shadow ${
                                sel ? "p-3 shadow-pressed" : "p-1 shadow-raised-sm"
                            }`}
                            onClick={sel ? undefined : () => onSelect(t.id)}
                        >
                            <div className="flex items-center gap-1">
                                <TextInput
                                    className="min-w-0 grow"
                                    variant="unstyled"
                                    classNames={{
                                        input: `bg-transparent px-2 shadow-none ${
                                            sel ? "font-medium" : ""
                                        }`,
                                    }}
                                    aria-label={`text ${n + 1}`}
                                    placeholder={textLabel({ ...t, text: "" }, n)}
                                    value={t.text}
                                    maxLength={120}
                                    onFocus={() => onSelect(t.id)}
                                    onChange={(e) => setText(t.id, e.currentTarget.value)}
                                />
                                {sel ? (
                                    <div className="flex shrink-0 items-center">
                                        <Action
                                            label="duplicate"
                                            onClick={() => duplicate(t.id)}
                                            disabled={full}
                                        >
                                            <FiCopy aria-hidden />
                                        </Action>
                                        <Action
                                            label="bring forward"
                                            onClick={() => onEdit((s) => moveText(s, t.id, 1))}
                                            disabled={n === texts.length - 1}
                                        >
                                            <FiArrowUp aria-hidden />
                                        </Action>
                                        <Action
                                            label="send back"
                                            onClick={() => onEdit((s) => moveText(s, t.id, -1))}
                                            disabled={n === 0}
                                        >
                                            <FiArrowDown aria-hidden />
                                        </Action>
                                        <Action label="delete" onClick={() => remove(t.id)}>
                                            <FiTrash2 aria-hidden />
                                        </Action>
                                    </div>
                                ) : (
                                    <span className="shrink-0 pr-2 text-xs text-muted">
                                        {FONTS[t.font].label}
                                    </span>
                                )}
                            </div>
                            {sel && <div className="mt-3">{children}</div>}
                        </li>
                    );
                })}
            </ul>
            <Button
                variant="default"
                size="xs"
                leftSection={<FiPlus aria-hidden />}
                className="self-start"
                onClick={add}
                disabled={full}
            >
                {full ? `Up to ${MAX_TEXTS} texts` : "Add text"}
            </Button>
        </div>
    );
}

function Action({
    label,
    onClick,
    disabled,
    children,
}: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    children: ReactNode;
}) {
    return (
        <Tooltip label={label} withArrow>
            <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={label}
                onClick={onClick}
                disabled={disabled}
                className="text-muted"
            >
                {children}
            </ActionIcon>
        </Tooltip>
    );
}
