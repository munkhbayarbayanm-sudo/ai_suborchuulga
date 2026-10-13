# Phase 03 validation — 2026-10-13 (Asia/Ulaanbaatar)

Branch: `codex/phase-03-transcript-fusion`. Created directly from approved Phase02
`bc416581c97ae0648f4ce3f21bf902c973034670`; approved implementation
`28a4f0dbad76067be2f3cf72ade8e6394186ca4a` is its ancestor. Initial worktree was clean.
Phase03 implementation commit: `b1a3b90162c6b77a6e1aee37f85c2f8c1c586f3a`.
Current HEAD is the final continuity commit; inspect `git log -2`.
No merge/push, external deployment, Phase04 translation or professional editor work.

## Executed checks

| Command | Result / exact scope |
|---|---|
| `pnpm db:generate` | exit0, Prisma6.19 Client with additive fusion schema |
| `pnpm db:migrate` | all four migrations applied; final deploy exit0/no pending |
| `pnpm db:test:migrations` | exit0; all four SQL migrations applied to fresh UUID schema, only that owned schema removed afterward |
| `pnpm lint` | exit0, full repository ESLint |
| `pnpm typecheck` | exit0,12 workspace packages plus scripts/tests/config tooling |
| `pnpm test` |100/100,14 files, exit0 |
| `pnpm test:integration` |29/29,3 files, exit0; real HTTP/PostgreSQL/Redis/BullMQ/storage/FFmpeg |
| `pnpm build` | all3 apps passed: Next production, API/worker ESM; final run rebuilt web, reused unchanged verified backend build cache |
| `uv run --directory services/providers --locked --no-sync pytest -q` |21 passed, 1 Windows symlink-privilege skip; unchanged provider regression |
| `pnpm benchmark:fusion` | two synthetic sizes,3 repetitions each; details below |
| `pnpm benchmark:fusion:persistence` | actual PG transcript/evidence transactions,2 sizes,3 repetitions; owned fixture cleanup passed |
| `pnpm test:smoke:fusion` | compiled API/worker actual stored Phase02 evidence, immutable source comparison, manual/active/rerun checks passed |
| production `next start` + browser | actual UI queued/completed, corrections/approval, explicit activation, rerun, filters, reload/evidence/words and Chinese inspection passed |

Final unit breakdown:29 pure fusion tests,2 new fusion contracts,10 fusion UI helpers,
3 polling regressions,56 earlier Phase01/02 unit/web tests. The web subset totals31.
Independent reviewers approved spec compliance and code quality after fixes; code
reviewers reran31 algorithm/contracts tests,28 web tests, then13 fusion/polling tests.
Their approval was code review; browser/runtime evidence was executed separately.

## Fusion algorithm tests

Deterministic fixtures cover interval IoU/containment/gap signals,1:1 exact agreement
(two unknown-confidence sources still get HIGH through derived agreement), negation
conflict,1:many/many:1 ordered bundles, OCR boundary fuzz, delayed500ms media timing,
cross-language Chinese canonical/English timing-only without text scores, Simplified/
Traditional preservation without conversion, only-ASR, duplicate same-method reruns,
three-method majority support, timing/speaker disagreement, captions/UNKNOWN text,
AUTO coverage/count/confidence/method/declared-language ties, input identities, cancellation,
determinism and bounded dense windows with 6000 same-time records.

Word tests prevent incomplete/zero-duration alignment from clipping text or creating
invalid intervals. ASR words must cover both their candidate and the elected text; a
fuzzy supporter omitting a word cannot trim canonical timing. Approximate agreement is
review-capped. Raw missing provider confidence stays null; product priors are documented.

## Real integration tests

Eight new grouped tests use persisted synthetic source evidence, real Nest endpoints,
Prisma/PostgreSQL and BullMQ. They do not call inference models:

1. Queued fusion completes with canonical text, evidence roles, confidence categories,
   original words and deterministic paginated detail/includes.
2. Concurrent/default identity reuse and sorted inputs; invalid episode/media/selected
   run/language/duplicate embedded/settings rejected.
3. Chinese canonical with English timing-only evidence, null lexical score/weight.
4. Manual text/timing/APPROVED state persists, original derivation recoverable,
   optimistic stale409 and invalid merged timing rejected; source payload hash unchanged.
5. Rerun history preserves manual work; explicit activation required and persists.
6. Queued cancellation has no transcript; activation fails; terminal worker redelivery noop.
7. API cancellation injected immediately before final persistence, no partial valid result.
8. Actual PostgreSQL final write rejection (duplicate injected ID/P2002) rolls back all
   transcript/evidence rows; unselected evidence ownership FK rejects invalid link.

All 21 earlier integration tests passed:9 Phase01 import/inspection/error/readiness/queue/
shutdown and12 Phase02 exact streams/languages/ASS/audio delay/cache/words/OCR grouping/
provenance/readiness/idempotency/cancellation/process/temp cleanup regressions. Phase02
normal integration uses explicitly injected deterministic ASR/OCR contract providers;
this is not actual WhisperX/Paddle inference. Production adapters remain unchanged.

Tests stop other MongolSub workers first and clean only owned synthetic Series/assets
and temporary roots. No Redis flush, database truncate or unrelated service cleanup.

## Compiled/runtime and browser

Actual compiled `node apps/api/dist/main.js`, `node apps/worker/dist/main.js` and
production `next start` were exercised. Python provider service was stopped; existing
English embedded/WhisperX/Paddle and Chinese OCR evidence remained usable for fusion.

