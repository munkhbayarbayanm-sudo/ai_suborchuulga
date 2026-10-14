# Phase 06 implementation plan — subtitle QC and series consistency

Branch: `codex/phase-06-subtitle-qc`
Approved baseline: `04fba34fdce43f6ee011aa7638626df6a7ba8e1f`

## Design

Phase 06 adds a revision-bound derived QC layer over `SubtitleDocument`. It never writes cue data
directly. A document or series run records exact document IDs/revisions and a normalized profile
snapshot. Deterministic rules run without any provider. Optional linguistic review reuses the Phase 04
provider contract as a bounded REVIEW request over the current edited Mongolian text; validated output
becomes issues and proposals only.

`QCRunDocument` records every analyzed document, including the one-document case. `QCIssueCueLink`
supports pair/cluster/cross-episode findings. Issue fingerprints include rule plus relevant cue IDs and
normalized timing/text, so ignored state carries forward only when the evidence is unchanged. Any editor
operation marks completed runs containing that document stale in the same transaction.

## Task 1 — deterministic QC package

Files: `packages/qc/*`, `tests/unit/qc-engine.test.ts`.

1. Add failing tests for timing, overlap/gap/order, density, CPS, lines, whitespace, duplicates,
   punctuation, untranslated English/Chinese, mixed language, negation, number, names, glossary and
   `чи/та` switching.
2. Implement typed profile normalization, ordered near-linear document scanning, explainable metrics,
   deterministic fingerprints and suggestion payloads.
3. Add series grouping by character/glossary keys without whole-series all-pairs comparison.

Verification: `pnpm vitest run --project unit tests/unit/qc-engine.test.ts` must fail before the package
exists and pass after implementation.

## Task 2 — contracts and additive persistence

Files: `packages/contracts/src/qc.ts`, `packages/database/prisma/schema.prisma`,
`packages/database/prisma/migrations/202610140003_subtitle_qc/migration.sql`, contract tests.

Add `QCProfile`, unified document/series `QCRun`, exact `QCRunDocument` inputs, `QCIssue`,
`QCIssueCueLink` and `QCSuggestion`. Add explicit enums, constraints, ownership foreign keys and indexes
for run pagination, open issue filters, cue reverse lookup and fingerprints. Extend `Series` with an
explicit default profile and ProcessingJob with `RUN_SUBTITLE_QC`/`RUN_SERIES_QC`.

## Task 3 — API and durable orchestration

Files: `apps/api/src/qc.service.ts`, `apps/api/src/qc.controller.ts`, app wiring and integration tests.

Implement profile CRUD, document/series run creation/list/detail/cancel, filtered paginated issue reads,
issue resolution/ignore and suggestion application. Applying a suggestion delegates to the existing
editor operation service with the run's current expected revision. No QC repository mutates cues.
Creation is idempotent by document revisions, profile snapshot, engine version, AI settings and optional
caller rerun key.

## Task 4 — worker and optional linguistic review

Files: `apps/worker/src/qc.ts`, worker/queue wiring, provider contract tests.

Run stages: load exact inputs, deterministic rules, consistency rules, optional bounded linguistic
review, atomic issue persistence and summary. `PROBLEMATIC_ONLY` reviews deterministic/manual/risky
candidates; `ALL` is explicit; `OFF` is the default. Provider failure completes deterministic QC with
an explicit unavailable/failed AI stage unless the request requires AI. Cancellation never exposes a
partially completed report.

## Task 5 — editor and series UI

Files: `apps/web/components/subtitle-editor.tsx`, `apps/web/components/qc-panel.tsx`, web helpers/styles,
`apps/web/app/series/[id]/quality/page.tsx` and series navigation.

Add a compact filter-first QC panel, run/summary controls, severity/category/state filters, previous/next
issue navigation, non-color timeline markers, cue inspector detail and explicit suggestion application.
Series quality uses explicit active documents, reports missing active documents and navigates to the
correct episode/document/cue.

## Task 6 — regression, performance and continuity

Files: `scripts/qc-benchmark.ts`, `docs/QC_ENGINE.md`, `docs/PHASE_06_VALIDATION.md`, ADR and continuity
documents.

Run fresh migrations; lint; typecheck; unit/web/integration suites; production build; compiled API,
worker and Next runtime; browser flow. Benchmark a 60-minute/1,200-cue document and 20 episodes/~20,000
cues separately. Report deterministic and injected-provider evidence separately. Commit implementation,
then record exact hashes in the handoff commit and stop before Phase 07, general video editing or export.

## Acceptance constraints

- Original media and Phase 02–04 evidence remain immutable.
- Phase 05 operation history remains the only cue mutation path.
- Human ignore/resolve state is independent from severity.
- `QC_CLEAR` means no open findings under the captured profile, not guaranteed correctness.
- No paid-provider success is claimed unless a real call is executed.
- No cut/trim/effects, final subtitle/video export or render is introduced.
