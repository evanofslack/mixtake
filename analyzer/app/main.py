"""HTTP API for the analyzer: GET /health and POST /analyze."""

from __future__ import annotations

import logging
import os
import re
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import PurePath
from typing import Any, Protocol

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.analysis import Analyzer, AudioError

MAX_AUDIO_BYTES = 5 * 1024 * 1024

log = logging.getLogger("app")


class AudioAnalyzer(Protocol):
    model_version: str

    def analyze_bytes(self, data: bytes, suffix: str = ".mp3") -> dict[str, Any]: ...


def load_analyzer() -> AudioAnalyzer:
    return Analyzer(os.environ.get("MODELS_DIR", "./models"))


def create_app(load: Callable[[], AudioAnalyzer] = load_analyzer) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper())
        # fails startup with a clear message if the models are missing
        app.state.analyzer = load()
        yield

    app = FastAPI(title="mixtake analyzer", lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "model_version": app.state.analyzer.model_version}

    @app.post("/analyze")
    async def analyze(audio: UploadFile) -> dict[str, Any]:
        data = await audio.read(MAX_AUDIO_BYTES + 1)
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(413, f"audio is larger than {MAX_AUDIO_BYTES} bytes")
        if not data:
            raise HTTPException(400, "audio is empty")
        suffix = PurePath(audio.filename or "").suffix
        if not re.fullmatch(r"\.[A-Za-z0-9]{1,5}", suffix):
            suffix = ".mp3"
        analyzer: AudioAnalyzer = app.state.analyzer
        start = time.perf_counter()
        try:
            # analysis is CPU bound and serialised; a worker thread keeps /health responsive
            features = await run_in_threadpool(analyzer.analyze_bytes, data, suffix)
        except AudioError as e:
            raise HTTPException(400, str(e)) from e
        log.info(
            "analysed %s (%d bytes) in %.2fs",
            audio.filename,
            len(data),
            time.perf_counter() - start,
        )
        return {"model_version": analyzer.model_version, "features": features}

    return app


app = create_app()
