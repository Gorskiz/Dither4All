// Streamed/pruned adaptation of libdither's exact Riemersma L-system definitions.
// Copyright (C) 2022-2025 Robert Kist; see public/licenses/libdither*.txt.
import { curveDefinitions } from './data';
import type { WorkBudget } from '../limits';
interface Summary {
  x: number;
  y: number;
  turn: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
const rotate = (x: number, y: number, d: number): [number, number] =>
  d === 0 ? [x, y] : d === 1 ? [y, -x] : d === 2 ? [-x, -y] : [-y, x];
export function visitLSystem(
  name: string,
  width: number,
  height: number,
  visit: (x: number, y: number) => void,
  budget: WorkBudget,
) {
  const definition = curveDefinitions[name];
  if (!definition) throw new Error('Unknown curve.');
  const cache = new Map<string, Summary>();
  function summary(text: string, depth: number): Summary {
    const key = text + ':' + depth,
      hit = cache.get(key);
    if (hit) return hit;
    const s: Summary = { x: 0, y: 0, turn: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    for (const char of text) {
      budget.tick();
      if (char === '+') s.turn = (s.turn + 1) % 4;
      else if (char === '-') s.turn = (s.turn + 3) % 4;
      else {
        const part =
          depth > 0 && definition.rules[char]
            ? summary(definition.rules[char], depth - 1)
            : char === 'F'
              ? { x: 1, y: 0, turn: 0, minX: 0, minY: 0, maxX: 1, maxY: 0 }
              : null;
        if (!part) continue;
        for (const [x, y] of [
          [part.minX, part.minY],
          [part.minX, part.maxY],
          [part.maxX, part.minY],
          [part.maxX, part.maxY],
        ]) {
          const [rx, ry] = rotate(x, y, s.turn);
          s.minX = Math.min(s.minX, s.x + rx);
          s.maxX = Math.max(s.maxX, s.x + rx);
          s.minY = Math.min(s.minY, s.y + ry);
          s.maxY = Math.max(s.maxY, s.y + ry);
        }
        const [dx, dy] = rotate(part.x, part.y, s.turn);
        s.x += dx;
        s.y += dy;
        s.turn = (s.turn + part.turn) % 4;
      }
    }
    cache.set(key, s);
    return s;
  }
  const direction = definition.orientation[0] === 1 ? 0 : definition.orientation[1] === 1 ? 3 : 0;
  const bounds = (s: Summary, d: number) => {
    const corners = [
      [s.minX, s.minY],
      [s.minX, s.maxY],
      [s.maxX, s.minY],
      [s.maxX, s.maxY],
    ].map(([x, y]) => rotate(x, y, d));
    return {
      minX: Math.min(...corners.map((p) => p[0])),
      maxX: Math.max(...corners.map((p) => p[0])),
      minY: Math.min(...corners.map((p) => p[1])),
      maxY: Math.max(...corners.map((p) => p[1])),
    };
  };
  let depth = 0,
    root: Summary,
    b: ReturnType<typeof bounds>;
  for (; ; depth++) {
    root = summary(definition.axiom, depth);
    b = bounds(root, direction);
    if (b.maxX - b.minX + 1 >= width && b.maxY - b.minY + 1 >= height) break;
    if (depth >= 12) throw new Error('Curve depth budget exceeded. Increase Pixel scale.');
  }
  let x =
    -b.minX - (definition.center.includes('x') ? Math.floor((b.maxX - b.minX + 1 - width) / 2) : 0);
  let y =
      -b.minY -
      (definition.center.includes('y') ? Math.floor((b.maxY - b.minY + 1 - height) / 2) : 0),
    d = direction;
  const seen = new Uint8Array(width * height);
  let count = 0;
  const point = () => {
    if (x >= 0 && x < width && y >= 0 && y < height && !seen[y * width + x]) {
      seen[y * width + x] = 1;
      count++;
      visit(x === 0 ? 0 : x, y === 0 ? 0 : y);
    }
  };
  function walk(text: string, n: number): void {
    budget.tick();
    const s = summary(text, n),
      bb = bounds(s, d);
    if (x + bb.maxX < 0 || x + bb.minX >= width || y + bb.maxY < 0 || y + bb.minY >= height) {
      const [dx, dy] = rotate(s.x, s.y, d);
      x += dx;
      y += dy;
      d = (d + s.turn) % 4;
      return;
    }
    for (const c of text) {
      budget.tick();
      if (n > 0 && definition.rules[c]) walk(definition.rules[c], n - 1);
      else if (c === 'F') {
        const [dx, dy] = rotate(1, 0, d);
        x += dx;
        y += dy;
        point();
      } else if (c === '+') d = (d + 1) % 4;
      else if (c === '-') d = (d + 3) % 4;
    }
  }
  point();
  walk(definition.axiom, depth);
  // Some upstream curves leave geometric holes. Never substitute another curve:
  // the caller fills uncovered edge/hole pixels independently and reports it.
  budget.check();
  return { seen, count };
}
