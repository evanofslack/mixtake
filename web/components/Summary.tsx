import type { Profile } from "../lib/api";
import { QUADRANT_LABEL } from "../lib/format";

type Props = {
    profile?: Profile;
    final: boolean;
};

// the profile's one-line description; dimmed until the analysis is finished
export default function Summary({ profile, final }: Props) {
    if (!profile?.summary) {
        return (
            <p className="font-serif text-xl text-muted italic sm:text-2xl">
                Listening to the first few songs…
            </p>
        );
    }
    return (
        <div>
            <p
                className={`font-serif text-xl leading-snug text-balance transition-opacity duration-700 sm:text-2xl ${
                    final ? "" : "opacity-70"
                }`}
                aria-live="polite"
            >
                {profile.summary}
            </p>
            <p className="mt-2 text-xs text-muted">
                {final ? "Overall" : "So far"}: {QUADRANT_LABEL[profile.quadrant]}, mood{" "}
                {Math.round(profile.averages.mood * 100)}, energy{" "}
                {Math.round(profile.averages.energy * 100)}
            </p>
        </div>
    );
}
