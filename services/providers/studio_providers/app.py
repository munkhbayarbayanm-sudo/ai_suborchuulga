import hmac
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field


@dataclass(frozen=True)
class Settings:
    token: str
    roots: tuple[Path, ...]
    downloads: bool = True
    device: str = "cpu"
    asr_model: str = "base"
    model_root: Path | None = None
    ocr_det_dir: str | None = None
    ocr_rec_dir: str | None = None
    hf_token: str | None = None
    max_audio_seconds: int = 7200

    @staticmethod
    def from_env() -> "Settings":
        roots = tuple(Path(os.environ[key]) for key in ("STORAGE_ROOT", "MEDIA_WORK_ROOT"))
        if any(not root.is_absolute() for root in roots):
            raise ValueError("Provider storage roots must be absolute")
        device = os.getenv("PROVIDER_DEVICE", "cpu")
        if device not in ("cpu", "cuda"):
            raise ValueError("Provider device must be cpu or cuda")
        download_value = os.getenv("PROVIDER_ALLOW_MODEL_DOWNLOADS", "true")
        if download_value not in ("true", "false"):
            raise ValueError("Model download setting must be true or false")
        return Settings(
            token=os.getenv("EXTRACTION_PROVIDER_TOKEN", ""),
            roots=roots,
            downloads=download_value == "true",
            device=device,
            asr_model=os.getenv("WHISPERX_MODEL", "base"),
            model_root=Path(os.getenv("PROVIDER_MODEL_ROOT", ".models")).resolve(),
            ocr_det_dir=os.getenv("PADDLEOCR_DET_MODEL_DIR"),
            ocr_rec_dir=os.getenv("PADDLEOCR_REC_MODEL_DIR"),
            hf_token=os.getenv("HF_TOKEN"),
            max_audio_seconds=int(os.getenv("PROVIDER_MAX_AUDIO_SECONDS", "7200")),
        )


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class AsrBody(StrictBody):
    # UUID is parsed explicitly because JSON strings are the wire representation.
    runId: Annotated[str, Field(min_length=36, max_length=36)]
    audioPath: Annotated[str, Field(min_length=1, max_length=2048)]
    language: Literal["en", "zh"] | None
    align: bool
    diarize: bool


class Frame(StrictBody):
    timestampMs: Annotated[int, Field(ge=0, le=172800000)]
    path: Annotated[str, Field(min_length=1, max_length=2048)]


class OcrBody(StrictBody):
    runId: Annotated[str, Field(min_length=36, max_length=36)]
    language: Literal["en", "zh-CN", "zh-TW"]
    frames: Annotated[list[Frame], Field(min_length=1, max_length=2000)]


class ProviderError(Exception):
    def __init__(self, code: str, message: str, status: int = 503):
        self.code, self.message, self.status = code, message, status


def controlled_path(value: str, roots: tuple[Path, ...]) -> Path:
    path = Path(value)
    if not path.is_absolute():
        raise ValueError("Expected controlled absolute path")
    path = path.resolve(strict=True)
    if not path.is_file() or not any(path.is_relative_to(root.resolve()) for root in roots):
        raise ValueError("File is outside provider storage roots")
    return path


class Runs:
    def __init__(self):
        self.guard = threading.Lock()
        self.active: dict[str, threading.Event] = {}
        self.cancelled: dict[str, float] = {}
        self.inference = threading.Lock()

    def cancel(self, run_id: str):
        with self.guard:
            self.cancelled = {
                key: value
                for key, value in self.cancelled.items()
                if value > time.monotonic() - 3600
            }
            if len(self.cancelled) >= 1024:
                self.cancelled.pop(next(iter(self.cancelled)))
            self.cancelled[run_id] = time.monotonic()
            if run_id in self.active:
                self.active[run_id].set()

    def execute(self, run_id: str, operation):
        with self.guard:
            if run_id in self.active or len(self.active) >= 16:
                raise ProviderError("PROCESS_FAILED", "Provider capacity is busy.", 409)
            event = threading.Event()
            if run_id in self.cancelled:
                event.set()
            self.active[run_id] = event

        def check():
            if event.is_set():
                raise ProviderError("CANCELLED", "Extraction was cancelled.", 409)

        acquired = False
        try:
            check()
            while not acquired:
                acquired = self.inference.acquire(timeout=0.1)
                check()
            return operation(check)
        finally:
            if acquired:
                self.inference.release()
            with self.guard:
                self.active.pop(run_id, None)


