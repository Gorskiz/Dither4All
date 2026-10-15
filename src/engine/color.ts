import type { RGB } from './catalog';
export const clamp = (n: number, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, n));
export const luminance = (r: number, g: number, b: number) => .2126*r + .7152*g + .0722*b;
export function hexRGB(hex: string): RGB { return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]; }
export function rgbHex(c: number[]): string { return '#' + c.map(v => Math.round(clamp(v)).toString(16).padStart(2,'0')).join(''); }
export function nearest(r: number, g: number, b: number, palette: RGB[]): RGB {
  let best = palette[0], distance = Infinity;
  for (const c of palette) {
    const d = .299*(r-c[0])**2 + .587*(g-c[1])**2 + .114*(b-c[2])**2;
    if (d < distance) { best=c; distance=d; }
  }
  return best;
}
export function noise(x: number, y: number, seed: number): number {
  let n = Math.imul(x ^ (seed+1), 374761393) + Math.imul(y ^ seed, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
/** Deterministic median-cut palette extraction, ignoring transparent pixels. */
export function extractPalette(data: Uint8ClampedArray, count = 6): string[] {
  const points: RGB[] = [];
  const stride = Math.max(1,Math.floor(data.length / 4 / 16000));
  for(let i=0;i<data.length;i+=4*stride) if(data[i+3]>127) points.push([data[i],data[i+1],data[i+2]]);
  if(!points.length) throw new Error('This image has no opaque colors to extract.');
  const boxes: RGB[][] = [points];
  while(boxes.length < count) {
    let index = -1, channel = 0, range = -1;
    boxes.forEach((box,i) => {
      if(box.length < 2) return;
      for(let c=0;c<3;c++) {
        let min=255,max=0;
        for(const p of box) { min=Math.min(min,p[c]);max=Math.max(max,p[c]); }
        if(max-min>range) {range=max-min;index=i;channel=c;}
      }
    });
    if(index<0 || range===0) break;
    const box=boxes.splice(index,1)[0].sort((a,b)=>a[channel]-b[channel]);
    const mid=Math.floor(box.length/2);
    boxes.push(box.slice(0,mid),box.slice(mid));
  }
  const colors = [...new Set(boxes.map(box => rgbHex([0,1,2].map(c=>box.reduce((sum,p)=>sum+p[c],0)/box.length))))];
  colors.sort((a,b)=>luminance(...hexRGB(a))-luminance(...hexRGB(b)));
  if(colors.length===1) colors.push(colors[0]==='#ffffff'?'#000000':'#ffffff');
  return colors;
}