The smoke script parsed local Phase02 fixture IDs, compared every public source payload
(including words/metadata) before/after, built English and Chinese canonical transcripts,
manually edited/approved an English line, explicitly activated it and made a separate
inactive rerun. Simplified `你好世界汉字测试` and Traditional `你好 世界 漢字測試` stayed
unchanged with canonical language zh. No provider inference was rerun in Phase03.

Browser on the actual 7s synthetic English episode selected all three explicit inputs,
observed QUEUED→COMPLETED, inspected primary OCR and conflicting embedded/ASR text,
expanded original 7-word ASR timing, edited text plus 100–6900ms bounds and explicitly
approved a 20% LIKELY_PROBLEM line. Algorithm metrics stayed labelled completion snapshot.
Manual filter returned that line. Explicit activation selected the edited revision;
new rerun completed inactive, earlier correction/active choice survived reload. Chinese
OCR canonical evidence was separately inspected while both AI providers were unavailable.
After the polling fix, rebuilt production UI also observed a new queued run complete.

Screenshots are ignored local artifacts: data/phase03-fusion-inspector.jpg,
data/phase03-fusion-evidence.jpg and data/phase03-fusion-mobile.jpg. Desktop1440 and320/375/768px viewports had equal
document client/scroll widths (1425/305/360/753 due scrollbar);375px controls were
inspected with no element extending past the viewport. Console warnings/errors: none.

## Synthetic benchmark (no real video)

Pure benchmark three repeats with fixed text/timing/settings:

| Duration / sources | Alignment ms | Reconciliation ms | Total ms |
|---|---|---|---|
|45min,500 per method,1500 total |3.56 /2.32 /3.10 |24.81 /22.20 /21.83 |40.39 /36.08 /33.59 |
|60min,1200 per method,3600 total |4.81 /7.46 /4.44 |48.67 /45.79 /57.82 |81.05 /69.19 /79.23 |

Real PostgreSQL worker benchmark three repeats,500/1200 canonical rows and1500/3600
evidence links respectively:

| Duration / sources | Alignment ms | Reconciliation ms | Persistence ms | Worker wall ms |
|---|---|---|---|---|
|45min/1500 |21 /5 /3 |34 /27 /24 |291 /249 /248 |463.11 /376.61 /366.29 |
|60min/3600 |10 /5 /4 |66 /55 /54 |553 /524 /549 |819.49 /772.11 /832.84 |

Persistence snapshot measures transactional writes before commit; structured completion
logs include commit and showed280–645ms. Worker wall includes reads/validation/progress
and transaction completion. Measurements used the shared Windows CPU/local portable PG,
with other validation load; not an isolated machine benchmark. Fixtures/DB records were
owned and cleaned. No ASR/OCR/video decode time or real-episode accuracy measurement.
The sorted temporal index plus fixed candidate/bundle bounds avoids whole-episode all-pairs;
see FUSION_ALGORITHM for complexity and pathological-window review behavior.

## Validation repairs and honest limits

Composite nested input creation was corrected to a separate createMany in the same
transaction. Immediate evidence FKs initially blocked normal Episode cascade ordering;
ADR0004/migration004 uses deferred checks. First004 apply used an incorrect PostgreSQL
truncated constraint name; corrected to actual generated name, failed transaction marked
rolled back, deploy and fresh-schema checks passed. Two owned failed-test fixtures were
verified and cleaned; no user records altered. Applied migrations are now fixed history.

Review/test fixes: complete positive words matching elected text, fuzzy-agreement review
cap, derived exact agreement for unknown provider confidence, provider-language aliases,
stale-edit409 and slow-response polling. One-shot Phase03 polling waits for request
settlement; fake-timer5s response with2s cadence, terminal stop and cleanup tests passed.

Final build/typecheck initially ran concurrently and failed as Next regenerated types.
Next cleanup also hit Windows EPERM on read-only OneDrive reparse generated output.
Web server was stopped, old .next moved safely into ignored .tools/phase03-next-prior,
fresh production build passed and subsequent sequential typecheck passed. Automatic
approval review blocked a proposed generated-directory deletion; reversible move succeeded.
No source files/settings or external services were destroyed.

No new model downloads/inference, GPU, Chinese speech ASR, diarization, Docker Compose,
Linux deployment, real long-episode media or accuracy claims. Phase02 historical inference
evidence remains in PHASE_02_VALIDATION. Old ffprobe4.0.2 is not production security proof.
Fusion-v1 lacks script conversion, semantic/VAD/global-drift inference and named-character
resolution; UNKNOWN captions retained. Bounds can split long/dense mappings and flag review.
Confidence is a heuristic, not probability; manual changes leave historic scores/metrics.
Core lacks authentication and production crash recovery/GC; no redesign was authorized.

## Handoff boundary

Verification app/provider/portable infrastructure processes are stopped at handoff;
unrelated PostgreSQL55432 is preserved. Ignored fixture data/caches/proof images remain.
See HANDOFF for exact startup/manual workflow. Continuity updated in PROJECT_STATE,
HANDOFF, AGENTS, ARCHITECTURE, ROADMAP, DOMAIN_MODEL, VALIDATION, this report,
FUSION_ALGORITHM, PHASE_03_PLAN and ADR0004.

STOP. Await explicit Phase04 authorization. Its input is the explicitly active completed
canonical transcript with human review state and immutable evidence/word links; localization
must use new revisions/entities. No translation, LLM calls, glossary/memory intelligence,
professional timeline/waveform/editor or export/render work was started.
