# Phase 01 domain

| Entity | Purpose | Relationships |
|---|---|---|
| Series | title, description, optional declared language, timestamps | many Episodes |
| Episode | title, optional positive number, timestamps | Series; many MediaAssets and ProcessingJobs |
| MediaAsset | original filename, opaque storage key, MIME, BigInt bytes, optional inspection metadata, status | Episode; many MediaStreams and jobs |
| MediaStream | stream index/type/codec/language/title and video/audio metadata | MediaAsset; unique asset+index |
| ProcessingJob | INSPECT_MEDIA, status, progress, optional references, useful error and transition timestamps | Episode/MediaAsset |

UUID identifiers, indexed relations/status queries, cascading relational cleanup.
Relational deletion does not delete physical media; no deletion API exists yet.

Asset states: IMPORTED → INSPECTING → READY or FAILED.
Job states: QUEUED → PROCESSING → COMPLETED or FAILED. CANCELLED is representable
but no cancellation UI/API is implemented. Progress is bounded in DTOs to 0–100.
Timestamps use UTC and public ISO strings. Public byte counts use decimal strings
to preserve BigInt precision. Missing metadata stays null, never fabricated.

Language identifiers: `en`, `zh-CN`, `zh-TW` and extensible BCP47-like identifiers
(not a complete BCP47 registry implementation). FFprobe stream language tags are
preserved as evidence and may use ISO639-2 such as `eng`; they are not declared
episode language or translation-source decisions.

Future concepts are documented in the master spec only. No Subtitle, Character,
Glossary, TranslationMemory, Timeline, EditOperation or QC entities are created.
