"""Normalize actual inference results without manufacturing timing/confidence."""

import math
from typing import Any


def confidence(value: Any) -> float | None:
    if value is None:
        return None
    result = float(value)
    return result if math.isfinite(result) and 0 <= result <= 1 else None


def timestamp(value: Any) -> int:
    result = float(value)
    if not math.isfinite(result) or result < 0 or result > 172800:
        raise ValueError("Invalid provider timestamp")
    return round(result * 1000)


def normalize_asr(result: dict, language: str | None) -> list[dict]:
    output = []
    for segment in result.get("segments", []):
        start, end = timestamp(segment["start"]), timestamp(segment["end"])
        if end <= start:
            raise ValueError("Invalid provider segment interval")
        words = []
        for word in segment.get("words", []):
            word_start = word_end = None
            if word.get("start") is not None and word.get("end") is not None:
                try:
                    candidate_start, candidate_end = (
                        timestamp(word["start"]),
                        timestamp(word["end"]),
                    )
                    if start <= candidate_start <= candidate_end <= end:
                        word_start, word_end = candidate_start, candidate_end
                except (TypeError, ValueError):
                    pass
            words.append(
                {
                    "text": str(word.get("word", "")),
                    "startMs": word_start,
                    "endMs": word_end,
                    "confidence": confidence(word.get("score")),
                    "speaker": word.get("speaker"),
                }
            )
        output.append(
            {
                "startMs": start,
                "endMs": end,
                "text": str(segment["text"]).strip(),
                "language": language,
                "confidence": confidence(segment.get("confidence")),
                "speaker": segment.get("speaker"),
                "words": words,
            }
        )
    return output


def normalize_ocr(result: dict, width: int, height: int, at: int) -> dict:
    texts, scores = result.get("rec_texts", []), result.get("rec_scores", [])
    polygons = result.get("rec_polys", [])
    lines = []
    for index, text in enumerate(texts):
        if not str(text).strip():
            continue
        polygon = polygons[index] if index < len(polygons) else None
        box = None
        if polygon is not None and len(polygon) >= 2:
            raw_xs = [float(point[0]) / width for point in polygon]
            raw_ys = [float(point[1]) / height for point in polygon]
            if all(math.isfinite(number) for number in raw_xs + raw_ys):
                xs = [max(0.0, min(1.0, number)) for number in raw_xs]
                ys = [max(0.0, min(1.0, number)) for number in raw_ys]
                box = (min(xs), min(ys), max(xs), max(ys))
        score = confidence(scores[index]) if index < len(scores) else None
        lines.append((str(text).strip(), box, score, index))
    # Group nearby baselines, then read left-to-right; preserves separate subtitle lines.
    lines.sort(
        key=lambda item: (
            round(item[1][1] * height / 12) if item[1] else item[3],
            item[1][0] if item[1] else 0,
        )
    )
    boxes = [line[1] for line in lines if line[1] is not None]
    box = None
    if boxes:
        left, top = min(item[0] for item in boxes), min(item[1] for item in boxes)
        right, bottom = max(item[2] for item in boxes), max(item[3] for item in boxes)
        box = [round(left, 6), round(top, 6), round(right - left, 6), round(bottom - top, 6)]
    known_scores = [line[2] for line in lines if line[2] is not None]
    return {
        "timestampMs": at,
        "text": "\n".join(line[0] for line in lines),
        "confidence": min(known_scores) if known_scores else None,
        "box": box,
    }
