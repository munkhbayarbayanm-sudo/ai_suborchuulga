# Phase 05 handoff

Read `PROJECT_STATE.md` first. Branch `codex/phase-05-subtitle-editor` was created directly from
approved Phase 04 commit `a0cf1f068c0e48f3be16363f8965247512b4dfc2`. Inspect `git log -2` for the
Phase 05 implementation commit. No merge, push or deployment was performed. Phase 05 is the stop.

## Windows startup

Private `.env`, portable tools, media, generated derivatives and provider keys remain ignored.

```powershell
pnpm dev:local-infra
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://127.0.0.1:3000`. Do not run a second MongolSub worker during integration. Stop owned
processes with Ctrl+C; do not flush shared Redis or truncate PostgreSQL.

Compiled runtime:

```powershell
pnpm build
pnpm exec dotenv -e .env -- node apps/api/dist/main.js
pnpm exec dotenv -e .env -- node apps/worker/dist/main.js
pnpm exec dotenv -e .env -- pnpm --filter @mongolsub/web exec next start --hostname 127.0.0.1 --port 3000
```

## Manual editor workflow

1. Complete and explicitly activate a Phase 04 LocalizationRun.
2. In Episode Detail, create an editor document. Repeated transport with one initialization key
   reuses it; a new key creates an intentional revision.
3. Open `/episodes/:episodeId/editor?document=:documentId` and wait for preview/waveform jobs.
4. Select a cue; video seeks and the inspector exposes source/provenance.
5. Play video and confirm the Mongolian overlay follows the frame clock.
6. Edit Mongolian text. A stale tab receives 409; IndexedDB pending edits can be retried/discarded.
7. Drag/resize; Shift disables snapping. Split at playhead, multi-select adjacent cues to merge,
   create/delete cues, then exercise undo/redo.
8. With a READY Phase 04 provider, generate and inspect a rewrite proposal before accepting/rejecting.
9. Navigate issues, approve reviewed cues and explicitly activate the preferred document.

## Validation

```powershell
pnpm db:migrate
pnpm db:test:migrations
pnpm lint
pnpm test
pnpm test:integration
pnpm benchmark:editor
pnpm build
pnpm typecheck
```

Build before typecheck because both use generated Next files. Integration uses legal synthetic media
and actual FFmpeg proxy/waveform work through PostgreSQL/Redis/BullMQ. Its rewrite provider is a
deterministic fixture, not real LLM quality proof. See `docs/PHASE_05_VALIDATION.md`.

## Recovery and invariants

Database document revision is authoritative. Each operation stores validated before/after payloads
in the same serializable transaction as cue changes. Structural undo depends on soft-deleted created
rows; do not physically delete cue/history records. IndexedDB is recovery assistance and never
overrides server history. Reusing a clientOperationId is idempotent.

Editor preparations use durable ProcessingJobs. PostgreSQL is enqueue authority; the worker handles
GENERATE_EDITOR_PROXY/WAVEFORM. Derivatives are cached by source asset/kind/settings hash. Preserve
original media and the storage boundary.

## Exact continuation

STOP until Phase 06 is explicitly authorized. Phase 06 may read active cue timing/text/status,
warnings and provenance for full QC. Preserve all documents, operations and manual edits. Final
export/render and general video editing remain out of scope.
