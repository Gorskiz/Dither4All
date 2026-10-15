# Video and animation

![Dither4All timeline, keyframes and motion controls](motion-preview.png)

Open a video with **Open media** or drop it onto the canvas. MP4, WebM, MOV and MKV containers are supported when the browser can decode their video codec. Or choose **Animate image** below the canvas to turn a still into an animation.

The same dithering, palette and effect stack applies to every frame. Preview is silent and adapts to device performance; export renders every frame at the chosen FPS. Use the timeline to scrub, step frames, play/pause, and loop. Space toggles playback when focus is outside a control.

## Trim and animate

Set In and Out in seconds. Selections must be between 0.01 and 30 seconds. Still-image duration can be changed up to 30 seconds. FPS choices are 6, 12, 24 and 30.

Under **Source motion**, choose None to preserve source movement, Noise boil for changing grain, Brightness pulse, Looping zoom, or Horizontal drift. Amount and cycles control these effects. Drift wraps the image horizontally; fractional traversals can jump on looping. Pulse and zoom cycle smoothly; random grain is intentionally discontinuous.

To animate an adjustment, move the playhead, select a property, enter its value and click Set key. Repeat at another time. Keys override the matching base adjustment; values hold before the first and after the last key. Interpolation can be smooth, linear or hold. Click a key in the list or a diamond below the timeline to seek; use × to remove it. Up to 200 keys are supported. Scale is rounded to whole pixels.

## Stackable motion effects

Choose an effect under **Motion stack** and click **Add effect**. Combine up to eight entries, including repeated effects. Entries run from top to bottom after the image's dithering and static effects. Toggle **Enabled**, use ↑ / ↓ to reorder, or × to remove an entry. Each entry has its own **Amount** (0–100), **Cycles** (1–8 over the selection), and **Phase** (0–360°). Zero amount and disabled entries leave pixels unchanged.

- **Flowing displacement:** smooth liquid distortion from seeded 4D simplex noise. Amount controls displacement distance.
- **Animated ripple:** traveling circular waves. Amount controls displacement distance.
- **Glitch bursts:** intermittent torn rows and RGB separation. Amount controls displacement and channel separation. Burst timing is seeded and repeatable.
- **CRT roll:** moving scanlines and a dark rolling band. Amount controls darkness.
- **Palette cycling:** steps colors through the palette in swatch order. Amount controls the proportion of pixels that cycle using a fixed ordered mask, preserving swatch colors. Requires **Palette** color mode; RGB mode skips this effect and shows a preview notice. Place it before CRT to keep the CRT shading, or after CRT to remap the shaded colors.

Flow, ripple, and CRT have matching start/end states. Palette cycling is deliberately stepped and glitch bursts deliberately cut. Integer cycles repeat over the selection, and phase offsets each entry. Source motion and adjustment keyframes still work alongside the stack. The effect controls themselves are constant over a selection; numeric adjustment keyframes remain available below the stack.

Preview, current-frame export, and animation export evaluate the same worker code using the same FPS-aligned timestamps and seed. Scrubbing to the selection end shows the last exportable frame. At matching dimensions the processed pixels match; larger exports have more detail than the reduced preview. Video/GIF encoding can additionally change colors. Preview is capped at 640 px (lower for heavy methods) and never exceeds the selected export size.

## Export

**Export animation** uses Motion format and Longest side. Images are never enlarged. Dimensions are rounded to even pixels for codec compatibility.

- MP4: H.264 video with optional AAC audio.
- WebM: VP8 video with optional Opus audio.
- GIF: animated palettes, at most 640 px on the longest side; Loop determines the GIF repeat flag. Centisecond timing is distributed across frames.
- PNG frames: a ZIP of numbered PNGs plus `animation.json` with FPS, duration and loop metadata.

Video export preserves source audio when Include audio is checked. Unsupported audio encoders cause an explicit error; uncheck Include audio for silent export. Codec packet padding may extend the audio track slightly. GIF and PNG sequences have no audio. Preview looping does not make MP4/WebM players loop; that is controlled by the player.

Use **Export current frame** for a still at the current playhead, in the image Output format, at the selected motion resolution. Copy image also copies the current processed frame. The image Output Size applies only to still documents.

Export is limited to 30 seconds and 900 frames, with longest-side choices 128, 256, 480, 720 and 1280 px. GIF/PNG collections stop at 120 MB. Browser-native video encoders may be unavailable on some browsers/devices: choose another format. Export uses a snapshot of settings and can be cancelled; source files cannot be changed during export. Video and GIF flatten transparency onto black; PNG frames retain it. All output is assembled in browser memory before download.

## Projects and privacy

Save project retains image settings, the ordered motion stack and its controls, source motion, trim and keyframes. Older projects open with an empty motion stack. Still projects embed the source image. Video projects embed a poster and a file reference, so reopen the original video (matching filename and size) after loading the project. Video bytes are not embedded. Keep your original file alongside the project.

Style presets, settings links, and image undo/redo affect the image recipe. Motion keys/settings are edited in the timeline and saved in projects. Animated image imports currently use one frame; video containers provide moving sources. There is no multi-track editing, motion tracking, transition editor or automatic subject segmentation.

Everything runs locally with bundled libraries. No upload, account, API key, remote codec service, microphone access or recording permission is required. See [licenses](../public/third-party-notices.txt).

## Heavy methods

DBS, curves, Lippens–Philips, grid and auto-threshold enforce tighter working-grid/frame-count limits and a 90-second motion-export deadline. DBS is limited to 12 FPS. Use the new 128/256 px sizes, shorten the selection or increase Pixel scale. Preflight considers low-scale keyframes too. See [the full budget table](performance-limits.md). Cancel preview pauses playback and stops its worker; settings changes can start it again.
