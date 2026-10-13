# ADR 0003 — independent evidence and optional inference service

Accepted for authorized Phase 02, 2026-10-13.

Keep Nest/Next/Prisma/BullMQ and original storage unchanged. Add extraction runs,
segments, word evidence and audio derivatives. Run settings/provider identity are
immutable snapshots; each method remains independently inspectable. Composite FKs
enforce media/episode and stream/media ownership. SQL checks enforce timed segments.

Default identical requests reuse revision `default`. Explicit reruns use a caller UUID;
retries of that request reuse the same run. A deterministic identity hash includes
method, selected stream, validated settings and provider/model snapshot. Unique
identity constraints handle concurrent clicks. Audio derivatives have their own
normalization key independent of transcription language/model and are reusable.

The worker rejects provider/version/model drift after queueing and between OCR
batches; it never changes the identity's meaning. Audio normalization version2
pads selected delayed streams from normalized media time zero and fills gaps.
Timed words must be ordered and contained in their parent segment.

A long-lived optional Python 3.11 FastAPI service exposes real WhisperX/PaddleOCR
through authenticated loopback HTTP. It lazily caches models and serializes heavy
inference. Browser requests reference asset/stream IDs, never physical paths; the
worker resolves storage/temporary leases, and Python independently checks allowed
roots. Optional absence cannot prevent core app boot or embedded extraction.

Alternatives: Python per segment/frame would repeatedly load models and was rejected;
placing inference inside Nest couples CPU/GPU runtimes to core boot. A single
Python environment with locked compatible extras keeps Windows setup repeatable;
GPU execution remains optional. Any environment/model incompatibility is reported,
not replaced with a fake production provider.

OCR deduplication groups only observations within one OCR run. It does not align,
choose or reconcile embedded/ASR/OCR evidence. No Phase 03/translation behavior.
