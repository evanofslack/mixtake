import type { CSSProperties } from "react";

// a soft light behind the hero in the front cover's mood colour, as if the room were lit by the
// print. --mix-glow is a registered colour property (styles/index.css), so a change of cover fades
// the light rather than switching it. The large pool sits behind the covers: centred above the
// input on small screens, and in the right column on wide ones
export default function MoodGlow({ colour }: { colour: string }) {
    return (
        <div
            aria-hidden
            className="mood-glow pointer-events-none absolute inset-x-0 -top-14 bottom-0 -z-10 [--gx:50%] [--gy:22%] lg:[--gx:76%] lg:[--gy:46%]"
            style={{ "--mix-glow": colour } as CSSProperties}
        />
    );
}
