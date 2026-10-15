import type { WorkBudget } from '../limits';
// Modified TypeScript adaptations of libdither's matrix, dot, tile and Riemersma methods.
// Copyright (C) 2022-2025 Robert Kist. See public/licenses/libdither*.txt.
import type { RGB, Settings, Kernel } from '../catalog';
import { clamp, luminance, noise } from '../color';
import { srgbToLinear } from '../perceptual';
import {
  orderedMatrices,
  dotMatrices,
  tileSets,
  extraKernels,
  variableData,
  allebachMatrices,
} from './data';
export { extraKernels };
const wrap = (v: number, n: number) => ((v % n) + n) % n;
export function matrixScreen(id: string, x: number, y: number, s: Settings): number | null {
  let u = x,
    v = y;
  if (s.matrixRotation === 90) {
    u = -y;
    v = x;
  } else if (s.matrixRotation === 180) {
    u = -x;
    v = -y;
  } else if (s.matrixRotation === 270) {
    u = y;
    v = -x;
  }
  const m = orderedMatrices[id];
  if (m)
    return Math.min(
      1,
      (m.values[wrap(v, m.height) * m.width + wrap(u, m.width)] + 0.5) / m.divisor,
    );
  if (id === 'variable-2' || id === 'variable-4') {
    const size = id === 'variable-2' ? 2 : 4;
    const thresholds =
      size === 2
        ? [-1.5, 1.5, 0.5, -0.5]
        : [-7.5, 0.5, -5.5, 2.5, 4.5, -3.5, 6.5, -1.5, -4.5, 3.5, -6.5, 1.5, 7.5, -0.5, 5.5, -2.5];
    return clamp(127.5 + s.matrixStep * thresholds[wrap(v, size) * size + wrap(u, size)]) / 255;
  }
  return null;
}
export function allebachScreen(width: number, height: number, seed: number, rotation = 0) {
  const columns = Math.ceil(width / 32),
    rows = Math.ceil(height / 32),
    map = new Uint8Array(columns * rows);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const left = x ? map[y * columns + x - 1] : -1,
        above = y ? map[(y - 1) * columns + x] : -1;
      const candidates = [0, 1, 2, 3].filter((v) => v !== left && v !== above);
      map[y * columns + x] = candidates[Math.floor(noise(x, y, seed) * candidates.length)];
    }
  return (x: number, y: number) => {
    let u = x % 32,
      v = y % 32;
    if (rotation === 90) {
      u = 31 - (y % 32);
      v = x % 32;
    } else if (rotation === 180) {
      u = 31 - (x % 32);
      v = 31 - (y % 32);
    } else if (rotation === 270) {
      u = y % 32;
      v = 31 - (x % 32);
    }
    return (
      (allebachMatrices[
        map[Math.floor(y / 32) * columns + Math.floor(x / 32)] * 1024 + v * 32 + u
      ] +
        0.5) /
      256
    );
  };
}
const variableKernels: Record<string, Kernel[]> = {};
for (const id of ['ostromoukhov', 'zhou-fang']) {
  const coefficients =
    id === 'ostromoukhov' ? variableData.ostro_coefs : variableData.zhoufang_coef;
  const divs = id === 'ostromoukhov' ? variableData.ostro_divs : variableData.zhoufang_divs;
  variableKernels[id] = Array.from({ length: 256 }, (_, i) => {
    const index = id === 'ostromoukhov' ? i : Math.min(127, i > 127 ? 255 - i : i),
      d = divs[index];
    return [
      [1, 0, coefficients[index * 3] / d],
      [-1, 1, coefficients[index * 3 + 1] / d],
      [0, 1, coefficients[index * 3 + 2] / d],
    ];
  });
}
export function variableKernel(id: string, level: number): Kernel | undefined {
  return variableKernels[id]?.[Math.round(clamp(level))];
}
export function zhouOffset(level: number, x: number, y: number, seed: number) {
  const i = Math.round(clamp(level)),
    index = Math.min(127, i > 127 ? 255 - i : i);
  return (-noise(x, y, seed) * 127 * variableData.rand_scale[index]) / 100;
}
export type Quantize = (r: number, g: number, b: number) => RGB;
/** Bounded Hilbert traversal: prune squares outside the image before descending.
 * Work follows image area, including on very thin or non-square inputs.
 */
