# Phase 04 localization pipeline

Phase 04 converts English or Chinese canonical transcript text into Mongolian
Cyrillic proposals. It never changes canonical or extraction evidence. Every result
is reproducible from a completed FusionRun, frozen context, settings, provider/model,
`localization-prompt-v1` and `localization-pipeline-v1`.

## Run creation and context

The API accepts an explicit completed FusionRun ID. The Episode's active FusionRun
is a UI convenience only; the server never substitutes the newest run. In one
transaction it creates the durable job, LocalizationRun, pending 1:1
LocalizedSegments and ordered LocalizationBatch rows. Each LocalizedSegment stores
the canonical text/timing/confidence/review/speaker/edit-revision snapshot.

The context snapshot contains only relevant Phase 04 data:

- SeriesLocalizationProfile tone, setting, style, formality and naming notes.
- Manually managed Character, aliases and relationships.
- Active glossary entries that match the bounded window, using
  CHARACTER > EPISODE > SERIES > GLOBAL for the same source term.
- Exact normalized trusted translation-memory matches. AI_SUGGESTED entries are
  excluded, and source-linked approvals must still refer to the approved revision.
- Nearby approved Mongolian lines from the same FusionRun when available.
- Explicit anonymous-speaker bindings supplied in run settings.

Default target batches contain 20 lines with five lines of read-only context before
and after. The selected context payload is limited to 24,000 characters by default
and 60,000 maximum. The builder first shrinks target count, then surrounding context;
it never truncates a line or silently drops selected memory. A separate complete
provider-request bound defaults to 48,000 characters (120,000 maximum) and measures
the system prompt, serialized batch, wrappers and REVIEW drafts immediately before
each call. Oversized draft/review requests fail explicitly and can be rerun with a
smaller batch. Only target IDs can be returned and persisted.

## Provider stages

`TranslationProvider` separates product orchestration from the initial OpenAI
Responses adapter. Server configuration selects provider, model, base URL, timeout,
output-token bound, retry count and backoff. Keys remain server-only. Disabled or
invalid configuration reports UNAVAILABLE/MISCONFIGURED while earlier phases boot.

The worker processes each batch as two explicit responsibilities:

1. **DRAFT** — preserve who did what, negation, number, name, title, relationship,
   emotional direction, clauses and outcome. STRICT stays close, NATURAL produces
   spoken Mongolian, and CINEMATIC can polish awkward source while retaining facts.
2. **REVIEW** — compare the draft with source and context, correct fidelity, perform
   the natural Mongolian editorial pass, and return typed risks and a final proposal.

Both responses use a strict runtime-validated schema. Every requested target UUID
must occur exactly once; order is ignored. Unknown, missing or duplicate IDs reject
the whole batch. Translation must contain Mongolian Cyrillic and no Chinese script.
Provider refusal, incomplete responses, invalid JSON/schema and authentication or
configuration failures are terminal. Timeout, HTTP 408/429 and server errors use
bounded exponential retry. Ordinary logs contain IDs, counts, stages and timings,
never keys, prompts, transcripts or provider bodies.

Draft output and any reported usage are checkpointed before REVIEW. A failed run
can therefore retain completed batches and draft checkpoints for an explicit resume.
It never appears COMPLETED until every batch and target is final. Cancellation is
checked between calls/batches and before final writes; it prevents new provider
calls and leaves the historical run incomplete.

## Quality and review

The model returns nullable subjective confidence and typed issues. Deterministic
checks add warnings for source transcript risk, missing numeric forms, suspicious
negation, applicable glossary or approved character-name differences, absent provider confidence and estimated
reading load. These checks are conservative review signals rather than proof of
semantic correctness. Severe NEGATION, PERSON, NUMBER, NAME, RELATIONSHIP,
MISSING_CLAUSE or INVENTED_FACT findings force LIKELY_PROBLEM. A source line already
classified LIKELY_PROBLEM stays risky even if the Mongolian is fluent.

`machineDraft` is the first provider proposal. `currentText` is the reviewed final
proposal or the user's later text. Product confidence and HIGH_CONFIDENCE /
REVIEW_RECOMMENDED / LIKELY_PROBLEM stay independent from human UNREVIEWED /
REVIEWED / APPROVED. Manual changes use `expectedRevision`; they set
MANUALLY_EDITED, preserve `machineDraft`, reset approval unless explicitly changed,
and cannot be overwritten by a rerun because reruns create new LocalizationRuns.

Approving a segment explicitly can make that exact current revision eligible for
trusted Translation Memory. It stores source and Mongolian text plus originating
localized segment and revision. Edits or review-state revocation archive that linked
entry. AI drafts never become trusted memory automatically.

## Scope boundary

The Phase 04 UI is a paginated side-by-side source/Mongolian reviewer with issue,
manual-edit and approval filters plus small series memory forms. There is no
waveform, draggable timing, timeline, split/merge, video operation, render/export or
full final-QC dashboard. Those remain Phase 05 or later.
