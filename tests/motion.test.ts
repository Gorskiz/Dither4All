import { describe, it, expect } from 'vitest';
import { defaults } from '../src/engine/catalog';
import {
  animateNoise,
  frameCount,
  gifDelay,
  settingsAt,
  timelineDefaults,
  validateTimeline,
  outputDimensions,
} from '../src/motion/model';
import { readProject } from '../src/files';
describe('motion contracts', () => {
  it('interpolates keys, holds endpoints, and leaves the image recipe unchanged', () => {
    const t = timelineDefaults(4);
    t.easing = 'linear';
    t.keys = [
      { channel: 'brightness', time: 1, value: -50 },
      { channel: 'brightness', time: 3, value: 50 },
    ];
    const base = structuredClone(defaults);
    expect(settingsAt(base, t, 0).brightness).toBe(-50);
    expect(settingsAt(base, t, 2).brightness).toBe(0);
    expect(settingsAt(base, t, 4).brightness).toBe(50);
    t.easing = 'hold';
    expect(settingsAt(base, t, 2).brightness).toBe(-50);
    expect(base).toEqual(defaults);
  });
  it('rejects unsafe timelines, keyframes, and video project references', () => {
    const t = timelineDefaults();
    for (const invalid of [
      { ...t, end: 31 },
      { ...t, start: 4 },
      { ...t, fps: NaN },
      { ...t, amount: Infinity },
      { ...t, keys: [{ channel: '__proto__', value: 1, time: 0 }] },
      { ...t, keys: [{ channel: 'scale', value: 0, time: 0 }] },
    ])
      expect(() => validateTimeline(invalid, 40)).toThrow();
    const project = {
      version: 1,
      name: 'test',
      image: 'data:image/png;base64,AA==',
      settings: defaults,
      motion: {
        timeline: t,
        duration: 4,
        video: { name: 'test.mp4', size: Infinity, lastModified: 0 },
      },
    };
    expect(() => readProject(JSON.stringify(project))).toThrow();
  });
  it('produces deterministic temporal noise without changing alpha or source pixels', () => {
    const t = timelineDefaults();
    t.effect = 'boil';
    const p = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(128) };
    expect(animateNoise(p, t, 1, 42)).toEqual(animateNoise(p, t, 1, 42));
    expect(animateNoise(p, t, 1, 42)).not.toEqual(animateNoise(p, t, 2, 42));
    expect([...p.data].every((v) => v === 128)).toBe(true);
    expect(animateNoise(p, t, 1, 42).data.filter((_, i) => i % 4 === 3)).toEqual(
      new Uint8ClampedArray(64).fill(128),
    );
  });
  it('keeps frame counts and GIF centisecond timing accurate', () => {
    const t = { ...timelineDefaults(3.1), fps: 24 };
    expect(frameCount(t)).toBe(75);
    expect(Array.from({ length: 24 }, (_, i) => gifDelay(i, 24)).reduce((a, b) => a + b, 0)).toBe(
      1000,
    );
    expect(outputDimensions(1920, 1080, 720)).toEqual({ width: 720, height: 404 });
    expect(outputDimensions(320, 241, 720)).toEqual({ width: 320, height: 240 });
  });
});
