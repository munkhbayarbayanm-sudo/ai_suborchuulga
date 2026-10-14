# Validation evidence

Current Phase04 evidence: [PHASE_04_VALIDATION.md](PHASE_04_VALIDATION.md).
Phase03 historical evidence: [PHASE_03_VALIDATION.md](PHASE_03_VALIDATION.md).
Phase02 historical evidence: [PHASE_02_VALIDATION.md](PHASE_02_VALIDATION.md).
These distinguish deterministic localization/fusion and injected provider fixtures from
historical actual CPU extraction inference, real paid-provider execution, compiled runtime,
browser checks and unverified environment gates.
Phase03 implementation commit: `b1a3b90162c6b77a6e1aee37f85c2f8c1c586f3a`.
Phase04 was based directly on approved Phase03 `a195a3f31a1f2ad177394ec2b390802175e0896a`.
Current HEAD after handoff is the final continuity commit; inspect `git log -2`.

# Historical Phase 01 validation — 2026-10-13 (Asia/Ulaanbaatar)

## Executed automated checks

| Command | Result | Evidence scope |
|---|---|---|
| `pnpm install` | exit 0 | locked pnpm workspace, allowlisted builds |
| `pnpm db:generate` | exit 0 | Prisma Client 6.19.0 |
| `pnpm db:migrate` | exit 0 | initial SQL applied to two isolated UTF-8 test clusters |
| `pnpm fixture` | exit 0 | generated video/audio/embedded subtitle, no copyrighted media |
| `pnpm test` | 38/38, 7 files, exit 0 | contracts/config/storage/probe/process/diagnostics/upload/web API |
| `pnpm test:integration` | 9/9, exit 0 | real Nest HTTP/PostgreSQL/Redis/BullMQ/filesystem/media tools |
| `pnpm lint` | exit 0 | ESLint, no errors |
| `pnpm typecheck` | exit 0 | 10 packages plus scripts/tests/config tooling |
| `pnpm build` | 3 app builds, exit 0 | Next production routes + API/worker ESM |
| `pnpm dev:local-infra` | ready | checked-in portable runner started PostgreSQL and Redis |
| `pnpm dev` + `pnpm test:smoke` | passed | all three app processes, shared storage root, live success/failure |

Final integration cases: Series create/read/update/input errors; Episode create/read/update;
Unicode video filename; original byte preservation; COMPLETED with timestamps and
metadata + VIDEO/AUDIO/SUBTITLE persistence; invalid video FAILED with useful error;
empty/oversize/extra-file/non-multipart rejection; readiness; missing FFprobe final
failure; malformed JSON public error; failed transport reconciliation; bounded
shutdown after a TCP proxy disconnects real Redis. These are nine grouped tests.

Unit HTTP regression reproduces storage-open failure on a 100KB upload and malformed
rejected-file handling. It verifies a prompt useful error and continued process life.
Expected invalid-media/missing-tool/outage logs are intentional failure-test output.

## Runtime/build and browser checks

Compiled API and worker were started using `node apps/*/dist/main.js` with `.env`;
API listened on 4000 and worker reported ready. An earlier bundled Prisma runtime
failure was reproduced and fixed by keeping Prisma/BullMQ/ioredis external with
explicit runtime dependencies. Source tests alone were not used to assert startup.

The actual root development command was exercised. Turbo's strict environment
filtering and per-app working directories were verified and fixed with explicit
environment forwarding and an absolute shared storage root. Live smoke persisted
a 320×180, 2021ms video with three streams and a second failed-media job. Public web
returned HTTP200 and readiness reported all components ready.

The latest compiled API/worker plus `next start` also passed the full live smoke
after final fixes. Windows development shutdown was verified after fixing Ctrl+C
handling in nested command shims: runner exited0, all app ports released. Production
apps and portable infrastructure were stopped afterward; only unrelated PostgreSQL
on55432 remained listening.

Browser verification used the real UI to create and edit Series and Episode, select
a local synthetic file, upload, observe QUEUED → COMPLETED, inspect three streams,
and reload without losing data. Invalid video showed FAILED/INVALID_MEDIA and an
understandable message. Screenshots and viewport measurements are ignored local
artifacts under `apps/web/test-results/`, including desktop and failure images.
320/375/414/768px and desktop were inspected for clipped controls/horizontal overflow.
Mobile keeps the actual inspector above disabled future preview areas.

## Environment and unverified gates

Executed on Windows, Node24.15.0, pnpm11.25.0, Next16.4.0, Prisma6.19.0, portable
PostgreSQL18.4 (package18.4.0-beta.17), Redis8.10.2, FFmpeg6.1.1 and FFprobe4.0.2.
Portable binaries are ignored; the Redis archive SHA256 matched its release checksum.
The pinned portable FFprobe is old; current supported tools must be used for real
untrusted media/production. No production security or performance certification.

Docker Desktop's Linux engine did not start. Host logs show a pre-existing
`dockerInference` runtime-socket failure (Windows cannot access the object). Restart
did not repair it; no factory reset, Docker settings edits or user database deletion
were performed. An attempted socket rename failed and did not alter it. Docker
Compose configuration is supplied; its execution on this host remains unverified.
Real PostgreSQL and Redis were instead verified through isolated portable processes.
The existing PostgreSQL process on55432 was preserved; MongolSub uses56432/56379.

The normal Compose path, Linux runtime, external deployment, large episode performance,
real copyrighted/user footage, authentication, S3 and later AI/editor functionality
remain unverified or deferred. Reviewers approved Phase01 spec and code scope.

## Fixes found during validation

Multipart part-limit false rejection; UTF-8 cluster initialization for Chinese filenames;
ESM runtime dependency bundling; loopback API/CORS resolution; shared development
storage root and environment filtering; upload storage failure hang and rejected-stream
crash; persisted terminal queue failure reconciliation; Redis-outage shutdown bounds;
safe developer diagnostics; aligned `.m2ts` upload formats.
