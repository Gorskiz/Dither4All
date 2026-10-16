export const PRESET_LOCKS_KEY = 'dither4all-motion-preset-locks';
export interface PresetLocks {
  strength: boolean;
  speed: boolean;
  phase: boolean;
  direction: boolean;
}
export const presetLockDefaults = (): PresetLocks => ({
  strength: false,
  speed: false,
  phase: false,
  direction: false,
});
function validateLocks(value: unknown): PresetLocks {
  const locks = value as PresetLocks;
  if (
    !locks ||
    Array.isArray(locks) ||
    typeof locks.strength !== 'boolean' ||
    typeof locks.speed !== 'boolean' ||
    typeof locks.phase !== 'boolean' ||
    typeof locks.direction !== 'boolean'
  )
    throw new Error('Invalid preset locks.');
  return {
    strength: locks.strength,
    speed: locks.speed,
    phase: locks.phase,
    direction: locks.direction,
  };
}
export function loadPresetLocks(storage: Pick<Storage, 'getItem'>): PresetLocks {
  try {
    const raw = storage.getItem(PRESET_LOCKS_KEY);
    return raw === null ? presetLockDefaults() : validateLocks(JSON.parse(raw));
  } catch {
    throw new Error('Preset lock preferences could not be restored. Controls start unlocked.');
  }
}
export function savePresetLocks(storage: Pick<Storage, 'setItem'>, locks: PresetLocks) {
  try {
    storage.setItem(PRESET_LOCKS_KEY, JSON.stringify(validateLocks(locks)));
  } catch {
    throw new Error('Locks work for this session, but could not be saved in this browser.');
  }
}
