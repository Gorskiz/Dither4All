import type { Settings } from '../engine/catalog';
import type { MotionFrame } from './catalog';
import type { Pixels } from '../engine/process';
import { assertProcessingSize, workerTimeout, type Intent } from '../engine/limits';
/** Persistent worker with a hard main-thread watchdog. Termination cancels synchronous work. */
export class FrameProcessor {
  private worker: Worker | null = null;
  private reject: ((reason: Error) => void) | undefined;
  process(
    pixels: Pixels,
    settings: Settings,
    intent: Intent = 'export',
    signal?: AbortSignal,
    motion?: MotionFrame,
  ): Promise<Pixels> {
    if (this.reject) throw new Error('Frame processor is busy.');
    signal?.throwIfAborted();
    assertProcessingSize(pixels.width, pixels.height, settings, intent);
    const worker = (this.worker ??= new Worker(new URL('../worker.ts', import.meta.url), {
      type: 'module',
    }));
    return new Promise((resolve, reject) => {
      this.reject = reject;
      let settled = false;
      const finish = (error?: Error, result?: Pixels) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        this.reject = undefined;
        error ? reject(error) : resolve(result!);
      };
      const stop = (error: Error) => {
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        finish(error);
      };
      const abort = () => stop(new DOMException('Cancelled', 'AbortError'));
      const timer = setTimeout(
        () =>
          stop(
            new Error(
              'Worker time limit reached. Increase Pixel scale or choose a smaller output.',
            ),
          ),
        workerTimeout(settings.algorithm, intent),
      );
      this.reject = (error) => stop(error);
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }) =>
        finish(data.error ? new Error(data.error) : undefined, data.result);
      worker.onerror = (event) => stop(new Error(event.message || 'Frame processing failed.'));
      try {
        worker.postMessage({ pixels, settings, intent, motion }, [pixels.data.buffer]);
      } catch (e) {
        stop(e instanceof Error ? e : new Error('Could not start worker.'));
      }
    });
  }
  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.reject?.(new DOMException('Cancelled', 'AbortError'));
  }
}
