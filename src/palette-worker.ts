/// <reference lib="webworker" />
import { quantizePalette, type Quantizer } from './engine/quantization';
self.onmessage = ({
  data,
}: MessageEvent<{ pixels: Uint8ClampedArray; count: number; method: Quantizer }>) => {
  try {
    self.postMessage({ colors: quantizePalette(data.pixels, data.count, data.method) });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : 'Palette extraction failed.' });
  }
};
