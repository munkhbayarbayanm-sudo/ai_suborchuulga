# Phase 02 local extraction providers

The separate BullMQ worker calls a private, long-lived Python HTTP process. The
browser/API never send file paths to this process. Original media is immutable:
the worker supplies derived mono16k PCM16 WAV and sampled/cropped images. Paths
must resolve to real files below absolute `STORAGE_ROOT` or `MEDIA_WORK_ROOT`;
symlink/junction escapes and relative paths are rejected.

## Reproducible CPU setup

Use `uv` and Python 3.11. The default Python 3.13 on this host is incompatible with
the pinned WhisperX release. Dependencies are pinned in `services/providers/pyproject.toml`
and the actual generated `uv.lock`; environments and downloaded weights are ignored.
Nothing is installed into system Python. From the repository root:

```powershell
uv sync --project services/providers --locked
uv sync --project services/providers --locked --extra asr --extra ocr
```

The first command installs only the HTTP service and verification tools; AI
libraries are optional. Select `--extra asr` or `--extra ocr` independently, or both.
The lock resolves both extras together. After syncing extras, start with
`--no-sync` so a subsequent base-only `uv run` cannot remove installed AI packages:

```powershell
$env:STORAGE_ROOT = [IO.Path]::GetFullPath('./data/media')
$env:MEDIA_WORK_ROOT = [IO.Path]::GetFullPath('./data/work')
$env:PROVIDER_MODEL_ROOT = [IO.Path]::GetFullPath('./data/provider-models')
# Set the same private EXTRACTION_PROVIDER_TOKEN for worker and Python process.
# Keep it in ignored local configuration; do not print or commit it.
uv run --directory services/providers --locked --no-sync python -m studio_providers
```

The service refuses startup without a token or absolute roots. It binds only
127.0.0.1:8765, one process/worker, without access logging, OpenAPI or browser CORS.
Every route requires `X-Studio-Token`, compared in constant time. Preserve the
worker/provider environment together; they must resolve the same physical roots.
Ctrl+C stops the provider. Redis/PostgreSQL remain managed separately.

On this host, `uv python install 3.11` initially reported a minor-version-link
error after downloading a usable3.11.15 interpreter. Passing that interpreter
explicitly with `uv ... --python <absolute-python.exe>` created the isolated
environment. Subsequent commands use its interpreter; no system Python replacement
or driver modification is required. This is a recorded host workaround, not an
assumption that every Windows installation has the same problem.

## Real providers and model policy

