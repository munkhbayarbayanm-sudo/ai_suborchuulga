# Domain model through Phase 05

| Entity | Purpose / invariants |
|---|---|
| Series | Title, description, optional declared source language; many Episodes |
| Episode | Series, title, optional number/source language; original assets/jobs/derived runs; explicit activeFusionRunId, activeLocalizationRunId and activeSubtitleDocumentId |
| MediaAsset | Immutable original storage reference/filename/bytes/inspection; many streams/runs/derivatives |
| MediaStream | Exact asset-local index, type, codec, source language/title and audio/video metadata |
| ProcessingJob | Prior job types plus GENERATE_EDITOR_PROXY and GENERATE_WAVEFORM |
| SourceExtractionRun | One independent method/provider/version/model/settings/revision execution for an asset and optional selected stream |
| SourceSegment | Timed source text and language/confidence/speaker, sequence, validated words and provider-scoped metadata |
| MediaDerivative | Cached normalized audio, EDITOR_PROXY_MP4 or WAVEFORM_PEAKS; source asset, opaque storage key, settings snapshot/hash/size |

UUID relationships and composite mediaAsset+episode / stream+mediaAsset foreign
keys enforce ownership. Segments reference exactly one run; source method/stream
are obtained from that run rather than independently mutable segment copies.
Run links its own unique ProcessingJob. Originals remain unchanged on extraction
failure/cancellation. Relational cleanup is not physical-object garbage collection.

## Timing, words, language and evidence

Canonical source timing uses integer milliseconds from normalized media time zero.
SQL checks enforce start>=0, end>start, nonempty text, confidence0..1/null and words
array; external Zod validates normalized words/provider metadata. Timed words are
ordered and contained in their segment; both times may be null when alignment
cannot supply them. Word confidence/speaker remain nullable, no fabrication.

Audio normalization pads delayed streams from time zero and fills timestamp gaps
with FFmpeg aresample. PCM WAV has no original PTS, so keeping this timeline is
essential. Cache normalization version2 distinguishes older unpadded derivatives.

Embedded tags eng/chi/zho map conservatively to en/zh; declared zh-Hant/Hans map
to zh-TW/CN. Text script is not independently classified. ASR supports Auto/en/zh,
never infers Simplified/Traditional from speech. OCR en/zh-CN/zh-TW is a requested
hint; detected language remains null. Requested and detected fields are separate.

Scoped metadata is a validated ffmpeg/whisperx/paddleocr discriminated union.
WhisperX words retain alignment; optional missing alignment/diarization warnings
are retained. OCR metadata stores representative timestamp/raw text/normalized box,
observation count and model. No thousands of permanent frame assets.

## Idempotency and state

Default identical asset/method/stream/settings/provider-version/model requests use
revision `default` and a SHA256 identity. Unique identity handles concurrent clicks.
An explicit caller-generated UUID rerunKey creates a revision and deduplicates its
transport retries. Failed/cancelled default runs remain visible and require an
intentional new revision; changing relevant settings creates a new identity.
Worker checks provider snapshot before/after inference and every OCR batch;
configuration drift fails rather than changing the meaning of the identity.

Audio derivative uniqueness uses original asset+audio index+type+normalization
hash, independent of transcription language/model. Database advisory locks protect
concurrent preparation. Object writes are compensated after persistence failure;
a process crash can still leave an orphan. Media blobs never enter PostgreSQL.

Job/run: QUEUED → PROCESSING → COMPLETED/FAILED/CANCELLED.
Cancellation and final persistence serialize on the job row. Segment creation and
successful state transition are atomic. Stable ordering is startMs then sequence;
run and segment API pages have explicit offsets/limits (maximum100items).

## Derived transcript and evidence

| Entity | Purpose / invariants |
|---|---|
| FusionRun | Episode/asset, requested AUTO/ENGLISH/CHINESE and resolved en/zh/reason, algorithmVersion, settings snapshot, revision/identity, unique job, status/stage, metrics/confidence/durations/timestamps |
| FusionRunInput | Exact selected extraction run IDs; composite run/media and extraction/media foreign keys |
| TranscriptSegment | Fusion run/sequence, current and original derived text/timing, en/zh, nullable anonymous speaker, heuristic confidence/category/reasons, human review state, DIRECT/RECONCILED/MANUAL, UNKNOWN content type, editRevision/manualEditedAt |
| TranscriptEvidenceLink | Canonical segment to original source segment and selected source run; PRIMARY/SUPPORTING/CONFLICTING/TIMING_ONLY, alignment/IoU, nullable text similarity/contribution |

