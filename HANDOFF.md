# Phase 06 handoff

Read `PROJECT_STATE.md` first. Branch `codex/phase-06-subtitle-qc` was created directly from approved
Phase 05 commit `04fba34fdce43f6ee011aa7638626df6a7ba8e1f` (implementation commit
`37d2893ee0be9da9bc48274d5ff0b308e888083d`). Phase 06 implementation commit is
`6d30da230bdb43ce8fd670f00cec67be7c71cf38`. No merge, push or deployment was performed. Phase 06 is
the stop.

## Windows startup

Private `.env`, portable tools, media, generated derivatives and provider keys remain ignored.
Managed worktrees do not copy the ignored `.tools` directory. Run `scripts/setup-local-windows.ps1`
inside the worktree first, or launch `pnpm dev:local-infra` from the primary checkout that already owns
the portable toolchain while keeping the same loopback `.env` ports.

```powershell
pnpm dev:local-infra
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://127.0.0.1:3000`. Do not run a second MongolSub worker during integration because its
storage root is temporary. Stop owned processes with Ctrl+C; do not flush shared Redis or truncate
PostgreSQL.

## Manual QC workflow

1. Open an Episode's explicitly active SubtitleDocument in the editor.
2. In Subtitle quality control, keep AI Off for provider-free checks, choose a profile and Run full QC.
3. Review real counts and AI stage status; filter by severity/category/state and use Previous/Next.
4. Click an issue and confirm cue selection, video seek, transcript scroll and symbolic timeline marker.
5. Resolve or ignore with a reason. Rerun unchanged evidence and confirm the same fingerprint preserves
   ignore; edit the cue and confirm the old report becomes STALE.
6. Apply a safe suggestion. Confirm an EditorOperation is recorded, then Undo and confirm restoration.
7. Edit a cue and inspect bounded local recheck output; run full QC for a current delivery report.
8. Open Series QC from Series workspace. Confirm exact active document revisions, missing-active count,
   profile selection and deep links to the correct episode/document/cue.

## Validation

```powershell
pnpm db:migrate
pnpm db:test:migrations
pnpm lint
pnpm test
pnpm test:integration
pnpm benchmark:qc
pnpm build
pnpm typecheck
```

Run compiled API, worker and Next artifacts after the build and exercise the legal synthetic browser flow.
See `docs/PHASE_06_VALIDATION.md` for exact evidence and limitations. Deterministic fixture-provider tests
validate batching, IDs, proposals, unavailable/malformed behavior; they are not real LLM quality proof.

## Recovery and invariants

A QCRun is meaningful only with its QCRunDocument revisions and QCProfile/settings/engine snapshot.
EditorService marks completed input reports stale in the same operation transaction. Never update report
revision fields to make old results appear current. Ignore transfers only by exact evidence fingerprint.

QC never changes SubtitleCue directly. Apply QCSuggestion through EditorService with current optimistic
revision. Local preview is transient and bounded. AI is optional, OFF by default and proposal-only.
PostgreSQL remains durable enqueue authority; final issue persistence is atomic after cancellation and
revision checks.

## Exact continuation

STOP until Phase 07 is explicitly authorized. Preserve Phase 06 history and all earlier derived/source
layers. Do not begin general video editing, cut/trim/effects/audio work, final subtitle/video export or
rendering without a new authorization.
