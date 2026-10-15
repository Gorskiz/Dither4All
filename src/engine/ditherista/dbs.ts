// Modified bounded adaptation of libdither's DBS (Robert Kist / Sankar Srinivasan).
// See public/licenses/libdither.txt and libdither-additional.txt.
import type { WorkBudget } from '../limits';
export interface DbsResult {
  bits: Uint8Array;
  passes: number;
  converged: boolean;
  initialEnergy: number;
  finalEnergy: number;
}
export function dbsKernel(formula: number) {
  const g = new Float64Array(49);
  let sum = 0;
  const divisor = [1, 2, 2.25, 1.5, 4.5, 8, 16][formula];
  for (let y = -3; y <= 3; y++)
    for (let x = -3; x <= 3; x++) {
      const r = x * x + y * y,
        v = formula === 3 ? 2 * Math.exp(-r / 1.5) + Math.exp(-r / 8) : Math.exp(-r / divisor);
      g[(y + 3) * 7 + x + 3] = v;
      sum += v;
    }
  for (let i = 0; i < 49; i++) g[i] /= sum;
  const kernel = new Float64Array(169);
  for (let dy = -6; dy <= 6; dy++)
    for (let dx = -6; dx <= 6; dx++) {
      let value = 0;
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 7; x++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx >= 0 && nx < 7 && ny >= 0 && ny < 7) value += g[y * 7 + x] * g[ny * 7 + nx];
        }
      kernel[(dy + 6) * 13 + dx + 6] = value;
    }
  return kernel;
}
export function directBinarySearch(
  target: Float32Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  formula: number,
  maxPasses: number,
  budget: WorkBudget,
): DbsResult {
  const bits = Uint8Array.from(target, (v, i) => (alpha[i] && v >= 0.5 ? 1 : 0)),
    kernel = dbsKernel(formula),
    correlation = new Float64Array(target.length);
  const error = (i: number) => ((bits[i] - target[i]) * alpha[i]) / 255;
  const scatter = (x: number, y: number, value: number) => {
    if (!value) return;
    budget.tick(169);
    for (let dy = -6; dy <= 6; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -6; dx <= 6; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < width)
          correlation[ny * width + nx] += value * kernel[(dy + 6) * 13 + dx + 6];
      }
    }
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) scatter(x, y, error(y * width + x));
  const energy = () => {
    let sum = 0;
    for (let i = 0; i < bits.length; i++) sum += error(i) * correlation[i];
    return Math.max(0, sum);
  };
  const initialEnergy = energy(),
    center = kernel[84];
  let passes = 0,
    converged = false;
  for (; passes < maxPasses; passes++) {
    let changes = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        budget.tick(9);
        const p = y * width + x;
        if (!alpha[p]) continue;
        const a0 = ((bits[p] ? -1 : 1) * alpha[p]) / 255;
        let best = 0,
          bestQ = p,
          bestA1 = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const q = ny * width + nx;
            if (!alpha[q] || (q !== p && bits[q] === bits[p])) continue;
            const a1 = q === p ? 0 : ((bits[q] ? -1 : 1) * alpha[q]) / 255;
            const delta =
              (a0 * a0 + a1 * a1) * center +
              2 * a0 * a1 * kernel[(dy + 6) * 13 + dx + 6] +
              2 * a0 * correlation[p] +
              2 * a1 * correlation[q];
            if (delta < best - 1e-12) {
              best = delta;
              bestQ = q;
              bestA1 = a1;
            }
          }
        if (best < 0) {
          scatter(x, y, a0);
          bits[p] = 1 - bits[p];
          if (bestQ !== p) {
            scatter(bestQ % width, Math.floor(bestQ / width), bestA1);
            bits[bestQ] = 1 - bits[bestQ];
          }
          changes++;
        }
      }
    if (!changes) {
      passes++;
      converged = true;
      break;
    }
  }
  budget.check();
  return { bits, passes, converged, initialEnergy, finalEnergy: energy() };
}
