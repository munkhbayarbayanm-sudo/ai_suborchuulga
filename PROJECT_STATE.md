# MongolSub Studio — project state

Updated 2026-10-14, Asia/Ulaanbaatar.

| Field | State |
|---|---|
| Current / last authorized phase | Phase 05: professional subtitle editor |
| Approved Phase 04 baseline | `a0cf1f068c0e48f3be16363f8965247512b4dfc2` |
| Active branch | `codex/phase-05-subtitle-editor`, created directly from the approved Phase 04 commit |
| Phase 05 implementation commit | Inspect `git log -2` after handoff commit |
| Merge / push | Neither authorized nor performed |
| Next phase | Phase 06 requires new explicit authorization |
| Deployment | Local Windows validation only; Docker host failure remains unresolved |

## Implemented through Phase 05

Phases 01–04 remain intact: immutable media, independent embedded/ASR/OCR evidence,
versioned canonical fusion, contextual English/Chinese → Mongolian localization, manual
correction/approval and explicit active FusionRun/LocalizationRun.

Phase 05 adds a separate editable layer. A SubtitleDocument is initialized from one explicit
COMPLETED LocalizationRun and owns ordered SubtitleCues. Cue source links retain every contributing
LocalizedSegment and its path to TranscriptSegment, source evidence and word timing. Phase 02–04
records are never modified. Initialization is idempotent by LocalizationRun+initialization key;
intentional new keys create history. Episode.activeSubtitleDocumentId changes only explicitly.

All text/timing/structural edits are typed EditorOperations with before/after snapshots, base/result
document revisions and optional client operation IDs. MOVE, resize start/end, split, merge, delete,
create, status and accepted rewrite are atomic. Split clones provenance; merge unions provenance.
Soft-deleted structural rows keep undo history. UNDO/REDO append operations targeting the original
operation. Stale revisions return 409. Browser autosave first stores the operation in IndexedDB,
removes it after acknowledgement and offers retry/discard recovery after reload.

Video is the editor master clock. Browser-compatible originals stream directly; unsupported media
uses one cached H.264/AAC MP4 derivative. Playback supports validated single HTTP byte ranges with
200/206/416 behavior. The worker streams mono 8 kHz PCM from FFmpeg into min/max waveform buckets
at 1000/100/25 ms without buffering the whole episode. Settings are hashed and derivatives reused.

The editor provides live Mongolian overlay, requestVideoFrameCallback synchronization with fallback,
transport/loop controls, virtualized transcript rows, bounded waveform canvas, time-windowed cue DOM,
zoom, selection/seek, drag/resize, playhead/neighbor/word snapping, split/merge/create/delete, direct
text autosave, issue navigation, keyboard-safe shortcuts, provenance and proposal-only AI rewrites.

## Executed evidence

See `docs/PHASE_05_VALIDATION.md`. Current results include 150/150 unit/web tests (22 files),
45/45 integration tests (5 files) using real Nest HTTP, PostgreSQL, Redis, BullMQ, storage and media
tools, and a 1,200-cue real-PostgreSQL benchmark. Browser validation used legal synthetic video and
confirmed proxy playback, waveform/timeline, selection/provenance, autosave and auditable undo.

## Environment and limitations

Validated locally on Windows with Node 24.15, pnpm 11.25, portable PostgreSQL/Redis and configured
FFmpeg. Proxy uses H.264/AAC/yuv420p MP4 (`veryfast`, CRF 23). Only one byte range is supported per
request. Waveforms are amplitude, not speech boundaries. Snapping is heuristic.

AI rewrite was tested with a deterministic provider boundary; absent credentials remain unavailable.
No final export/render, Phase 06 QC, general video edit, audio edit, collaborative resolution or
production deployment was implemented.

## Exact continuation

STOP. Await explicit Phase 06 authorization. Continue from the explicitly active SubtitleDocument
and immutable EditorOperation history. Phase 06 may consume cue warnings/review states for full
reading-speed, overlap, timing and series consistency QC. Rendering/export and general video editing
require separate authorization.

Required reads: `AGENTS.md`, `PROJECT_STATE.md`, `HANDOFF.md`, `docs/MASTER_SPEC.md`,
`docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DOMAIN_MODEL.md`, `docs/VALIDATION.md`,
`docs/PHASE_05_VALIDATION.md`, `docs/SUBTITLE_EDITOR_ARCHITECTURE.md` and `docs/adr/*`.
