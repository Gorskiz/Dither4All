import type { RGB, Settings } from './catalog';
import { clamp, luminance } from './color';
export const srgbToLinear = (v: number) => {
  v = clamp(v) / 255;
  return 255 * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
};
export const linearToSrgb = (v: number) => {
  v = clamp(v) / 255;
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
};
/** CIELAB, D65 white, sRGB primaries. Input is 0–255 encoded sRGB or linear RGB. */
export function toLab(rgb: RGB, linear = false): RGB {
  const [r, g, b] = rgb.map((v) => (linear ? clamp(v) : srgbToLinear(v)) / 255);
  const f = (v: number) => (v > 216 / 24389 ? Math.cbrt(v) : (v * 841) / 108 + 4 / 29);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** CIEDE2000 from the published equation, kL=kC=kH=1.
 * Validated against Sharma/Wu/Dalal's supplementary reference pairs.
 * https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
 */
export function deltaE2000(a: RGB, b: RGB): number {
  const rad = Math.PI / 180,
    deg = 180 / Math.PI,
    C1 = Math.hypot(a[1], a[2]),
    C2 = Math.hypot(b[1], b[2]);
  const avgC = (C1 + C2) / 2,
    G = (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7))) / 2;
  const aa = (1 + G) * a[1],
    ab = (1 + G) * b[1],
    c1 = Math.hypot(aa, a[2]),
    c2 = Math.hypot(ab, b[2]);
  const angle = (y: number, x: number) => (Math.atan2(y, x) * deg + 360) % 360;
  const h1 = c1 === 0 ? 0 : angle(a[2], aa),
    h2 = c2 === 0 ? 0 : angle(b[2], ab);
  const dL = b[0] - a[0],
    dC = c2 - c1;
  let dh = h2 - h1;
  if (c1 * c2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh * rad) / 2),
    L = (a[0] + b[0]) / 2,
    C = (c1 + c2) / 2;
  let H = (h1 + h2) / 2;
  if (c1 * c2 === 0) H = h1 + h2;
  else if (Math.abs(h1 - h2) > 180) H += h1 + h2 < 360 ? 180 : -180;
  const T =
    1 -
    0.17 * Math.cos((H - 30) * rad) +
    0.24 * Math.cos(2 * H * rad) +
    0.32 * Math.cos((3 * H + 6) * rad) -
    0.2 * Math.cos((4 * H - 63) * rad);
  const SL = 1 + (0.015 * (L - 50) ** 2) / Math.sqrt(20 + (L - 50) ** 2),
    SC = 1 + 0.045 * C,
    SH = 1 + 0.015 * C * T;
  const RT =
    -2 *
    Math.sqrt(C ** 7 / (C ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((H - 275) / 25) ** 2)) * rad);
  return Math.sqrt(
    Math.max(0, (dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH)),
  );
}
/** Converts each palette once; matching returns a color in the working space. */
export function paletteMatcher(palette: RGB[], s: Settings) {
  const linear = s.workingSpace === 'linear',
    colors = palette.map((c) => (linear ? (c.map(srgbToLinear) as RGB) : c));
  const lab = s.colorDistance === 'lab' || s.colorDistance === 'ciede2000';
  const references = lab ? colors.map((c) => toLab(c, linear)) : colors;
  return (r: number, g: number, b: number): RGB => {
    const source: RGB = [r, g, b],
      p = lab ? toLab(source, linear) : source;
    let best = 0,
      distance = Infinity;
    for (let i = 0; i < references.length; i++) {
      const c = references[i];
      let d: number;
      switch (s.colorDistance) {
        case 'luminance':
          d = (luminance(...source) - luminance(...c)) ** 2;
          break;
        case 'ciede2000':
          d = deltaE2000(p, c);
          break;
        case 'weighted-rgb':
          d = 0.299 * (r - c[0]) ** 2 + 0.587 * (g - c[1]) ** 2 + 0.114 * (b - c[2]) ** 2;
          break;
        default:
          d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
      }
      if (d < distance) {
        best = i;
        distance = d;
      }
    }
    return colors[best];
  };
}
