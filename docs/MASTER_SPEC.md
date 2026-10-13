# MONGOLSUB STUDIO
## MASTER PRODUCT / ARCHITECTURE / PHASE 01 IMPLEMENTATION PROMPT
### Version 2.0

You are the lead architect and implementation engineer for a product called **MongolSub Studio**.

The product is a professional AI-assisted **Mongolian localization + subtitle editing + video editing studio**.

Inspect the actual repository state before changing anything.

You are authorized to establish the architecture and implement **PHASE 01 ONLY**.

Do not start Phase 02 or any later phase.

---

# 1. PRODUCT VISION

MongolSub Studio is designed to dramatically reduce the time required to localize drama/video content into natural Mongolian.

Primary supported source languages for the first product generation:

```text
English
Simplified Chinese
Traditional Chinese
```

Target language:

```text
Mongolian Cyrillic
```

The architecture must allow additional source languages later, such as:

```text
Korean
Japanese
Russian
```

without redesigning the entire product.

The product is NOT merely:

```text
video
→ speech-to-text
→ translate
→ SRT
```

It should eventually provide the complete workflow:

```text
MEDIA IMPORT
      ↓
SOURCE EXTRACTION
      ↓
TRANSCRIPT / SUBTITLE RECONCILIATION
      ↓
CONTEXT UNDERSTANDING
      ↓
HIGH-QUALITY MONGOLIAN TRANSLATION
      ↓
EDITORIAL QUALITY PASS
      ↓
AUTOMATIC QC
      ↓
HUMAN REVIEW
      ↓
SUBTITLE EDITING
      ↓
VIDEO EDITING
      ↓
FINAL EXPORT
```

The human should spend most of their time making important editorial decisions rather than performing repetitive mechanical work.

---

# 2. CORE PRODUCT GOAL

The ideal future workflow is:

```text
Import episode

↓ AI processing

Receive Mongolian subtitle draft

↓ AI identifies risky lines

Review only uncertain/problematic lines

↓ manually correct if needed

Perform subtitle/video edits

↓ export

Finished localized episode
```

The system should make a 500–800 subtitle episode manageable by focusing human attention on the lines most likely to contain problems.

---

# 3. TRANSLATION QUALITY PHILOSOPHY

The product must NOT promise mathematically perfect or 100% error-free AI translation.

Instead, the architecture should aggressively reduce errors through:

```text
context
multiple source evidence
series memory
character memory
glossary
translation memory
translation critique
Mongolian editorial rewriting
consistency checking
confidence scoring
human review
```

The target quality is:

> Natural Mongolian that does not obviously feel machine-translated while preserving the meaning, emotional intent, relationships, and story continuity of the source.

---

# 4. ANTI-AI-SLOP TRANSLATION

A central requirement of this product is avoiding robotic literal translation.

Bad English source:

```text
Seriously?
```

Bad translation:

```text
Ноцтой юу?
```

Possible natural translation depending on context:

```text
Нээрээ юу?
```

or:

```text
Арай ч дээ.
```

Another example:

```text
The throne was never mine to begin with.
```

Literal:

```text
Хаан ширээ анхнаасаа минийх байгаагүй.
```

Possible natural subtitle:

```text
Угаасаа тэр хаан ширээ надад зориулагдаагүй.
```

Context determines the final answer.

Translation must therefore understand:

```text
speaker
listener
relationship
tone
previous dialogue
next dialogue
story context
character personality
social status
scene tone
terminology
```

Do not design translation as isolated line-by-line API calls.

---

# 5. TRANSLATION MODES

The future product should support three primary modes.

## STRICT

Preserve source phrasing and meaning as closely as reasonable.

Useful when accuracy and literal fidelity matter most.

---

## NATURAL

Default mode.

Preserve meaning but rewrite into natural spoken Mongolian.

Priorities:

```text
meaning
natural Mongolian
character voice
emotion
brevity
subtitle readability
```

---

## CINEMATIC

Allows slightly more adaptation when necessary to make dialogue feel professionally localized.

Must NOT invent story information.

It may improve awkward AI-generated English dialogue while preserving intent.

---

# 6. TRANSLATION PIPELINE

