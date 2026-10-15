# Architecture

## Runtime

Vite builds TypeScript and CSS into a static application. Mediabunny and gifenc are bundled locally and loaded only for media work. There are no remote fonts, remote images, or external script tags. The bundled sample is original procedural artwork generated in `src/sample.ts`.

`src/main.ts` owns editor state, bounded settings history, file operations, dialogs, and browser-local saved presets. `src/engine/catalog.ts` defines typed settings, effect identifiers, defaults, diffusion kernels, palettes, and strict import validation.

`src/engine/process.ts` is a pure typed-array pipeline (sRGB by default; optional linear-light processing):

1. Area-average source pixels to the selected pixel scale, weighting RGB by opacity and optionally decoding to linear light first.
2. Apply saturation, contrast, brightness, gamma, and source inversion.
3. Dither against a fixed palette or quantize RGB channels. Family-specific dot/tile/Hilbert methods use the same prepared pixels and palette matcher. Re-encode linear output to sRGB. CMYK uses its own source-color screens.
4. Apply enabled effects in stack order on the pixel grid.
5. Expand the grid by nearest neighbor to the exact source dimensions. Restore each original alpha value.

`src/worker.ts` runs this pipeline outside the main thread. Every preview gets a worker; a changed setting aborts outdated work before starting another. Export and batch use separate workers with settings snapshots. Preview is reduced to 1100 pixels on the longest side; export reprocesses source pixels at the chosen output size. Previews cannot represent subpixel output detail exactly.

## Files

`src/files.ts` provides bounded browser image decoding, PNG/JPEG/WebP encoding, SVG pixel-run generation, project/palette parsing, and uncompressed ZIP creation with CRC-32 and a central directory.

SVGs use horizontal runs of filled paths, including partial opacity. Black-only SVGs omit light pixels and render remaining pixels as black ink. They do not trace smooth contours.

Batch snapshots the settings at its start, decodes one image at a time, and collects PNG blobs before ZIP assembly. File count, input size, and output size are bounded to limit memory pressure. Input size limits do not guarantee a browser can process every allowed combination on every device.

## Persistence and privacy

- `localStorage['dither4all-presets']`: up to 50 named settings objects, validated on read.
- URL `#recipe=`: settings JSON only. No image bytes.
- `.d4a`: versioned JSON with settings, a source name, and an embedded PNG image.
- No network writes, account system, cookies, analytics, or service APIs.

## Motion

`src/motion/model.ts` validates timelines and evaluates numeric keyframes and temporal animation deterministically. Keyframes override image settings, with hold, linear, or smooth interpolation. Style undo/presets remain image-setting operations; animation keys are edited directly and saved in projects.

`src/motion/catalog.ts` defines and validates up to eight ordered motion effects with independent amount, integer cycles, phase and enabled state. Legacy timelines missing the stack normalize to an empty array. `motionAt` provides normalized selection progress and `sampleTime` aligns scrubbing/playback to export timestamps. `src/motion/effects.ts` evaluates the stack after `processImage` in the worker, shared by preview, current-frame exports and all animation formats. It has no wall-clock or previous-frame dependency. Flow uses seeded 4D simplex noise sampled on a bounded vector grid with circular time coordinates; geometry samples RGBA together. Palette cycling preserves alpha and rotates swatches using a fixed coverage mask, with bounded nearest-color matching when earlier effects changed colors. It is skipped with a notice in RGB mode. Stack operations remain cancellable through the processor's worker termination/watchdog.

`src/motion/editor.ts` owns playback, trim, and scrubbing. Preview uses a persistent worker through `processor.ts`, displays frames at up to 640 px and 12 fps, and skips outdated work. The wall clock drives playback so slow processing does not stretch the timeline. Preview is silent. Decoding uses a bounded CanvasSink, honoring display orientation and timestamps.

`src/motion/media.ts` opens an independent source for export, iterates monotonically ordered timestamps, processes one frame at a time, and muxes MP4/AVC/AAC or WebM/VP8/Opus using browser codecs through Mediabunny. Audio samples are clipped to the selection and timestamps rebased. Encoded audio can contain codec packet padding. Capability checks run before frames are rendered. Cancellation terminates processors and disposes decoder/encoder resources.

GIF quantization and encoding run in a separate worker (`gif-worker.ts`). GIF delays distribute centiseconds across frames to preserve total timing. PNG ZIPs include sequentially named frames and timing metadata. Export uses settings/timeline snapshots; source replacement is blocked while exporting. Limits bound retained output (120 MB for GIF/PNG sequences), duration, frame count and dimensions. Memory availability still varies by device; output is collected in memory before download.

Projects retain v1 compatibility, with optional validated motion metadata. Stills embed the original image; video projects embed a poster and original filename/size reference. They require relinking the original video after reopening. No original video is embedded or uploaded.

## Additional dithering and color tools

`src/engine/ditherista/catalog.ts` contains small UI metadata; numeric tables live separately in `data.ts` and are imported by the processing worker only. `process.ts` in that directory implements the additional families without DOM dependencies. Tables are pinned to the audited upstream revision and regenerated from source using `scripts/import-ditherista.py`.

`perceptual.ts` converts sRGB/linear RGB to D65 CIELAB and creates a matcher that precomputes palette coordinates once per image. CIEDE2000 is intentionally labeled slower. `quantization.ts` implements bounded Wu and deterministic K-means extraction alongside the existing median cut. A dedicated `palette-worker.ts` keeps extraction off the UI thread; stale results are discarded when the source changes.

Optional new recipe fields receive classic defaults when missing; invalid supplied values are rejected. Projects, saved presets, settings links, batch exports and video exports share the same validated Settings contract. Palettes can contain up to 256 colors. Large perceptual palettes can be expensive in motion previews; the preview remains adaptive and exports render every frame.

## Bounded methods

`engine/limits.ts` defines method-specific working-grid/motion caps and amortized work/deadline guards. `ditherista/dbs.ts` implements bounded filtered-error toggle/swap optimization; `curves.ts` caches L-system subtree transforms/bounds for streamed, pruned traversal; `remaining.ts` dispatches Lippens rank buckets, curve histories, grid and auto-threshold.

`motion/processor.ts` now owns the shared persistent-worker protocol, intent (preview/export), AbortSignal cancellation and main-thread watchdogs. Main image jobs use disposable instances of the same processor, so batch, still and motion processing share hard termination/recovery behavior. Worker-side size validation is repeated before algorithm buffers are allocated; image/motion exports additionally preflight before reading full pixel buffers or initializing encoders. Heavy motion jobs have an independent 90-second deadline, with decoder/encoder cleanup in `finally`.

See [performance limits](performance-limits.md) for exact budgets and output notices. Legacy recipes receive defaults for the new DBS/grid parameters; malformed values are rejected.
