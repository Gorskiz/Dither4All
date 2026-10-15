import { validateTimeline } from './motion/model';
import type { MotionProject } from './motion/editor';
import { validateSettings, type Settings } from './engine/catalog';
import type { Pixels } from './engine/process';
import { luminance } from './engine/color';
export const MAX_PIXELS = 16_000_000;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function imageCanvas(pixels: Pixels): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas
    .getContext('2d')!
    .putImageData(
      new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
      0,
      0,
    );
  return canvas;
}
export function canvasPixels(canvas: HTMLCanvasElement): Pixels {
  return {
    width: canvas.width,
    height: canvas.height,
    data: canvas
      .getContext('2d', { willReadFrequently: true })!
      .getImageData(0, 0, canvas.width, canvas.height).data,
  };
}
export async function decodeImage(file: Blob): Promise<HTMLCanvasElement> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Choose an image smaller than 50 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS || bitmap.width > 8192 || bitmap.height > 8192)
      throw new Error('Choose an image up to 16 megapixels and 8192 pixels per side.');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}
export async function rasterBlob(pixels: Pixels, format: string, quality = 0.94): Promise<Blob> {
  const canvas = imageCanvas(pixels),
    type = `image/${format === 'jpg' ? 'jpeg' : format}`;
  if (format === 'jpg') {
    const ctx = canvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('The browser could not encode this image.'));
        else if (blob.type !== type)
          reject(new Error(`This browser cannot export ${format.toUpperCase()}. Try PNG.`));
        else resolve(blob);
      },
      type,
      quality,
    ),
  );
}
/** Lossless horizontal pixel runs, not a raster image embedded in an SVG. */
export function svgImage(pixels: Pixels, blackOnly = false): string {
  const { width, height, data } = pixels;
  if (width * height > 1_000_000)
    throw new Error(
      'SVG is limited to 1 megapixel to keep vector files manageable. Choose a smaller export size.',
    );
  const runs: string[] = [];
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      const p = (y * width + x) * 4,
        r = data[p],
        g = data[p + 1],
        b = data[p + 2],
        a = data[p + 3],
        start = x;
      x++;
      while (x < width) {
        const q = (y * width + x) * 4;
        if (data[q] !== r || data[q + 1] !== g || data[q + 2] !== b || data[q + 3] !== a) break;
        x++;
      }
      if (a === 0 || (blackOnly && luminance(r, g, b) >= 128)) continue;
      const color = blackOnly
        ? '#000000'
        : `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      runs.push(
        `<path fill="${color}"${a < 255 ? ` fill-opacity="${(a / 255).toFixed(3)}"` : ''} d="M${start} ${y}h${x - start}v1H${start}z"/>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${runs.join('')}</svg>`;
}
export interface Project {
  version: 1;
  name: string;
  settings: Settings;
  image: string;
  motion?: MotionProject;
}
export function readProject(text: string): Project {
  let p: unknown;
  try {
    p = JSON.parse(text);
  } catch {
    throw new Error('This is not a valid project JSON file.');
  }
  if (!p || typeof p !== 'object') throw new Error('Invalid project.');
  const project = p as Project;
  if (
    project.version !== 1 ||
    typeof project.image !== 'string' ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(project.image) ||
    typeof project.name !== 'string'
  )
    throw new Error('Unsupported project format.');
  if (project.motion) {
    const motion = project.motion;
    motion.timeline = validateTimeline(motion.timeline, motion.duration);
    if (
      motion.video &&
      (typeof motion.video.name !== 'string' ||
        motion.video.name.length > 255 ||
        !Number.isFinite(motion.video.size) ||
        motion.video.size < 0 ||
        motion.video.size > 500_000_000 ||
        !Number.isFinite(motion.video.lastModified))
    )
      throw new Error('Invalid video reference.');
  }
  return {
    ...project,
    name: project.name.slice(0, 160),
    settings: validateSettings(project.settings),
  };
}
export function parsePalette(text: string): string[] {
  let colors: string[] = [];
  try {
    const value = JSON.parse(text);
    colors = Array.isArray(value) ? value : value.colors;
  } catch {
    colors = text.match(/#[a-fA-F0-9]{6}\b/g) || [];
    if (!colors.length && text.startsWith('GIMP Palette'))
      colors = text.split('\n').flatMap((line) => {
        const m = line.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/);
        return m && m.slice(1).every((v) => +v <= 255)
          ? [
              '#' +
                m
                  .slice(1)
                  .map((v) => (+v).toString(16).padStart(2, '0'))
                  .join(''),
            ]
          : [];
      });
  }
  if (
    !Array.isArray(colors) ||
    colors.length < 2 ||
    colors.length > 256 ||
    !colors.every((c) => typeof c === 'string' && /^#[a-f0-9]{6}$/i.test(c))
  )
    throw new Error('Import 2–256 colors as hex text, palette JSON, or a GIMP .gpl file.');
  return colors;
}
// ZIP "store" entries: no compression dependency, predictable memory usage.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function zipFiles(files: { name: string; data: Uint8Array }[]): Blob {
  const chunks: Uint8Array[] = [],
    directory: Uint8Array[] = [];
  let offset = 0,
    dirSize = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name),
      bytes = file.data;
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length),
      v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, bytes.length, true);
    v.setUint32(22, bytes.length, true);
    v.setUint16(26, name.length, true);
    header.set(name, 30);
    const central = new Uint8Array(46 + name.length),
      c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, bytes.length, true);
    c.setUint32(24, bytes.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    chunks.push(header, bytes);
    directory.push(central);
    offset += header.length + bytes.length;
    dirSize += central.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, dirSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end] as BlobPart[], { type: 'application/zip' });
}