The future translation pipeline should conceptually work like:

```text
SOURCE SEGMENTS
      ↓
Context builder
      ↓
Draft translation
      ↓
Meaning verification
      ↓
Natural Mongolian editorial pass
      ↓
Character voice verification
      ↓
Glossary consistency check
      ↓
Subtitle readability pass
      ↓
Confidence calculation
      ↓
Final proposal
```

Do not run every stage as an expensive separate network call unless benchmarks justify it.

The architecture should allow stages to be combined intelligently.

---

# 7. SOURCE LANGUAGES

Do not hard-code the entire system around Chinese.

Use a language abstraction.

Conceptually:

```text
en
zh-CN
zh-TW
```

Target:

```text
mn
```

Each episode/media source may have:

```text
detected language
declared language
subtitle track language
ASR language
translation source language
```

---

# 8. SERIES MEMORY

The application must eventually understand an entire series, not each episode independently.

Example:

```text
Series:
The Last Crown

Character:
Marcus Vale

Role:
Prince

Relationship:
Elena → lover
King → father

Preferred translation:
Your Grace → Эрхэм дээдэс
```

Episode 14 should not forget decisions made in Episode 1.

Series memory will eventually contain:

```text
characters
aliases
relationships
titles
locations
important story facts
terminology
translation style
approved translation decisions
```

---

# 9. CHARACTER MEMORY

Future Character records should support:

```text
canonical name
source name
Mongolian name
aliases

gender if known
approximate age group if relevant

role
title

relationships

speaking style
formality
personality notes

translation notes
```

Example:

```text
Character:
Arthur

Role:
King

Speaking style:
formal
cold
short commands
```

Then:

```text
Leave me.
```

may contextually become:

```text
Гар.
```

instead of a mechanically literal translation.

Character memory assists translation but must not override explicit scene context.

---

# 10. GLOSSARY

Glossary entries represent terminology decisions.

Example:

```text
Your Majesty → Эрхэм дээдэс
王爷 → Ван ноён
陛下 → Эзэн хаан
```

Scopes:

```text
global
series
episode
character
```

Glossary entries should support:

```text
source language
source term
preferred Mongolian
notes
context rules
status
```

Do not blindly perform string replacement for context-sensitive terms.

---

# 11. TRANSLATION MEMORY

Translation Memory is different from Glossary.

Example:

```text
SOURCE:
Don't worry. I'll come back.

APPROVED MONGOLIAN:
Санаа зоволтгүй ээ. Би эргээд ирнэ.
```

Approved manual edits may later improve future suggestions.

Never let automatic AI regeneration silently overwrite manually approved text.

---

# 12. SOURCE EXTRACTION

The long-term application should combine several possible sources.

## Embedded subtitle track

Extract available subtitle streams from media.

---

## Speech recognition

Use provider architecture.

Potential providers include:

```text
local ASR
cloud ASR
```

Do not hard-code application domain logic around a specific vendor.

Results may contain:

```text
text
segment timestamps
word timestamps
confidence
speaker
language
```

---

## Burned-in subtitle OCR

Especially useful for Chinese video.

Conceptual pipeline:

```text
frames
↓
subtitle region
↓
OCR
↓
temporal deduplication
↓
timing reconstruction
```

Again, OCR must be provider-based.

---

# 13. SOURCE FUSION

When several sources exist, preserve them.

Example:

```text
ASR:
你敢背叛本王

OCR:
你竟敢背叛本王

Embedded:
你竟敢背叛本王
```

Fusion may determine:

```text
你竟敢背叛本王
```

But never destroy the underlying candidate information.

Future editor should be able to inspect:

```text
source candidate
provider
confidence
timestamps
chosen result
```

Source provenance is a first-class concept.

---

# 14. CONFIDENCE-BASED REVIEW

The system must eventually distinguish:

```text
high confidence
review recommended
likely incorrect
```

Possible contributors:

```text
ASR uncertainty
OCR uncertainty
source disagreement
translation ambiguity
rare terminology
name inconsistency
pronoun inconsistency
LLM uncertainty
subtitle timing issue
```

Example future UX:

