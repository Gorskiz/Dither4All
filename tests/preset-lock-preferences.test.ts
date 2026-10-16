import { describe, expect, it } from 'vitest';
import {
  loadPresetLocks,
  savePresetLocks,
  presetLockDefaults,
  PRESET_LOCKS_KEY,
} from '../src/motion/lock-preferences';

describe('preset lock preferences', () => {
  it('defaults to detached unlocked flags without writing storage', () => {
    const storage = { getItem: () => null };
    const locks = loadPresetLocks(storage);
    expect(locks).toEqual({ strength: false, speed: false, phase: false, direction: false });
    locks.strength = true;
    expect(loadPresetLocks(storage)).toEqual(presetLockDefaults());
  });
  it('round-trips all 16 choices using only the four boolean flags', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    for (let mask = 0; mask < 16; mask++) {
      const locks = {
        strength: !!(mask & 1),
        speed: !!(mask & 2),
        phase: !!(mask & 4),
        direction: !!(mask & 8),
      };
      savePresetLocks(storage, locks);
      expect(loadPresetLocks(storage)).toEqual(locks);
      expect(JSON.parse(values.get(PRESET_LOCKS_KEY)!)).toEqual(locks);
      expect([...values.keys()]).toEqual([PRESET_LOCKS_KEY]);
    }
  });
  it('rejects corrupt/incomplete preferences and storage read failures', () => {
    for (const raw of [
      '{',
      'null',
      '[]',
      '{}',
      JSON.stringify({ ...presetLockDefaults(), phase: 'true' }),
      JSON.stringify({ ...presetLockDefaults(), strength: 1 }),
    ]) {
      expect(() => loadPresetLocks({ getItem: () => raw })).toThrow('could not be restored');
    }
    expect(() =>
      loadPresetLocks({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toThrow('could not be restored');
  });
  it('reports write failures without mutating the active choices', () => {
    const locks = { ...presetLockDefaults(), direction: true };
    expect(() =>
      savePresetLocks(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        locks,
      ),
    ).toThrow('could not be saved');
    expect(locks.direction).toBe(true);
  });
});
