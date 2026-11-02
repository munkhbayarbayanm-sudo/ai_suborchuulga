# MongolSub Studio

MongolSub Studio is a Windows-capable subtitle localization and video-delivery workspace. The current branch
implements the complete Phase 01–08 pipeline: media ingest, multilingual evidence extraction, transcript fusion,
English/Chinese-to-Mongolian localization, subtitle editing, QC, non-destructive video editing, and final
render/export.

Repository continuity is authoritative. A new agent or computer must read, in order:

1. `PROJECT_STATE.md`
2. `HANDOFF.md`
3. `docs/NEXT_AGENT_HANDOFF.md`
4. `AGENTS.md`
5. `docs/MASTER_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and relevant ADRs

Do not begin Phase 09 without explicit user authorization.

## Fresh Windows checkout

Prerequisites:

- Git
- Node.js 22.12 or newer
- Corepack/pnpm 11.25.0
- PowerShell 7 or Windows PowerShell 5.1
- enough local disk for PostgreSQL, media, AI weights, and render outputs

Prefer a normal local development directory such as `C:\dev\kino`; do not synchronize `.git`, `node_modules`,
`.next`, `.tools`, `.env`, `data`, Python environments, databases, media, model weights, or render outputs through
OneDrive.

```powershell
git clone <REMOTE_URL> kino
Set-Location kino
git switch --track origin/codex/phase-08-render-export
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
powershell -ExecutionPolicy Bypass -File scripts/setup-local-windows.ps1
pnpm db:generate
```

The setup script installs ignored portable PostgreSQL/FFmpeg/FFprobe/Redis tooling and creates an ignored `.env`
from `.env.example`. Inspect local settings before starting services. It downloads pinned tools, so the first setup
requires internet access.

Start portable infrastructure in terminal 1:

```powershell
pnpm dev:local-infra
```

In terminal 2, apply the complete additive Phase 01→08 schema and start the web/API/worker applications:

```powershell
pnpm db:migrate
pnpm dev
```

Open `http://127.0.0.1:3000`; API health is `http://127.0.0.1:4000/health`. Stop owned processes with Ctrl+C.

## Optional local AI providers

Embedded subtitle extraction and the core application do not require Python AI dependencies. WhisperX/PaddleOCR
and localization-provider setup are optional and must not prevent the core application from booting. For local
extraction providers use Python 3.11 plus `uv` and follow `docs/PROVIDERS.md`. For real OpenAI localization copy
only the required values into ignored `.env`; never commit API keys. Deterministic tests do not require paid calls.

## Validation

Stop other MongolSub API/worker/web processes before integration tests; test workers use a temporary storage root
while sharing Redis. Do not flush shared Redis and do not truncate databases.

```powershell
pnpm db:migrate
pnpm db:test:migrations
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @mongolsub/web test
pnpm test:integration
pnpm build
```

See `docs/PHASE_08_VALIDATION.md` for the exact latest executed evidence and its limits. Build success is not a
production deployment claim.

## What Git deliberately does not transfer

Git contains source, migrations, lockfiles, legal fixtures, architecture decisions, and handoff documentation. It
does not contain `.env` secrets, uploaded media, local PostgreSQL/Redis state, generated outputs, downloaded AI
models, `.tools`, Python virtual environments, `node_modules`, or build artifacts. A fresh clone is therefore a
clean environment. Existing private projects/media require a separate intentional data migration; never solve
that by committing them.