```text
Episode:

Total subtitles: 624

High confidence:       561
Review recommended:    48
Likely incorrect:      15
```

The editor can choose:

```text
Review Issues Only
```

This is one of the most important product features.

---

# 15. PROFESSIONAL SUBTITLE EDITOR

The subtitle editor must behave like a real editing program.

Future layout:

```text
┌──────────────────────────────────────────────┐
│                  VIDEO                       │
│                                              │
│                  ▶                           │
└──────────────────────────────────────────────┘

SOURCE                     MONGOLIAN

I don't know.              Мэдэхгүй ээ.

Don't go.                  Битгий яваарай.


───────────────────────────────────────────────

AUDIO WAVEFORM

████▂▂████████▂██████


───────────────────────────────────────────────

TIMELINE

VIDEO     ███████████████████████████████

SUBTITLE  [001] [002] [003]   [004]

AUDIO     ▂▅████▂▂███▆▂▅██
```

---

# 16. SUBTITLE BLOCK EDITING

Each subtitle appears as a timeline block.

The user must eventually be able to:

```text
drag subtitle
resize start
resize end
split
merge
delete
duplicate
move
change layer/track
```

Text editing:

```text
double click
→ edit text
→ preview updates immediately
```

No export/render should be needed to preview subtitle text changes.

---

# 17. TIMELINE ↔ VIDEO SYNCHRONIZATION

Selecting a subtitle:

```text
timeline subtitle click
→ video seeks to subtitle
```

Clicking a currently visible subtitle or transcript line should select the corresponding timeline item where practical.

This should feel like a professional editor.

---

# 18. SUBTITLE AI ACTIONS

Future subtitle context menu:

```text
AI Fix

Re-translate
Make natural
Shorten
More emotional
More formal
More casual
Closer to original
Check grammar
Check context
```

AI changes should initially be suggestions.

Example:

```text
CURRENT

Хаан ширээ анхнаасаа минийх байгаагүй.

AI SUGGESTION

Угаасаа тэр хаан ширээ надад зориулагдаагүй.

[Accept]
[Reject]
[Try Again]
```

---

# 19. MANUAL EDIT PRIORITY

Manual changes are extremely important.

Track subtitle origin/state such as:

```text
AI_GENERATED
AI_REVISED
MANUALLY_EDITED
APPROVED
```

If the user manually edits:

```text
Never overwrite it automatically.
```

AI may propose a new version but the editor must approve replacement.

---

# 20. ISSUE NAVIGATION

Future editor controls:

```text
Previous Issue
Next Issue
```

Timeline markers:

```text
green   = likely okay
yellow  = review
red     = likely problem
```

Never rely only on color; also provide icons/text for accessibility.

---

# 21. TRANSCRIPT MODE

In addition to timeline mode, provide document-style transcript editing.

Example:

```text
00:21:15  Marcus

SOURCE
I don't think we should go there.

MONGOLIAN
Тийшээ явах хэрэггүй байх.
```

Selecting the text should seek the player.

This mode is particularly useful for translation review.

---

# 22. KEYBOARD-FIRST EDITING

The product should be efficient for professional users.

Future shortcuts may support:

```text
play/pause
seek
next subtitle
previous subtitle
split
merge
approve
next issue
previous issue
undo
redo
```

Exact shortcuts will be finalized during the editor phase.

---

# 23. VIDEO EDITOR

MongolSub Studio is not only a subtitle editor.

It must eventually provide general video editing capabilities.

Use a multi-track timeline model.

Example:

```text
V3   text/effects
V2   logos/images
V1   main video

S2   source subtitles
S1   Mongolian subtitles

A2   music
A1   original audio
```

---

# 24. VIDEO OPERATIONS

Future operations should include:

```text
cut
trim
split
delete

crop
resize
rotate
scale

speed

brightness
contrast
saturation

blur
mosaic

fade in
fade out

freeze frame

audio gain
mute
audio fade

image overlay
logo
watermark
text
```

Do not necessarily reproduce every Premiere/CapCut effect.

Prioritize functions relevant to localization and publishing.

---

# 25. NON-DESTRUCTIVE EDITING

This requirement is mandatory.

Original media must remain unchanged.

