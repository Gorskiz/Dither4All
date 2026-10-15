import type { Settings } from './catalog';
export type Intent = 'preview' | 'export';
export function methodLimits(algorithm: string) {
  if (algorithm.startsWith('dbs-'))
    return {
      pixels: 65536,
      previewSide: 128,
      motionPixels: 16384,
      motionFrames: 60,
      operations: 90_000_000,
      ms: 8000,
      label: 'DBS',
    };
  if (algorithm.startsWith('curve-') || algorithm.startsWith('riemersma'))
    return {
      pixels: 262144,
      previewSide: 384,
      motionPixels: 65536,
      motionFrames: 240,
      operations: 12_000_000,
      ms: 8000,
      label: 'Curve diffusion',
    };
  if (algorithm.startsWith('lippens-'))
    return {
      pixels: 524288,
      previewSide: 480,
      motionPixels: 131072,
      motionFrames: 360,
      operations: 30_000_000,
      ms: 8000,
      label: 'Lippens–Philips',
    };
  if (algorithm.startsWith('grid-') || algorithm === 'auto-threshold')
    return {
      pixels: 1_000_000,
      previewSide: 640,
      motionPixels: 262144,
      motionFrames: 600,
      operations: 24_000_000,
      ms: 8000,
      label: algorithm === 'auto-threshold' ? 'Automatic threshold' : 'Grid',
    };
  return null;
}
export function assertProcessingSize(
  width: number,
  height: number,
  s: Settings,
  intent: Intent = 'export',
) {
  const limits = methodLimits(s.algorithm);
  if (!limits) return;
  const scale = Math.max(1, Math.round(s.scale)),
    pixels = Math.ceil(width / scale) * Math.ceil(height / scale);
  if (pixels > limits.pixels)
    throw new Error(
      `${limits.label} is limited to ${limits.pixels.toLocaleString('en-US')} working pixels. Increase Pixel scale or choose a smaller output size. No export was resized.`,
    );
  if (intent === 'preview' && pixels > limits.previewSide ** 2)
    throw new Error('Preview exceeds the method budget. Reduce preview size.');
}
export function assertMotionBudget(
  width: number,
  height: number,
  s: Settings,
  frames: number,
  fps: number,
) {
  const limits = methodLimits(s.algorithm);
  if (!limits) return;
  const scale = Math.max(1, Math.round(s.scale)),
    pixels = Math.ceil(width / scale) * Math.ceil(height / scale);
  if (
    pixels > limits.motionPixels ||
    frames > limits.motionFrames ||
    (s.algorithm.startsWith('dbs-') && fps > 12)
  )
    throw new Error(
      `${limits.label} motion limit: ${limits.motionPixels.toLocaleString('en-US')} working pixels/frame, ${limits.motionFrames} frames${s.algorithm.startsWith('dbs-') ? ', at most 12 FPS' : ''}. Reduce resolution/duration/FPS or increase Pixel scale.`,
    );
}
/** Checks amortized operation and wall-time limits, including during recursive traversal. */
export class WorkBudget {
  operations = 0;
  private checkpoint = 0;
  private readonly start: number;
  constructor(
    private readonly maxOperations: number,
    private readonly maxMs: number,
    private readonly now = () => performance.now(),
  ) {
    this.start = now();
  }
  tick(amount = 1) {
    this.operations += amount;
    if (this.operations > this.maxOperations)
      throw new Error(
        'Method operation budget exceeded. Increase Pixel scale, reduce DBS passes, or use a smaller output.',
      );
    if (this.operations - this.checkpoint >= 2048) {
      this.checkpoint = this.operations;
      this.check();
    }
  }
  check() {
    if (this.now() - this.start > this.maxMs)
      throw new Error('Method time budget exceeded. Increase Pixel scale or use a smaller output.');
  }
}
export function budgetFor(algorithm: string, intent: Intent = 'export') {
  const limits = methodLimits(algorithm);
  return new WorkBudget(
    limits?.operations ?? 100_000_000,
    intent === 'preview' ? 3000 : (limits?.ms ?? 15000),
  );
}
export const workerTimeout = (algorithm: string, intent: Intent) =>
  methodLimits(algorithm) ? (intent === 'preview' ? 5000 : 12000) : 60000;
