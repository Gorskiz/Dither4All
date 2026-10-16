# Dither4All

**Free online dither.** An open-source image and motion studio that runs entirely in your browser.

No account. No media uploads. No paid tier. MIT licensed.

[Open the editor](https://gorskiz.github.io/Dither4All/) · [Report a bug](https://github.com/Gorskiz/Dither4All/issues)

![Dither4All image workshop with a dithered orbital landscape](docs/preview.png)

## Development

```sh
npm ci
npm run dev
npm test
npm run build
```

Requires Node.js 22.12+; Node.js 24 is used in CI.

## What you can make

- **126 selectable styles:** 94 additions adapted from Ditherista/libdither, including blue noise, clustered/dispersed matrices, dot diffusion, binary tiles, Ostromoukhov/Zhou–Fang and Hilbert-curve Riemersma. The original 32 styles remain available. Now includes bounded DBS (7 formulas), all Lippens–Philips variants, all upstream curve definitions, grid and automatic thresholding. Browse a searchable contact sheet with real sample thumbnails for every style; adjust contextual parameters. Previews render lazily in a separate worker and stay cached for the session. [Heavy-method limits](docs/performance-limits.md).
- **24 stackable effects:** glow, bloom, chromatic aberration, RGB split, scanlines, grain, vignette, color adjustments, distortion, glitch, edge ink, and more. Toggle, reorder, or adjust up to 12 layers.
- **Color:** 12 built-in palettes, editable 2–256-color palettes, median-cut/Wu/K-means/KD-tree extraction, RGB quantization, and JSON/hex/GIMP palette imports and exports.
- **Color science:** classic sRGB or linear-light averaging/diffusion; weighted RGB, Euclidean RGB, CIELAB, CIEDE2000 or luminance-only palette matching. Existing recipes retain their classic defaults.
- **Image adjustments:** pixel scale, strength, threshold, pattern size, brightness, contrast, gamma, saturation, inversion, and a reproducible random seed.
- **Workflow:** a continuous photo-editor inspector beside a persistent canvas, before/after comparison, zoom, undo/redo, drag and drop, clipboard paste/copy, five starting presets, saved browser presets, portable preset files, and settings links.
- **Motion:** video import, silent playback, scrubbing, trim points, looping, adjustment keyframes, noise boil, brightness pulse, zoom and horizontal drift, plus stackable flowing displacement, animated ripple, glitch bursts, CRT roll, palette cycling, shockwave, twist and water reflection. Six one-click animation looks combine source motion and effects. Save, rename and delete your own animation presets in the browser, or import/export JSON to share and back them up. Export MP4/WebM with optional source audio, animated GIF, or PNG frames in a ZIP. [Motion guide](docs/motion.md).
- **Files:** PNG/JPEG/WebP, SVG pixel-run paths in color or black ink, embedded-image `.d4a` project files, and batch processing to a ZIP.

All image/video decoding and processing happens on your device. No accounts, telemetry, remote fonts, image uploads, API keys, or backend. The host still receives ordinary requests to load the app. Local presets use browser storage. Shared settings links contain no image; project files do contain the source image.

## Running and contributing

```sh
npm run dev                 # local editor
npm test                    # deterministic engine and file tests
npx playwright install chromium
npm run test:browser        # complete browser workflows
npm run build               # type check and static production build
npm run preview             # serve the production build
```

`dist/` is portable static output. GitHub Actions checks the source and deploys `main` to GitHub Pages when Pages is enabled with the GitHub Actions source. No hosting credentials are needed in the source.

See [CONTRIBUTING.md](CONTRIBUTING.md), the [architecture](docs/architecture.md), [feature scope](docs/features.md), and [algorithm references](docs/algorithms.md).

## Practical limits

- Input: 50 MB, 16 megapixels, at most 8192 pixels per side. Decoder support depends on the browser. GIF/animated image imports use one frame.
- Preview: longest side 1100 pixels. Texture frequency is approximated at reduced preview size; full-resolution exports can contain finer detail.
- SVG: at most one megapixel. These are real filled pixel paths, not smooth contour tracing or embroidery machine instructions. Black SVG drops pixels with luminance ≥128.
- Batch: 20 files, 100 MB total input, 250 MB total encoded output. Files are processed sequentially; cancel stops the current worker. Batch always exports original-size PNGs using a snapshot of the current settings.
- Effect layers run after dithering and may introduce colors outside the selected palette. Effects use the reduced pixel grid, then the result is expanded without changing the source dimensions.
- Heavy methods enforce working-grid, operation and worker-time budgets; previews are capped per method. Motion has stricter per-frame/total-frame limits, and DBS is capped at 12 FPS. Exports reject oversized work with actionable errors.
- Large images and long effect stacks can be slow or memory-intensive on phones. Motion exports: up to 30 seconds, 900 frames, longest side 1280 px (GIF: 640 px). Inputs: 500 MB, 2 hours, 16 MP/frame. WebCodecs support varies; try another output format if a codec is unavailable.

## License and independence

Original implementations and attributed adaptations of documented image-processing algorithms. See the [Ditherista source audit](docs/ditherista-audit.md) for precisely what was adopted and what remains outside scope.

Original app code and procedural sample artwork: [MIT](LICENSE). Runtime media libraries retain their own licenses: Mediabunny (MPL-2.0) and gifenc (MIT). Adapted libdither tables/methods retain Robert Kist’s BSD-style terms and bundled third-party notices; the blue-noise texture is Christoph Peters’ CC0 work. See [third-party notices](public/third-party-notices.txt). Build/test dependencies retain their own licenses. Public product demonstrations informed the feature categories; they do not establish implementation or exact output parity.
