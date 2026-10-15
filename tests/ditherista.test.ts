import { describe, it, expect } from 'vitest';
import { algorithms, defaults, cloneSettings, validateSettings } from '../src/engine/catalog';
import { processImage } from '../src/engine/process';
import { deltaE2000, toLab, srgbToLinear, linearToSrgb } from '../src/engine/perceptual';
import { quantizePalette } from '../src/engine/quantization';
import { additionalAlgorithms } from '../src/engine/ditherista/catalog';
import { orderedMatrices, dotMatrices, tileSets } from '../src/engine/ditherista/data';
import { visitHilbert } from '../src/engine/ditherista/process';
import { parsePalette } from '../src/files';
const image = (w = 19, h = 13) => ({
  width: w,
  height: h,
  data: new Uint8ClampedArray(
    Array.from({ length: w * h * 4 }, (_, i) =>
      i % 4 === 3
        ? Math.floor(i / 4) % 11 === 0
          ? 0
          : Math.floor(i / 4) % 7 === 0
            ? 42
            : 255
        : (Math.floor(i / 4) * 37 + (i % 4) * 61) % 256,
    ),
  ),
});
describe('Ditherista adaptations', () => {
  it('imports a complete catalog of valid tables without losing existing styles', () => {
    expect(algorithms).toHaveLength(126);
    expect(additionalAlgorithms).toHaveLength(94);
    expect(new Set(algorithms.map((a) => a[0])).size).toBe(126);
    for (const m of Object.values(orderedMatrices)) {
      expect(m.values).toHaveLength(m.width * m.height);
      expect(m.divisor).toBeGreaterThan(0);
      expect(m.values.every(Number.isFinite)).toBe(true);
    }
    for (const m of Object.values(dotMatrices))
      expect([...m.values].sort((a, b) => a - b)).toEqual(
        Array.from({ length: m.size ** 2 }, (_, i) => i),
      );
    for (const m of Object.values(tileSets))
      expect(m.values).toHaveLength(m.width * m.height * m.count);
  });
  it('renders every added style deterministically, preserves dimensions/alpha, and uses only palette colors', () => {
    const input = image(),
      original = new Uint8ClampedArray(input.data);
    for (const [algorithm] of additionalAlgorithms) {
      const s = { ...cloneSettings(defaults), algorithm, scale: 1, contrast: 0 };
      const result = processImage(input, s),
        again = processImage(input, s);
      expect(result, algorithm).toEqual(again);
      expect(result.width).toBe(input.width);
      expect(result.height).toBe(input.height);
      for (let i = 0; i < result.data.length; i += 4) {
        expect(result.data[i + 3], algorithm).toBe(input.data[i + 3]);
        expect(
          s.palette.map((c) => c.toLowerCase()),
          algorithm,
        ).toContain(
          '#' +
            Array.from(result.data.slice(i, i + 3))
              .map((v) => v.toString(16).padStart(2, '0'))
              .join(''),
        );
      }
    }
    expect(input.data).toEqual(original);
  });
  it('handles partial tiles and thin Hilbert images without missing or repeating pixels', () => {
    for (const [w, h] of [
      [1, 1],
      [1, 2049],
      [2049, 1],
      [19, 13],
      [32, 32],
    ]) {
      const visited = new Set<string>();
      visitHilbert(w, h, (x, y) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(w);
        expect(y).toBeLessThan(h);
        expect(visited.has(`${x},${y}`)).toBe(false);
        visited.add(`${x},${y}`);
      });
      expect(visited.size).toBe(w * h);
    }
    for (const algorithm of ['tile-5x2', 'dot-guoliu-16x16', 'riemersma'] as const) {
      const result = processImage(image(1, 3), { ...cloneSettings(defaults), algorithm, scale: 1 });
      expect(result.data.filter((_, i) => i % 4 === 3)).toEqual(
        image(1, 3).data.filter((_, i) => i % 4 === 3),
      );
    }
  });
  it('keeps old recipes compatible and rejects invalid advanced options', () => {
    const legacy = JSON.parse(JSON.stringify(defaults));
    for (const k of [
      'workingSpace',
      'colorDistance',
      'quantizer',
      'jitter',
      'serpentine',
      'matrixRotation',
      'matrixStep',
      'errorHistory',
    ])
      delete legacy[k];
    expect(validateSettings(legacy)).toEqual(defaults);
    for (const patch of [
      { jitter: NaN },
      { workingSpace: 'cmyk' },
      { colorDistance: 'bogus' },
      { quantizer: 'bogus' },
      { serpentine: 'true' },
      { matrixRotation: 45 },
      { matrixStep: 0 },
      { errorHistory: 1000 },
    ])
      expect(() => validateSettings({ ...defaults, ...patch })).toThrow();
    const colors = Array.from({ length: 256 }, (_, i) => `#${i.toString(16).padStart(2, '0')}0000`);
    expect(parsePalette(JSON.stringify(colors))).toHaveLength(256);
    expect(validateSettings({ ...defaults, palette: colors }).palette).toHaveLength(256);
    expect(() => validateSettings({ ...defaults, palette: [...colors, '#abcdef'] })).toThrow();
  });
  it('rotates matrix screens, changes scan direction and reproduces seeded jitter', () => {
    const input = image(31, 23),
      base = { ...cloneSettings(defaults), scale: 1 };
    expect(
      processImage(input, { ...base, algorithm: 'matrix-bayer3x3', matrixRotation: 90 }),
    ).not.toEqual(processImage(input, { ...base, algorithm: 'matrix-bayer3x3' }));
    expect(processImage(input, { ...base, serpentine: true })).toEqual(
      processImage(input, { ...base, algorithm: 'floyd-steinberg-serpentine' }),
    );
    expect(processImage(input, { ...base, jitter: 80, seed: 7 })).not.toEqual(
      processImage(input, { ...base, jitter: 80, seed: 8 }),
    );
  });
});
describe('color science and quantizers', () => {
  it('matches published CIEDE2000 reference pairs and handles hue wrapping', () => {
    // Sharma, Wu, Dalal (2005), supplementary test pairs, independently evaluated equation.
    for (const [a, b, expected] of [
      [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
      [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
      [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
      [[50, 0, 0], [50, -1, 2], 2.3669],
    ] as const) {
      expect(deltaE2000([...a], [...b])).toBeCloseTo(expected, 4);
      expect(deltaE2000([...b], [...a])).toBeCloseTo(expected, 4);
    }
    expect(deltaE2000([50, 0, 0], [50, 0, 0])).toBe(0);
    expect(toLab([255, 255, 255])[0]).toBeCloseTo(100, 4);
    expect(toLab([0, 0, 0])[0]).toBe(0);
    for (let v = 0; v <= 255; v++) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 8);
  });
  it('averages in linear light and keeps output palette colors exact in every matching mode', () => {
    const input = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
    };
    const s = {
      ...cloneSettings(defaults),
      algorithm: 'threshold' as const,
      scale: 2,
      contrast: 0,
      palette: ['#808080', '#bcbcbc'],
    };
    expect([...processImage(input, s).data.slice(0, 3)]).toEqual([128, 128, 128]);
    expect([...processImage(input, { ...s, workingSpace: 'linear' }).data.slice(0, 3)]).toEqual([
      188, 188, 188,
    ]);
    for (const colorDistance of ['weighted-rgb', 'rgb', 'lab', 'ciede2000', 'luminance'] as const) {
      const result = processImage(image(), {
        ...s,
        scale: 1,
        colorDistance,
        workingSpace: 'linear',
      });
      for (let i = 0; i < result.data.length; i += 4) expect([128, 188]).toContain(result.data[i]);
    }
  });
  it('extracts representative colors with all three methods without transparency contamination', () => {
    const data = new Uint8ClampedArray(
      Array.from({ length: 90 }, (_, i) =>
        i < 40 ? [240, 20, 30, 255] : i < 80 ? [20, 30, 240, 255] : [0, 255, 0, 0],
      ).flat(),
    );
    for (const method of ['median-cut', 'wu', 'kmeans'] as const) {
      expect(quantizePalette(data, 2, method)).toEqual(['#141ef0', '#f0141e']);
      expect(quantizePalette(data, 2, method)).toEqual(quantizePalette(data, 2, method));
      expect(() => quantizePalette(new Uint8ClampedArray(16), 4, method)).toThrow();
    }
    for (const method of ['wu', 'kmeans'] as const) {
      const result = quantizePalette(image(64, 64).data, 16, method);
      expect(result.length).toBeGreaterThan(2);
      expect(result.length).toBeLessThanOrEqual(16);
      expect(result.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    }
  });
});
