# ADR 0001 — Monorepo and separate processing boundary

Accepted for Phase 01, 2026-10-13 under the master specification.

Use pnpm/Turbo, Next web, Nest REST, PostgreSQL/Prisma and a separate BullMQ worker.
Shared contracts/config/domain/storage/media/queue/database packages own their
boundaries. Avoid speculative ASR/OCR/AI/UI services/packages until required.

Alternatives: an all-in-Next backend reduces initial packages but couples transport
to the editor and long jobs; all-in-Docker apps simplifies deployment but slows local
iteration. The selected structure follows the authorized stack and isolates media work.

Consequences: three app processes and two infrastructure services; explicit DTOs,
runtime parsing and process boundaries; shared TS packages are bundled for backend
production, while Prisma/BullMQ/ioredis remain dependencies.
