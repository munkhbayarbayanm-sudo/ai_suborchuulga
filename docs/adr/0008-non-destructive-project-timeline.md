# ADR 0008: Project-time non-destructive video editing

## Status

Accepted for Phase 07.

## Context

A browser editor must preview cuts, overlays, subtitles and audio while preserving Phase 01 media and
Phase 02–06 evidence. Media elements have independent clocks and cannot define a stable multi-track
timeline. The future renderer also needs a deterministic, provider-neutral edit representation.

## Decision

Use a revisioned `VideoProject` edit decision list. Project time is the master clock; every clip maps it
to source time with explicit source bounds, timeline start and playback rate. Tracks, clips and overlays
store normalized product parameters rather than browser CSS or FFmpeg syntax. Subtitle cues are projected
by reference and remain immutable.

Use a DOM/CSS hybrid compositor for Phase 07 and Web Audio gain nodes for volume/fades. Two video
elements support active/next preloading. Defined drift tolerances control correction and seeking.

Persist edits as typed append-only operations with atomic before/after snapshots, project revision,
idempotency key and optimistic conflict rejection. Browser IndexedDB retains unacknowledged operations.

## Consequences

The editor can split, trim, move, delete and compose without changing source files or earlier derived
records. Historical edit intent is auditable and undoable. Phase 08 can compile the same coordinates to
an offline graph.

Snapshot replacement makes each database edit proportional to current project size. CSS color, font,
blur and seek behavior are approximations requiring explicit Phase 08 parity tests. Ripple, multi-select,
filmstrip, final render/export and natural-language editing remain outside this decision.
