# Roadmap and authorization

Phase 01 baseline acb3eaad4e2febb3eb747e287775eebfafc08ee8 was explicitly approved.
Phase 02 baseline bc416581c97ae0648f4ce3f21bf902c973034670 was explicitly approved.
Phase 03 implementation was explicitly authorized and is the current stopping point.
Completion never authorizes the next phase.

| Phase | Scope | State |
|---|---|---|
| 01 | Foundation, Series/Episode, media import, asynchronous inspection | Approved baseline; regressions validated |
| 02 | Independent embedded/audio ASR/burned OCR evidence with provenance | Implemented and locally validated; see VALIDATION |
| 03 | Cross-source alignment, candidate reconciliation, source/confidence/speaker fusion | Implemented and locally validated; see PHASE_03_VALIDATION |
| 04 | Mongolian localization, modes, memory, glossary, editorial pipeline | NOT started; no translation |
| 05 | Professional subtitle editor, sync, proposals, autosave, undo | Deferred |
| 06 | QC/series consistency and issue review | Deferred |
| 07 | Non-destructive multitrack video editing | Deferred |
| 08 | Subtitle/video export and render jobs | Deferred |
| 09 | Mongolian commands producing validated proposed edits | Deferred |
| 10 | Batch reliability, benchmarks, deployment/team readiness | Deferred |

Future Phase 04 begins only after new explicit authorization. Its input is the explicitly
active completed FusionRun and canonical TranscriptSegments, including independent human
approval, original derivation and links to immutable source/word/provider evidence. Localization
must introduce separate records/revisions, preserving canonical/manual and source history.
No translation or professional editor was started by Phase03.
Chinese speech/GPU/diarization/long episode quality are separate unverified gates;
tiny CPU smoke tests must not be promoted to production performance claims.
