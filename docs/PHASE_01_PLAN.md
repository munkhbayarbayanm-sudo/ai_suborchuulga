# Phase 01 implementation plan

The user-approved master specification authorizes foundation and media import only.
The repository was empty on 2026-10-13. Work remains in the requested checkout on
`codex/phase-01-foundation`; there is no existing commit from which to make a worktree.

Architecture: pnpm/Turbo, Next.js/React/Tailwind web, Nest REST API, standalone BullMQ
worker, PostgreSQL/Prisma, validated contracts, streaming local storage, bounded
FFprobe process adapter. No future AI services or editor entities will be scaffolded.

1. [ ] Establish workspace/config/contracts/schema and a checked-in SQL migration.
2. [ ] Test input validation, storage containment/cleanup, and process/parser failures
   before implementing config, storage, and media adapters.
3. [ ] Implement thin controllers over a studio service; explicit DTO serialization;
   stream multipart uploads, atomic media/job records, useful error mapping.
4. [ ] Implement database-backed enqueue recovery and idempotent inspection worker;
   persist QUEUED/PROCESSING/COMPLETED/FAILED transitions and streams transactionally.
5. [ ] Implement library/series/episode/import/status/metadata in a compact dark shell.
   All future editing areas stay disabled and labelled.
6. [ ] Exercise real PostgreSQL, Redis, filesystem and FFprobe through Nest HTTP:
   create/update/read series, create/read/update episode, import synthetic video,
   wait for completion and check persisted streams; import invalid media and verify
   failure. Verify oversize/malformed uploads and missing tool behavior.
7. [ ] Run lint/typecheck/unit/integration/build, inspect UI and scope, commit logical
   changes, update continuity docs and give the required evidence report.

Validation commands: `pnpm test`, `pnpm test:integration`, `pnpm lint`,
`pnpm typecheck`, `pnpm build`. Integration must fail when infrastructure is absent;
it must not silently skip or substitute mocks. Generated fixtures stay ignored.

Design: audience = localization editors; primary action = import episode video;
tone = utilitarian editing software. Dark neutral surfaces, amber accent, compact
navigation, table rows, persistent metadata inspector; no decorative gradients.
Future source provenance, editing revisions, and providers remain roadmap concepts.
