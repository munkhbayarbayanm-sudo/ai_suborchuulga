# Phase 08 render pipeline

## Boundary and identity

The API accepts an opaque VideoProject ID, exact project/subtitle revisions, a caller UUID and validated export
settings. Under a shared project lock it captures a complete `render-snapshot-v1` document. The snapshot owns
the project EDL, controlled asset IDs/stream indexes, subtitle projection input, QC summary and normalized
settings. A SHA-256 fingerprint excludes only `createdAt`; renderer behavior is also named by
`render-compiler-v1`. A repeated `clientRequestId` returns the same job. A deliberate rerender uses a new ID.

## Pure compiler

`@mongolsub/render` has no database, filesystem or process dependency. It validates safety limits and required
FFmpeg capabilities, indexes the ordered timeline and emits:

- one stable input list keyed by ProjectAsset and MediaAsset IDs;
- generated UTF-8 text/ASS/SRT files;
- a filter-complex script rather than a large command-line expression;
- output argument arrays and expected stream properties;
- deterministic warnings for partial/colliding cues and stale/open QC findings.

Main-video gaps use a generated black canvas. Every visible clip trims exact source bounds, resets timestamps,
applies crop, scale/fit, position, rotation, opacity and color operations, then overlays on the canvas. Values
that feed dimensions are rounded to even encoder-safe pixels. Overlay order follows track order and stable IDs.
Images are contained inside their normalized boxes; text uses a file with `expansion=none`; blur crops a bounded
region, filters it and overlays it back. Only controlled fonts can reach drawtext.

Audio clips use exact `atrim`, PTS reset/playback rate, 48 kHz stereo normalization, volume, fades and timeline
delay. All audible tracks mix deterministically with normalization disabled and a final 0.95 limiter. Muted
clips/tracks are absent. Empty audio uses a stereo silent source.

## Subtitle projection

SubtitleDocument cues retain source-media time. The compiler maps each cue through every retained video source
interval into Project Timeline time. A source range reused later therefore produces another projected cue;
reordered clips reorder cues; boundary intersections produce clipped cues and a warning. Source cues are never
mutated. Projected cues feed the same ASS serializer for burn-in and MKV soft subtitles, and deterministic SRT
or ASS sidecars.

## Worker execution

The separate BullMQ worker resolves opaque storage keys from database-owned MediaAssets and materializes leases.
It creates one `MEDIA_WORK_ROOT/render-<job-id>` directory, writes generated files and invokes FFmpeg with an
argument array, `shell:false`, `windowsHide:true`, `-nostdin`, `-filter_complex_script` and `-progress pipe:1`.
Output is written as `output.partial.*` and constrained by timeout and maximum bytes. Stderr is bounded and only
its byte count/digest is persisted on failure.

Machine progress updates durable ProcessingJob and RenderJob rows only while they remain PROCESSING. Cancellation
is checked before spawning, by an AbortController during FFmpeg, after encoding/inspection, between storage
writes and again while the RenderJob row is locked for final publication. Stored but unpublished objects are
deleted and leases/workspace are always released.

## Validation and publication

FFprobe must confirm expected duration tolerance, container, H.264 video dimensions/frame rate, AAC 48 kHz
stereo audio and, when requested, an ASS subtitle stream. FFmpeg then decodes frames near the beginning, middle
and end. Only after every object is stored does one transaction lock the job, insert all RenderOutputs and mark
both durable jobs COMPLETED. A failed/truncated/cancelled run exposes no valid partial output.

The current renderer is CPU `libx264`. Hardware encoders may be added only as explicit versioned presets with
their own readiness and validation; capability discovery alone does not enable them.
