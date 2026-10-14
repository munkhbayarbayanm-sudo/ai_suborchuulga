# Phase 04 validation — 2026-10-14 (Asia/Ulaanbaatar)

Branch: `codex/phase-04-mongolian-localization`, created directly from approved Phase 03
`a195a3f31a1f2ad177394ec2b390802175e0896a` (Phase 03 implementation
`b1a3b90162c6b77a6e1aee37f85c2f8c1c586f3a`). Phase 04 implementation commit:
`6c26caf018448b5365c3d9556d928208d5749967`; current HEAD after handoff is the continuity commit.
No merge, push, deployment, Phase 05 timeline or video editing.

## Executed checks

| Command / flow | Result and exact scope |
|---|---|
| `pnpm db:migrate` | exit 0; six migrations, no pending changes |
| `pnpm db:test:migrations` | exit 0; fresh owned schema applied Phase01→02→03→04 migrations 001–006, then removed only that schema |
| `pnpm lint` | exit 0, full repository ESLint |
| `pnpm test` | 136/136, 20 files, exit 0 |
| `pnpm test:integration` | 37/37, 4 files, exit 0; real Nest HTTP/PostgreSQL/Redis/BullMQ/storage/FFmpeg |
| `pnpm test:smoke:localization` | exit 0 with explicit `real_localization_smoke_skipped`; key/model absent |
| `pnpm benchmark:localization` | exit 0; 900 rows/30 batches with deterministic provider and real PostgreSQL persistence |
| `pnpm build` | all production apps passed: Next routes plus API/worker ESM |
| `pnpm typecheck` | all 13 workspaces plus tests/scripts/tooling passed after build |
| compiled API/worker/Next + loopback fixture | English and Chinese production adapter paths completed; manual edit, approval, activation and canonical immutability passed |
| production browser flow | Episode review/edit/approval/filter and Series profile/TM verified; console had no warnings/errors |

The first full lint run found five static issues (unused imports and two no-control-regex
violations); they were corrected and the final full lint passed. The first final tooling
typecheck exposed an overly narrow Vitest fetch-mock tuple; the mock was typed, its 12 tests
reran, and the final full typecheck passed. No runtime behavior was weakened to clear checks.

## Test breakdown and boundaries

Phase 04 adds 36 focused unit/web tests: 12 provider-boundary cases, 8 context/pipeline cases,
11 deterministic quality cases, one manual-state case, one configuration case and three UI
helper cases. The complete unit suite includes all earlier extraction/fusion/media/contracts/
web regressions and totals 136.

Provider-boundary tests verify readiness without network, strict Responses shape, `store:false`,
actual model/usage capture, response reordering by target UUID, missing/duplicate/unknown IDs,
authentication/refusal/incomplete/invalid schema/wrong script, bounded body, transient-only
retry, timeout and cancellation. All HTTP responses are deterministic fake fixtures; these are
not OpenAI account/model validation.

Context/quality fixtures cover bounded targets and surrounding context, no text truncation,
full REVIEW prompt budget including drafts, exact trusted TM, scoped Glossary priority,
explicit speaker bindings, STRICT/NATURAL/CINEMATIC instructions, English negation/number,
Simplified/Traditional Chinese preservation, source risk, every severe fidelity code,
applicable glossary/name warnings and readability signals. They test structure and risk
classification, not subjective Mongolian fluency.

Eight Phase 04 integration tests use a deterministic provider injected behind the production
boundary with real HTTP/DB/queue worker orchestration. They cover profile/characters/aliases/
relationships/scoped Glossary/imported TM ownership; English DRAFT/REVIEW batching and click
idempotency; invalid/foreign speaker binding; manual edit, stale 409, approval and trusted TM;
immutable approved-memory provenance; rerun/history/explicit activation; failed batch draft
checkpoint, atomic concurrent resume and no duplicate calls; cancellation without finalized
rows; Chinese→Mongolian without source script conversion; unavailable provider with earlier
API still working. Canonical source snapshots were compared unchanged.

The other 29 integration tests are the complete Phase 01–03 regression: media upload/inspection,
safe failures/readiness/shutdown, embedded/ASR/OCR source extraction and fusion/atomic evidence.
No real WhisperX, PaddleOCR or paid translation inference runs during this suite.

## Real provider and compiled-runtime evidence

Private `.env` contained neither localization key nor configured model. The real provider smoke
therefore printed `{"event":"real_localization_smoke_skipped","reason":"credentials_or_model_missing"}`.
Consequently **no real English→Mongolian or Chinese→Mongolian provider call was executed**, no
token/cost data exists, and no manual linguistic review of real model output is claimed.

The checked-in real `OpenAiLocalizationProvider` was nevertheless exercised from compiled API
and worker against an owned loopback server that emulated the Responses transport/schema. This
used `provider=openai-responses`, the built `dist` artifacts and real PostgreSQL/BullMQ:

