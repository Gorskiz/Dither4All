import { captureMotionAppearance, type MotionAppearance } from './presets';

export const MOTION_PRESETS_KEY = 'dither4all-motion-presets';
export const MAX_SAVED_MOTION_PRESETS = 50;
export interface SavedMotionPreset {
  id: string;
  name: string;
  appearance: MotionAppearance;
}
type PresetStorage = Pick<Storage, 'getItem' | 'setItem'>;
function nameOf(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60)
    throw new Error('Use a preset name between 1 and 60 characters.');
  return value.trim();
}
function uniqueName(presets: SavedMotionPreset[], name: string, except?: string) {
  if (presets.some((p) => p.id !== except && p.name.toLowerCase() === name.toLowerCase()))
    throw new Error('An animation preset already has that name. Choose another name.');
}
/** Reject corrupt storage instead of silently replacing the user's library. */
export function loadSavedMotionPresets(storage: PresetStorage): SavedMotionPreset[] {
  try {
    const raw = storage.getItem(MOTION_PRESETS_KEY);
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(list) || list.length > MAX_SAVED_MOTION_PRESETS) throw new Error();
    const presets: SavedMotionPreset[] = [];
    for (const p of list) {
      if (
        !p ||
        typeof p.id !== 'string' ||
        !p.id ||
        p.id.length > 100 ||
        presets.some((e) => e.id === p.id)
      )
        throw new Error();
      const name = nameOf(p.name);
      uniqueName(presets, name);
      presets.push({ id: p.id, name, appearance: captureMotionAppearance(p.appearance) });
    }
    return presets;
  } catch {
    throw new Error(
      'Saved animation presets could not be read. Browser storage may be unavailable or contain invalid data.',
    );
  }
}
function write(storage: PresetStorage, presets: SavedMotionPreset[]) {
  try {
    storage.setItem(MOTION_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    throw new Error(
      'Could not save animation presets. Browser storage may be unavailable or full.',
    );
  }
  return presets;
}
export function saveMotionPreset(
  storage: PresetStorage,
  name: string,
  appearance: MotionAppearance,
  id: string,
): SavedMotionPreset[] {
  const presets = loadSavedMotionPresets(storage);
  if (presets.length >= MAX_SAVED_MOTION_PRESETS)
    throw new Error('You can save up to 50 animation presets. Delete one to make room.');
  const trimmed = nameOf(name);
  uniqueName(presets, trimmed);
  if (!id || id.length > 100 || presets.some((p) => p.id === id))
    throw new Error('Invalid animation preset ID.');
  return write(storage, [
    ...presets,
    { id, name: trimmed, appearance: captureMotionAppearance(appearance) },
  ]);
}
export function renameMotionPreset(
  storage: PresetStorage,
  id: string,
  name: string,
): SavedMotionPreset[] {
  const presets = loadSavedMotionPresets(storage);
  const preset = presets.find((p) => p.id === id);
  if (!preset) throw new Error('This animation preset no longer exists.');
  const trimmed = nameOf(name);
  uniqueName(presets, trimmed, id);
  return write(
    storage,
    presets.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
  );
}
export function deleteMotionPreset(storage: PresetStorage, id: string): SavedMotionPreset[] {
  const presets = loadSavedMotionPresets(storage);
  if (!presets.some((p) => p.id === id)) throw new Error('This animation preset no longer exists.');
  return write(
    storage,
    presets.filter((p) => p.id !== id),
  );
}
