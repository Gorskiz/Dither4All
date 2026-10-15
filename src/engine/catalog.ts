export type RGB = [number, number, number];
export type Kernel = readonly (readonly [number, number, number])[];
export const kernels: Record<string, Kernel> = {
  'floyd-steinberg': [[1,0,7/16],[-1,1,3/16],[0,1,5/16],[1,1,1/16]],
  atkinson: [[1,0,1/8],[2,0,1/8],[-1,1,1/8],[0,1,1/8],[1,1,1/8],[0,2,1/8]],
  jarvis: [[1,0,7/48],[2,0,5/48],[-2,1,3/48],[-1,1,5/48],[0,1,7/48],[1,1,5/48],[2,1,3/48],[-2,2,1/48],[-1,2,3/48],[0,2,5/48],[1,2,3/48],[2,2,1/48]],
  stucki: [[1,0,8/42],[2,0,4/42],[-2,1,2/42],[-1,1,4/42],[0,1,8/42],[1,1,4/42],[2,1,2/42],[-2,2,1/42],[-1,2,2/42],[0,2,4/42],[1,2,2/42],[2,2,1/42]],
  burkes: [[1,0,8/32],[2,0,4/32],[-2,1,2/32],[-1,1,4/32],[0,1,8/32],[1,1,4/32],[2,1,2/32]],
  sierra: [[1,0,5/32],[2,0,3/32],[-2,1,2/32],[-1,1,4/32],[0,1,5/32],[1,1,4/32],[2,1,2/32],[-1,2,2/32],[0,2,3/32],[1,2,2/32]],
  'sierra-two': [[1,0,4/16],[2,0,3/16],[-2,1,1/16],[-1,1,2/16],[0,1,3/16],[1,1,2/16],[2,1,1/16]],
  'sierra-lite': [[1,0,2/4],[-1,1,1/4],[0,1,1/4]],
  'false-floyd': [[1,0,3/8],[0,1,3/8],[1,1,2/8]],
  'stevenson-arce': [[2,0,32/200],[-3,1,12/200],[-1,1,26/200],[1,1,30/200],[3,1,16/200],[-2,2,12/200],[0,2,26/200],[2,2,12/200],[-3,3,5/200],[-1,3,12/200],[1,3,12/200],[3,3,5/200]],
  'shiau-fan': [[1,0,1/2],[-2,1,1/8],[-1,1,1/8],[0,1,1/4]],
  'shiau-fan-two': [[1,0,1/2],[-3,1,1/16],[-2,1,1/16],[-1,1,1/8],[0,1,1/4]],
};
export const algorithms = [
  ['floyd-steinberg','Floyd–Steinberg','Diffusion','The classic. Fine detail with an organic texture.'],
  ['atkinson','Atkinson','Diffusion','Crisp, airy dots with a little lost detail.'],
  ['jarvis','Jarvis–Judice–Ninke','Diffusion','Soft, balanced texture over a wider neighborhood.'],
  ['stucki','Stucki','Diffusion','Smooth gradients with clean edges.'],
  ['burkes','Burkes','Diffusion','A lighter, faster wide diffusion.'],
  ['sierra','Sierra','Diffusion','An even, finely distributed grain.'],
  ['sierra-two','Two-row Sierra','Diffusion','A compact diffusion with subtle direction.'],
  ['sierra-lite','Sierra Lite','Diffusion','Minimal diffusion, pleasantly coarse texture.'],
  ['false-floyd','False Floyd–Steinberg','Diffusion','A simplified three-neighbor diffusion.'],
  ['stevenson-arce','Stevenson–Arce','Diffusion','A broad, spaced-out diffusion pattern.'],
  ['shiau-fan','Shiau–Fan','Diffusion','A directional, low-worm diffusion.'],
  ['shiau-fan-two','Shiau–Fan II','Diffusion','An extended directional diffusion.'],
  ['floyd-steinberg-serpentine','Floyd–Steinberg · serpentine','Diffusion','Alternates scanning direction on each row.'],
  ['atkinson-serpentine','Atkinson · serpentine','Diffusion','Airy Atkinson with alternating scan direction.'],
  ['stucki-serpentine','Stucki · serpentine','Diffusion','Wide diffusion with alternating scan direction.'],
  ['bayer-2','Bayer 2 × 2','Ordered','A tiny, graphic checkerboard.'],
  ['bayer-4','Bayer 4 × 4','Ordered','The unmistakable ordered-dither texture.'],
  ['bayer-8','Bayer 8 × 8','Ordered','More tonal detail in a structured matrix.'],
  ['bayer-16','Bayer 16 × 16','Ordered','A large matrix for delicate gradients.'],
  ['clustered','Clustered dots','Ordered','A clustered 4 × 4 printing pattern.'],
  ['halftone','Halftone dots','Pattern','Round ink dots that grow with darkness.'],
  ['horizontal','Horizontal lines','Pattern','A horizontal line screen.'],
  ['vertical','Vertical lines','Pattern','A vertical line screen.'],
  ['diagonal','Diagonal lines','Pattern','A 45-degree engraved screen.'],
  ['crosshatch','Crosshatch','Pattern','Intersecting diagonal strokes.'],
  ['rings','Concentric rings','Pattern','A circular threshold screen.'],
  ['spiral','Spiral','Pattern','A continuous spiral threshold screen.'],
  ['waves','Sine waves','Pattern','An undulating line screen.'],
  ['cmyk','CMYK halftone','Pattern','Four rotated ink screens; uses source color.'],
  ['threshold','Threshold','Other','Hard palette quantization, without diffusion.'],
  ['random','Seeded noise','Other','Reproducible random threshold dithering.'],
  ['interleaved','Interleaved gradient noise','Other','A compact, deterministic spatial noise screen.'],
] as const;
export type AlgorithmId = typeof algorithms[number][0];
export const effectCatalog = [
  ['glow','Soft glow','Light'], ['bloom','Bloom','Light'], ['chromatic','Chromatic aberration','Glitch'],
  ['rgb-split','RGB split','Glitch'], ['scanlines','Scanlines','Texture'], ['grain','Film grain','Texture'],
  ['vignette','Vignette','Light'], ['invert','Invert','Color'], ['solarize','Solarize','Color'],
  ['posterize','Posterize','Color'], ['saturation','Saturation','Color'], ['hue','Hue rotation','Color'],
  ['sepia','Sepia','Color'], ['pixelate','Pixelate','Texture'], ['wave','Wave distortion','Glitch'],
  ['ripple','Radial ripple','Glitch'], ['row-shift','Row displacement','Glitch'], ['block-glitch','Block glitch','Glitch'],
  ['bitcrush','Bit crush','Glitch'], ['jpeg','Compression blocks','Glitch'], ['edges','Edge ink','Texture'],
  ['emboss','Emboss','Texture'], ['sharpen','Sharpen','Texture'], ['blur','Box blur','Texture'],
] as const;
export type EffectId = typeof effectCatalog[number][0];
export interface Effect { id: string; type: EffectId; amount: number; enabled: boolean }
export interface Settings {
  algorithm: AlgorithmId; scale: number; strength: number; brightness: number; contrast: number;
  gamma: number; saturation: number; threshold: number; patternSize: number; seed: number;
  palette: string[]; colorMode: 'palette' | 'rgb'; levels: number; invert: boolean;
  effects: Effect[];
}
export const defaults: Settings = {
  algorithm: 'floyd-steinberg', scale: 2, strength: 100, brightness: 0, contrast: 12,
  gamma: 1, saturation: 100, threshold: 50, patternSize: 6, seed: 42,
  palette: ['#182019','#e9eddc'], colorMode: 'palette', levels: 4, invert: false, effects: [],
};
export const palettes: { name: string; colors: string[] }[] = [
  {name:'Ink & paper',colors:['#182019','#e9eddc']},
  {name:'Pure monochrome',colors:['#000000','#ffffff']},
  {name:'Game pocket',colors:['#0f380f','#306230','#8bac0f','#9bbc0f']},
  {name:'Amber terminal',colors:['#18110a','#754323','#d98b32','#ffe4a0']},
  {name:'Electric dusk',colors:['#201434','#59416e','#c46686','#f5d5ac']},
  {name:'Blueprint',colors:['#132b55','#3673a5','#89c7d1','#eff4e9']},
  {name:'Newsprint',colors:['#242222','#696358','#a79c87','#e8deca']},
  {name:'Hot coral',colors:['#251c2c','#9f3651','#ff745b','#fff0d4']},
  {name:'Arctic',colors:['#112b3c','#226b80','#6cbdb5','#edf4d7']},
  {name:'Eight-bit',colors:['#171526','#453773','#a7375f','#dc695c','#e8b57a','#b7cf8b','#5c998e','#f3ecd9']},
  {name:'Grayscale · 4',colors:['#171717','#666666','#aaaaaa','#f4f4f4']},
  {name:'Risograph',colors:['#202b42','#e94d55','#2b9e9a','#f8e8ca']},
];
export function cloneSettings(s: Settings): Settings { return structuredClone(s); }
export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') throw new Error('This file does not contain valid settings.');
  const s = value as Record<string, unknown>;
  const result = cloneSettings(defaults);
  if (!algorithms.some(a => a[0] === s.algorithm)) throw new Error('Unknown dithering algorithm.');
  result.algorithm = s.algorithm as AlgorithmId;
  const bounds: Record<string, [number,number]> = {scale:[1,16],strength:[0,150],brightness:[-100,100],contrast:[-100,100],gamma:[0.2,3],saturation:[0,200],threshold:[0,100],patternSize:[2,32],seed:[0,999999],levels:[2,16]};
  for (const [key,[lo,hi]] of Object.entries(bounds)) {
    const v = s[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`Invalid ${key} setting.`);
    (result as unknown as Record<string,unknown>)[key] = v;
  }
  if (!Array.isArray(s.palette) || s.palette.length < 2 || s.palette.length > 16 || !s.palette.every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) throw new Error('Palettes need 2–16 six-digit hex colors.');
  result.palette = [...s.palette];
  if (s.colorMode !== 'palette' && s.colorMode !== 'rgb') throw new Error('Invalid color mode.');
  result.colorMode = s.colorMode;
  result.invert = s.invert === true;
  if (!Array.isArray(s.effects) || s.effects.length > 12) throw new Error('An effect stack can contain at most 12 layers.');
  result.effects = s.effects.map((v: unknown, i) => {
    if (!v || typeof v !== 'object') throw new Error('Invalid effect layer.');
    const e = v as Effect;
    if (!effectCatalog.some(a => a[0] === e.type) || typeof e.amount !== 'number' || !Number.isFinite(e.amount) || e.amount < 0 || e.amount > 100 || typeof e.enabled !== 'boolean') throw new Error('Invalid effect layer.');
    return {id:`layer-${i}`,type:e.type,amount:e.amount,enabled:e.enabled};
  });
  return result;
}
