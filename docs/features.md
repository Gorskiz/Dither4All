# Feature scope

Feature scope for Dither4All's independent image editor. No application binary, extracted module, proprietary source, preset, or graphic was used.

| Public feature category                         | Dither4All implementation                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Error diffusion                                 | 12 kernels plus 3 serpentine scanning variants                                           |
| Ordered dithering                               | Bayer 2/4/8/16 and a clustered-dot matrix                                                |
| Pattern/halftone effects                        | Dots, horizontal/vertical/diagonal lines, crosshatch, rings, spiral, waves               |
| Full color and CMYK                             | Custom palettes, channel quantization, four rotated simulated ink screens                |
| Color extraction and shared palettes            | Median cut, editable swatches, JSON/hex/GPL import, JSON export                          |
| Stackable effects                               | 24 independent effect types, 12 layers, intensity, enable/disable, reorder               |
| Glow, chromatic aberration, glitch              | Original soft glow/bloom, channel shifts, displacements, compression-block approximation |
| Image adjustments                               | Brightness, contrast, gamma, saturation, inversion, scale, strength, threshold           |
| Presets                                         | Starting points, 50 local saved presets, import/export, settings links                   |
| Batch processing                                | Original-size PNGs in a ZIP, sequential processing and cancellation                      |
| Vector export                                   | Color or black-only pixel paths; not contour tracing or embroidery output                |
| Projects                                        | Portable image + settings in a versioned `.d4a` file                                     |
| Video / animation / temporal effects            | Deferred; image-only release                                                             |
| Bespoke commercial algorithms and named effects | Not reproduced; internal behavior is unknown                                             |

This is feature-category coverage, not a claim of identical algorithms, equal counts, or pixel-perfect parity. Three serpentine entries are explicitly labeled variants, not newly invented algorithms. Compression blocks approximate a visual artifact; they do not corrupt actual JPEG bitstreams. CMYK is an RGB display simulation, not a color-managed print separation workflow.

