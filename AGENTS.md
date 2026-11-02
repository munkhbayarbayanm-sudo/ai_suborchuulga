# Agent instructions

Read `PROJECT_STATE.md` first, then `HANDOFF.md`. Inspect `git status`, branch and
history before edits. Treat repository documents as continuity authority; do not
depend on chat history. Read `docs/MASTER_SPEC.md`, `docs/ARCHITECTURE.md`,
`docs/ROADMAP.md` and relevant ADRs before changing architecture.

Phases 01 through 08 have been authorized and implemented. Stop after Phase 08; do not begin Phase 09,
natural-language editing or another phase without explicit user authorization. Do not silently replace Nest, Next, Prisma/PostgreSQL, BullMQ,
the storage boundary, or the separate-worker model. Original media is immutable.
Never put filesystem paths into public contracts or media blobs into PostgreSQL.
Never buffer entire video uploads or use shell strings for media invocations.

Phase 03 source evidence is immutable. Canonical edits affect derived transcript
records only. Keep human approval independent from reconciliation confidence;
reruns preserve old manual results, and changing the active run is explicit.
Do not compare English/Chinese text across languages in fusion. Phase04 localization
is separate derived data; canonical/source records remain unchanged. Never overwrite
manual localization with AI, automatically approve AI or invent permanent series canon.
Phase05 subtitle documents are another derived layer. Editor operations must not mutate
localization/canonical/source records. Preserve cue provenance, append-only history,
explicit activation and optimistic conflicts. AI rewrite remains a proposal until accepted.
Phase06 QC is revision-bound derived evidence. QC never edits cues directly; accepted suggestions
must use EditorOperation. Deterministic QC remains usable when optional AI is unavailable.
Phase07 video projects are non-destructive metadata. Project time is authoritative; clips map
project time to immutable source media ranges. Preserve explicit active-project selection,
append-only VideoEditOperation history, linked A/V behavior and SubtitleDocument references.
Phase08 render/export is immutable and revision-bound. Never rewrite historical RenderSnapshots,
RenderJobs or RenderOutputs; never pass browser paths or free-form shell input into FFmpeg.
Do not add natural-language video commands or begin Phase 09 proposal work.

Preserve existing user work and services. Use `codex/` branches, never merge to main
without authorization. Do not commit `.env`, credentials, tools, uploaded media,
copyrighted fixtures or generated builds. `.env.example` contains local-only examples.

Write strict TypeScript with runtime validation at external boundaries. Keep
controllers and React views thin; business/media processing lives in services and
packages. Never scaffold fake AI providers or fake editing functions.

Run lint, typecheck, unit tests, real integration tests and production build for
meaningful code changes. Stop other MongolSub workers before integration: its
worker uses a temporary storage root. Do not flush shared Redis or truncate databases.
Run compiled artifacts when build/runtime boundaries change. Report executed evidence
separately from unverified deployment or environment setup.

Update PROJECT_STATE/HANDOFF/VALIDATION after work. Record scope, limitations,
branch/commits, exact continuation point and any prerequisite failures.
