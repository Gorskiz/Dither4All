import type { RGB } from './catalog';
import { extractPalette, hexRGB, luminance, rgbHex } from './color';
export type Quantizer = 'median-cut' | 'wu' | 'kmeans' | 'kdtree';
function sampleColors(data: Uint8ClampedArray): RGB[] {
  const points: RGB[] = [],
    stride = Math.max(1, Math.floor(data.length / 4 / 16000));
  for (let i = 0; i < data.length; i += 4 * stride)
    if (data[i + 3] > 127) points.push([data[i], data[i + 1], data[i + 2]]);
  if (!points.length) throw new Error('This image has no opaque colors to extract.');
  return points;
}
function finish(colors: RGB[]): string[] {
  const result = [...new Set(colors.map(rgbHex))].sort(
    (a, b) => luminance(...hexRGB(a)) - luminance(...hexRGB(b)),
  );
  if (result.length === 1) result.push(result[0] === '#ffffff' ? '#000000' : '#ffffff');
  return result;
}
/** Deterministic farthest-point initialization followed by weighted Lloyd refinement. */
function kmeans(points: RGB[], count: number): RGB[] {
  const histogram = new Map<string, { color: RGB; count: number }>();
  for (const p of points) {
    const key = p.join(',');
    const entry = histogram.get(key);
    if (entry) entry.count++;
    else histogram.set(key, { color: p, count: 1 });
  }
  const samples = [...histogram.values()],
    centers: RGB[] = [samples[0].color];
  const distances = new Float64Array(samples.length).fill(Infinity);
  const dist = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  while (centers.length < Math.min(count, samples.length)) {
    let furthest = -1,
      value = -1;
    for (let i = 0; i < samples.length; i++) {
      distances[i] = Math.min(distances[i], dist(samples[i].color, centers[centers.length - 1]));
      const score = distances[i] * Math.sqrt(samples[i].count);
      if (score > value) {
        value = score;
        furthest = i;
      }
    }
    centers.push([...samples[furthest].color]);
  }
  for (let pass = 0; pass < 16; pass++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const sample of samples) {
      let best = 0,
        value = Infinity;
      centers.forEach((c, i) => {
        const d = dist(c, sample.color);
        if (d < value) {
          value = d;
          best = i;
        }
      });
      for (let c = 0; c < 3; c++) sums[best][c] += sample.color[c] * sample.count;
      sums[best][3] += sample.count;
    }
    let movement = 0;
    centers.forEach((old, i) => {
      if (sums[i][3]) {
        const next = sums[i].slice(0, 3).map((v) => v / sums[i][3]) as RGB;
        movement += dist(old, next);
        centers[i] = next;
      }
    });
    if (movement < 0.05) break;
  }
  return centers;
}
/** KD-tree accelerated unique-color Lloyd quantization (libdither's third method).
 * Modified initialization is finite for small/solid palettes, and tie breaks are stable.
 * Robert Kist's method; see public/licenses/libdither*.txt. No native kdtree code is used.
 */
function kdtreeQuantize(points: RGB[], count: number): RGB[] {
  const unique = [...new Map(points.map((p) => [p.join(','), p])).values()];
  const size = Math.min(count, unique.length);
  let centers = Array.from(
    { length: size },
    (_, i) => [...unique[Math.floor((i * unique.length) / size)]] as RGB,
  );
  type Node = { index: number; axis: number; left: Node | null; right: Node | null };
  const distance = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  for (let pass = 0; pass < 10; pass++) {
    const build = (indices: number[], depth = 0): Node | null => {
      if (!indices.length) return null;
      const axis = depth % 3;
      indices.sort((a, b) => centers[a][axis] - centers[b][axis] || a - b);
      const middle = Math.floor(indices.length / 2);
      return {
        index: indices[middle],
        axis,
        left: build(indices.slice(0, middle), depth + 1),
        right: build(indices.slice(middle + 1), depth + 1),
      };
    };
    const root = build(centers.map((_, i) => i)),
      sums = centers.map(() => [0, 0, 0, 0]);
    for (const point of unique) {
      let best = 0,
        bestDistance = Infinity;
      const search = (node: Node | null): void => {
        if (!node) return;
        const value = distance(point, centers[node.index]);
        if (value < bestDistance || (value === bestDistance && node.index < best)) {
          best = node.index;
          bestDistance = value;
        }
        const diff = point[node.axis] - centers[node.index][node.axis];
        search(diff <= 0 ? node.left : node.right);
        if (diff * diff <= bestDistance) search(diff <= 0 ? node.right : node.left);
      };
      search(root);
      for (let c = 0; c < 3; c++) sums[best][c] += point[c];
      sums[best][3]++;
    }
    const next = centers.map((c, i) =>
      sums[i][3] ? (sums[i].slice(0, 3).map((v) => Math.floor(v / sums[i][3])) as RGB) : c,
    );
    const stable = next.every((c, i) => distance(c, centers[i]) === 0);
    centers = next;
    if (stable) break;
  }
  return centers;
}
/** Wu's variance-minimizing box quantizer on a 5-bit RGB moment lattice.
 * Independent TypeScript implementation of the published moment/split approach.
 * Ditherista's Wu mode motivated exposing this alongside median cut.
 */
