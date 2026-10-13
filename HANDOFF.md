# Phase 02 handoff

Read PROJECT_STATE.md first. Active branch is `codex/phase-02-source-extraction`,
based directly on approved Phase 01 `acb3eaad4e2febb3eb747e287775eebfafc08ee8`.
Implementation: `28a4f0dbad76067be2f3cf72ade8e6394186ca4a`.
Inspect `git status` and `git log -3` for the final continuity HEAD.
No merge, push, deployment, Phase 03 or translation is authorized/performed.

## Start this Windows checkout

Private .env and ignored portable tools exist locally. In separate terminals:

```powershell
pnpm dev:local-infra
# Wait for PostgreSQL56432 and Redis56379; preserve unrelated55432.
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open http://127.0.0.1:3000. Core app boots without Python; embedded extraction
remains available. Stop apps and portable infrastructure with Ctrl+C. Root dev
runner resolves shared absolute storage/work roots before Turbo changes directories.
Final verification processes are stopped; data persists.

For actual optional inference install uv/Python 3.11, then:

```powershell
uv sync --project services/providers --locked --extra asr --extra ocr
# Set private EXTRACTION_PROVIDER_TOKEN identically in ignored .env.
pnpm dev:providers
```

See docs/PROVIDERS.md before setup. The bootstrap loads .env, resolves absolute
storage/work/model roots and launches the locked installed environment with
--no-sync. It binds authenticated loopback8765. CPU is default. Model downloads
occur only when actual extraction is requested. Existing ASR/alignment caches
are under ignored data/provider-smoke/models and Paddle cache under .paddlex.
No HF token is required for basic ASR or alignment; gated diarization is optional.

Fresh checkouts should follow README/PROVIDERS; current FFmpeg/ffprobe recommended.
Docker Compose remains preferred but this host's pre-existing Docker engine failure
was not repaired or bypassed by changing Docker settings.

## Manual workflow

1. Create/open a Series and Episode; import media, wait for inspection READY.
2. Select the media. Inspect subtitle/audio index, title, language, codec/channels.
3. Select supported embedded text tracks, extract. PGS/VobSub codecs are unavailable.
4. Select an audio stream, Auto/English/Chinese hint and optional alignment/diarization.
5. OCR: English/Simplified/Traditional hint, bottom/full frame,4 fps default,
   lower40% default, confidence threshold. This is an initial sampled OCR baseline.
6. Observe queued/processing/completed/failed/cancelled per independent run.
7. Select a run and a segment; inspect provider/version/model/media/stream/language,
   confidence, words, speaker and scoped metadata. Use pagination for long results.
8. Ordinary repeated requests reuse their run; Run again creates a UUID revision.
   Repeated transport attempts for that UUID reuse the same revision.
9. Stop providers to verify unavailable ASR/OCR and continued embedded/core readiness.

`pnpm fixture:sources` creates legal3 second media: video, two tone audio tracks,
English SRT, Simplified ASS and Traditional SRT. Tone audio is NOT speech ASR evidence.
`pnpm test:smoke:sources` is explicit REAL-provider smoke requiring synthetic
SAPI WAV and3drawn image assets prepared under data/provider-smoke. It generates
legal7 second burned-subtitle videos, imports them and persists actual provider runs.
Its IDs/results stay in ignored data/phase02-runtime-smoke.json. Do not commit media.

## Validation / recovery boundaries

Stop all other MongolSub workers before integration tests: the suite owns a
temporary storage root while using real PostgreSQL/Redis. Never flush shared Redis
or truncate databases. It cleans only test Series and owned temporary files.

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm db:migrate
uv run --directory services/providers --locked --no-sync pytest -q
uv run --directory services/providers --locked --no-sync ruff check .
uv run --directory services/providers --locked --no-sync ruff format --check .
```

For compiled runtime, start .env-loaded `node apps/api/dist/main.js` and
`node apps/worker/dist/main.js` from the root; run
`pnpm --filter @mongolsub/web exec next start --hostname 127.0.0.1`.
Configured roots must be the same physical directories as the provider.
See docs/VALIDATION.md for real versus injected-provider results.

Failure codes distinguish dependency/model absence, OOM, timeout, provider drift,
invalid output/media and cancellation. No expensive automatic retry is used;
intentional reruns are explicit. Transient inference failures do not permanently
disable readiness. Dependency/model startup failures require configuration/restart.
Cancelled evidence cannot persist after the database cancellation lock wins.
Temporary media is removed after normal completion/failure/cancellation. Crashes
still need a future carefully scoped reconciliation policy.

## Exact future continuation point

Await explicit Phase 03 authorization. Then define cross-source temporal alignment,
candidate reconciliation and consensus schema/service/contracts against the existing
independent runs/segments/word timing; preserve all immutable source provenance.
Do not claim Chinese speech/GPU/diarization/long-media validation from existing tests.
Do not introduce translation/editor/render features without their separate approvals.

Required reads: PROJECT_STATE, HANDOFF, AGENTS, docs/MASTER_SPEC,
ARCHITECTURE, ROADMAP, DOMAIN_MODEL, PROVIDERS, VALIDATION and docs/adr/*.
