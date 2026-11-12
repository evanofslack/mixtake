import { ReactNode, useState } from "react";
import { ActionIcon, Popover } from "@mantine/core";
import { FiInfo } from "react-icons/fi";

type Props = {
    // what the icon explains, read by screen readers before it opens
    label: string;
    children: ReactNode;
    icon?: ReactNode;
};

// a small (i) that opens its text on hover, focus or tap, so the page stays short
export default function Info({ label, children, icon }: Props) {
    const [opened, setOpened] = useState(false);
    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="bottom-start"
            withArrow
            shadow="md"
            width={260}
            closeOnEscape
        >
            <Popover.Target>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={label}
                    onMouseEnter={() => setOpened(true)}
                    onMouseLeave={() => setOpened(false)}
                    onFocus={() => setOpened(true)}
                    onBlur={() => setOpened(false)}
                    onClick={() => setOpened((o) => !o)}
                    className="text-muted"
                >
                    {icon ?? <FiInfo aria-hidden />}
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown className="text-xs leading-relaxed">{children}</Popover.Dropdown>
        </Popover>
    );
}
