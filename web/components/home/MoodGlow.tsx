import type { CSSProperties } from "react";

// light leaking out of the front cover's photo: up to three of its colours as soft pools behind
// the hero, one behind the covers and two along the top, under the frosted header. The colours
// are registered properties (styles/index.css), so a new cover fades the light rather than
// switching it. The big pool is above the input on small screens and in the right column on wide
// ones
export default function MoodGlow({ colours }: { colours: string[] }) {
    const [a, b = a, c = b] = colours;
    return (
        <div
            aria-hidden
            className="mood-glow pointer-events-none absolute inset-x-0 -top-28 bottom-0 -z-10 [--gx:50%] [--gy:24%] lg:[--gx:76%] lg:[--gy:46%]"
            style={{ "--glow-a": a, "--glow-b": b, "--glow-c": c } as CSSProperties}
        />
    );
}
