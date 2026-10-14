# MongolSub Studio — project state

Updated 2026-10-14, Asia/Ulaanbaatar.

| Field | State |
|---|---|
| Current / last authorized phase | Phase 04: high-quality Mongolian localization engine |
| Approved Phase 03 baseline | `a195a3f31a1f2ad177394ec2b390802175e0896a`; implementation `b1a3b90162c6b77a6e1aee37f85c2f8c1c586f3a` |
| Active branch | `codex/phase-04-mongolian-localization`, created directly from the approved Phase 03 commit |
| Phase 04 implementation commit | `6c26caf018448b5365c3d9556d928208d5749967` |
| Latest continuity commit | Current HEAD after final handoff; inspect `git log -2` |
| Merge / push | Neither authorized nor performed |
| Next phase | Phase 05 requires new explicit authorization |
| Deployment | Local validation only; Docker host failure remains unresolved |

## Implemented

Phases 01–03 remain intact: Next/Nest/Prisma PostgreSQL/Redis BullMQ, immutable media,
independent embedded/ASR/OCR evidence, canonical transcript fusion, provenance, word timing,
manual canonical correction and explicit active FusionRun.

Phase 04 adds additive LocalizationRun, LocalizationBatch and 1:1 LocalizedSegment records.
Every run names one explicit completed English or Chinese FusionRun and snapshots its current
canonical source plus relevant Series context. Target is Mongolian Cyrillic (`mn`). STRICT,
NATURAL and CINEMATIC modes use versioned `localization-prompt-v1` and
`localization-pipeline-v1`; old runs/manual work remain immutable history and activation is
explicit.

The reusable `packages/localization` boundary builds bounded coherent target/context windows,
applies scoped Glossary and exact trusted Translation Memory, includes only explicit character
speaker bindings, creates DRAFT/REVIEW prompts, validates exact structured target IDs and adds
explainable deterministic quality signals. Context and complete provider prompts have separate
bounds. Source risk propagates. Number, negation, glossary, approved-name and reading-load
checks flag review; provider semantic findings can force LIKELY_PROBLEM. Product confidence is
not calibrated probability and never equals human approval.

The real initial adapter is configurable OpenAI Responses with strict JSON schema, bounded
response/timeout/retry behavior and server-only credentials. Missing/disabled configuration
reports MISCONFIGURED/UNAVAILABLE while prior phases boot. English and Chinese share the same
provider path without script conversion. Normal tests use deterministic providers; no valid
local credential/model existed, so no real paid English→Mongolian or Chinese→Mongolian request
was executed or claimed.

Character, alias, free-form relationship, Series localization profile, scoped Glossary and
Translation Memory records are manually managed. AI suggestions cannot become trusted memory.
Explicit approval creates HUMAN_APPROVED memory linked to the exact LocalizedSegment revision;
later edits/review revocation archive it, and approved provenance/identity cannot be rewritten.
Manual text keeps machineDraft, marks MANUALLY_EDITED and uses optimistic revision conflicts.

LOCALIZE_TRANSCRIPT runs in the separate worker. Draft checkpoints and completed batches
survive a failure; explicit resume does not repeat completed work. Concurrent resume is claimed
atomically. Cancellation is checked between calls and before writes; partial runs never report
COMPLETED. Usage is stored only when returned. UI provides readiness, explicit FusionRun/mode,
history/progress/activation, paginated issue filters, dense source/Mongolian review, edit and
per-line approval. Series UI manages profile, characters/aliases/relationships and every
Glossary scope, and inspects trusted TM. No Approve All or fake rewrite exists.

## Executed evidence

Final local evidence: 136/136 unit/web tests (20 files) and 37/37 integration tests (4 files)
using real Nest HTTP, PostgreSQL, Redis, BullMQ, storage and FFmpeg. The 8 Phase 04 integration
cases use an injected deterministic translation provider; the 29 earlier Phase 01–03 cases
remain green. Lint, all 13 workspace typechecks plus tooling, all three production builds,
current migration deploy and fresh Phase01→02→03→04 migration apply passed.

A compiled API/worker/Next runtime called the production `openai-responses` adapter against an
owned loopback deterministic Responses fixture for three English and one Chinese canonical
line. It checkpointed DRAFT/REVIEW, persisted localization, preserved canonical payloads,
manually edited/approved one row and explicitly activated the run. This proves the compiled
HTTP/provider/worker/persistence boundary, not model quality or a real OpenAI call.

Browser validation on production Next confirmed provider readiness, explicit active FusionRun,
run metrics/history, source/Mongolian rows, approved filter, inline optimistic edit, per-line
approval→trusted TM, and saved Series profile. Browser console warnings/errors: none.

Deterministic 900-line/30-batch benchmark on this shared Windows host: context build 6 ms,
initial PostgreSQL persistence 502 ms, worker orchestration+persistence 4,150 ms (worker
reported 4,042 ms), zero network calls. These numbers are fake-provider/local persistence
measurements and must not be presented as LLM throughput.

## Environment and limitations

Windows Node 24.15/pnpm 11.25, portable PostgreSQL 56432 and Redis 56379. Existing unrelated
PostgreSQL 55432 is preserved. Docker Compose remains unverified because of the existing host
Docker inference-socket failure. Final app/provider processes are stopped; portable infra is
also stopped at handoff. OneDrive generated-output handling remains a known build concern;
run build then typecheck sequentially.

No actual localization-provider credential/model was configured. Provider smoke returned
`real_localization_smoke_skipped` for both languages. No provider cost, real token usage,
latency, translation accuracy, чи/та consistency or human Mongolian quality claim was measured.
The Responses model must support strict structured output. Pricing is deliberately absent.

Quality checks are conservative heuristics: they cannot prove semantic fidelity, Mongolian
grammar, sarcasm, pronoun/relationship resolution or correct inflection. Exact TM retrieval
does not implement fuzzy CAT search. Memory creation is manual; no automatic canon discovery.
Batch resume restarts the incomplete REVIEW call, and an oversized provider draft can require a
new run with smaller batch settings. Core authentication, production deployment, distributed
worker recovery, provider account readiness and long-episode paid-provider behavior remain
unverified.

## Exact continuation

STOP. Await explicit Phase 05 authorization. Start from the explicitly active COMPLETED
LocalizationRun and its LocalizedSegments. Preserve machineDraft/currentText, manual revisions,
confidence reasons, human approval and source TranscriptSegment/FusionRun/SourceSegment paths.
Phase 05 may add video playback, waveform, subtitle timing clips, drag/resize, split/merge,
keyboard navigation, autosave and undo/redo. It must not overwrite Phase 04 history or treat AI
confidence as approval.

Required reads: PROJECT_STATE, HANDOFF, AGENTS, docs/MASTER_SPEC, ARCHITECTURE, ROADMAP,
DOMAIN_MODEL, PROVIDERS, VALIDATION, PHASE_02_VALIDATION, PHASE_03_VALIDATION,
PHASE_04_VALIDATION, LOCALIZATION_PIPELINE, FUSION_ALGORITHM and docs/adr/*.
