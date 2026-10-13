# Deterministic transcript fusion v1

`packages/fusion` derives a transcript from explicitly selected immutable source
segments. It does not call an AI model, edit source evidence, translate text or
identify people. All source records, words, original text and provenance remain
inspectable. Output text is one existing segment or an ordered same-run bundle
joined with newlines. It never generates prose.

## Runtime boundary and language

`fusion-v1` validates settings and evidence, word containment/order, identities,
run ownership and integer millisecond timing. It accepts at most 12 runs and
50,000 segments. Invalid input fails with `FUSION_INVALID_INPUT`; absence of
requested-language evidence fails with `FUSION_LANGUAGE_UNAVAILABLE`. Defaults
for missing word arrays are applied on a copy; original source text is retained.

Language families use explicit tags: en/eng/en-* and zh/chi/zho/zh-*; unknown tags
remain unknown. AUTO aggregates coverage (55%), segment count (20%), provider
confidence (15%) and independent method richness (10%). Each feature is normalized
against the greater family total. Per family and method, only the strongest run
summary counts: duration, then count, then mean confidence resolve selection.
Missing confidence contributes 0.5 to AUTO. Equal scores use declared language,
then stable English fallback. Unsupported/unknown evidence never triggers a guess
from the text of one arbitrary segment. The explanation and scores are returned.

Simplified/Traditional Chinese share the zh family. V1 deliberately has no script
conversion dependency. `为什么` and `為什麼` remain unchanged; their lexical
disagreement is retained and the review explanation states the script limitation.
This is not a Chinese semantic-equivalence guarantee.

## Ordered alignment

Sort by start, end, run ID, sequence and segment ID. Take the earliest unconsumed
canonical-language segment as seed. Search only its temporal/index neighborhood.
Choose the widest eligible canonical cue from another run as a fixed reference,
and gather bounded same-run bundles relative to that reference. A group never
expands recursively through a transitive overlap chain. Every segment is consumed
at most once; remaining canonical-language cues form subsequent groups. Cues of
the reference's own run are not pulled in as adjacent split evidence.

Defaults are configurable and provisional:

| Rule | Default |
|---|---:|
| Intersection over temporal union | >= 0.20 |
| Intersection over smaller duration | >= 0.60 |
| Maximum center distance | 1,500 ms |
| Maximum near gap | 250 ms |
| Maximum group span | 10,000 ms |
| Maximum segments per extraction run in a group | 4 |
| Maximum candidate window | 64 |

A non-overlap near gap also requires same-language normalized text agreement;
this prevents an adjacent different cue from being consumed merely because its
gap is small. If a run already has overlapping evidence, its next near-gap cue
is excluded even when the text repeats. Cross-language/unknown evidence requires
real temporal overlap.
The index neighborhood is capped at the configured candidate limit on each side
of the seed, even when thousands of cues occupy the same instant. Candidate/run/
span limits are reported and prevent high-confidence classification. Original
unusually long cues survive as conservative singleton evidence.

Alignment is O(N log N + N W), with W capped by settings rather than episode
length. Reconciliation compares at most 12 run candidates per group. No whole
episode all-pairs or edit-distance dynamic-programming matrix is used. Sorting,
runtime validation and coverage calculation are linear/log-linear in N. Memory
is O(N + output evidence), plus bounded group/text comparison structures.

## Text election and explainable confidence

Comparison applies Unicode NFKC, case folding, whitespace removal and a limited
punctuation set only to comparison copies. Character-bigram multiset Dice scores
allow punctuation/casing and bounded split/merge text agreement without altering
the chosen source. Agreement defaults to >= 0.88, conflict to < 0.65. English
negation mismatches (`will` versus `won’t`, `not`, `never`, `cannot`, etc.) force
the comparison below the conflict threshold. This lexical guard does not solve
general semantics, paraphrases, names or mistranscription.

Each candidate receives support equal to the sum of the strongest agreeing
candidate quality per independent method. Repeated ASR/OCR/embedded runs cannot
create independent votes. Support, then candidate quality, then embedded/ASR/OCR
method order, then run ID deterministically select one existing text candidate.
The method reliability defaults are embedded 0.75, ASR 0.75 and OCR 0.65.
These are configurable initial heuristics, never calibrated probabilities.

