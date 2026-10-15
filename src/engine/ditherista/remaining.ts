// Modified browser adaptations of libdither's remaining methods.
// Copyright (C) 2022-2025 Robert Kist; see public/licenses/libdither*.txt.
import type { RGB, Settings } from '../catalog';
import { clamp, luminance, noise, hexRGB } from '../color';
import { srgbToLinear, linearToSrgb } from '../perceptual';
import type { WorkBudget } from '../limits';
import { dotMatrices, lippensData } from './data';
import type { Quantize } from './process';
import { visitLSystem } from './curves';
import { directBinarySearch } from './dbs';
export function remainingDither(
  work: Float32Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  s: Settings,
  quantize: Quantize,
  encode: (c: RGB) => RGB,
  budget: WorkBudget,
): { data: Uint8ClampedArray; notice?: string } | null {
  const dbs = s.algorithm.startsWith('dbs-'),
    grid = s.algorithm.startsWith('grid-'),
    lip = s.algorithm.startsWith('lippens-'),
    curve = s.algorithm.startsWith('curve-'),
    auto = s.algorithm === 'auto-threshold';
  if (!dbs && !grid && !lip && !curve && !auto) return null;
  const data = new Uint8ClampedArray(width * height * 4),
    offset = auto ? 0 : (50 - s.threshold) * 2.55;
  const pixel = (x: number, y: number, delta: RGB = [0, 0, 0]) => {
    const n = y * width + x,
      p = n * 3,
      jitter = (noise(x, y, s.seed) - 0.5) * s.jitter * 2.55;
    const c = quantize(
      work[p] + offset + delta[0] + jitter,
      work[p + 1] + offset + delta[1] + jitter,
      work[p + 2] + offset + delta[2] + jitter,
    );
    data.set([...encode(c), alpha[n]], n * 4);
    return c;
  };
  if (lip) {
    const variant = s.algorithm.slice(8);
    const matrix =
      variant === 'guoliu'
        ? dotMatrices['dot-guoliu-16x16']
        : variant === 'mese'
          ? dotMatrices['dot-mese-16x16']
          : variant === 'knuth'
            ? dotMatrices['dot-knuth']
            : null;
    const classes = matrix?.values ?? lippensData.dotlippens_class_matrix,
      size = matrix?.size ?? 128;
    const coefficients =
      variant === '2'
        ? lippensData.dotlippens2_coe
        : variant === '3'
          ? lippensData.dotlippens3_coe
          : lippensData.dotlippens1_coe;
    const divisor = coefficients.reduce((a, b) => a + b, 0) / 2,
      heads = new Int32Array(256).fill(-1),
      next = new Int32Array(alpha.length),
      ranks = new Uint8Array(alpha.length);
    // One classification pass, then one visit per pixel (not 256 image rescans).
    for (let n = alpha.length - 1; n >= 0; n--) {
      budget.tick();
      const rank = classes[(Math.floor(n / width) % size) * size + ((n % width) % size)];
      ranks[n] = rank;
      next[n] = heads[rank];
      heads[rank] = n;
    }
    for (let rank = 0; rank < 256; rank++)
      for (let n = heads[rank]; n !== -1; n = next[n]) {
        budget.tick(25);
        const x = n % width,
          y = Math.floor(n / width),
          p = n * 3,
          c = pixel(x, y);
        if (!alpha[n]) continue;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx,
              ny = y + dy,
              w = coefficients[(dy + 2) * 5 + dx + 2];
            if (!w || nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const dest = ny * width + nx;
            if (ranks[dest] <= rank || !alpha[dest]) continue;
            for (let channel = 0; channel < 3; channel++)
              work[dest * 3 + channel] +=
                ((((work[p + channel] - c[channel]) * w) / divisor) * s.strength) / 100;
          }
      }
  } else if (curve) {
    const original = s.algorithm.endsWith('-original'),
      name = s.algorithm
        .slice(6)
        .replace(/-original$/, '')
        .replace(/-/g, '_');
    const length = Math.round(s.errorHistory),
      queue = Array.from({ length }, () => [0, 0, 0] as RGB);
    const weights = Array.from({ length }, (_, i) =>
      original ? Math.round(16 ** (i / (length - 1))) / 16 : 2 ** ((i / length) * 10),
    );
    const sum = original ? 1 : weights.reduce((a, b) => a + b, 0);
    let head = 0;
    const { seen, count } = visitLSystem(
      name,
      width,
      height,
      (x, y) => {
        budget.tick(length);
        const n = y * width + x,
          p = n * 3;
        if (!alpha[n]) {
          queue.forEach((q) => q.fill(0));
          head = 0;
          pixel(x, y);
          return;
        }
        const delta: RGB = [0, 0, 0];
        for (let i = 0; i < length; i++)
          for (let c = 0; c < 3; c++)
            delta[c] += (((queue[(head + i) % length][c] * weights[i]) / sum) * s.strength) / 100;
        const c = pixel(x, y, delta);
        for (let i = 0; i < 3; i++) queue[head][i] = work[p + i] + (original ? 0 : delta[i]) - c[i];
        head = (head + 1) % length;
      },
      budget,
    );
    for (let i = 0; i < seen.length; i++)
      if (!seen[i]) {
        budget.tick();
        pixel(i % width, Math.floor(i / width));
      }
    budget.check();
    return {
      data,
      ...(count < seen.length
        ? {
            notice: `Curve geometry leaves ${seen.length - count} pixels; those pixels use direct palette matching.`,
          }
        : {}),
    };
  } else {
    const inks =
      s.colorMode === 'rgb'
        ? ([
            [0, 0, 0],
            [255, 255, 255],
          ] as RGB[])
        : s.palette.map(hexRGB);
    const colors = inks
      .map((c) => (s.workingSpace === 'linear' ? (c.map(srgbToLinear) as RGB) : c))
      .sort((a, b) => luminance(...a) - luminance(...b));
    const low = colors[0],
      high = colors[colors.length - 1],
      lo = luminance(...low),
      hi = luminance(...high),
      target = new Float32Array(alpha.length);
    for (let i = 0; i < target.length; i++) {
      budget.tick();
      target[i] = clamp(
        (luminance(work[i * 3], work[i * 3 + 1], work[i * 3 + 2]) + offset - lo) / (hi - lo || 1),
        0,
        1,
      );
    }
    const emit = (bits: Uint8Array) => {
      for (let i = 0; i < bits.length; i++)
        data.set([...encode(bits[i] ? high : low), alpha[i]], i * 4);
    };
    if (dbs) {
      const result = directBinarySearch(
        target,
        alpha,
        width,
        height,
        Number(s.algorithm.slice(4)),
        s.dbsPasses,
        budget,
      );
      emit(result.bits);
      return {
        data,
        notice: `DBS: ${result.passes} pass${result.passes === 1 ? '' : 'es'} · ${result.converged ? 'converged' : 'pass limit reached'}.`,
      };
    }
    if (auto) {
      let min = 1,
        max = 0,
        sum = 0,
        count = 0;
      for (let i = 0; i < target.length; i++)
        if (alpha[i]) {
          const v = s.workingSpace === 'linear' ? linearToSrgb(target[i] * 255) / 255 : target[i];
          min = Math.min(min, v);
          max = Math.max(max, v);
          sum += v;
          count++;
        }
      const avg = count ? sum / count : 0,
        range = count ? max - min : 0;
      let threshold = clamp(
        avg + (avg < srgbToLinear(127.5) / 255 ? -1 : 1) * (1 - range) * 0.5,
        0,
        1,
      );
      if (s.workingSpace === 'linear') threshold = srgbToLinear(threshold * 255) / 255;
      threshold = (0.5 * s.jitter) / 100 + threshold * (1 - s.jitter / 100);
      const bits = Uint8Array.from(target, (v, i) =>
        v + ((noise(i % width, Math.floor(i / width), s.seed) - 0.5) * s.jitter) / 100 > threshold
          ? 1
          : 0,
      );
      emit(bits);
    } else {
      const bits = new Uint8Array(alpha.length).fill(1),
        balanced = s.algorithm === 'grid-balanced';
      for (let by = 0; by < height; by += s.gridHeight)
        for (let bx = 0; bx < width; bx += s.gridWidth) {
          const points: number[] = [];
          let sum = 0;
          for (let y = by; y < Math.min(height, by + s.gridHeight); y++)
            for (let x = bx; x < Math.min(width, bx + s.gridWidth); x++) {
              const i = y * width + x;
              if (alpha[i]) {
                points.push(i);
                sum += target[i];
              }
            }
          const n = points.length;
          if (!n) continue;
          const darkness = 1 - sum / n,
            effort = 4 * n * darkness * darkness;
          if (effort < s.gridMinimum) continue;
          if (darkness >= 1) {
            for (const p of points) bits[p] = 0;
            continue;
          }
          if (balanced) {
            for (let i = n - 1; i > 0; i--) {
              budget.tick();
              const j = Math.floor(noise(bx + i, by, s.seed) * (i + 1));
              [points[i], points[j]] = [points[j], points[i]];
            }
            for (let i = 0; i < Math.round(n * darkness * darkness); i++) bits[points[i]] = 0;
          } else
            for (let i = 0; i < Math.floor(effort); i++) {
              budget.tick();
              bits[points[Math.floor(noise(bx + i, by, s.seed) * n)]] = 0;
            }
        }
      emit(bits);
    }
  }
  budget.check();
  return { data };
}
