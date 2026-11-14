# mixtake v2 plan

Paste a Spotify playlist link, album link, or a list of copied tracks. Watch the music get analysed
live (mood map, energy arc, genres and artists, tempo and key gauges), get a film-photo cover from
[analogdb](https://analogdb.com) that matches it, add text, then download or share.

## Background

- **No Spotify Web API or login.** Development-mode apps are capped at 5 users and extended quota
  is only open to large organisations. Playlist contents are also restricted to playlists the user
  owns. Instead, `open.spotify.com/embed/{playlist|album|track}/{id}` returns a `__NEXT_DATA__` JSON
  block with the name, cover, a `visualIdentity` palette and up to 100 tracks, each with title,
  artists, duration and a 30-second MP3 preview URL. A per-track embed takes about 0.4s. This is
  undocumented, so the parser is isolated, fixture-tested and monitored.
- **Audio features come from our own Essentia analysis of the previews.** Third-party feature APIs
  don't cover recent music (ReccoBeats: 0% on New Music Friday, RapCaviar and lofi; 99% on 80s).
  Essentia's discogs-effnet embeddings, mood heads, genre_discogs400, msd-musicnn/DEAM and
  rhythm/key extractors take about 0.7s of CPU per track on an M5 and give sensible results.
  - Models are about 29 MB; the Python environment is about 500 MB.
  - Wheels exist for linux x86_64 and macOS only, so the analyzer container is amd64 and macOS dev
    runs it natively with uv.
  - essentia.upf.edu is unreliable, so the fetch script retries, and can switch to a mirror such
    as a GitHub release `models-v1` (not published yet).
  - The mood heads are binary classifiers that saturate: every piano or ambient track scores about
    0.001 for party and 0.99 for relaxed. DEAM valence and arousal are continuous and use about
    0.2–0.85 (not 0.36–0.64 as first thought), so they separate calm songs that the heads can't.
    The mood and energy axes blend both (see the data model).
- **analogdb** (`https://api.analogdb.com/v1`): caption-style scene queries work very well with
  `/search?q=`. Raw playlist names and album-art image search don't. `/search` has no colour
  filter, so colour ranking happens in Go; `/posts?color=` does filter, taking one of red,
  orange, tan, yellow, green, olive, teal, navy, purple, pink, gray, black, white, brown (or a
  hex), with `keyword=`, `sort=random&seed=1..500`, `grayscale`, `ratio_min` and `ratio_max`.
  Colour alone gives random clutter (game consoles, signs); colour plus a keyword is on topic.
  Anonymous clients get 60 requests a minute per IP, and bursts get 429. `i.analogdb.com` sends
  no CORS headers, so images are proxied through Go so the canvas can export them.
- No API keys are needed.

## Stack

- **Go** (std lib first): `net/http` ServeMux, `log/slog`, `embed`, `database/sql` with
  `modernc.org/sqlite`, and `prometheus/client_golang` for a few critical metrics.
- **Web**: Next.js static export (pages router), React 19, Mantine 9, `@mantine/charts`,
  Tailwind 4, Node 24. Light mode by default, with a dim grey dark mode.
- **Analyzer**: Python 3.12, FastAPI and Essentia, managed with uv, in its own container.
- **Deploy**: one `mixtake` image serves web and API. `analyzer` is a separate compose service.
  Prod is an amd64 Ubuntu VPS behind Caddy and Cloudflare at `mixtake.evanslack.dev`.

## Layout

```
cmd/mixtake/      wiring: config → clients → store → runner → server
cmd/tune/         tuning CLI: link → profile, scene queries, top photos, contact sheet
internal/
  config/         env parsing
  mix/            domain types, the IO interfaces, input parsing, profile aggregation,
                  scene selection, colour ranking, job runner
  spotify/        Catalog: embed fetch and parse, preview download (testdata/ fixtures)
  analyzer/       Analyzer: HTTP client for the sidecar, plus a deterministic Fake
  analogdb/       Photos: search, similar, image fetch
  store/          Store: SQLite with embedded migrations
  server/         handlers, SSE, middleware (request id, access log, recover, rate limit), static
  metrics/        prometheus collectors
web/              Next.js app
analyzer/         Python sidecar, Dockerfile, scripts/fetch_models.sh, models.lock
```

## Interfaces

Only at IO boundaries, defined in `internal/mix` where they are consumed.

```go
type Catalog interface { // Spotify embed pages and preview CDN
    Playlist(ctx context.Context, id string) (Source, []Track, error)
    Album(ctx context.Context, id string) (Source, []Track, error)
    Track(ctx context.Context, id string) (Track, error)
    Preview(ctx context.Context, url string) (io.ReadCloser, error)
}

type Analyzer interface { // essentia sidecar, or Fake
    Analyze(ctx context.Context, trackID string, audio io.Reader) (Features, error)
    ModelVersion() string
}

type Photos interface { // analogdb
    Search(ctx context.Context, q PhotoQuery) ([]Photo, error)    // cached in memory
    ByColor(ctx context.Context, q ColorQuery) ([]Photo, error)   // cached in memory
    Similar(ctx context.Context, id int) ([]Photo, error)
    Image(ctx context.Context, name string) (io.ReadCloser, string, error) // body, content type
    KeywordCount(ctx context.Context, word string) (int, error)           // cached in memory
}

type Store interface { // SQLite now, swappable later
    Tracks(ctx context.Context, ids []string) (map[string]Track, error)
    PutTracks(ctx context.Context, ts []Track) error
    Features(ctx context.Context, ids []string, modelVersion string) (map[string]Features, error)
    PutFeatures(ctx context.Context, trackID, modelVersion string, f Features) error
    Mix(ctx context.Context, id string) (Mix, error)
    PutMix(ctx context.Context, m Mix) error
}
```

Everything else (input parsing, profile maths, scenes, ranking, runner) is concrete code, tested
with fakes of these four.

## Data

- `Features`: tempo, key, mode, and 0–1 scores for danceable, happy, sad, relaxed, aggressive,
  party, acoustic, instrumental, valence and arousal, plus the top 3 genres with scores.
- Derived axes (v1, tuned on `internal/mix/testdata/axes.json`, ~500 real tracks):
  - `s(p) = sigmoid(logit(p) / 3)` softens a saturated head; `d(x) = clamp((x − 0.2) / 0.6)`
    stretches DEAM over the range it uses.
  - `Mood = 0.5·d(Valence) + 0.5·(0.5 + (s(Happy) − s(Sad)) / 2)`
  - `Energy = 0.6·d(Arousal) + 0.4·(0.4·s(Party) + 0.3·s(Aggressive) + 0.3·(1 − s(Relaxed)))`
  - v0 used the heads alone, which put lofi at energy 0.02 and Peaceful Piano at 0.00. Now lofi
    averages 0.26 and Kind of Blue 0.42, while pop, rap and workout mixes barely move.
    `TestAxesCalibration` guards the spread and the genre order. Both are computed from stored
    features, so changing them needs no re-analysis; `web/lib/api.ts` mirrors them.
- `Profile`: means and spreads, mood quadrant, energy arc in track order, tempo histogram, key
  counts, genre weights, top artists, coverage `{done, failed, total}` and a headline
  ("Melancholy and hushed"); the web shows the feel (quadrant) and key as labelled facets, and
  tempo, mood and energy as gauges (a histogram of the songs over a bar filled to the average).
- `Mix`: id, source (kind, Spotify id, name, cover, palette), ordered track ids, vibe, created at.
  - The id is a short base32 of `sha256(ordered track ids + vibe)`, so the same input gives the
    same mix and reuses the cache.
  - Editor state (photo, crop, text, font) lives in the share URL, not the database.
- SQLite tables: `tracks`, `features(track_id, model_version, json, analyzed_at)` and `mixes`.
  Preview URLs are not stored long term.

## HTTP API

| Route | Behaviour |
|---|---|
| `POST /api/mixes {input, vibe?}` | Parse the input: a playlist or album link costs one embed fetch; pasted links or URIs need no fetch. Caps of 100 and 300 tracks. Stores the mix, starts a job, returns `201 {id}`. Errors for private, invalid, unsupported or empty input. Rate limited per IP; 503 when the global queue is full. |
| `GET /api/mixes/{id}` | Snapshot: source, tracks with features, profile, status. Restarts an incomplete job if none is running. |
| `GET /api/mixes/{id}/events` | SSE: `snapshot` first, then `track`, `progress`, `profile` (every ~10 tracks and at the end), then `done` or `error`. |
| `GET /api/mixes/{id}/photos?vibe=&seed=` | `200 PhotoSet {queries, palette, photos}`: about 12 ranked analogdb photos for the current profile, plus the queries (all of them, every lens) and target palette used. `vibe` (≤200 characters) overrides the mix's vibe for this search only. `seed` (optional whole number, 0–1000000000) shuffles: 0 or absent is the mix's usual set, any other value picks different sentences, title words and colour page, so a "shuffle" button can send a new random seed each click; the same seed always gives the same set. 404 unknown mix; 409 until 10 tracks are analysed (or the job finished with fewer, for short albums); 400 long vibe or bad seed; 502 only when every analogdb search failed. |
| `GET /api/photos/{id}/similar` | `200 PhotoSet` with empty `queries` and `palette`: analogdb's similar photos, filtered, in analogdb's order, without the photo itself. 404 unknown photo (or one without a similarity embedding); 502 analogdb failed. |
| `GET /api/img/{name}` | Streams an `i.analogdb.com` image with `Cache-Control: public, max-age=31536000, immutable`. Only analogdb file names are served (404 otherwise): a uuid, or the older `<24 hex>-<low\|medium\|high\|raw>`, with `.jpeg`, `.jpg` or `.png`. 502 analogdb failed. |
| `GET /api/showcase` | `200 {photos: [{mood, energy, photo}]}` with `Cache-Control: public, max-age=3600`: one real analogdb photo for each of 12 fixed points on the mood map (3 per quadrant), for the front page demo. Each quadrant gets one literal and one abstract search from its scene list, picked by the UTC date so the set changes daily; each point takes the best photo for its own palette (`RankPhotos`) not used by another point. Cached in memory for 6 hours, one fetch at a time; failures are remembered for a minute. 502 when every search failed (the page then falls back to the mock placeholders, without credits). |
| `GET /api/health` | Health check. Metrics are served on `METRICS_PORT` at `/metrics`. |

Errors are JSON `{"error": "<message to show the user>"}`. `POST /api/mixes` returns:

| Status | When |
|---|---|
| 201 `{id}` | Created, or the same input already exists (the id is content-addressed). |
| 400 | Not JSON; nothing recognisable; artist, show or `spotify.link` links; a playlist or album mixed with tracks; two playlists; more than `MAX_PASTE_TRACKS`; an empty playlist; a vibe over 200 characters. |
| 403 | Spotify reports the link as private or unavailable (rare: see below). |
| 404 | Spotify has no such playlist, album or track. Spotify serves the same not-found page for private playlists, so private playlists land here too; the message suggests copying the tracks. |
| 429 | Over `RATE_LIMIT_PER_MINUTE` per client ip or `GLOBAL_RATE_LIMIT_PER_MINUTE` overall, with `Retry-After`. Fixed one-minute windows. With `TRUST_PROXY`, the ip comes from `CLIENT_IP_HEADER` (rightmost entry for `X-Forwarded-For`). |
| 502 | Spotify failed or its embed page changed shape. |
| 503 | 1000 or more tracks are already waiting for analysis and this mix would add to them, with `Retry-After: 30`. A mix whose job is already in memory, or whose tracks are all cached, is never refused. |

`GET /api/mixes/{id}` and `/events` return 404 for unknown ids. The event stream sends a
`: ping` comment every 15s and closes after `done` or `error`, so clients should close their
`EventSource` on those events rather than let it reconnect. A client that falls 256 events behind
is disconnected; reconnecting starts again from a fresh `snapshot`.

### Runner

An in-process job registry fans events out to subscribers. For each job:

1. Resolve metadata for uncached tracks with `Catalog.Track`, limited by `SPOTIFY_CONCURRENCY`.
2. For tracks without cached features: `Preview`, then `Analyzer.Analyze` in a global pool limited
   by `ANALYZE_CONCURRENCY`, with in-flight dedupe per track id.
3. `PutFeatures` and emit events.

A job that times out (5 minutes) finishes with partial results. Tracks without a preview are
`no_audio`, ids Spotify doesn't know are `not_found`, and errors or timeouts are `failed`. A job
that analyses nothing ends with an `error` event and status `failed`; otherwise it ends with
`done`.

Finished jobs stay in memory for 10 minutes; after that, or after a restart, a mix is rebuilt
from the database and a job starts again if any track lacks features. Only features are stored
per track, so `no_audio` and `failed` tracks are retried then. Preview URLs are short lived, so
tracks that weren't just fetched with their playlist or album are looked up again with
`Catalog.Track` before analysis.

### Photo pipeline

`mix.Covers` runs it; `cmd/tune` prints every step for a link and, with `-sheet out.jpg`, draws
a contact sheet of the 12 picks labelled by lens and query (`-seed` shows a shuffle).

The first version ran three literal searches, and every cover in a set showed the same scene
(all concert crowds for Beast Mode, all empty halls for Peaceful Piano). Now a set draws about
seven searches from several **lenses**, so the 12 covers span different kinds of image:

| Lens | Queries | Source |
|---|---|---|
| vibe | 0–1 | the vibe text verbatim, always first |
| literal | 2–3 | scenes for the dominant genre family, or a strong modifier, and the mood quadrant |
| abstract | 2–3 | light, shadow, texture, reflections, blur, silhouettes, haze, colour fields |
| words | 0–2 | evocative words from the track titles and the playlist or album name |
| color | 1 | `/posts` by the target palette's colour name plus a keyword for that colour and mood quadrant (`orange sunset`, not `orange building`) |

1. Mood × energy picks a quadrant. `scenes.json` has 18 caption-style `literal` and 18
   `abstract` sentences per quadrant. Every sentence was checked to return at least 15 usable
   photos from `/search`, and sets were tuned on contact sheets. Abstract sentences map mood
   and energy to texture: calm is stillness, haze, pastel and empty space; energetic is blur,
   streaks, flash and saturated colour; sad is night, shadow and fog; happy is sun flare, warm
   light and overexposure.
2. The dominant genre family (at least 30% of the genre weight; discogs styles are matched before
   parents, so `Electronic---Ambient` is ambient, not electronic) has 15 `happy` and 15 `sad`
   literal scenes (mood ≥ 0.5 picks happy) and 10–12 `abstract` ones. The family supplies the
   first two literal scenes and the quadrant only a third: in tuning, hip hop at mood 0.6 got
   picnics and morning coffee from the happy-calm quadrant. Without a family, a strong acoustic,
   instrumental or party score supplies modifier scenes (12–15 each) alternating with the
   quadrant's. With a family the modifier is ignored: Kind of Blue is instrumental, but a
   waterfall is no cover for it.
3. **Title words.** Track titles (without "(feat. …)", "[Remix]" or " - Remastered") and the
   playlist or album name are split into words. Stopwords (genre words, "love", "baby", "remix",
   pronouns…) are dropped and plurals of evocative words are made singular. A word scores one
   per title it is in, +2 for being in the name and +1.5 for being on the `title_words` list
   (about 80 evocative words, each with at least 25 analogdb posts: rain, night, summer, ocean,
   moon, blue, gold…). Name words and words in two or more titles qualify; an evocative word in
   one title qualifies only for mixes with fewer than 20 tracks (in a 100-track playlist,
   "Midnight Sun" and "Waterfalls" gave a sun and a waterfall to Beast Mode). Colour words other
   than blue are stopwords: "White Ferrari" gave Blonde a white dog and an egret. Evocative
   words are searched as they are; the other top candidates (at most 3 per set) need 20 posts on
   `/keyword/{word}` (cached). At most 2 words become searches. Ties are broken by the seed.
4. **Colour.** `ColorName` maps the target palette to an analogdb colour: tan, yellow, orange,
   red as happy mixes get more energetic; gray, navy, then purple for sad ones (analogdb's navy
   includes bright tropical blues, which don't suit the calmest mixes). It is paired with a
   seeded keyword from that colour's `colors` list (lake, snow, fog… for gray), chosen for having
   plenty of posts in that colour and few people in swimwear, and listed with
   `/posts?sort=random&seed=…&grayscale=false&ratio_min=0.66&ratio_max=1.5`. This is the
   loosest lens: it adds colour-field images, and sometimes a portrait.
5. **Order**, seven queries besides the vibe: literal, abstract, word, literal, abstract, colour,
   word, then literal and abstract scenes alternate to fill. Abstract scenes alternate family →
   quadrant. Sentences are picked by a hash of the
   seed key (the mix id, plus `#seed` when shuffled) and the slot, never repeating, so a mix
   always gets the same set for a seed while mixes in the same quadrant differ.
6. **Requests.** Searches run two at a time (`/search`, page size 50, `nsfw=false`,
   `sprocket=false`). The analogdb client caches each page (search text normalised, colour
   query) for an hour, because many mixes share sentences, and retries 429, 5xx and network
   errors up to 3 attempts, after 250ms then 750ms or the server's `Retry-After` (giving up at
   once if that is over 2s). A failing lens is left out; only if every search fails is it a 502.
   A cold set is 7 or 8 searches plus 0–3 keyword lookups (7–10 requests) and took 0.6–2.8s in
   tuning; the timing is logged at debug level.
7. Merge by id, then keep photos with a `high` image of at least 1440px on the long side, an aspect
   ratio of 0.66–1.5 and a name the proxy serves. Grayscale photos are kept only for sad, calm
   mixes. White scan borders are fine.
8. Score = 0.55 search rank (weighted by query: vibe 1.2, first literal and abstract 1, word
   0.95, second literal and abstract 0.9, colour 0.85, fill 0.8; plus a bonus for matching several
   queries) + 0.3 colour similarity (each photo colour's Lab distance to the nearest target
   colour, weighted by its share) + 0.1 log upvotes + 0.05 jitter seeded by the seed key. The
   target palette is five tones of one hue, shadow to highlight: happy is warm (golden when
   calm, orange-red when energetic), sad is cool (blue when calm, violet when energetic); energy
   raises saturation and mood lightness.
9. **Diversity.** `Diversify` picks the 12 greedily, like maximal marginal relevance: each step
   takes the best score minus 0.04 per photo already picked from its query, 0.03 per photo from
   its lens, 0.15 per photo by the same author, 0.6 × how far its palette similarity to a picked
   photo is above 0.75, and 0.3 × how far its analogdb keyword overlap (Jaccard) with a picked
   photo is above 0.3. A query gives at most 2 photos while others have photos left. The vibe is
   the exception: its best 3 photos (by the same author and lookalike rules) lead the set, so
   re-searching with new words visibly adds them. The pick order interleaves the lenses.
10. The picks have their image URLs rewritten to `/api/img/{name}`. Photo sets are cached in
    memory for 30 minutes by mix id, vibe, seed and coverage in tens of tracks. `PhotoSet.queries`
    lists every query, in order, for the "searched for …" line.

The tune CLI runs links one at a time to stay under analogdb's rate limit.

### Metrics

- `mixtake_spotify_requests_total{kind,result}`, which includes a `parse_error` canary
- `mixtake_analyzer_duration_seconds`
- `mixtake_analyzer_queue_depth`
- `mixtake_feature_cache_total{result}`
- `mixtake_jobs_total{result}`
- `mixtake_analogdb_requests_total{result}`

## Analyzer sidecar

- `POST /analyze` (multipart audio) returns `{model_version, features}`. `GET /health`.
- Models load once from `MODELS_DIR`. Each head's positive-class index is read from its model
  JSON; the class order differs between heads.
- One analysis at a time per process, behind a lock, in a worker thread so `/health` stays
  responsive. Scale with `ANALYZER_WORKERS` uvicorn processes; each needs about 1.7 GB.
- `scripts/fetch_models.sh` downloads the models from essentia.upf.edu (or, with
  `MODELS_LAYOUT=flat`, a mirror such as a `models-v1` release) and checks them against
  `models.lock`.
- Tests use synthetic numpy audio.

## Web

- `next dev` proxies `/api` to `API_URL` (default `:8080`); production is a static export served
  by Go.
- Theme and layering follow samila-ui.
- Look: soft embossed paper. The page, panels and controls share one warm paper colour; panels
  and buttons are raised, and inputs, tracks and placeholders are pressed in, using two shadows
  (light top-left, dark bottom-right) from the `--mix-raised`/`--mix-pressed` tokens in
  `styles/index.css`. Mantine stays: `styles/emboss.css` restyles its components in the
  `components` layer. Charts and photos stay flat. Light is the default; dark is a dim warm grey
  rather than black, because emboss needs room for a highlight. A fixed grain overlay adds
  paper texture. This favours the look over contrast, on purpose.
  Colour comes from content and light rather than surfaces: photos, mood-coloured marks, a soft
  glow behind the home hero leaking the front cover photo's own colours (through a frosted header), and amber for the primary action
  (Analyze, filled amber once the input is valid).
  Raised means pressable and pressed means an input, a readout or the current choice (the
  leading search phrase, the status pill, gauge grooves); emboss is never the only sign of a
  state, which also gets amber or an icon. Letterpress text-shadow is for display text only.
- Pages:
  - `/`: a hero with the title, the input and, beside it (above it on small
    screens), a fanned pile of four example covers, one per quadrant, drawn with the studio's
    `drawCover` from the showcase photos; the front print changes every 5s (paused on hover or
    focus, still under reduced motion) and the glow behind the hero takes up to three of its photo's colours (`glowColours`). Then
    example playlists as cards (name, quadrant, a few dots), then a "how it works"
    section (`#how`) shown rather than told: Paste → Listen → Develop tiles that play once when
    scrolled into view, a mood pad (drag a knob over the map and the nearest showcase photo
    crossfades in, credited to its photographer, with mood and energy gauges; drifts on its own until touched, still under
    reduced motion)
  - `/mix?id=…`: results
  - `/about` redirects (301) to `/#how`
- Components:
  - InputBox: detects a link or a paste; explains private playlists
  - ProgressHeader
  - Charts: Summary (facets and gauges, which replace the tempo/key panel), MoodMap (live
    scatter on a 10-point grid), Sound (genres and top artists in one panel), EnergyArc
  - MoodMap and EnergyArc fit their axes to the songs (`lib/domain.ts`: padded, snapped, at least
    0.3 wide), so calm or sad mixes aren't squashed into a corner. MoodMap has a fit/whole toggle
    and an inset of the whole map with the zoomed window outlined.
  - One sort for the page (`lib/sort.ts`): playlist order, energy, mood or tempo, either way.
    The energy arc and the song list both follow it and both have the control. In playlist order
    the arc is smoothed over five songs; sorted, it plots each analysed song's own values. The
    arc's tooltip names the song; the list keeps each song's playlist number.
  - Linked highlighting (`lib/highlight.tsx`): hovering a song (mood map dot, energy arc, track
    row), a genre or an artist highlights the same songs everywhere; a click pins it, Esc or a
    click on empty space clears it. A genre covers a song when it is the song's top genre or
    scores at least 0.2.
  - Song dots and the track list's mood bars are coloured with TargetPalette's hue rule
    (`lib/moodColour.ts`), so the charts preview the cover's palette.
  - CoverStudio: photo strip with shuffle, more-like-this, pan-to-crop canvas, text overlay (4–5
    self-hosted fonts; drag the text anywhere or pick one of 3×3 presets; colours from the
    photo, the mix palette or a picker)
  - Dragging text: a pointer-down inside the text's box (`textBox` in `lib/canvas.ts`) moves the
    text, anywhere else pans the photo. Within 3% of a preset's centre the text snaps to it and
    `pos` becomes that preset; elsewhere `pos` is `free` with the box centred on `tx`, `ty`. Snap
    guides are an SVG overlay on the preview, never drawn into the export.
- Text is kept short: labels and numbers on the page, explanations behind `Info` icons (Mantine
  popover on hover, focus or tap) and tooltips. Full sentences are kept for errors.
  - Tooltips and `Info` text are 5–7 words with no commas, semicolons or periods. Controls whose
    effect is plain from using them (text color, shade, the cover panel) get none.
  - The summary's facets and gauges explain themselves from their round icon only.
  - American spelling in everything a user sees (color, center, analyze). No site footer and no
    credits page: the Listen step's (i) credits Essentia and its license, and the mood pad
    credits each photo's author behind a camera icon.
  - ShareBar: JPG at 1500 or 3000 px, copy link; a warning icon (details on hover) when the
    crop is smaller than a size and will be upscaled. Zoom is capped at 2.5×.
  - Listen: collapsed Spotify embed player
- Cover studio:
  - `lib/canvas.ts` `drawCover` draws both the preview and the export. Crop, text and colour are
    fractions of the square, so the output doesn't depend on its size.
  - Fonts (Instrument Serif, Space Grotesk, Bebas Neue, IBM Plex Mono, Caveat) are woff2 files in
    `public/fonts` with `@font-face`, not `next/font`, so the build needs no network and the canvas
    knows the family names.
  - The photographer's credit stays on the page and is never drawn on the image.
  - A cover is three layers (`CoverState`): a background `Fill` (solid or a two-color
    horizontal, vertical, radial or diagonal gradient), the photo in a `Frame` (centre, size and
    corner radius as fractions; full bleed by default, which hides the background) and a list of
    `TextItem`s drawn in order. Text presets place a box on the whole cover, not the frame, so
    text can sit on the background beside an inset photo. Auto text color samples the background
    and photo together.
  - Share links: `photo`, `vibe` (re-search words), `like` ("more like this" source) and `seed`
    (shuffle) stay readable params, since they choose the photos. The cover is one `c` param:
    short-key JSON (`v: 2`), base64url, with values equal to the defaults left out; the first text
    item's text defaults to the playlist's name. Old links with one param per setting (`x`,
    `title`, `font`, …) are still read and rewritten as `c`. A link refetches the mix's set with
    `vibe` and the `like` set, then looks up `photo` in them. If the photo isn't in either, the
    studio shows the first photo with the same text and says so.
  - The controls are three tabs. **Layout**: presets (Full bleed, Inset, Poster, Polaroid,
    Band) that set the frame and where the title goes, then the photo's position (3×3), shape
    (square, 4:3, 3:4, 2:1), size and corners, then zoom (`lib/layouts.ts`). An anchored frame's
    longer side gets equal margins. **Background**: solid or one of four gradients, colors from the
    photo and the mix or any hex, swap, and shuffle (`pickPair` in `lib/colours.ts`). Picking a
    framed preset while the background is still the default takes its colors from the photo.
    **Text**: the title and subtitle, typeface, position, alignment, size, color and shade.
    Dragging pans the photo only when it starts inside the frame.
  - Undo and redo (⌘Z, ⇧⌘Z, or the arrows under the preview) cover every edit; edits within
    600 ms are one step, so a slider drag undoes at once. Picking a photo isn't a step.
  - Mock mode serves 12 generated scenes from `public/mock`.

## Tooling

- **justfile**:
  - `install`, `models`
  - `api`: fake analyzer unless `ANALYZER_URL` is set
  - `analyzer`, `web`, `start`
  - `serve`: `-tags embedweb`
  - `test`, `fmt`, `check`, `tune link=… vibe=… seed=… sheet=…`
  - `docker-build`, `up`, `down`: build both images, run and stop the compose stack
- **Static files**: embedded behind the `embedweb` build tag; the dev binary serves the API only.
- **Images**:
  - `evanofslack/mixtake`: node build, Go cross-compile, distroless static, nonroot, `/data`
    volume, amd64 and arm64. `mixtake healthcheck` backs the `HEALTHCHECK`, since distroless has
    no shell.
  - `evanofslack/mixtake-analyzer`: amd64 only, python:3.12-slim, models fetched at build time
    from the `models-v1` release and checked against `models.lock`. `--build-context
    models=analyzer/models` uses local copies for an offline build.
- **CI** (`ci.yml`, PRs and main): gofmt, `go vet`, `go test -race`; prettier, type-check, build,
  and the embedweb Go build; ruff and pytest, with the models fetched from the release and cached
  so the model tests run.
- **Publish** (`publish.yml`, main and `v*` tags): both images to Docker Hub with buildx and the
  GHA layer cache. Tags: `latest` on main, `main`, `sha-<short>`, and `X.Y.Z`/`X.Y` on tags.
  Needs the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets.

## Deployment

Prod is an amd64 Ubuntu VPS with 8 GB RAM at `mixtake.evanslack.dev`, behind Caddy and a proxied
Cloudflare DNS record, like samila.

- **Setup**: copy `docker-compose.yaml` and `.env.example` (as `.env`) into a directory on the VPS,
  then `docker compose pull && docker compose up -d`. Update the same way.
- **Caddy**: compose binds the app to `127.0.0.1:8080` (`MIXTAKE_PORT` if that's taken):

  ```caddyfile
  mixtake.evanslack.dev {
      encode zstd gzip
      reverse_proxy 127.0.0.1:8080
  }
  ```

  SSE streams through `reverse_proxy` without extra settings.
- **Cloudflare**: a proxied A record for `mixtake`, SSL mode Full (strict). The app reads the
  client ip from `CF-Connecting-IP` (`TRUST_PROXY=true`), so rate limits are per visitor rather
  than per Cloudflare edge.
- **Sizing**: each analyzer worker needs about 1.7 GB, so 8 GB runs `ANALYZER_WORKERS=2` with
  `ANALYZE_CONCURRENCY=4`. Keep `ANALYZE_CONCURRENCY` at least `ANALYZER_WORKERS`. Both are set in
  `.env` and apply on `docker compose up -d`, with no rebuild.
- **Backups**: the `mixtake_mixtake-data` volume holds `mixtake.db`. A consistent copy while
  running: `docker run --rm -v mixtake_mixtake-data:/data -v "$PWD":/backup alpine
  sh -c 'apk add -q sqlite && sqlite3 /data/mixtake.db ".backup /backup/mixtake.db"'`. Losing it
  loses saved mixes and the feature cache, nothing else.
- **Metrics**: `/metrics` on `127.0.0.1:9090` (`MIXTAKE_METRICS_PORT`) for a local Prometheus.

## Delivery

All PRs target `main`. Dependent Go PRs go in a `gh stack`, and independent tracks run in parallel
worktrees.

1. **Add v2 plan and conventions**: remove the 2022 code; add this plan, CLAUDE.md, README stub;
   publish the `models-v1` release.
2. **Scaffold Go server and web**: config, domain types and interfaces, server shell, metrics, web
   shell with theme, justfile.
3. Wave 1, in parallel:
   - Backend stack:
     - **Parse Spotify embeds and inputs**
     - **Add SQLite store**
     - **Stream mix analysis jobs**
   - **Add Essentia analyzer sidecar**
   - **Build live analysis page**
4. Wave 2, in parallel:
   - **Pick covers from analogdb**
   - **Add cover studio editor**
5. **Add Docker, compose, CI**
6. **Finalize README and CLAUDE.md**

## Verification

- `just check` passes locally and in CI.
- Unit tests:
  - embed parser on saved playlist, album and track HTML
  - input parser on `?si=` links, `spotify:track:` URIs, mixed lines, albums and junk
  - profile maths
  - scene and ranking determinism
  - store on a temp SQLite file
  - runner with fakes: dedupe, partial results, cache hits
  - handlers and SSE via `httptest`
- macOS integration (`just models && just start`):
  - A New Music Friday link streams tracks onto the mood map; about 100 tracks finish in under a
    minute, and a repeat is instant.
  - Pasted desktop-app track links work for a private playlist.
  - An album link works.
  - A private playlist link gives a helpful error.
- Covers:
  - `just tune` spot-check across 10 playlists
  - crop, text and download produce a correct JPG
  - the share link reproduces the cover in a fresh browser
  - light and dark mode both look right
- `docker compose up` on amd64 runs the same flow, and `/metrics` shows the counters.
