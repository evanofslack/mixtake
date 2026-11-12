import { ReactNode } from "react";

export type BarItem = {
    key: string;
    label: ReactNode;
    // 0–1, relative to the longest bar
    value: number;
    detail?: ReactNode;
};

type Props = {
    items: BarItem[];
    label: string;
    // when set, rows are buttons: hover highlights, click pins (see lib/highlight.tsx)
    onHover?: (key: string | null) => void;
    onSelect?: (key: string) => void;
    // rows to highlight; when non-empty the others dim
    active?: Set<string>;
    // the pinned row, announced as pressed
    pinned?: string | null;
};

// a ranked list with a thin bar under each name: genres, keys and artists
export default function BarList({ items, label, onHover, onSelect, active, pinned }: Props) {
    const lit = active && active.size > 0 ? active : null;
    return (
        <ol aria-label={label} className="space-y-1">
            {items.map((item) => {
                const on = lit?.has(item.key) ?? false;
                const body = (
                    <>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate">{item.label}</span>
                            {item.detail !== undefined && (
                                <span className="shrink-0 text-xs text-muted tabular-nums">
                                    {item.detail}
                                </span>
                            )}
                        </div>
                        <div className="mt-1 h-1 rounded-full bg-line" aria-hidden>
                            <div
                                className={`h-full rounded-full transition-[width,background-color] duration-700 ease-out motion-reduce:transition-none ${
                                    on ? "bg-accent" : "bg-mark"
                                }`}
                                style={{ width: `${Math.max(2, item.value * 100)}%` }}
                            />
                        </div>
                    </>
                );
                const row = `block w-full min-w-0 rounded-xs px-1 py-0.5 text-left transition-opacity ${
                    lit && !on ? "opacity-40" : ""
                }`;
                return (
                    <li key={item.key} className="-mx-1 min-w-0">
                        {onSelect ? (
                            <button
                                type="button"
                                className={`${row} cursor-pointer hover:bg-sunk focus-visible:outline-2 focus-visible:outline-ink`}
                                aria-pressed={pinned === item.key}
                                onMouseEnter={() => onHover?.(item.key)}
                                onMouseLeave={() => onHover?.(null)}
                                onFocus={() => onHover?.(item.key)}
                                onBlur={() => onHover?.(null)}
                                onClick={() => onSelect(item.key)}
                            >
                                {body}
                            </button>
                        ) : (
                            <div className={row}>{body}</div>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
