import pytest

from app.analysis import Analyzer, missing_models
from tests.audio import MODELS_DIR, click_track, wav_bytes


@pytest.fixture(scope="session")
def analyzer() -> Analyzer:
    if missing_models(MODELS_DIR):
        pytest.skip(f"models not in {MODELS_DIR}; run `just models`")
    return Analyzer(MODELS_DIR)


@pytest.fixture(scope="session")
def click_wav() -> bytes:
    return wav_bytes(click_track())
