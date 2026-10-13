# MongolSub Studio

Phase 02: a local studio for organizing Series/Episodes, importing original video,
and extracting independent embedded subtitle, WhisperX ASR and PaddleOCR evidence.
Translation, cross-source fusion and editing remain deferred.

## Prerequisites

Node.js >=22.12, pnpm 11.25, Docker Desktop/Engine, FFmpeg and FFprobe on PATH.
PostgreSQL must use UTF-8. API/worker run outside Docker. This foundation is intended
for one trusted local user; it has no authentication and binds to loopback by default.

## Run

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d --wait
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open http://127.0.0.1:3000. API is http://127.0.0.1:4000; `/health` reports database,
Redis, FFmpeg, FFprobe and worker heartbeat separately. Stop `pnpm dev` with Ctrl+C.
`docker compose stop` preserves infrastructure data. Do not use `down -v` on needed data.

The root `.env` is loaded by `pnpm dev`, migrations, fixtures and integration tests.
Set absolute `STORAGE_ROOT`, `FFMPEG_PATH` and `FFPROBE_PATH` where appropriate.
Config is validated on startup without printing secret values. Public web settings
are baked into production builds; `NEXT_PUBLIC_API_URL` is a public URL, never a secret.
Both localhost and 127.0.0.1 origins are accepted when `WEB_ORIGIN` is loopback.

The development runner resolves `STORAGE_ROOT` before Turbo changes each app's
working directory, so API and worker share the same media directory.

## Optional Windows fallback when Docker cannot start

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-local-windows.ps1
pnpm dev:local-infra
# Leave infrastructure running; in another terminal:
pnpm db:generate
pnpm db:migrate
pnpm dev
```

This installs portable tools only under ignored `.tools/` and persists UTF-8
PostgreSQL and Redis data under ignored `data/`. Redis's release archive hash is
verified before extraction. Stop infrastructure with Ctrl+C. Ports must be free;
the runner refuses to reuse another project's service. The pinned portable FFprobe
is old (4.0.2) and was used for synthetic verification; install current supported
FFmpeg/FFprobe for real media and configure their paths. Docker Compose remains
the preferred infrastructure setup. No Docker settings or user databases are reset.

## Validate

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm fixture
```

Integration uses real PostgreSQL, Redis/BullMQ, filesystem, HTTP and media tools.
Run it against a dedicated development database **with other MongolSub workers stopped**:
tests create their own worker and temporary media root. Test records/files are cleaned
up; no global database or Redis flush is performed. Infrastructure failures fail the suite.

The generated `data/fixtures/synthetic.mkv` is two seconds, 320×180, with audio and
an embedded synthetic English subtitle stream. It is ignored by Git.

With all three apps running, `pnpm test:smoke` verifies the live API/worker success
and failure flow and leaves a clearly labelled synthetic verification Series/Episode
for inspection. Its IDs are saved in ignored `data/runtime-smoke.json`.

To exercise production artifacts after building, load `.env` when starting the API
and worker (`pnpm exec dotenv -e .env -- node apps/api/dist/main.js`, similarly
`apps/worker/dist/main.js`). Start web with `pnpm --filter @mongolsub/web exec next start --hostname 127.0.0.1`.

## Workflow

1. Create a Series; choose `en`, `zh-CN`, `zh-TW` or another language identifier.
2. Open it, create an Episode; numbering is optional.
3. Open Episode, import one local video. Upload progress measures transfer; success
   is shown only after storage and database commit.
4. Worker picks the durable job, runs FFprobe, and saves streams and metadata together.
5. Inspect status, duration, resolution, container, size, codecs and stream languages.
6. Import a damaged video to inspect the persisted failure message. The studio remains usable.

Video preview, subtitle/timeline editing and export are clearly disabled future areas.

Read [PROJECT_STATE.md](PROJECT_STATE.md), [HANDOFF.md](HANDOFF.md),
[architecture](docs/ARCHITECTURE.md) and [validation evidence](docs/VALIDATION.md)
before continuing. Phase 03 requires new explicit authorization.

## Source extraction

After inspection select subtitle/audio streams in Episode Detail. Extract embedded
text, transcribe Auto/English/Chinese audio, or OCR English/Simplified/Traditional
burned text. Results remain separate, with paginated segments and read-only provenance.
Default identical requests reuse a run; Run again creates an intentional revision.
Cancellation is cooperative; source evidence is saved atomically.

The core app works without Python. For actual optional providers follow
[PROVIDERS.md](docs/PROVIDERS.md), install the locked uv Python3.11 extras, set the
same private token in ignored .env, then run `pnpm dev:providers` in another terminal.
CPU is default; no NVIDIA GPU or HF token is needed for basic ASR. Real model weights
may download on first extraction. Readiness distinguishes dependency/model absence.

`pnpm fixture:sources` generates legal multilingual embedded tracks with tone audio.
`pnpm test:smoke:sources` explicitly requires real providers plus prepared synthetic
speech/images and verifies compiled worker persistence. See VALIDATION for actual
executed evidence and limits; tone fixtures/fake CI providers are not ASR validation.