Persist structured editing operations.

Example:

```json
{
  "type": "CUT",
  "startMs": 803000,
  "endMs": 811000
}
```

Do NOT persist raw FFmpeg command strings as the primary edit model.

The render layer later converts validated edit operations into an FFmpeg graph.

---

# 26. UNDO / REDO

All meaningful editor changes must eventually support:

```text
Ctrl + Z
Ctrl + Shift + Z
```

Architect editing state so command/history-based undo is possible.

Do not build editor state in a way that makes undo nearly impossible later.

---

# 27. AUTO SAVE

A browser crash should not destroy extensive editing work.

Future editor needs:

```text
automatic save
revision timestamps
dirty-state management
recovery
```

Example history:

```text
16:42 Subtitle 321 edited

16:39 Subtitle 318 timing changed

16:35 Video cut created
```

---

# 28. AI VIDEO EDITING

Future feature:

User may type:

```text
Эхний 10 секундыг ав.

Subtitle-аа арай доошлуул.

12:30-аас 12:40 хүртэл хэсгийн дууг багасга.

Эхэнд logo-г 3 секунд гарга.
```

AI converts the instruction into structured operations.

Example:

```json
[
  {
    "type": "CUT",
    "startMs": 0,
    "endMs": 10000
  },
  {
    "type": "LOGO_OVERLAY",
    "startMs": 0,
    "endMs": 3000
  }
]
```

AI must NOT immediately perform destructive changes.

Show:

```text
Proposed edits

[Apply]
[Cancel]
```

and validate operations before execution.

---

# 29. SUBTITLE STYLE SYSTEM

Future style controls:

```text
font
size
weight
outline
shadow
background
position
alignment
line spacing
safe margins
```

Allow reusable presets.

Example:

```text
Drama
Cinema
Minimal
Short-form
```

Series may specify a default subtitle preset.

---

# 30. SUBTITLE QC

Future QC should detect:

```text
empty translations
untranslated source text
invalid timestamps
overlap
extremely short duration
reading speed problems
excessive line length

possible mistranslation
source disagreement
name inconsistency
title inconsistency
pronoun/formality inconsistency
glossary inconsistency

duplicate lines
OCR artifacts
ASR artifacts
```

Each issue:

```text
id
type
severity
segment
description
status
suggestion
```

---

# 31. EXPORT

Future subtitle export:

```text
SRT
ASS
VTT
```

Future video export:

```text
MP4
MKV
```

Options:

```text
burn Mongolian subtitles
include selectable subtitle track
include logo
apply timeline edits
resolution
quality
```

Do not re-encode unnecessarily.

---

# 32. LEGAL BOUNDARIES

The application processes media supplied by the user.

Do not build:

```text
DRM circumvention
streaming platform ripping
unauthorized media downloaders
protection bypasses
```

Assume users have legal permission to process their source material.

---

# 33. TECHNOLOGY FOUNDATION

Preferred monorepo:

```text
pnpm
Turbo
strict TypeScript
```

Web:

```text
Next.js
React
TypeScript
Tailwind
```

API:

```text
NestJS
REST
```

Persistence:

```text
PostgreSQL
Prisma
```

Background processing:

```text
Redis
BullMQ
```

Media:

```text
FFmpeg
ffprobe
```

AI/media services may later use Python where appropriate.

Object/media storage:

```text
local filesystem development provider
S3-compatible future provider
```

Do not tightly couple the domain layer to local filesystem implementation.

---

# 34. MONOREPO STRUCTURE

Suggested:

```text
apps/
  web/
  api/
  worker/

services/
  asr/
  ocr/
  ai/

packages/
  config/
  contracts/
  database/
  domain/
  media/
  queue/
  storage/
  ui/

infra/
  docker/

docs/

scripts/
```

Adjust if necessary, but document meaningful deviations.

---

# 35. DOMAIN DIRECTION

Long-term domain concepts include:

```text
Workspace

Series
Episode

MediaAsset
MediaStream

ProcessingJob

SubtitleTrack
SubtitleSegment

SourceCandidate
TranscriptSegment

Character
CharacterAlias

GlossaryEntry
TranslationMemoryEntry

QCIssue

Timeline
Track
TimelineItem
EditOperation

ExportJob
```