def create_app(settings: Settings) -> FastAPI:
    if not settings.token.strip():
        raise ValueError("Provider authentication token must be configured")
    if not 1 <= settings.max_audio_seconds <= 172800:
        raise ValueError("Audio duration limit must be between 1 and 172800 seconds")
    from .runtime import Providers

    providers, runs = Providers(settings), Runs()
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    def authenticate(x_studio_token: Annotated[str | None, Header()] = None):
        if x_studio_token is None or not hmac.compare_digest(
            x_studio_token.encode(), settings.token.encode()
        ):
            raise HTTPException(status_code=401, detail="Provider authentication required.")

    @app.middleware("http")
    async def bounded_body(request: Request, call_next):
        # This is small JSON, never video. Bound streamed bodies as well as Content-Length.
        size, chunks = 0, []
        async for chunk in request.stream():
            size += len(chunk)
            if size > 8 * 1024 * 1024:
                return JSONResponse(
                    status_code=413,
                    content={
                        "code": "PROCESS_FAILED",
                        "message": "Provider request exceeds the size limit.",
                    },
                )
            chunks.append(chunk)
        request._body = b"".join(chunks)
        return await call_next(request)

    @app.exception_handler(RequestValidationError)
    async def invalid_body(_request, _error):
        return JSONResponse(
            status_code=422,
            content={"code": "PROCESS_FAILED", "message": "Invalid provider request."},
        )

    @app.exception_handler(ProviderError)
    async def provider_error(_request, error):
        return JSONResponse(
            status_code=error.status, content={"code": error.code, "message": error.message}
        )

    @app.exception_handler(HTTPException)
    async def http_error(_request, error):
        return JSONResponse(
            status_code=error.status_code,
            content={"code": "PROCESS_FAILED", "message": error.detail},
        )

    def validated_run(value: str) -> str:
        try:
            return str(UUID(value))
        except ValueError:
            raise ProviderError("PROCESS_FAILED", "Invalid extraction run identifier.", 422)

    def path(value: str) -> Path:
        try:
            return controlled_path(value, settings.roots)
        except (OSError, ValueError):
            raise ProviderError("PROCESS_FAILED", "Invalid provider input file.", 422)

    @app.get("/readiness", dependencies=[Depends(authenticate)])
    def readiness():
        return providers.readiness()

    @app.post("/cancel/{run_id}", dependencies=[Depends(authenticate)])
    def cancel(run_id: str):
        runs.cancel(validated_run(run_id))
        return {"cancelled": True}

    @app.post("/asr", dependencies=[Depends(authenticate)])
    def asr(body: AsrBody):
        run_id, audio = validated_run(body.runId), path(body.audioPath)
        return runs.execute(run_id, lambda check: providers.asr(body, audio, check))

    @app.post("/ocr", dependencies=[Depends(authenticate)])
    def ocr(body: OcrBody):
        run_id = validated_run(body.runId)
        frames = [(frame.timestampMs, path(frame.path)) for frame in body.frames]
        if any(frames[index][0] <= frames[index - 1][0] for index in range(1, len(frames))):
            raise ProviderError("PROCESS_FAILED", "Frame timestamps must increase.", 422)
        return runs.execute(run_id, lambda check: providers.ocr(body, frames, check))

    app.state.providers = providers
    return app
