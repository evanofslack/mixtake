import { ReactNode } from "react";

type Props = {
    title: string;
    caption?: ReactNode;
    className?: string;
    children: ReactNode;
};

// a titled sheet on the page; every chart sits in one
export default function Panel({ title, caption, className = "", children }: Props) {
    const id = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    return (
        <section
            aria-labelledby={id}
            className={`min-w-0 rounded-md border border-line bg-surface p-4 sm:p-5 ${className}`}
        >
            <header className="mb-3">
                <h2 id={id} className="text-sm font-semibold tracking-tight">
                    {title}
                </h2>
                {caption && <p className="mt-0.5 text-xs text-muted">{caption}</p>}
            </header>
            {children}
        </section>
    );
}

// a quiet placeholder while a chart has nothing to show yet
export function Waiting({
    children,
    className = "h-40",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`flex items-center justify-center rounded-sm border border-dashed border-line px-4 text-center text-sm text-muted ${className}`}
        >
            {children}
        </div>
    );
}
