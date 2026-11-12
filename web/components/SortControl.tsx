import { ActionIcon, SegmentedControl, Tooltip } from "@mantine/core";
import { FiArrowDown, FiArrowUp } from "react-icons/fi";
import { Sort, SORT_LABEL, SortKey } from "../lib/sort";

type Props = {
    sort: Sort;
    onChange: (s: Sort) => void;
    keys?: SortKey[];
};

// playlist order or a feature, and which way; the energy arc and the song list share it
export default function SortControl({
    sort,
    onChange,
    keys = ["order", "energy", "mood", "tempo"],
}: Props) {
    const dirLabel =
        sort.by === "order"
            ? sort.desc
                ? "last song first"
                : "first song first"
            : sort.desc
              ? "highest first"
              : "lowest first";
    return (
        <div className="flex items-center gap-1">
            <SegmentedControl
                size="xs"
                value={sort.by}
                // a new key starts at its most useful end: playlist from the top, features high first
                onChange={(v) => onChange({ by: v as SortKey, desc: v !== "order" })}
                aria-label="sort songs by"
                data={keys.map((k) => ({ value: k, label: SORT_LABEL[k] }))}
            />
            <Tooltip label={dirLabel} withArrow>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`sort direction: ${dirLabel}`}
                    onClick={() => onChange({ ...sort, desc: !sort.desc })}
                    className="text-muted"
                >
                    {sort.desc ? <FiArrowDown aria-hidden /> : <FiArrowUp aria-hidden />}
                </ActionIcon>
            </Tooltip>
        </div>
    );
}
