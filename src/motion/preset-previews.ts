import { cloneSettings, defaults } from '../engine/catalog';
import { canvasPixels } from '../files';
import { makeSample } from '../sample';
import { drawMotion } from './media';
import { animateNoise, motionAt, settingsAt, timelineDefaults } from './model';
import { applyMotionPreset } from './presets';
import { FrameProcessor } from './processor';

const WIDTH = 96,
  HEIGHT = 72;
export const PREVIEW_FPS = 8,
  PREVIEW_FRAMES = 32;
interface Preview {
  card: HTMLButtonElement;
  canvas: HTMLCanvasElement;
  frames: ImageData[];
  failed: boolean;
}
/** One lazy worker, a bounded frame cache, and one playback timer for the whole gallery. */
export class MotionPresetPreviews {
  private processor = new FrameProcessor();
  private observer: IntersectionObserver;
  private previews: Preview[];
  private visible = new Set<Element>();
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private userPaused = this.reduced.matches;
  private suspended = true;
  private disposed = false;
  private running = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private sample: HTMLCanvasElement | undefined;
  private origin = performance.now();
  private cursor = 0;
  private onVisibility = () => this.update();
  private onReducedMotion = () => {
    if (this.reduced.matches) this.userPaused = true;
    this.update();
  };
  private onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) this.dispose();
    else this.stop();
  };

  constructor(
    root: HTMLElement,
    private toggle: HTMLButtonElement,
  ) {
    this.previews = [...root.querySelectorAll<HTMLButtonElement>('[data-motion-preset]')].map(
      (card) => {
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        canvas.className = 'motion-look-preview';
        canvas.setAttribute('aria-hidden', 'true');
        card.prepend(canvas);
        card.dataset.preview = 'pending';
        return { card, canvas, frames: [], failed: false };
      },
    );
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.visible.add(entry.target);
          else this.visible.delete(entry.target);
        }
        this.update();
      },
      { threshold: 0.01 },
    );
    this.previews.forEach(({ card }) => this.observer.observe(card));
    toggle.onclick = () => {
      this.userPaused = !this.userPaused;
      this.update();
    };
    this.reduced.addEventListener('change', this.onReducedMotion);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onVisibility);
    this.update();
  }
  setSuspended(value: boolean) {
    if (this.suspended === value) return;
    this.suspended = value;
    this.update();
  }
  private canRender() {
    return !this.disposed && !this.suspended && !document.hidden && this.visible.size > 0;
  }
  private jobs() {
    return this.previews.filter(
      (p) =>
        this.visible.has(p.card) &&
        !p.failed &&
        p.frames.length < (this.userPaused ? 1 : PREVIEW_FRAMES),
    );
  }
  private stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.processor.dispose();
  }
  private update() {
    if (this.disposed) return;
    this.toggle.textContent = this.userPaused ? 'Play previews' : 'Pause previews';
    if (!this.canRender()) {
      this.stop();
      return;
    }
    if (this.userPaused) {
      clearInterval(this.timer);
      this.timer = undefined;
    } else if (!this.timer) {
      this.origin = performance.now();
      this.timer = setInterval(() => this.paint(), 1000 / PREVIEW_FPS);
    }
    void this.pump();
  }
  private paint() {
    if (!this.canRender() || this.userPaused) return;
    const index =
      Math.floor(((performance.now() - this.origin) / 1000) * PREVIEW_FPS) % PREVIEW_FRAMES;
    for (const p of this.previews) {
      if (!this.visible.has(p.card) || p.failed) continue;
      const frame = p.frames[index] ? index : 0;
      this.draw(p, frame);
    }
  }
  private draw(p: Preview, index: number) {
    if (!p.frames[index] || p.card.dataset.previewFrame === String(index)) return;
    p.canvas.getContext('2d')!.putImageData(p.frames[index], 0, 0);
    p.card.dataset.previewFrame = String(index);
  }
  private async pump() {
    if (this.running || !this.canRender()) return;
    this.running = true;
    try {
      while (this.canRender()) {
        const jobs = this.jobs();
        if (!jobs.length) break;
        const p = jobs[this.cursor++ % jobs.length];
        const index = p.frames.length;
        const abort = new AbortController();
        const deadline = setTimeout(() => abort.abort(), 1500);
        try {
          this.sample ??= makeSample();
          const t = applyMotionPreset(timelineDefaults(4), p.card.dataset.motionPreset!);
          t.fps = PREVIEW_FPS;
          const time = index / PREVIEW_FPS;
          const settings = cloneSettings(defaults);
          settings.scale = 1;
          settings.palette = ['#162c46', '#467b87', '#b2cba4', '#f1e6c2'];
          const s = settingsAt(settings, t, time);
          const raw = drawMotion(this.sample, WIDTH, HEIGHT, t, time);
          const result = await this.processor.process(
            animateNoise(canvasPixels(raw), t, time, s.seed),
            s,
            'preview',
            abort.signal,
            motionAt(t, time),
          );
          if (this.disposed) break;
          p.frames.push(new ImageData(new Uint8ClampedArray(result.data), WIDTH, HEIGHT));
          p.card.dataset.preview = p.frames.length === PREVIEW_FRAMES ? 'ready' : 'poster';
          if (this.visible.has(p.card) && this.canRender() && !p.card.dataset.previewFrame)
            this.draw(p, 0);
        } catch (error) {
          if (
            abort.signal.aborted ||
            !(error instanceof DOMException && error.name === 'AbortError')
          ) {
            p.failed = true;
            p.card.dataset.preview = 'unavailable';
            const message = document.createElement('small');
            message.className = 'motion-preview-error';
            message.textContent = 'Preview unavailable';
            message.setAttribute('aria-hidden', 'true');
            p.card.append(message);
          }
        } finally {
          clearTimeout(deadline);
        }
        // Let input, scrolling, and main preview messages run between tiny jobs.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      this.running = false;
      if (this.canRender() && this.jobs().length) void this.pump();
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.observer.disconnect();
    this.reduced.removeEventListener('change', this.onReducedMotion);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('pageshow', this.onVisibility);
    this.visible.clear();
    this.previews.forEach((p) => {
      p.frames.length = 0;
    });
    this.sample = undefined;
  }
}
