"""Own one actual HTTP process for opt-in synthetic inference verification."""

import argparse
import json
import os
import secrets
import socket
import subprocess
import sys
import time
from pathlib import Path
from uuid import uuid4

import httpx
from PIL import Image, ImageDraw, ImageFont


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--work-root", required=True, type=Path)
    parser.add_argument("--asr", type=Path)
    parser.add_argument("--ocr", action="store_true")
    parser.add_argument("--align", action="store_true")
    parser.add_argument(
        "--ocr-chinese-font",
        type=Path,
        help="Optional installed font with Simplified and Traditional Chinese glyphs",
    )
    options = parser.parse_args()
    root = options.work_root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", 8765)) == 0:
            parser.error("Provider port is occupied; preserve that existing service")
    env = {
        **os.environ,
        "EXTRACTION_PROVIDER_TOKEN": secrets.token_urlsafe(32),
        "STORAGE_ROOT": str(root),
        "MEDIA_WORK_ROOT": str(root),
        "PROVIDER_MODEL_ROOT": str(root / "models"),
        "PROVIDER_DEVICE": "cpu",
        "PROVIDER_ALLOW_MODEL_DOWNLOADS": "true",
    }
    with (root / "provider-process.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "studio_providers"], env=env, stdout=log, stderr=log
        )
        try:
            with httpx.Client(
                base_url="http://127.0.0.1:8765",
                headers={"X-Studio-Token": env["EXTRACTION_PROVIDER_TOKEN"]},
                timeout=600,
            ) as client:
                for _ in range(100):
                    try:
                        readiness = client.get("/readiness")
                        readiness.raise_for_status()
                        break
                    except httpx.ConnectError:
                        if process.poll() is not None:
                            raise RuntimeError("Provider process failed during startup") from None
                        time.sleep(0.1)
                else:
                    raise RuntimeError("Provider startup timed out")
                print(json.dumps({"readiness": readiness.json()}))
                failed = False
                if options.asr:
                    response = client.post(
                        "/asr",
                        json={
                            "runId": str(uuid4()),
                            "audioPath": str(options.asr.resolve()),
                            "language": "en",
                            "align": options.align,
                            "diarize": False,
                        },
                    )
                    result = response.json()
                    print(json.dumps({"asrHttpStatus": response.status_code, "asr": result}))
                    failed |= response.status_code != 200 or not result.get("segments")
                if options.ocr:
                    samples = [("en", "Hello Studio 42")]
                    if options.ocr_chinese_font:
                        samples.extend(
                            [("zh-CN", "你好 世界 汉字测试"), ("zh-TW", "你好 世界 漢字測試")]
                        )
                    for language, text in samples:
                        path = root / f"synthetic-text-{language}.png"
                        image = Image.new("RGB", (640, 120), "white")
                        font = (
                            ImageFont.truetype(str(options.ocr_chinese_font), 44)
                            if language != "en"
                            else ImageFont.truetype("arial.ttf", 44)
                            if os.name == "nt"
                            else ImageFont.load_default(size=44)
                        )
                        ImageDraw.Draw(image).text((25, 30), text, fill="black", font=font)
                        image.save(path)
                        response = client.post(
                            "/ocr",
                            json={
                                "runId": str(uuid4()),
                                "language": language,
                                "frames": [{"timestampMs": 0, "path": str(path)}],
                            },
                        )
                        result = response.json()
                        print(
                            json.dumps(
                                {
                                    "ocrLanguageHint": language,
                                    "ocrHttpStatus": response.status_code,
                                    "ocr": result,
                                }
                            )
                        )
                        failed |= response.status_code != 200 or not any(
                            row["text"] for row in result.get("observations", [])
                        )
                return 1 if failed else 0
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)


if __name__ == "__main__":
    sys.exit(main())
