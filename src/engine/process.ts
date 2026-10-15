import { kernels, type RGB, type Settings } from './catalog';
import { clamp, hexRGB, luminance, nearest, noise } from './color';
import { applyEffects } from './effects';
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
function bayer(x: number, y: number, size: number): number {
  let value = 0;
  for (let bit = 0; bit < Math.log2(size); bit++) {
    const xb = (x >> bit) & 1,
      yb = (y >> bit) & 1;
    value = value * 4 + ((xb ^ yb) * 2 + yb);
  }
  return (value + 0.5) / (size * size);
}
function screen(x: number, y: number, s: Settings): number {
  const n = s.patternSize,
    u = x / n,
    v = y / n,
    fract = (a: number) => a - Math.floor(a);
  switch (s.algorithm) {
    case 'random':
      return noise(x, y, s.seed);
    case 'interleaved':
      return fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y + s.seed * 0.01));
    case 'bayer-2':
    case 'bayer-4':
    case 'bayer-8':
    case 'bayer-16':
      return bayer(x, y, Number(s.algorithm.split('-')[1]));
    case 'clustered':
      return (
        ([12, 5, 6, 13, 4, 0, 1, 7, 11, 3, 2, 8, 15, 10, 9, 14][(y % 4) * 4 + (x % 4)] + 0.5) / 16
      );
    case 'halftone':
      return Math.min(1, Math.hypot(fract(u) - 0.5, fract(v) - 0.5) * Math.SQRT2);
    case 'horizontal':
      return fract(v);
    case 'vertical':
      return fract(u);
    case 'diagonal':
      return fract(u + v);
    case 'crosshatch':
      return Math.min(fract(u + v), fract(u - v)) * 2;
    case 'rings':
      return fract(Math.hypot(x, y) / n);
    case 'spiral':
      return fract(Math.hypot(x, y) / n + Math.atan2(y, x) / Math.PI / 2);
    case 'waves':
      return fract(v + Math.sin(u) * 0.5);
    default:
      return 0.5;
  }
}
function cmyk(r: number, g: number, b: number, x: number, y: number, size: number): RGB {
  const k = 1 - Math.max(r, g, b) / 255,
    denom = 1 - k;
  const inks =
    denom > 0
      ? [(1 - r / 255 - k) / denom, (1 - g / 255 - k) / denom, (1 - b / 255 - k) / denom, k]
      : [0, 0, 0, 1];
  const dots = inks.map((ink, i) => {
    const a = ([15, 75, 0, 45][i] * Math.PI) / 180;
    const u = ((x * Math.cos(a) - y * Math.sin(a)) / size) % 1;
    const v = ((x * Math.sin(a) + y * Math.cos(a)) / size) % 1;
    const dx = ((u + 1) % 1) - 0.5,
      dy = ((v + 1) % 1) - 0.5;
    return ink >= 1 || Math.PI * (dx * dx + dy * dy) < ink ? 1 : 0;
  });
  return [
    255 * (1 - dots[0]) * (1 - dots[3]),
    255 * (1 - dots[1]) * (1 - dots[3]),
    255 * (1 - dots[2]) * (1 - dots[3]),
  ];
}
/** Pure image kernel: DOM-free, deterministic, and shared by preview/export. */
export function processImage(input: Pixels, s: Settings): Pixels {
  const scale = Math.max(1, Math.round(s.scale));
  const width = Math.ceil(input.width / scale),
    height = Math.ceil(input.height / scale);
  const work = new Float32Array(width * height * 3),
    alpha = new Uint8Array(width * height);
  const contrast = (100 + s.contrast) / 100;
  // Area averaging avoids the aliasing of point sampling when pixel scale increases.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        samples = 0;
      for (let yy = y * scale; yy < Math.min((y + 1) * scale, input.height); yy++)
        for (let xx = x * scale; xx < Math.min((x + 1) * scale, input.width); xx++) {
          const p = (yy * input.width + xx) * 4,
            opacity = input.data[p + 3] / 255;
          r += input.data[p] * opacity;
          g += input.data[p + 1] * opacity;
          b += input.data[p + 2] * opacity;
          a += opacity;
          samples++;
        }
      if (a > 0) {
        r /= a;
        g /= a;
        b /= a;
      }
      const gray = luminance(r, g, b),
        p = (y * width + x) * 3;
      for (const [c, value] of [r, g, b].entries()) {
        const saturated = gray + ((value - gray) * s.saturation) / 100;
        let v = clamp((saturated - 127.5) * contrast + 127.5 + s.brightness * 2.55);
        v = 255 * (v / 255) ** (1 / s.gamma);
        work[p + c] = s.invert ? 255 - v : v;
      }
      alpha[y * width + x] = Math.round((a / samples) * 255);
    }
  const palette = s.palette.map(hexRGB),
    output = new Uint8ClampedArray(width * height * 4);
  const serpentine = s.algorithm.endsWith('-serpentine');
  const kernel = kernels[s.algorithm.replace('-serpentine', '')];
  const quantize = (r: number, g: number, b: number): RGB =>
    s.colorMode === 'rgb'
      ? ([r, g, b].map(
          (v) => (Math.round((clamp(v) / 255) * (s.levels - 1)) * 255) / (s.levels - 1),
        ) as RGB)
      : nearest(r, g, b, palette);
  for (let y = 0; y < height; y++) {
    const reverse = serpentine && y % 2 === 1;
    for (let step = 0; step < width; step++) {
      const x = reverse ? width - 1 - step : step,
        p = (y * width + x) * 3,
        q = (y * width + x) * 4;
      const r = work[p],
        g = work[p + 1],
        b = work[p + 2];
      const thresholdOffset = (50 - s.threshold) * 2.55;
      const delta =
        kernel || s.algorithm === 'threshold'
          ? 0
          : ((screen(x, y, s) - 0.5) * 255 * s.strength) / 100;
      const color =
        s.algorithm === 'cmyk'
          ? cmyk(clamp(r), clamp(g), clamp(b), x, y, s.patternSize)
          : quantize(
              r + delta + thresholdOffset,
              g + delta + thresholdOffset,
              b + delta + thresholdOffset,
            );
      output.set([...color, alpha[y * width + x]], q);
      if (kernel && alpha[y * width + x] > 0)
        for (const [dx, dy, weight] of kernel) {
          const nx = x + (reverse ? -dx : dx),
            ny = y + dy;
          if (nx < 0 || nx >= width || ny >= height || alpha[ny * width + nx] === 0) continue;
          const dest = (ny * width + nx) * 3;
          for (let c = 0; c < 3; c++)
            work[dest + c] += ((work[p + c] - color[c]) * weight * s.strength) / 100;
        }
    }
  }
  const effected = applyEffects({ width, height, data: output }, s.effects, s.seed);
  if (scale === 1) return effected;
  const full = new Uint8ClampedArray(input.width * input.height * 4);
  for (let y = 0; y < input.height; y++)
    for (let x = 0; x < input.width; x++) {
      const p = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4,
        q = (y * input.width + x) * 4;
      full[q] = effected.data[p];
      full[q + 1] = effected.data[p + 1];
      full[q + 2] = effected.data[p + 2];
      full[q + 3] = input.data[q + 3];
    }
  return { width: input.width, height: input.height, data: full };
}
