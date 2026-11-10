# mixtake analyzer

A small FastAPI service that analyses a track's 30-second preview with
[Essentia](https://essentia.upf.edu) and returns the features mixtake uses: tempo, key and mode,
eight mood and character scores, valence and arousal, and the top three Discogs genres. The Go
server calls it through `internal/analyzer.Client`.

## What it computes

| Field | Model | Notes |
|---|---|---|
| `danceable`, `happy`, `sad`, `relaxed`, `aggressive`, `party`, `acoustic`, `instrumental` | discogs-effnet embeddings into the matching classification heads | The probability of the positive class, averaged over the clip. The positive class is looked up by name in each head's JSON, because heads order their classes differently. |
| `genres` | `genre_discogs400` on the same embeddings | Top 3 of 400 Discogs styles, e.g. `Electronic---House`. |
| `valence`, `arousal` | msd-musicnn embeddings into DEAM | DEAM predicts on 1–9; mapped to 0–1 with `(x−1)/8`. The range is compressed, so mixtake trusts the mood heads more. |
| `tempo` | `RhythmExtractor2013` (multifeature) | BPM, on 44.1 kHz audio. Octave errors (half or double tempo) happen. |
| `key`, `mode` | `KeyExtractor` | Keys are written with sharps (`A#`, not `Bb`). Mode is `major` or `minor`. |

All scores are 0–1. The models run on 16 kHz mono audio.

`model_version` (currently `essentia-effnet1-deam2-v1`) names the model set and the way features
are derived from it. mixtake caches features per model version, so bump `MODEL_VERSION` in
`app/analysis.py` whenever the models or the computation change.

## API

`GET /health`

```json
{"status": "ok", "model_version": "essentia-effnet1-deam2-v1"}
```

`POST /analyze` with a multipart form field `audio` (MP3, WAV or anything ffmpeg decodes; at most
5 MB):

```json
{
  "model_version": "essentia-effnet1-deam2-v1",
  "features": {
    "tempo": 120.2, "key": "G#", "mode": "major",
    "danceable": 0.99, "happy": 0.03, "sad": 0.31, "relaxed": 0.97, "aggressive": 0.01,
    "party": 0.03, "acoustic": 0.03, "instrumental": 0.99, "valence": 0.38, "arousal": 0.44,
    "genres": [{"name": "Electronic---Chillwave", "score": 0.41}, …]
  }
}
```

Errors are FastAPI's `{"detail": "…"}`: 400 when the audio can't be decoded or is shorter than
3 seconds or silent, 413 when it's over 5 MB, 422 when the `audio` field is missing.

## Configuration

| Variable | Default | |
|---|---|---|
| `MODELS_DIR` | `./models` | Where the `.pb` and `.json` model files are. The server refuses to start if any are missing. |
| `LOG_LEVEL` | `info` | `debug` logs per-stage timings for each track. |
| `ANALYZER_WORKERS` | `1` | Docker image only: uvicorn worker processes. |

`scripts/fetch_models.sh` reads:

| Variable | Default | |
|---|---|---|
| `MODELS_DIR` | `analyzer/models` | Download target. |
| `MODELS_BASE_URL` | `https://essentia.upf.edu/models` | Where to download from. |
| `MODELS_LAYOUT` | `upf` | `upf` uses essentia.upf.edu's per-model sub-paths; `flat` expects every file directly under `MODELS_BASE_URL`, such as a GitHub release download URL. |

It downloads the files listed in `models.lock` (sha256 and name), skips files that already match,
retries the flaky essentia.upf.edu, and fails on a checksum mismatch.

## Concurrency and resources

One analysis runs at a time per process, behind a lock: Essentia's TensorFlow predictors aren't
documented as thread-safe. The analysis runs in a worker thread, so `/health` stays responsive
while requests queue. To analyse in parallel, run more processes (`ANALYZER_WORKERS`); each loads
its own copy of the models.

On an Apple M5 a preview takes about 0.55–0.8 s end to end: decode 0.03 s, effnet and heads
0.34 s, musicnn and DEAM 0.1 s, rhythm and key 0.15 s. A worker's resident memory is about 450 MB
after loading the models and levels off around 1.5–1.7 GB once it has analysed a few tracks
(TensorFlow keeps its buffers), so budget roughly 1.7 GB per worker.

## Running on macOS

essentia-tensorflow has wheels for macOS (arm64 and x86_64) and Linux x86_64 only, with Python
3.12. From the repo root:

```sh
just models          # fetch the models into analyzer/models
just analyzer        # uvicorn on :8000 with --reload
just analyzer-test   # pytest; model-dependent tests skip without the models
just start           # analyzer, api (ANALYZER_URL=http://localhost:8000) and web
```

The tests only use synthetic audio generated with numpy (a click track over a chord); there are
no recorded fixtures.

## Docker

The image is `linux/amd64` only and its build context is `analyzer/`:

```sh
docker buildx build --platform linux/amd64 -t mixtake-analyzer analyzer
docker run --rm -p 8000:8000 -e ANALYZER_WORKERS=2 mixtake-analyzer
```

The build downloads the models from the `models-v1` GitHub release and checks every file against
`models.lock` (`--build-arg MODELS_BASE_URL=… MODELS_LAYOUT=…` picks another source). For an
offline build, add `--build-context models=analyzer/models` to use local copies; only files that
are missing or don't match are downloaded. The image runs as a non-root user, has a `HEALTHCHECK`
on `/health` and listens on port 8000. On Apple silicon the build and the container run under
emulation: it works, but a preview takes about 45 s instead of under 1 s.

## Licensing

- Essentia and essentia-tensorflow are [AGPL-3.0](https://essentia.upf.edu/licensing_information.html).
  Running this service over a network for other people means its source, including any changes,
  must be available to them.
- The Essentia models are [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/):
  attribution, non-commercial use only, and derivatives under the same licence. Using them
  commercially needs a licence from the Music Technology Group at UPF.
- The model files are not committed to this repository; `models.lock` only pins their checksums.
