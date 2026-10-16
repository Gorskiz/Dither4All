export interface OutputSettings {
  format: string;
  size: string;
  width: string;
  height: string;
  quality: string;
  motionFormat: string;
  motionSize: string;
  audio: boolean;
}
export function validateOutput(value: unknown): OutputSettings | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as OutputSettings;
  if (
    !['png', 'jpg', 'webp', 'svg', 'svg-black'].includes(v.format) ||
    !['1', '.5', '.25', 'custom'].includes(v.size) ||
    !['mp4', 'webm', 'gif', 'frames'].includes(v.motionFormat) ||
    !['128', '256', '480', '720', '1280'].includes(v.motionSize) ||
    typeof v.audio !== 'boolean'
  )
    throw new Error('Invalid saved export settings.');
  for (const [key, max] of [
    ['width', 8192],
    ['height', 8192],
    ['quality', 100],
  ] as const) {
    const n = Number(v[key]);
    if (!Number.isInteger(n) || n < 1 || n > max)
      throw new Error('Invalid saved output dimensions or quality.');
  }
  return {
    format: v.format,
    size: v.size,
    width: v.width,
    height: v.height,
    quality: v.quality,
    motionFormat: v.motionFormat,
    motionSize: v.motionSize,
    audio: v.audio,
  };
}
export const outputFields = {
  format: 'format',
  size: 'export-size',
  width: 'export-width',
  height: 'export-height',
  quality: 'export-quality',
  motionFormat: 'motion-format',
  motionSize: 'motion-size',
} as const;
export function readOutput(width: number, height: number): OutputSettings {
  const values = Object.fromEntries(
    Object.entries(outputFields).map(([key, id]) => [
      key,
      (document.getElementById(id) as HTMLInputElement).value,
    ]),
  );
  return {
    ...values,
    width: values.width || String(width),
    height: values.height || String(height),
    audio: (document.getElementById('motion-audio') as HTMLInputElement).checked,
  } as OutputSettings;
}
export function applyOutput(value: OutputSettings | undefined) {
  if (!value) return;
  for (const [key, id] of Object.entries(outputFields))
    (document.getElementById(id) as HTMLInputElement).value =
      value[key as keyof typeof outputFields];
  (document.getElementById('motion-audio') as HTMLInputElement).checked = value.audio;
}
