import { ReactNode } from "react";
import { Badge, Tooltip } from "@mantine/core";
import type { Profile } from "../lib/api";
import { QUADRANT_LABEL } from "../lib/format";

type Props = {
    profile?: Profile;
    final: boolean;
};

// the headline and the mix's numbers as chips; dimmed until the analysis is finished
export default function Summary({ profile, final }: Props) {
    if (!profile?.summary) {
        return <p className="font-serif text-2xl text-muted italic sm:text-3xl">Listening…</p>;
    }
    const a = profile.averages;
    let minor = 0;
    let total = 0;
    for (const k of profile.keys) {
        total += k.count;
        if (k.mode === "minor") {
            minor += k.count;
        }
    }
    const share = total ? minor / total : 0.5;
    const keys = share >= 0.6 ? "minor" : share <= 0.4 ? "major" : "major + minor";
    return (
        <div className={`transition-opacity duration-700 ${final ? "" : "opacity-70"}`}>
            <p
                className="font-serif text-2xl leading-snug text-balance sm:text-3xl"
                aria-live="polite"
            >
                {profile.summary}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
                <Stat tip="where the average lands on the mood map">
                    {QUADRANT_LABEL[profile.quadrant]}
                </Stat>
                <Stat tip="average tempo">{Math.round(a.tempo)} BPM</Stat>
                <Stat tip={`${Math.round(share * 100)}% of songs in a minor key`}>{keys}</Stat>
                <Stat tip="0 is sad, 100 is happy">mood {Math.round(a.mood * 100)}</Stat>
                <Stat tip="0 is calm, 100 is energetic">energy {Math.round(a.energy * 100)}</Stat>
                {!final && (
                    <Stat tip="updates as more songs are analysed" muted>
                        so far
                    </Stat>
                )}
            </div>
        </div>
    );
}

function Stat({ tip, muted, children }: { tip: string; muted?: boolean; children: ReactNode }) {
    return (
        <Tooltip
            label={tip}
            withArrow
            openDelay={150}
            events={{ hover: true, focus: true, touch: true }}
        >
            <Badge
                variant={muted ? "transparent" : "default"}
                size="lg"
                radius="sm"
                tabIndex={0}
                className="font-normal normal-case tabular-nums"
            >
                {children}
            </Badge>
        </Tooltip>
    );
}
