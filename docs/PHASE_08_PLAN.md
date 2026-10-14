# Phase 08 implementation plan

1. Add render contracts, pure compiler, subtitle projection/export and deterministic tests.
2. Add additive Prisma models/migration for requests, immutable snapshots, render jobs and outputs.
3. Add API submission/history/status/cancel/output-content endpoints with snapshot creation and idempotency.
4. Add worker compilation, safe file-based FFmpeg execution, progress parsing, cancellation, validation,
   checksums, controlled storage promotion and cleanup.
5. Add Export UI with revision/QC warnings, presets, progress/history, cancellation and downloads.
6. Add legal synthetic integration/parity fixtures, long-project benchmark and failure/cancellation tests.
7. Run migrations, lint, typecheck, unit/web/integration tests, production builds, compiled runtime and
   browser acceptance. Record only executed evidence.
8. Update architecture/domain/roadmap/parity/validation/handoff continuity, commit, and stop before Phase 09.
