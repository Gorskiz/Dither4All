# Feature scope

Feature scope for Dither4All's independent image editor. No application binary, extracted module, proprietary source, preset, or graphic was used.

| Public feature category                         | Dither4All implementation                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Error diffusion                                 | Original 12 kernels/3 scanning variants, 7 more kernels, all-kernel serpentine/jitter controls           |
| Ordered dithering                               | 43 matrix/screen styles including blue noise, Bayer 3/32, clustered/dispersed/magic screens              |
| Pattern/halftone effects                        | Dots, horizontal/vertical/diagonal lines, crosshatch, rings, spiral, waves                               |
| Full color and CMYK                             | Custom palettes, five distance metrics, linear/sRGB working spaces, RGB quantization and CMYK screens    |
| Color extraction and shared palettes            | Median cut, Wu and K-means; 2–256 editable colors; JSON/hex/GPL import/export                            |
| Stackable effects                               | 24 independent effect types, 12 layers, intensity, enable/disable, reorder                               |
| Glow, chromatic aberration, glitch              | Original soft glow/bloom, channel shifts, displacements, compression-block approximation                 |
| Image adjustments                               | Brightness, contrast, gamma, saturation, inversion, scale, strength, threshold                           |
| Presets                                         | Starting points, 50 local saved presets, import/export, settings links                                   |
| Batch processing                                | Original-size PNGs in a ZIP, sequential processing and cancellation                                      |
| Vector export                                   | Color or black-only pixel paths; not contour tracing or embroidery output                                |
| Projects                                        | Image/poster + settings + timeline in `.d4a`; video originals are relinked                               |
| Video / animation / temporal effects            | Video decode, timeline/trim, numeric keyframes, five motion modes, MP4/WebM/audio, GIF and PNG sequences |
| Bespoke commercial algorithms and named effects | Not reproduced; internal behavior is unknown                                                             |

This is feature-category coverage, not a claim of identical algorithms, equal counts, or pixel-perfect parity. Three serpentine entries are explicitly labeled variants, not newly invented algorithms. Compression blocks approximate a visual artifact; they do not corrupt actual JPEG bitstreams. CMYK is an RGB display simulation, not a color-managed print separation workflow.


Ditherista/libdither additions and source/license details are tracked in [the source audit](ditherista-audit.md). The 126-style count includes matrix variants and the three legacy serpentine aliases; it is not a count of 96 unrelated algorithms.

All remaining native dithering families are included in version 0.4: DBS, Lippens–Philips, remaining curves, grid and automatic threshold. See [resource limits](performance-limits.md). Four palette extractors now include KD-tree refinement.
