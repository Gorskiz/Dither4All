import { cloneSettings, defaults, type Settings } from '../engine/catalog';
import { canvasPixels } from '../files';
import { makeSample } from '../sample';
import { drawMotion } from './media';
import { animateNoise, motionAt, settingsAt, timelineDefaults } from './model';
import {
  applyMotionAppearance,
  applyMotionPreset,
  captureMotionAppearance,
  type MotionAppearance,
} from './presets';
import { FrameProcessor } from './processor';

const WIDTH = 96,
  HEIGHT = 72;
export const PREVIEW_FPS = 8,
  PREVIEW_FRAMES = 32;
interface Preview {
  card: HTMLElement;
  appearance: MotionAppearance;
  revision: number;
  available: boolean;
  canvas: HTMLCanvasElement;
  frames: ImageData[];
  failed: boolean;
}
/** One lazy worker, a bounded frame cache, and one playback timer for the whole gallery. */
export class MotionPresetPreviews {
  private processor = new FrameProcessor();
  private observer: IntersectionObserver;
  private previews: Preview[];
  private custom: Preview | undefined;
  private customSignature = '';
  private toggles: { button: HTMLButtonElement; play: string; pause: string }[] = [];
  private visible = new Set<Element>();
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private userPaused = this.reduced.matches;
  private suspended = true;
  private disposed = false;
  private running = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private sample: HTMLCanvasElement | undefined;
  private currentSource: HTMLCanvasElement | null = null;
  private currentImage: HTMLCanvasElement | undefined;
  private currentSettings: Settings | undefined;
  private inputSignature = '';
  private strength = 100;
  private speed = 1;
  private width = WIDTH;
  private height = HEIGHT;
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
    toggle: HTMLButtonElement,
    custom?: { card: HTMLElement; toggle: HTMLButtonElement },
  ) {
    this.previews = [...root.querySelectorAll<HTMLButtonElement>('[data-motion-preset]')].map(
      (card) =>
        this.createPreview(
          card,
          applyMotionPreset(timelineDefaults(4), card.dataset.motionPreset!),
        ),
    );
    this.bindToggle(toggle, 'Play previews', 'Pause previews');
    if (custom) {
      this.custom = this.createPreview(custom.card, timelineDefaults(4));
      this.custom.available = false;
      this.previews.push(this.custom);
      this.bindToggle(custom.toggle, 'Play all previews', 'Pause all previews');
    }
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
    this.reduced.addEventListener('change', this.onReducedMotion);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('pageshow', this.onVisibility);
    this.update();
  }
  private createPreview(card: HTMLElement, appearance: MotionAppearance): Preview {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.className = 'motion-look-preview';
    canvas.setAttribute('aria-hidden', 'true');
    card.prepend(canvas);
    card.dataset.preview = 'pending';
    return {
      card,
      canvas,
      appearance: captureMotionAppearance(appearance),
      revision: 0,
      available: true,
      frames: [],
      failed: false,
    };
  }
  private bindToggle(button: HTMLButtonElement, play: string, pause: string) {
    this.toggles.push({ button, play, pause });
    button.onclick = () => {
      this.userPaused = !this.userPaused;
      this.update();
    };
  }
  /** Reuse one custom card/cache. Revisions discard stale worker replies after selection changes. */
  setCustomAppearance(value: MotionAppearance | null) {
    const p = this.custom;
    if (!p || this.disposed) return;
    const signature = value ? JSON.stringify(value) : '';
    if (signature === this.customSignature) return;
    const appearance = value ? captureMotionAppearance(value) : null;
    this.customSignature = signature;
    p.revision++;
    p.available = !!appearance;
    if (appearance) p.appearance = appearance;
    else this.visible.delete(p.card);
    p.frames.length = 0;
    p.failed = false;
    p.canvas.getContext('2d')!.clearRect(0, 0, p.canvas.width, p.canvas.height);
    p.card.dataset.preview = 'pending';
    delete p.card.dataset.previewFrame;
    p.card.querySelector('.motion-preview-error')?.remove();
    this.update();
  }
  /** Source/recipe changes invalidate every cache, without retaining full-size image copies. */
  setInput(source: HTMLCanvasElement | null, settings?: Settings, referenceSide = 720) {
    if (this.disposed) return;
    const signature = source ? JSON.stringify({ settings, referenceSide }) : '';
    if (source === this.currentSource && signature === this.inputSignature) return;
    this.currentSource = source;
    this.inputSignature = signature;
    this.currentImage = undefined;
    this.currentSettings = undefined;
    this.width = WIDTH;
    this.height = HEIGHT;
    if (source) {
      const ratio = Math.min(WIDTH / source.width, HEIGHT / source.height);
      this.width = Math.max(1, Math.round(source.width * ratio));
      this.height = Math.max(1, Math.round(source.height * ratio));
      const image = document.createElement('canvas');
      image.width = this.width;
      image.height = this.height;
      image.getContext('2d')!.drawImage(source, 0, 0, this.width, this.height);
      this.currentImage = image;
      this.currentSettings = cloneSettings(settings ?? defaults);
      const outputSide = Math.min(Math.max(source.width, source.height), referenceSide);
      this.currentSettings.scale = Math.max(
        1,
        Math.round((this.currentSettings.scale * Math.max(this.width, this.height)) / outputSide),
      );
    }
    this.invalidateFrames();
  }
  setStrength(value: number) {
    if (this.disposed || this.strength === value) return;
    this.strength = value;
    this.invalidateFrames();
  }
  setSpeed(value: number) {
    if (this.disposed || this.speed === value) return;
    this.speed = value;
    this.invalidateFrames();
  }
  private invalidateFrames() {
    for (const p of this.previews) {
      p.revision++;
      p.frames.length = 0;
      p.failed = false;
      p.canvas.width = this.width;
      p.canvas.height = this.height;
      p.card.dataset.preview = 'pending';
      delete p.card.dataset.previewFrame;
      p.card.querySelector('.motion-preview-error')?.remove();
    }
    this.stop();
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
        p.available &&
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
    for (const { button, play, pause } of this.toggles)
      button.textContent = this.userPaused ? play : pause;
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
      if (!this.visible.has(p.card) || !p.available || p.failed) continue;
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
        const revision = p.revision;
        const abort = new AbortController();
        const deadline = setTimeout(() => abort.abort(), 1500);
        try {
          if (!this.currentImage) this.sample ??= makeSample();
          const t = applyMotionAppearance(
            timelineDefaults(4),
            p.appearance,
            this.strength,
            this.speed,
          );
          t.fps = PREVIEW_FPS;
          const time = index / PREVIEW_FPS;
          const settings = cloneSettings(this.currentSettings ?? defaults);
          if (!this.currentSettings) {
            settings.scale = 1;
            settings.palette = ['#162c46', '#467b87', '#b2cba4', '#f1e6c2'];
          }
          const s = settingsAt(settings, t, time);
          const raw = drawMotion(
            this.currentImage ?? this.sample!,
            this.width,
            this.height,
            t,
            time,
          );
          const result = await this.processor.process(
            animateNoise(canvasPixels(raw), t, time, s.seed),
            s,
            'preview',
            abort.signal,
            motionAt(t, time),
          );
          if (this.disposed) break;
          if (p.revision !== revision) continue;
          p.frames.push(
            new ImageData(new Uint8ClampedArray(result.data), result.width, result.height),
          );
          p.card.dataset.preview = p.frames.length === PREVIEW_FRAMES ? 'ready' : 'poster';
          if (this.visible.has(p.card) && this.canRender() && !p.card.dataset.previewFrame)
            this.draw(p, 0);
        } catch (error) {
          if (p.revision !== revision) continue;
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
    this.toggles.forEach(({ button }) => {
      button.onclick = null;
    });
    this.previews.forEach((p) => {
      p.frames.length = 0;
    });
    this.sample = undefined;
    this.currentSource = null;
    this.currentImage = undefined;
    this.currentSettings = undefined;
  }
}
