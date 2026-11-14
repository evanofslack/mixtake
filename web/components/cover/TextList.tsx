import type { ReactNode } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { FiArrowDown, FiArrowUp, FiCopy, FiPlus, FiTrash2 } from "react-icons/fi";
import { CoverState, TextItem } from "../../lib/canvas";
import {
    addText,
    duplicateText,
    MAX_TEXTS,
    moveText,
    removeText,
    textLabel,
} from "../../lib/texts";
import { Choice } from "./ui";

type Props = {
    texts: TextItem[];
    selected: string | null;
    onSelect: (id: string) => void;
    onEdit: (fn: (s: CoverState) => CoverState) => void;
};

// the cover's text items as chips (top of the stack last), with add, copy, reorder and delete
export default function TextList({ texts, selected, onSelect, onEdit }: Props) {
    const i = texts.findIndex((t) => t.id === selected);
    const full = texts.length >= MAX_TEXTS;
    // the new item's id is the same whichever state it's computed from, so select it up front
    const add = () => {
        onSelect(addText({ texts } as CoverState).id);
        onEdit((s) => addText(s).state);
    };
    const duplicate = () => {
        if (!selected) {
            return;
        }
        onSelect(duplicateText({ texts } as CoverState, selected).id);
        onEdit((s) => duplicateText(s, selected).state);
    };
    const remove = () => {
        if (!selected) {
            return;
        }
        const rest = texts.filter((t) => t.id !== selected);
        const next = rest[Math.min(i, rest.length - 1)];
        if (next) {
            onSelect(next.id);
        }
        onEdit((s) => removeText(s, selected));
    };

    return (
        <div className="mb-5">
            <div className="flex flex-wrap items-center gap-1.5">
                <fieldset className="contents">
                    <legend className="sr-only">Text items</legend>
                    {texts.map((t, n) => (
                        <Choice
                            key={t.id}
                            name="cover-text-item"
                            checked={t.id === selected}
                            onSelect={() => onSelect(t.id)}
                            label={textLabel(t, n)}
                            className="max-w-40 rounded-full px-3 py-1 text-sm"
                        >
                            <span className="block truncate">{textLabel(t, n)}</span>
                        </Choice>
                    ))}
                </fieldset>
                <Tooltip label={full ? `up to ${MAX_TEXTS} texts` : "add text"} withArrow>
                    <ActionIcon
                        variant="default"
                        radius="xl"
                        size="md"
                        aria-label="add text"
                        onClick={add}
                        disabled={full}
                    >
                        <FiPlus aria-hidden />
                    </ActionIcon>
                </Tooltip>
            </div>
            {selected && (
                <div className="mt-2 flex items-center gap-1">
                    <Action label="duplicate" onClick={duplicate} disabled={full}>
                        <FiCopy aria-hidden />
                    </Action>
                    <Action
                        label="bring forward"
                        onClick={() => onEdit((s) => moveText(s, selected, 1))}
                        disabled={i < 0 || i === texts.length - 1}
                    >
                        <FiArrowUp aria-hidden />
                    </Action>
                    <Action
                        label="send back"
                        onClick={() => onEdit((s) => moveText(s, selected, -1))}
                        disabled={i <= 0}
                    >
                        <FiArrowDown aria-hidden />
                    </Action>
                    <Action label="delete" onClick={remove}>
                        <FiTrash2 aria-hidden />
                    </Action>
                </div>
            )}
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
