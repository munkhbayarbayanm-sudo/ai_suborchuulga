# Phase 08 validation — 2026-10-14 (Asia/Ulaanbaatar)

## Scope and baseline

Branch `codex/phase-08-render-export` was created directly from approved Phase 07
`c1211bb6e9c63e9aedb00ffb2296111b670b2df4`. Design commit is `8d07092`; implementation commit is
`37d7fc2`. No merge, push or deployment was performed. Legal generated fixtures only were used.

## Automated evidence

| Command | Result | Evidence scope |
|---|---|---|
| `pnpm test` | 29 files, 182 tests passed | Phase 01–08 unit contracts/algorithms; render compiler 7 tests |
| `pnpm --filter @mongolsub/web test` | 7 files, 41 tests passed | existing web/API helpers regression |
| `pnpm test:integration` | 8 files, 61 tests passed | real Nest/PostgreSQL/Redis/BullMQ/filesystem/FFmpeg regression |
| focused `render.test.ts` | 1 file, 7 tests passed | real MP4/MKV/sidecars/readiness/idempotency/revision/cancel/failure |
| `pnpm lint` | exit 0 | repository ESLint |
| `pnpm typecheck` | 17/17 workspace tasks plus tooling passed | strict application/scripts/tests types |
| `pnpm db:migrate` | exit 0 | Phase 08 additive migration applied |
| `pnpm db:test:migrations` | 14 migrations passed on fresh temporary database | Phase 01→08 clean chain and schema parity |
| `pnpm build` | 3/3 application builds passed | Next production app plus API/worker ESM |
| `pnpm benchmark:render` | exit 0 | deterministic long-project compiler measurement |
| `pnpm benchmark:render:runtime` | exit 0 | real legal synthetic 10-minute 720p CPU encode and ffprobe validation |

The integration suite stopped every unrelated MongolSub worker first. One earlier attempt was intentionally
discarded because an already-running browser-acceptance worker consumed temporary-storage test jobs through the
shared Redis queue. With that worker stopped, the complete 61-test suite passed.

## Render-specific coverage

Pure tests validate immutable revisions, fingerprint determinism, resource bounds, unsafe filenames/fonts,
partial/repeated projection, UTF-8 SRT/ASS escaping, gap/trim/transform/crop/color/audio graph compilation,
controlled text files with `%{pts}`, image contain/opacity/rotation, blur geometry/z-order, QC warnings,
capability rejection and progress clamping.

Real integration uses a generated 320×180 video/audio source, a Mongolian approved subtitle and actual Phase 07
API operations for rotated text containing `%{pts}`, timed blur, volume 0.5 and audio fades. It verifies:

- concurrent identical create calls return one immutable job and stale revision starts return HTTP 409;
- MP4 H.264/AAC completes with projected SRT/ASS and Unicode ranged download names;
- MKV completes with a selectable `ass` stream;
- FFmpeg and FFprobe readiness fail independently without crashing the API;
- output byte truncation is rejected and publishes no RenderOutput;
- queued, in-flight encoding and saving-stage cancellation publish nothing and clean the workspace/object;
- ffprobe checks duration/container/dimensions/frame rate/codecs/audio shape and three sample frames decode.

These tests execute burn-in, text, blur and audio filters successfully. They establish graph execution and stream
properties; they do not claim browser/offline pixel identity or formal audio perceptual equivalence.

## Performance evidence

The pure 60-minute-like fixture had 600 clips and 1,200 source/projected cues. The latest run compiled in about
102.036 ms, emitted a 185,989-byte filter graph and 26 output arguments. This measures compiler work only.

The runtime benchmark generated a legal 600-second source and rendered a 600-second, 1280×720, 25 fps project
through the production compiler with six video/audio clip placements, cut/reorder/repeated source ranges,
normalized crop/color, one PNG overlay, one timed blur, one rotated text overlay, 120 burned cues and audio
volume/fades. CPU `libx264` FAST completed the final encode in 327,583.3 ms: effective 1.832× real time,
FFmpeg final reported speed 2.18×. Output was 85,925,209 bytes; ffprobe returned 600,000 ms, H.264 and AAC.
Node orchestration peak RSS observed during progress callbacks was 81,633,280 bytes. FFmpeg peak memory was not
measured, so no total-memory claim is made. Results apply only to this host and synthetic workload.

## Compiled runtime and browser acceptance

Production-built API, worker and Next server were started on Windows against portable PostgreSQL/Redis. Health
and render routes loaded. In the real browser Video Editor Export panel showed readiness/settings/history,
submitted the exact displayed project/subtitle revision, progressed through the separate worker to COMPLETED and
displayed VIDEO/SRT/ASS download links. The Unicode sidecar download used a valid RFC 5987 filename. Historical
FAILED attempts caused by an intentionally missing local fixture blob remained visible and were not relabeled.

No Docker, production deployment, GPU encode, S3/cloud delivery or Linux runtime was executed. The historical
host Docker failure remains an independent environment gate.

## Known limits and parity

CPU H.264/AAC is the only enabled release encode. Hardware encoders are merely discoverable. Font files are not
packaged; drawtext is restricted to Inter/Arial/Georgia/Courier New and host availability affects metrics. MP4
soft subtitles, multi-language soft tracks, HDR/mastering metadata, loudness targets, resume checkpoints and
automatic storage-orphan reconciliation are deferred. See `PREVIEW_RENDER_PARITY.md` for CSS/FFmpeg differences.

## Continuation boundary

Phase 09 natural-language editing was not started. A future authorized phase may create validated typed edit
proposals against an explicit VideoProject revision and route accepted changes through existing Phase 07
operations. It must not execute model-supplied commands, mutate originals or alter historical render snapshots.
