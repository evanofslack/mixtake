"""Synthetic test audio."""

import io
import os
import wave
from pathlib import Path

import numpy as np

MODELS_DIR = Path(os.environ.get("MODELS_DIR", Path(__file__).resolve().parents[1] / "models"))
SAMPLE_RATE = 44100


def click_track(bpm: float = 120.0, seconds: float = 12.0, sr: int = SAMPLE_RATE) -> np.ndarray:
    """A kick-like click on every beat over an A minor chord, in [-1, 1]."""
    t = np.arange(int(seconds * sr)) / sr
    chord = sum(np.sin(2 * np.pi * f * t) for f in (220.0, 261.63, 329.63)) * 0.1
    clicks = np.zeros_like(t)
    beat = int(sr * 60 / bpm)
    n = int(0.03 * sr)
    env = np.exp(-np.linspace(0, 8, n))
    burst = np.sin(2 * np.pi * 80 * np.arange(n) / sr) * env
    for start in range(0, len(t) - n, beat):
        clicks[start : start + n] += burst * 0.8
    return np.clip(chord + clicks, -1, 1)


def wav_bytes(samples: np.ndarray, sr: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((samples * 32767).astype("<i2").tobytes())
    return buf.getvalue()
