import { describe, expect, it } from 'vitest';
import {
  MOTION_PRESETS_KEY,
  loadSavedMotionPresets,
  saveMotionPreset,
  renameMotionPreset,
  deleteMotionPreset,
} from '../src/motion/saved-presets';
import { applyMotionAppearance, applyMotionPreset } from '../src/motion/presets';
import { timelineDefaults } from '../src/motion/model';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
const appearance = () => applyMotionPreset(timelineDefaults(), 'mirror-lake');
describe('saved animation presets', () => {
  it('saves detached motion appearance, renames by stable ID, applies without changing timing, and deletes', () => {
    const store = storage(),
      t = appearance();
    t.effects[0].phase = 83;
    t.effects[1].enabled = false;
    const before = structuredClone(t);
    saveMotionPreset(store, '  My lake  ', t, 'lake');
    const preset = loadSavedMotionPresets(store)[0];
    expect(preset.name).toBe('My lake');
    expect(Object.keys(preset.appearance).sort()).toEqual([
      'amount',
      'cycles',
      'effect',
      'effects',
    ]);
    t.effects[0].amount = 1;
    expect(preset.appearance.effects).toEqual(before.effects);
    renameMotionPreset(store, 'lake', '<b>Lake</b>');
    expect(loadSavedMotionPresets(store)[0]).toEqual({ ...preset, name: '<b>Lake</b>' });
    const target = {
      ...timelineDefaults(10),
      start: 2,
      end: 8,
      fps: 24,
      keys: [{ channel: 'brightness' as const, value: 40, time: 3 }],
    };
    expect(applyMotionAppearance(target, preset.appearance)).toEqual({
      ...target,
      ...preset.appearance,
    });
    deleteMotionPreset(store, 'lake');
    expect(loadSavedMotionPresets(store)).toEqual([]);
  });
  it('rejects duplicate names/IDs, blank or long names, and missing rename/delete targets without changing storage', () => {
    const store = storage();
    saveMotionPreset(store, 'Lake', appearance(), 'one');
    saveMotionPreset(store, 'Other', appearance(), 'two');
    const before = store.getItem(MOTION_PRESETS_KEY);
    for (const name of [' ', 'x'.repeat(61), ' LAKE '])
      expect(() => saveMotionPreset(store, name, appearance(), 'three')).toThrow();
    expect(() => saveMotionPreset(store, 'Unique', appearance(), 'one')).toThrow();
    expect(() => renameMotionPreset(store, 'two', 'lake')).toThrow();
    expect(() => renameMotionPreset(store, 'missing', 'New')).toThrow();
    expect(() => deleteMotionPreset(store, 'missing')).toThrow();
    expect(store.getItem(MOTION_PRESETS_KEY)).toBe(before);
  });
  it('enforces the library limit and validates nested saved effects', () => {
    const store = storage();
    for (let i = 0; i < 50; i++) saveMotionPreset(store, `Preset ${i}`, appearance(), `id-${i}`);
    expect(() => saveMotionPreset(store, 'One too many', appearance(), 'extra')).toThrow('50');
    const good = loadSavedMotionPresets(store)[0];
    for (const patch of [
      { effect: 'bad' },
      { cycles: 0 },
      { effects: [{ type: 'flow' }] },
      { effects: null },
      { amount: 101 },
    ]) {
      store.setItem(
        MOTION_PRESETS_KEY,
        JSON.stringify([{ ...good, appearance: { ...good.appearance, ...patch } }]),
      );
      expect(() => loadSavedMotionPresets(store)).toThrow('could not be read');
    }
  });
  it('protects corrupt libraries and reports read/write failures', () => {
    const store = storage();
    for (const raw of ['{', '{}', 'null', '[null]']) {
      store.setItem(MOTION_PRESETS_KEY, raw);
      expect(() => saveMotionPreset(store, 'New', appearance(), 'id')).toThrow('could not be read');
      expect(store.getItem(MOTION_PRESETS_KEY)).toBe(raw);
    }
    expect(() =>
      loadSavedMotionPresets({
        getItem: () => {
          throw new Error();
        },
        setItem() {},
      }),
    ).toThrow('could not be read');
    expect(() =>
      saveMotionPreset(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('quota');
          },
        },
        'New',
        appearance(),
        'id',
      ),
    ).toThrow('unavailable or full');
  });
});
