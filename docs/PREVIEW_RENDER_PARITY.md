# Preview and future render parity

Phase 07 defines canonical project parameters and an interactive browser interpretation. Phase 08 must
compile those parameters to a server render plan and compare representative output before claiming
parity. Raw FFmpeg expressions are deliberately absent from public/domain records.

| Feature | Phase 07 preview | Canonical parameters | Phase 08 interpretation | Known limitation |
|---|---|---|---|---|
| Trim / split / move | Project resolver seeks retained source ranges | `sourceInMs`, `sourceOutMs`, `timelineStartMs`, `playbackRate` | `trim/atrim`, timestamp reset and placement | Browser seek/keyframe accuracy depends on codec |
| Gaps | Black canvas and silence | No active primary clip | Generated black/silent interval | Browser background timing can throttle in hidden tabs |
| Fit / fill / stretch | CSS object-fit | project canvas and fit mode | scale/pad/crop graph | CSS and encoder pixel rounding can differ |
| Position / scale / rotation | CSS transform | normalized X/Y, scale, degrees | scale/rotate/overlay | Edge interpolation may differ |
| Crop | CSS clip-path | normalized four-edge crop | crop then scale | Preview clips the rendered layer rather than decoding fewer pixels |
| Opacity | DOM/CSS opacity | 0–1 opacity | alpha/overlay composition | Color-space alpha rounding can differ |
| Brightness / contrast / saturation | CSS filter | bounded scalar values | color filters | Browser color management and FFmpeg color space need explicit Phase 08 tests |
| Image/logo | Positioned image layer | asset ID, interval, transform, opacity | decoded image overlay | Animated images are not defined |
| Text | DOM text layer | text, style snapshot, transform, interval | explicit font/text render | Exact fonts and line metrics must be packaged for render parity |
| Rectangular blur | Clipped filtered duplicate | normalized box, interval, strength | crop/blur/overlay | Blur kernel units are visually approximate in browser |
| Subtitle projection | DOM cue from retained source interval | SubtitleDocument ref and source cue ID/range | map current document cues through video EDL | Boundary-clipped cues are warnings; source cue remains intact |
| Audio volume/mute | Web Audio GainNode | volume 0–2 and mute | volume/mix | Device output and limiter behavior differ |
| Audio fade | Per-playhead gain envelope | fade-in/out milliseconds | `afade` equivalent | UI update granularity is coarser than offline samples |
| Multiple audio tracks | Up to three active routed elements | ordered overlapping audio clips | deterministic audio mix | Preview resource cap is lower than future offline mix capability |
| Waveform | Existing min/max derivative mapped to source | derivative settings hash plus clip map | Diagnostic only | Peaks are decimated, not render audio |

Phase 08 must define canvas pixel rounding, color space, font packaging, audio mix headroom, image decode
policy, subtitle burn/pass-through choice and codec settings. It must not infer these from CSS output.
