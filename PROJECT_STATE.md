# MongolSub Studio — project state

Updated 2026-10-14, Asia/Ulaanbaatar.

| Field | State |
|---|---|
| Current / last authorized phase | Phase 06: full subtitle QC and series consistency |
| Approved Phase 05 baseline | `04fba34fdce43f6ee011aa7638626df6a7ba8e1f` |
| Active branch | `codex/phase-06-subtitle-qc`, created directly from the approved Phase 05 commit |
| Phase 06 implementation commit | `6d30da230bdb43ce8fd670f00cec67be7c71cf38` |
| Merge / push | Neither authorized nor performed |
| Next phase | Phase 07 requires new explicit authorization |
| Deployment | Local Windows validation only; Docker host failure remains unresolved |

## Implemented through Phase 06

Phases 01–05 remain intact: immutable media, independent source evidence, versioned fusion,
English/Chinese to Mongolian localization, memory, explicit active runs, derived SubtitleDocuments,
append-only EditorOperations, undo/redo, playback proxy, waveform and proposal-only AI rewrite.

Phase 06 adds QCProfile, revision-bound document/series QCRun, exact QCRunDocument inputs, QCIssue,
QCIssueCueLink and QCSuggestion. The deterministic subtitle-qc-v1 engine checks timing, overlap/gaps,
density, reading load, layout/text hygiene, untranslated/mixed text, negation/numbers, explicit names,
glossary and contextual чи/та shifts. Series consistency groups explicit active documents by approved
character/glossary memory. Evidence fingerprints carry an ignore only when relevant evidence is unchanged.

RUN_SUBTITLE_QC and RUN_SERIES_QC use the existing durable worker path. Optional AI review is OFF by
default, bounded and provider-validated. Provider absence or optional malformed output does not remove
deterministic results. Suggestions never change cues; acceptance delegates to EditorService, remains
undoable and marks older reports stale. A bounded local deterministic preview runs after cue edits.

The editor adds summary, severity/category/state filters, paginated issues, next/previous navigation,
non-color timeline markers, cue seek and suggestion actions. Series Quality shows exact document
revisions, missing active documents, profile override and deep links to each episode/document/cue.

## Executed evidence

See `docs/PHASE_06_VALIDATION.md` for exact commands and counts. Deterministic/provider-boundary QC,
real Nest/PostgreSQL integration, additive migration chain, synthetic 1,200-cue and 20,000-cue benchmarks,
production build, compiled runtime and browser workflow are recorded separately. No paid provider result
is inferred from deterministic fixtures.

## Environment and limitations

Validated locally on Windows with the repository's portable PostgreSQL/Redis and FFmpeg setup. Heuristic
language/fidelity checks are review signals, not proof of semantic correctness. Name/glossary checks only
use explicit memory. Local recheck is bounded and transient; full QC is the authoritative captured report.
AI linguistic quality remains unverified unless real credentials are supplied.

No Phase 07 general video editing, final subtitle/video export, render pipeline, cut/trim/effects or audio
editing was implemented.

## Exact continuation

STOP. Await explicit Phase 07 authorization. Continue from explicit active SubtitleDocuments and their
current revisions. A future phase may consume completed current QCRuns, but must preserve historical
reports, issue links, ignores, EditorOperation history and all Phase 02–04 evidence.

Required reads: `AGENTS.md`, `PROJECT_STATE.md`, `HANDOFF.md`, `docs/MASTER_SPEC.md`,
`docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DOMAIN_MODEL.md`, `docs/VALIDATION.md`,
`docs/PHASE_06_VALIDATION.md`, `docs/QC_ENGINE.md`, `docs/SUBTITLE_EDITOR_ARCHITECTURE.md` and
`docs/adr/*`.