export function visitHilbert(width: number, height: number, visit: (x: number, y: number) => void) {
  const size = 2 ** Math.ceil(Math.log2(Math.max(width, height)));
  function walk(
    x: number,
    y: number,
    xi: number,
    xj: number,
    yi: number,
    yj: number,
    n: number,
  ): void {
    const xs = [x, x + xi, x + yi, x + xi + yi],
      ys = [y, y + xj, y + yj, y + xj + yj];
    if (
      Math.min(...xs) >= width ||
      Math.min(...ys) >= height ||
      Math.max(...xs) <= 0 ||
      Math.max(...ys) <= 0
    )
      return;
    if (n === 0) {
      const px = Math.floor(x + (xi + yi) / 2),
        py = Math.floor(y + (xj + yj) / 2);
      if (px >= 0 && py >= 0 && px < width && py < height) visit(px, py);
      return;
    }
    walk(x, y, yi / 2, yj / 2, xi / 2, xj / 2, n - 1);
    walk(x + xi / 2, y + xj / 2, xi / 2, xj / 2, yi / 2, yj / 2, n - 1);
    walk(x + xi / 2 + yi / 2, y + xj / 2 + yj / 2, xi / 2, xj / 2, yi / 2, yj / 2, n - 1);
    walk(x + xi / 2 + yi, y + xj / 2 + yj, -yi / 2, -yj / 2, -xi / 2, -xj / 2, n - 1);
  }
  walk(0, 0, size, 0, 0, size, Math.log2(size));
}
export function advancedDither(
  work: Float32Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  s: Settings,
  quantize: Quantize,
  encode: (c: RGB) => RGB,
  budget?: WorkBudget,
): Uint8ClampedArray | null {
  const dot = dotMatrices[s.algorithm],
    tile = tileSets[s.algorithm],
    curve = s.algorithm.startsWith('riemersma');
  if (!dot && !tile && !curve) return null;
  const output = new Uint8ClampedArray(width * height * 4),
    offset = (50 - s.threshold) * 2.55;
  const pixel = (x: number, y: number, delta: RGB = [0, 0, 0]) => {
    const n = y * width + x,
      p = n * 3,
      jitter = (noise(x, y, s.seed) - 0.5) * s.jitter * 2.55;
    const c = quantize(
      work[p] + delta[0] + offset + jitter,
      work[p + 1] + delta[1] + offset + jitter,
      work[p + 2] + delta[2] + offset + jitter,
    );
    output.set([...encode(c), alpha[n]], n * 4);
    return c;
  };
  if (curve) {
    const length = Math.round(s.errorHistory),
      queue = Array.from({ length }, () => [0, 0, 0] as RGB);
    const original = s.algorithm === 'riemersma-original';
    const weights = Array.from({ length }, (_, i) =>
      original ? Math.round(16 ** (i / (length - 1))) / 16 : 2 ** ((i / length) * 10),
    );
    const sum = original ? 1 : weights.reduce((a, b) => a + b, 0);
    let head = 0;
    visitHilbert(width, height, (x, y) => {
      budget?.tick(length);
      const n = y * width + x,
        p = n * 3;
      if (!alpha[n]) {
        queue.forEach((q) => q.fill(0));
        head = 0;
        pixel(x, y);
        return;
      }
      const error: RGB = [0, 0, 0];
      for (let i = 0; i < length; i++)
        for (let c = 0; c < 3; c++)
          error[c] += (((queue[(head + i) % length][c] * weights[i]) / sum) * s.strength) / 100;
      const color = pixel(x, y, error);
      for (let c = 0; c < 3; c++)
        queue[head][c] = work[p + c] + (original ? 0 : error[c]) - color[c];
      head = (head + 1) % length;
    });
  } else if (dot) {
    const size = dot.size,
      order = Array.from({ length: size * size }, (_, i) => i).sort(
        (a, b) => dot.values[a] - dot.values[b],
      );
    for (let by = 0; by < height; by += size)
      for (let bx = 0; bx < width; bx += size)
        for (const index of order) {
          const lx = index % size,
            ly = Math.floor(index / size),
            x = bx + lx,
            y = by + ly;
          if (x >= width || y >= height) continue;
          const n = y * width + x,
            p = n * 3,
            color = pixel(x, y);
          if (!alpha[n]) continue;
          const neighbors: { p: number; weight: number }[] = [];
          let total = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = lx + dx,
                ny = ly + dy,
                weight = dot.weights[(dy + 1) * 3 + dx + 1];
              if (
                nx < 0 ||
                nx >= size ||
                ny < 0 ||
                ny >= size ||
                bx + nx >= width ||
                by + ny >= height ||
                dot.values[ny * size + nx] <= dot.values[index] ||
                !alpha[(by + ny) * width + bx + nx] ||
                weight <= 0
              )
                continue;
              neighbors.push({ p: ((by + ny) * width + bx + nx) * 3, weight });
              total += weight;
            }
          for (const next of neighbors)
            for (let c = 0; c < 3; c++)
              work[next.p + c] +=
                ((((work[p + c] - color[c]) * next.weight) / total) * s.strength) / 100;
        }
  } else if (tile) {
    // Select the best matching binary tile, including partial edge blocks.
    const inks =
      s.colorMode === 'rgb'
        ? ([
            [0, 0, 0],
            [255, 255, 255],
          ] as RGB[])
        : s.palette.map(
            (hex) =>
              [
                parseInt(hex.slice(1, 3), 16),
                parseInt(hex.slice(3, 5), 16),
                parseInt(hex.slice(5, 7), 16),
              ] as RGB,
          );

    const convert = (c: RGB): RGB =>
      s.workingSpace === 'linear' ? (c.map(srgbToLinear) as RGB) : c;
    const workingInks = inks.map(convert).sort((a, b) => luminance(...a) - luminance(...b));
    const low = quantize(...workingInks[0]),
      high = quantize(...workingInks[workingInks.length - 1]);
    const lo = luminance(...low),
      hi = luminance(...high),
      area = tile.width * tile.height;
    for (let by = 0; by < height; by += tile.height)
      for (let bx = 0; bx < width; bx += tile.width) {
        let best = 0,
          bestDistance = Infinity;
        for (let k = 0; k < tile.count; k++) {
          let bias = 0,
            error = 0;
          for (let y = 0; y < tile.height && by + y < height; y++)
            for (let x = 0; x < tile.width && bx + x < width; x++) {
              const n = (by + y) * width + bx + x,
                p = n * 3;
              if (!alpha[n]) continue;
              const value = clamp(
                (luminance(work[p], work[p + 1], work[p + 2]) + offset - lo) / (hi - lo || 1),
                0,
                1,
              );
              const d = ((value - tile.values[k * area + y * tile.width + x]) * alpha[n]) / 255;
              bias += d;
              error += Math.abs(d);
            }
          const distance = Math.abs(bias) + error;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = k;
          }
        }
        for (let y = 0; y < tile.height && by + y < height; y++)
          for (let x = 0; x < tile.width && bx + x < width; x++) {
            const n = (by + y) * width + bx + x;
            output.set(
              [...encode(tile.values[best * area + y * tile.width + x] ? high : low), alpha[n]],
              n * 4,
            );
          }
      }
  }
  return output;
}
