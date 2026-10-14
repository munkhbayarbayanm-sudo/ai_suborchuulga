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
`fusion` owns deterministic language summaries, bounded alignment and reconciliation.
`localization` owns bounded context selection, versioned prompts, structured provider
validation and deterministic review signals.
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
asset+stream provenance. Subtitle revisions/manual approvals, memory and localization
are separate entities, not mutations of original media or source evidence. Professional
timeline editing, undo history and render/export remain future phases.

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

## Derived Phase 03 transcript flow

FusionService validates explicitly selected completed input run IDs belonging to one
Episode/MediaAsset, with at most one embedded run. AUTO uses bounded evidence summaries;
the stored en/zh choice, reason, input IDs, settings, algorithm version and revision
are reproducible. SHA256 identity deduplicates default clicks and caller UUID retries.
Source evidence remains immutable; no new Python, models or external AI calls.

FUSE_TRANSCRIPT uses existing PostgreSQL durable dispatch and BullMQ worker. The pure
fusion-v1 package traverses sorted bounded temporal windows, compares only the canonical
language family, supports ordered split/merge bundles and selects existing source text.
Cross-language/unknown evidence links are TIMING_ONLY with null textual scores/weights.
See FUSION_ALGORITHM.md for exact defaults, formula, stable ties and complexity bounds.

Worker reports loading/alignment/reconciliation/metrics/persistence stages, yields and
checks cancellation. Final job-row lock, transcript batches, evidence links, metrics and
COMPLETED run/job state share one transaction. Rejected writes leave no partial result;
terminal redelivery is a no-op. Structured logs contain IDs/counts/durations, not transcripts.

FusionRunInput and evidence composite foreign keys enforce media ownership and exact
selected sources. Deferrable NO ACTION constraints preserve legitimate Episode/Series
cascades while preventing standalone evidence deletion from invalidating history (ADR0004).

TranscriptSegments retain derived text/timing separately from current manual values.
Optimistic editRevision prevents lost updates; human approval is independent of heuristic
confidence. Reruns create new runs; selecting or completing a run never changes the explicit
Episode.activeFusionRunId. Batched includes return validated source DTOs/words without N+1
queries. Run/segment pages default25/max100, with category/manual filters and stable timing
ordering. UI pins chosen IDs across pagination/filter refreshes, displays alternatives and
allows simple millisecond/text/review edits. Phase03 polling schedules after request settlement.

Known limits: bounded windows and family comparisons cannot solve global drift, semantic
ambiguity, Chinese script conversion or unknown-language lexical reconciliation. Coverage
describes evidence intervals, not speech/translation completeness. Manual edits leave algorithm
summary/confidence as a labelled completion snapshot.

## Derived Phase 04 localization flow

LocalizationService accepts one explicit completed English or Chinese FusionRun. Run
creation snapshots every canonical source row plus relevant Series profile, owned
characters/relationships, scoped active glossary, exact trusted Translation Memory and
nearby approved lines. The active FusionRun is only a UI default. A SHA256 identity
deduplicates repeated clicks; a caller UUID creates an intentional historical rerun.
Episode.activeLocalizationRunId changes only through an explicit completed-run action.

LOCALIZE_TRANSCRIPT uses the existing durable PostgreSQL/BullMQ worker. The worker runs
bounded DRAFT and REVIEW calls for each persisted batch. Default target batches contain
20 rows and five context rows on each side. Context payload and complete provider request
have separate validated character limits. Drafts and provider usage are checkpointed;
failed runs can resume remaining review/batches without duplicating completed output.
Cancellation is observed between calls and before persistence, and a run becomes COMPLETED
only after all batches finish.

TranslationProvider isolates the initial configurable OpenAI Responses adapter. Requests
use versioned system/user prompts and strict structured output. Every target ID must appear
exactly once; unknown, missing, duplicate, invalid-language or malformed results fail that
batch. Provider secrets remain server-side. Authentication/schema/configuration failures
are terminal; timeout, 408, 429 and 5xx use bounded retry. Unavailable or disabled localization
does not prevent Phases 01–03 from booting.

Each LocalizedSegment is a 1:1 derived record with a frozen source snapshot, first
machineDraft, currentText, product confidence/reasons, edit state, independent human
review state and optimistic revision. Manual text is never overwritten by reruns. Approval
creates revision-linked HUMAN_APPROVED Translation Memory; changing that localized revision
archives its trusted memory rather than changing provenance. Imported trusted memory is
explicit, and AI_SUGGESTED memory cannot be trusted automatically.

Deterministic review checks propagate source risk and conservatively flag numbers,
negation, selected glossary terms, explicitly known names and reading load. Provider
semantic issues can force review or LIKELY_PROBLEM. Confidence is an explainable product
score, not calibrated probability or human approval. No permanent character/relationship
canon is inferred by AI. Phase 04 has dense paginated review and small memory forms. Phase 05
consumes its output through the separate editor layer described below.

## Derived Phase 05 subtitle editor flow

An explicit completed LocalizationRun initializes a SubtitleDocument and one SubtitleCue per current
LocalizedSegment. SubtitleCueSourceLink preserves the exact many-to-many provenance path. The editor
never edits LocalizedSegment, TranscriptSegment or SourceSegment. Episode activation is explicit and
historical documents remain intact.

EditorService validates typed operations, locks the document, checks one optimistic revision and
atomically writes cue state plus an append-only before/after EditorOperation. Split clones provenance;
merge unions it; structural replacements use soft deletion. Undo/redo are new operations and do not
rewrite history. Client operation UUIDs deduplicate retries. IndexedDB is a browser write-ahead recovery
queue; PostgreSQL remains authoritative.

Browser playback is the master media clock. Compatible source assets use controlled range streaming;
other codecs use a cached versioned H.264/AAC MP4 derivative. The worker streams decoded mono PCM into
multi-resolution min/max waveform JSON. Both preparations use durable jobs, settings hashes, controlled
storage IDs, cancellation polling and temporary cleanup. Timeline/transcript render bounded windows.

AI rewrite reuses the Phase 04 provider boundary in a REWRITE phase and persists a proposal. Only an
accepted editor operation changes cue text. See SUBTITLE_EDITOR_ARCHITECTURE.md and ADR0006.

Phase 05 has no final render/export, general video edit, full QC engine or audio editing.

## Derived Phase 06 subtitle QC flow

QCService creates one document or series QCRun over explicit SubtitleDocument IDs and exact revisions.
The normalized QCProfile snapshot, engine version, AI mode and rerun identity make the report
reproducible. QCRunDocument records every input; QCIssueCueLink supports cue pairs, clusters and
cross-episode findings. Issues have separate severity and human state plus evidence fingerprints.

The `qc` package owns provider-free ordered timing, readability, source/fidelity and memory-driven
consistency rules. Series checks group by Character and Glossary records instead of whole-series
all-pairs comparison. A bounded local preview rechecks changed cues plus neighbors without modifying a
historical report. Full report generation remains a durable worker job with revision recheck and atomic
final persistence.

Optional linguistic review reuses TranslationProvider only in REVIEW mode. OFF is default;
PROBLEMATIC_ONLY and ALL use bounded targets and context. Runtime-validated provider findings become
issues or proposals. Unavailable optional AI never blocks deterministic QC. QC suggestions are applied
only through EditorService, which also marks prior completed reports stale inside the edit transaction.

The editor renders bounded paginated issue rows and non-color timeline symbols. Series Quality analyzes
explicit active documents, reports missing active documents and deep-links to the exact document/cue.
See QC_ENGINE.md and ADR 0007. No Phase 07 editing or final render/export is present.
