# MongolSub Studio — project state

Updated 2026-10-13, Asia/Ulaanbaatar.

| Field | State |
|---|---|
| Current / last authorized phase | Phase 02: multilingual source extraction |
| Completed scope | Independent embedded subtitle, ASR and OCR evidence; local validation |
| Approved Phase 01 baseline | `acb3eaad4e2febb3eb747e287775eebfafc08ee8` |
| Active branch | `codex/phase-02-source-extraction`, created directly from approved baseline |
| Latest implementation commit | See `git log -2`; final continuity commit records implementation hash |
| Merge / push | Neither authorized nor performed |
| Next phase | Phase 03 requires new explicit authorization |
| Deployment | No external deployment; Docker Compose host failure remains unverified |

## Implemented

Phase 01 stack and behavior remain: Next/Nest/Prisma PostgreSQL/Redis BullMQ,
separate worker, streamed immutable original media, FFmpeg/ffprobe boundary.

Phase 02 adds SourceExtractionRun, SourceSegment and MediaDerivative, strict
contracts, composite ownership constraints, integer milliseconds, validated word
timing and provider-scoped metadata. Selected text streams map exactly through
FFmpeg; image subtitle codecs are honestly unsupported. Mono16k PCM16 audio is
cached independently of ASR settings and retains delayed audio via leading silence.

A private optional long-lived Python 3.11 HTTP service supplies real WhisperX
and PaddleOCR PP-OCRv5. CPU is default; dependency/model readiness is independent
of core boot. ASR uses Auto/en/zh; Chinese speech does not imply script. OCR uses
en/zh-CN/zh-TW, normalized lower region or full frame, default 4 fps, bounded temporary
frames and deterministic within-run grouping. No cross-source fusion.

Episode UI exposes streams/settings/readiness, independent jobs, cancellation,
intentional reruns, paginated read-only segments, words and provenance. Default
identical requests reuse a deterministic identity; explicit caller UUID revisions
reuse on transport retries. Provider version/model drift rejects the run.

## Executed evidence

56 TypeScript unit/web tests; 21 real HTTP/PostgreSQL/Redis/BullMQ/storage/FFmpeg
integration tests; 21 Python tests, 1 Windows symlink-privilege skip. Lint,
typecheck11 packages+tooling, all 3production builds, migration apply/reapply,
Python lint/format/compile and compiled application runtime checks passed.
See docs/VALIDATION.md for commands, exact boundaries and final browser evidence.

Actual CPU provider HTTP tests recognized synthesized English speech and aligned
14 words. Actual Paddle recognized English, Simplified and Traditional Chinese.
Compiled worker/API persisted all 5independent real runs:1embedded,1EnglishASR
(3 segments / 14 words),3OCR language configurations. No fake provider is used by the
production application. Integration tests explicitly inject deterministic providers.

## Environment / limitations

Windows Node24.15/pnpm11.25; Python 3.11.15 isolated uv environment with154 locked
packages; WhisperX 3.4.2/base, PaddleOCR 3.2/Paddle 3.2 PP-OCRv5 mobile.
GTX 1660 Ti 6 GB exists, but all actual inference was CPU. GPU, Chinese speech ASR,
speaker diarization, long episode quality/performance and external deployment were
not executed. English ASR and all 3OCR configurations were actually executed.

Docker's pre-existing dockerInference socket failure remains. Portable PostgreSQL
uses56432; Redis56379. Existing unrelated PostgreSQL on55432 is preserved.
Verified FFmpeg6.1.1; portable ffprobe4.0.2 is old, unsuitable as a production
security claim. Python 3.13 is incompatible with pinned ASR; uv Python 3.11 minor
link warning was worked around using its downloaded interpreter. No driver/system
Python changes. CTranslate2/pyannote prerequisites were corrected with pinned
setuptools75.8 and matplotlib3.10.1.

Trusted local application still lacks authentication, production lifecycle/GC,
distributed worker health, S3 implementation and service deployment packaging.
Filesystem/DB crash windows can leave orphan derivatives; no blind deletion.
Audio normalization holds a bounded long database advisory-lock transaction.
Provider cancellation is cooperative between stages/frames and cannot interrupt
an active kernel/model download. OCR sampling has quarter-second resolution at4 fps,
can miss short subtitles, uses temporary disk and is not a measured quality guarantee.
Confidence is provider evidence, not calibrated correctness.

## Runtime handoff and exact continuation

Verification processes are stopped at final handoff; confirm ports/status before
startup. Ignored data/model caches and clearly labelled synthetic smoke records
remain for local inspection. See HANDOFF.md for exact setup, docs/PROVIDERS.md
for isolated CPU/GPU/model settings, and docs/VALIDATION.md for executed evidence.

A future authorized Phase 03 starts from completed independent SourceExtractionRun
and SourceSegment evidence, retaining every run/word/provider/stream reference.
First define cross-source alignment/candidate reconciliation entities and tests;
never mutate original media or overwrite source evidence. Phase 03 alignment,
reconciliation/fusion and Phase 04 translation were NOT started.

Read PROJECT_STATE, HANDOFF, AGENTS, MASTER_SPEC, ARCHITECTURE, ROADMAP,
DOMAIN_MODEL, ADR0001–0003, PROVIDERS and VALIDATION before continuation.
