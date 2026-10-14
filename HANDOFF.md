# Phase 07 handoff

Read `PROJECT_STATE.md` first. Branch `codex/phase-07-video-editor` was created directly from approved
Phase 06 commit `8e0addbd3ceaae2127af45540f4cb2e4b9dccdae` (implementation commit
`6d30da230bdb43ce8fd670f00cec67be7c71cf38`). Phase 07 implementation commit is
`edc9893aa5242447948b7b20b5aa3a959c6f6bf1`; its continuity commit follows it. No merge, push or
deployment was performed.

## Windows startup

Private `.env`, portable tools, media, derivatives and generated builds remain ignored. A managed worktree
does not copy `.tools`; start portable infrastructure from the primary checkout or run the setup script.

```powershell
pnpm dev:local-infra
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open `http://127.0.0.1:3000`. Do not run a second MongolSub worker during integration because worker test
storage is temporary. Stop owned processes with Ctrl+C. Do not flush shared Redis or truncate databases.

## Manual Phase 07 workflow

1. Import and inspect legal synthetic video, then create/activate a SubtitleDocument if subtitle mapping is needed.
2. From Episode workspace create a Video Project, activate it explicitly and open Video Editor.
3. Play/seek; split linked main video/audio, trim/move/delete and confirm black/silent gaps or close them manually.
4. Confirm subtitle cues map from retained source ranges and a boundary cut shows a warning without changing the cue.
5. Add/import an image, audio or video asset. Add image, text and timed blur overlays; adjust transform/crop/color.
6. Lower/mute original audio, add background audio and set trim/volume/fade. Prepare and inspect its waveform.
7. Undo/redo linked and overlay edits. Reload and confirm server state plus pending-operation recovery UI.
8. Open a second editor revision and confirm a stale operation receives HTTP 409 instead of overwriting work.

## Validation

```powershell
pnpm db:migrate
pnpm db:test:migrations
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @mongolsub/web test
pnpm test:integration
pnpm benchmark:video-editor
pnpm build
```

Run compiled API, worker and Next artifacts after build, then exercise the legal synthetic browser flow.
See `docs/PHASE_07_VALIDATION.md` for exact evidence, benchmark scope and limitations.

## Recovery and invariants

Project time is the master; media elements are followers. Never derive durable timeline state from an
element clock. Resolve storage paths from controlled IDs only. Keep original MediaAsset and all
SourceSegment/TranscriptSegment/LocalizedSegment/SubtitleCue/QC records immutable from video operations.

Every project write must validate the expected revision and typed payload, hold the project lock and append
one operation with before/after state. `clientOperationId` deduplicates retry. Browser IndexedDB is only a
pending queue; PostgreSQL is authoritative. Undo/redo append inverse actions. The current snapshot rewrite
is O(project-size), while playhead lookup uses ordered indexes.

Preview is not render proof. Follow `docs/PREVIEW_RENDER_PARITY.md` when compiling crop, transforms, color,
fonts, blur and audio in a future phase.

## Exact continuation

STOP until Phase 08 is explicitly authorized. Begin with a versioned render-plan model for one explicit
VideoProject revision, then compile deterministic video/audio/subtitle/filter inputs, add durable render
jobs, progress, cancellation, output assets and output validation. Do not mutate original media or infer
render behavior from CSS. Natural-language video editing and generic keyframes remain later work.
