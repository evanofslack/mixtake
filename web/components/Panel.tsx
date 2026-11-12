import { ReactNode } from "react";
import Info from "./Info";

type Props = {
    title: string;
    // a short fact beside the title, such as a count
    caption?: ReactNode;
    // an explanation behind an (i) icon
    info?: ReactNode;
    // controls at the right of the header
    actions?: ReactNode;
    className?: string;
    children: ReactNode;
};

// a titled sheet raised off the page; every chart sits in one
export default function Panel({ title, caption, info, actions, className = "", children }: Props) {
    const id = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return (
        <section
            aria-labelledby={id}
            className={`min-w-0 rounded-2xl bg-surface p-5 shadow-raised sm:p-6 ${className}`}
        >
            <header className="mb-3 flex min-h-7 items-center gap-2">
                <h2 id={id} className="text-sm font-semibold tracking-tight">
                    {title}
                </h2>
                {info && <Info label={`about ${title.toLowerCase()}`}>{info}</Info>}
                {caption && <span className="text-xs text-muted tabular-nums">{caption}</span>}
                {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
            </header>
            {children}
        </section>
    );
}

// a quiet sunken placeholder while a chart has nothing to show yet
export function Waiting({
    children,
    className = "h-40",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`flex items-center justify-center rounded-lg px-4 text-center text-sm text-muted shadow-pressed ${className}`}
        >
            {children}
        </div>
    );
}
