# Roadmap and authorization

Phase 01 baseline acb3eaad4e2febb3eb747e287775eebfafc08ee8 was explicitly approved.
Phase 02 baseline bc416581c97ae0648f4ce3f21bf902c973034670 was explicitly approved.
Phase 06 implementation was explicitly authorized and is the current stopping point.
Completion never authorizes the next phase.

| Phase | Scope | State |
|---|---|---|
| 01 | Foundation, Series/Episode, media import, asynchronous inspection | Approved baseline; regressions validated |
| 02 | Independent embedded/audio ASR/burned OCR evidence with provenance | Implemented and locally validated; see VALIDATION |
| 03 | Cross-source alignment, candidate reconciliation, source/confidence/speaker fusion | Implemented and locally validated; see PHASE_03_VALIDATION |
| 04 | Mongolian localization, modes, memory, glossary, editorial pipeline | Implemented and locally validated; see PHASE_04_VALIDATION |
| 05 | Professional subtitle editor, sync, proposals, autosave, undo | Implemented and locally validated; see PHASE_05_VALIDATION |
| 06 | Revision-bound subtitle QC, optional linguistic review and series consistency | Implemented and locally validated; see PHASE_06_VALIDATION |
| 07 | Non-destructive multitrack video editing | Deferred |
| 08 | Subtitle/video export and render jobs | Deferred |
| 09 | Mongolian commands producing validated proposed edits | Deferred |
| 10 | Batch reliability, benchmarks, deployment/team readiness | Deferred |

Phase 05 consumes an explicitly selected completed LocalizationRun and creates a versioned editable
SubtitleDocument. Cues, provenance links, append-only operations, media derivatives and explicit
active-document selection remain separate from all Phase 02–04 history. The editor adds preview,
waveform/timeline, timing and structural cue edits, autosave recovery and proposal-only rewrite.

Phase 06 creates historical QC reports over exact SubtitleDocument revisions. Phase 05
EditorOperation remains the only mutation path. Future Phase 07 begins only after new authorization.
Phase 06 did not add final subtitle/video rendering, export, cut/trim/effects/audio editing or a
general multitrack video editor.
