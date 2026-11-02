# MongolSub Studio — project state

Updated 2026-11-02, Asia/Ulaanbaatar.

| Field | State |
|---|---|
| Current / last authorized phase | Phase 08: final render, subtitle export and delivery |
| Approved Phase 07 baseline | `c1211bb6e9c63e9aedb00ffb2296111b670b2df4` |
| Active branch | `codex/phase-08-render-export`, created directly from the approved baseline |
| Phase 08 design commit | `8d07092de3cc06269c2728fbbe0b13bd8176c5b1` |
| Phase 08 implementation commit | `37d7fc2d47e10a40e5369d9e0fd26bd65b46d82c` |
| Merge / push | No merge. Published to `https://github.com/munkhbayarbayanm-sudo/ai_suborchuulga.git` on branch `codex/phase-08-render-export`; remote HEAD selects this branch. |
| Next phase | Phase 09 requires new explicit authorization |
| Deployment | Local Windows validation only; no production deployment |

## Implemented through Phase 08

Phases 01–07 remain intact. Phase 08 adds immutable revision-bound `RenderRequest`,
`RenderSnapshot`, `RenderJob` and `RenderOutput` records. A pure, versioned compiler consumes one exact
VideoProject and SubtitleDocument revision and creates a deterministic FFmpeg file graph. Original media,
source evidence, canonical transcripts, localization, subtitle documents, QC reports and video-project edit
history remain unchanged.

The separate worker materializes only controlled asset IDs, renders H.264/AAC MP4 or MKV, optionally burns
ASS with libass or embeds a selectable ASS stream, and exports project-time UTF-8 SRT/ASS sidecars. It uses
argument arrays, `shell:false`, isolated workspaces, bounded stderr, machine progress, timeout, output-size
limits, cancellation polling and atomic database publication after ffprobe metadata and sample-decode checks.

The Video Editor now contains an Export panel with format, resolution, quality, subtitle mode, sidecar and
filename controls; independent FFmpeg/FFprobe readiness; QC and projection warnings; progress/cancel; render
history; and ranged downloads with Unicode-safe names. The API rejects stale project/subtitle revisions and
deduplicates concurrent starts by `clientRequestId`.

## Executed evidence

See `docs/PHASE_08_VALIDATION.md`. Unit and web suites, real PostgreSQL/Redis integration, additive migration
chain, production builds, compiled runtime, browser export/download and two performance measurements are
recorded separately. The 60-minute compiler benchmark is compilation only. The 10-minute 720p benchmark is a
real CPU render of legal synthetic media and is not a claim about other hardware or real productions.

## Environment and limitations

Validated locally on Windows with portable PostgreSQL/Redis, FFmpeg 6.1.1 and FFprobe 4.0.2. CPU `libx264`
is the supported encoder. GPU encoders, resume/checkpoint rendering, cloud object storage delivery, packaged
font files, animated image overlays and production deployment were not implemented. Text fonts are restricted
to a controlled host-font allowlist. CSS preview and FFmpeg output differ in font metrics, color management,
blur kernels, resampling and edge interpolation as documented in `docs/PREVIEW_RENDER_PARITY.md`.

## Exact continuation

STOP. Phase 09 is not authorized. A future Phase 09 may translate natural-language edit requests into typed,
reviewable VideoEditOperation proposals against an explicit project revision. It must not bypass optimistic
revision checks, mutate original media, execute arbitrary FFmpeg/shell input, auto-apply destructive edits or
change historical RenderSnapshots/RenderOutputs.

Required reads: `AGENTS.md`, `PROJECT_STATE.md`, `HANDOFF.md`, `docs/MASTER_SPEC.md`,
`docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DOMAIN_MODEL.md`, `docs/VALIDATION.md`,
`docs/PHASE_08_VALIDATION.md`, `docs/RENDER_PIPELINE.md`, `docs/EXPORT_FORMATS.md`,
`docs/PREVIEW_RENDER_PARITY.md`, `docs/VIDEO_EDITOR_ARCHITECTURE.md` and `docs/adr/*`.

For a fresh clone or agent handoff, start with `README.md` and `docs/NEXT_AGENT_HANDOFF.md`. Git deliberately
excludes secrets, uploaded media, local databases, generated outputs, tool downloads, AI weights and build
artifacts. Recreate the environment locally and treat previous-host validation as historical until rerun.
