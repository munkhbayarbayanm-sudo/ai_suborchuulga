# Subtitle QC engine

Phase 06 analyzes one exact SubtitleDocument revision or an explicit set of active series documents.
It creates derived QCRun/QCIssue records. It never changes SubtitleCue directly.

## Deterministic pass

`subtitle-qc-v1` performs ordered, near-linear scans. Timing checks cover bounds, duration, overlap,
minimum gap, sequence order and dense short-cue clusters. Readability checks cover empty text,
non-space Unicode characters per second, line count/length, orphan line breaks, whitespace,
duplicate cues and repeated punctuation. Source-aware checks flag untranslated English/Chinese,
mixed language, negation loss and number mismatch. Explicit Character and Glossary memory drive name
and term consistency. `чи/та` shift is review guidance within the same anonymous speaker sequence.

Each issue stores measured metrics and a SHA-256 fingerprint over the rule, implicated cue IDs and
relevant text/timing evidence. Ignore carries forward only when a rerun produces the same fingerprint.
Severity is deterministic product guidance: ERROR, WARNING or INFO. State is separately OPEN,
RESOLVED or IGNORED. A clear deterministic report is not a correctness guarantee.

Document checks compare adjacent cues once and scan bounded dense windows. Series checks group evidence
by explicit character/glossary records; they do not compare every cue against every other cue.

## Revision and local recheck

QCRunDocument stores every document ID and revision. Any successful EditorOperation, including undo or
redo, marks completed reports containing that document STALE in the same transaction. A stale report
remains historical evidence and is never silently relabeled current.

`POST /subtitle-documents/:id/qc-preview` runs cue-local deterministic checks after an edit. It selects
the changed cues plus bounded timing/density neighbors, returns a transient current-revision preview and
does not alter the historical report. Full QC remains the authoritative revision-bound delivery check.

## Optional linguistic review

AI is OFF by default. PROBLEMATIC_ONLY selects deterministic findings, manual cues and uncertain source
rows; ALL is explicit. The worker reuses the Phase 04 TranslationProvider in REVIEW mode with at most
12 targets, three neighboring context cues on each side, filtered series memory and a request-size
budget. Provider output is runtime validated and mapped by stable cue ID. It may create issues and
UPDATE_TEXT proposals, never cue writes.

Unavailable optional AI records UNAVAILABLE and completes deterministic QC. Invalid optional output
records FAILED for the AI stage and still completes deterministic results. Requiring AI makes that
failure terminal. Provider transport and model quality are not represented by deterministic fixtures.

## Persistence and cancellation

The durable jobs are RUN_SUBTITLE_QC and RUN_SERIES_QC. Worker stages load exact inputs, run deterministic
checks, optionally review bounded targets, recheck document revisions, then atomically persist all issues,
links, suggestions, counts and terminal state. Cancellation is checked between expensive stages and
before final persistence. A changed document finishes STALE without a current-looking partial report.

Suggestions are proposals. Accepting one calls EditorService with optimistic revision and creates an
ordinary EditorOperation, so audit history, undo and redo remain intact.
