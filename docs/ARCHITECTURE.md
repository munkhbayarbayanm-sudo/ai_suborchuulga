# Architecture

## Boundaries

`apps/web` is Next/React/Tailwind. Views use shared validated DTOs and API helpers;
XHR streams the browser upload and reports progress. Polling uses persisted jobs.

`apps/api` is Nest REST. Controllers delegate to StudioService. Input uses Zod;
explicit DTO mappers omit storage keys and serialize dates/BigInt safely. Busboy
streams one video through StorageProvider. Uploaded MIME/extension are preliminary
validation only; actual content is inspected by FFprobe.

`apps/worker` is a separate BullMQ process. It dispatches persisted QUEUED rows,
then inspects opaque storage references through a materialization lease. FFprobe
runs as a child process with argument arrays, no shell, timeout and output bound.
Runtime-validated metadata is persisted transactionally with final job status.

`packages/config` validates environment; `contracts` validates public input/output;
`domain` owns application error and status constants; `database` owns Prisma/schema;
`storage` owns physical media paths; `media` owns process invocation and parsing;
`queue` owns Redis/BullMQ transport and durable dispatch. `extraction` owns subtitle
parsing, safe normalization/sampling, within-OCR grouping and provider boundaries.
UI primitives remain inside web. Optional Python providers are separate from core boot.

## Import and job flow

HTTP multipart → storage temporary file → atomic rename → transaction creates
MediaAsset + ProcessingJob(QUEUED) → worker dispatcher (every second) → BullMQ
UUID job → PROCESSING + INSPECTING → materialized media → FFprobe → validated
container/streams → transaction saves streams, READY asset, COMPLETED job(100%).

PostgreSQL is the durable enqueue source. Redis failure after commit cannot lose
an import: the worker re-dispatches QUEUED rows when Redis is available. The API
response confirms persistence, not worker completion. The worker owns dispatch,
so imports can queue while it is offline. Dispatch is at-least-once; retained
UUID BullMQ IDs deduplicate dispatch. A terminal database job is a processing no-op.

Failures persist a bounded public code/message and FAILED asset/job. One attempt
per import avoids repeated fatal-media work; BullMQ permits one stalled recovery.
A failed-event handler persists unexpected worker failures without overwriting a
more specific failure. Dispatcher reconciles retained failed transport entries if
an earlier database outage prevented failure persistence. Shutdown bounds pending
Redis operations and guarantees disconnection. Re-import is the Phase 01 retry workflow.

## Storage and safety

Opaque UUID keys under one configured root. Original name is display-only and
sanitized. Streaming byte accounting enforces the upload limit; partial files are
cleaned on abort/storage failure, and committed objects are removed on DB failure.
No full-file buffers in production upload handling. An S3-compatible provider can
implement put/delete/materialize; only its worker lease needs a physical path.

Filesystem and database do not share a transaction: a process crash between object
rename and database commit may leave an orphan. A future cleanup policy requires
careful reconciliation and authorization, not blind deletion.

Redis heartbeat plus separate database/tool checks describe readiness. They do
not replace import E2E. Logs contain event/error codes and job/media/episode IDs;
public errors omit Prisma and child-process internals.

## Build boundary

Shared packages export TypeScript source for development and Next transpilation.
tsup bundles shared package code into API/worker ESM; Prisma, BullMQ and ioredis
remain runtime dependencies, preserving generated engines/scripts. Each backend
app declares these explicitly. `pnpm build` builds all apps; dependencies remain
installed for `node dist/main.js`. This is not a standalone deployment image.

## Future compatibility

Series declared language is extensible and independent of stream language tags.
Streams preserve source codec/language/title/index; future extraction can reference
asset+stream provenance. Future subtitle revisions/manual approvals, memory,
edit operations and undo history must be separate entities, not mutations of
original media. No translation/editor/fusion schemas or functionality exist through Phase 02.

## Independent Phase 02 source flow

Validated extraction request references Episode/MediaAsset and exact subtitle/audio
index. SourceService snapshots settings/provider identity and transactionally creates
an independent SourceExtractionRun + ProcessingJob. Deterministic hashes and unique
identities deduplicate clicks; caller UUID revisions enable explicit reruns.

Separate worker maps selected embedded text into SRT and parses integer milliseconds;
ASR prepares/reuses mono16k PCM16 audio via MediaDerivative; OCR samples4 fps by default,
crops normalized bottom40% or full frame and groups validated observations. Paths
stay inside storage/work leases. Temporary JPEGs are removed on completion/failure/
cancellation. FFmpeg uses argument arrays and never re-encodes the full video for text/audio.

Audio aresample pads delayed stream PTS from normalized input zero and fills gaps;
normalization version2 has its own cache hash. Advisory transaction locks prevent
duplicate preparation. Normalized derivatives never masquerade as originals.

WhisperX/PaddleOCR run in an isolated locked Python 3.11 FastAPI process with lazy,
reused models and serialized heavy inference. Authenticated loopback requests accept
only worker-resolved paths under configured roots; no browser paths or provider keys.
Optional absence leaves core/embedded extraction usable. See ADR0003 and PROVIDERS.

Progress reports stages and real OCR frames processed, not invented provider percent.
Cancellation polls durable state, aborts FFmpeg/HTTP and signals Python on failed
inference too. Python observes between stages/frames; active kernels/downloads cannot
be forcibly interrupted safely. Provider snapshot drift fails the run. Transient
inference errors remain rerunnable; permanent startup errors require configuration.

Final job lock serializes cancellation with an atomic SourceSegment batch transaction.
Provider words/metadata are validated; provider versions/models/language/confidence/
speaker remain explicit. Only same-run OCR repetition is grouped. No source is chosen
as correct. Public DTOs omit keys/paths and paginate both runs and segments.

Known limits: temporary OCR disk budget, full bounded decoded audio in Python,
long advisory transaction during preparation, filesystem/DB crash orphan window,
single local provider/worker health model. No performance or deployment certification.
