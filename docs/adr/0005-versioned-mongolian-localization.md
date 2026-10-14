# ADR 0005 — versioned Mongolian localization with frozen context

Accepted for explicitly authorized Phase 04 on 2026-10-14.

Keep the existing Nest/Next/Prisma/PostgreSQL/BullMQ separate-worker architecture.
Localization is a derived layer over one explicitly selected completed FusionRun.
Creation freezes each canonical line's current text, timing, confidence, review
state, speaker and edit revision into a 1:1 pending LocalizedSegment. It also
snapshots the selected series profile, characters, explicit relationships,
applicable glossary entries, trusted translation memory and earlier approved lines.
SourceSegment, SourceExtractionRun, FusionRun and TranscriptSegment remain unchanged.

A LocalizationRun records source and target languages, STRICT/NATURAL/CINEMATIC
mode, provider and requested model, prompt and pipeline versions, exact settings,
source and context hashes, usage reported by the provider and an explicit job.
The default identity deduplicates accidental repeats. A caller-supplied rerun UUID
creates independent history. Episode.activeLocalizationRunId changes only through
an explicit activation request; creation and completion never select the newest run.

The pure TypeScript localization package owns bounded context selection, prompt
construction, strict provider result validation and explainable quality rules.
Default batches contain at most 20 target lines and five preceding/following lines.
One limit bounds the serialized selected context and a second bounds the complete
provider prompt including instructions and REVIEW drafts. Context lines are read-only
and cannot appear among persisted target IDs. Large context batches shrink rather than
truncate source or memory. A single source line or complete provider request that cannot
fit fails clearly and can be rerun with smaller explicit settings.

Phase 04 uses a configurable OpenAI Responses adapter behind TranslationProvider.
The browser receives no key, endpoint or raw provider payload. The adapter requests
strict JSON Schema output, rejects missing/duplicate/unknown target IDs, bounds the
response body and timeout, handles refusal/incomplete results, and retries only
timeouts, HTTP 408/429 and server failures with bounded backoff. A configured key
and model mean locally ready; they do not prove account/model access until a call
succeeds. Missing configuration leaves Phases 01–03 usable.

Each batch has two provider stages. DRAFT preserves facts, negation, people,
numbers, names, relationships and clauses. REVIEW compares that draft with source
and context, reports typed fidelity risks, and returns the final natural Mongolian
proposal. The second call may improve wording but cannot change timing or create
extra target rows. A saved draft checkpoint makes a failed review resumable without
repeating its successful draft call. Completed batches remain recoverable while a
failed or cancelled run remains visibly incomplete.

Provider confidence is nullable and subjective. Product confidence combines source
risk, provider uncertainty, explicit fidelity findings, applicable glossary/name
signals and readability hints. Severe meaning risks force LIKELY_PROBLEM. A risky
canonical source cannot silently become HIGH_CONFIDENCE. Human review remains a
separate UNREVIEWED/REVIEWED/APPROVED state and is never set by the provider.

LocalizedSegment keeps machineDraft separate from currentText. Manual updates use
expected revision and mark MANUALLY_EDITED; stale updates return conflict and AI
never overwrites the row. Approval can create a deduplicated HUMAN_APPROVED trusted
TranslationMemoryEntry with localized-row and revision provenance. A later edit or
approval revocation invalidates that exact derived memory. Imported memory is
explicit; AI suggestions cannot become trusted automatically.

Character memory is manually managed. Anonymous diarization labels are linked to a
character only by an explicit per-run speaker binding. Character relationships use
a free relationship type and notes. Glossary selection applies the most specific
matching rule (CHARACTER, EPISODE, SERIES, GLOBAL) as context, not string replacement.
Only trusted HUMAN_APPROVED or explicitly trusted IMPORTED memory can strongly enter
context. Model guesses never create permanent series canon.

Alternatives rejected: translating each line independently loses scene meaning;
sending a whole episode creates cost and recovery risk; persisting only the final
text loses the model proposal; mutating canonical transcripts destroys provenance;
auto-approving fluent output confuses confidence with human authority. Phase 04 adds
no waveform, timeline, split/merge, video editing, render/export or Phase 05 UI.