function wu(points: RGB[], count: number): RGB[] {
  const side = 33,
    index = (r: number, g: number, b: number) => (r * side + g) * side + b;
  const moments = Array.from({ length: 5 }, () => new Float64Array(side ** 3));
  for (const [r, g, b] of points) {
    const i = index((r >> 3) + 1, (g >> 3) + 1, (b >> 3) + 1);
    moments[0][i]++;
    moments[1][i] += r;
    moments[2][i] += g;
    moments[3][i] += b;
    moments[4][i] += r * r + g * g + b * b;
  }
  for (const m of moments)
    for (const stride of [1, side, side * side])
      for (let r = 1; r < side; r++)
        for (let g = 1; g < side; g++)
          for (let b = 1; b < side; b++) {
            const coord = stride === 1 ? b : stride === side ? g : r;
            if (coord > 0) {
              const i = index(r, g, b);
              m[i] += m[i - stride];
            }
          }
  type Box = { lo: RGB; hi: RGB };
  const volume = (box: Box, m: Float64Array) => {
    let sum = 0;
    for (let bits = 0; bits < 8; bits++) {
      const r = bits & 1 ? box.hi[0] : box.lo[0],
        g = bits & 2 ? box.hi[1] : box.lo[1],
        b = bits & 4 ? box.hi[2] : box.lo[2];
      const positives = Number(!!(bits & 1)) + Number(!!(bits & 2)) + Number(!!(bits & 4));
      sum += (positives % 2 ? 1 : -1) * m[index(r, g, b)];
    }
    return sum;
  };
  const score = (box: Box) => {
    const n = volume(box, moments[0]);
    return n > 0 ? moments.slice(1, 4).reduce((sum, m) => sum + volume(box, m) ** 2, 0) / n : 0;
  };
  const variance = (box: Box) => volume(box, moments[4]) - score(box);
  const boxes: Box[] = [{ lo: [0, 0, 0], hi: [32, 32, 32] }];
  while (boxes.length < count) {
    let selected = -1,
      bestVariance = 0;
    boxes.forEach((b, i) => {
      const v = variance(b);
      if (v > bestVariance + 1e-8) {
        selected = i;
        bestVariance = v;
      }
    });
    if (selected < 0) break;
    const box = boxes[selected];
    let best = -Infinity,
      pair: [Box, Box] | null = null;
    for (let axis = 0; axis < 3; axis++)
      for (let cut = box.lo[axis] + 1; cut < box.hi[axis]; cut++) {
        const a: Box = { lo: [...box.lo], hi: [...box.hi] },
          b: Box = { lo: [...box.lo], hi: [...box.hi] };
        a.hi[axis] = cut;
        b.lo[axis] = cut;
        if (volume(a, moments[0]) <= 0 || volume(b, moments[0]) <= 0) continue;
        const value = score(a) + score(b);
        if (value > best) {
          best = value;
          pair = [a, b];
        }
      }
    if (!pair) break;
    boxes.splice(selected, 1, ...pair);
  }
  return boxes.map((b) => {
    const n = volume(b, moments[0]);
    return moments.slice(1, 4).map((m) => volume(b, m) / n) as RGB;
  });
}
export function quantizePalette(
  data: Uint8ClampedArray,
  count: number,
  method: Quantizer,
): string[] {
  if (!Number.isInteger(count) || count < 2 || count > 256)
    throw new Error('Extract between 2 and 256 colors.');
  if (method === 'median-cut') return extractPalette(data, count);
  const points = sampleColors(data);
  return finish(
    method === 'wu'
      ? wu(points, count)
      : method === 'kdtree'
        ? kdtreeQuantize(points, count)
        : kmeans(points, count),
  );
}