Do not implement all of them now.

Only implement Phase 01 entities.

---

# 36. ARCHITECTURAL BOUNDARIES

Keep:

```text
domain
application logic
infrastructure
API transport
UI
```

appropriately separated.

Do not place application/business logic directly in React components or Nest controllers.

Controllers should orchestrate DTOs/application services.

React components should not directly contain business rules.

---

# 37. PROVIDER ABSTRACTION

Future providers should use clear contracts.

Examples:

```ts
interface AsrProvider {
  transcribe(input: AsrInput): Promise<AsrResult>;
}

interface OcrProvider {
  recognize(input: OcrInput): Promise<OcrResult>;
}

interface TranslationProvider {
  translate(input: TranslationInput): Promise<TranslationResult>;
}
```

Do not build fake implementations just to populate architecture.

Only create interfaces needed now or immediately next.

---

# 38. PROCESSING JOB ARCHITECTURE

Long-running tasks do not belong inside HTTP requests.

Use:

```text
API
 ↓
BullMQ
 ↓
Worker
 ↓
processing
 ↓
DB/storage
```

Statuses:

```text
QUEUED
PROCESSING
COMPLETED
FAILED
CANCELLED
```

Progress and errors must be persisted where appropriate.

---

# 39. STORAGE PRINCIPLES

Large media files must NOT be stored as PostgreSQL blobs.

Database stores references/metadata.

Media storage abstraction owns physical storage.

Avoid filesystem paths throughout business logic.

Use storage keys/assets.

---

# 40. SECURITY

Secrets stay server-side.

Provide:

```text
.env.example
```

Never commit credentials.

Possible future variables:

```text
DATABASE_URL
REDIS_URL

AI provider keys

STORAGE_*
```

Validate environment configuration.

---

# 41. LARGE FILE SAFETY

Do not load entire video files into Node memory.

Use streaming or direct storage paths.

Upload limits/errors should be explicit.

Avoid unnecessary copies.

---

# 42. MEDIA PROCESSING

Wrap ffprobe/FFmpeg invocation.

Do not concatenate untrusted file names into shell command strings.

Use argument arrays/process APIs.

Capture:

```text
stdout
stderr
exit code
timeout
```

Validate external JSON.

Do not cast arbitrary ffprobe output into trusted internal TypeScript types.

---

# ==========================================================
# ROADMAP
# ==========================================================

# PHASE 01 — FOUNDATION + MEDIA IMPORT

Implement:

```text
monorepo

web
API
worker

database

queue

storage abstraction

Series

Episode

MediaAsset

MediaStream

ProcessingJob

video upload/import

ffprobe inspection

media metadata persistence

basic UI

job status

tests

continuity/handoff docs
```

No AI yet.

---

# PHASE 02 — SOURCE EXTRACTION

Implement:

```text
language model foundation

embedded subtitle extraction

audio extraction

ASR provider

English ASR

Chinese ASR

burned subtitle OCR

source candidate persistence
```

---

# PHASE 03 — TRANSCRIPT + SOURCE FUSION

Implement:

```text
candidate alignment

source fusion

timing normalization

confidence scoring

speaker model

subtitle segmentation

source inspector/editor
```

---

# PHASE 04 — MONGOLIAN LOCALIZATION ENGINE

Implement:

```text
English → Mongolian

Chinese → Mongolian

translation provider architecture

STRICT mode

NATURAL mode

CINEMATIC mode

Series Memory

Character Memory

Glossary

Translation Memory

context builder

editorial pass

anti-AI-slop quality pipeline

confidence scoring
```

---

# PHASE 05 — PROFESSIONAL SUBTITLE EDITOR

Implement:

```text
video player

subtitle timeline

waveform

transcript editor

subtitle drag/resize

split/merge

manual translation editing

AI fix actions

compare suggestions

approval state

issue navigation

keyboard shortcuts

autosave

undo/redo
```

---

# PHASE 06 — QC + SERIES CONSISTENCY

Implement:

