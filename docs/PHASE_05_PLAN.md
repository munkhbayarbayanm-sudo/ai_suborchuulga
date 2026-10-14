# Phase 05 implementation plan — professional subtitle editor

Baseline: approved Phase 04 commit `a0cf1f068c0e48f3be16363f8965247512b4dfc2`.
Branch: `codex/phase-05-subtitle-editor`.

## Architecture decisions

- Add a separate editable subtitle layer. `LocalizationRun`, `LocalizedSegment`, canonical
  transcript records, and source evidence remain immutable inputs.
- `SubtitleDocument` owns one editable Mongolian timeline and an explicit document revision.
  Episode activation is explicit and historical documents remain available.
- `SubtitleCue` uses integer media-timeline milliseconds. Structural operations soft-delete
  superseded cues so undo/redo can restore exact cue identifiers and provenance.
- `SubtitleCueSourceLink` retains the LocalizedSegment union through split and merge. Manual cues
  have an explicit MANUAL origin and no fabricated localization link.
- `EditorOperation` stores validated, versioned before/after cue snapshots. Edits, undo, and redo
  each append an auditable operation and atomically increment the document revision. Linear redo
  is available only while no new forward edit follows an undo.
- The HTML video element is the only transport clock. Frame callbacks drive playhead, overlay,
  timeline, and waveform cursors; a `timeupdate`/animation-frame fallback is retained.
- Directly playable MP4/WebM media uses the controlled source endpoint. Other containers/codecs
  use a cached H.264/AAC MP4 editor proxy derivative with media-zero timeline normalization.
- Waveform generation streams mono PCM from FFmpeg into incremental peak buckets. Storage keeps
  versioned JSON at overview, medium, and fine resolutions; PostgreSQL stores only derivative
  identity and metadata.
- The timeline uses a canvas for waveform and cue geometry plus an accessible selected-cue
  inspector. Only the visible cue window is rendered into interactive cue elements. The transcript
  list uses fixed-window virtualization.
- Autosave queues typed operations locally in IndexedDB before transmission. Successful server
  acknowledgement removes them; stale revisions retain recoverable content and show a conflict.
- Editor AI rewrite reuses the Phase 04 provider/context boundary. A proposal is persisted
  separately and changes cue text only after an explicit ACCEPT_AI_REWRITE operation.

## Delivery sequence

1. Add failing pure tests for timing, split text, snapping, warning detection, typed operation
   parsing, undo-stack semantics, range parsing, and waveform peak aggregation.
2. Add `packages/editor` with pure deterministic editor/media helpers and explicit public types.
3. Add additive Prisma migration 007 for documents, cues, provenance, operations, rewrite
   proposals, active document, editor derivatives/jobs, checks, uniqueness constraints, and
   query indexes. Generate Prisma and verify a fresh Phase 01→05 migration chain.
4. Add contracts and Nest editor services/controllers for explicit initialization, activation,
   paged/windowed read models, atomic operations, undo/redo, rewrite proposal/accept/reject,
   media readiness, byte-range playback, and waveform retrieval.
5. Extend the existing worker and storage/media boundaries with `GENERATE_EDITOR_PROXY` and
   `GENERATE_WAVEFORM`; use FFmpeg argument arrays, cancellation, temporary cleanup, derivative
   cache identities, and consistent media-zero timing.
6. Add real API/PostgreSQL/Redis/BullMQ/FFmpeg integration tests for initialization, all supported
   operations, provenance, concurrency, range responses, proxy reuse/offsets, waveform peaks,
   cancellation, and source immutability.
7. Add the focused editor route and dense desktop React workspace: video overlay, master-clock
   synchronization, canvas waveform/timeline, zoom/scroll, visible-window cue controls,
   drag/resize, numeric timing, snapping, split/merge/delete/create, issue navigation, loop/play
   selection, autosave/recovery, keyboard safety, and accessible alternatives.
8. Add web tests for selection/synchronization helpers, shortcut focus and IME guards,
   virtualization, pending-operation recovery, frame-callback teardown, and proposal semantics.
9. Exercise a legal synthetic long-episode dataset, compiled runtime, real browser editor flow,
   media range/proxy/waveform paths, then run migrations, lint, typecheck, all tests, and builds.
10. Update continuity and editor architecture/ADR/validation documents, commit Phase 05, and stop
    before general video editing, final QC, render, or export.
