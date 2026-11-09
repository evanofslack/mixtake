import { FiImage } from "react-icons/fi";
import Panel from "./Panel";

// where the cover studio goes; for now, an empty frame
export default function CoverPlaceholder({ ready }: { ready: boolean }) {
    return (
        <Panel
            title="Cover"
            caption="A film photograph from analogdb that matches the mix."
            className="lg:col-span-12"
        >
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-line-strong px-6 text-center text-sm text-muted">
                <FiImage size="1.4rem" aria-hidden />
                <p className="max-w-xs text-balance">
                    {ready
                        ? "The cover studio is on its way."
                        : "Your cover appears here once enough songs are analysed."}
                </p>
            </div>
        </Panel>
    );
}