```text
automatic QC

name consistency

title consistency

glossary validation

formality/pronoun validation

reading speed

timing QC

confidence review

review issues only mode
```

---

# PHASE 07 — VIDEO EDITOR

Implement:

```text
multi-track timeline

cut
trim
split

overlay
text
logo

crop
resize

blur

basic image adjustments

audio controls

subtitle styling

non-destructive edit operations
```

---

# PHASE 08 — EXPORT / RENDER

Implement:

```text
SRT
ASS
VTT

MP4
MKV

subtitle burn-in

timeline renderer

FFmpeg render graph

export jobs
```

---

# PHASE 09 — AI VIDEO EDITING

Implement:

```text
Mongolian natural-language commands

command → validated EditOperation

preview proposed changes

Apply / Reject

AI-assisted scene/edit actions
```

---

# PHASE 10 — BATCH / PRODUCTION HARDENING

Implement:

```text
batch episodes

shared Series Memory

reliable retries

resume processing

performance benchmarking

large media hardening

render optimization

deployment

team readiness
```

---

# ==========================================================
# PHASE 01 AUTHORIZATION
# ==========================================================

You are authorized to implement **PHASE 01 ONLY**.

Stop after Phase 01.

Do not begin AI transcription, translation, OCR, subtitle editing, or video editing.

---

# 43. PHASE 01 USER EXPERIENCE

A user must be able to:

```text
Open MongolSub Studio

Create a Series

Open the Series

Create an Episode

Open the Episode

Upload/import a local video

See upload/import progress where useful

Asset is persisted

Inspection job is queued

Worker runs ffprobe

Media metadata is persisted

Episode screen shows media information

Job becomes COMPLETED
```

Failure:

```text
ffprobe error

→ job FAILED

→ useful error displayed

→ application stays functional
```

---

# 44. PHASE 01 DATABASE MODEL

Implement only what is genuinely required.

Required:

```text
Series

Episode

MediaAsset

MediaStream

ProcessingJob
```

Conceptual:

```text
Series
  └── Episodes
        └── MediaAssets
              └── MediaStreams
```

---

# 45. SERIES

Minimum concept:

```text
id

title

description optional

sourceLanguage optional/declared

createdAt
updatedAt
```

Do not force sourceLanguage to be Chinese.

Support language identifiers appropriate for:

```text
English
Chinese Simplified
Chinese Traditional
```

and future languages.

---

# 46. EPISODE

Concept:

```text
id

seriesId

title

episodeNumber optional

createdAt
updatedAt
```

Avoid requiring arbitrary episode numbering schemes.

---

# 47. MEDIA ASSET

Potential fields:

```text
id

episodeId

originalFilename
storageKey

mimeType
sizeBytes

durationMs
containerFormat

width
height

status

createdAt
updatedAt
```

Only persist justified data.

---

# 48. MEDIA STREAM

Persist meaningful ffprobe stream metadata.

Types:

```text
VIDEO
AUDIO
SUBTITLE
OTHER
```

Possible metadata:

```text
streamIndex
codec
language
title

width
height
frameRate

channels
sampleRate
```

Use typed parsing.

---

# 49. PROCESSING JOB

Required fields/concepts:

```text
id

jobType

status

progress

episodeId optional
mediaAssetId optional

errorCode optional
errorMessage optional

createdAt
startedAt
completedAt
updatedAt
```

Initial job:

```text
INSPECT_MEDIA
```

---

# 50. PHASE 01 QUEUE FLOW

Expected:

```text
upload media

↓

storage provider stores asset

↓

MediaAsset created

↓

INSPECT_MEDIA job created

↓

BullMQ job queued

↓

worker processes

↓

ffprobe

↓

typed parser

↓

MediaAsset + MediaStream update

↓

ProcessingJob COMPLETED
```

---

# 51. RETRY / FAILURE

Handle failure explicitly.

Do not create infinite retries.

If retry is configured:

```text
small reasonable retry count
```

Fatal invalid-media errors should not repeatedly run forever.

Persist useful final error.

---

# 52. PHASE 01 UI

Create a real editor foundation, not a generic admin template.

Required screens:

```text
Series Library

Create Series

Series Detail

Create Episode

Episode Detail

Import Video

Processing Status

Media Metadata
```

