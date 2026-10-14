# Phase 04 handoff

Read PROJECT_STATE.md first. Branch `codex/phase-04-mongolian-localization` was created
directly from approved Phase 03 `a195a3f31a1f2ad177394ec2b390802175e0896a`.
Phase 03 implementation was `b1a3b90162c6b77a6e1aee37f85c2f8c1c586f3a`.
Phase 04 implementation commit: `6c26caf018448b5365c3d9556d928208d5749967`; inspect `git log -2` for the
final continuity commit. No merge, push or external deployment was performed. Phase 04 is the
stopping point; Phase 05 requires explicit authorization.

## Windows startup

Private `.env`, portable tools, model caches and local validation records remain ignored.
Use separate terminals:

```powershell
pnpm dev:local-infra
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://127.0.0.1:3000`. Extraction providers are optional and documented in PROVIDERS.
Localization requires server-side `LOCALIZATION_PROVIDER`, `LOCALIZATION_API_KEY`,
`LOCALIZATION_MODEL` and optional base URL/timeout/output/retry settings. Missing localization
configuration is visible as unavailable and does not disable Phases 01–03. Never expose the key
to Next/browser contracts. The default device for Phase 02 remains CPU; Phase 04 itself adds no
Python/GPU dependency.

Compiled runtime after `pnpm build`:

```powershell
pnpm exec dotenv -e .env -- node apps/api/dist/main.js
pnpm exec dotenv -e .env -- node apps/worker/dist/main.js
pnpm exec dotenv -e .env -- pnpm --filter @mongolsub/web exec next start --hostname 127.0.0.1 --port 3000
```

Stop owned processes with Ctrl+C. Do not flush shared Redis, truncate PostgreSQL or run more
than one MongolSub worker during integration; tests use a temporary media root.

## Manual workflow

1. Complete/activate a Phase 03 English or Chinese FusionRun. The Episode localization panel
   preselects the active FusionRun; choosing another completed run is explicit.
2. Verify provider READY, select STRICT/NATURAL/CINEMATIC and generate. Repeated transport with
   the same rerun key reuses the run; a new intentional action creates history.
3. Observe Preparing context, Translating batch, Checking fidelity and Finalizing stages.
   Cancel queued/processing work. Resume a FAILED run with the same provider/model; completed
   batches and draft checkpoints remain.
4. Select any historical run. Viewing/completion never activates it. Inspect persisted totals,
   confidence categories, source/Mongolian rows, reasons, alternatives and filters.
5. Edit Mongolian text. A stale revision returns 409. machineDraft remains unchanged and the row
   becomes MANUALLY_EDITED. Approve only individual reviewed rows; approval is never automatic.
6. Confirm the approved row appears in Series Translation Memory as HUMAN_APPROVED/TRUSTED.
   Later text/review changes archive that exact revision's memory.
7. Explicitly activate a completed localization. A rerun remains inactive and cannot overwrite
   earlier edits or approvals.
8. Manage Series profile, characters/aliases/relationships and scoped Glossary. Do not record
   uncertain model guesses as canon. GLOBAL, SERIES, EPISODE and CHARACTER scopes are available.

## Validation and recovery

```powershell
pnpm db:migrate
pnpm db:test:migrations
pnpm lint
pnpm test
pnpm test:integration
pnpm test:smoke:localization
pnpm benchmark:localization
pnpm build
pnpm typecheck
```

Build and typecheck share Next generated types; run them sequentially. `test:smoke:localization`
makes two tiny original real-provider calls only when a valid key and model exist; otherwise it
prints an explicit skip. Deterministic provider tests and the benchmark are not real LLM proof.

Migrations 005/006 are additive. 005 creates localization/memory/history constraints and query
indexes. 006 permits archival of a HUMAN_APPROVED entry while retaining immutable provenance;
it does not rewrite old migrations. Fresh apply of all six migrations passed.

The worker stores a draft checkpoint before REVIEW and all completed batches independently.
Failure leaves the run FAILED, never COMPLETED; resume resets only incomplete batches. Job-state
locking and optimistic segment revisions prevent cancellation/edit races. Concurrent resume is
an atomic conditional claim. Provider outputs are runtime-validated and matched by UUID rather
than response order.

See docs/PHASE_04_VALIDATION.md for exact test counts, compiled/browser evidence, deterministic
versus real-provider boundary, benchmark numbers and known limitations.

## Exact future continuation

STOP until Phase 05 is explicitly authorized. Consume the explicitly active COMPLETED
LocalizationRun and stable LocalizedSegments. A professional editor may add video/waveform,
timing drag/resize, split/merge, keyboard navigation, autosave and undo/redo as new operations.
Do not mutate canonical/source evidence, machineDraft history, manual localization or approval.

Required reads: PROJECT_STATE, HANDOFF, AGENTS, docs/MASTER_SPEC, ARCHITECTURE, ROADMAP,
DOMAIN_MODEL, PROVIDERS, VALIDATION, PHASE_02_VALIDATION, PHASE_03_VALIDATION,
PHASE_04_VALIDATION, LOCALIZATION_PIPELINE and docs/adr/*.