- English: one batch, three canonical rows, DRAFT and REVIEW completed.
- Chinese: one batch, one canonical row, DRAFT and REVIEW completed.
- The exact Phase 03 canonical pages matched before/after.
- English currentText was manually changed while machineDraft survived, then approved and the
  LocalizationRun explicitly activated.

This proves compiled configuration, HTTP adapter serialization/parsing, durable job dispatch,
batch persistence and API state. The response content was deterministic synthetic Mongolian;
it is not real model quality, latency, usage or account-access evidence.

Production browser validation opened the real English Episode. It displayed READY fixture
provider, explicitly active FusionRun selection, NATURAL mode, persisted three-line summary and
source/Mongolian pairs. Approved filter returned one row; browser quick-edit changed a second
row, then per-line approval raised approved-filter count to two. Series page showed both as
HUMAN_APPROVED/TRUSTED TM, and Series setting profile saved/reloaded. The page retained Phase 05
editor controls as unavailable. Browser console warnings/errors: none.

## Deterministic performance observation

Final local run used 900 synthetic canonical lines (a 60-minute shape), batch size 30 and a
zero-network deterministic provider:

| Measurement | Result |
|---|---:|
| Context build | 6 ms |
| Initial LocalizationRun/Batch/LocalizedSegment persistence | 502 ms |
| Worker DRAFT+REVIEW orchestration and persistence | 4,150 ms |
| Worker internal processing duration | 4,042 ms |
| Completed rows / batches | 900 / 30 |
| Provider network calls | 0 |

Measured on the shared Windows host with portable local PostgreSQL. This is explicitly not real
LLM throughput, provider latency, quality, cost or a production capacity benchmark. An earlier
warm run measured 2,254 ms orchestration+persistence; variability was not hidden.

## Data and API verification

Additive migrations create LocalizationRun, LocalizationBatch, LocalizedSegment,
SeriesLocalizationProfile, Character, CharacterAlias, CharacterRelationship, GlossaryEntry and
TranslationMemoryEntry, their enums, checks, composite ownership keys and query indexes. Migration
006 corrects only archival legality for immutable HUMAN_APPROVED provenance. Previous migrations
were not rewritten.

Verified localization routes: provider readiness; Episode run list/create; run detail,
paginated/filtered segments, activate/cancel/resume; localized segment get/optimistic patch/
approve. Verified Series context routes: profile get/patch; character/relationship list/create/
patch; Glossary list/create/patch; Translation Memory list/create/patch. DTOs are Zod-validated;
Prisma rows and provider secrets are not exposed directly.

Indexes exercised by query shapes include run+sequence, run+review classification, transcript
source, Series Glossary term/status and normalized TM source hash. Run+Transcript uniqueness and
batch ordering prevent duplicate localization rows. Speaker, glossary, relationship and active
run ownership are checked against their Episode/Series.

## Known limits and risks

- Real OpenAI/model authentication, English/Chinese translation, token usage, cost, rate limits,
  provider latency and output quality are unverified because credentials/model were absent.
- Model self-confidence remains nullable and subjective. Product confidence is deterministic
  triage, not statistical correctness. Human review is authoritative.
- Lexical heuristics can miss written-out numbers, nuanced negation, inflected names/glossary,
  pronoun/listener reversal, sarcasm and story-level inconsistency. They intentionally flag rather
  than rewrite uncertain lines.
- Context uses exact trusted TM matches and bounded nearby lines; fuzzy TM, scene detection and
  series-wide semantic retrieval are deferred. User-managed memory may itself be wrong.
- Provider REVIEW output can make a complete prompt exceed its bound; the run fails explicitly
  and can be rerun with smaller batch settings. Completed batches/drafts remain resumable.
- Resume retries an incomplete REVIEW provider call; external billing idempotency depends on the
  provider. Local target persistence remains idempotent.
- No pricing table is hard-coded; estimatedCost stays null unless a future configured pricing
  boundary supplies it. Usage remains null when provider omits it.
- Core authentication, production deployment, Docker Compose, distributed crash recovery and
  long-episode real-provider testing remain outside verified scope.
- Windows OneDrive generated `.next` output can require stopping Next and moving the owned ignored
  build aside; build and typecheck must remain sequential. No such move was needed in the final run.

## Scope boundary and continuation

Continuity updated in PROJECT_STATE, HANDOFF, AGENTS, ARCHITECTURE, ROADMAP, DOMAIN_MODEL,
PROVIDERS, VALIDATION, LOCALIZATION_PIPELINE, PHASE_04_PLAN and ADR0005.

STOP. Phase 05 was not started. No waveform, draggable timeline, timing resize, subtitle
split/merge, keyboard editor, undo/redo, video cut/crop/logo/blur/effects, render/export or final
QC dashboard was implemented. The exact continuation point is the explicitly active COMPLETED
LocalizationRun and stable LocalizedSegments with machine/current text, revisions, confidence,
approval and full canonical/source provenance.
