import { ReactNode } from "react";

export type BarItem = {
    key: string;
    label: ReactNode;
    // 0–1, relative to the longest bar
    value: number;
    detail?: ReactNode;
};

// a ranked list with a thin bar under each name: genres, keys and artists
export default function BarList({ items, label }: { items: BarItem[]; label: string }) {
    return (
        <ol aria-label={label} className="space-y-2.5">
            {items.map((item) => (
                <li key={item.key} className="min-w-0">
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
                            className="h-full rounded-full bg-mark transition-[width] duration-700 ease-out motion-reduce:transition-none"
                            style={{ width: `${Math.max(2, item.value * 100)}%` }}
                        />
                    </div>
                </li>
            ))}
        </ol>
    );
}
