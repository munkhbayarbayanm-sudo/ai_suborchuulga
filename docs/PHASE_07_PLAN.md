# Phase 07 non-destructive video editor implementation plan

> **For agentic workers:** Execute each task with test-first changes and verify the repository at every boundary.

**Goal:** Add a revisioned, non-destructive multi-track video project whose project clock drives preview video, subtitles, overlays and audio without final rendering.

**Architecture:** A pure `@mongolsub/video-editor` package owns source/project mapping, timeline indexes, subtitle projection and typed state transitions. Nest persists structured project rows and append-only snapshot operations; Next consumes a purpose-built DTO in a DOM/CSS hybrid compositor with a small media pool and Web Audio gains.

**Tech Stack:** TypeScript, Zod, Prisma/PostgreSQL, NestJS, React/Next, IndexedDB, HTML media, Web Audio, Vitest.

---

### Task 1: Pure timeline semantics

**Files:** `packages/video-editor/src/index.ts`, `tests/unit/video-editor.test.ts`.

- [x] Test project/source time mapping, playback rate, gaps and ordered active-item lookup.
- [x] Test split, trim, move, delete, collision rejection and linked video/audio atomicity.
- [x] Test subtitle source projection, reordered clips and partial-cut warnings.
- [x] Test image/text/blur resolution, transform bounds and audio envelope gain.
- [x] Implement the minimal renderer-independent functions and rerun focused tests.

### Task 2: Runtime contracts and additive schema

**Files:** `packages/contracts/src/video-editor.ts`, `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/202610140007_video_editor/migration.sql`, `tests/unit/video-editor-contracts.test.ts`.

- [x] Add failing contract tests for project creation, operations, bounded transforms/crop/color/audio and stale revisions.
- [x] Add explicit DTOs for project, tracks, assets, clips, overlays, timeline and operation results.
- [x] Add VideoProject, VideoTrack, ProjectAsset, VideoClip, VisualOverlay and VideoEditOperation with ownership constraints and query indexes.
- [x] Add Episode.activeVideoProjectId explicitly; keep original media and SubtitleDocument relations unchanged.

### Task 3: API and durable operation history

**Files:** `apps/api/src/video-project.service.ts`, `apps/api/src/video-project.controller.ts`, app wiring, `tests/integration/video-editor.test.ts`.

- [x] Add failing real PostgreSQL/Nest tests for initialization, explicit activation and purpose-built reads.
- [x] Test split/trim/move/delete, linked edits, optimistic 409, idempotency, undo/redo and source immutability.
- [x] Implement serializable project locking and append-only before/after snapshots.
- [x] Add controlled project-asset upload/reference and byte-range delivery using storage IDs, never browser paths.

### Task 4: Project transport and preview UI

**Files:** `apps/web/components/video-editor.tsx`, `apps/web/lib/video-editor.ts`, `apps/web/lib/video-project-pending.ts`, `apps/web/app/episodes/[id]/video-editor/page.tsx`, styles and web tests.

- [x] Test timeline windowing, snap selection, transport math and recovery queue helpers.
- [x] Implement performance.now-anchored project transport with throttled React state.
- [x] Implement two-video active/preload pool, documented drift seek threshold and black-gap behavior.
- [x] Implement DOM/CSS compositor for FIT/FILL/STRETCH, transform, crop, color, image/text and rectangular blur.
- [x] Route media through controlled URLs and Web Audio gains/fades without duplicate native audio.

### Task 5: Professional multi-track interaction

**Files:** `apps/web/components/video-editor.tsx`, `apps/web/app/globals.css`, Episode workspace navigation.

- [x] Render virtualized/windowed VIDEO, AUDIO, SUBTITLE, IMAGE, TEXT and EFFECT tracks.
- [x] Add selection, split shortcut, delete, drag move/trim with snap preview and one pointer-up operation.
- [x] Add type-specific inspector controls and direct move/resize for image and blur overlays.
- [x] Add upload/add workflows for image and background audio, track lock/hide/mute, undo/redo and saving state.
- [x] Add IndexedDB retry/discard recovery and prevent shortcuts inside inputs/contenteditable/IME.

### Task 6: Validation and continuity

**Files:** benchmark script, `docs/VIDEO_EDITOR_ARCHITECTURE.md`, `docs/PREVIEW_RENDER_PARITY.md`, ADR, validation and continuity documents.

- [x] Benchmark the required 60-minute synthetic project for index/window/resolve/edit/undo; record database persistence as functionally validated but not benchmarked.
- [x] Run additive migrations, lint, typecheck, all unit/integration tests and production builds.
- [x] Run compiled API/worker/Next and legal synthetic browser acceptance including cut playback and reload recovery.
- [x] Record measured browser/resource limits, preview/render differences and exact Phase 08 continuation boundary.
- [x] Commit implementation and continuity separately; do not merge, push, render or export.
