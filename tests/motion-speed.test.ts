import { describe, expect, it } from 'vitest';
import { defaults } from '../src/engine/catalog';
import { processMotionFrame } from '../src/motion/effects';
import {
  applyMotionAppearance,
  applyMotionPreset,
  motionPresets,
  matchesMotionPreset,
} from '../src/motion/presets';
import {
  animateNoise,
  frameCount,
  motionAt,
  phase,
  settingsAt,
  timelineDefaults,
  validateTimeline,
} from '../src/motion/model';
import { validateMotionFrame } from '../src/motion/catalog';
import {
  exportMotionPresets,
  importMotionPresets,
  loadSavedMotionPresets,
  saveMotionPreset,
} from '../src/motion/saved-presets';

describe('animation speed', () => {
  it.each(motionPresets)(
    '$name uses the same retimed effects in preview/export without altering timing or stacking multipliers',
    (preset) => {
      const base = {
        ...timelineDefaults(6),
        start: 1,
        end: 5,
        fps: 24,
        keys: [{ channel: 'contrast' as const, time: 2, value: 25 }],
      };
      const original = applyMotionPreset(base, preset.id);
      const image = {
        width: 32,
        height: 24,
        data: new Uint8ClampedArray(
          Array.from({ length: 32 * 24 }, (_, i) => [
            i % 256,
            (i * 7) % 256,
            (i * 13) % 256,
            255,
          ]).flat(),
        ),
      };
      for (const speed of [0.25, 0.5, 1, 1.5, 2, 4]) {
        const t = applyMotionPreset(base, preset.id, 50, speed);
        expect(t).toMatchObject({ speed, start: 1, end: 5, fps: 24, keys: base.keys });
        expect(t).toEqual(validateTimeline(t, 6));
        expect(frameCount(t)).toBe(frameCount(base));
        expect(matchesMotionPreset(t, preset.id, 50, speed)).toBe(true);
        expect(applyMotionPreset(t, preset.id, 50, speed)).toEqual(t);
        const time = 1.5;
        const retimed = base.start + (time - base.start) * speed;
        expect(phase(t, time)).toBe(phase(original, retimed));
        const unscaled = applyMotionPreset(base, preset.id, 50);
        const expected = processMotionFrame(image, defaults, motionAt(unscaled, retimed), 'export');
        expect(processMotionFrame(image, defaults, motionAt(t, time), 'preview').data).toEqual(
          expected.data,
        );
        expect(processMotionFrame(image, defaults, motionAt(t, time), 'export').data).toEqual(
          expected.data,
        );
      }
    },
  );
  it('retimes source noise and pulse but leaves adjustment keys on the original clock', () => {
    const t = { ...timelineDefaults(), speed: 0.5, effect: 'boil' as const };
    const pixels = { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(128) };
    expect(animateNoise(pixels, t, 2, 42)).toEqual(animateNoise(pixels, { ...t, speed: 1 }, 1, 42));
    expect(settingsAt(defaults, { ...t, effect: 'pulse' }, 2)).toEqual(
      settingsAt(defaults, { ...t, speed: 1, effect: 'pulse' }, 1),
    );
    const keyed = {
      ...t,
      keys: [
        { channel: 'contrast' as const, value: 0, time: 0 },
        { channel: 'contrast' as const, value: 100, time: 4 },
      ],
    };
    expect(settingsAt(defaults, keyed, 2).contrast).toBe(50);
    expect(settingsAt(defaults, { ...keyed, speed: 4 }, 2).contrast).toBe(50);
  });
  it('defaults legacy data to 1× and rejects invalid speed at both project and worker boundaries', () => {
    const { speed, ...legacy } = timelineDefaults();
    expect(validateTimeline(legacy, 4).speed).toBe(1);
    expect(applyMotionAppearance(timelineDefaults(), legacy).speed).toBe(1);
    for (const value of [0, 0.24, 4.01, NaN, Infinity, null, '2']) {
      expect(() => validateTimeline({ ...legacy, speed: value }, 4)).toThrow('speed');
      expect(() => validateMotionFrame({ effects: [], progress: 0.5, speed: value })).toThrow(
        'speed',
      );
    }
  });
  it('shares applied speed, scales saved originals once, and caps compounded variations', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const t = applyMotionPreset(timelineDefaults(), 'orbital-drift', 50, 2);
    saveMotionPreset(storage, 'Fast orbit', t, 'fast');
    const preset = loadSavedMotionPresets(storage)[0];
    expect(preset.appearance.speed).toBe(2);
    expect(applyMotionAppearance(t, preset.appearance, 100, 0.5).speed).toBe(1);
    expect(applyMotionAppearance(t, preset.appearance, 100, 4).speed).toBe(4);
    expect(applyMotionAppearance(t, { ...preset.appearance, speed: 0.25 }, 100, 0.25).speed).toBe(
      0.25,
    );
    importMotionPresets(storage, exportMotionPresets(storage), () => 'copy');
    expect(loadSavedMotionPresets(storage)[1].appearance).toEqual(preset.appearance);
  });
});
