# MongolSub Studio — project state

Updated 2026-10-14, Asia/Ulaanbaatar.

| Field | State |
|---|---|
| Current / last authorized phase | Phase 07: non-destructive general video editor |
| Approved Phase 06 baseline | `8e0addbd3ceaae2127af45540f4cb2e4b9dccdae` |
| Active branch | `codex/phase-07-video-editor`, created directly from the approved Phase 06 commit |
| Phase 07 implementation commit | `edc9893aa5242447948b7b20b5aa3a959c6f6bf1` |
| Merge / push | Neither authorized nor performed |
| Next phase | Phase 08 requires new explicit authorization |
| Deployment | Local Windows validation only; no production deployment |

## Implemented through Phase 07

Phases 01–06 remain intact: immutable media and source evidence, versioned fusion/localization,
SubtitleDocument editing, append-only subtitle operations, media proxy/waveform preparation and historical
revision-bound QC.

Phase 07 adds `VideoProject`, `VideoTrack`, `ProjectAsset`, `VideoClip`, `VisualOverlay` and append-only
`VideoEditOperation`. An Episode chooses an active project explicitly. Project time is the transport
master, with deterministic source mapping, primary-video gap/overlap rules, linked video/audio operations,
subtitle cue projection and partial-cut warnings. Original media and every earlier evidence/derived record
remain unchanged.

The browser editor provides a two-video active/preload pool, bounded drift correction, black/silent gaps,
DOM/CSS transform/crop/color/image/text/blur compositing, Web Audio volume/mute/fades, background audio,
windowed timeline rendering, snapping, type-specific inspectors and safe shortcuts. Pointer-up commits one
typed operation. Autosave uses optimistic project revisions; IndexedDB retains unacknowledged operations.
Undo/redo appends inverse operations. Existing inspected assets and waveform jobs/derivatives are reused.

## Executed evidence

See `docs/PHASE_07_VALIDATION.md`. Unit/web tests, real PostgreSQL/Redis integration, the additive 13-step
migration chain, production builds, browser acceptance and a synthetic 60-minute resolver benchmark are
recorded separately. Benchmark numbers describe pure resolution only; no final encode throughput was
measured or claimed.

## Environment and limitations

Validated locally on Windows with portable PostgreSQL/Redis and the repository FFmpeg setup. Ripple edit,
multi-select, filmstrip, project duplication and relinking inference are deferred. Preview allows at most
three simultaneous routed audio clips. CSS color/blur/font output and browser seek behavior are interactive
approximations; `docs/PREVIEW_RENDER_PARITY.md` defines the Phase 08 parity work.

No final MP4/MKV render, release encode, subtitle burn/export, raw final FFmpeg graph, natural-language
video editing, advanced transition library or generic keyframe engine was implemented.

## Exact continuation

STOP. Await explicit Phase 08 authorization. A future render phase may consume an explicit VideoProject
revision and compile its clips, overlays, source-mapped SubtitleDocument cues and audio envelopes into a
validated offline render plan. It must preserve source immutability and define fonts, color space, canvas
rounding, audio headroom, subtitle strategy, codecs, render jobs/progress and output validation.

Required reads: `AGENTS.md`, `PROJECT_STATE.md`, `HANDOFF.md`, `docs/MASTER_SPEC.md`,
`docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DOMAIN_MODEL.md`, `docs/VALIDATION.md`,
`docs/PHASE_07_VALIDATION.md`, `docs/VIDEO_EDITOR_ARCHITECTURE.md`,
`docs/PREVIEW_RENDER_PARITY.md`, `docs/QC_ENGINE.md`, `docs/SUBTITLE_EDITOR_ARCHITECTURE.md` and
`docs/adr/*`.
