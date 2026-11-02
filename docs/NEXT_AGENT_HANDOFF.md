# Next-agent and new-computer handoff

Updated 2026-11-02, Asia/Ulaanbaatar. This file is the operational entry point after cloning on another computer.
Repository documents, not chat history, are the source of truth.

## Exact checkout

- Branch: `codex/phase-08-render-export`
- Remote: `https://github.com/munkhbayarbayanm-sudo/ai_suborchuulga.git`
- Approved Phase 07 baseline: `c1211bb6e9c63e9aedb00ffb2296111b670b2df4`
- Phase 08 design: `8d07092de3cc06269c2728fbbe0b13bd8176c5b1`
- Phase 08 implementation: `37d7fc2d47e10a40e5369d9e0fd26bd65b46d82c`
- Phase 08 validation/continuity: `aa0960b320ba2cd13a52d6111b1203724d3868cd`
- Required continuation: clone the remote (its HEAD selects the named branch) and verify the tip with
  `git branch --show-current`, `git rev-parse HEAD`, and `git status --short --branch`
- Merge/deployment: no merge to `main` and no production deployment were performed

Before any edit run:

```powershell
git status --short --branch
git branch --show-current
git log --oneline --decorate -20
git rev-parse HEAD
```

Do not continue from a stale `main` or from `codex/phase-04-mongolian-localization`. Do not reset a dirty checkout.

## What is complete

| Phase | Delivered state |
|---|---|
| 01 | pnpm/Turbo foundation, Next web, Nest API, BullMQ worker, Prisma/PostgreSQL, storage/media boundaries, media inspection |
| 02 | Embedded subtitle extraction, normalized audio, WhisperX ASR boundary, PaddleOCR boundary, provenance-preserving source segments |
| 03 | Deterministic language-aware transcript fusion, evidence links, confidence/review states, manual canonical corrections |
| 04 | English/Chinese→Mongolian localization pipeline, structured provider boundary, context/memory/glossary/TM, protected human edits |
| 05 | Professional subtitle document editor, revision history, autosave/conflicts, cue edit operations, proposals and review workflow |
| 06 | Revision-bound deterministic subtitle QC and series consistency checks with actionable suggestions |
| 07 | Non-destructive multi-track video project, clip/audio/overlay operations, player preview and project history |
| 08 | Immutable render snapshots/jobs/outputs, FFmpeg compiler/worker, MP4/MKV, burn-in/soft subtitles, SRT/ASS export and downloads |

The normal end-to-end user path is available locally:

`Series → Episode → upload/inspect → extract evidence → fuse transcript → localize → edit/QC → video project → render/export`.

## What is in progress

No feature implementation is intentionally in progress. Phase 08 was completed, committed, and validated. This
handoff work only makes the branch portable to another computer. Any uncommitted changes after clone belong to
the new user/agent and must be inspected before work continues.

## What remains

1. Clone and validate this branch on the new computer using `README.md`.
2. Recreate ignored local configuration/tools and apply migrations.
3. Run the focused smoke/browser workflow before relying on the new host.
4. Configure real localization credentials or Python AI providers only if those capabilities are needed.
5. Phase 09 remains unauthorized. Its proposed scope is natural-language requests converted into typed,
   reviewable Phase 07 operations; it must never execute model-generated shell/FFmpeg commands or auto-apply edits.

Known deferred product work includes GPU encoding, resumable/checkpoint renders, cloud object storage delivery,
packaged font files, animated image overlays, multi-language soft tracks, HDR/mastering metadata, formal loudness
targets, and automatic storage-orphan reconciliation. These are not hidden failures in the completed Phase 08
scope.

## New-computer bootstrap

Follow `README.md` exactly. The minimal sequence after cloning is:

```powershell
git clone https://github.com/munkhbayarbayanm-sudo/ai_suborchuulga.git kino
Set-Location kino
git switch codex/phase-08-render-export
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
powershell -ExecutionPolicy Bypass -File scripts/setup-local-windows.ps1
pnpm db:generate
# terminal 1
pnpm dev:local-infra
# terminal 2, after infrastructure is ready
pnpm db:migrate
pnpm dev
```

Expected default URLs are web `http://127.0.0.1:3000`, API `http://127.0.0.1:4000`, PostgreSQL
`127.0.0.1:56432`, Redis `127.0.0.1:56379`, and the optional extraction provider `127.0.0.1:8765`.

If a port is occupied, inspect the owning process before changing or terminating anything. Never stop unrelated
PostgreSQL/Redis/Node processes by name. The repository scripts target only their owned child process trees.

## Data, secrets, and model portability

A Git clone intentionally starts without private runtime data. Recreate `.env` locally from `.env.example` and
keep API/Hugging Face/provider tokens outside Git. Uploaded media, original assets, database rows, render outputs,
AI weights and provider caches remain ignored. If historical user projects must move, plan a separate controlled
database plus storage migration that preserves asset IDs and storage keys; do not commit or casually copy partial
state.

The core app boots while AI providers are unavailable. Real WhisperX/PaddleOCR setup uses the locked Python 3.11
environment documented in `docs/PROVIDERS.md`. Real OpenAI localization requires valid local configuration. Fake
provider tests prove orchestration/contracts, not real translation quality.

## Validation truth

The complete Phase 08 validation recorded on the previous host is in `docs/PHASE_08_VALIDATION.md`: 182 unit tests,
41 web tests, 61 real integration tests, 14 fresh migrations, lint/typecheck/build, compiled runtime/browser flow,
and real synthetic CPU rendering all passed there. Those results are historical evidence, not proof about a new
computer. Re-run the validation commands in `README.md` and record new-host results separately.

Do not claim Docker, production deployment, CUDA/GPU inference/encode, cloud delivery, or real copyrighted-drama
quality validation; those were not executed. The real-provider and synthetic-fixture boundary is documented in
`docs/PROVIDERS.md`, `docs/VALIDATION.md`, and phase validation reports.

## Manual acceptance on the new host

1. Create a Series/Episode and upload a short legal media sample.
2. Confirm media inspection and stream metadata.
3. Exercise available embedded extraction; use deterministic/provider readiness states honestly.
4. Build or select a completed FusionRun and localization/subtitle document.
5. Open the subtitle and video editors; verify revisions and saved operations survive reload.
6. Run QC and inspect issues without mutating cues automatically.
7. Create/open a VideoProject and confirm preview playback.
8. Export MP4 with SRT/ASS sidecars, download all outputs, and inspect them.
9. Export MKV with soft ASS and confirm the subtitle stream is selectable.
10. Cancel a longer render and verify no completed output is published.

## Required reading and safe continuation

Read `PROJECT_STATE.md`, `HANDOFF.md`, this file, `AGENTS.md`, `docs/MASTER_SPEC.md`, `docs/ARCHITECTURE.md`,
`docs/ROADMAP.md`, `docs/DOMAIN_MODEL.md`, `docs/VALIDATION.md`, `docs/PHASE_08_VALIDATION.md`,
`docs/RENDER_PIPELINE.md`, `docs/EXPORT_FORMATS.md`, `docs/PREVIEW_RENDER_PARITY.md`,
`docs/VIDEO_EDITOR_ARCHITECTURE.md`, and `docs/adr/*` before architectural changes.

STOP after restoring/verifying Phase 08. Ask for explicit authorization and a written Phase 09 specification before
creating a new feature branch. Preserve all immutable source/derived layers, manual edits, approval states,
revision history, and historical render outputs.
