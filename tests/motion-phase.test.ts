import { describe, expect, it } from 'vitest';
import { defaults } from '../src/engine/catalog';
import { processMotionFrame } from '../src/motion/effects';
import { validateMotionFrame } from '../src/motion/catalog';
import {
  animateNoise,
  frameCount,
  motionAt,
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
  saveMotionPreset,
  loadSavedMotionPresets,
  exportMotionPresets,
  importMotionPresets,
} from '../src/motion/saved-presets';

const image = {
  width: 32,
  height: 24,
  data: new Uint8ClampedArray(
    Array.from({ length: 32 * 24 }, (_, i) => [i % 256, (i * 7) % 256, (i * 13) % 256, 255]).flat(),
  ),
};

describe('preset phase', () => {
  it.each(motionPresets)(
    '$name offsets source/stack phases identically for preview and export, without compounding or changing timing',
    (preset) => {
      const base = {
        ...timelineDefaults(6),
        start: 1,
        end: 5,
        fps: 24,
        loop: false,
        keys: [{ channel: 'contrast' as const, time: 2, value: 25 }],
      };
      const original = applyMotionPreset(base, preset.id, 50, 1.5, true);
      for (const offset of [0, 45, 90, 270, 360]) {
        const shifted = applyMotionPreset(base, preset.id, 50, 1.5, true, offset);
        expect(shifted).toEqual({ ...original, phase: offset % 360 });
        expect(shifted).toEqual(validateTimeline(shifted, 6));
        expect(shifted.effects).toEqual(original.effects); // Independent layer offsets stay intact.
        expect(frameCount(shifted)).toBe(frameCount(base));
        expect(matchesMotionPreset(shifted, preset.id, 50, 1.5, true, offset)).toBe(true);
        expect(applyMotionPreset(shifted, preset.id, 50, 1.5, true, offset)).toEqual(shifted);
        expect(phase(shifted, 2)).toBeCloseTo(
          phase(original, 2) + ((offset % 360) * Math.PI) / 180,
        );
        const equivalent = {
          ...motionAt(original, 2),
          effects: original.effects.map((e) => ({ ...e, phase: (e.phase + offset) % 360 })),
        };
        const expected = processMotionFrame(image, defaults, equivalent, 'export');
        expect(processMotionFrame(image, defaults, motionAt(shifted, 2), 'preview')).toEqual(
          expected,
        );
        expect(processMotionFrame(image, defaults, motionAt(shifted, 2), 'export')).toEqual(
          expected,
        );
      }
    },
  );
  it('shifts pulse and noise starts, preserves keyframe times, and treats 360° as 0°', () => {
    const t = timelineDefaults();
    const pulsed = settingsAt(defaults, { ...t, effect: 'pulse', phase: 90 }, 0);
    expect(pulsed).toEqual(settingsAt(defaults, { ...t, effect: 'pulse' }, 1));
    const keyed = {
      ...t,
      keys: [
        { channel: 'contrast' as const, time: 0, value: 0 },
        { channel: 'contrast' as const, time: 4, value: 100 },
      ],
    };
    expect(settingsAt(defaults, { ...keyed, phase: 90 }, 1)).toEqual(
      settingsAt(defaults, keyed, 1),
    );
    for (const speed of [0.25, 1, 1.5, 4])
      for (const reverse of [false, true]) {
        const noise = { ...t, effect: 'boil' as const, speed, reverse };
        const offset = Math.floor(frameCount(noise) / 4);
        const startIndex = reverse ? frameCount(noise) - 1 : 0;
        const forward = { ...noise, reverse: false };
        expect(animateNoise(image, { ...noise, phase: 90 }, 0, 42)).toEqual(
          animateNoise(image, forward, ((startIndex + offset) % frameCount(noise)) / t.fps, 42),
        );
        expect(animateNoise(image, { ...noise, phase: 360 }, 0, 42)).toEqual(
          animateNoise(image, noise, 0, 42),
        );
      }
  });
  it('normalizes old files and full turns, and rejects invalid project/worker phase values', () => {
    const { phase, ...old } = timelineDefaults();
    expect(validateTimeline(old, 4).phase).toBe(0);
    expect(validateTimeline({ ...old, phase: 360 }, 4).phase).toBe(0);
    for (const phase of [null, -1, 361, NaN, Infinity, '90']) {
      expect(() => validateTimeline({ ...old, phase }, 4)).toThrow('phase');
      expect(() => validateMotionFrame({ effects: [], progress: 0.5, phase })).toThrow('phase');
    }
  });
  it('adds to saved originals, wraps phases, and preserves them in shared presets', () => {
    const data = new Map<string, string>();
    const store = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const t = applyMotionPreset(timelineDefaults(), 'orbital-drift', 50, 1.5, true, 270);
    saveMotionPreset(store, 'Offset orbit', t, 'offset');
    const saved = loadSavedMotionPresets(store)[0];
    expect(saved.appearance.phase).toBe(270);
    expect(applyMotionAppearance(t, saved.appearance, 100, 1, false, 90).phase).toBe(0);
    expect(applyMotionAppearance(t, saved.appearance, 100, 1, false, 45).phase).toBe(315);
    importMotionPresets(store, exportMotionPresets(store), () => 'copy');
    expect(loadSavedMotionPresets(store)[1].appearance).toEqual(saved.appearance);
  });
});
