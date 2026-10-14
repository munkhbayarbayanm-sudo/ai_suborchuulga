# ADR 0007: Revision-bound QC reports with proposal-only fixes

Status: accepted for Phase 06.

## Decision

Persist QC as a derived historical QCRun over exact SubtitleDocument IDs and revisions. Keep one issue
model for document and series runs, with many-to-many cue links for overlap, clusters and cross-episode
findings. Carry ignored state only by deterministic evidence fingerprint. Mark a completed report stale
inside every later EditorOperation transaction.

Run deterministic checks without an AI provider. Optional linguistic QC reuses the Phase 04 provider
boundary in a bounded REVIEW phase and persists only validated issues and suggestions. Applying a
suggestion delegates to EditorService; QC code never updates cues.

## Consequences

Reports remain reproducible and explainable after edits. Staleness is explicit and old ignores do not
hide changed evidence. Pair and series findings retain direct navigation to every implicated cue.

The system stores more historical rows and a full rerun is still required for authoritative delivery
status. Bounded local preview provides fast edit feedback but is intentionally transient. Optional AI
availability cannot disable timing/readability/source checks, and AI proposals require a user action.
