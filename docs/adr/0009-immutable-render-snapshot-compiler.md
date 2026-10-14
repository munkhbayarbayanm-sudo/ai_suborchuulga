# ADR 0009: Immutable render snapshots and deterministic offline compilation

Status: Accepted, Phase 08.

## Context

VideoProject and SubtitleDocument are mutable, revisioned authoring layers. A long-running render must remain
reproducible even when editors continue working, and browser CSS cannot be treated as the release renderer.
Outputs must not appear complete until media validation succeeds.

## Decision

Create an immutable JSON RenderSnapshot under a locked revision check for every intentional RenderRequest. Store
the exact project/subtitle revisions, settings, asset/stream references, QC summary, compiler version and stable
fingerprint. Compile it with a pure package into a generated-file graph and FFmpeg argument arrays. Project cues
are deterministically projected into project time; original cues remain unchanged.

Execute the plan in the existing separate worker using controlled storage leases, a per-job workspace,
`shell:false`, a filter script, machine progress and cancellation. Validate container, duration, streams and
sample decoding before atomically publishing all RenderOutput rows. Compensate unpublished objects on failure.

## Consequences

Historical outputs remain explainable and rerenders are explicit. Large graphs avoid Windows command-length
limits. Provider paths and storage roots never enter public contracts. Compiler changes require a named version.
Storage and PostgreSQL still cannot share one transaction, so object compensation covers ordinary failure while
crash-orphan reconciliation remains future operational work. Font and color parity require controlled resources
and representative visual review; the current host-font allowlist is a documented limitation.
