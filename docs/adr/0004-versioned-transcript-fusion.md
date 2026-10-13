# ADR 0004 — versioned canonical transcripts with immutable source provenance

Accepted for explicitly authorized Phase 03 on 2026-10-13.

Keep Nest/Next/Prisma/PostgreSQL/BullMQ and the separate worker. Fusion has no
Python or external AI dependency. A pure TypeScript package performs deterministic
language-aware temporal alignment, bounded split/merge mapping and text election.
Algorithm version fusion-v1 and fully normalized settings are persisted with exact
selected extraction run IDs. An identity hash deduplicates default requests;
caller UUID reruns create independent history and deduplicate transport retries.

FusionRun and FusionRunInput record an execution and its explicit sources.
TranscriptSegment stores derived text/timing and independently editable current
text/timing, confidence/reasons, algorithm category and human review state.
TranscriptEvidenceLink retains every contributing/alternative source reference,
role and meaningful temporal/text scores. Words stay in immutable SourceSegments;
links provide the stable path without copying word arrays into transcript rows.

English and Chinese are separate text-election families. AUTO recommends from
aggregate evidence, while explicit overrides remain available. Chinese script
variants share zh but no conversion library is introduced in v1; original scripts
remain unchanged and differences are reviewable. Cross-language/unknown evidence
can support the event interval only: TIMING_ONLY, null text similarity and null
text contribution. No translation or generated prose is permitted.

An ordered temporal neighborhood replaces all-pairs episode matching. Fixed
reference windows and candidate/run/span limits prevent giant overlap chains.
Independent method votes prevent many experimental reruns multiplying agreement.
Heuristic confidence is explainable and separate from provider confidence or
human approval; thresholds and reliability defaults are configurable snapshots.
See FUSION_ALGORITHM.md for exact rules, formulas, limitations and complexity.

Manual updates use an expected edit revision to prevent stale-client overwrites.
Derived values stay recoverable; reruns never modify previous runs or manual edits.
Episode.activeFusionRunId changes only on an explicit activation request. No
automatic newest-run preference is persisted. Episode declared language provides
AUTO tie context; Series declaration remains a fallback.

Composite FKs enforce media/episode, input/media, transcript/run, evidence/input
and source segment/run ownership. Cross-source NO ACTION constraints are deferred
to transaction commit so existing whole-Episode/Series cascades can remove derived
and source rows together regardless of cascade order; standalone destruction of
referenced source evidence is still rejected. Fresh-schema migration execution
and actual cleanup tests validate this PostgreSQL boundary.

The worker stages progress and cancellation. Final job-row locking serializes
cancellation with a single transaction containing all transcript rows, links and
completion metadata. Failed/cancelled runs expose no valid partial transcript.
Bounded paginated API includes batch related evidence, avoiding per-line reads.

Alternatives rejected: mutating source text destroys provenance; generative/LLM
fusion adds unreproducible translations; full-episode pair matrices scale poorly;
automatically replacing active/manual results silently discards user intent. No
professional editor, waveform, draggable timeline, export or Phase 04 work.
