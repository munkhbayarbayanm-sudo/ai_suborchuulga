import threading
from types import SimpleNamespace

import pytest

from studio_providers.app import ProviderError, Runs, Settings
from studio_providers.runtime import Providers


def test_dependencies_do_not_claim_loaded_models(monkeypatch, tmp_path):
    monkeypatch.setattr("studio_providers.runtime.version", lambda name: "test-version")
    provider = Providers(Settings(token="test", roots=(tmp_path,), downloads=True))
    state = provider.readiness()
    assert state["asr"]["state"] == "READY_CPU"
    assert "not loaded" in state["asr"]["message"]
    assert provider.asr_pipeline is None


def test_no_downloads_reject_missing_models(monkeypatch, tmp_path):
    monkeypatch.setattr("studio_providers.runtime.version", lambda name: "test-version")
    provider = Providers(Settings(token="test", roots=(tmp_path,), downloads=False))
    with pytest.raises(ProviderError) as caught:
        provider._require("asr")
    assert caught.value.code == "MODEL_UNAVAILABLE"


def test_no_absolute_local_model_path_in_readiness(monkeypatch, tmp_path):
    monkeypatch.setattr("studio_providers.runtime.version", lambda name: "test-version")
    model = tmp_path / "private-model"
    provider = Providers(Settings(token="test", roots=(tmp_path,), asr_model=str(model)))
    assert provider.readiness()["asr"]["model"] == "private-model"


def test_ocr_model_reused_and_blank_frame_is_returned(monkeypatch, tmp_path):
    from PIL import Image

    image_path = tmp_path / "frame.png"
    Image.new("RGB", (100, 50), "white").save(image_path)
    called = []

    class Pipeline:
        def __init__(self, **kwargs):
            called.append(kwargs)

        def predict(self, path):
            return [{"rec_texts": [], "rec_scores": [], "rec_polys": []}]

    original_import = __import__("importlib").import_module
    monkeypatch.setattr("studio_providers.runtime.version", lambda name: "test-version")
    monkeypatch.setattr(
        "studio_providers.runtime.importlib.import_module",
        lambda name: SimpleNamespace(PaddleOCR=Pipeline)
        if name == "paddleocr"
        else original_import(name),
    )
    provider = Providers(Settings(token="test", roots=(tmp_path,)))
    body = SimpleNamespace(language="zh-TW")
    first = provider.ocr(body, [(0, image_path), (1000, image_path)], lambda: None)
    provider.ocr(body, [(2000, image_path)], lambda: None)
    assert len(called) == 1
    assert called[0]["text_recognition_model_name"] == "PP-OCRv5_mobile_rec"
    assert first["languageDetected"] is None
    assert [row["text"] for row in first["observations"]] == ["", ""]


def test_cancel_interrupts_between_frames(monkeypatch, tmp_path):
    from PIL import Image

    image_path = tmp_path / "frame.png"
    Image.new("RGB", (100, 50), "white").save(image_path)
    monkeypatch.setattr("studio_providers.runtime.version", lambda name: "test-version")
    provider = Providers(Settings(token="test", roots=(tmp_path,)))
    count = []
    provider.ocr_pipeline = SimpleNamespace(predict=lambda path: count.append(path) or [{}])

    def check():
        if count:
            raise ProviderError("CANCELLED", "Extraction was cancelled.", 409)

    with pytest.raises(ProviderError) as caught:
        provider.ocr(None, [(0, image_path), (1000, image_path)], check)
    assert caught.value.code == "CANCELLED"
    assert len(count) == 1


def test_provider_errors_do_not_echo_model_paths_or_secrets(tmp_path):
    provider = Providers(Settings(token="test", roots=(tmp_path,)))
    error = provider._guard_error("asr", RuntimeError("C:/secret/token-value"), True)
    assert "secret" not in error.message
    assert "token-value" not in error.message
    assert error.code == "MODEL_UNAVAILABLE"


def test_waiting_inference_can_be_cancelled():
    runs = Runs()
    runs.inference.acquire()
    failures = []

    def run():
        try:
            runs.execute("waiting", lambda check: None)
        except ProviderError as error:
            failures.append(error.code)

    thread = threading.Thread(target=run)
    thread.start()
    runs.cancel("waiting")
    thread.join(timeout=2)
    runs.inference.release()
    assert not thread.is_alive()
    assert failures == ["CANCELLED"]


def test_missing_dependencies_have_specific_safe_code(monkeypatch, tmp_path):
    monkeypatch.setattr("studio_providers.runtime.version", lambda name: None)
    provider = Providers(Settings(token="test", roots=(tmp_path,)))
    with pytest.raises(ProviderError) as caught:
        provider._require("ocr")
    assert caught.value.code == "DEPENDENCY_UNAVAILABLE"


def test_cuda_not_claimed_ready_when_runtime_has_no_device(monkeypatch, tmp_path):
    monkeypatch.setattr("studio_providers.runtime.version", lambda name: "test-version")
    monkeypatch.setattr(
        "studio_providers.runtime.importlib.import_module",
        lambda name: SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: False)),
    )
    provider = Providers(Settings(token="test", roots=(tmp_path,), device="cuda"))
    assert provider.readiness()["asr"]["state"] == "UNAVAILABLE"
    with pytest.raises(ProviderError) as caught:
        provider._require("asr")
    assert caught.value.code == "DEPENDENCY_UNAVAILABLE"


def test_transient_inference_failure_does_not_disable_manual_reruns(monkeypatch, tmp_path):
    monkeypatch.setattr("studio_providers.runtime.version", lambda name: "test-version")
    provider = Providers(Settings(token="test", roots=(tmp_path,)))
    provider.ocr_pipeline = SimpleNamespace()
    error = provider._guard_error("ocr", RuntimeError("transient inference error"))
    assert error.code == "PROCESS_FAILED"
    assert provider.readiness()["ocr"]["state"] == "READY_CPU"
    error = provider._guard_error("ocr", MemoryError())
    assert error.code == "OUT_OF_MEMORY"
    assert provider.readiness()["ocr"]["state"] == "READY_CPU"
