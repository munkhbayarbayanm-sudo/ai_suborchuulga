# Phase 07 validation — 2026-10-14

## Scope and baseline

Branch `codex/phase-07-video-editor` was created directly from approved Phase 06 commit
`8e0addbd3ceaae2127af45540f4cb2e4b9dccdae` (implementation commit
`6d30da230bdb43ce8fd670f00cec67be7c71cf38`). Phase 07 implementation commit is
`edc9893aa5242447948b7b20b5aa3a959c6f6bf1`. No merge or push was performed.

Phase 07 adds a non-destructive multitrack project, project-master transport, typed edit operations,
browser compositor/audio preview, source-time subtitle projection, waveform reuse and recovery. It does
not add a final output asset or execute a final FFmpeg render.

## Automated evidence

| Command | Result | Evidence scope |
|---|---|---|
| Focused Phase 07 unit tests | 12/12 | timeline/time mapping, linked operations, subtitle projection, contracts and browser helpers |
| `pnpm test` | 175/175, 28 files | all unit regressions through Phase 07 |
| `pnpm --filter @mongolsub/web test` | 41/41, 7 files | web transport/window/recovery helpers plus prior UI regressions |
| `pnpm test:integration` | 54/54, 7 files | real Nest/PostgreSQL/Redis/storage integration through Phase 07 |
| Focused video editor integration | 5/5 | create/activate, operations/history/conflict/source immutability, assets/ranges and waveform reuse |
| `pnpm db:migrate` | exit 0 | existing database has all 13 additive migrations |
| `pnpm db:test:migrations` | exit 0 | fresh temporary schema applied Phase 01→07 migrations |
| `pnpm lint` | exit 0 | workspace ESLint |
| `pnpm typecheck` | exit 0 | workspace packages/apps/scripts/tests |
| `pnpm build` | exit 0, 3 apps | API/worker bundles and Next production route including video editor |
| compiled runtime | passed | built API on 4000, worker ready, Next on 3000; active rev 5 project returned seven tracks and completed waveform |
| `pnpm benchmark:video-editor` | exit 0 | deterministic resolver benchmark described below |

Expected integration failure paths use invalid revisions/ownership; no source media, SubtitleCue,
LocalizedSegment, TranscriptSegment or SourceSegment is mutated by project operations.

## Synthetic benchmark

The deterministic benchmark represents a 60-minute project with 250 video cuts, 1,200 subtitle cues,
20 image overlays, 15 blur regions, three audio tracks and 36,000 playhead lookups. On this Windows host:

```text
index/project build:  15.820 ms
60-second window:      0.225 ms (8 clips, 23 subtitles)
36,000 lookups:       40.217 ms
single pure edit:       4.725 ms
inverse/undo apply:     3.363 ms
active observations:  172,150
```

These are pure in-process measurements, not database persistence, React frame-rate, media decode or final
render throughput. The index uses sorted intervals, prefix maximum ends and binary search. Snapshot
persistence remains proportional to project size and was covered functionally rather than benchmarked.

## Browser acceptance

Using a legal synthetic inspected media fixture, the real UI created and explicitly activated a project,
displayed seven tracks, created text and rectangular blur overlays, split linked video/audio at project
time, showed source-mapped subtitle partial-cut warnings, and restored both linked clips with Undo. Play
advanced the project clock from 0 to 1.111 s in the final run. The current QC status and Subtitle Editor
link remained visible. `Waveform ready` was backed by one rendered waveform canvas. Imported asset
inspection and waveform preparation use persisted statuses/jobs rather than a browser-only success state.

The browser preview uses a two-video pool, black/silent gaps, >180 ms seek correction and 45–180 ms rate
correction. Native element audio is muted and routed through Web Audio gain/fade nodes. Resources and
listeners are removed on project/route teardown. Browser codec seeking, CSS color/blur/font output and
background-tab timing remain preview limitations, not render proof.

## Migrations, jobs and environment

Migrations `202610140007_video_editor` and `202610140008_video_editor_deferred_assets` are additive.
The second uses deferred ownership constraints so ordered Episode/project cascades remain possible while
preventing orphan project asset/clip/overlay references at commit.

No redundant media job type was added. Project waveform preparation reuses `GENERATE_WAVEFORM`,
`WAVEFORM_PEAKS`, `EditorMediaPreparation`, settings hashes, controlled storage resolution and the
existing worker. Upload inspection reuses `INSPECT_MEDIA`.

Validated on Windows with the repository portable PostgreSQL/Redis and FFmpeg setup. Direct focused test
commands must load `.env`; one initial attempt failed before test collection while the portable database
listener was down. After starting owned infrastructure and using dotenv, the exact test passed. Shared
Redis was not flushed and unrelated services were not changed.

## Deferred and risks

- Ripple delete/move, multi-select, filmstrip generation and project duplication are deferred.
- Relinking a single unlinked clip does not infer its former peer group.
- Preview caps simultaneous routed audio clips at three.
- Snapshot replacement is atomic and simple but writes O(project-size) clip/overlay rows per edit.
- Non-browser source codecs may still require a generalized Phase 08/preview proxy path.
- CSS compositor color space, font metrics, blur kernel and frame rounding are approximations documented
  in PREVIEW_RENDER_PARITY.md.
- The benchmark does not certify low-end hardware, long-session memory, database edit latency or playback
  frame rate across codecs.

## Exact continuation

STOP at Phase 07. Phase 08 may read an explicit VideoProject revision and compile clips, overlays,
source-mapped subtitles and audio envelopes into a validated render plan, then add durable render jobs,
progress, output assets and output validation. It must define fonts, color space, rounding, mix headroom,
subtitle burn/pass-through and encoder settings, and compare representative output with preview.

Phase 07 did not start final MP4/MKV output, release encoding, subtitle burn/export, raw final FFmpeg
filter-graph execution, natural-language video commands, advanced transitions or a generic keyframe engine.
