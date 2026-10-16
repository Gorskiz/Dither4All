import { describe, expect, it } from 'vitest';
import {
  applyMotionAppearance,
  applyMotionPreset,
  matchesMotionPreset,
  motionPresets,
  scaleMotionAppearance,
} from '../src/motion/presets';
import { timelineDefaults, validateTimeline } from '../src/motion/model';
import { PREVIEW_FPS, PREVIEW_FRAMES } from '../src/motion/preset-previews';
import { applyMotionEffects } from '../src/motion/effects';
import { motionAt } from '../src/motion/model';
import { defaults } from '../src/engine/catalog';
import { readProject } from '../src/files';

describe('animation looks', () => {
  it.each(motionPresets)(
    '$name is valid and replaces appearance without changing timing or keys',
    (preset) => {
      const original = {
        ...timelineDefaults(10),
        start: 2,
        end: 7,
        fps: 24,
        loop: false,
        easing: 'hold' as const,
        keys: [{ channel: 'brightness' as const, time: 3, value: 25 }],
      };
      const before = structuredClone(original);
      const result = applyMotionPreset(original, preset.id);
      expect(validateTimeline(result, 10)).toEqual(result);
      expect(result).toMatchObject({
        start: 2,
        end: 7,
        fps: 24,
        loop: false,
        easing: 'hold',
        keys: original.keys,
      });
      expect(original).toEqual(before);
      expect(matchesMotionPreset(result, preset.id)).toBe(true);
      const saved = readProject(
        JSON.stringify({
          version: 1,
          name: 'look',
          image: 'data:image/png;base64,AA==',
          settings: defaults,
          motion: { timeline: result, duration: 10 },
        }),
      );
      expect(matchesMotionPreset(saved.motion!.timeline, preset.id)).toBe(true);
      result.effects[0].amount = 0;
      expect(matchesMotionPreset(result, preset.id)).toBe(false);
      expect(matchesMotionPreset(applyMotionPreset(original, preset.id), preset.id)).toBe(true);
    },
  );
  it('offers unique looks and rejects unknown IDs', () => {
    expect(new Set(motionPresets.map((p) => p.id)).size).toBe(motionPresets.length);
    expect(() => applyMotionPreset(timelineDefaults(), '__proto__')).toThrow('Unknown motion look');
    expect(matchesMotionPreset(timelineDefaults(), 'missing')).toBe(false);
  });
});

it('samples Signal Loss glitch bursts instead of missing them between preview frames', () => {
  const t = applyMotionPreset(timelineDefaults(), 'signal-loss');
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
  const sampledBurst = Array.from({ length: PREVIEW_FRAMES }, (_, i) => {
    const frame = motionAt(t, i / PREVIEW_FPS);
    const withGlitch = applyMotionEffects(image, frame, defaults);
    const withoutGlitch = applyMotionEffects(
      image,
      { ...frame, effects: frame.effects.filter((e) => e.type !== 'glitch') },
      defaults,
    );
    return withGlitch.data.some((v, p) => v !== withoutGlitch.data[p]);
  });
  expect(sampledBurst.some(Boolean)).toBe(true);
  expect(sampledBurst.some((burst) => !burst)).toBe(true);
});

describe('preset strength', () => {
  it.each(motionPresets)(
    '$name scales original amounts without accumulating or changing timing',
    (preset) => {
      const timeline = {
        ...timelineDefaults(10),
        start: 2,
        end: 7,
        fps: 24 as const,
        loop: false,
        keys: [{ channel: 'contrast' as const, time: 3, value: 12 }],
      };
      const original = applyMotionPreset(timeline, preset.id);
      const snapshot = structuredClone(original);
      expect(applyMotionPreset(timeline, preset.id, 100)).toEqual(original);
      for (const strength of [0, 37, 100, 200]) {
        const result = applyMotionPreset(timeline, preset.id, strength);
        expect(result).toEqual(applyMotionAppearance(timeline, original, strength));
        expect(result).toEqual(validateTimeline(result, 10));
        expect(result).toMatchObject({
          start: 2,
          end: 7,
          fps: 24,
          loop: false,
          keys: timeline.keys,
        });
        expect(result.amount).toBe(Math.min(100, (original.amount * strength) / 100));
        result.effects.forEach((effect, index) => {
          expect(effect).toEqual({
            ...original.effects[index],
            amount: Math.min(100, (original.effects[index].amount * strength) / 100),
          });
        });
        expect(matchesMotionPreset(result, preset.id, strength)).toBe(true);
        expect(applyMotionPreset(result, preset.id, strength)).toEqual(result);
      }
      expect(original).toEqual(snapshot);
    },
  );
  it('preserves disabled layers and rejects invalid strength', () => {
    const appearance = applyMotionPreset(timelineDefaults(), 'signal-loss');
    appearance.effects[0].enabled = false;
    expect(scaleMotionAppearance(appearance, 200).effects[0]).toMatchObject({
      enabled: false,
      amount: 100,
    });
    for (const strength of [-1, 201, NaN, Infinity])
      expect(() => scaleMotionAppearance(appearance, strength)).toThrow('preset strength');
  });
});
