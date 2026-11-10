# mixtake v2 plan

Paste a Spotify playlist link, album link, or a list of copied tracks. Watch the music get analysed
live (mood map, energy arc, genres, tempo and key), get a film-photo cover from
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
  - DEAM valence and arousal are compressed (roughly 0.36–0.64), so the mood and energy axes are
    derived from the mood heads.
- **analogdb** (`https://api.analogdb.com/v1`): caption-style scene queries work very well with
  `/search?q=`. Raw playlist names and album-art image search don't. `/search` has no colour
  filter (only `/posts` does), so colour ranking happens in Go. `i.analogdb.com` sends no CORS
  headers, so images are proxied through Go so the canvas can export them.
- No API keys are needed.

## Stack

- **Go** (std lib first): `net/http` ServeMux, `log/slog`, `embed`, `database/sql` with
  `modernc.org/sqlite`, and `prometheus/client_golang` for a few critical metrics.
- **Web**: Next.js static export (pages router), React 19, Mantine 9, `@mantine/charts`,
  Tailwind 4, Node 24. Light and dark mode.
- **Analyzer**: Python 3.12, FastAPI and Essentia, managed with uv, in its own container.
- **Deploy**: one `mixtake` image serves web and API. `analyzer` is a separate compose service.
  Prod is an amd64 Ubuntu VPS behind Caddy and Cloudflare at `mixtake.evanslack.dev`.

## Layout

```
cmd/mixtake/      wiring: config → clients → store → runner → server
cmd/tune/         tuning CLI: link → profile, scene queries, top photo URLs
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
    Search(ctx context.Context, q PhotoQuery) ([]Photo, error)
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
- Derived axes (v0, to be tuned):
  - `Mood = clamp(0.5 + (Happy − Sad) / 2)`
  - `Energy = 0.4·Party + 0.3·Aggressive + 0.3·(1 − Relaxed)`
- `Profile`: means and spreads, mood quadrant, energy arc in track order, tempo histogram, key
  counts, genre weights, top artists, coverage `{done, failed, total}` and a summary sentence.
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
| `GET /api/mixes/{id}/photos?vibe=` | `200 PhotoSet {queries, palette, photos}`: about 12 ranked analogdb photos for the current profile, plus the scene queries and target palette used. `vibe` (≤200 characters) overrides the mix's vibe for this search only. 404 unknown mix; 409 until 10 tracks are analysed (or the job finished with fewer, for short albums); 400 long vibe; 502 analogdb failed. |
| `GET /api/photos/{id}/similar` | `200 PhotoSet` with empty `queries` and `palette`: analogdb's similar photos, filtered, in analogdb's order, without the photo itself. 404 unknown photo (or one without a similarity embedding); 502 analogdb failed. |
| `GET /api/img/{name}` | Streams an `i.analogdb.com` image with `Cache-Control: public, max-age=31536000, immutable`. Only analogdb file names are served (404 otherwise): a uuid, or the older `<24 hex>-<low\|medium\|high\|raw>`, with `.jpeg`, `.jpg` or `.png`. 502 analogdb failed. |
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

`mix.Covers` runs it; `cmd/tune` prints every step for a link.

1. Mood × energy picks a quadrant, which maps to 6–10 caption-style scene sentences from an
   embedded `scenes.json`.
2. The dominant genre family (at least 30% of the genre weight; discogs styles are matched before
   parents, so `Electronic---Ambient` is ambient, not electronic) supplies two scenes from its
   happy or sad list (mood ≥ 0.5). The family beats the quadrant: in tuning, hip hop at mood 0.6
   got picnics from the happy-calm quadrant. Without a family, a strong acoustic, instrumental or
   party score adds a modifier scene next to the quadrant scene.
3. The vibe text is used verbatim as the first query. Playlist-name words that are real analogdb
   keywords (at least 20 posts, checked with `/keyword/{word}` and cached; genre words such as
   "rock" are stopwords) form another query.
4. At most 3 queries, in order: vibe; then either two family scenes, or a modifier and a quadrant
   scene; name keywords; then modifier and quadrant scenes to fill. Sentences are chosen by a
   hash of the mix id. The queries run in parallel as
   `/search` (page size 50, `nsfw=false`, `sprocket=false`); one failing is fine, all failing is a
   502.
5. Merge by id, then keep photos with a `high` image of at least 1440px on the long side, an aspect
   ratio of 0.66–1.5 and a name the proxy serves. Grayscale photos are kept only for sad, calm
   mixes.
6. Score = 0.55 search rank (weighted by query: vibe 1.2, first genre or quadrant scene 1,
   later ones 0.8–0.9, name 0.85; plus a bonus for matching several queries) + 0.3 colour similarity (each photo
   colour's Lab distance to the nearest target colour, weighted by its share) + 0.1 log upvotes +
   0.05 jitter seeded by the mix id. The target palette is a shadow, mid tone and highlight of one
   hue: happy is warm (golden when calm, orange-red when energetic), sad is cool (blue when calm,
   violet when energetic); energy raises saturation and mood lightness.
7. The top 12 have their image URLs rewritten to `/api/img/{name}`. Photo sets are cached in
   memory for 30 minutes by mix id, vibe and coverage in tens of tracks.

analogdb rate limits bursts (429), so the cache matters and the tune CLI runs links one at a
time.

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
- Pages:
  - `/`: input and example playlists
  - `/mix?id=…`: results
  - `/about`: credits
- Components:
  - InputBox: detects a link or a paste; explains private playlists
  - ProgressHeader
  - Charts: MoodMap (live scatter), EnergyArc, GenreBars, TempoKey, TopArtists, Summary
  - CoverStudio: photo strip, more-like-this, pan-to-crop canvas, text overlay (4–5 self-hosted
    fonts, 3×3 positions, palette colours)
  - ShareBar: JPG at 1500 or 3000 px, copy link
  - Listen: collapsed Spotify embed player
- Cover studio:
  - `lib/canvas.ts` `drawCover` draws both the preview and the export. Crop, text and colour are
    fractions of the square, so the output doesn't depend on its size.
  - Fonts (Instrument Serif, Space Grotesk, Bebas Neue, IBM Plex Mono, Caveat) are woff2 files in
    `public/fonts` with `@font-face`, not `next/font`, so the build needs no network and the canvas
    knows the family names.
  - The photographer's credit stays on the page and is never drawn on the image.
  - Share links: `photo`, `vibe` (re-search words), `like` ("more like this" source), `x`, `y`,
    `zoom`, `title`, `sub`, `font`, `pos`, `align`, `color`, `size`, `scrim` (defaults are
    omitted). A link refetches the mix's set with `vibe` and the `like` set, then looks up `photo`
    in them. If the photo isn't in either, the studio shows the first photo with the same text and
    says so.
  - Mock mode serves 12 generated scenes from `public/mock`.

## Tooling

- **justfile**:
  - `install`, `models`
  - `api`: fake analyzer unless `ANALYZER_URL` is set
  - `analyzer`, `web`, `start`
  - `serve`: `-tags embedweb`
  - `test`, `fmt`, `check`, `tune link=… vibe=…`, `docker`, `compose`
- **Static files**: embedded behind the `embedweb` build tag; the dev binary serves the API only.
- **Images**:
  - `mixtake`: node build, Go build, distroless static, nonroot, `/data` volume
  - `mixtake-analyzer`: amd64, python:3.12-slim, models fetched at build time
- **CI**: `go vet` and `go test -race`; web type-check and build; ruff and pytest.
- **Publish**: both images to Docker Hub.

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
