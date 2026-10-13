"""Explicit real-provider HTTP smoke; model downloads can occur only when requested."""

import argparse
import json
import os
from pathlib import Path
from uuid import uuid4

import httpx
from PIL import Image, ImageDraw, ImageFont


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ocr", action="store_true")
    parser.add_argument("--asr", type=Path, help="Controlled worker-extracted mono16k PCM16 WAV")
    parser.add_argument("--align", action="store_true")
    parser.add_argument("--language", choices=["en", "zh"])
    options = parser.parse_args()
    token = os.environ.get("EXTRACTION_PROVIDER_TOKEN")
    work = Path(os.environ.get("MEDIA_WORK_ROOT", ""))
    if not token or not work.is_absolute():
        parser.error("Configure provider token and absolute MEDIA_WORK_ROOT")
    with httpx.Client(
        base_url="http://127.0.0.1:8765", headers={"X-Studio-Token": token}, timeout=600
    ) as client:
        readiness = client.get("/readiness")
        readiness.raise_for_status()
        print(json.dumps(readiness.json(), ensure_ascii=False))
        if options.ocr:
            directory = work / "provider-smoke" / str(uuid4())
            directory.mkdir(parents=True)
            try:
                image = Image.new("RGB", (640, 120), "white")
                font = (
                    ImageFont.truetype("arial.ttf", 44)
                    if os.name == "nt"
                    else ImageFont.load_default(size=44)
                )
                ImageDraw.Draw(image).text((25, 30), "Hello Studio 42", fill="black", font=font)
                path = directory / "synthetic.png"
                image.save(path)
                response = client.post(
                    "/ocr",
                    json={
                        "runId": str(uuid4()),
                        "language": "en",
                        "frames": [{"timestampMs": 0, "path": str(path)}],
                    },
                )
                response.raise_for_status()
                result = response.json()
                print(json.dumps({"ocr": result}, ensure_ascii=False))
                if not result["observations"][0]["text"].strip():
                    raise RuntimeError("Real OCR did not recognize synthetic text")
            finally:
                for child in directory.iterdir():
                    child.unlink()
                directory.rmdir()
        if options.asr:
            response = client.post(
                "/asr",
                json={
                    "runId": str(uuid4()),
                    "audioPath": str(options.asr.resolve()),
                    "language": options.language,
                    "align": options.align,
                    "diarize": False,
                },
            )
            response.raise_for_status()
            result = response.json()
            print(json.dumps({"asr": result}, ensure_ascii=False))
            if not result["segments"]:
                raise RuntimeError("Real ASR did not recognize speech")


if __name__ == "__main__":
    main()
