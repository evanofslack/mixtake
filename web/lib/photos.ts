import { useEffect, useState } from "react";
import type { Photo, PhotoImage } from "./api";
import { CoverState, drawCover, loadFont, sourceSide } from "./canvas";

const ORDER: PhotoImage["resolution"][] = ["low", "medium", "high", "raw"];

function sorted(p: Photo): PhotoImage[] {
    return [...p.images].sort((a, b) => ORDER.indexOf(a.resolution) - ORDER.indexOf(b.resolution));
}

// the first of `prefer` that the photo has, else its largest
export function imageFor(p: Photo, ...prefer: PhotoImage["resolution"][]): PhotoImage | undefined {
    for (const r of prefer) {
        const img = p.images.find((i) => i.resolution === r);
        if (img) {
            return img;
        }
    }
    return sorted(p).at(-1);
}

export const thumbFor = (p: Photo) => imageFor(p, "medium", "low", "high");
export const editorImageFor = (p: Photo) => imageFor(p, "high", "raw", "medium");

// the smallest image that covers `size` px at this zoom, else the largest there is
export function exportImageFor(p: Photo, zoom: number, size: number): PhotoImage | undefined {
    const all = sorted(p).filter((i) => i.resolution === "high" || i.resolution === "raw");
    const enough = all.find((i) => sourceSide(i.width, i.height, zoom) >= size);
    return enough ?? all.at(-1) ?? imageFor(p, "medium");
}

// true when the export at `size` px stretches the photo
export function upscales(p: Photo, zoom: number, size: number): boolean {
    const img = exportImageFor(p, zoom, size);
    return !!img && sourceSide(img.width, img.height, zoom) < size;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    return img.decode().then(() => img);
}

// a decoded image for `url`, or null while it loads or if it failed
export function useImage(url?: string): { image: HTMLImageElement | null; failed: boolean } {
    const [loaded, setLoaded] = useState<{
        url: string;
        image: HTMLImageElement | null;
    } | null>(null);
    useEffect(() => {
        if (!url) {
            return;
        }
        let cancelled = false;
        loadImage(url).then(
            (image) => !cancelled && setLoaded({ url, image }),
            () => !cancelled && setLoaded({ url, image: null }),
        );
        return () => {
            cancelled = true;
        };
    }, [url]);
    const current = loaded && loaded.url === url ? loaded : null;
    return { image: current?.image ?? null, failed: !!current && !current.image };
}

// the cover as a JPG at size×size, drawn by the same function as the preview
export async function renderCover(photo: Photo, state: CoverState, size: number): Promise<Blob> {
    const src = exportImageFor(photo, state.zoom, size);
    if (!src) {
        throw new Error("This photo has no image to export.");
    }
    const [image] = await Promise.all([loadImage(src.url), loadFont(state.font)]);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Your browser couldn't draw the cover.");
    }
    drawCover(ctx, image, state, size);
    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    // let the browser drop the big canvas's memory straight away
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
        throw new Error("Your browser couldn't save the cover.");
    }
    return blob;
}

export function download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
