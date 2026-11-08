"""Essentia feature extraction for one track's audio.

The models are loaded once by `Analyzer`. Each call to `Analyzer.analyze` decodes the audio, runs
the discogs-effnet embedding through the mood, voice/instrumental and genre heads, runs
msd-musicnn through DEAM for valence and arousal, and measures tempo and key. The result matches
the Go `mix.Features` JSON.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

log = logging.getLogger(__name__)

# Identifies the models and the way features are computed from them. Bump the trailing version
# whenever the feature computation changes, so mixtake recomputes cached features.
MODEL_VERSION = "essentia-effnet1-deam2-v1"

EFFNET = "discogs-effnet-bs64-1"
MUSICNN = "msd-musicnn-1"
DEAM = "deam-msd-musicnn-2"
GENRE = "genre_discogs400-discogs-effnet-1"

# feature name -> (classification head, positive class name in the head's JSON "classes")
HEADS: dict[str, tuple[str, str]] = {
    "danceable": ("danceability-discogs-effnet-1", "danceable"),
    "happy": ("mood_happy-discogs-effnet-1", "happy"),
    "sad": ("mood_sad-discogs-effnet-1", "sad"),
    "relaxed": ("mood_relaxed-discogs-effnet-1", "relaxed"),
    "aggressive": ("mood_aggressive-discogs-effnet-1", "aggressive"),
    "party": ("mood_party-discogs-effnet-1", "party"),
    "acoustic": ("mood_acoustic-discogs-effnet-1", "acoustic"),
    "instrumental": ("voice_instrumental-discogs-effnet-1", "instrumental"),
}

MODEL_NAMES = [EFFNET, MUSICNN, DEAM, GENRE, *(head for head, _ in HEADS.values())]

TOP_GENRES = 3
# discogs-effnet needs at least one 128-frame patch (about 2 s at 16 kHz); ask for a bit more.
MIN_SECONDS = 3.0

# Essentia names some keys with flats; Go and the web use sharps.
_SHARPS = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}


class ModelsMissingError(RuntimeError):
    """Some model files aren't in the models directory."""


class AudioError(ValueError):
    """The audio can't be decoded or is too short to analyse."""


def positive_index(classes: list[str], positive: str) -> int:
    """Return the index of the positive class. Heads order their classes differently."""
    try:
        return classes.index(positive)
    except ValueError:
        raise ValueError(f"class {positive!r} not in {classes}") from None


def normalize_key(key: str) -> str:
    return _SHARPS.get(key, key)


def deam_to_unit(x: float) -> float:
    """DEAM predicts on a 1–9 scale; map it to 0–1."""
    return clamp01((x - 1.0) / 8.0)


def clamp01(x: float) -> float:
    return float(min(1.0, max(0.0, x)))


def top_genres(scores: np.ndarray, labels: list[str], n: int = TOP_GENRES) -> list[dict[str, Any]]:
    order = np.argsort(scores)[::-1][:n]
    return [{"name": labels[i], "score": round(float(scores[i]), 4)} for i in order]


def missing_models(models_dir: Path) -> list[str]:
    return [
        f"{name}{ext}"
        for name in MODEL_NAMES
        for ext in (".pb", ".json")
        if not (models_dir / f"{name}{ext}").is_file()
    ]


@dataclass
class _Head:
    feature: str
    model: Any
    index: int


