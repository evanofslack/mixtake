# syntax=docker/dockerfile:1
# mixtake-analyzer: the Essentia sidecar. essentia-tensorflow only has x86_64 Linux wheels, so the
# image is amd64. Build with analyzer/ as the context:
#
#   docker buildx build --platform linux/amd64 -t mixtake-analyzer analyzer
#
# The models are downloaded from the models-v1 GitHub release and every file is checked against
# models.lock. For an offline build, pass local copies as the `models` build context; files that
# already match the lock are not downloaded:
#
#   docker buildx build --platform linux/amd64 --build-context models=analyzer/models \
#       -t mixtake-analyzer analyzer

# empty unless replaced with --build-context models=<dir>
FROM scratch AS models

FROM --platform=linux/amd64 python:3.12-slim AS fetch
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
ARG MODELS_BASE_URL=https://github.com/evanofslack/mixtake/releases/download/models-v1
ARG MODELS_LAYOUT=flat
COPY models.lock ./
COPY scripts/fetch_models.sh scripts/
COPY --from=models / models/
# fetch what's missing, verify everything, then drop any files that aren't in the lock
RUN MODELS_DIR=/src/models MODELS_BASE_URL="$MODELS_BASE_URL" MODELS_LAYOUT="$MODELS_LAYOUT" \
    scripts/fetch_models.sh \
    && cut -d' ' -f3 models.lock | sed 's|^|models/|' > keep \
    && find models -type f | grep -vxFf keep | xargs -r rm -f

FROM --platform=linux/amd64 python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_NO_CACHE=1 UV_PYTHON_DOWNLOADS=never \
    UV_NO_ENV_FILE=1
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev

# same base as the builder, so the venv's interpreter paths stay valid
FROM --platform=linux/amd64 python:3.12-slim
RUN useradd --system --uid 10001 --no-create-home analyzer
WORKDIR /app
COPY --from=build /app/.venv .venv
COPY --from=fetch /src/models models
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
