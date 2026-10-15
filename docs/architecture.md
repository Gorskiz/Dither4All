# Architecture

## Runtime

Vite builds TypeScript and CSS into a static application. There are no runtime npm dependencies, remote fonts, remote images, or external script tags. The bundled sample is original procedural artwork generated in `src/sample.ts`.

`src/main.ts` owns editor state, bounded settings history, file operations, dialogs, and browser-local saved presets. `src/engine/catalog.ts` defines typed settings, effect identifiers, defaults, diffusion kernels, palettes, and strict import validation.

`src/engine/process.ts` is a pure typed-array pipeline:

1. Area-average source pixels to the selected pixel scale, weighting RGB by opacity.
2. Apply saturation, contrast, brightness, gamma, and source inversion.
3. Dither against a fixed palette or quantize RGB channels. CMYK uses its own source-color screens.
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

## Future work

Keep the image kernel separate from UI and decoding. A later video pipeline can supply decoded frames to the kernel, but must separately handle codecs, audio, memory bounds, frame timing, cancellation, and muxing. Do not add video dependencies to the image editor until that work is justified.
