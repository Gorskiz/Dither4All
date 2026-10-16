import { createNoise4D } from 'simplex-noise';
import { clamp, hexRGB, noise } from '../engine/color';
import type { Settings } from '../engine/catalog';
import { processImage, type Pixels } from '../engine/process';
import type { Intent } from '../engine/limits';
import { validateMotionFrame, type MotionFrame } from './catalog';

const TAU = Math.PI * 2;
const COVERAGE = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const fract = (x: number) => x - Math.floor(x);
let cachedSeed: number | undefined;
let field: ReturnType<typeof createNoise4D>;
function noiseField(seed: number) {
  if (cachedSeed !== seed) {
    let state = seed | 0 || 1;
    field = createNoise4D(() => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    });
    cachedSeed = seed;
  }
  return field;
}

/** Pure frame evaluation. No wall clock, random state, DOM, or previous-frame dependency. */
export function applyMotionEffects(image: Pixels, frame: MotionFrame, settings: Settings): Pixels {
  let pixels = image;
  const { width: w, height: h } = image;
  const size = Math.min(w, h);
  for (const e of frame.effects) {
    if (!e.enabled || e.amount === 0) continue;
    if (e.type === 'palette' && settings.colorMode !== 'palette') {
      pixels = {
        ...pixels,
        notice: [pixels.notice, 'Palette cycling requires Palette color mode.']
          .filter(Boolean)
          .join(' · '),
      };
      continue;
    }
    const a = e.amount / 100;
    // Integer cycles and wrapped phase give every effect matching loop endpoints.
    const cycle = fract(frame.progress * e.cycles + e.phase / 360);
    const angle = cycle * TAU;
    const source = pixels.data;
    const out = new Uint8ClampedArray(source.length);
    const sample = (x: number, y: number, c: number) =>
      source[(clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)) * 4 + c];

    // Evaluate smooth 4D noise on a small normalized vector grid, then interpolate.
    // Noise cost stays bounded instead of requiring two 4D samples per output pixel.
    const cols = 24,
      rows = Math.max(2, Math.min(96, Math.round((24 * h) / w)));
    let flow: Float32Array | undefined;
    if (e.type === 'flow') {
      const n = noiseField(settings.seed);
      flow = new Float32Array((cols + 1) * (rows + 1) * 2);
      for (let gy = 0; gy <= rows; gy++)
        for (let gx = 0; gx <= cols; gx++) {
          const i = (gy * (cols + 1) + gx) * 2;
          const u = (((gx / cols) * w) / size) * 3,
            v = (((gy / rows) * h) / size) * 3;
          flow[i] = n(u, v, Math.cos(angle), Math.sin(angle));
          flow[i + 1] = n(u + 37, v + 19, Math.cos(angle), Math.sin(angle));
        }
    }
    const swatches = settings.palette.map(hexRGB);
    const paletteOffset = Math.floor(cycle * swatches.length);
    const exact = new Map(swatches.map((rgb, i) => [(rgb[0] << 16) | (rgb[1] << 8) | rgb[2], i]));
    const nearest = e.type === 'palette' ? new Int16Array(32768).fill(-1) : null;
    const burst = Math.floor(cycle * 12);
    const active = fract(cycle * 12) < 0.28 && noise(burst, 13, settings.seed) > 0.35;
    const shockWidth = Math.max(1, size * 0.09);
    // Start before the center and finish past the corners, so the ring resets off-image.
    const shockRadius = -shockWidth + cycle * (Math.hypot(w / 2, h / 2) + 2 * shockWidth);
    const twistRadius = size * 0.5;
    const twistAngle = Math.sin(angle) * a * 2.4;
    const waterline = Math.round(h * (1 - a * 0.5));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        let sx = x,
          sy = y;
        if (flow) {
          const gx = (x / w) * cols,
            gy = (y / h) * rows;
          const ix = Math.floor(gx),
            iy = Math.floor(gy),
            fx = gx - ix,
            fy = gy - iy;
          const i = (iy * (cols + 1) + ix) * 2;
          for (let c = 0; c < 2; c++) {
            const v =
              (flow[i + c] * (1 - fx) + flow[i + 2 + c] * fx) * (1 - fy) +
              (flow[i + (cols + 1) * 2 + c] * (1 - fx) + flow[i + (cols + 1) * 2 + 2 + c] * fx) *
                fy;
            if (c === 0) sx += v * size * a * 0.07;
            else sy += v * size * a * 0.07;
          }
        } else if (e.type === 'ripple') {
          const dx = (x + 0.5 - w / 2) / size,
            dy = (y + 0.5 - h / 2) / size;
          const d = Math.hypot(dx, dy);
          const shift = Math.sin(d * 35 - angle) * size * a * 0.025 * Math.min(1, d * 12);
          if (d > 0) {
            sx += (dx / d) * shift;
            sy += (dy / d) * shift;
          }
        } else if (e.type === 'shockwave') {
          const dx = x + 0.5 - w / 2,
            dy = y + 0.5 - h / 2;
          const d = Math.hypot(dx, dy),
            delta = (d - shockRadius) / shockWidth;
          if (d > 0 && Math.abs(delta) < 1) {
            const shift = Math.sin(delta * Math.PI) * (1 - Math.abs(delta)) * a * size * 0.09;
            sx += (dx / d) * shift;
            sy += (dy / d) * shift;
          }
        } else if (e.type === 'twist') {
          const dx = x + 0.5 - w / 2,
            dy = y + 0.5 - h / 2;
          const d = Math.hypot(dx, dy);
          if (d < twistRadius) {
            const rotation = twistAngle * (1 - d / twistRadius) ** 2;
            const co = Math.cos(rotation),
              si = Math.sin(rotation);
            sx = w / 2 - 0.5 + dx * co - dy * si;
            sy = h / 2 - 0.5 + dx * si + dy * co;
          }
        } else if (e.type === 'reflection' && y >= waterline) {
          const depth = (y - waterline + 0.5) / Math.max(1, h - waterline);
          const wave = Math.sin(depth * 32 - angle) + 0.35 * Math.sin(depth * 63 + angle * 2);
          sx += wave * a * size * 0.035 * depth;
          sy = 2 * waterline - 1 - y;
        } else if (e.type === 'glitch' && active) {
          const row = Math.floor((y / h) * 36);
          if (noise(row, burst, settings.seed) > 0.55)
            sx += (noise(row, burst + 31, settings.seed) - 0.5) * w * a * 0.28;
        }
        for (let c = 0; c < 4; c++) out[p + c] = sample(sx, sy, c);
        if (e.type === 'glitch' && active) {
          out[p] = sample(sx + size * a * 0.012, sy, 0);
          out[p + 2] = sample(sx - size * a * 0.012, sy, 2);
        } else if (e.type === 'crt') {
          const bandDistance = Math.abs(fract(y / h - cycle + 0.5) - 0.5);
          const band = Math.max(0, 1 - bandDistance / 0.09);
          const scan = 0.5 + 0.5 * Math.cos((y / h) * 180 * TAU - angle);
          const gain = 1 - a * (0.18 * scan + 0.42 * band);
          for (let c = 0; c < 3; c++) out[p + c] = source[p + c] * gain;
        } else if (nearest) {
          // Amount controls coverage with a fixed ordered mask: colors stay in the palette.
          if (
            (COVERAGE[(Math.floor((y / h) * 128) % 4) * 4 + (Math.floor((x / w) * 128) % 4)] +
              0.5) /
              16 >
              a ||
            paletteOffset === 0
          )
            continue;
          const r = source[p],
            g = source[p + 1],
            b = source[p + 2];
          let index = exact.get((r << 16) | (g << 8) | b);
          if (index === undefined) {
            const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
            if (nearest[key] < 0) {
              let best = Infinity;
              // Quantized lookup bounds matching work even for RGB images altered by earlier effects.
              const qr = (r & 248) + 4,
                qg = (g & 248) + 4,
                qb = (b & 248) + 4;
              swatches.forEach((rgb, i) => {
                const d = (rgb[0] - qr) ** 2 + (rgb[1] - qg) ** 2 + (rgb[2] - qb) ** 2;
                if (d < best) {
                  best = d;
                  nearest[key] = i;
                }
              });
            }
            index = nearest[key];
          }
          out.set(swatches[(index + paletteOffset) % swatches.length], p);
        }
      }
    pixels = { ...pixels, data: out };
  }
  return pixels;
}

/** Shared worker entry point for preview, current-frame, and every export format. */
export function processMotionFrame(
  input: Pixels,
  settings: Settings,
  frame: unknown,
  intent: Intent,
): Pixels {
  const motion = validateMotionFrame(frame);
  return applyMotionEffects(processImage(input, settings, intent), motion, settings);
}