| Score factor | Formula |
|---|---|
| Base quality | method reliability * (0.5 + 0.5 * mean provider confidence); missing confidence = 0.5 |
| Agreement bonus | 0.30 for the first additional independent agreeing method, plus 0.18 for the next, capped at 0.36 |
| Conflict penalty | 0.22 per conflicting method, maximum 0.44; 0.08 for inconclusive alternatives when no explicit conflict exists |
| Timing penalty | excess spread above configured 700 ms tolerance / 5,000, maximum 0.20 |
| Segmentation penalty | 0.02 per extra segment in the largest bundle, maximum 0.12, plus 0.08 if a bound was reached |
| Cross-language bonus | 0; cross-language text never contributes a vote |

Clamp base + agreement - conflict - timing - segmentation to [0,1]. Single-method,
bounded, approximately agreeing text that still differs after normalization, and
unresolved-alternative groups are capped below the configured high
threshold. Defaults classify >=0.85 HIGH_CONFIDENCE, <0.50 LIKELY_PROBLEM, otherwise
REVIEW_RECOMMENDED. Every output carries factors, support methods, conflict count,
timing spread, bundle sizes, missing-confidence/speaker uncertainty and messages.
Algorithm confidence is separate from human review/approval state.

Approximate Dice agreement helps candidate selection but cannot establish exact
agreement. An extra/omitted word such as `today` remains visible in alternatives
and explicitly requires review, even when similarity exceeds 0.88. Case,
punctuation and split-bundle line-break differences that normalize identically
can still establish high confidence.

The first independent agreement receives the larger bonus deliberately: the
required simple embedded/ASR `Hello` agreement classifies HIGH_CONFIDENCE with
default settings even when both providers return null confidence (0.5625 base +
0.30 agreement = 0.8625). Null source confidence remains null in immutable evidence
and the result explicitly says this score is not calibrated correctness. A single
method cannot earn the agreement bonus; conflicts and uncertainty still subtract
their stated factors and remain reviewable. The third-method bonus has diminishing
effect due to the cap. These constants are versioned product heuristics, not an
accuracy estimate or a permanent guarantee; changing them requires a new algorithm
version and validation against representative data.

Comparisons read at most 2,000 characters by default, configurable to 5,000.
Longer text is explicitly bounded, cannot establish agreement from an untested
tail and cannot become high-confidence. Full original text still appears in the
derived candidate/evidence. V1 does not silently trust equal truncated prefixes.

## Timing, speakers and coverage

Timing uses observed words from an agreeing ASR representative only when every
bundle segment has words, every word has known timing, the complete normalized
word text exactly covers both the full ASR candidate and the selected canonical
text, and the aggregate word
bounds have positive duration. Partial/incomplete text or zero-duration word
alignment stays evidence and uses segment boundaries to avoid cropping the full
text to only its timed words;
otherwise median start/end of one agreeing source per independent method.
The original time base is preserved, including 500 ms delayed audio. V1 does not
estimate a global source offset or claim frame-accurate OCR. Speaker labels are
anonymous source evidence: disagreements yield null with an uncertainty reason.
No character/person name is synthesized.

Cross-language/unknown links use TIMING_ONLY with null text similarity and null
contribution weight. They are preserved as alignment support; they do not elect
canonical text or change its confidence. Cross-only cues outside canonical groups
are counted as unrepresented timing-only segments, never fabricated into target
text. Source evidence remains independent and available for inspection.

Coverage is the union of canonical-language source evidence intervals, clipped to
known episode duration. It is a provisional dialogue-evidence metric: signage and
other content remain UNKNOWN. It is not translation completeness or a measurement
of all spoken dialogue. Overall confidence is derived-duration-weighted mean
segment confidence. Counts distinguish singleton support, independent agreement,
meaningful conflicts and three review categories. Unknown duration gives null
coverage ratio.

CPU stages yield to the event loop and call the cancellation check every 100
items, and between alignment, reconciliation and metrics. The worker owns durable
cancellation/progress persistence; this package has no database, queue or storage
dependency. A thrown cancellation check aborts before any package result returns.

## Pure benchmark

`node_modules/.bin/tsx scripts/fusion-benchmark.ts` creates legal deterministic
in-memory English evidence for 45-minute/500-segment and 60-minute/1,200-segment
episodes, three independent methods each. It warms once, measures three times,
and asserts every cue has all three source links. It reports alignment,
reconciliation and total (validation/metrics included) wall times separately.
This does not measure media extraction, language accuracy, PostgreSQL persistence,
queue latency, actual episode quality, GPU behavior or deployment throughput.
Executed measurements and host conditions belong in Phase 03 validation records.
