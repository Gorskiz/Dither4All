# Algorithm notes and references

The original image engine was written for this project. Version 0.3 adds attributed adaptations of libdither methods and numerical tables; see the [source audit](ditherista-audit.md). The references below describe the mathematical techniques; no commercial app modules were used.

## Error diffusion

For each pixel, select the nearest palette color, then distribute the difference into future neighboring pixels using a weighted kernel. Scanning direction alternates for the explicitly named serpentine variants or when Serpentine scan is enabled. Atkinson distributes 6/8 of the error; the other included kernels sum to one.

Implemented kernels: Floyd–Steinberg, Atkinson, Jarvis–Judice–Ninke, Stucki, Burkes, Sierra, two-row Sierra, Sierra Lite, false Floyd–Steinberg, Stevenson–Arce, Shiau–Fan, and Shiau–Fan II. Weighted RGB remains the compatible default. RGB distance, CIELAB ΔE76, CIEDE2000 and luminance matching are also available.

- Tanner Helland, [Image Dithering: Eleven Algorithms and Source Code](https://tannerhelland.com/2012/12/28/dithering-eleven-algorithms-source-code.html).

## Ordered and pattern dithering

Bayer matrices are generated recursively from a 2 × 2 seed. The clustered screen is a fixed 4 × 4 threshold matrix. Pattern modes evaluate spatial threshold functions. These can be applied independently at each pixel, unlike diffusion's scan-order dependencies.

- Hugh Kennedy, [glsl-dither](https://github.com/hughsk/glsl-dither), a public Bayer implementation for comparison.
- EFHIII, [Dither images with any color palette](https://github.com/EFHIII/dithering), discussion of palette dithering and patterns (MIT-licensed project).

Threshold offsets and amplitude are artistic controls; changing them intentionally departs from default textbook output. Interleaved gradient noise uses a deterministic fractional spatial hash. Seeded noise and glitch/grain effects use a deterministic integer hash.

CMYK screens use angles 15°, 75°, 0°, and 45°. Darker channels increase dot coverage. They simulate overlapping inks in RGB, without an ICC profile or physical print calibration.

## Color and effects

Palette extraction uses bounded sampling (up to about 16,000 points), with median cut, variance-minimizing Wu quantization or deterministic K-means (at most 16 refinement passes). Extraction runs in a worker. Semi-transparent colors are ignored during palette extraction below 50% opacity. Image downsampling uses opacity-weighted averages in the selected working space. Linear mode decodes sRGB before averaging, adjusts tones and diffuses errors in linear RGB, then re-encodes before applying artistic effects. CMYK retains its original RGB ink simulation. RGB quantization uses 2–16 discrete levels per channel.

Glow and bloom use separable box blur. Other effects use color matrices, quantization, deterministic noise, or coordinate remapping. These are original creative interpretations, not reimplementations of any product's proprietary effects.

The original orbital sample is generated with Canvas and mathematical shading; it has no external asset license requirements.

## Additional families

The pinned libdither data includes ordered screens and blue noise, nine dot-class matrices, six binary tile sets, seven additional fixed diffusion kernels, variable diffusion coefficient tables, and four Kacker–Allebach screens. Numerical data is reproducible with `scripts/import-ditherista.py`; licenses and upstream credits ship in `public/licenses`.

Dot diffusion processes pixels in each class matrix's rank order and sends error only to later valid neighbors. Floating-point Guo–Liu weights are preserved. Binary tiles choose among the upstream masks by block error, using the darkest/lightest working palette inks; partial edge blocks are processed. They are explicitly two-ink styles.

Ostromoukhov and Zhou–Fang coefficients are selected using the original, adjusted source tone. Color output extends the scalar methods to the shared palette pipeline; Zhou–Fang noise is seeded. Kacker–Allebach screens avoid equal neighboring block selections. These adaptations preserve transparency and fix edge cases rather than promise upstream byte identity.

Riemersma uses a bounded, pruned Hilbert traversal with original or normalized modified error histories. Transparent pixels clear the history. All pixels, including the origin and thin-image edges, are visited exactly once. This avoids constructing exponentially large curve strings.

CIEDE2000 implements the published equation with kL=kC=kH=1 and is tested against published supplementary pairs: [Sharma, Wu and Dalal](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/). CIELAB conversions use sRGB primaries and D65 white. No ICC color-management system is implied.
