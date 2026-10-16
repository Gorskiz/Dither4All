import { describe, expect, it } from 'vitest';
import {
  loadPresetControls,
  savePresetControls,
  presetControlDefaults,
  PRESET_CONTROLS_KEY,
} from '../src/motion/control-preferences';

describe('preset control value preferences', () => {
  it('defaults legacy/missing data without writing and returns detached values', () => {
    const defaults = loadPresetControls({ getItem: () => null });
    expect(defaults).toEqual({ strength: 100, speed: 1, phase: 0, reverse: false });
    defaults.strength = 0;
    expect(loadPresetControls({ getItem: () => null })).toEqual(presetControlDefaults());
  });
  it('round-trips manual and randomized values, preserves 360° and strips unrelated fields', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    for (const controls of [
      { strength: 0, speed: 0.25, phase: 360, reverse: true },
      { strength: 200, speed: 4, phase: 359, reverse: false },
      { strength: 87, speed: 1.15, phase: 217, reverse: true },
    ]) {
      savePresetControls(storage, { ...controls, locks: {}, image: 'ignored' } as typeof controls);
      expect(loadPresetControls(storage)).toEqual(controls);
      expect(JSON.parse(data.get(PRESET_CONTROLS_KEY)!)).toEqual(controls);
    }
    expect([...data.keys()]).toEqual([PRESET_CONTROLS_KEY]);
  });
  it('rejects malformed, out-of-range and off-step values without overwriting them', () => {
    const good = presetControlDefaults();
    for (const value of [
      null,
      [],
      {},
      { ...good, strength: -1 },
      { ...good, strength: 201 },
      { ...good, strength: 1.5 },
      { ...good, speed: 0.2 },
      { ...good, speed: 4.1 },
      { ...good, speed: 1.23 },
      { ...good, speed: '1' },
      { ...good, phase: 361 },
      { ...good, phase: 0.5 },
      { ...good, phase: null },
      { ...good, reverse: 1 },
    ]) {
      expect(() => loadPresetControls({ getItem: () => JSON.stringify(value) })).toThrow(
        'could not be restored',
      );
    }
    expect(() => loadPresetControls({ getItem: () => '{' })).toThrow('could not be restored');
  });
  it('reports read/write failures while leaving session values untouched', () => {
    expect(() =>
      loadPresetControls({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toThrow('could not be restored');
    const controls = { ...presetControlDefaults(), reverse: true };
    expect(() =>
      savePresetControls(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        controls,
      ),
    ).toThrow('could not be saved');
    expect(controls.reverse).toBe(true);
  });
});
