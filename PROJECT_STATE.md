# MongolSub Studio — project state

Updated 2026-10-13, Asia/Ulaanbaatar.

| Field | State |
|---|---|
| Current / last authorized phase | Phase 03: transcript alignment, reconciliation and fusion |
| Completed scope | Derived canonical transcripts, immutable source links, manual review and local validation |
| Approved Phase 01 baseline | acb3eaad4e2febb3eb747e287775eebfafc08ee8 |
| Approved Phase 02 baseline | bc416581c97ae0648f4ce3f21bf902c973034670; implementation 28a4f0dbad76067be2f3cf72ade8e6394186ca4a |
| Active branch | codex/phase-03-transcript-fusion, created directly from approved Phase 02 |
| Latest implementation commit | `b1a3b90162c6b77a6e1aee37f85c2f8c1c586f3a` |
| Latest continuity commit | Current HEAD after final handoff; inspect git log -2 |
| Merge / push | Neither authorized nor performed |
| Next phase | Phase 04 requires new explicit authorization |
| Deployment | Local validation only; Docker host failure remains unresolved |

## Implemented

Phase 01/02 retain Next/Nest/Prisma PostgreSQL/Redis BullMQ, separate worker,
streamed immutable original media, safe FFmpeg/ffprobe, independent embedded,
WhisperX ASR and PaddleOCR evidence, derivatives, word timing and scoped provenance.

Phase 03 adds FusionRun, explicit FusionRunInput, TranscriptSegment and
TranscriptEvidenceLink. Composite ownership foreign keys and timing/score checks
protect the boundaries. No source record is edited by fusion or manual correction.

The pure packages/fusion algorithm is versioned fusion-v1. Canonical language
is explicit en/zh; AUTO deterministically summarizes selected evidence and declared
Episode/Series language. Ordered bounded temporal windows support1:1,1:many and
many:1; existing text candidates win by quality and independent method agreement.
Cross-language/unknown evidence contributes timing only, without lexical scores.
Confidence is explainable product heuristics, not calibrated statistical probability.
Chinese scripts remain preserved; no Simplified/Traditional conversion library.

Canonical text/timing keep their original derivation alongside manual overrides,
optimistic edit revisions and independent UNREVIEWED/REVIEWED/APPROVED status.
Reruns create separate history, deduplicated by caller UUID; activation is explicit.
FUSE_TRANSCRIPT runs asynchronously and persists all results atomically under the
job-row cancellation lock. Paginated API/UI show alternatives, reasons, original
words/speakers/provider metadata, filters and minimal text/millisecond edits.

## Executed evidence

100 TypeScript unit/web tests (29 pure fusion,2 fusion contracts,10 fusion UI,
3 slow-response polling regressions, all earlier tests);29 real HTTP/PostgreSQL/
Redis/BullMQ/storage/FFmpeg integration tests (8 new fusion, 21 Phase 01/02).
Python regression:21 passed, 1 Windows symlink-privilege skip. Lint, typecheck,
all three production builds, existing and fresh-schema migrations passed.
See docs/PHASE_03_VALIDATION.md for final command evidence and test boundaries.

Compiled API/worker fused actual persisted Phase 02 English embedded/ASR/OCR and
Simplified/Traditional OCR evidence with Python providers stopped. Source payloads
including words/metadata stayed unchanged. Browser verified queued/completed jobs,
manual text/timing/approval, issue filters, explicit activation, revision protection,
reload persistence, side-by-side candidates and retained word timing.

Synthetic45–60 minute fixtures contain1500–3600 source segments. Pure fusion took
33.59–81.05 ms in three repeats per size. Actual PostgreSQL transcript/evidence
persistence took248–553 ms, worker wall366.29–832.84 ms on this shared Windows host.
These are synthetic throughput observations, not real-episode accuracy benchmarks.

## Environment / limitations

Windows Node24.15/pnpm11.25, portable PostgreSQL56432/Redis56379. Existing unrelated
PostgreSQL55432 is preserved. Docker's existing dockerInference socket failure
remains; Compose execution is unverified. FFmpeg6.1.1 and old ffprobe4.0.2 were used.
OneDrive read-only/reparse generated Next output required moving the old ignored
build into .tools/phase03-next-prior before a fresh build; stop servers before builds
and run build/typecheck sequentially because they share generated types.

Fusion itself needs CPU, database and queue, no Python/models/GPU/API keys. Phase 02
isolated Python3.11/WhisperX3.4.2/base/PaddleOCR3.2 PP-OCRv5 setup is unchanged.
No new provider inference was executed in Phase 03. Historical actual CPU English ASR
and three OCR language smoke results remain documented in PHASE_02_VALIDATION.
Chinese speech ASR, GPU and diarization remain unverified.

Algorithm limits: up to 12 selected runs, at most 1 embedded run, 50000 source segments;
bounded10s clusters,4 segments/run,64 candidates/window, 2000 comparison characters.
Limits deliberately cause review rather than combinatorial/global matching. No
global clock-drift correction, VAD-based gap inference, script conversion or semantic
model. Captions/signs remain UNKNOWN; evidence coverage is not speech/translation
completeness. ASR word bounds require complete words matching elected text; otherwise
median boundaries are used. Approximate agreement, speaker conflicts and bounds
require review. Completed confidence/metrics are historical algorithm snapshots;
manual edits do not recalculate them. Trusted local app still lacks authentication,
production deployment/GC/distributed recovery; worker crashes can require operator
reconciliation. Earlier storage/provider limitations remain documented.

## Runtime handoff and exact continuation

Verification services are stopped at handoff. Ignored caches, synthetic smoke records,
screenshots and previous build backup remain for local inspection. Read HANDOFF for
startup; stop other MongolSub workers before integration, never flush shared Redis or
truncate databases.

Await explicit Phase 04 authorization. Its input is the explicitly active COMPLETED
FusionRun and paginated current TranscriptSegments, with human review status,
original derived values, evidence links and source word/provider provenance. Define
localization as separate revisions/entities; never overwrite source or canonical
history, and do not equate confidence with human approval. No Phase 04 translation,
LLM calls, glossary/memory intelligence or professional editor was started.

Required reads: PROJECT_STATE, HANDOFF, AGENTS, MASTER_SPEC, ARCHITECTURE, ROADMAP,
DOMAIN_MODEL, PROVIDERS, VALIDATION, PHASE_02_VALIDATION, PHASE_03_VALIDATION,
FUSION_ALGORITHM and docs/adr/*.
