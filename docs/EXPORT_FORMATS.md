# Phase 08 export formats

| Delivery | Video | Audio | Subtitle behavior | Notes |
|---|---|---|---|---|
| MP4 | H.264 (`libx264`), yuv420p | AAC, 48 kHz stereo, 192 kb/s | none, burn-in, or external sidecar | `+faststart`; no selectable soft subtitle in Phase 08 |
| MKV | H.264 (`libx264`), yuv420p | AAC, 48 kHz stereo, 192 kb/s | none, burn-in, sidecar, or embedded selectable ASS | container reported as Matroska |
| SRT | — | — | project-time UTF-8 text | CRLF blocks, millisecond timestamps; empty file carries UTF-8 BOM |
| ASS | — | — | project-time UTF-8 styled text | one controlled style, escaped braces/backslashes/newlines |

Resolution can preserve the project canvas or fit inside 1920×1080 / 1280×720 while preserving aspect ratio
and even dimensions. Frame rate defaults to the project rate and is bounded to 1–120. `FAST`, `BALANCED` and
`HIGH_QUALITY` map to versioned `libx264` preset/CRF pairs; these labels are product presets, not promises of a
fixed bitrate or file size.

Burn-in renders the generated ASS through libass after visual compositing. MKV soft mode maps the same generated
ASS as a selectable stream and is rejected for MP4. Sidecars always reflect Project Timeline projection, including
cuts, reorder, repetition and clipped boundary durations. They are derived outputs and never replace the source
SubtitleDocument.

Output records store a logical filename, kind, MIME type, container, byte size, SHA-256 checksum, stream summary
and validation metadata. Physical storage keys stay private. Downloads support byte ranges and use an ASCII
fallback plus RFC 5987 `filename*` for Unicode names.

Phase 08 does not provide HEVC/AV1, GPU presets, WebM, audio-only export, multiple soft-subtitle languages,
font attachment, HDR/color-space mastering, loudness normalization, chapter metadata or cloud delivery links.