class Analyzer:
    """Holds the loaded models. `analyze` is serialised by a lock, since Essentia's TensorFlow
    predictors aren't documented as thread-safe; run more processes to analyse in parallel."""

    model_version = MODEL_VERSION

    def __init__(self, models_dir: str | os.PathLike[str]):
        models_dir = Path(models_dir)
        missing = missing_models(models_dir)
        if missing:
            raise ModelsMissingError(
                f"{len(missing)} model files missing from {models_dir.resolve()}: "
                f"{', '.join(missing)}. Run `just models` or scripts/fetch_models.sh."
            )

        import essentia

        essentia.log.warningActive = False
        import essentia.standard as es

        self._es = es
        self._lock = threading.Lock()

        def meta(name: str) -> dict[str, Any]:
            return json.loads((models_dir / f"{name}.json").read_text())

        def graph(name: str) -> str:
            return str(models_dir / f"{name}.pb")

        start = time.perf_counter()
        self._effnet = es.TensorflowPredictEffnetDiscogs(
            graphFilename=graph(EFFNET), output="PartitionedCall:1"
        )
        self._heads = [
            _Head(
                feature=feature,
                model=es.TensorflowPredict2D(graphFilename=graph(head), output="model/Softmax"),
                index=positive_index(meta(head)["classes"], positive),
            )
            for feature, (head, positive) in HEADS.items()
        ]
        self._genre = es.TensorflowPredict2D(
            graphFilename=graph(GENRE),
            input="serving_default_model_Placeholder",
            output="PartitionedCall:0",
        )
        self._genre_labels: list[str] = meta(GENRE)["classes"]
        self._musicnn = es.TensorflowPredictMusiCNN(
            graphFilename=graph(MUSICNN), output="model/dense/BiasAdd"
        )
        self._deam = es.TensorflowPredict2D(graphFilename=graph(DEAM), output="model/Identity")
        deam_classes = meta(DEAM)["classes"]
        self._valence = positive_index(deam_classes, "valence")
        self._arousal = positive_index(deam_classes, "arousal")
        self._rhythm = es.RhythmExtractor2013(method="multifeature")
        self._key = es.KeyExtractor()
        log.info("loaded models from %s in %.1fs", models_dir, time.perf_counter() - start)

    def analyze_bytes(self, data: bytes, suffix: str = ".mp3") -> dict[str, Any]:
        """Analyse encoded audio (MP3, WAV, …). Essentia decodes from a file, so it's written to
        a temporary one first."""
        with tempfile.NamedTemporaryFile(suffix=suffix) as f:
            f.write(data)
            f.flush()
            return self.analyze(f.name)

    def analyze(self, path: str | os.PathLike[str]) -> dict[str, Any]:
        with self._lock:
            return self._analyze(str(path))

    def _analyze(self, path: str) -> dict[str, Any]:
        es = self._es
        timings: dict[str, float] = {}
        t = time.perf_counter()
        try:
            audio16 = es.MonoLoader(filename=path, sampleRate=16000, resampleQuality=4)()
            audio44 = es.MonoLoader(filename=path, sampleRate=44100)()
        except RuntimeError as e:
            raise AudioError(f"can't decode audio: {e}") from e
        if len(audio16) < MIN_SECONDS * 16000 or not np.any(audio16):
            raise AudioError(f"audio is silent or shorter than {MIN_SECONDS:.0f}s")
        timings["decode"] = _lap(t)

        t = time.perf_counter()
        emb = self._effnet(audio16)
        features: dict[str, Any] = {}
        for head in self._heads:
            features[head.feature] = clamp01(head.model(emb).mean(axis=0)[head.index])
        genres = top_genres(self._genre(emb).mean(axis=0), self._genre_labels)
        timings["effnet"] = _lap(t)

        t = time.perf_counter()
        va = self._deam(self._musicnn(audio16)).mean(axis=0)
        timings["deam"] = _lap(t)

        t = time.perf_counter()
        bpm = float(self._rhythm(audio44)[0])
        key, scale, _strength = self._key(audio44)
        timings["rhythm_key"] = _lap(t)
        log.debug("analysed %s in %s", path, timings)

        return {
            "tempo": round(bpm, 1),
            "key": normalize_key(key),
            "mode": "minor" if scale == "minor" else "major",
            **{k: round(v, 4) for k, v in features.items()},
            "valence": round(deam_to_unit(float(va[self._valence])), 4),
            "arousal": round(deam_to_unit(float(va[self._arousal])), 4),
            "genres": genres,
        }


def _lap(start: float) -> float:
    return round(time.perf_counter() - start, 3)
