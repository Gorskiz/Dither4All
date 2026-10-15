import * as m from 'mediabunny';

export async function createVideo() {
  const target = new m.BufferTarget();
  const output = new m.Output({ format: new m.WebMOutputFormat(), target });
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const source = new m.CanvasSource(canvas, { codec: 'vp8', bitrate: 200_000 });
  const audio = new m.AudioSampleSource({ codec: 'opus', bitrate: 64_000 });
  output.addVideoTrack(source, { frameRate: 12 });
  output.addAudioTrack(audio);
  await output.start();
  for (let i = 0; i < 24; i++) {
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#254e72';
    ctx.fillRect(0, 0, 160, 120);
    ctx.fillStyle = '#ffe2a1';
    ctx.fillRect(i * 5, 20, 30, 80);
    await source.add(i / 12, 1 / 12);
  }
  source.close();
  const samples = new Float32Array(48_000 * 2);
  for (let i = 0; i < samples.length; i++)
    samples[i] = Math.sin((i / 48_000) * 440 * Math.PI * 2) * 0.1;
  const sample = new m.AudioSample({
    data: samples,
    format: 'f32',
    numberOfChannels: 1,
    sampleRate: 48_000,
    timestamp: 0,
  });
  await audio.add(sample);
  sample.close();
  audio.close();
  await output.finalize();
  return Array.from(new Uint8Array(target.buffer!)) as number[];
}

export async function inspectVideo(bytes: number[]) {
  const input = new m.Input({
    formats: m.ALL_FORMATS,
    source: new m.BlobSource(new Blob([new Uint8Array(bytes)])),
  });
  try {
    const video = (await input.getPrimaryVideoTrack())!,
      audio = await input.getPrimaryAudioTrack();
    return {
      duration: await video.computeDuration(),
      width: await video.getDisplayWidth(),
      audio: audio ? await audio.computeDuration() : null,
    };
  } finally {
    input.dispose();
  }
}

export async function supportsFormat(format: 'mp4' | 'webm') {
  return (
    (await m.canEncodeVideo(format === 'mp4' ? 'avc' : 'vp8', {
      width: 160,
      height: 120,
      frameRate: 12,
    })) &&
    (await m.canEncodeAudio(format === 'mp4' ? 'aac' : 'opus', {
      numberOfChannels: 1,
      sampleRate: 48000,
    }))
  );
}
