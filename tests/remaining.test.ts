import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaults, validateSettings, cloneSettings } from '../src/engine/catalog';
import { processImage } from '../src/engine/process';
import {
  methodLimits,
  assertProcessingSize,
  assertMotionBudget,
  WorkBudget,
} from '../src/engine/limits';
import { directBinarySearch, dbsKernel } from '../src/engine/ditherista/dbs';
import { visitLSystem } from '../src/engine/ditherista/curves';
import { curveDefinitions, lippensData } from '../src/engine/ditherista/data';
import { quantizePalette } from '../src/engine/quantization';
import { FrameProcessor } from '../src/motion/processor';
const budget = () => new WorkBudget(90_000_000, 8000);
const pixels = (w = 19, h = 13) => ({
  width: w,
  height: h,
  data: new Uint8ClampedArray(
    Array.from({ length: w * h * 4 }, (_, i) =>
      i % 4 === 3
        ? Math.floor(i / 4) % 7 === 0
          ? 0
          : Math.floor(i / 4) % 5 === 0
            ? 64
            : 255
        : (Math.floor(i / 4) * 31) % 256,
    ),
  ),
});
describe('remaining native methods', () => {
  it('DBS minimizes the actual filtered error objective with seven distinct filters', () => {
    const target = Float32Array.from({ length: 100 }, (_, i) => (i % 10) / 9),
      alpha = new Uint8Array(100).fill(255);
    const fingerprints = new Set<string>();
    for (let formula = 0; formula < 7; formula++) {
      const kernel = dbsKernel(formula);
      fingerprints.add(
        Array.from(kernel)
          .map((v) => v.toFixed(9))
          .join(','),
      );
      expect(kernel[0]).toBeCloseTo(kernel[168], 12);
      const result = directBinarySearch(target, alpha, 10, 10, formula, 4, budget());
      expect(result.finalEnergy).toBeLessThanOrEqual(result.initialEnergy + 1e-10);
      expect(result.passes).toBeLessThanOrEqual(4);
      expect([...result.bits].every((v) => v === 0 || v === 1)).toBe(true);
    }
    expect(fingerprints.size).toBe(7);
    for (const value of [0, 1]) {
      const result = directBinarySearch(
        new Float32Array(9).fill(value),
        new Uint8Array(9).fill(255),
        3,
        3,
        0,
        2,
        budget(),
      );
      expect(result.converged).toBe(true);
      expect(result.finalEnergy).toBe(0);
      expect([...result.bits].every((v) => v === value)).toBe(true);
    }
  });
  it('streams every exact L-system without duplicate in-bounds visits and bounds skinny inputs', () => {
    for (const name of Object.keys(curveDefinitions))
      for (const [width, height] of [
        [19, 13],
        [1, 257],
        [257, 1],
        [1, 1],
      ]) {
        const seen = new Set<string>(),
          b = budget();
        const result = visitLSystem(
          name,
          width,
          height,
          (x, y) => {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(width);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThan(height);
            expect(seen.has(`${x},${y}`)).toBe(false);
            seen.add(`${x},${y}`);
          },
          b,
        );
        expect(result.count, `${name} ${width}×${height}`).toBeGreaterThan(0);
        expect(result.count).toBeLessThanOrEqual(width * height);
        expect(b.operations).toBeLessThan(1_000_000);
      }
  });
  it('matches the known first-order Peano path rather than substituting Hilbert order', () => {
    const points: number[][] = [];
    visitLSystem('peano', 3, 3, (x, y) => points.push([x, y]), budget());
    expect(points).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });
  it('automatic thresholding ignores hidden RGB and retains all alpha values', () => {
    const p = pixels(4, 2),
      copy = { ...p, data: new Uint8ClampedArray(p.data) };
    for (let i = 0; i < copy.data.length; i += 4)
      if (!copy.data[i + 3]) {
        copy.data[i] = 255;
        copy.data[i + 1] = 0;
        copy.data[i + 2] = 255;
      }
    const s = { ...cloneSettings(defaults), algorithm: 'auto-threshold' as const, scale: 1 };
    const a = processImage(p, s),
      b = processImage(copy, s);
    expect(a).toEqual(b);
    expect(a.data.filter((_, i) => i % 4 === 3)).toEqual(p.data.filter((_, i) => i % 4 === 3));
  });
  it('imports the six Lippens variants with valid rank/coefficient data', () => {
    expect(lippensData.dotlippens_class_matrix).toHaveLength(16384);
    expect(Math.max(...lippensData.dotlippens_class_matrix)).toBe(255);
    for (const coefficients of [
      lippensData.dotlippens1_coe,
      lippensData.dotlippens2_coe,
      lippensData.dotlippens3_coe,
    ]) {
      expect(coefficients).toHaveLength(25);
      expect(coefficients.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    }
    for (const algorithm of [
      'lippens-1',
      'lippens-2',
      'lippens-3',
      'lippens-guoliu',
      'lippens-mese',
      'lippens-knuth',
    ] as const) {
      const p = pixels(5, 3),
        s = { ...cloneSettings(defaults), algorithm, scale: 1 };
      expect(processImage(p, s)).toEqual(processImage(p, s));
      expect(processImage(p, s).data.filter((_, i) => i % 4 === 3)).toEqual(
        p.data.filter((_, i) => i % 4 === 3),
      );
    }
  });
  it('grid placement is seeded, handles partial/transparent cells, and preserves solid endpoints', () => {
    const p = pixels();
    for (const algorithm of ['grid-random', 'grid-balanced'] as const) {
      const s = { ...cloneSettings(defaults), algorithm, scale: 1, gridWidth: 7, gridHeight: 4 };
      expect(processImage(p, s)).toEqual(processImage(p, s));
      expect(processImage(p, { ...s, seed: 999 })).not.toEqual(processImage(p, s));
      for (const value of [0, 255]) {
        const solid = {
          width: 3,
          height: 2,
          data: new Uint8ClampedArray(
            Array.from({ length: 6 }, () => [value, value, value, 255]).flat(),
          ),
        };
        const r = processImage(solid, { ...s, contrast: 0, palette: ['#000000', '#ffffff'] });
        expect([...r.data].every((v, i) => (i % 4 === 3 ? v === 255 : v === value))).toBe(true);
      }
    }
  });
  it('KD-tree quantization terminates for solid or tiny color sets and is repeatable', () => {
    for (const data of [new Uint8ClampedArray([200, 20, 30, 255]), pixels().data]) {
      const result = quantizePalette(data, 256, 'kdtree');
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result.length).toBeLessThanOrEqual(256);
      expect(result).toEqual(quantizePalette(data, 256, 'kdtree'));
    }
  });
});
describe('performance contracts', () => {
  it('rejects oversized work before allocating/processing pixels and respects pixel scale', () => {
    const s = { ...cloneSettings(defaults), algorithm: 'dbs-0' as const, scale: 1 };
    expect(() =>
      processImage({ width: 257, height: 256, data: new Uint8ClampedArray() }, s),
    ).toThrow('65,536');
    expect(() => assertProcessingSize(512, 512, { ...s, scale: 2 })).not.toThrow();
    expect(() => assertProcessingSize(512, 512, s)).toThrow();
    expect(() => assertMotionBudget(256, 256, s, 61, 12)).toThrow('motion limit');
    expect(() => assertMotionBudget(128, 128, s, 60, 24)).toThrow('12 FPS');
    expect(() => assertMotionBudget(128, 128, s, 60, 12)).not.toThrow();
    expect(methodLimits('floyd-steinberg')).toBeNull();
    for (const patch of [
      { dbsPasses: 9 },
      { dbsPasses: 1.5 },
      { gridWidth: 0 },
      { gridHeight: Infinity },
      { gridMinimum: -1 },
    ])
      expect(() => validateSettings({ ...defaults, ...patch })).toThrow();
  });
  it('enforces deterministic operation caps and independent wall deadlines', () => {
    expect(() => new WorkBudget(10, 8000).tick(11)).toThrow('operation budget');
    let time = 0;
    const b = new WorkBudget(10000, 5, () => time);
    time = 6;
    expect(() => b.tick(2048)).toThrow('time budget');
    expect(() =>
      directBinarySearch(
        new Float32Array(100).fill(0.3),
        new Uint8Array(100).fill(255),
        10,
        10,
        0,
        8,
        new WorkBudget(50, 8000),
      ),
    ).toThrow('operation budget');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('hard-terminates a hung worker, then permits a clean retry and abort', async () => {
    vi.useFakeTimers();
    let terminated = 0;
    class HungWorker {
      onmessage: unknown;
      onerror: unknown;
      postMessage() {}
      terminate() {
        terminated++;
      }
    }
    vi.stubGlobal('Worker', HungWorker);
    const processor = new FrameProcessor(),
      s = { ...cloneSettings(defaults), algorithm: 'dbs-0' as const };
    const pending = processor.process(pixels(), s);
    const rejected = expect(pending).rejects.toThrow('time limit');
    await vi.advanceTimersByTimeAsync(12001);
    await rejected;
    expect(terminated).toBe(1);
    const controller = new AbortController(),
      again = processor.process(pixels(), s, 'export', controller.signal),
      cancelled = expect(again).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await cancelled;
    expect(terminated).toBe(2);
    processor.dispose();
  });
});
