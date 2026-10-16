import { cloneSettings, type Settings } from '../engine/catalog';
import { noise } from '../engine/color';
import type { Pixels } from '../engine/process';
import {
  validateMotionEffects,
  validateMotionSpeed,
  validateMotionReverse,
  type MotionEffect,
  type MotionFrame,
} from './catalog';

export const channels = {
  brightness: [-100, 100],
  contrast: [-100, 100],
  saturation: [0, 200],
  strength: [0, 150],
  threshold: [0, 100],
  scale: [1, 16],
  gamma: [0.2, 3],
} as const;
export type Channel = keyof typeof channels;
export interface Keyframe {
  time: number;
  channel: Channel;
  value: number;
}
export interface Timeline {
  start: number;
  end: number;
  fps: number;
  loop: boolean;
  effect: 'none' | 'boil' | 'pulse' | 'zoom' | 'pan';
  amount: number;
  speed?: number;
  reverse?: boolean;
  cycles: number;
  easing: 'linear' | 'smooth' | 'hold';
  keys: Keyframe[];
  effects: MotionEffect[];
}
export const timelineDefaults = (duration = 4): Timeline => ({
  start: 0,
  end: Math.min(30, duration),
  fps: 12,
  loop: true,
  effect: 'none',
  amount: 35,
  speed: 1,
  reverse: false,
  cycles: 1,
  easing: 'smooth',
  keys: [],
  effects: [],
});
export function validateTimeline(value: unknown, duration: number): Timeline {
  if (!value || typeof value !== 'object') throw new Error('Invalid animation settings.');
  const t = value as Timeline;
  const finite = (n: number, min: number, max: number) =>
    Number.isFinite(n) && n >= min && n <= max;
  if (
    !finite(duration, 0.01, 7200) ||
    !finite(t.start, 0, duration) ||
    !finite(t.end, t.start + 0.01, duration + 0.00001) ||
    t.end - t.start > 30.00001 ||
    ![6, 12, 24, 30].includes(t.fps) ||
    typeof t.loop !== 'boolean' ||
    !['none', 'boil', 'pulse', 'zoom', 'pan'].includes(t.effect) ||
    !finite(t.amount, 0, 100) ||
    !Number.isInteger(t.cycles) ||
    !finite(t.cycles, 1, 8) ||
    !['linear', 'smooth', 'hold'].includes(t.easing) ||
    !Array.isArray(t.keys) ||
    t.keys.length > 200
  )
    throw new Error('Use a 0.01–30 second selection and valid animation settings.');
  for (const k of t.keys) {
    if (
      !k ||
      !Object.hasOwn(channels, k.channel) ||
      !finite(k.time, 0, duration) ||
      !finite(k.value, channels[k.channel][0], channels[k.channel][1])
    )
      throw new Error('Invalid keyframe.');
  }
  return {
    ...structuredClone(t),
    speed: validateMotionSpeed(t.speed),
    reverse: validateMotionReverse(t.reverse),
    effects: validateMotionEffects(t.effects === undefined ? [] : t.effects),
  };
}
export function settingsAt(base: Settings, t: Timeline, time: number): Settings {
  const s = cloneSettings(base);
  for (const channel of Object.keys(channels) as Channel[]) {
    const keys = t.keys.filter((k) => k.channel === channel).sort((a, b) => a.time - b.time);
    if (!keys.length) continue;
    let left = keys[0],
      right = keys[keys.length - 1];
    for (const k of keys) {
      if (k.time <= time) left = k;
      if (k.time >= time) {
        right = k;
        break;
      }
    }
    let f =
      right.time === left.time
        ? 0
        : Math.max(0, Math.min(1, (time - left.time) / (right.time - left.time)));
    if (t.easing === 'hold') f = 0;
    if (t.easing === 'smooth') f = f * f * (3 - 2 * f);
    s[channel] = left.value + (right.value - left.value) * f;
  }
  if (t.effect === 'pulse')
    s.brightness = Math.max(
      -100,
      Math.min(100, s.brightness + Math.sin(phase(t, time)) * t.amount * 0.6),
    );
  s.scale = Math.round(s.scale);
  return s;
}
/** Reverse appearance time only; media timestamps and adjustment keys use the original clock. */
export function motionProgress(t: Timeline, time: number) {
  const progress = Math.max(0, Math.min(1, (time - t.start) / (t.end - t.start)));
  return t.reverse ? 1 - progress : progress;
}
export function phase(t: Timeline, time: number) {
  return motionProgress(t, time) * Math.PI * 2 * t.cycles * (t.speed ?? 1);
}
export function animateNoise(p: Pixels, t: Timeline, time: number, seed: number): Pixels {
  if (t.effect !== 'boil') return p;
  const data = new Uint8ClampedArray(p.data);
  // Noise is sampled in discrete frames: reverse the exportable frame sequence exactly.
  let elapsed = time - t.start;
  if (t.reverse) {
    const last = frameCount(t) - 1;
    const index = Math.min(last, Math.max(0, Math.floor(elapsed * t.fps + 0.00001)));
    elapsed = (last - index) / t.fps;
  }
  const frame = Math.floor(elapsed * t.fps * (t.speed ?? 1) + 0.00001);
  for (let i = 0; i < data.length; i += 4) {
    const n =
      (noise((i / 4) % p.width, Math.floor(i / 4 / p.width), seed + frame * 7919) - 0.5) *
      t.amount *
      1.5;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  return { ...p, data };
}
export const frameCount = (t: Timeline) => Math.ceil((t.end - t.start) * t.fps - 1e-7);
export const gifDelay = (i: number, fps: number) =>
  (Math.round(((i + 1) * 100) / fps) - Math.round((i * 100) / fps)) * 10;
export function outputDimensions(w: number, h: number, max: number) {
  const r = Math.min(1, max / Math.max(w, h));
  return {
    width: Math.max(2, Math.floor((w * r) / 2) * 2),
    height: Math.max(2, Math.floor((h * r) / 2) * 2),
  };
}

/** Snap playback and scrubbing to the same source timestamps used by export. */
export function sampleTime(t: Timeline, time: number): number {
  const frame = Math.min(
    frameCount(t) - 1,
    Math.max(0, Math.floor((time - t.start) * t.fps + 1e-7)),
  );
  return t.start + frame / t.fps;
}
export function motionAt(t: Timeline, time: number): MotionFrame {
  return {
    progress: motionProgress(t, time),
    effects: t.effects,
    speed: t.speed ?? 1,
  };
}
