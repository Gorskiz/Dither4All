import {
  newMotionEffect,
  validateMotionEffects,
  validateMotionSpeed,
  type MotionEffect,
  type MotionEffectType,
} from './catalog';
import { timelineDefaults, validateTimeline, type Timeline } from './model';

export type MotionAppearance = Pick<Timeline, 'effect' | 'amount' | 'cycles' | 'effects' | 'speed'>;
export function captureMotionAppearance(value: MotionAppearance): MotionAppearance {
  const validated = validateTimeline(
    {
      ...timelineDefaults(),
      effect: value.effect,
      amount: value.amount,
      speed: value.speed,
      cycles: value.cycles,
      effects: validateMotionEffects(value.effects),
    },
    4,
  );
  return {
    effect: validated.effect,
    amount: validated.amount,
    speed: validated.speed ?? 1,
    cycles: validated.cycles,
    effects: validated.effects,
  };
}
/** Scale originals once; phase, cycles, ordering and enabled flags stay intact. */
export function scaleMotionAppearance(
  value: MotionAppearance,
  strength = 100,
  speed = 1,
): MotionAppearance {
  if (!Number.isFinite(strength) || strength < 0 || strength > 200)
    throw new Error('Use a preset strength from 0 to 200%.');
  validateMotionSpeed(speed);
  const appearance = captureMotionAppearance(value);
  const scale = (amount: number) => Math.min(100, (amount * strength) / 100);
  return {
    ...appearance,
    speed: Math.max(0.25, Math.min(4, (appearance.speed ?? 1) * speed)),
    amount: scale(appearance.amount),
    effects: appearance.effects.map((effect) => ({ ...effect, amount: scale(effect.amount) })),
  };
}
export function applyMotionAppearance(
  timeline: Timeline,
  appearance: MotionAppearance,
  strength = 100,
  speed = 1,
): Timeline {
  return { ...structuredClone(timeline), ...scaleMotionAppearance(appearance, strength, speed) };
}

interface MotionPreset {
  id: string;
  name: string;
  description: string;
  source: Pick<Timeline, 'effect' | 'amount' | 'cycles'>;
  effects: readonly MotionEffect[];
  requiresPalette?: boolean;
}
const effect = (type: MotionEffectType, amount: number, cycles = 1, phase = 0): MotionEffect => ({
  ...newMotionEffect(type),
  amount,
  cycles,
  phase,
});
const still = { effect: 'none', amount: 35, cycles: 1 } as const;
export const motionPresets: readonly MotionPreset[] = [
  {
    id: 'liquid-ink',
    name: 'Liquid Ink',
    description: 'Flowing distortion with soft traveling ripples.',
    source: still,
    effects: [effect('flow', 24, 1, 45), effect('ripple', 20, 2, 90)],
  },
  {
    id: 'signal-loss',
    name: 'Signal Loss',
    description: 'Glitch bursts under rolling CRT scanlines.',
    source: still,
    effects: [effect('glitch', 75, 2, 15), effect('crt', 60)],
  },
  {
    id: 'aftershock',
    name: 'Aftershock',
    description: 'Expanding shockwaves through a twisting center.',
    source: still,
    effects: [effect('shockwave', 85, 2, 60), effect('twist', 35, 1, 90)],
  },
  {
    id: 'mirror-lake',
    name: 'Mirror Lake',
    description: 'A gently shifting image reflected in rippling water.',
    source: still,
    effects: [effect('flow', 15, 1, 45), effect('reflection', 85)],
  },
  {
    id: 'chromatic-tide',
    name: 'Chromatic Tide',
    description: 'Cycling swatches in a liquid flow. Palette mode only.',
    source: still,
    requiresPalette: true,
    effects: [effect('palette', 100, 1, 90), effect('flow', 28, 1, 45)],
  },
  {
    id: 'orbital-drift',
    name: 'Orbital Drift',
    description: 'A slow looping zoom with twist and subtle CRT shading.',
    source: { effect: 'zoom', amount: 15, cycles: 1 },
    effects: [effect('twist', 55, 1, 90), effect('crt', 18, 1, 90)],
  },
];

/** Apply only motion appearance. Timing, keyframes, loop and FPS are retained. */
export function applyMotionPreset(
  timeline: Timeline,
  id: string,
  strength = 100,
  speed = 1,
): Timeline {
  const preset = motionPresets.find((p) => p.id === id);
  if (!preset) throw new Error('Unknown motion look.');
  return applyMotionAppearance(
    timeline,
    { ...preset.source, effects: [...preset.effects] },
    strength,
    speed,
  );
}

/** Derive selection from editable settings, so saved projects need no preset identifier. */
export function matchesMotionPreset(
  timeline: Timeline,
  id: string,
  strength = 100,
  speed = 1,
): boolean {
  const preset = motionPresets.find((p) => p.id === id);
  if (!preset) return false;
  const appearance = scaleMotionAppearance(
    { ...preset.source, effects: [...preset.effects] },
    strength,
    speed,
  );
  return (
    timeline.effect === appearance.effect &&
    timeline.amount === appearance.amount &&
    timeline.cycles === appearance.cycles &&
    (timeline.speed ?? 1) === appearance.speed &&
    timeline.effects.length === appearance.effects.length &&
    timeline.effects.every((e, i) => {
      const p = appearance.effects[i];
      return (
        e.type === p.type &&
        e.enabled === p.enabled &&
        e.amount === p.amount &&
        e.cycles === p.cycles &&
        e.phase === p.phase
      );
    })
  );
}
