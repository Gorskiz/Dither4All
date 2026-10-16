export const PRESET_CONTROLS_KEY = 'dither4all-motion-preset-controls';
export interface PresetControls {
  strength: number;
  speed: number;
  phase: number;
  reverse: boolean;
}
export const presetControlDefaults = (): PresetControls => ({
  strength: 100,
  speed: 1,
  phase: 0,
  reverse: false,
});
function validateControls(value: unknown): PresetControls {
  const controls = value as PresetControls;
  if (
    !controls ||
    Array.isArray(controls) ||
    !Number.isInteger(controls.strength) ||
    controls.strength < 0 ||
    controls.strength > 200 ||
    !Number.isFinite(controls.speed) ||
    controls.speed < 0.25 ||
    controls.speed > 4 ||
    Math.abs(controls.speed * 20 - Math.round(controls.speed * 20)) > 1e-8 ||
    !Number.isInteger(controls.phase) ||
    controls.phase < 0 ||
    controls.phase > 360 ||
    typeof controls.reverse !== 'boolean'
  )
    throw new Error('Invalid preset controls.');
  return {
    strength: controls.strength,
    speed: Math.round(controls.speed * 20) / 20,
    phase: controls.phase,
    reverse: controls.reverse,
  };
}
export function loadPresetControls(storage: Pick<Storage, 'getItem'>): PresetControls {
  try {
    const raw = storage.getItem(PRESET_CONTROLS_KEY);
    return raw === null ? presetControlDefaults() : validateControls(JSON.parse(raw));
  } catch {
    throw new Error('Preset control values could not be restored. Controls start at defaults.');
  }
}
export function savePresetControls(storage: Pick<Storage, 'setItem'>, controls: PresetControls) {
  try {
    storage.setItem(PRESET_CONTROLS_KEY, JSON.stringify(validateControls(controls)));
  } catch {
    throw new Error(
      'Control values work for this session, but could not be saved in this browser.',
    );
  }
}
