# Domain model through Phase 02

| Entity | Purpose / invariants |
|---|---|
| Series | Title, description, optional declared source language; many Episodes |
| Episode | Series, title, optional number; many original assets, jobs and extraction runs |
| MediaAsset | Immutable original storage reference/filename/bytes/inspection; many streams/runs/derivatives |
| MediaStream | Exact asset-local index, type, codec, source language/title and audio/video metadata |
| ProcessingJob | INSPECT_MEDIA, EXTRACT_EMBEDDED_SUBTITLE, TRANSCRIBE_AUDIO or OCR_BURNED_SUBTITLE |
| SourceExtractionRun | One independent method/provider/version/model/settings/revision execution for an asset and optional selected stream |
| SourceSegment | Timed source text and language/confidence/speaker, sequence, validated words and provider-scoped metadata |
| MediaDerivative | Cached AUDIO_MONO_16K PCM16 artifact; original asset, selected audio index, opaque key, normalization snapshot/hash/size |

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

No fusion, translated transcript, glossary/memory, editor/timeline, render or QC
entities exist. A future authorized Phase 03 must retain this evidence unchanged.
