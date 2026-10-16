import { assertMotionBudget, methodLimits } from '../engine/limits';
import { canvasPixels, rasterBlob, zipFiles } from '../files';
import { type Settings } from '../engine/catalog';
import { FrameProcessor } from './processor';
import {
  animateNoise,
  motionAt,
  frameCount,
  gifDelay,
  outputDimensions,
  phase,
  settingsAt,
  validateTimeline,
  type Timeline,
} from './model';
import type { Input, InputVideoTrack, CanvasSink } from 'mediabunny';

export class VideoAsset {
  private constructor(
    public file: File,
    public input: Input,
    public track: InputVideoTrack,
    public first: number,
    public duration: number,
    public width: number,
    public height: number,
    public hasAudio: boolean,
  ) {}
  static async open(file: File) {
    if (file.size > 500_000_000) throw new Error('Videos must be under 500 MB.');
    const m = await import('mediabunny');
    const input = new m.Input({ formats: m.ALL_FORMATS, source: new m.BlobSource(file) });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track || !(await track.canDecode()))
        throw new Error('This browser cannot decode this video. Try an MP4 with H.264 or a WebM.');
      const first = await track.getFirstTimestamp(),
        duration = (await track.computeDuration()) - first;
      const width = await track.getDisplayWidth(),
        height = await track.getDisplayHeight();
      if (
        !Number.isFinite(duration) ||
        duration < 0.01 ||
        duration > 7200 ||
        width * height > 16_000_000 ||
        Math.max(width, height) > 8192
      )
        throw new Error('Use a video under 2 hours and 16 megapixels per frame.');
      return new VideoAsset(
        file,
        input,
        track,
        first,
        duration,
        width,
        height,
        !!(await input.getPrimaryAudioTrack()),
      );
    } catch (e) {
      input.dispose();
      throw e;
    }
  }
  async sink(max: number): Promise<CanvasSink> {
    const m = await import('mediabunny');
    return new m.CanvasSink(this.track, {
      ...outputDimensions(this.width, this.height, max),
      fit: 'fill',
      poolSize: 2,
    });
  }
  dispose() {
    this.input.dispose();
  }
}
export function drawMotion(
  input: CanvasImageSource,
  w: number,
  h: number,
  t: Timeline,
  time: number,
  matte = false,
) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (matte) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  }
  if (t.effect === 'zoom') {
    const zoom = 1 + ((1 - Math.cos(phase(t, time))) * t.amount) / 200;
    ctx.drawImage(input, (-w * (zoom - 1)) / 2, (-h * (zoom - 1)) / 2, w * zoom, h * zoom);
  } else if (t.effect === 'pan') {
    const offset =
      (((((time - t.start) / (t.end - t.start)) * t.cycles * (t.speed ?? 1) * t.amount) / 100) *
        w) %
      w;
    ctx.drawImage(input, -offset, 0, w, h);
    ctx.drawImage(input, w - offset, 0, w, h);
  } else ctx.drawImage(input, 0, 0, w, h);
  return canvas;
}
export interface MotionExport {
  video: VideoAsset | null;
  still: HTMLCanvasElement;
  timeline: Timeline;
  settings: Settings;
  format: 'mp4' | 'webm' | 'gif' | 'frames';
  size: number;
  audio: boolean;
  signal: AbortSignal;
  progress: (done: number, total: number) => void;
}
export async function exportMotion(o: MotionExport): Promise<Blob> {
  const t = validateTimeline(o.timeline, o.video?.duration ?? 30),
    count = frameCount(t);
  const dims = outputDimensions(
    o.video?.width ?? o.still.width,
    o.video?.height ?? o.still.height,
    o.format === 'gif' ? Math.min(640, o.size) : o.size,
  );
  if (count > 900)
    throw new Error('Export is limited to 900 frames. Reduce the duration or frame rate.');
  const minimumScale = Math.min(
    o.settings.scale,
    ...t.keys.filter((k) => k.channel === 'scale').map((k) => k.value),
  );
  assertMotionBudget(dims.width, dims.height, { ...o.settings, scale: minimumScale }, count, t.fps);
  const m = await import('mediabunny');
  const codec = o.format === 'mp4' ? 'avc' : 'vp8',
    audioCodec = o.format === 'mp4' ? 'aac' : 'opus';
  const movie = o.format === 'mp4' || o.format === 'webm';
  if (movie && !(await m.canEncodeVideo(codec, { ...dims, frameRate: t.fps })))
    throw new Error(
      `${o.format.toUpperCase()} encoding is unavailable in this browser. Try WebM, GIF or PNG frames.`,
    );
  let asset: VideoAsset | null = null,
    processor: FrameProcessor | null = null,
    gif: Worker | null = null;
  let output: InstanceType<typeof m.Output> | null = null;
  let iterator:
    AsyncGenerator<import('mediabunny').WrappedCanvas | null, void, unknown> | undefined;
  const originalSignal = o.signal,
    controller = new AbortController();
  const forwardAbort = () => controller.abort(originalSignal.reason);
  if (originalSignal.aborted) forwardAbort();
  else originalSignal.addEventListener('abort', forwardAbort, { once: true });
  const deadline = methodLimits(o.settings.algorithm)
    ? setTimeout(
        () =>
          controller.abort(
            new Error(
              'Motion export exceeded its 90-second budget. Reduce duration or resolution.',
            ),
          ),
        90000,
      )
    : undefined;
  o = { ...o, signal: controller.signal };
  const abort = () => {
    processor?.dispose();
    gif?.terminate();
    asset?.dispose();
  };
  o.signal.addEventListener('abort', abort, { once: true });
  const check = () => o.signal.throwIfAborted();
  try {
    check();
    if (o.video) asset = await VideoAsset.open(o.video.file);
    const audioTrack = asset && o.audio && movie ? await asset.input.getPrimaryAudioTrack() : null;
    if (
      audioTrack &&
      (!(await audioTrack.canDecode()) ||
        !(await m.canEncodeAudio(audioCodec, {
          numberOfChannels: await audioTrack.getNumberOfChannels(),
          sampleRate: await audioTrack.getSampleRate(),
        })))
    )
      throw new Error(
        'Audio encoding is unavailable. Turn off Include audio, or choose a different video format.',
      );
    check();
    processor = new FrameProcessor();
    const target = new m.BufferTarget(),
      canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    let videoSource: InstanceType<typeof m.CanvasSource> | undefined,
      audioSource: InstanceType<typeof m.AudioSampleSource> | undefined;
    if (movie) {
      output = new m.Output({
        format:
          o.format === 'mp4'
            ? new m.Mp4OutputFormat({ fastStart: 'in-memory' })
            : new m.WebMOutputFormat(),
        target,
      });
      videoSource = new m.CanvasSource(canvas, { codec, bitrate: 4_000_000 });
      output.addVideoTrack(videoSource, { frameRate: t.fps });
      if (audioTrack) {
        audioSource = new m.AudioSampleSource({ codec: audioCodec, bitrate: 128_000 });
        output.addAudioTrack(audioSource);
      }
      await output.start();
    }
    if (o.format === 'gif')
      gif = new Worker(new URL('./gif-worker.ts', import.meta.url), { type: 'module' });
    if (asset)
      iterator = (await asset.sink(o.size)).canvasesAtTimestamps(
        Array.from({ length: count }, (_, i) => asset!.first + t.start + i / t.fps),
      );
    const files: { name: string; data: Uint8Array }[] = [];
    let totalBytes = 0,
      gifBytes: Uint8Array<ArrayBuffer> | undefined;
    for (let i = 0; i < count; i++) {
      check();
      const time = t.start + i / t.fps;
      const frame = iterator ? (await iterator.next()).value : null;
      check();
      if (iterator && !frame) throw new Error('A video frame could not be decoded.');
      const original = drawMotion(
        frame ? frame.canvas : o.still,
        dims.width,
        dims.height,
        t,
        time,
        movie || o.format === 'gif',
      );
      const s = settingsAt(o.settings, t, time);
      const result = await processor.process(
        animateNoise(canvasPixels(original), t, time, s.seed),
        s,
        'export',
        o.signal,
        motionAt(t, time),
      );
      check();
      canvas
        .getContext('2d')!
        .putImageData(
          new ImageData(new Uint8ClampedArray(result.data), dims.width, dims.height),
          0,
          0,
        );
      const duration = Math.min(1 / t.fps, t.end - time);
      if (videoSource) await videoSource.add(i / t.fps, duration);
      else if (gif) {
        const worker = gif;
        const reply = await new Promise<{ bytes?: Uint8Array<ArrayBuffer> }>((resolve, reject) => {
          const cancelled = () => reject(new DOMException('Cancelled', 'AbortError'));
          o.signal.addEventListener('abort', cancelled, { once: true });
          worker.onmessage = ({ data }) => {
            o.signal.removeEventListener('abort', cancelled);
            data.error ? reject(new Error(data.error)) : resolve(data);
          };
          worker.onerror = () => {
            o.signal.removeEventListener('abort', cancelled);
            reject(new Error('GIF encoding failed.'));
          };
          worker.postMessage(
            {
              pixels: result.data,
              width: dims.width,
              height: dims.height,
              delay:
                i === count - 1
                  ? Math.max(
                      10,
                      Math.round((t.end - t.start) * 100) * 10 - Math.round((i * 100) / t.fps) * 10,
                    )
                  : gifDelay(i, t.fps),
              loop: t.loop,
              last: i === count - 1,
              reset: i === 0,
            },
            [result.data.buffer],
          );
        });
        gifBytes = reply.bytes;
      } else {
        const data = new Uint8Array(await (await rasterBlob(result, 'png')).arrayBuffer());
        totalBytes += data.byteLength;
        if (totalBytes > 120_000_000)
          throw new Error('PNG sequence exceeds 120 MB. Reduce size or duration.');
        files.push({ name: `frame-${String(i + 1).padStart(5, '0')}.png`, data });
      }
      o.progress(i + 1, count);
    }
    videoSource?.close();
    if (audioTrack && audioSource && asset) {
      const start = asset.first + t.start,
        end = asset.first + t.end;
      for await (const sample of new m.AudioSampleSink(audioTrack).samples(start, end)) {
        try {
          check();
          const a = Math.max(0, Math.ceil((start - sample.timestamp) * sample.sampleRate));
          const b = Math.min(
            sample.numberOfFrames,
            Math.floor((end - sample.timestamp) * sample.sampleRate),
          );
          if (b > a) {
            const clipped = sample.trim(a, b);
            try {
              clipped.setTimestamp(Math.max(0, clipped.timestamp - start));
              await audioSource.add(clipped);
            } finally {
              clipped.close();
            }
          }
        } finally {
          sample.close();
        }
      }
      audioSource.close();
    }
    check();
    if (output) {
      await output.finalize();
      check();
      return new Blob([target.buffer!], { type: o.format === 'mp4' ? 'video/mp4' : 'video/webm' });
    }
    if (gifBytes) return new Blob([gifBytes], { type: 'image/gif' });
    files.push({
      name: 'animation.json',
      data: new TextEncoder().encode(
        JSON.stringify(
          { fps: t.fps, duration: t.end - t.start, loop: t.loop, frames: count },
          null,
          2,
        ),
      ),
    });
    return zipFiles(files);
  } catch (error) {
    if (o.signal.aborted && !originalSignal.aborted) throw o.signal.reason;
    throw error;
  } finally {
    clearTimeout(deadline);
    originalSignal.removeEventListener('abort', forwardAbort);
    o.signal.removeEventListener('abort', abort);
    processor?.dispose();
    gif?.terminate();
    await iterator?.return().catch(() => {});
    asset?.dispose();
    if (output && output.state !== 'finalized' && output.state !== 'canceled')
      await output.cancel().catch(() => {});
  }
}
