# mixtake

Film-photo covers and a mood analysis for your Spotify playlists.

Paste a playlist link, an album link, or tracks copied from the Spotify desktop app. mixtake
analyses each song's preview with [Essentia](https://essentia.upf.edu), streams the results onto
live charts, and picks a cover photo from [analogdb](https://analogdb.com) that matches the music.
You can then add text and download the cover.

> **Status:** v2 is being rebuilt from scratch. See [`docs/plan.md`](docs/plan.md). The 2022
> prototype is in the git history.

## Deploy

Two images on Docker Hub: `evanofslack/mixtake` (the Go server with the web app built in,
amd64 and arm64) and `evanofslack/mixtake-analyzer` (the Essentia sidecar, amd64 only). With
[`docker-compose.yaml`](docker-compose.yaml) and a `.env` copied from
[`.env.example`](.env.example):

```sh
docker compose pull && docker compose up -d
```

The app listens on `127.0.0.1:8080` for a reverse proxy, and its data lives in the
`mixtake_mixtake-data` volume. Each analyzer worker needs about 1.7 GB of RAM: set
`ANALYZER_WORKERS` (2 on an 8 GB host) and `ANALYZE_CONCURRENCY` (at least as many) in `.env`.
See the Deployment section of [`docs/plan.md`](docs/plan.md) for Caddy, Cloudflare and backups.

## License

MIT
