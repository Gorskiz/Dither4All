import type { Settings } from '../engine/catalog';
import type { Pixels } from '../engine/process';
/** One persistent worker per playback or export. Dispose cancels the outstanding frame. */
export class FrameProcessor {
  private worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
  private reject: ((reason: Error) => void) | undefined;
  process(pixels: Pixels, settings: Settings): Promise<Pixels> {
    if (this.reject) throw new Error('Frame processor is busy.');
    return new Promise((resolve, reject) => {
      this.reject = reject;
      this.worker.onmessage = ({ data }) => {
        this.reject = undefined;
        data.error ? reject(new Error(data.error)) : resolve(data.result);
      };
      this.worker.onerror = () => {
        this.reject = undefined;
        reject(new Error('Frame processing failed.'));
      };
      this.worker.postMessage({ pixels, settings }, [pixels.data.buffer]);
    });
  }
  dispose() {
    this.worker.terminate();
    this.reject?.(new DOMException('Cancelled', 'AbortError'));
    this.reject = undefined;
  }
}