WhisperX 3.4.2 uses faster-whisper1.1.1, CTranslate2 4.4.0 and torch/torchaudio2.5.1.
Setuptools75.8.0 retains CTranslate2's required `pkg_resources`; matplotlib3.10.1
supplies pyannote3.3.2's imported plotting dependency. Actual inference identified
both transitive prerequisites; compatible versions are now pinned and locked.
Default model `base` is multilingual; `WHISPERX_MODEL=small` is an optional larger
choice. CPU uses int8, batch1. A full bounded audio array is decoded once per
request and used by all stages; the process caches one ASR pipeline, per-language
alignment models and optional diarization. Basic ASR does not require an HF token:
Silero VAD uses pinned `silero-vad5.1.2` package-bundled weights, avoiding upstream
WhisperX's executable GitHub `torch.hub` download. See the [WhisperX API source](https://github.com/m-bain/whisperX/blob/v3.4.2/whisperx/asr.py)
and [Silero package](https://github.com/snakers4/silero-vad).

PaddleOCR 3.2.0 + PaddlePaddle 3.2.0 explicitly select
`PP-OCRv5_mobile_det` + `PP-OCRv5_mobile_rec`; preprocessing orientation/unwarping
and MKLDNN are disabled for predictable CPU operation. One pipeline serves all
frames and language hints. The unified PP-OCRv5 model supports English, Simplified
and Traditional Chinese; language hints do not prove script detection. See the
[official PP-OCRv5 model descriptions](https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/OCR.html)
and [pinned PaddleOCR package dependencies](https://github.com/PaddlePaddle/PaddleOCR/blob/v3.2.0/pyproject.toml).
This pins PP-OCRv5 even if newer PaddleOCR documentation defaults to another family.

`PROVIDER_ALLOW_MODEL_DOWNLOADS=true` is the default: first explicitly requested
inference may download actual public weights and retain them in provider caches.
Readiness does not download models or claim quality. Its READY_CPU/GPU message
states dependencies are present but model loading/inference remain unverified until
successful. Missing dependencies, failed model loads, or unavailable requested CUDA
produce UNAVAILABLE. Dependencies alone do not verify a successful video workflow.

For offline deployment set `PROVIDER_ALLOW_MODEL_DOWNLOADS=false` and configure
`WHISPERX_MODEL` to an absolute local CTranslate2 model directory containing
`model.bin`; configure both `PADDLEOCR_DET_MODEL_DIR` and `PADDLEOCR_REC_MODEL_DIR`
to absolute PP-OCRv5 inference directories containing `inference.json` and
`inference.pdiparams`. The service returns MODEL_UNAVAILABLE when these are absent.
Local model-directory presence permits lazy loading; incompatible/incomplete
weights are still detected by the actual loader and cannot be treated as verified.
With downloads disabled, newly requested alignment/diarization are unavailable;
ASR continues with explicit warnings and no fabricated word/speaker data.

Optional word alignment supports WhisperX's English and Chinese models. HF_TOKEN
is required only for requested speaker diarization plus accepted gated pyannote
model terms/access; do not put the token in requests or logs. Missing optional
alignment/diarization preserves successful basic transcription and records a
warning. Audio language `en`/`zh` is distinct from written `zh-CN`/`zh-TW`.

`PROVIDER_DEVICE=cpu` is default and needs no NVIDIA hardware. CUDA is opt-in
(`PROVIDER_DEVICE=cuda`) and checks the provider's own usable runtime/device.
The checked-in lock is the portable CPU baseline. GPU torch/Paddle wheel, CUDA and
cuDNN compatibility must be separately provisioned in an isolated environment using
[PyTorch's official version instructions](https://pytorch.org/get-started/previous-versions/)
and [Paddle's official installation guide](https://www.paddlepaddle.org.cn/en/install/quick).
Do not change this host's CUDA/drivers automatically. GTX 1660 Ti 6 GB presence does
not prove compatible GPU kernels, sufficient VRAM or successful inference.

## Private wire contracts

`GET /readiness` returns `{asr,ocr}` entries with provider, state
READY_CPU/READY_GPU/UNAVAILABLE, version/model and safe message. Requests and errors
never expose paths, token values, Python tracebacks or underlying model-host errors.

`POST /asr`: `{runId: UUID, audioPath: controlledAbsolutePath,
language: 'en'|'zh'|null, align: boolean, diarize: boolean}`. Response includes
provider/providerVersion/modelVersion, device cpu/gpu, languageDetected, warnings
and segments containing integer startMs/endMs, text, language, nullable confidence/
speaker, and words. Unknown word start/end are both null; no fabricated timestamps.
Forced language is request evidence and produces languageDetected:null; automatic
language detection is retained independently when language:null.

`POST /ocr`: `{runId: UUID, language: 'en'|'zh-CN'|'zh-TW',
frames:[{timestampMs: integer,path:controlledAbsolutePath}]}`. Strictly increasing
timestamps, maximum2000frames, each maximum16MiB/16million pixels. Response contains
one observation per frame, even blank frames (`text:''`), preserving multiline text
in reading order; box is normalized `[x,y,width,height]` or null. Confidence is the
minimum reported recognized-line score, not a calibrated correctness probability.
LanguageDetected is null because the unified recognizer does not independently
classify written script.

Heavy ASR/OCR inference is serialized across a maximum16 active/waiting runs.
JSON requests are bounded at8MiB. Audio duration defaults7200seconds and can be
bounded with `PROVIDER_MAX_AUDIO_SECONDS` (1..172800); the worker must also enforce
its extraction budget. CPU inference still holds a full decoded audio array.

`POST /cancel/{runId}` returns `{cancelled:true}`; waiting inference and boundaries
between OCR frames / ASR stages observe cancellation. It cannot interrupt an active
CUDA kernel, model download or library inference call. Cancellation tombstones are
bounded1024 entries/one-hour retention. Restarting the process loses local tombstones;
durable run state stays in the worker/database.

Errors are controlled `{code,message}` with DEPENDENCY_UNAVAILABLE,
MODEL_UNAVAILABLE, PROCESS_FAILED, OUT_OF_MEMORY or CANCELLED. Invalid requests/files
are4xx; unavailable inference is503; busy/cancelled runs are409.

## Verification

```powershell
uv run --directory services/providers --locked --no-sync ruff check .
uv run --directory services/providers --locked --no-sync ruff format --check .
uv run --directory services/providers --locked --no-sync pytest -q
uv run --directory services/providers --locked --no-sync python -m compileall -q studio_providers
```

Tests exercise authentication, strict/bounded request validation, safe errors,
path isolation, readiness/model policy, result normalization, cache reuse and
cancellation without downloading gigabyte models. Injected provider outputs test
contract behavior only and do not count as actual ASR/OCR evidence.

With the real service running and both optional extras installed, use explicit
smoke flags (may download weights):

```powershell
uv run --directory services/providers --locked --no-sync python -m studio_providers.smoke --ocr
uv run --directory services/providers --locked --no-sync python -m studio_providers.smoke --asr <absolute-derived-synthetic.wav> --language en
```

The OCR smoke generates/removes its own small synthetic English image under
MEDIA_WORK_ROOT. ASR uses supplied synthesized speech, never copyrighted fixtures.
Both call the actual authenticated HTTP provider and fail if recognized output
is empty. Alignment, diarization, GPU, long-media and quality validation remain
separate gates; a tiny synthetic smoke proves none of them.

## Executed local evidence (2026-10-13)

An isolated uv-managed Python 3.11.15 environment installed both extras from the
154-package lock. CPU torch 2.5.1/Paddle 3.2.0 and actual lazy WhisperX ASR module
plus package-bundled Silero weights loaded successfully. The real verification
process started its own authenticated Uvicorn server on 127.0.0.1:8765 and stopped
only that process after requests; the port was released.

```powershell
# Original synthetic speech WAV: installed Windows SAPI with
# SpeechAudioFormatInfo(16000, Sixteen, Mono), not copyrighted media.
uv run --directory services/providers --locked --no-sync python -m studio_providers.verify_real --work-root ../../data/provider-smoke --asr ../../data/provider-smoke/synthetic.wav --ocr --ocr-chinese-font C:/Windows/Fonts/msyh.ttc
```

All real inference requests returned 200. WhisperX `base` downloaded 145217532-byte
weights and transcribed SAPI speech as “Hello Studio. This is a synthetic English
speech test. We preserve the original media.” Segment 130..6494ms, language `en`,
unknown confidence/speaker retained as null. Forced English hint produced
languageDetected:null. This run did not request alignment.

PaddleOCR downloaded actual PP-OCRv5 mobile detection/recognition weights and reused
the same pipeline for three images. Recognized English “Hello Studio 42” with
score 0.99596; Simplified “你好 世界 汉字测试” with score 0.99414; Traditional
“你好 世界 漢字測試” with score 0.95214. Chinese images used installed Microsoft
YaHei. These are synthetic recognition checks, not independent language detection,
subtitle-on-video accuracy or a quality benchmark. ASR weights cache is under
ignored `data/provider-smoke/models`; Paddle caches are under the user's `.paddlex`.

Deterministic tests: 21 passed, 1 skipped because this Windows account cannot create
file symlinks. Resolution/rejection is implemented, but that symlink fixture was
not executed here. Ruff lint/format, Python bytecode compilation and Node bootstrap
syntax checks passed. A Starlette/AnyIO deprecation warning remains in the test
runner; it did not affect the actual requests.

Initial real ASR prerequisite failures (`pkg_resources` absent with setuptools 84,
then undeclared matplotlib) were corrected by the checked-in pins and successful
real rerun. No GPU/driver/system-Python changes, copyrighted fixtures, remote
deployment, CUDA inference, Chinese speech ASR, diarization or long-media tests
were performed. A subsequent actual English `--align` smoke downloaded torchaudio
WAV2VEC2_ASR_BASE_960H weights (377664473 bytes), returned 3 segments and 14 timed
words (130..6514ms), word confidence 0.828..1.0 and no warnings. This was CPU;
speaker fields remained null. Word alignment was actually executed.

The compiled Node worker/API then imported legal 7-second videos containing these
drawn images and synthesized speech. Actual embedded, English ASR/alignment and all
three OCR language configurations persisted independently through PostgreSQL/BullMQ.
See VALIDATION.md and ignored data/phase02-runtime-smoke.json. These short synthetic
checks verify the execution/persistence boundary; long-media quality is unverified.

Transient inference/OOM errors fail their individual run and leave readiness usable
for intentional reruns. Model/dependency loading failures latch unavailable until
configuration/restart. Node distinguishes SOURCE_TIMEOUT and sends bounded provider
cancellation after failed inference; active library calls remain cooperative.
