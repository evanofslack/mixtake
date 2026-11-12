import { ReactNode } from "react";
import Info from "../Info";

// credits, licenses and privacy in one quiet row, each with its detail behind an (i)
export default function Credits() {
    return (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <Item
                label="Essentia"
                href="https://essentia.upf.edu"
                info="Models under CC BY-NC-SA so non-commercial"
            >
                Audio by
            </Item>
            <Item
                label="analogdb"
                href="https://analogdb.com"
                info="Each cover credits its photographer"
            >
                Photos from
            </Item>
            <Item info="Previews are analyzed then thrown away">No accounts</Item>
            <Item info="Names and artwork belong to their owners">Not affiliated with Spotify</Item>
        </ul>
    );
}

function Item({
    label,
    href,
    info,
    children,
}: {
    label?: string;
    href?: string;
    info: string;
    children: ReactNode;
}) {
    const name = label ?? String(children);
    return (
        <li className="flex items-center gap-0.5">
            <span>
                {children}
                {label && href && (
                    <>
                        {" "}
                        <a
                            href={href}
                            className="text-ink underline decoration-line-strong underline-offset-2 transition-colors hover:decoration-ink"
                        >
                            {label}
                        </a>
                    </>
                )}
            </span>
            <Info label={`about ${name.toLowerCase()}`}>{info}</Info>
        </li>
    );
}
