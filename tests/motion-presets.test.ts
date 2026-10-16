import { describe, expect, it } from 'vitest';
import { applyMotionPreset, matchesMotionPreset, motionPresets } from '../src/motion/presets';
import { timelineDefaults, validateTimeline } from '../src/motion/model';
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
