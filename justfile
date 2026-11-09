# ignore any UV_ENV_FILE from the shell; config comes from real env vars
export UV_NO_ENV_FILE := "1"

default:
    @just --list

# install web deps if missing
install:
    cd web && [ -d node_modules ] || npm ci

# go api on :8080 (fake analyzer unless ANALYZER_URL is set), metrics on :9090
api:
    go run ./cmd/mixtake

# next dev server on :3000, proxying /api to :8080
web: install
    cd web && npm run dev

# fetch the essentia models into analyzer/models; a no-op when they are already there
models:
    analyzer/scripts/fetch_models.sh

# essentia sidecar on :8000, natively (macOS or linux x86_64)
analyzer:
    cd analyzer && uv run uvicorn app.main:app --reload --port 8000

# analyzer tests; the model-dependent ones skip without `just models`
analyzer-test:
    cd analyzer && uv run pytest -q

# api, analyzer and web together; ctrl-c stops them all
start: models
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    just analyzer & ANALYZER_URL=http://localhost:8000 just api & just web & wait

# production-like: build the static export and serve it from one go binary on :8080
serve: install
    cd web && npm run build
    go run -tags embedweb ./cmd/mixtake

# build both docker images: the app for this machine, the analyzer for amd64 (emulated on arm64)
docker-build:
    docker buildx build --load -t evanofslack/mixtake:latest .
    docker buildx build --load --platform linux/amd64 -t evanofslack/mixtake-analyzer:latest analyzer

# run the compose stack in the background (settings from .env); `just down` stops it
up:
    docker compose up -d

# stop the compose stack; the data volume is kept
down:
    docker compose down

# go tests with the race detector
test:
    go test -race ./...

# format go and web code
fmt: install
    gofmt -w .
    cd web && npm run format
    cd analyzer && uv run ruff format . && uv run ruff check --fix .

# same checks as ci
check: install
    test -z "$(gofmt -l .)" || (gofmt -l . && exit 1)
    go vet ./...
    go test -race ./...
    cd web && npm run format:check
    cd web && npm run type-check
    cd web && npm run build
    go build -tags embedweb -o /dev/null ./cmd/mixtake
    cd analyzer && uv run ruff format --check . && uv run ruff check . && uv run pytest -q
