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

# api and web together; ctrl-c stops both
start:
    #!/usr/bin/env bash
    trap 'kill 0' EXIT
    just api & just web & wait

# production-like: build the static export and serve it from one go binary on :8080
serve: install
    cd web && npm run build
    go run -tags embedweb ./cmd/mixtake

# go tests with the race detector
test:
    go test -race ./...

# format go and web code
fmt: install
    gofmt -w .
    cd web && npm run format

# same checks as ci
check: install
    test -z "$(gofmt -l .)" || (gofmt -l . && exit 1)
    go vet ./...
    go test -race ./...
    cd web && npm run format:check
    cd web && npm run type-check
    cd web && npm run build
    go build -tags embedweb -o /dev/null ./cmd/mixtake
