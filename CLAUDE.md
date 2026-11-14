# mixtake

Paste a Spotify playlist, album or copied tracks, analyse the previews with Essentia, and build a
film-photo cover from analogdb. The design and delivery plan is in `docs/plan.md`; read it before
starting work, and update it when a decision changes.

## Layout

- `cmd/mixtake`: server entrypoint. `cmd/tune`: CLI for tuning the scene → photo mapping.
- `internal/mix`: domain types, the IO interfaces and all pure logic (input parsing, profile,
  scenes, ranking, job runner).
- `internal/{spotify,analyzer,analogdb,store,llm}`: implementations of the IO interfaces.
- `internal/server` (routes, middleware, static files), `internal/config` (env), `internal/logging`
  (slog setup, request ids), `internal/metrics`.
- `web/`: Next.js static export (pages router), Mantine 9, Tailwind 4. `web/embed.go` embeds
  `web/out` into the Go binary when it's built with `-tags embedweb`.
- `analyzer/`: Python Essentia sidecar (FastAPI, uv).

## Commands

Everything runs through `just`:

| Command | What it does |
|---|---|
| `just start` | API, analyzer and web for dev |
| `just api` | Go API on `:8080`; uses the fake analyzer unless `ANALYZER_URL` is set |
| `just web` | Next dev on `:3000`, proxying `/api` |
| `just models`, `just analyzer` | Fetch the models, then run the sidecar natively on macOS |
| `just check` | The same checks as CI; run it before opening a PR |
| `just test`, `just fmt` | Tests and formatting |

## Go conventions

- Prefer the standard library: `net/http` ServeMux patterns, `log/slog`, `embed`, `database/sql`.
  Third-party packages are limited to `modernc.org/sqlite` and `prometheus/client_golang` unless
  there is a strong reason.
- Interfaces exist **only at IO boundaries**: `Catalog`, `Analyzer`, `Photos`, `Muse` and
  `Store`, defined in `internal/mix` where they are consumed. Don't add interfaces for pure code; test it directly.
- Pass `context.Context` through everything that does IO. Log with `slog.InfoContext(ctx, …)` and
  the other `*Context` functions, so the request id that `internal/logging` stores in the context is
  attached to every line.
- Only add metrics for things worth alerting on. The list is in `docs/plan.md`.
- Tests:
  - table-driven, using `httptest`
  - fixtures in `testdata/`
  - SQLite tests use a temp file, not a mock
  - no network access in unit tests

## Web conventions

- Mantine components with Tailwind utilities. Colours come from CSS variables so light and dark
  both work.
- `lib/api.ts` mirrors the Go JSON types; keep them in sync.
- Next.js 16 differs from older versions: read the relevant guide in `web/node_modules/next/dist/docs/`
  before relying on a Next API.
- `?mock=1` runs the whole flow against `lib/mock.ts` with no backend, including the cover studio
  (photos from `public/mock`).
- `next dev` proxies `/api` to `API_URL` (default `http://localhost:8080`), e.g.
  `API_URL=http://localhost:8081 npm run dev` when 8080 is taken.
- Prettier with 4-space indents and a print width of 100.

## Python conventions

- uv only (`uv run`, `uv sync`). ruff for formatting and linting. pytest with synthetic audio, no
  copyrighted fixtures.
- Read each Essentia head's class order from its JSON. Never assume the positive class index.

## Git

- Work on a branch, never directly on `main`. Use worktrees for parallel work and `gh stack` for
  dependent PRs.
- Commit messages are 3–5 words. PR titles are 4–6 words with a 1–2 sentence description.