Episode Detail should establish the future editor layout.

For example:

```text
┌────────────────────────────────────────────┐
│ Episode title                              │
├─────────────────────┬──────────────────────┤
│                     │ Media / Job info     │
│ Future Video Player │                      │
│ area                │                      │
│                     │                      │
├─────────────────────┴──────────────────────┤
│ Future timeline/editor area                │
└────────────────────────────────────────────┘
```

Do not fake implemented editing features.

Future areas may be visually reserved but clearly disabled.

---

# 53. UI DESIGN

Professional editing software direction:

```text
dark-first
desktop-first
compact
high information density
clear hierarchy
minimal decorative clutter
```

Avoid:

```text
giant cards everywhere
huge marketing spacing
excessive gradients
dashboard-template feeling
```

The product should eventually feel closer to:

```text
editing software
```

than:

```text
generic SaaS CRM
```

Do not directly copy another product.

---

# 54. PHASE 01 API

Use clean contracts.

Potential routes:

```text
GET    /series
POST   /series

GET    /series/:id
PATCH  /series/:id

POST   /series/:id/episodes

GET    /episodes/:id
PATCH  /episodes/:id

POST   /episodes/:id/media

GET    /media/:id

GET    /jobs/:id
```

Exact route choices may differ for architectural reasons.

Do not expose raw Prisma objects as public API contracts.

Use input validation.

---

# 55. FILE UPLOAD

Video imports must:

```text
validate request

sanitize metadata handling

use storage abstraction

avoid loading large videos entirely into RAM

preserve original media

create MediaAsset
```

Do not pretend upload is complete before persistence succeeds.

---

# 56. DEVELOPMENT STORAGE

Implement a development local storage provider.

Example:

```text
./data/media
```

but avoid scattering this path across the app.

Only storage infrastructure should know the physical path.

Future S3 implementation must be possible without redesigning domain/API layers.

---

# 57. TOOL READINESS

Detect media tool availability.

Provide useful readiness information:

```text
ffmpeg
ffprobe
```

If missing, report a clear setup error.

A health/tool endpoint is acceptable.

---

# 58. DEVELOPMENT ENVIRONMENT

Provide a clean startup flow.

Prefer approximately:

```text
pnpm install

docker compose up -d

pnpm db:migrate

pnpm dev
```

Docker Compose:

```text
PostgreSQL
Redis
```

Running application servers outside Docker during development is acceptable and preferred unless a strong reason says otherwise.

---

# 59. TEST MEDIA

Do not commit copyrighted videos.

Create a tiny synthetic fixture using FFmpeg.

Example fixture:

```text
few seconds

simple generated video

test audio

optional simple subtitle stream
```

Use it for integration testing.

---

# 60. PHASE 01 TESTS

At minimum test:

```text
Series create/read/update as required

Episode creation

input validation

storage provider

media persistence

ffprobe wrapper

ffprobe parsing

successful INSPECT_MEDIA

failed INSPECT_MEDIA

job transitions

MediaStream persistence
```

Add a deterministic integration/E2E path:

```text
create Series

→ create Episode

→ import synthetic media

→ inspection job

→ metadata available
```

Do not mock every meaningful boundary.

---

# 61. STRICT TYPE SAFETY

Use strict TypeScript.

Avoid:

```text
any

unsafe unknown casts

magic status strings

unvalidated JSON
```

Use runtime validation for external payloads such as ffprobe.

---

# 62. LOGGING

Use structured logs where reasonable.

Important identifiers:

```text
jobId
mediaAssetId
episodeId
```

Avoid logging secrets.

---

# 63. ERROR HANDLING

Never show users:

```text
[object Object]

Prisma stack trace

raw child_process exception
```

Application errors should map to understandable user messages.

Developer logs retain detailed context.

---

# 64. CONTINUITY REQUIREMENT

Different AI agents will continue this repository.

The repository must be understandable without this chat.

Create:

```text
AGENTS.md

PROJECT_STATE.md

HANDOFF.md

docs/ARCHITECTURE.md

docs/ROADMAP.md

docs/DOMAIN_MODEL.md
```

