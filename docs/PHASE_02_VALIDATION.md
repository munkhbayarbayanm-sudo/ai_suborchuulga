# Phase 02 validation — 2026-10-13 (Asia/Ulaanbaatar)

Approved baseline: acb3eaad4e2febb3eb747e287775eebfafc08ee8.
Branch: codex/phase-02-source-extraction, based directly on that commit.
No Phase 03, fusion, translation, editor, render or deployment implementation.

## Executed automated evidence

| Command | Result | Scope |
|---|---|---|
| pnpm install / db:generate | exit0 | Lockfile, workspace extraction package, Prisma6.19 client |
| pnpm db:migrate | exit0 | Additive source migration applied to actual PostgreSQL; repeat no pending |
| pnpm fixture:sources | exit0 | Legal video +2 tone audio +English SRT/Chinese ASS/Traditional SRT |
| pnpm test | 56/56,10files, exit0 | Contracts, parser, grouping, words, identity, HTTP timeout, storage/media/config, web |
| pnpm test:integration | 21/21, 2 files, exit 0 | Real HTTP/PG/Redis/BullMQ/storage/FFmpeg; 9 Phase 01 +12 Phase 02 grouped cases |
| pnpm lint | exit0 | ESLint; isolated Python third-party environment excluded |
| pnpm typecheck | exit0 |11 packages plus root tooling |
| pnpm build | exit0 | Next production routes +compiled Nest API and separate worker |
| Python pytest -q |21passed,1skip | Deterministic service/provider contracts, no model downloads |
| Python ruff check / format --check | exit0 |9Python source/test files |
| Python compileall / node --check scripts/providers.mjs | exit0 | Python and Windows bootstrap syntax |
| pnpm test:smoke | passed | Compiled Phase 01 import/inspection success and useful invalid-media failure |
| pnpm test:smoke:sources | passed | Actual CPU providers through compiled API/worker, storage, queue and database |

TypeScript provider fixtures are explicitly injected only in integration tests.
English/Chinese ASR contract responses and OCR observations there are deterministic
fake evidence, not a claim that WhisperX/PaddleOCR recognition passed. Python tests
likewise inject library/normalization outputs and exercise authentication, strict
payload bounds, safe root/path errors, model policy, readiness, cache and cancellation.
One symlink escape fixture was skipped because this Windows account lacks file
symlink privilege; path resolution protection exists but that fixture did not run.

Phase 02 integration covers six-track detection/exact mapping, UTF8 and ASS styles,
three embedded language tracks, independent provenance, pagination/order, concurrent
default and explicit UUID deduplication, selected audio/cached derivatives and words,
actual frame sampling plus deterministic OCR grouping, wrong ownership/missing audio/
subtitle/image codec/unavailable provider/invalid language, SQL FK/timing failure,
queued/running cancellation/cleanup, invalid provider output atomic failure,
FFmpeg failure/frame budget, delayed audio2 seconds padded with actual silence, and
provider model drift rejection/cancellation, and actual PostgreSQL rejection of a
fault-injected final segment write (whole transaction rolls back; original remains
READY and temporary files are cleaned). No global DB truncation or Redis flush.

## Actual provider execution

Isolated uv Python 3.11.15,154 locked packages, CPU torch2.5.1/Paddle 3.2,
WhisperX 3.4.2 multilingual base and PaddleOCR 3.2 PP-OCRv5 mobile models.
Actual authenticated HTTP requests recognized legal Windows SAPI English speech:
“Hello Studio. This is a synthetic English speech test. We preserve the original media.”
Basic ASR forced English retained detected language null/confidence null/speaker null.

Actual English alignment downloaded torchaudio WAV2VEC2_ASR_BASE_960H checkpoint
377664473bytes, returned3 sentence segments and14timed words, no warnings.
Actual Paddle recognized drawn English “Hello Studio42” (spacing preserved in actual
payload), Simplified “你好 世界 汉字测试” and Traditional “你好 世界 漢字測試”.
Provider-only confidence scores were0.99596/0.99414/0.95214. They are reported model
scores, not calibrated accuracy or independent language/script detection.

Actual compiled worker/API smoke generated7 second640x360 video/audio/embedded SRT
with burned text in normalized bottom region. Persisted5 separate runs:
embedded English1 segment, EnglishASR3 segments / 14 words, OCR English1 segment,
Simplified1 segment and Traditional1 segment. Each retained real provider/version/
model/device, run/media/stream references, integer timing and scoped metadata.
The final rerun after review fixes passed as well. Ignored evidence:
data/phase02-runtime-smoke.json; generated media/models are never committed.

Measured first end-to-end7 second synthetic run durations: embedded107ms,
EnglishASR+alignment20397ms, EnglishOCR36412ms (first model load),
SimplifiedOCR10304ms and TraditionalOCR9504ms (cached model). These observations
are not representative throughput/quality benchmarks. Instrumentation logs source
duration, processing duration, provider/device/method and segment count.

## Compiled runtime and UI evidence

Compiled API/worker and Next production server were started and real endpoints
verified. Real provider processes were authenticated and actual weights loaded.
Read-only Episode inspector displayed independent completed runs, segments,
provider/version/model, requested versus detected language, null confidence/speaker,
and aligned words. Embedded selection reused its existing run; intentional rerun
and persisted status/results were inspected. Chinese results remained separate.
Provider unavailable behavior leaves core/embedded usable and is visible in UI.

Responsive browser checks cover320/375/768px and desktop, no horizontal overflow
or clipped essential source controls. ASR detail screenshot is ignored local
data/phase02-asr-inspector.jpg. Historical Phase 01 browser evidence remains in docs/VALIDATION.md.
Final verification-owned processes were stopped, ports3000/4000/8765/56432/56379
released; unrelated PostgreSQL on55432 preserved.

## Review fixes and realistic limits

Read-only spec and quality reviews found and rechecked fixes for delayed audio
offset loss; out-of-segment/out-of-order words; timeout/disconnection leaving remote
inference un-signalled; provider/model drift corrupting identity; transient inference
latching readiness permanently; and older reused run falling outside history page.
Regression tests passed; selected run is pinned by exact ID.

Python 3.13 could not support the chosen ASR; uv3.11 minor-link warning was worked
around using the downloaded interpreter. Actual ASR prerequisite errors were fixed
by locking setuptools75.8.0 and matplotlib3.10.1. No system Python/GPU driver changes.
GTX 1660 Ti 6 GB detected, but CPU only executed. Chinese speech ASR, GPU/CUDA,
diarization/HF gated access, offline custom models,45minute quality/performance,
Linux runtime and external deployment remain unverified.

OCR4 fps can miss brief text; ROI/near-match grouping needs tuning on real footage.
Temporary disk can be substantial despite frame caps. Python decodes bounded full
audio once; very long sources require later budgeting/chunking. Cancellation is
between stages/frames, not active kernel/model-download termination. Model labels
identify configured model/version, not a content digest of arbitrary custom weights.
No auth/team API, media playback/editor, S3 adapter, advanced crash GC/resume or
distributed health is implemented. Original uploads and evidence remain immutable.

Docker Compose still cannot run on this host because of the pre-existing
dockerInference socket/engine failure. Actual integration used portable PostgreSQL
and Redis on56432/56379; no Docker reset or user database deletion. FFmpeg6.1.1 and
portable ffprobe4.0.2 were tested; current supported tools are required for real
untrusted media. This is local execution evidence, not deployment certification.
