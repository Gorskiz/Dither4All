/// <reference lib="webworker" />
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
let encoder = GIFEncoder();
self.onmessage = ({ data }) => {
  try {
    if (data.reset) encoder = GIFEncoder();
    const palette = quantize(data.pixels, 256);
    encoder.writeFrame(applyPalette(data.pixels, palette), data.width, data.height, {
      palette,
      delay: data.delay,
      repeat: data.loop ? 0 : -1,
    });
    if (encoder.bytesView().byteLength > 120_000_000)
      throw new Error('GIF exceeds 120 MB. Reduce size or duration.');
    if (data.last) {
      encoder.finish();
      const bytes = encoder.bytes();
      self.postMessage({ bytes }, [bytes.buffer]);
    } else self.postMessage({ done: true });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : 'GIF encoding failed.' });
  }
};