Source records and words are never copied over or mutated to create canonical text.
Links retain the stable path to original word timing/provider/stream provenance. Integer
milliseconds preserve Phase02 media time zero and delayed audio. SQL checks protect
positive current/derived intervals, nonempty text, score0..1 and null TIMING_ONLY text votes.
Composite links prevent wrong run/media/episode evidence. Relevant indexes cover run+sequence,
run+start/sequence, run+category/start, run+manualEditedAt and source-segment reverse links.

Original derived values survive manual edits. Text/timing edits become MANUAL and reset
human state unless an explicit action is included; review-only changes keep derivation.
Expected editRevision implements optimistic concurrency (409 on stale edit). Confidence
category HIGH_CONFIDENCE/REVIEW_RECOMMENDED/LIKELY_PROBLEM is independent from
UNREVIEWED/REVIEWED/APPROVED. Completed algorithm metrics remain a historical snapshot.

Rerun identity includes sorted input IDs, normalized settings, requested/resolved language,
algorithm version and default or caller UUID revision. Every revision has independent
segments/manual history. Only explicit activation selects a completed run from the same
Episode. Completion/newest history never auto-activates. Deferrable evidence/active ownership
FKs permit Episode cascades without permitting orphan evidence at commit; see ADR0004.

## Mongolian localization and explicit memory

| Entity | Purpose / invariants |
|---|---|
| LocalizationRun | Explicit completed FusionRun input, en/zh to mn mode/provider/model/prompt/pipeline/settings/context snapshots, unique job, progress/usage/counts, historical revision and identity |
| LocalizationBatch | Ordered bounded target IDs, DRAFT checkpoint and DRAFT/REVIEW usage, status/error/duration for safe resume |
| LocalizedSegment | 1:1 TranscriptSegment input; frozen source text/timing/confidence/review/speaker/revision, machineDraft, currentText, product confidence/reasons, AI/manual state, human state and optimistic revision |
| SeriesLocalizationProfile | User-managed default mode, setting, tone, style, formality, name handling and notes |
| Character / CharacterAlias | Explicit series-owned translation memory for canonical/source/Mongolian names, role/title, voice/formality and notes |
| CharacterRelationship | Directional user-managed character relation and free-form notes; both endpoints belong to the same Series |
| GlossaryEntry | GLOBAL/SERIES/EPISODE/CHARACTER scoped source term, contextual Mongolian preference, notes and active/archived status |
| TranslationMemoryEntry | Exact normalized source/Mongolian pair with IMPORTED, HUMAN_APPROVED or AI_SUGGESTED origin; trust status and optional immutable localized-revision provenance |

LocalizationRun stores exactly which FusionRun it consumed and copies its current canonical
values into source snapshot fields; it never changes FusionRun, TranscriptSegment or Phase02
evidence. Unique LocalizationRun+TranscriptSegment and ordered batch constraints prevent
duplicate rows. Reruns create history; activation is explicit and same-Episode constrained.

`machineDraft` remains the provider's first proposal. `currentText` can hold the reviewed
proposal or manual correction. Expected revision returns409 for stale writes. AI states
PENDING/AI_GENERATED/AI_REVISED/MANUALLY_EDITED are independent from human
UNREVIEWED/REVIEWED/APPROVED and confidence classification. Approving current text creates
trusted HUMAN_APPROVED memory tied to that exact revision; later edits/review revocation
archive it. Approved memory identity/provenance cannot be manually rewritten.

## Professional subtitle editor

| Entity | Purpose / invariants |
|---|---|
| SubtitleDocument | Historical editable Mongolian document from one explicit LocalizationRun/media asset; version/initialization identity/revision and explicit Episode activation |
| SubtitleCue | Ordered millisecond interval/text/status/origin/revision; soft deletion retains structural history; ownership constrained |
| SubtitleCueSourceLink | Cue to exact LocalizedSegment and LocalizationRun; split clones and merge unions links without changing source |
| EditorOperation | Typed text/timing/structural/status/accept/undo/redo action; base/result revisions, before/after snapshots, client idempotency and optional target |
| EditorRewriteProposal | Provider/model/action/current snapshot/proposed Mongolian/confidence/reasons and explicit decision state |
| EditorMediaPreparation | Source asset, proxy/waveform kind/settings hash, durable job, cached derivative and lifecycle |

Cue timing uses original media integer milliseconds with start>=0/end>start. Document+sequence/start,
status and source-link indexes serve timeline/paging/issue queries. Document+clientOperationId prevents
duplicate edits. Media preparation is unique by source asset+kind+settings hash.

No final export/render, full Phase 06 QC entity, general video edit, effect, cut/trim or audio edit was
added. Those require future authorization.
