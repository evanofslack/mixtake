// Bakes the front page's examples: for each entry in examples.src.json, reads its mix and photo
// set from a running mixtake (whose store has the baked mixes, see internal/examples), downloads
// the finished cover from the studio, and writes public/examples/<slug>.webp (the cover),
// public/examples/<slug>-photo.webp (the bare photo) and lib/examples.json.
//
//   BASE=http://localhost:8080 PLAYWRIGHT_FROM=<a package.json with playwright> \
//     node scripts/bake-examples.mjs
//
// Playwright isn't a dependency of web/; PLAYWRIGHT_FROM points at any project that has it.
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.dirname(here);
const BASE = process.env.BASE ?? "http://localhost:8080";
const COVER_PX = 720;
const PHOTO_PX = 640;

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = require("playwright");

async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`${url}: ${res.status}`);
    }
    return res.json();
}

// a webp of img (any url the page can load) at most px wide, as a Buffer
async function webp(page, url, px) {
    const data = await page.evaluate(
        async ({ url, px }) => {
            const img = new Image();
            img.src = url;
            await img.decode();
            const scale = Math.min(1, px / img.naturalWidth);
            const c = document.createElement("canvas");
            c.width = Math.round(img.naturalWidth * scale);
            c.height = Math.round(img.naturalHeight * scale);
            const ctx = c.getContext("2d");
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, c.width, c.height);
            return c.toDataURL("image/webp", 0.84);
        },
        { url, px },
    );
    return Buffer.from(data.split(",")[1], "base64");
}

const src = JSON.parse(await readFile(path.join(here, "examples.src.json"), "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
});
const out = [];
for (const ex of src) {
    const snap = await getJSON(`${BASE}/api/mixes/${ex.mixId}`);
    const set = await getJSON(`${BASE}/api/mixes/${ex.mixId}/photos`);
    const photoId = Number(new URLSearchParams(ex.query).get("photo"));
    const photo = set.photos.find((p) => p.id === photoId);
    if (!photo) {
        throw new Error(`${ex.slug}: photo ${photoId} isn't in the pinned set`);
    }
    const medium =
        photo.images.find((i) => i.resolution === "medium") ??
        photo.images.find((i) => i.resolution === "high");

    // the studio renders the cover exactly as a download would
    await page.goto(`${BASE}/mix?id=${ex.mixId}&${ex.query}`, { waitUntil: "networkidle" });
    const button = page.getByRole("button", { name: /^Download/ });
    await button.waitFor();
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    const jpg = await download.path();
    const coverData = `data:image/jpeg;base64,${(await readFile(jpg)).toString("base64")}`;
    await writeFile(
        path.join(web, "public/examples", `${ex.slug}.webp`),
        await webp(page, coverData, COVER_PX),
    );
    await writeFile(
        path.join(web, "public/examples", `${ex.slug}-photo.webp`),
        await webp(page, `${BASE}${medium.url}`, PHOTO_PX),
    );

    const { source } = snap.mix;
    const tracks = snap.tracks
        .filter((t) => t.status === "done")
        .slice(0, ex.trackCount ?? 3)
        .map((t) => `${t.track.title} — ${t.track.artists.map((a) => a.name).join(", ")}`);
    out.push({
        slug: ex.slug,
        name: ex.name ?? source.name,
        owner: source.subtitle ?? "",
        genre: ex.genre,
        spotify: `https://open.spotify.com/${source.kind}/${source.spotify_id}`,
        mixId: ex.mixId,
        query: ex.query,
        cover: `/examples/${ex.slug}.webp`,
        photo: `/examples/${ex.slug}-photo.webp`,
        credit: { author: photo.author, href: photo.permalink },
        phrases: ex.phrases,
        tracks: ex.tracks ?? tracks,
        colors: photo.colors.slice(0, 5),
        mood: round(snap.profile.averages.mood),
        energy: round(snap.profile.averages.energy),
    });
    console.log(`${ex.slug}: ${source.name} with photo ${photoId} by ${photo.author}`);
}
await browser.close();
await writeFile(path.join(web, "lib/examples.json"), `${JSON.stringify(out, null, 4)}\n`);

function round(v) {
    return Math.round(v * 100) / 100;
}
