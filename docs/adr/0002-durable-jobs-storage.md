# ADR 0002 — Durable enqueue and opaque media storage

Accepted for Phase 01, 2026-10-13.

Store media through a streaming StorageProvider under opaque UUID keys. Create
asset/job in one PostgreSQL transaction after object persistence. A worker-side
dispatcher sends QUEUED records to BullMQ with the ProcessingJob UUID as jobId.

Alternatives: inline enqueue alone has a DB/Redis loss window; a larger event outbox
schema is unnecessary for the single job type. The ProcessingJob itself is a durable
dispatch record. Retained queue IDs deduplicate repeated polling. Completed jobs
are idempotent; stream replacement and completion are one DB transaction.

One processing attempt, one stalled recovery; invalid media never loops forever.
Original media remains immutable. A remote provider may materialize a temporary
worker lease, so domain/API know storage keys rather than filesystem paths.

Trade-offs: worker owns dispatch and imports may remain QUEUED while it is offline.
Filesystem/DB crash orphans require later reconciliation. Multi-worker heartbeats,
advanced retry/resume/cancel and object lifecycle policies remain deferred hardening.