---

# 65. PROJECT_STATE.md

Include:

```text
Project name

Current phase

Last approved/completed phase

Active branch

Latest approved commit

Implementation status

Completed milestones

Open tasks

Known limitations

Technical risks

Product risks

Deferred work

Next expected task

Exact continuation point

Source-of-truth documents

Things that must NOT change without approval
```

---

# 66. AGENTS.md

Future agents must be instructed:

```text
read PROJECT_STATE.md first

read HANDOFF.md

inspect git status/history

do not rely on chat history

do not start a new phase without authorization

do not silently change architecture

run tests

update continuity docs
```

---

# 67. ARCHITECTURE DECISIONS

Use:

```text
docs/adr/
```

for meaningful long-term decisions.

Possible ADRs:

```text
monorepo organization

job architecture

storage abstraction

media process boundary
```

Do not generate meaningless ADR noise.

---

# 68. GIT WORKFLOW

Inspect first:

```text
git status
git branch
git log
repository files
```

Create/use branch:

```text
codex/phase-01-foundation
```

Do not destroy existing user work.

Do not merge to main unless explicitly authorized.

Commit meaningful logical changes.

---

# 69. DO NOT IMPLEMENT IN PHASE 01

Explicitly prohibited:

```text
ASR

OCR

AI translation

English → Mongolian translation

Chinese → Mongolian translation

Series Memory logic

Character Memory

Glossary

Translation Memory

subtitle source fusion

subtitle editor

waveform

timeline editing

video editor

video rendering

AI video commands

QC engine
```

Do not add fake demos pretending these are functional.

---

# 70. PREPARE FOR FUTURE EDITOR WITHOUT OVERBUILDING

Phase 01 architecture should avoid decisions that would make these difficult later:

```text
non-destructive timeline

undo/redo

autosave

manual subtitle preservation

multi-track video editing

source provenance
```

However, do not implement these systems prematurely.

---

# 71. DEFINITION OF DONE

Phase 01 is complete only when:

```text
monorepo runs

web works

API works

worker works

PostgreSQL works

Redis/BullMQ works

migrations work

Series flow works

Episode flow works

media import works

storage works

ffprobe runs asynchronously

metadata persists

streams persist

job status visible

failure flow works

tests pass

lint passes

typecheck passes

production build passes

continuity docs updated
```

---

# 72. VALIDATION

Before completion run relevant:

```text
lint

typecheck

unit tests

integration tests

production build
```

Also verify:

```text
git status

Phase 02 code was not started
```

Do not claim unexecuted tests passed.

---

# 73. FINAL PHASE 01 REPORT

Return:

```text
1. Branch

2. Latest commit hash

3. Repository architecture

4. Apps/packages created

5. Database schema

6. API endpoints

7. UI implemented

8. Media storage implementation

9. FFprobe inspection architecture

10. Queue architecture

11. Exact tests and results

12. Lint/typecheck/build results

13. Known limitations

14. Technical risks

15. Manual testing steps

16. Important files future agents must read

17. Exact Phase 02 continuation point

18. Explicit confirmation that Phase 02 was NOT started
```

Do not simply write:

```text
Phase 01 completed.
```

Provide evidence.

---

# 74. FINAL PRODUCT NORTH STAR

Every architectural decision should remain compatible with this future experience:

```text
User imports an English or Chinese drama episode

↓

System extracts the most trustworthy dialogue/subtitle source

↓

System understands the story, characters and terminology

↓

System generates natural Mongolian subtitles

↓

System highlights likely mistakes

↓

User clicks the problematic subtitle

↓

Video instantly seeks to that moment

↓

User edits the Mongolian directly
or asks AI to rewrite it

↓

Timeline behaves like a professional video editor

↓

User cuts/edits video if necessary

↓

Everything remains non-destructive and undoable

↓

User exports the finished Mongolian-localized video
```

The product succeeds when:

> AI handles repetitive translation and technical work, while the human keeps control over language, storytelling and final quality.

Now inspect the repository, create the Phase 01 branch, implement Phase 01 completely, validate it, update the continuity documentation, produce the final report, and STOP.

DO NOT START PHASE 02.