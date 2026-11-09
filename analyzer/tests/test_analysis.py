import numpy as np
import pytest

from app.analysis import (
    HEADS,
    Analyzer,
    AudioError,
    ModelsMissingError,
    deam_to_unit,
    missing_models,
    normalize_key,
    positive_index,
    top_genres,
)
from tests.audio import click_track, wav_bytes

SCORES = ["danceable", "happy", "sad", "relaxed", "aggressive", "party", "acoustic", "instrumental"]


@pytest.mark.parametrize(
    "classes, positive, want",
    [
        (["danceable", "not_danceable"], "danceable", 0),
        (["happy", "non_happy"], "happy", 0),
        (["non_sad", "sad"], "sad", 1),
        (["non_party", "party"], "party", 1),
        (["instrumental", "voice"], "instrumental", 0),
        (["voice", "instrumental"], "instrumental", 1),
        (["valence", "arousal"], "arousal", 1),
    ],
)
def test_positive_index(classes, positive, want):
    assert positive_index(classes, positive) == want


def test_positive_index_missing():
    with pytest.raises(ValueError, match="not_here"):
        positive_index(["a", "b"], "not_here")


def test_heads_cover_every_score():
    assert sorted(HEADS) == sorted(SCORES)


@pytest.mark.parametrize(
    "key, want", [("C", "C"), ("F#", "F#"), ("Bb", "A#"), ("Eb", "D#"), ("Ab", "G#")]
)
def test_normalize_key(key, want):
    assert normalize_key(key) == want


@pytest.mark.parametrize("x, want", [(1.0, 0.0), (5.0, 0.5), (9.0, 1.0), (0.0, 0.0), (12.0, 1.0)])
def test_deam_to_unit(x, want):
    assert deam_to_unit(x) == pytest.approx(want)


def test_top_genres():
    got = top_genres(np.array([0.1, 0.5, 0.2, 0.05]), ["a", "b", "c", "d"])
    assert [g["name"] for g in got] == ["b", "c", "a"]
    assert got[0]["score"] == pytest.approx(0.5)


def test_missing_models(tmp_path):
    missing = missing_models(tmp_path)
    assert "discogs-effnet-bs64-1.pb" in missing
    assert "mood_sad-discogs-effnet-1.json" in missing
    with pytest.raises(ModelsMissingError, match="just models"):
        Analyzer(tmp_path)


def test_click_track_features(analyzer, click_wav):
    f = analyzer.analyze_bytes(click_wav, suffix=".wav")
    assert set(f) == {"tempo", "key", "mode", "valence", "arousal", "genres", *SCORES}
    assert f["tempo"] == pytest.approx(120, abs=3)
    assert f["mode"] in ("major", "minor")
    assert f["key"] in {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"}
    for name in [*SCORES, "valence", "arousal"]:
        assert 0 <= f[name] <= 1, name
    assert len(f["genres"]) == 3
    assert all(set(g) == {"name", "score"} and 0 <= g["score"] <= 1 for g in f["genres"])
    assert f["genres"][0]["score"] >= f["genres"][-1]["score"]


def test_tempo_follows_clicks(analyzer):
    f = analyzer.analyze_bytes(wav_bytes(click_track(bpm=90)), suffix=".wav")
    assert f["tempo"] == pytest.approx(90, abs=3)


@pytest.mark.parametrize(
    "data",
    [b"not audio at all" * 100, wav_bytes(click_track(seconds=1)), wav_bytes(np.zeros(44100 * 5))],
    ids=["garbage", "too-short", "silent"],
)
def test_bad_audio(analyzer, data):
    with pytest.raises(AudioError):
        analyzer.analyze_bytes(data, suffix=".wav")
