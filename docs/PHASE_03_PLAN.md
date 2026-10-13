# Phase 03 transcript fusion implementation plan

Approved baseline: bc416581c97ae0648f4ce3f21bf902c973034670.
Branch: codex/phase-03-transcript-fusion, based directly on that commit.
User explicitly authorizes complete Phase 03, validation, commit and STOP; no
Phase 04/translation, professional editor, merge or push. Their detailed design
and implementation authorization permits routine algorithm/domain choices here.

Goal: derive a reproducible, inspectable canonical transcript from explicitly
selected immutable extraction evidence. Preserve all source records and words.
Architecture: existing Nest/Next/Prisma/BullMQ worker; pure deterministic fusion
package; additive schema; no Python/model dependency for fusion. No stack redesign.

## Decisions

- FusionRun + explicit FusionRunInput join + TranscriptSegment + EvidenceLink.
  Composite foreign keys protect episode/asset/input/segment ownership.
- Explicit AUTO/ENGLISH/CHINESE request; stored canonical en/zh chosen by bounded
  evidence summaries (coverage/count/confidence/method richness, declared language).
  No lexical comparison across language families. Unknown languages are timing-only.
- Ordered temporal windows, IoU/containment/center and near-gap thresholds; bounded
  split/merge bundles. No all-pairs whole-episode matching or transitive giant cluster.
- Unicode/case/whitespace/limited punctuation comparison only; original text stays
  untouched. Simplified/Traditional remain zh; no conversion library in v1, with
  explicit limitation/review reasons for script differences.
- Candidate selection uses method quality and independent method agreement,
  conflict/ambiguity penalties. Configurable heuristic defaults are not calibrated
  probabilities. Preserve alternatives; never generate or translate sentences.
- Canonical timing uses agreeing ASR words when available, otherwise consensus
  boundaries of eligible supporting evidence. Cross-language evidence cannot vote
  on text. Anonymous speaker disagreements remain uncertain.
- Derived text/timing retained separately from manual text/timing; optimistic edit
  revision prevents lost updates. Human UNREVIEWED/REVIEWED/APPROVED is independent
  of HIGH_CONFIDENCE/REVIEW_RECOMMENDED/LIKELY_PROBLEM algorithm classification.
- Default identical requests deduplicate; caller UUID reruns create history.
  Activation is explicit; completing or rerunning never replaces active run.
- Atomic final persistence and job-row cancellation locking; no partial valid result.

## Tasks (TDD; implementation subagents dispatched sequentially)

- [x] Contracts/model: packages/contracts/src/fusion.ts; schema/additive migration;
      failing runtime-boundary tests, then strict DTOs and FUSE_TRANSCRIPT job enum.
- [x] Pure algorithm: packages/fusion/src/{types,language,text,alignment,reconcile,index}.ts;
      deterministic tests for 1:1, conflicts, 1:many/many:1, OCR offsets,500ms audio
      offset, cross-language, scripts, singleton, majority, deterministic ties/bounds.
- [x] Persistence/API/worker: fusion service/controller/DTO, worker fusion runner,
      explicit activation, paginated issue filters/evidence includes, optimistic edits.
      Integration uses real HTTP/PG/BullMQ with persisted synthetic source evidence;
      ownership, manual preservation, rerun, cancellation and DB-failure atomicity.
- [x] UI: Episode fusion panel, explicit input checkboxes/language, jobs/run history,
      active selection, accurate summary, paginated filters and side-by-side evidence,
      minimal text/millisecond timing/review edit; no waveform/dragging/editor expansion.
- [x] Benchmark: deterministic45–60minute evidence500–1200segments per method;
      measure alignment/reconciliation and actual PostgreSQL persistence separately.
- [x] Validation: migrate, lint/typecheck/unit/integration/build; run compiled artifacts
      and browser create/review/edit/rerun/activate/filter; regression Phase01/02.
- [x] Reviews: read-only spec compliance, fix/re-review, then code quality.
- [x] Continuity: PROJECT_STATE/HANDOFF/AGENTS/ARCHITECTURE/ROADMAP/DOMAIN_MODEL/
      VALIDATION/PHASE_03_VALIDATION and ADR0004; commit, clean status, STOP.

Commands: pnpm db:generate; pnpm db:migrate; pnpm lint; pnpm typecheck;
pnpm test; pnpm test:integration (all other MongolSub workers stopped); pnpm build.
Expected: strict boundary rejection tests pass, all regression tests/builds pass;
actual failed prerequisites are reported separately. Preserve unrelated services,
never flush Redis/truncate databases, never commit private env/media/tools/builds.
