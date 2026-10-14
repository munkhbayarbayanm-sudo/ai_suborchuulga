# Roadmap and authorization

Phase 01 baseline acb3eaad4e2febb3eb747e287775eebfafc08ee8 was explicitly approved.
Phase 02 baseline bc416581c97ae0648f4ce3f21bf902c973034670 was explicitly approved.
Phase 04 implementation was explicitly authorized and is the current stopping point.
Completion never authorizes the next phase.

| Phase | Scope | State |
|---|---|---|
| 01 | Foundation, Series/Episode, media import, asynchronous inspection | Approved baseline; regressions validated |
| 02 | Independent embedded/audio ASR/burned OCR evidence with provenance | Implemented and locally validated; see VALIDATION |
| 03 | Cross-source alignment, candidate reconciliation, source/confidence/speaker fusion | Implemented and locally validated; see PHASE_03_VALIDATION |
| 04 | Mongolian localization, modes, memory, glossary, editorial pipeline | Implemented and locally validated; see PHASE_04_VALIDATION |
| 05 | Professional subtitle editor, sync, proposals, autosave, undo | Deferred |
| 06 | QC/series consistency and issue review | Deferred |
| 07 | Non-destructive multitrack video editing | Deferred |
| 08 | Subtitle/video export and render jobs | Deferred |
| 09 | Mongolian commands producing validated proposed edits | Deferred |
| 10 | Batch reliability, benchmarks, deployment/team readiness | Deferred |

Phase 04 consumes an explicitly selected completed FusionRun, with the Episode's active
FusionRun used only as an explicit UI default. LocalizationRun revisions, 1:1 LocalizedSegments,
versioned prompts/pipeline, bounded contextual batches, Character Memory, scoped Glossary and
trusted Translation Memory remain separate from canonical/source evidence. OpenAI Responses is
the initial configurable real provider; unavailable configuration leaves Phases 01–03 usable.

Future Phase 05 begins only after new explicit authorization. Its input is an explicitly active
completed LocalizationRun whose machine draft, current text, confidence, manual edit revision
and independent human approval remain recoverable. Phase 04 did not add waveform/timeline,
split/merge, video editing, render/export or the professional editor.
Chinese speech/GPU/diarization/long episode quality are separate unverified gates;
tiny CPU smoke tests must not be promoted to production performance claims.
