# Roadmap and authorization

Phase 01 baseline acb3eaad4e2febb3eb747e287775eebfafc08ee8 was explicitly approved.
Phase 02 implementation was explicitly authorized and is the current stopping point.
Completion never authorizes the next phase.

| Phase | Scope | State |
|---|---|---|
| 01 | Foundation, Series/Episode, media import, asynchronous inspection | Approved baseline; regressions validated |
| 02 | Independent embedded/audio ASR/burned OCR evidence with provenance | Implemented and locally validated; see VALIDATION |
| 03 | Cross-source alignment, candidate reconciliation, source/confidence/speaker fusion | NOT started; explicit authorization required |
| 04 | Mongolian localization, modes, memory, glossary, editorial pipeline | NOT started; no translation |
| 05 | Professional subtitle editor, sync, proposals, autosave, undo | Deferred |
| 06 | QC/series consistency and issue review | Deferred |
| 07 | Non-destructive multitrack video editing | Deferred |
| 08 | Subtitle/video export and render jobs | Deferred |
| 09 | Mongolian commands producing validated proposed edits | Deferred |
| 10 | Batch reliability, benchmarks, deployment/team readiness | Deferred |

Future Phase 03 begins by reviewing independent SourceExtractionRun/SourceSegment
and word provenance, defining alignment/reconciliation outputs and testing them
without overwriting evidence. No automatic choice of a correct transcript exists.
Chinese speech/GPU/diarization/long episode quality are separate unverified gates;
tiny CPU smoke tests must not be promoted to production performance claims.
