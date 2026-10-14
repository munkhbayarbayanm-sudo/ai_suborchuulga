# Phase 08 render and delivery design

## Decision

Phase 08 adds an immutable delivery layer after the Phase 07 edit decision list. An export request locks
one `VideoProject`, copies every render-relevant project, asset, subtitle and QC value into a validated
`RenderSnapshot`, records the exact project/subtitle revisions, and fingerprints that snapshot together
with normalized output settings and `render-compiler-v1`. The worker never rereads live project or cue
state while compiling or encoding.

The pure `@mongolsub/render` package owns snapshot validation, project-time subtitle projection, SRT/ASS
serialization, output preset resolution, deterministic render-plan compilation and FFmpeg graph
serialization. It has no database, browser, storage or process dependency. Public contracts expose IDs,
logical filenames and bounded settings; storage keys and local paths remain worker-side.

The existing durable `ProcessingJob`/BullMQ dispatcher gains `RENDER_VIDEO_PROJECT`. `RenderJob` stores
render stages and bounded progress; `RenderOutput` stores validated deliverables. The worker materializes
controlled assets into a job-specific temporary directory, writes a file-based filter graph and generated
ASS there, invokes FFmpeg with argument arrays and `-nostdin -progress pipe:1`, validates the partial
output with ffprobe and sample decodes, then streams it into controlled storage. Only a validated stored
object receives a `RenderOutput` record.

## Canonical semantics

- Project time remains the master clock. Gaps are black video and silence.
- Clip operations are trim, crop, color, scale, rotation, opacity and canvas placement, in that order.
- Visual stacking is base video, blur, image/logo, text and burned subtitle.
- Audio follows clip source ranges and project delays; gain/mute/fades apply before deterministic mixing
  and an explicit limiter protects the final master.
- Subtitle cues are projected through retained primary-video clip ranges. Partial intersections produce
  fragments; repeated/reordered source ranges produce repeated/reordered output cues. Source cues remain
  unchanged.
- MP4 uses H.264/libx264, AAC, yuv420p and faststart. MKV carries an ASS soft track when requested.
- SRT and ASS are UTF-8 sidecars generated from the same projected cues used for burn-in/soft subtitle.

## Failure and recovery

Submission is idempotent by `(videoProjectId, clientRequestId)`. A completed fingerprint is reused only
when every requested validated output still exists. Cancellation is observed before each stage and during
FFmpeg execution; only the owned child is terminated. Partial files and temporary workspaces are removed
on success, failure and cancellation. Deterministic configuration/graph failures are not retried. A failed
render restarts from the beginning; chunk resume is intentionally deferred.

## Scope boundary

This phase produces final media/subtitle deliverables. It does not add natural-language video commands,
a second edit representation, generic keyframes or source-record mutations.
