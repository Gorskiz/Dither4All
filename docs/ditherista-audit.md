# Ditherista / libdither source audit

Reviewed 2026-10-15 at the user's request to adopt useful Ditherista features.

- [Ditherista](https://github.com/robertkist/ditherista): `24f1067f1af359e1a52fd9298f56300c4d181b66`, MIT.
- Its pinned [libdither](https://github.com/robertkist/libdither/tree/7bf49c5324b8b8d5ce321d549f89fb6c75a9d859) submodule: `7bf49c5324b8b8d5ce321d549f89fb6c75a9d859`, Robert Kist's BSD-style license with bundled notice requirements.
- Source inspected: README, help pages, GUI method dispatchers, `dither_*` methods/data, palette/quantization code and color models. No desktop application was installed or executed.

![Expanded styles and color controls](ditherista-preview.png)

## Adopted

| Upstream capability        | Dither4All integration                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ordered matrices           | All distinct fixed matrix definitions not already represented, plus CC0 blue noise, variable 2×2/4×4 and Kacker–Allebach. Rotation and variable matrix spacing exposed inline.                                                                               |
| Additional fixed diffusion | Xot, diagonal, Shiau Fan 2, 1D, 2D, Steve Pigeon and Robert Kist kernels, preserving existing identifiers and output defaults.                                                                                                                               |
| Variable diffusion         | Ostromoukhov and Zhou–Fang coefficient tables; original-tone selection, seeded noise and palette/color adaptations.                                                                                                                                          |
| Dot diffusion              | Knuth, mini/optimized Knuth, Mese 8/16, Guo–Liu 8/16, spiral/inverted spiral. Floating-point weights and transparent/partial-edge handling.                                                                                                                  |
| Pattern tiles              | Six upstream binary tile sets with block matching. Uses darkest/lightest palette inks and processes partial edge blocks.                                                                                                                                     |
| Riemersma                  | Original and modified weighted error histories along Hilbert and all seven additional upstream L-system curves. Traversal prunes out-of-image quadrants and covers every pixel, including the origin.                                                        |
| Serpentine and jitter      | Independent controls across fixed/variable diffusion; deterministic jitter across applicable families. Legacy scanning aliases still load unchanged.                                                                                                         |
| Linear color               | Optional linear-light downsampling, tonal processing and error diffusion; output re-encoded before effects. Classic sRGB remains the compatible default.                                                                                                     |
| Color matching             | Weighted RGB, RGB, CIELAB ΔE76, CIEDE2000 and luminance. Palette coordinates precomputed; CIEDE2000 equation independently implemented and reference-tested.                                                                                                 |
| Palette quantization       | Existing median cut plus Wu, deterministic K-means and bounded KD-tree extraction. Extraction runs in a worker. Palette capacity expanded to 256. The KD-tree method uses finite deterministic initialization and at most 10 unique-color refinement passes. |
| Workflow                   | Searchable style catalog, contextual method options, +/− zoom, period/double-click to fit, continuous inspector and scrollable large-palette swatches.                                                                                                       |
| Shared processing          | New image methods/settings also work in projects, presets, batch and motion exports through the shared worker.                                                                                                                                               |

There are now 126 selectable styles, 94 adapted additions to the original 32. Version 0.4 completes the remaining dithering families with 30 more styles. Matrix variants and the three legacy serpentine aliases are counted as styles, not newly invented algorithm families. Original algorithms/presets are preserved.

## Remaining-family integration (version 0.4)

- All seven DBS formulas use genuine toggle/swap optimization, bounded passes and worker budgets.
- All six Lippens–Philips variants use the upstream class/coefficient data with efficient rank buckets.
- All seven additional curve definitions are available with original and modified histories: modified Hilbert, Peano, FASS 0/1/2, Gosper and FASS spiral.
- Both grid modes and automatic thresholding are available, with seeded randomness and transparent/partial-cell fixes.
- The KD-tree palette method is included with finite initialization and bounded refinement.

See [performance limits](performance-limits.md) for exact pixel/frame/time limits, cancellation behavior and fidelity differences. This completes the dithering families invoked by the upstream method dispatchers; styles include variants and parameters, not 126 unrelated algorithms.

Desktop Qt windowing/installers, native platform services, icons and sample artwork remain outside the web app. Color-model/illuminant/component-weight controls beyond the existing five matching modes are not claimed. Browser codec availability and media limits still apply.

## Attribution and reproducibility

Numeric table extraction is reproducible with:

```sh
python3 scripts/import-ditherista.py /path/to/ditherista/libdither
npx prettier --write src/engine/ditherista/catalog.ts
```

The script verifies the exact reviewed revision and checks table dimensions/permutations. Generated data is intentionally excluded from Prettier. TypeScript code is a modified browser adaptation, including different RNG, palette/color extensions, preserved transparency, bounded traversal, valid-neighbor weighting and edge fixes. No pixel-identical upstream output claim is made.

[Runtime notices](../public/third-party-notices.txt), [libdither license](../public/licenses/libdither.txt), [required additional notices](../public/licenses/libdither-additional.txt), and [Ditherista MIT notice](../public/licenses/ditherista-MIT.txt) ship in the static app. The blue-noise texture is Christoph Peters' CC0 work. The mathematical CIEDE2000 implementation cites the published equation/test data; no restricted MATLAB code was copied.
