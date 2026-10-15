/// <reference lib="webworker" />
import { processImage, type Pixels } from './engine/process';
import { processMotionFrame } from './motion/effects';
import { validateSettings } from './engine/catalog';
self.onmessage = (
  event: MessageEvent<{ pixels: Pixels; settings: unknown; intent?: string; motion?: unknown }>,
) => {
  try {
    const settings = validateSettings(event.data.settings);
    const intent = event.data.intent === 'preview' ? 'preview' : 'export';
    const result =
      event.data.motion === undefined
        ? processImage(event.data.pixels, settings, intent)
        : processMotionFrame(event.data.pixels, settings, event.data.motion, intent);
    self.postMessage({ result }, { transfer: [result.data.buffer] });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Image processing failed.',
    });
  }
};
