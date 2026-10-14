# Phase 06 validation — full subtitle QC and series consistency

Date: 2026-10-14, Asia/Ulaanbaatar
Branch: `codex/phase-06-subtitle-qc`
Approved Phase 05 baseline: `04fba34fdce43f6ee011aa7638626df6a7ba8e1f`
Phase 06 implementation commit: `6d30da230bdb43ce8fd670f00cec67be7c71cf38`

## Scope validated

Phase 06 adds revision-bound document/series QC over edited SubtitleDocuments. Original media,
SourceExtractionRun/SourceSegment, FusionRun/TranscriptSegment, LocalizationRun/LocalizedSegment and
EditorOperation history are not rewritten. The new engine version is `subtitle-qc-v1`; optional AI prompt
version is `subtitle-qc-ai-v1`.

## Automated evidence

Final command results are recorded here after the final clean run:

| Command | Result | Evidence scope |
|---|---|---|
| `pnpm db:migrate` | 11 migrations applied/current | additive Phase 01 through Phase 06 chain on local PostgreSQL |
| `pnpm db:test:migrations` | exit 0; 11/11 migrations | fresh isolated schema chain |
| `pnpm test` | 163/163, 25 files, exit 0 | all unit/web regressions plus QC rules/contracts/helpers |
| `pnpm test:integration` | 49/49, 6 files, exit 0 | all real PostgreSQL/Redis/Nest/storage/media regressions plus QC |
| `pnpm lint` | exit 0 | repository ESLint |
| `pnpm typecheck` | exit 0 | 15 workspaces plus tooling/tests/scripts |
| `pnpm build` | 3/3 apps, exit 0 | Next, API and worker production artifacts |
| compiled runtime | passed | built API on 4000, worker ready and Next on 3000 |
| browser workflow | passed | legal synthetic document QC and Series Quality flow |

Focused TDD evidence already executed: QC engine 7/7, contracts 3/3 and web helpers 3/3. The real
Nest/PostgreSQL QC integration suite passes 4/4. It verifies offline deterministic results, stable ignore
fingerprints, current-revision local preview, suggestion to EditorOperation, stale marking, undo, explicit
active series input, cancellation, bounded provider calls, response ID mapping, non-destructive proposals,
malformed output and optional-provider unavailability.

## Deterministic and provider evidence

Normal tests do not make paid calls. `OfflineProvider` proves deterministic QC completes with AI stage
UNAVAILABLE. `QCProvider` is an injected deterministic fixture; it proves REVIEW phase batching (maximum
12 targets), context boundary, stable ID mapping and proposal-only persistence. A malformed fixture emits
an unknown ID; runtime validation rejects the AI stage while deterministic QC completes because AI was
optional. This is not a real LLM quality test.

Real provider readiness returned MISCONFIGURED because no localization model/key was configured. No real
AI linguistic-review call was executed or claimed.

## Performance

`pnpm benchmark:qc` uses legal synthetic data and local PostgreSQL. It separately measures a 60-minute,
1,200-cue deterministic document pass and a 20-episode, 20,000-cue series pass plus issue/link persistence.
Measured results: document 22 issues in 26 ms; series consistency one issue in 25 ms; 111 issue links
persisted in 19 ms. These timings represent local deterministic TypeScript
and PostgreSQL only; they exclude provider latency, browser paint, media decode and network throughput.

## Browser acceptance

The intended legal synthetic flow is: open edited document, run offline QC, inspect counts, filter issues,
navigate/seek to a cue, inspect timeline marker, ignore/resolve, apply a suggestion, undo, observe STALE,
then open Series Quality and navigate a cross-document finding. The compiled browser flow completed: five
document issues produced three symbolic error markers; issue navigation selected and sought cue 1;
whitespace suggestion changed revision 0 to 1 and marked the report STALE; Undo produced revision 2;
Series QC used two exact active documents and its cross-series name issue opened the correct Episode 2
document and cue.

## Known limitations

- Heuristic untranslated, negation, number, name, glossary and address-form checks are review signals.
- Name/glossary consistency depends on explicit approved series memory; the system does not invent canon.
- Local preview rechecks changed cues and a bounded neighbor window; full QC is required for authoritative
  whole-document and series status.
- Optional AI linguistic review quality is unverified without real provider credentials.
- The managed worktree did not contain the ignored `.tools` directory; portable PostgreSQL/Redis were
  launched from the primary checkout's existing Windows toolchain on the same configured loopback ports.
- Series issue UI currently loads a bounded 200-issue page; document editor fetches persisted issues in
  200-row API pages and renders 50 at a time.
- No production deployment, Docker Compose, large real-footage certification or multi-user concurrency
  certification was performed.

## Boundary confirmation

Phase 07 general video editing was not started. No cut, trim, effects, audio edit, final subtitle/video
export or render pipeline was added.
