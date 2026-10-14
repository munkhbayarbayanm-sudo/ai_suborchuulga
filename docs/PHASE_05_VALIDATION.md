# Phase 05 validation — professional subtitle editor

Date: 2026-10-14, Asia/Ulaanbaatar. Branch: `codex/phase-05-subtitle-editor`.
Approved Phase 04 baseline `a0cf1f068c0e48f3be16363f8965247512b4dfc2` is a direct ancestor.

## Executed checks

| Command / check | Result | Evidence scope |
|---|---|---|
| `pnpm db:migrate` | exit 0; 7 migrations present, none pending | current PostgreSQL schema |
| `pnpm db:test:migrations` | exit 0 | fresh isolated Phase01→02→03→04→05 apply |
| `pnpm lint` | exit 0 | repository ESLint |
| `pnpm test` | 150/150, 22 files | domain, contracts, editor helpers, all Phase01–04 regressions, web helpers |
| `pnpm test:integration` | 45/45, 5 files | real Nest HTTP/PostgreSQL/Redis/BullMQ/storage/FFmpeg/FFprobe |
| Phase 05 integration subset | 8/8 | document/provenance, edits/history, rewrite proposal race, proxy/wave/range, cancellation/retry, cancellation during storage persistence with cleanup |
| `pnpm benchmark:editor` | exit 0 | real PostgreSQL, 60-minute/1,200-cue synthetic editor data |
| `pnpm build` | 3/3 apps | API/worker ESM and Next production editor route |
| `pnpm typecheck` | 14/14 workspace packages plus tooling | strict TypeScript and scripts/tests |
| compiled API/worker/Next | health ok; web 200; editor route 200 | actual `dist` and `next start` runtime |
| browser workflow | passed as described below | actual UI with legal synthetic media |

## Phase 05 deterministic tests

Pure tests cover interval validation, snapping/warnings, Unicode-safe split, discriminated operation
payloads, undo/redo target resolution, byte-range parsing and streaming multi-resolution peak aggregation.
Web tests cover shortcut safety around text controls/IME, bounded virtual rows and
`requestVideoFrameCallback` scheduling/cancellation. Phase 04 prompt tests verify the REWRITE phase
contains the selected action/current cue but remains structured and bounded.

The real integration starts Nest and the normal worker against PostgreSQL/Redis and a temporary
storage root. It generates legal synthetic MKV video/audio. Verified behavior:

- one cue per LocalizedSegment, explicit activation and immutable Phase 04 snapshots;
- move/resize, stale 409, append-only undo/redo;
- split/merge/delete and structural undo while preserving/unioning source links;
- rewrite proposal generation/acceptance without changing machineDraft/source localization;
- concurrent rewrite accept/reject serialization with one final proposal decision;
- cached FFmpeg H.264/AAC proxy, three waveform levels, exact byte-range response and reuse;
- exact settings-hash cache selection, cancellation and fresh-job retry after cancellation.

The rewrite provider in this integration is an injected deterministic fixture. It proves provider
contracts/context/proposal/persistence, not Mongolian quality or a real paid LLM request. No real
OpenAI request was executed in Phase 05.

## Browser acceptance actually executed

The development API, worker and Next UI were started with a legal two-second synthetic fixture.
The browser opened an explicitly active three-cue SubtitleDocument and visibly showed:

- prepared proxy playback and browser controls;
- cached waveform, time ruler/cue track and virtualized transcript;
- Mongolian cue rows and source/provenance inspector after selection;
- editable Mongolian text, timing fields, issue/status actions and rewrite proposal controls;
- autosave changing the document from revision 0 to 1;
- Undo restoring the original Mongolian text and appending revision 2.

The browser fixture, derivatives and database rows were removed after validation. API integration,
not browser clicking, covered drag/resize/split/merge/delete/redo and deterministic AI acceptance.
The local configured provider was unavailable, so a real browser AI rewrite was not claimed.

## Performance measurement

`pnpm benchmark:editor` used a synthetic 60-minute episode with 1,200 transcript/localization rows and
real PostgreSQL persistence on this shared Windows host:

| Measurement | Result |
|---|---:|
| SubtitleDocument + 1,200 cues + links initialization | 388 ms |
| 300-row paged cue/provenance query | 242 ms |
| one validated optimistic text operation | 119 ms |

The web transcript mounts about one viewport plus overscan. Timeline cues are filtered to the visible
time window. Waveform canvas width is bounded to the viewport even when the scrollable timeline is very
wide. These values do not measure browser paint, media decode, network throughput or LLM performance.

## Media/time behavior

`subtitle-editor-v1` uses original-media integer milliseconds. HTML video is authoritative;
`requestVideoFrameCallback` feeds the overlay and playhead DOM directly when available and a currentTime
timer is fallback. React editor state receives a throttled time update, so playback does not rerender the
1,200-cue workspace on every decoded frame.
Direct compatible assets remain original. `editor-proxy-v1` maps media with explicit argument arrays to
MP4 H.264/libx264, CRF 23, veryfast, yuv420p, AAC 128 kb/s and faststart. The original is unchanged.

Playback accepts no range or one `bytes=` range, including suffix/open-ended forms. It returns 200/206
or 416 with Content-Length/Content-Range and streams a materialized controlled storage object.

`waveform-v1` maps exact audio, outputs mono 8 kHz signed PCM and streams it into 1000/100/25 ms min/max
peaks. `POST /subtitle-documents/:id/media/cancel` cancels the exact current settings-hash preparation;
retry creates a fresh processing-job ID so BullMQ transport deduplication cannot suppress it. Worker
cancellation is checked around stages; FFmpeg processes are killed on cancel/timeout and temporary
proxy files are cleaned.

## Known limits and risks

- Single-range HTTP only; multipart byte ranges are rejected.
- Proxy generation can be expensive for long media and local disk capacity is not yet scheduled.
- Waveform amplitude is not dialogue/silence classification.
- Frame-accurate stepping depends on browser/video decoding; fallback polling is approximately 33 ms.
- Snapping uses a fixed 120 ms threshold and visible UI has no custom snap preference yet.
- Numeric timing edits submit on blur; extreme inputs are rejected server-side.
- IndexedDB queue protects pending operations, but there is no collaborative auto-merge; 409 requires
  explicit retry/discard/review.
- Undo history is linear per document. Accepted proposal state remains audit history after text undo.
- UI accessibility uses semantic controls, labels, keyboard-safe focus and non-color status text, but no
  external screen-reader certification was performed.
- Browser acceptance used a short legal fixture. Long browser paint/decode and production deployment
  remain unverified.

## Phase boundary

Phase 06 full QC was not started. Final subtitle/video export/render, cut/trim/crop/logo/blur/effects,
audio editing and a general multitrack video editor were not implemented. Phase 05 stops at a stable
editable SubtitleDocument with auditable operations and source provenance.
