/** Serialized motion stack; kept separate from the worker-only rendering code. */
export const motionEffects = {
  flow: { name: 'Flowing displacement', hint: 'Smooth, looping liquid distortion.' },
  ripple: { name: 'Animated ripple', hint: 'Traveling rings from the image center.' },
  glitch: { name: 'Glitch bursts', hint: 'Seeded bursts of torn rows and split color.' },
  crt: { name: 'CRT roll', hint: 'Rolling scanlines and a drifting brightness band.' },
  palette: {
    name: 'Palette cycling',
    hint: 'Rotate colors through your swatches. Requires Palette color mode.',
  },
  shockwave: { name: 'Shockwave', hint: 'An expanding ring of distortion from the center.' },
  twist: { name: 'Twist', hint: 'Wind and unwind the center while keeping the edges still.' },
  reflection: {
    name: 'Water reflection',
    hint: 'Mirror the lower portion with moving waves. Amount controls water coverage and distortion.',
  },
} as const;
export type MotionEffectType = keyof typeof motionEffects;
export interface MotionEffect {
  type: MotionEffectType;
  enabled: boolean;
  amount: number;
  cycles: number;
  phase: number;
}
export interface MotionFrame {
  progress: number;
  effects: MotionEffect[];
}
export const MAX_MOTION_EFFECTS = 8;
export const newMotionEffect = (type: MotionEffectType): MotionEffect => ({
  type,
  enabled: true,
  amount: 50,
  cycles: 1,
  phase: 0,
});
export function validateMotionEffects(value: unknown): MotionEffect[] {
  if (!Array.isArray(value) || value.length > MAX_MOTION_EFFECTS)
    throw new Error(`Use up to ${MAX_MOTION_EFFECTS} motion effects.`);
  for (const e of value) {
    if (
      !e ||
      typeof e.type !== 'string' ||
      !Object.hasOwn(motionEffects, e.type) ||
      typeof e.enabled !== 'boolean' ||
      !Number.isFinite(e.amount) ||
      e.amount < 0 ||
      e.amount > 100 ||
      !Number.isInteger(e.cycles) ||
      e.cycles < 1 ||
      e.cycles > 8 ||
      !Number.isFinite(e.phase) ||
      e.phase < 0 ||
      e.phase > 360
    )
      throw new Error('Invalid motion effect.');
  }
  return value.map(({ type, enabled, amount, cycles, phase }) => ({
    type,
    enabled,
    amount,
    cycles,
    phase,
  }));
}
export function validateMotionFrame(value: unknown): MotionFrame {
  const f = value as MotionFrame;
  if (!f || !Number.isFinite(f.progress) || f.progress < 0 || f.progress > 1)
    throw new Error('Invalid motion frame.');
  return { progress: f.progress, effects: validateMotionEffects(f.effects) };
}
