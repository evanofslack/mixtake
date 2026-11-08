from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main
from app.analysis import AudioError
from tests.audio import MODELS_DIR


class FakeAnalyzer:
    model_version = "fake-v1"

    def __init__(self):
        self.calls: list[tuple[bytes, str]] = []

    def analyze_bytes(self, data: bytes, suffix: str = ".mp3") -> dict[str, Any]:
        self.calls.append((data, suffix))
        if data.startswith(b"bad"):
            raise AudioError("can't decode audio")
        return {"tempo": 120.0, "key": "A", "mode": "minor"}


@pytest.fixture
def fake():
    return FakeAnalyzer()


@pytest.fixture
def client(fake):
    with TestClient(main.create_app(lambda: fake)) as c:
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "model_version": "fake-v1"}


def test_analyze(client, fake):
    r = client.post("/analyze", files={"audio": ("abc.mp3", b"ID3audio", "audio/mpeg")})
    assert r.status_code == 200
    assert r.json() == {
        "model_version": "fake-v1",
        "features": {"tempo": 120.0, "key": "A", "mode": "minor"},
    }
    assert fake.calls == [(b"ID3audio", ".mp3")]


@pytest.mark.parametrize(
    "filename, suffix", [("x.wav", ".wav"), ("noext", ".mp3"), ("x.weird/../y", ".mp3")]
)
def test_analyze_suffix(client, fake, filename, suffix):
    client.post("/analyze", files={"audio": (filename, b"data", "application/octet-stream")})
    assert fake.calls[-1][1] == suffix


@pytest.mark.parametrize(
    "files, status",
    [
        ({"audio": ("a.mp3", b"bad audio", "audio/mpeg")}, 400),
        ({"audio": ("a.mp3", b"", "audio/mpeg")}, 400),
        ({"audio": ("a.mp3", b"x" * (main.MAX_AUDIO_BYTES + 1), "audio/mpeg")}, 413),
        ({"other": ("a.mp3", b"data", "audio/mpeg")}, 422),
    ],
    ids=["undecodable", "empty", "too-large", "no-audio-field"],
)
def test_analyze_errors(client, files, status):
    r = client.post("/analyze", files=files)
    assert r.status_code == status
    assert r.json()["detail"]


def test_startup_fails_without_models(tmp_path, monkeypatch):
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    with pytest.raises(RuntimeError, match="model files missing"):
        with TestClient(main.create_app()):
            pass


def test_real_models(analyzer, click_wav, monkeypatch):
    monkeypatch.setenv("MODELS_DIR", str(MODELS_DIR))
    with TestClient(main.create_app(lambda: analyzer)) as c:
        assert c.get("/health").json()["model_version"] == analyzer.model_version
        r = c.post("/analyze", files={"audio": ("click.wav", click_wav, "audio/wav")})
        assert r.status_code == 200, r.text
        assert r.json()["features"]["tempo"] == pytest.approx(120, abs=3)
        r = c.post("/analyze", files={"audio": ("junk.mp3", b"junk" * 1000, "audio/mpeg")})
        assert r.status_code == 400
