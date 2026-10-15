import { describe,it,expect } from 'vitest';
import { algorithms,cloneSettings,defaults,validateSettings,kernels,effectCatalog } from '../src/engine/catalog';
import { processImage } from '../src/engine/process';
import { extractPalette } from '../src/engine/color';
import { parsePalette,svgImage,readProject,zipFiles } from '../src/files';
const gradient=()=>({width:17,height:13,data:new Uint8ClampedArray(Array.from({length:17*13*4},(_,i)=>i%4===3?255:Math.floor(i/4)%17*16))});
describe('image processing contracts',()=>{
  it('keeps dimensions and alpha for every algorithm at uneven pixel scales',()=>{
    const image=gradient();image.data[3]=0;image.data[7]=73;
    for(const [algorithm] of algorithms) for(const scale of [1,3,16]) {
      const result=processImage(image,{...cloneSettings(defaults),algorithm,scale});
      expect([result.width,result.height,result.data.length]).toEqual([17,13,17*13*4]);
      expect(result.data[3]).toBe(0);expect(result.data[7]).toBe(73);
      if(algorithm!=='cmyk') for(let i=0;i<result.data.length;i+=4) expect([[24,32,25],[233,237,220]]).toContainEqual([...result.data.slice(i,i+3)]);
    }
  });
  it('is deterministic and never mutates source pixels',()=>{
    const input=gradient(),before=input.data.slice();
    const settings={...cloneSettings(defaults),algorithm:'random' as const,effects:[{id:'x',type:'grain' as const,amount:43,enabled:true}]};
    expect(processImage(input,settings)).toEqual(processImage(input,settings));expect(input.data).toEqual(before);
    expect(processImage(input,{...settings,seed:99}).data).not.toEqual(processImage(input,settings).data);
  });
  it('preserves black/white endpoints for diffusion and conserves kernel weights',()=>{
    for(const [name,kernel] of Object.entries(kernels)) {
      expect(kernel.reduce((sum,p)=>sum+p[2],0)).toBeCloseTo(name==='atkinson'?.75:1);
      for(const value of [0,255]) {
        const input={width:8,height:8,data:new Uint8ClampedArray(Array.from({length:256},(_,i)=>i%4===3?255:value))};
        const out=processImage(input,{...cloneSettings(defaults),algorithm:name as typeof defaults.algorithm,scale:1,palette:['#000000','#ffffff'],contrast:0});
        expect(out.data).toEqual(input.data);
      }
    }
  });
  it('applies every effect, preserves alpha, and respects disabled layers',()=>{
    const image=gradient();image.data[3]=42;
    for(const [type] of effectCatalog) {
      const base=processImage(image,{...cloneSettings(defaults),scale:1});
      const settings={...cloneSettings(defaults),scale:1,effects:[{id:'x',type,amount:63,enabled:true}]};
      expect(processImage(image,settings).data[3]).toBe(42);
      settings.effects[0].enabled=false;expect(processImage(image,settings)).toEqual(base);
    }
  });
});
describe('untrusted files and exports',()=>{
  it('rejects invalid settings and accepts a serializable round trip',()=>{
    expect(validateSettings(JSON.parse(JSON.stringify(defaults)))).toEqual(defaults);
    for(const patch of [{scale:0},{scale:Infinity},{palette:['red','blue']},{algorithm:'<script>'},{effects:[{type:'glow',amount:NaN,enabled:true}]}]) expect(()=>validateSettings({...defaults,...patch})).toThrow();
  });
  it('extracts colors and ignores transparent pixels',()=>{
    expect(extractPalette(new Uint8ClampedArray([255,0,0,255,0,0,255,255,0,255,0,0]),2)).toEqual(['#0000ff','#ff0000']);
    expect(()=>extractPalette(new Uint8ClampedArray(4))).toThrow();
  });
  it('imports JSON, hex, and GPL palettes with validation',()=>{
    expect(parsePalette('["#000000","#ffffff"]')).toEqual(['#000000','#ffffff']);
    expect(parsePalette('GIMP Palette\n0 0 0 Black\n255 255 255 White')).toEqual(['#000000','#ffffff']);
    expect(()=>parsePalette('["bad"]')).toThrow();
  });
  it('exports exact vector runs and black-only paths without embedded raster data',()=>{
    const input={width:3,height:1,data:new Uint8ClampedArray([0,0,0,255,0,0,0,255,255,255,255,255])};
    expect(svgImage(input)).toContain('M0 0h2v1H0z');expect(svgImage(input)).not.toContain('<image');
    expect(svgImage(input,true).match(/<path/g)).toHaveLength(1);
  });
  it('rejects external project image URLs and unsupported versions',()=>{
    expect(()=>readProject(JSON.stringify({version:1,name:'x',settings:defaults,image:'https://example.com/a.png'}))).toThrow();
    expect(()=>readProject('{broken')).toThrow();
  });
  it('creates a ZIP with a central directory',async()=>{
    const bytes=new Uint8Array(await zipFiles([{name:'test.txt',data:new TextEncoder().encode('hello')}]).arrayBuffer());
    const view=new DataView(bytes.buffer);
    expect(view.getUint32(0,true)).toBe(0x04034b50);expect(view.getUint32(bytes.length-22,true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length-12,true)).toBe(1);
  });
});
