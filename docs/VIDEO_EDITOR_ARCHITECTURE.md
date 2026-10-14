# Phase 07 video editor architecture

## Project time and immutable inputs

`VideoProject` is a derived edit decision list. It references immutable `MediaAsset` rows and one
explicit `SubtitleDocument`; it never rewrites media, subtitle cues, localization, transcripts or
source evidence. `Episode.activeVideoProjectId` is changed only by the activation endpoint.

The Project Timeline is the only transport clock. Browser media elements follow it. For a clip:

```text
sourceTime = sourceIn + (projectTime - timelineStart) * playbackRate
projectDuration = (sourceOut - sourceIn) / playbackRate
```

All values are integer milliseconds. Empty project intervals resolve to black video and silence.
The primary video track rejects overlap. Other tracks may overlap for compositing and mixing.

## Timeline model and resolver

Tracks have an explicit type, order, visibility, mute and lock state. `ProjectAsset` records an
episode-owned reference to an immutable media asset. `VideoClip` contains source bounds, project
start, playback rate, transform/crop/color settings and audio gain/fades. `VisualOverlay` contains
time-bounded IMAGE, TEXT or BLUR parameters using normalized coordinates.

The pure `@mongolsub/video-editor` package validates state and owns split, trim, move, delete,
create/update, linking, mapping and snapping semantics. Linked audio/video clips are updated in one
compound operation. Subtitle projection intersects source cues with retained video source ranges;
it preserves cue IDs and flags cues cut by a boundary. It never deletes a cue.

Sorted interval indexes use prefix maximum end times plus binary search. A normal playhead lookup is
near logarithmic plus the active result set. Subtitle projection walks sorted source cues within each
clip's bounded source range rather than comparing every cue with every project object. The API can
return a bounded timeline window, while the browser renders only visible rows/items.

## Transport and preview

`ProjectClock` anchors play to `performance.now()`. React receives throttled display updates; it is not
the time source. Two video elements alternate between active and preloaded next clips. At a clip
boundary the prepared element becomes active. Drift under 45 ms is tolerated, 45–180 ms receives a
small playback-rate correction, and drift above 180 ms seeks to the mapped source time.

The compositor uses media elements plus DOM/CSS layers. Video fit, normalized transform and crop,
brightness, contrast, saturation and opacity are previewed without changing the source. Image and
text overlays are positioned in normalized project coordinates. Timed rectangular blur uses a clipped
filtered duplicate layer. This is an interactive approximation; Phase 08 must compile the same domain
parameters and verify render parity.

Native element audio is muted. `MediaElementAudioSourceNode` routes clips through `GainNode`; gain is
the clip volume multiplied by deterministic fade-in/fade-out envelopes. Track/clip mute resolves to
zero. Preview limits simultaneous routed audio clips to three to bound browser resources. Existing
`WAVEFORM_PEAKS` derivatives and `GENERATE_WAVEFORM` jobs are reused. Canvas waveform windows map
project time back into each clip's source interval, so split, trim and rate changes remain correct.

## Editing, persistence and recovery

Pointer movement is local preview state. Pointer-up submits one validated typed operation. The API
locks the project in a serializable transaction, checks the expected revision and returns HTTP 409 on
stale edits. `clientOperationId` makes retries idempotent. Each commit stores before/after mutable state
in an append-only `VideoEditOperation`; undo and redo append inverse operations instead of rewriting
history. A single transaction replaces current clip/overlay state and records the operation, so a
failure cannot expose half an edit.

The browser writes pending operations to IndexedDB before sending. Network failures or a tab crash can
therefore be retried or discarded explicitly after reload. PostgreSQL remains authoritative. Project
asset uploads stream through storage and inspection; browser requests contain IDs and bounded settings,
never filesystem paths.

## Deferred scope

Ripple editing, multi-select, filmstrips, project duplication and a general keyframe/transition system
are deferred. Phase 07 has no final render, release encode, subtitle burn/export or natural-language
video commands. Phase 08 starts by compiling this versioned project model into a validated render plan.
