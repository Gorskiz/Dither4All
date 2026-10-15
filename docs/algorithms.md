# Algorithm notes and references

All app implementations were written for this project. The references below describe the mathematical techniques; no commercial app modules were used.

## Error diffusion

For each pixel, select the nearest palette color, then distribute the difference into future neighboring pixels using a weighted kernel. Scanning direction alternates for the explicitly named serpentine variants. Atkinson distributes 6/8 of the error; the other included kernels sum to one.

Implemented kernels: Floyd–Steinberg, Atkinson, Jarvis–Judice–Ninke, Stucki, Burkes, Sierra, two-row Sierra, Sierra Lite, false Floyd–Steinberg, Stevenson–Arce, Shiau–Fan, and Shiau–Fan II. Palette matching uses weighted RGB distance; this is a practical artistic choice, not perceptually uniform color science.

- Tanner Helland, [Image Dithering: Eleven Algorithms and Source Code](https://tannerhelland.com/2012/12/28/dithering-eleven-algorithms-source-code.html).

## Ordered and pattern dithering

Bayer matrices are generated recursively from a 2 × 2 seed. The clustered screen is a fixed 4 × 4 threshold matrix. Pattern modes evaluate spatial threshold functions. These can be applied independently at each pixel, unlike diffusion's scan-order dependencies.

- Hugh Kennedy, [glsl-dither](https://github.com/hughsk/glsl-dither), a public Bayer implementation for comparison.
- EFHIII, [Dither images with any color palette](https://github.com/EFHIII/dithering), discussion of palette dithering and patterns (MIT-licensed project).

Threshold offsets and amplitude are artistic controls; changing them intentionally departs from default textbook output. Interleaved gradient noise uses a deterministic fractional spatial hash. Seeded noise and glitch/grain effects use a deterministic integer hash.

CMYK screens use angles 15°, 75°, 0°, and 45°. Darker channels increase dot coverage. They simulate overlapping inks in RGB, without an ICC profile or physical print calibration.

## Color and effects

Palette extraction uses bounded median-cut sampling. Semi-transparent colors are ignored during palette extraction below 50% opacity. Image downsampling uses opacity-weighted RGB averages. RGB quantization uses 2–16 discrete levels per channel.

Glow and bloom use separable box blur. Other effects use color matrices, quantization, deterministic noise, or coordinate remapping. These are original creative interpretations, not reimplementations of any product's proprietary effects.

The original orbital sample is generated with Canvas and mathematical shading; it has no external asset license requirements.
