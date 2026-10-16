import { describe, expect, it } from 'vitest';
import {
  MOTION_PRESETS_KEY,
  MAX_MOTION_PRESET_FILE_BYTES,
  exportMotionPresets,
  readMotionPresetFile,
  importMotionPresets,
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
      'speed',
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
      { speed: 0 },
      { speed: 4.1 },
      { speed: null },
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

describe('animation preset sharing', () => {
  it('exports selected or all presets without IDs, keys, media or image settings and imports into a fresh browser library', () => {
    const source = storage();
    saveMotionPreset(source, 'Lake', appearance(), 'source-one');
    saveMotionPreset(source, 'Other', appearance(), 'source-two');
    const single = JSON.parse(exportMotionPresets(source, 'source-two'));
    expect(single).toMatchObject({ type: 'dither4all-animation-presets', version: 1 });
    expect(single.presets).toHaveLength(1);
    expect(single.presets[0].name).toBe('Other');
    expect(Object.keys(single.presets[0]).sort()).toEqual(['appearance', 'name']);
    expect(Object.keys(single.presets[0].appearance).sort()).toEqual([
      'amount',
      'cycles',
      'effect',
      'effects',
      'speed',
    ]);
    const target = storage();
    let id = 0;
    const imported = importMotionPresets(target, exportMotionPresets(source), () => `new-${id++}`);
    expect(imported.added).toBe(2);
    expect(imported.renamed).toBe(0);
    expect(imported.presets[0].id).toBe('new-0');
    expect(exportMotionPresets(target)).toBe(exportMotionPresets(source));
  });
  it('numbers case-insensitive duplicate names without overwriting, including duplicates within one file and long names', () => {
    const store = storage();
    const name = 'A'.repeat(60);
    saveMotionPreset(store, name, appearance(), 'original');
    const json = JSON.parse(exportMotionPresets(store));
    json.presets.push({ ...json.presets[0], name: name.toLowerCase() });
    let i = 0;
    const result = importMotionPresets(store, JSON.stringify(json), () => `import-${i++}`);
    expect(result.renamed).toBe(2);
    expect(result.presets.map((p) => p.name)).toEqual([
      name,
      'A'.repeat(56) + ' (2)',
      'a'.repeat(56) + ' (3)',
    ]);
    expect(result.presets.every((p) => p.name.length <= 60)).toBe(true);
    expect(result.presets[0].id).toBe('original');
  });
  it('rejects malformed, unrelated, unsupported and oversized files without changing the library', () => {
    const store = storage();
    saveMotionPreset(store, 'Keep', appearance(), 'keep');
    const json = JSON.parse(exportMotionPresets(store));
    const before = store.getItem(MOTION_PRESETS_KEY);
    for (const text of [
      '{',
      'null',
      '[]',
      JSON.stringify({ version: 1, settings: {} }),
      JSON.stringify({ ...json, version: 2 }),
      JSON.stringify({ ...json, type: 'other' }),
      JSON.stringify({ ...json, presets: [] }),
      JSON.stringify({ ...json, presets: Array(51).fill(json.presets[0]) }),
      JSON.stringify({ ...json, presets: [json.presets[0], { name: 'Broken', appearance: {} }] }),
      ' '.repeat(MAX_MOTION_PRESET_FILE_BYTES + 1),
      '🌊'.repeat(MAX_MOTION_PRESET_FILE_BYTES / 3),
    ]) {
      expect(() => importMotionPresets(store, text)).toThrow();
      expect(store.getItem(MOTION_PRESETS_KEY)).toBe(before);
    }
  });
  it('imports atomically at the capacity boundary and rejects ID collisions or failed writes', () => {
    const source = storage();
    saveMotionPreset(source, 'New', appearance(), 'source');
    const json = exportMotionPresets(source);
    const target = storage();
    for (let i = 0; i < 49; i++) saveMotionPreset(target, `Saved ${i}`, appearance(), `id-${i}`);
    const before = target.getItem(MOTION_PRESETS_KEY);
    expect(() => importMotionPresets(target, json, () => 'id-0')).toThrow('unique');
    expect(target.getItem(MOTION_PRESETS_KEY)).toBe(before);
    expect(importMotionPresets(target, json, () => 'last').presets).toHaveLength(50);
    const full = target.getItem(MOTION_PRESETS_KEY);
    expect(() => importMotionPresets(target, json)).toThrow('only 0');
    expect(target.getItem(MOTION_PRESETS_KEY)).toBe(full);
    expect(() =>
      importMotionPresets(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error();
          },
        },
        json,
      ),
    ).toThrow('unavailable or full');
    expect(() => exportMotionPresets(storage())).toThrow();
    expect(() => exportMotionPresets(source, 'missing')).toThrow();
  });
  it('strips extra fields and preserves disabled effects and parameter values', () => {
    const source = storage();
    const t = appearance();
    t.effects[0].phase = 85;
    t.effects[1].enabled = false;
    saveMotionPreset(source, '<b>Lake</b>', t, 'local');
    const json = JSON.parse(exportMotionPresets(source));
    json.presets[0].id = 'untrusted';
    json.presets[0].appearance.keys = [{ time: 0, channel: 'brightness', value: 100 }];
    const parsed = readMotionPresetFile(JSON.stringify(json));
    expect(parsed[0]).toEqual({
      name: '<b>Lake</b>',
      appearance: loadSavedMotionPresets(source)[0].appearance,
    });
  });
});
