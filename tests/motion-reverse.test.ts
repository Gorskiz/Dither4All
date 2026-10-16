import { describe, expect, it } from 'vitest';
import { defaults } from '../src/engine/catalog';
import { processMotionFrame } from '../src/motion/effects';
import {
  animateNoise,
  frameCount,
  motionAt,
  motionProgress,
  phase,
  settingsAt,
  timelineDefaults,
  validateTimeline,
} from '../src/motion/model';
import {
  applyMotionAppearance,
  applyMotionPreset,
  matchesMotionPreset,
  motionPresets,
} from '../src/motion/presets';
import {
  exportMotionPresets,
  importMotionPresets,
  loadSavedMotionPresets,
  saveMotionPreset,
} from '../src/motion/saved-presets';

const pixels = {
  width: 32,
  height: 24,
  data: new Uint8ClampedArray(
    Array.from({ length: 32 * 24 }, (_, i) => [i % 256, (i * 7) % 256, (i * 13) % 256, 255]).flat(),
  ),
};

describe('reverse animation appearance', () => {
  it.each(motionPresets)(
    '$name previews/exports the same reversed phase, retaining timing and original preset settings',
    (preset) => {
      const base = {
        ...timelineDefaults(6),
        start: 1,
        end: 5,
        fps: 24,
        loop: false,
        keys: [{ channel: 'contrast' as const, time: 2, value: 25 }],
      };
      for (const speed of [0.25, 1, 1.5, 4]) {
        const forward = applyMotionPreset(base, preset.id, 50, speed);
        const reversed = applyMotionPreset(base, preset.id, 50, speed, true);
        expect(reversed).toEqual({ ...forward, reverse: true });
        expect(reversed).toEqual(validateTimeline(reversed, 6));
        expect(reversed).toMatchObject({ start: 1, end: 5, fps: 24, loop: false, keys: base.keys });
        expect(frameCount(reversed)).toBe(frameCount(base));
        expect(matchesMotionPreset(reversed, preset.id, 50, speed, true)).toBe(true);
        expect(matchesMotionPreset(reversed, preset.id, 50, speed)).toBe(false);
        expect(applyMotionPreset(reversed, preset.id, 50, speed, true)).toEqual(reversed);
        for (const time of [1, 1.5, 2.5, 5]) {
          const mirror = base.start + base.end - time;
          expect(motionProgress(reversed, time)).toBe(motionProgress(forward, mirror));
          expect(phase(reversed, time)).toBe(phase(forward, mirror));
          const expected = processMotionFrame(
            pixels,
            defaults,
            motionAt(forward, mirror),
            'export',
          );
          expect(processMotionFrame(pixels, defaults, motionAt(reversed, time), 'preview')).toEqual(
            expected,
          );
          expect(processMotionFrame(pixels, defaults, motionAt(reversed, time), 'export')).toEqual(
            expected,
          );
        }
      }
    },
  );
  it('reverses the complete discrete noise sequence including fractional-speed endpoints', () => {
    const t = { ...timelineDefaults(3.1), start: 0.5, effect: 'boil' as const };
    for (const fps of [6, 24])
      for (const speed of [0.25, 1, 1.5, 4]) {
        const forward = { ...t, fps, speed };
        const count = frameCount(forward);
        for (const frame of [0, 1, Math.floor(count / 2), count - 1]) {
          const result = animateNoise(
            pixels,
            { ...forward, reverse: true },
            t.start + frame / fps,
            42,
          );
          const expected = animateNoise(pixels, forward, t.start + (count - 1 - frame) / fps, 42);
          expect(result).toEqual(expected);
        }
      }
  });
  it('reverses brightness pulse while leaving adjustment keys on their own clock', () => {
    const forward = { ...timelineDefaults(), effect: 'pulse' as const, speed: 1.5 };
    expect(settingsAt(defaults, { ...forward, reverse: true }, 0.5)).toEqual(
      settingsAt(defaults, forward, 3.5),
    );
    const keyed = {
      ...timelineDefaults(),
      keys: [
        { channel: 'contrast' as const, time: 0, value: 0 },
        { channel: 'contrast' as const, time: 4, value: 100 },
      ],
    };
    expect(settingsAt(defaults, { ...keyed, reverse: true }, 1)).toEqual(
      settingsAt(defaults, keyed, 1),
    );
  });
  it('defaults old data to forward, validates booleans and shares the original direction', () => {
    const { reverse, ...legacy } = timelineDefaults();
    expect(validateTimeline(legacy, 4).reverse).toBe(false);
    expect(applyMotionAppearance(timelineDefaults(), legacy).reverse).toBe(false);
    for (const reverse of [null, 0, 1, 'false', {}, []])
      expect(() => validateTimeline({ ...legacy, reverse }, 4)).toThrow('reverse');
    const data = new Map<string, string>();
    const store = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const reversed = applyMotionPreset(timelineDefaults(), 'liquid-ink', 100, 1.5, true);
    saveMotionPreset(store, 'Backwards', reversed, 'reverse');
    const saved = loadSavedMotionPresets(store)[0];
    expect(saved.appearance.reverse).toBe(true);
    expect(applyMotionAppearance(reversed, saved.appearance).reverse).toBe(true);
    expect(applyMotionAppearance(reversed, saved.appearance, 100, 1, true).reverse).toBe(false);
    importMotionPresets(store, exportMotionPresets(store), () => 'copy');
    expect(loadSavedMotionPresets(store)[1].appearance).toEqual(saved.appearance);
  });
});
