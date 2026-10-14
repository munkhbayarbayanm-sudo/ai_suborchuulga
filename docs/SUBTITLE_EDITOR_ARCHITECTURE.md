# Subtitle editor architecture

## Derived editable layer

`LocalizationRun → LocalizedSegment` remains historical. Creating a SubtitleDocument copies current
Mongolian text and canonical timing into independent SubtitleCues. SubtitleCueSourceLink retains exact
LocalizedSegment IDs. Split clones links; merge stores their union. Machine draft, canonical transcript,
word timing and Phase 02 evidence remain reachable and unchanged.

Document activation is an explicit Episode pointer. Initialization hashes LocalizationRun, caller key
and `subtitle-editor-v1`, making transport retries deterministic while allowing intentional revisions.

## Operations, undo and autosave

Every mutation is a discriminated runtime-validated contract. The service locks the document, checks
`baseRevision`, builds before/after cue snapshots, applies them and appends one EditorOperation in a
serializable transaction. Client operation IDs deduplicate transport retries. Document revision advances
once per committed action, not per pointer event.

Split, merge and create represent pre-operation absence as a soft-deleted snapshot. Undo restores prior
structure while retaining UUIDs/provenance. Undo/redo append operations targeting the original action;
history resolution is deterministic. Each cue draft is written to an IndexedDB write-ahead queue before
its debounce; structural/history actions flush queued drafts through one serialized operation chain.
Entries are removed only after server acknowledgement. Reload offers explicit retry/discard; a 409 never
auto-merges edits.

## Playback, time and waveform

All times are integer milliseconds on the source media timeline. `<video>` is the master clock.
`requestVideoFrameCallback` provides displayed-frame time; a 33 ms `currentTime` fallback covers browsers
without it. Overlay and playhead DOM update directly from that value, while React state receives a
throttled transport-time update to avoid rerendering the full cue workspace on every decoded frame.

Compatible MP4/WebM streams use the original. Other inputs cache an EDITOR_PROXY_MP4 using H.264/libx264,
CRF 23, veryfast, yuv420p, AAC 128 kb/s and faststart. The API resolves controlled storage IDs and serves
one validated range with 200/206/416 semantics.

Proxy/waveform preparation lookup uses the exact current settings hash and selected stream. Cancellation
targets that preparation, and a retry creates a fresh ProcessingJob/BullMQ identity. Waveform generation
maps exact audio, converts to mono 8 kHz signed PCM and streams stdout into min/max
aggregators. Validated `waveform-v1` JSON contains 1000/100/25 ms levels. Node never buffers the full
video/audio. The UI selects a level and paints only the visible canvas width.

## Timeline and interaction

Timeline width is duration × zoom. Only cues intersecting the visible time window plus overscan mount.
Transcript rows use fixed-height virtualization. Drag/resize previews mutate only the dragged cue DOM and
commit once on pointer release. Snapping checks
playhead, neighboring boundaries and linked word times within 120 ms; Shift disables it. There is no ripple.

Keyboard capture ignores form controls, contenteditable and IME composition. Space toggles playback;
arrows seek 40 ms (Shift: 1 s); J/K/L control playback; Ctrl/Command-Z/Y undo/redo; Delete removes the
selected cue. Essential actions also have semantic buttons and labels.

## AI rewrite and phase boundary

Rewrite reuses the Phase 04 provider in a versioned REWRITE phase with source, current text, bounded
neighbors and memory. Output is validated and stored as EditorRewriteProposal. Accept is a separate
operation; rejection changes proposal state only. Stale document/text invalidates a proposal.

Local warnings cover empty, extremely short, overlap and outside-media cues. Full QC belongs to Phase 06.
Final render/export, cut/trim/effects/audio editing and a general video timeline are absent.
