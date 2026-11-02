# Phase 08 handoff

Read `PROJECT_STATE.md` first. Branch `codex/phase-08-render-export` was created directly from approved
Phase 07 commit `c1211bb6e9c63e9aedb00ffb2296111b670b2df4`. Design commit is
`8d07092de3cc06269c2728fbbe0b13bd8176c5b1`; implementation commit is
`37d7fc2d47e10a40e5369d9e0fd26bd65b46d82c`; Phase 08 validation/continuity is
`aa0960b320ba2cd13a52d6111b1203724d3868cd`. No merge or deployment was performed. The user authorized and
published this feature branch for cross-computer continuation on 2026-11-02 at
`https://github.com/munkhbayarbayanm-sudo/ai_suborchuulga.git`. Remote HEAD selects
`codex/phase-08-render-export`; do not continue from a stale local branch or create Phase09 without authorization.

For another computer or agent, read `README.md` and `docs/NEXT_AGENT_HANDOFF.md` before starting services or
editing code. They distinguish source-controlled continuity from ignored secrets, databases, media, model caches,
portable tools and render outputs.

## Windows startup

Private `.env`, portable tools, media, render outputs and generated builds remain ignored. A managed worktree
does not copy `.tools`; start portable infrastructure from the primary checkout or run the setup script.

```powershell
pnpm dev:local-infra
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://127.0.0.1:3000`. Stop every other MongolSub worker before integration tests because test storage
roots are temporary and the Redis queue is shared. Stop owned processes with Ctrl+C. Do not flush shared Redis
or truncate databases.

## Manual Phase 08 workflow

1. Open an existing completed VideoProject and its Export panel.
2. Confirm FFmpeg and FFprobe readiness, current project/subtitle revision and any QC/projection warnings.
3. Choose MP4, project/1080p/720p resolution, quality, burn-in/sidecar mode and SRT/ASS sidecars.
4. Start export, observe durable stage/progress, then download and inspect the ranged VIDEO/SRT/ASS outputs.
5. Export MKV with soft ASS and verify a selectable `ass` subtitle stream.
6. Start a longer export, cancel it and verify no RenderOutput or temporary workspace survives.
7. Edit the project in another view; confirm the stale export request receives HTTP 409, refresh and retry.
8. Confirm old RenderJobs still identify their exact project/subtitle revisions and remain downloadable.

## Validation commands

```powershell
pnpm db:migrate
pnpm db:test:migrations
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @mongolsub/web test
pnpm test:integration
pnpm benchmark:render
pnpm benchmark:render:runtime
pnpm build
```

Run compiled API, worker and Next artifacts after build, then exercise export through the browser. The runtime
benchmark creates and removes legal synthetic media; it performs a real 10-minute 720p CPU encode and can take
several minutes. See `docs/PHASE_08_VALIDATION.md` for evidence and limitations.

## Recovery and invariants

Every render is an immutable snapshot of exact project/subtitle revisions plus normalized settings and compiler
version. Browser requests contain record IDs/settings only. The API resolves controlled storage references.
Render outputs are uploaded to storage before one locked transaction publishes all rows and COMPLETED status;
failure/cancellation compensates stored objects and removes the isolated workspace.

`clientRequestId` deduplicates retries. A deliberate rerender uses a new client ID and creates history. The
worker checks cancellation before process spawn, after expensive stages, between object writes and under the
final job-row lock. Progress updates only touch PROCESSING records and cannot revive terminal jobs.

## Exact continuation

STOP. Phase 09 is not authorized. Its safe entry point is a proposal service that reads one explicit
VideoProject revision and emits validated typed operations for human review. It must reuse the Phase 07
operation service, never execute free-form shell/FFmpeg commands, never silently apply edits and never alter
historical Phase 08 snapshots or outputs.
