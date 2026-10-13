# Phase 03 handoff

Read PROJECT_STATE.md first. Branch codex/phase-03-transcript-fusion was created
directly from approved Phase 02 bc416581c97ae0648f4ce3f21bf902c973034670.
Phase 02 implementation was 28a4f0dbad76067be2f3cf72ade8e6394186ca4a.
Phase 03 implementation commit: `b1a3b90162c6b77a6e1aee37f85c2f8c1c586f3a`; inspect git log -2 for
implementation and continuity HEAD. No merge, push or external deployment performed.
Phase 03 is the stopping point. Phase 04 requires new explicit user authorization.

## Startup on this Windows checkout

Private .env, portable tools and model caches remain ignored. Separate terminals:

```powershell
pnpm dev:local-infra
# Wait for PostgreSQL56432 and Redis56379; preserve unrelated55432.
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open http://127.0.0.1:3000. Fusion works without the Python provider service; it uses
completed stored evidence. Embedded extraction remains available without AI.
For optional inference, follow docs/PROVIDERS.md, pinned Python3.11 uv environment,
private provider token and pnpm dev:providers. No new keys/models are needed here.

For compiled runtime from repository root, with .env loaded:

```powershell
pnpm exec dotenv -e .env -- node apps/api/dist/main.js
pnpm exec dotenv -e .env -- node apps/worker/dist/main.js
pnpm --filter @mongolsub/web exec next start --hostname 127.0.0.1
```

Stop owned services with Ctrl+C. Final verification services are stopped; local data
persists. Docker host socket failure remains unresolved. The root dev runner keeps
shared storage/work roots absolute. Do not change unrelated services.

## Manual workflow

1. Import/inspect media and extract independent sources as in Phase 02.
2. In Transcript reconciliation, select exact completed input runs for the chosen
   media. Up to 12 inputs, at most 1 embedded run; old experimental reruns stay unchecked.
3. Choose AUTO/English/Chinese, optionally adjust saved algorithm thresholds. Different
   language families are timing-only. AUTO's result and reason are visible on the run.
4. Build transcript. Observe durable queued/processing/completed/failed/cancelled jobs.
   Matching requests reuse identity; Run again creates a separate caller UUID revision.
5. Select a completed history entry. Viewing/new completion never activates it.
6. Inspect canonical lines and original candidates side by side, roles, similarity/IoU,
   reasons, provider metadata, words and anonymous speakers. Use paginated issue filters.
7. Edit canonical text and integer start/end milliseconds; optionally mark Reviewed or
   Approved. Edits preserve derived values and all source evidence; normal edits reset
   human review to Unreviewed. Stale edits receive409 and must reload the latest revision.
8. Make the chosen transcript active explicitly. A rerun preserves earlier edits and
   the active choice. Confidence/categories/summary stay the algorithm completion snapshot.
9. Cancel queued/processing runs before final commit; no partial completed transcript
   appears. Cancellation after completion cannot undo committed history.

Existing legal actual-provider smoke records are in ignored data/phase02-runtime-smoke.json.
pnpm test:smoke:fusion consumes them through compiled API/worker, compares source
payloads before/after, edits/approves/activates and verifies rerun history. It requires
those local records, not fresh provider inference; creates new synthetic fusion history.
Its report is data/phase03-runtime-smoke.json. Screenshots are data/phase03-fusion-*.jpg.

## Validation and recovery

Stop all other MongolSub workers before integration: tests own temporary media roots.
Never flush shared Redis, truncate databases or delete unowned records.

```powershell
pnpm db:migrate
pnpm db:test:migrations
pnpm lint
pnpm test
pnpm test:integration
pnpm benchmark:fusion
pnpm benchmark:fusion:persistence
# Stop the production web server before rebuilding on Windows.
pnpm build
pnpm typecheck
```

Build and typecheck share generated Next files; run them sequentially. OneDrive
read-only/reparse generated .next caused EPERM cleanup. The owned previous build
was preserved under ignored .tools/phase03-next-prior and a fresh build passed.
Do not delete user work or disable OneDrive/security settings as a workaround.

Migrations003/004 are additive. Composite references prevent cross-media input links
and source deletion leaving invalid evidence. Deferrable NO ACTION ownership/active
foreign keys allow normal Episode/Series cascade cleanup while rejecting standalone
evidence destruction at transaction commit. Migration004's initially incorrect long
FK name was repaired after marking its failed transaction rolled back; clean-schema
apply of all four migrations and final reapply passed. Do not rewrite applied migrations.

Fusion final transaction locks the job state before any transcript/evidence batches.
Failure rolls back all rows; cancellation wins only before this lock/commit. At-least-once
terminal delivery is a no-op. Process crashes while PROCESSING share existing worker
recovery limitations; no automatic destructive cleanup policy was added.

See docs/PHASE_03_VALIDATION.md for exact results, deterministic synthetic tests versus
actual stored Phase02 evidence, benchmark scope and known limits. No new real ASR/OCR
inference, Chinese speech/GPU/diarization or long-episode quality was claimed here.

## Exact future continuation

STOP until explicit Phase 04 authorization. Consume the explicitly active completed
FusionRun, its current canonical TranscriptSegments and independent human review
state; retain links to immutable source text, words, stream and provider provenance.
Introduce localization records separately without overwriting canonical/manual or
source history. No translation/editor/render functionality is implemented by this phase.

Required reads: PROJECT_STATE, HANDOFF, AGENTS, docs/MASTER_SPEC, ARCHITECTURE,
ROADMAP, DOMAIN_MODEL, PROVIDERS, VALIDATION, PHASE_02_VALIDATION,
PHASE_03_VALIDATION, FUSION_ALGORITHM and docs/adr/*.
