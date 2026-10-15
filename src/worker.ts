/// <reference lib="webworker" />
import { processImage, type Pixels } from './engine/process';
import { validateSettings } from './engine/catalog';
self.onmessage = (event: MessageEvent<{ pixels: Pixels; settings: unknown; intent?: string }>) => {
  try {
    const result = processImage(
      event.data.pixels,
      validateSettings(event.data.settings),
      event.data.intent === 'preview' ? 'preview' : 'export',
    );
    self.postMessage({ result }, { transfer: [result.data.buffer] });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Image processing failed.',
    });
  }
};
