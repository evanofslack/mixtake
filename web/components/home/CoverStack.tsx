import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@mantine/hooks";
import { alignFor, drawCover, loadFont, simpleCover } from "../../lib/canvas";
import { HeroCover, quadrantAt, ShowcasePhoto } from "../../lib/showcase";
import { useWidth } from "../../lib/useWidth";

// how long each cover stays in front
const HOLD = 5000;

// where each print sits by its depth in the pile (0 is the front): a nudge and a tilt, like
// prints dropped on a table
const FAN = [
    "translate(0, 0) rotate(0deg)",
    "translate(9%, -7%) rotate(5deg)",
    "translate(-9%, -5%) rotate(-6deg)",
    "translate(2%, -11%) rotate(-2deg)",
];

type Props = {
    covers: HeroCover[];
    // a photo for each cover, or null while the showcase loads
    photos: (ShowcasePhoto | undefined)[] | null;
    front: number;
    onFront: (i: number) => void;
};

// the front page's hero: finished covers in a fanned pile. The front one goes to the back every
// few seconds, unless the pile is hovered or focused, and clicking a print brings it forward.
// Still under reduced motion.
export default function CoverStack({ covers, photos, front, onFront }: Props) {
    const reduced = useReducedMotion();
    const [paused, setPaused] = useState(false);
    const n = covers.length;

    useEffect(() => {
        if (reduced || paused || !photos) {
            return;
        }
        const t = setTimeout(() => onFront((front + 1) % n), HOLD);
        return () => clearTimeout(t);
    }, [reduced, paused, photos, front, n, onFront]);

    return (
        <div
            aria-label="example covers"
            role="group"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className="relative mx-auto aspect-square w-[min(15rem,70vw)] lg:w-full"
        >
            {covers.map((c, i) => {
                const depth = (i - front + n) % n;
                return (
                    <button
                        key={c.title}
                        type="button"
                        onClick={() => onFront(i)}
                        aria-label={`${c.title}, a ${quadrantAt(c.mood, c.energy)} cover`}
                        aria-pressed={depth === 0}
                        className="absolute top-[13%] left-[11%] w-[78%] rounded-md bg-surface p-1.5 shadow-raised transition-transform duration-700 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none sm:p-2"
                        style={{ transform: FAN[depth % FAN.length], zIndex: n - depth }}
                    >
                        <Print cover={c} photo={photos?.[i]} />
                    </button>
                );
            })}
        </div>
    );
}

// one cover, drawn by the studio's own drawCover so it's exactly what a download looks like; a
// pressed paper square until its photo and font have loaded
function Print({ cover, photo }: { cover: HeroCover; photo?: ShowcasePhoto }) {
    const [boxRef, width] = useWidth<HTMLDivElement>();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [drawn, setDrawn] = useState(false);

    useEffect(() => {
        if (!photo) {
            return;
        }
        let live = true;
        const img = new Image();
        img.onload = () => {
            loadFont(cover.font).then(() => live && setImage(img));
        };
        img.src = photo.src;
        return () => {
            live = false;
        };
    }, [photo, cover.font]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !image || width === 0) {
            return;
        }
        const px = Math.round(width * Math.min(window.devicePixelRatio || 1, 2));
        canvas.width = px;
        canvas.height = px;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        drawCover(
            ctx,
            image,
            simpleCover({
                text: cover.title,
                sub: cover.sub,
                font: cover.font,
                pos: cover.pos,
                align: alignFor(cover.pos, "left"),
                size: 12,
            }),
            px,
        );
        setDrawn(true);
    }, [image, width, cover]);

    return (
        <div
            ref={boxRef}
            className={`relative aspect-square overflow-hidden rounded-xs ${
                drawn ? "" : "bg-bg shadow-pressed"
            }`}
        >
            <canvas
                ref={canvasRef}
                aria-hidden
                className={`absolute inset-0 size-full ${drawn ? "print" : "opacity-0"}`}
            />
        </div>
    );
}
