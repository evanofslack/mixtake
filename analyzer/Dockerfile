# mixtake-analyzer: the Essentia sidecar. essentia-tensorflow only has x86_64 Linux wheels, so the
# image is amd64. Build with analyzer/ as the context:
#
#   docker build --platform linux/amd64 -t mixtake-analyzer analyzer
#
# Models already in analyzer/models are used as they are; any that are missing are downloaded
# from MODELS_BASE_URL and every file is checked against models.lock.

FROM --platform=linux/amd64 python:3.12-slim AS models
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
ARG MODELS_BASE_URL=https://essentia.upf.edu/models
ARG MODELS_LAYOUT=upf
COPY models.lock ./
COPY scripts/fetch_models.sh scripts/
# the glob copies analyzer/models if it exists and is skipped if it doesn't
COPY models.lock model[s] models/
RUN MODELS_DIR=/src/models scripts/fetch_models.sh && rm models/models.lock

FROM --platform=linux/amd64 python:3.12-slim AS build
RUN pip install --no-cache-dir uv==0.13.6
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_NO_ENV_FILE=1
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev

FROM --platform=linux/amd64 python:3.12-slim
RUN useradd --system --uid 10001 --no-create-home analyzer
WORKDIR /app
COPY --from=build /app/.venv .venv
COPY --from=models /src/models models
COPY app app
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    MODELS_DIR=/app/models \
    ANALYZER_WORKERS=1
USER analyzer
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers \"$ANALYZER_WORKERS\""]
