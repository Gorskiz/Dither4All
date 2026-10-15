import { describe, expect, it } from 'vitest';
import { defaults, type Settings } from '../src/engine/catalog';
import { processImage, type Pixels } from '../src/engine/process';
import { applyMotionEffects, processMotionFrame } from '../src/motion/effects';
import { motionEffects, newMotionEffect, type MotionEffectType } from '../src/motion/catalog';
import { motionAt, sampleTime, timelineDefaults, validateTimeline } from '../src/motion/model';
import { readProject } from '../src/files';

const types = Object.keys(motionEffects) as MotionEffectType[];
const settings: Settings = {
  ...structuredClone(defaults),
  palette: ['#000000', '#ff0000', '#00ff00', '#ffffff'],
};
function fixture(): Pixels {
  const width = 64,
    height = 48;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      data.set([x * 4, y * 5, (x * 13 + y * 19) % 256, (x + y) % 5 === 0 ? 0 : 180], p);
    }
  return { width, height, data };
}
describe('motion effect rendering', () => {
  it.each(types)(
    '%s is deterministic, changes over time, and leaves its input untouched',
    (type) => {
      const input = fixture(),
        before = new Uint8ClampedArray(input.data);
      const effects = [{ ...newMotionEffect(type), amount: 100 }];
      const render = (progress: number) =>
        applyMotionEffects(input, { effects, progress }, settings);
      expect(render(0.3)).toEqual(render(0.3));
      // Burst effects have deliberately quiet intervals; sample a whole cycle.
      const frames = Array.from({ length: 48 }, (_, i) => render(i / 48).data);
      expect(frames.some((f) => f.some((v, i) => v !== frames[0][i]))).toBe(true);
      expect(input.data).toEqual(before);
      expect(render(0)).toEqual(render(1));
      if (type === 'crt' || type === 'palette')
        expect(render(0.3).data.filter((_, i) => i % 4 === 3)).toEqual(
          input.data.filter((_, i) => i % 4 === 3),
        );
    },
  );
  it('disabled and zero amount effects are exact no-ops, including RGB palette cycling', () => {
    const p = fixture();
    for (const type of types)
      for (const effect of [
        { ...newMotionEffect(type), enabled: false },
        { ...newMotionEffect(type), amount: 0 },
      ])
        expect(applyMotionEffects(p, { effects: [effect], progress: 0.5 }, settings)).toBe(p);
    const rgb = applyMotionEffects(
      p,
      { effects: [newMotionEffect('palette')], progress: 0.5 },
      { ...settings, colorMode: 'rgb' },
    );
    expect(rgb.data).toBe(p.data);
    expect(rgb.notice).toContain('Palette color mode');
  });
  it('stack order matters and palette cycling preserves palette colors and alpha', () => {
    const input = processImage(fixture(), settings);
    const effects = ['crt', 'palette'].map((type) => ({
      ...newMotionEffect(type as MotionEffectType),
      amount: 100,
    }));
    const a = applyMotionEffects(input, { effects, progress: 0.4 }, settings);
    const b = applyMotionEffects(
      input,
      { effects: [...effects].reverse(), progress: 0.4 },
      settings,
    );
    expect(a.data).not.toEqual(b.data);
    const palette = new Set(['0,0,0', '255,0,0', '0,255,0', '255,255,255']);
    for (let i = 0; i < a.data.length; i += 4) {
      expect(palette.has(Array.from(a.data.subarray(i, i + 3)).join(','))).toBe(true);
      expect(a.data[i + 3]).toBe(input.data[i + 3]);
    }
  });
  it('preview/export produce identical pixels at matching dimensions and phase survives scrubbing', () => {
    const t = timelineDefaults();
    t.effects = types.map((type) => newMotionEffect(type));
    t.effects[0].phase = 73;
    const frame = motionAt(t, sampleTime(t, 1.23));
    const input = fixture();
    expect(processMotionFrame(input, settings, frame, 'preview')).toEqual(
      processMotionFrame(input, settings, frame, 'export'),
    );
    const first = processMotionFrame(input, settings, frame, 'export');
    processMotionFrame(input, settings, motionAt(t, 3), 'export');
    expect(processMotionFrame(input, settings, frame, 'export')).toEqual(first);
    expect(sampleTime(t, 4)).toBeCloseTo(4 - 1 / 12);
  });
  it('moves alpha with geometry and handles narrow images without invalid samples', () => {
    for (const type of ['flow', 'ripple', 'glitch'] as const) {
      const input = fixture();
      const result = applyMotionEffects(
        input,
        { effects: [{ ...newMotionEffect(type), amount: 100 }], progress: 0.25 },
        settings,
      );
      for (let i = 3; i < result.data.length; i += 4) expect([0, 180]).toContain(result.data[i]);
      for (const width of [1, 2]) {
        const p = { width, height: 100, data: new Uint8ClampedArray(width * 100 * 4).fill(128) };
        expect(
          applyMotionEffects(
            p,
            { effects: [newMotionEffect(type)], progress: 0.2 },
            settings,
          ).data.every((v) => v === 128),
        ).toBe(true);
      }
    }
  });
});
describe('motion stack persistence and validation', () => {
  it('loads legacy projects and round-trips new stacks', () => {
    const t = timelineDefaults();
    const { effects: _, ...legacy } = t;
    expect(validateTimeline(legacy, 4).effects).toEqual([]);
    t.effects = types.map(newMotionEffect);
    t.effects[0].enabled = false;
    const project = {
      version: 1,
      name: 'stack',
      image: 'data:image/png;base64,AA==',
      settings,
      motion: { timeline: t, duration: 4 },
    };
    expect(readProject(JSON.stringify(project)).motion?.timeline).toEqual(t);
    expect(validateTimeline(t, 4).effects).not.toBe(t.effects);
  });
  it('rejects malformed or excessive effects at project and worker boundaries', () => {
    const e = newMotionEffect('flow');
    for (const effects of [
      null,
      {},
      Array(9).fill(e),
      [{ ...e, type: '__proto__' }],
      [{ ...e, type: ['flow'] }],
      [{ ...e, amount: NaN }],
      [{ ...e, amount: -1 }],
      [{ ...e, enabled: 1 }],
      [{ ...e, cycles: 1.5 }],
      [{ ...e, phase: 361 }],
    ]) {
      expect(() => validateTimeline({ ...timelineDefaults(), effects }, 4)).toThrow();
      expect(() =>
        processMotionFrame(fixture(), settings, { effects, progress: 0 }, 'export'),
      ).toThrow();
    }
    for (const progress of [NaN, Infinity, -1, 1.1])
      expect(() =>
        processMotionFrame(fixture(), settings, { effects: [], progress }, 'export'),
      ).toThrow();
  });
});
