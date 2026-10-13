# MongolSub Studio — project state

Updated 2026-10-13, Asia/Ulaanbaatar.

| Field | State |
|---|---|
| Current phase | Phase 01: foundation + media import |
| Last authorized phase | Phase 01 only |
| Last completed phase | Phase 01 implementation and local validation |
| Active branch | `codex/phase-01-foundation` |
| Latest implementation commit | `972641bc773628e879304de9922abc76784bfb4d` |
| Latest approved commit | None explicitly reviewed/approved by the user yet |
| Initial repository | Empty Git repository, no commits, no user files |
| Integration/deployment status | Local real-service validation passed; Docker Compose host startup unverified; no remote deployment |

## Implementation and completed milestones

pnpm/Turbo monorepo; Next web, Nest API, separate BullMQ worker; strict validated
contracts/config; Prisma PostgreSQL schema + checked-in migration for five required
entities; streaming local StorageProvider; original media preservation; bounded
FFprobe process and typed parser; transactionally persisted metadata/streams/job
results; durable dispatch, failed-transport reconciliation and bounded shutdown;
Series/Episode create/read/update; actual import/status/metadata UI and disabled
future editor areas; synthetic fixture; tests; ADRs and continuity docs.

Fresh evidence: 38 unit/web tests, 9 real integration tests, lint, typecheck (all
packages plus tooling), three production builds. Actual root `pnpm dev` startup,
shared storage and live success/failure smoke passed. Compiled API/worker and Next
production server also passed live smoke. Browser create/edit/import/poll/reload,
invalid-media error and 320/375/414/768/desktop layouts were verified.

No Phase 02 code was started. No ASR/OCR/translation/source extraction, memory,
subtitle/video editor, waveform, render/export or QC functionality/schema exists.

## Open tasks and known limitations

No remaining Phase 01 implementation task. Docker Desktop on this host has a
pre-existing inaccessible `dockerInference` runtime socket and does not start its
Linux engine. Preferred Compose startup is supplied but unverified here. Verified
Windows portable fallback is documented; its pinned FFprobe4.0.2 is old and should
be replaced with current supported tools before processing real untrusted media.

This is a trusted local-user foundation: no auth/roles, no S3, no API deletion/cancel
or manual retry UI, no server video playback. Re-import is the retry path. Lists are
bounded for development, not paginated production libraries. Multi-gigabyte limits
are configured but performance/load/large episode benchmarking was not performed.
No real user/copyrighted video, Linux platform or external deployment was tested.

## Technical and product risks

Filesystem/database crash window may leave orphan files. Redis loss after a job is
PROCESSING without a retained transport record needs later recovery policy; do not
blindly reset/delete jobs. Single heartbeat is adequate for one local worker, not
distributed fleet health. Windows development Ctrl+C stops its own child process
tree; an interrupted active inspection relies on BullMQ stalled recovery. Advanced
retry/resume/lifecycle cleanup and production hardening stay deferred to Phase10.

Future AI quality/confidence/localization claims remain unproven. Manual approvals,
source provenance, series/character memory and non-destructive edit histories need
separate future entities and must never mutate original media or silently replace
human-approved text.

## Runtime handoff

All app/infrastructure processes started for verification were stopped. Ports
3000/4000/56432/56379 were released. Existing unrelated PostgreSQL9220 on55432 was
preserved. Ignored `.env`, `.tools/`, `data/` and browser evidence remain locally.
Portable PostgreSQL/Redis data persist under `data/portable-*`; fixture under
`data/fixtures/`; live smoke IDs under `data/runtime-smoke.json`.

## Exact continuation point

Read this file, HANDOFF and validation evidence; inspect Git status/history. Review
Phase01 results and choose startup prerequisites. Await explicit Phase02 approval.
If approved, begin a Phase02 extraction design from existing MediaAsset/MediaStream
and job/storage/media boundaries, specify source candidates with provenance,
language decisions and provider interfaces, then implement extraction only within
the new approved scope. Do not start those systems from this Phase01 handoff.

Source of truth: `docs/MASTER_SPEC.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`,
`docs/DOMAIN_MODEL.md`, `docs/adr/`, `docs/VALIDATION.md`, `HANDOFF.md`, `AGENTS.md`.

Do not change phase authorization, stack/worker/storage boundaries, original-media
immutability, strict validation, secret hygiene, branch/merge constraints or future
manual-edit priority without explicit user approval.
