# Phase 01 handoff

Read PROJECT_STATE first, then AGENTS and architecture. Work is on
`codex/phase-01-foundation`; implementation commit
`972641bc773628e879304de9922abc76784bfb4d`. Foundation commit `082f18f`.
Final continuity docs are a separate commit; inspect `git log -3 --oneline`.
No main merge, remote push, deployment or Phase02 work occurred.

## Starting this checkout

On this Windows machine Docker has a host startup fault. Portable tools are already
installed under ignored `.tools/`, and `.env` points at them. In one terminal:

```powershell
pnpm dev:local-infra
```

In another:

```powershell
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open http://127.0.0.1:3000. Stop apps with Ctrl+C; Windows runner owns and terminates
only its spawned tree. Stop portable infrastructure with Ctrl+C; data persists.
At handoff all these processes are stopped and their ports are free.

For a fresh checkout use README prerequisites/setup; install portable tools with
`scripts/setup-local-windows.ps1` if Docker is unavailable. The setup script's pinned
dependency install/download operations were executed equivalently during setup;
the complete PowerShell wrapper itself was not separately rerun. The checked-in
portable infrastructure runner was directly executed successfully. Prefer current
FFmpeg/FFprobe for actual media, not the old static probe used in synthetic tests.

Once Docker Desktop works, preferred setup is `docker compose up -d --wait`, then
generate/migrate/dev. Never run both infrastructure setups on the same ports. An
existing PostgreSQL on55432 belongs to other work; MongolSub uses56432 and56379.

## API contracts

| Method | Path | Behavior |
|---|---|---|
| GET | `/health` | separate DB/Redis/tools/worker readiness |
| GET / POST | `/series` | list / create |
| GET / PATCH | `/series/:id` | detail with Episodes / update |
| POST | `/series/:id/episodes` | create Episode |
| GET / PATCH | `/episodes/:id` | detail with assets/jobs / update |
| POST | `/episodes/:id/media` | one multipart `file`; persisted asset + QUEUED job |
| GET | `/media/:id` | asset + validated streams/jobs |
| GET | `/jobs/:id` | persisted status/progress/error/timestamps |

Shared Zod DTOs are in packages/contracts. Paths are UUID validated. Byte size is
a decimal string; storageKey stays private. Public errors are `{code,message}`.
Upload default limit2GiB, configurable. MIME/extension validation precedes actual
FFprobe content inspection. Abort, malformed forms and storage failure must preserve
the process and clean up; real HTTP regression tests cover these cases.

## Inspection details

Storage saves to temporary UUID files then renames. DB commits MediaAsset+ProcessingJob
together. Worker dispatcher polls database every second and sends UUID-keyed jobs to
BullMQ. QUEUED → PROCESSING → COMPLETED/FAILED; terminal metadata/streams/status
share a transaction. One attempt avoids fatal media loops; one stalled recovery.
Worker reconciles retained failed queue entries if earlier DB failure prevented
terminal persistence. Missing tools, invalid media, timeout/output overflow and
unexpected worker failures are useful final errors. Safe diagnostics exclude raw
paths, secrets and media content.

## Validation and records

See docs/VALIDATION for commands, counts, coverage, tool versions and gates. Stop
other MongolSub workers before integration; its isolated temporary media root must
be processed by its own worker. Never flush shared Redis or truncate databases.

`pnpm fixture` generates the ignored synthetic MKV. With apps running,
`pnpm test:smoke` exercises live success/failure and leaves a labelled verification
Series/Episode. The latest IDs are in ignored `data/runtime-smoke.json`. Several
synthetic verification records may remain from repeated development/production runs.
They are real persisted test records, not hard-coded UI demos. Browser screenshot
evidence under `apps/web/test-results/` was taken against the earlier isolated test
cluster and remains accurate evidence of that executed flow.

## Next authorized work

No new phase is authorized. Phase02 continuation, after explicit approval: specify
language/source extraction outputs and candidate provenance from existing asset and
stream metadata; design embedded subtitle/audio extraction and ASR/OCR provider
contracts with corresponding job/entity extensions. Do not implement translation,
fusion or editing ahead of their roadmap phases. Architectural changes need approval.
