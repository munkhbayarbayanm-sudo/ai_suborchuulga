# Phase 02 — multilingual source extraction

Authorized 2026-10-13. Approved baseline `acb3eaad4e2febb3eb747e287775eebfafc08ee8`;
clean checkout branched directly to `codex/phase-02-source-extraction`.

Preserve the Phase01 stack and import flow. Add independent extraction evidence only.
No cross-source alignment/fusion, translation, localization memory or editing.

1. [ ] Extend validated contracts and Prisma with extraction method/run/segments,
   validated word timing, cached audio derivatives and additive job types; enforce
   asset/episode and selected-stream ownership, timing and unique sequence in SQL.
2. [ ] Test then implement pure subtitle parsing, deterministic OCR temporal grouping,
   provider response validation and unavailable behavior; safe exact-stream FFmpeg
   extraction, audio normalization and temporary sampled-frame generation.
3. [ ] Implement authenticated loopback Python provider service, isolated Python3.11
   uv lock, real WhisperX + PaddleOCR PP-OCRv5, lazy cached models, CPU path,
   optional alignment/diarization, path containment and bounded diagnostics.
4. [ ] Add application service/API run creation, concurrency-safe idempotency,
   explicit rerun revision, cancellation, paginated deterministic source inspection.
5. [ ] Extend worker to execute each method, cache normalized audio, preserve all
   evidence/provenance/word timing, transactionally persist final results, check
   cancellation between stages/batches, clean up temporary frames/files.
6. [ ] Extend Episode with actual stream selection, provider readiness, ASR hints,
   OCR ROI/sampling, run states and paginated read-only independent source inspector.
7. [ ] Generate legal English/Chinese subtitle and burned-text fixtures; verify real
   embedded/audio/FFmpeg/DB/queue boundaries, deterministic provider contracts,
   missing/unsupported streams, cancellation/idempotency/failures/cleanup.
8. [ ] Run Python dependency/readiness/provider smoke where possible; clearly record
   actual model execution separately from fake-provider CI. Run Phase01 regression,
   lint/typecheck/unit/integration/migrations/build and compiled runtime smoke.
9. [ ] Review, commit logical changes, update continuity/ADRs and provide the required
   thirty-part evidence report. Stop at Phase02; no merge/push.

Design decisions: one background run per selected method/stream. Snapshot settings,
provider/model identity and requested language; keep detected language separate.
Stable canonical settings hash + asset/method/stream/provider + revision identifies
runs. Default revision0 is reusable forever; rerun uses a caller-generated UUID
request key so HTTP retries reuse that revision. Audio cache key excludes ASR model
and language (same selected stream + mono16k PCM normalization).

Embedded streams convert only their selected text stream to SRT for parsing; bitmap
streams remain explicitly unsupported. OCR uses configurable4fps/default lower40%,
scaled temporary JPEGs, bounded batches and a reusable provider, not every original
frame. Temporal grouping is intra-OCR deterministic deduplication, never cross-source
fusion. Median returned confidence, representative raw observation and normalized
box preserve diagnostics without permanent frames.

Python is optional to core boot. Loopback authenticated HTTP receives only worker-
resolved paths under controlled roots. Models load lazily once per service/device;
readiness distinguishes unavailable/CPU/GPU and states whether models are loaded.
Basic WhisperX uses Silero VAD; optional diarization does not block transcription.
