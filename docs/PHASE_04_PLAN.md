# Phase 04 Mongolian localization implementation plan

> Agentic workflow: subagent-driven-development, sequential implementation agents,
> spec review then quality review; TDD at external/domain boundaries.

Goal: English/Chinese canonical evidence to inspectable Mongolian Cyrillic proposals,
with bounded context, fidelity/editorial review, explicit memory and protected edits.
Architecture: retain Next/Nest/Prisma/PostgreSQL/BullMQ separate worker; additive schema,
pure localization package and real configurable OpenAI Responses adapter. No Phase05.
Baseline a195a3f31a1f2ad177394ec2b390802175e0896a; branch
codex/phase-04-mongolian-localization is created directly from it. User authorizes
implementation, validation, final commits and STOP. No merge/push/deployment.

## Decisions

1. LocalizationRun references exact completed FusionRun. Enqueue freezes canonical
   current text/timing/confidence/review/revision/speaker in 1:1 LocalizedSegments;
   original canonical/source records never change. All context memory is snapshotted.
2. Mode STRICT/NATURAL/CINEMATIC, target mn, source en/zh. Provider/model/config server-only.
   Provider disabled/missing key/model leaves core boot and earlier phases functional.
3. LocalizationBatch checkpoints draft and final completion. Two calls per bounded batch:
   DRAFT localization, REVIEW final fidelity + Mongolian editorial/consistency. Draft
   stored before review permits resume without repeating successful draft calls. Only
   exact target UUIDs accepted once; reordered outputs map by ID. Invalid/refused/schema
   output is not retried blindly. Transient429/5xx/timeouts have bounded backoff.
4. Context targets default20, prior/following5 lines each, character budget/token estimate
   bound; shrink targets when necessary, reject oversized unrepresentable lines. Memory
   selection uses explicit speaker→character bindings and lexical references, glossary
   scope CHARACTER>EPISODE>SERIES>GLOBAL, exact normalized trusted TM. No inferred canon.
5. Server validates memory ownership/scopes. Character+aliases+free relationship type,
   editable SeriesLocalizationProfile, glossary ACTIVE/ARCHIVED, TM trusted approvals.
   Approval creates deduplicated TM provenance; later edit/revocation invalidates that
   originating approval. Raw AI output never automatically becomes trusted memory.
6. Quality uses source risk, provider final fidelity flags, deterministic number/negation,
   Cyrillic/script and applicable glossary/name checks. Severe semantic flags force
   LIKELY_PROBLEM; low-quality source cannot become silently HIGH. Typed concise reasons,
   alternative only for risky lines, character count/reading load (no timing changes).
7. LocalizedSegment has nullable machineDraft/currentText until batch completion;
   source snapshot is immutable. AI_GENERATED or AI_REVISED reflects editorial changes,
   MANUALLY_EDITED on explicit edits. Human state separate. expectedRevision→409.
8. Default identity hashes exact source+memory/config/settings versions; caller rerun UUID
   creates independent history. Unique(run,transcript) prevents duplicate batch results.
   Explicit Episode activeLocalizationRunId; completing/newest never auto-activates.
9. Partial FAILED/CANCELLED run may expose explicitly labelled completed batch rows;
   never reports COMPLETED. Resume only FAILED, completed batches skipped, staged draft
   reused, same immutable snapshots/provider configuration enforced. Cancellation stops
   future calls and races final writes through existing job-row locking.
10. Per-line AI rewrite proposals are optional and deferred to Phase05. No waveform,
    timeline/split/merge, video editing/render/export or full QC product is implemented.

## Tasks and validation

- [ ] Contracts/pure provider package: localization.ts and memory.ts Zod contracts,
      context.ts, quality.ts, prompts.ts, provider.ts, batching.ts. Tests first for
      exact ID mapping, three modes, bounded surrounding context, memory scopes/trust,
      negation/number/name/relationship/clause/invention flags and source risk propagation.
      Real adapter POST /v1/responses, strict JSON schema, refusal/incomplete handling,
      input/output/cached usage when exposed, timeout/body limits and safe diagnostics.
- [ ] Additive schema/migration: Profile, Character/Alias/Relationship, GlossaryEntry,
      TranslationMemoryEntry, LocalizationRun/Batch/LocalizedSegment; same-episode/fusion
      ownership, deferred cascade-safe cross references, uniqueness/actual query indexes.
      Extend LOCALIZE_TRANSCRIPT job, Config/env/Turbo server-only provider settings.
- [ ] API/memory services/DTOs: explicit validated creation/read/pagination/edit/approve,
      run activate/cancel/resume, profile/characters/relationships/glossary/TM management.
      Integration first: real PostgreSQL/Nest/queue with deterministic test-only provider,
      source untouched, idempotency, stale edits, partial retry/resume, cancellation,
      invalid IDs, trusted TM and scope isolation.
- [ ] Worker: two-stage bounded batch orchestration, draft checkpoint, atomic final batch
      row persistence and usage ledger, durable progress/states, cancellation and failure
      codes; no transcript/key logging, no production fake provider.
- [ ] Web: Series context controls, Episode selected fusion (prefer explicit active only),
      readiness/mode/start/run history, paginated SOURCE|MONGOLIAN review, risk/manual/
      approved filters, quick optimistic edit/approve, explicit activation/resume/cancel.
      Web helper tests before implementation; no unbounded lists/debug JSON defaults.
- [ ] Synthetic English/Chinese corpus and deterministic500/1200-row benchmark measuring
      context/orchestration/actual persistence separately. Label fake-provider throughput.
      Real tiny original-corpus smoke only if credentials exist; readiness always checked.
- [ ] Migrate existing and fresh schema; lint/unit/integration/web/build/typecheck
      (build/typecheck sequentially, production servers stopped before rebuild); compiled
      runtime and actual browser. Preserve unrelated services, no Redis flush/truncate.
- [ ] Spec review, resolve/re-review, quality review, resolve/re-review. Update PROJECT_STATE,
      HANDOFF/AGENTS/architecture/domain/roadmap/validation/PHASE_04_VALIDATION/pipeline/ADR.
      Commit implementation and continuity hash, clean status, stop owned services, STOP.

Test examples:

```ts
expect(validateTargetIds([a,b], [{segmentId:b},{segmentId:a}])).toBeDefined();
expect(() => validateTargetIds([a,b], [{segmentId:a},{segmentId:a}])).toThrow();
// Source "I won't return", final "Би буцаж ирнэ" -> severe meaning risk.
// Source LIKELY_PROBLEM, fluent translation -> never silent HIGH_CONFIDENCE.
// Approve→TM trusted; edit expectedRevision→machineDraft unchanged, old TM invalidated.
```

No model keys found in current process/local env; adapter/readiness/fixture coverage
must be reported independently of real English/Chinese LLM execution.
