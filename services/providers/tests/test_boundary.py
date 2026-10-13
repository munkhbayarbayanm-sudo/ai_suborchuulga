from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path):
    from studio_providers.app import Settings, create_app

    media = tmp_path / "media"
    work = tmp_path / "work"
    media.mkdir()
    work.mkdir()
    app = create_app(Settings(token="test-token", roots=(media, work), downloads=False))
    with TestClient(app) as result:
        yield result, work


def test_readiness_requires_authentication(client):
    http, _ = client
    assert http.get("/readiness").status_code == 401
    result = http.get("/readiness", headers={"X-Studio-Token": "test-token"})
    assert result.status_code == 200
    assert result.json()["asr"]["state"] == "UNAVAILABLE"
    assert result.json()["ocr"]["provider"] == "paddleocr"


def test_paths_outside_controlled_root_are_rejected_without_echoing_path(client):
    http, work = client
    private = work.parent / "secret.wav"
    private.write_bytes(b"private")
    response = http.post(
        "/asr",
        headers={"X-Studio-Token": "test-token"},
        json={
            "runId": str(uuid4()),
            "audioPath": str(private),
            "language": "en",
            "align": False,
            "diarize": False,
        },
    )
    assert response.status_code == 422
    assert str(private) not in response.text


def test_invalid_request_does_not_echo_values(client):
    http, _ = client
    response = http.post(
        "/ocr",
        headers={"X-Studio-Token": "test-token"},
        json={
            "runId": "private-secret",
            "language": "guess",
            "frames": [],
        },
    )
    assert response.status_code == 422
    assert "private-secret" not in response.text


def test_cancel_is_authenticated_and_retained_for_waiting_run(client):
    http, work = client
    run_id = str(uuid4())
    assert http.post(f"/cancel/{run_id}").status_code == 401
    assert http.post(f"/cancel/{run_id}", headers={"X-Studio-Token": "test-token"}).json() == {
        "cancelled": True,
    }
    audio = work / "audio.wav"
    audio.write_bytes(b"fixture")
    response = http.post(
        "/asr",
        headers={"X-Studio-Token": "test-token"},
        json={
            "runId": run_id,
            "audioPath": str(audio),
            "language": "zh",
            "align": False,
            "diarize": False,
        },
    )
    assert response.json()["code"] == "CANCELLED"


def test_service_refuses_unconfigured_token(tmp_path):
    from studio_providers.app import Settings, create_app

    with pytest.raises(ValueError, match="token"):
        create_app(Settings(token="", roots=(tmp_path,), downloads=False))


def test_asr_normalization_preserves_unknown_word_times():
    from studio_providers.normalization import normalize_asr

    segments = normalize_asr(
        {
            "segments": [
                {
                    "start": 1.234,
                    "end": 2.5,
                    "text": "hi 42",
                    "words": [
                        {"word": "hi", "start": 1.3, "end": 1.5, "score": 0.9},
                        {"word": "42", "start": 2.0},
                    ],
                }
            ]
        },
        "en",
    )
    assert segments[0]["startMs"] == 1234
    assert segments[0]["confidence"] is None
    assert segments[0]["words"][1]["startMs"] is None
    assert segments[0]["words"][1]["endMs"] is None


def test_asr_invalid_segments_fail_instead_of_fabricating_timestamps():
    from studio_providers.normalization import normalize_asr

    with pytest.raises(ValueError):
        normalize_asr({"segments": [{"start": float("nan"), "end": 1, "text": "hi"}]}, None)


def test_ocr_reading_order_multiline_box_and_blank_observation():
    from studio_providers.normalization import normalize_ocr

    observation = normalize_ocr(
        {
            "rec_texts": ["bottom", "top"],
            "rec_scores": [0.8, 0.9],
            "rec_polys": [
                [[10, 50], [90, 50], [90, 60], [10, 60]],
                [[10, 10], [80, 10], [80, 20], [10, 20]],
            ],
        },
        100,
        100,
        20,
    )
    assert observation["text"] == "top\nbottom"
    assert observation["box"] == [0.1, 0.1, 0.8, 0.5]
    assert normalize_ocr({}, 100, 100, 30)["text"] == ""


def test_symlink_escape_rejected(tmp_path):
    from studio_providers.app import controlled_path

    root = tmp_path / "root"
    root.mkdir()
    secret = tmp_path / "secret.png"
    secret.write_bytes(b"secret")
    link = root / "link.png"
    try:
        link.symlink_to(secret)
    except OSError:
        pytest.skip("Host does not permit creating symlinks")
    with pytest.raises(ValueError):
        controlled_path(str(link), (root,))


def test_unknown_nonfinite_word_timing_remains_null():
    from studio_providers.normalization import normalize_asr

    result = normalize_asr(
        {
            "segments": [
                {
                    "start": 0,
                    "end": 1,
                    "text": "unknown",
                    "words": [{"word": "unknown", "start": float("nan"), "end": 0.4}],
                }
            ]
        },
        "en",
    )
    assert result[0]["words"][0]["startMs"] is None
    assert result[0]["words"][0]["endMs"] is None


def test_invalid_ocr_polygon_is_not_fabricated_into_a_normalized_box():
    from studio_providers.normalization import normalize_ocr

    result = normalize_ocr(
        {"rec_texts": ["hello"], "rec_polys": [[[float("nan"), 0], [10, 10]]]}, 100, 100, 0
    )
    assert result["box"] is None


def test_oversized_json_body_is_rejected(client):
    http, _ = client
    response = http.post(
        "/ocr", headers={"X-Studio-Token": "test-token"}, content=b"x" * (8 * 1024 * 1024 + 1)
    )
    assert response.status_code == 413
