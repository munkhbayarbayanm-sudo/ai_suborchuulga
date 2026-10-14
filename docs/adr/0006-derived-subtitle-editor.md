# ADR 0006: Derived subtitle documents, append-only operations and cached editor media

Status: accepted for Phase 05.

## Decision

Create SubtitleDocument/SubtitleCue as a derived editable layer from one explicit LocalizationRun and
retain provenance through SubtitleCueSourceLink. Record mutations as validated EditorOperations with
complete before/after snapshots and one optimistic document revision. Undo/redo are new operations;
structurally replaced cues remain soft-deleted.

Use source media time as the only clock. Stream compatible originals; otherwise cache a versioned
H.264/AAC MP4. Cache a versioned multi-resolution min/max waveform built from streaming decoded PCM.
Both artifacts retain source MediaAsset and settings hash.

## Consequences

Phase 02–04 evidence, machine drafts, manual localization and approval remain immutable. Split/merge
preserve many-to-many provenance and undo restores stable identities. History is larger than a command-only
log but remains explainable after code changes. Stale tabs fail instead of silently merging.

Proxy generation spends disk/CPU once per identity. Waveform JSON renders quickly without browser audio
decoding but is not speech segmentation. Filesystem/database crash orphans remain a known reconciliation
boundary and must never be cleaned blindly.
