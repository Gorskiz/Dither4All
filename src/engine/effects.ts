import type { Effect } from './catalog';
import { clamp, luminance, noise } from './color';
import type { Pixels } from './process';
function blur(data:Uint8ClampedArray,w:number,h:number,radius:number):Uint8ClampedArray {
  const tmp=new Float32Array(data.length),out=new Uint8ClampedArray(data.length);
  // Separable sliding-window blur: linear work even at larger radii.
  for(let y=0;y<h;y++) for(let c=0;c<3;c++) {
    let sum=0;
    for(let dx=-radius;dx<=radius;dx++) sum+=data[(y*w+clamp(dx,0,w-1))*4+c];
    for(let x=0;x<w;x++) {
      tmp[(y*w+x)*4+c]=sum/(radius*2+1);
      sum+=data[(y*w+clamp(x+radius+1,0,w-1))*4+c]-data[(y*w+clamp(x-radius,0,w-1))*4+c];
    }
  }
  for(let x=0;x<w;x++) for(let c=0;c<3;c++) {
    let sum=0;
    for(let dy=-radius;dy<=radius;dy++) sum+=tmp[(clamp(dy,0,h-1)*w+x)*4+c];
    for(let y=0;y<h;y++) {
      const p=(y*w+x)*4;out[p+c]=sum/(radius*2+1);out[p+3]=data[p+3];
      sum+=tmp[(clamp(y+radius+1,0,h-1)*w+x)*4+c]-tmp[(clamp(y-radius,0,h-1)*w+x)*4+c];
    }
  }
  return out;
}
export function applyEffects(image:Pixels,effects:Effect[],seed:number):Pixels {
  let data=image.data;
  const w=image.width,h=image.height;
  for(const effect of effects) {
    if(!effect.enabled || effect.amount===0) continue;
    const a=effect.amount/100,type=effect.type,source=data;
    const out=new Uint8ClampedArray(source.length);
    const soft=['glow','bloom','blur','sharpen'].includes(type)?blur(source,w,h,Math.max(1,Math.round(a*6))):null;
    const sample=(x:number,y:number,c:number)=>source[(clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1))*4+c];
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
      const p=(y*w+x)*4,r=source[p],g=source[p+1],b=source[p+2],gray=luminance(r,g,b);
      let values=[r,g,b];
      const offset=Math.max(1,Math.round(a*16)),block=Math.max(2,Math.round(a*24));
      switch(type) {
        case 'invert':values=values.map(v=>v+(255-2*v)*a);break;
        case 'solarize':values=values.map(v=>v>255*(1-a)?255-v:v);break;
        case 'posterize': {const levels=Math.max(2,Math.round(16-a*14));values=values.map(v=>Math.round(v/255*(levels-1))*255/(levels-1));break;}
        case 'saturation':values=values.map(v=>gray+(v-gray)*a*2);break;
        case 'hue': {
          const angle=a*Math.PI*2,co=Math.cos(angle),si=Math.sin(angle);
          values=[(.213+.787*co-.213*si)*r+(.715-.715*co-.715*si)*g+(.072-.072*co+.928*si)*b,(.213-.213*co+.143*si)*r+(.715+.285*co+.140*si)*g+(.072-.072*co-.283*si)*b,(.213-.213*co-.787*si)*r+(.715-.715*co+.715*si)*g+(.072+.928*co+.072*si)*b];break;
        }
        case 'sepia':values=[.393*r+.769*g+.189*b,.349*r+.686*g+.168*b,.272*r+.534*g+.131*b].map((v,c)=>source[p+c]+(v-source[p+c])*a);break;
        case 'grain': {const n=(noise(x,y,seed)-.5)*100*a;values=values.map(v=>v+n);break;}
        case 'scanlines':values=values.map(v=>v*(y%3===0?1-a*.9:1));break;
        case 'vignette': {const d=Math.hypot((x-w/2)/(w/2),(y-h/2)/(h/2));values=values.map(v=>v*Math.max(0,1-d*d*a*.7));break;}
        case 'glow':values=values.map((v,c)=>255-(255-v)*(255-soft![p+c]*a*.8)/255);break;
        case 'bloom':values=values.map((v,c)=>v+Math.max(0,soft![p+c]-120)*a*1.8);break;
        case 'blur':values=[soft![p],soft![p+1],soft![p+2]];break;
        case 'sharpen':values=values.map((v,c)=>v+(v-soft![p+c])*a*2);break;
        case 'chromatic':case 'rgb-split': {
          const d=type==='chromatic'?offset*Math.hypot((x-w/2)/w,(y-h/2)/h):offset;
          values=[sample(x+d,y,0),g,sample(x-d,y,2)];break;
        }
        case 'pixelate':values=[0,1,2].map(c=>sample(Math.floor(x/block)*block,Math.floor(y/block)*block,c));break;
        case 'wave':values=[0,1,2].map(c=>sample(x+Math.sin(y/20)*offset,y,c));break;
        case 'ripple': {const dx=x-w/2,dy=y-h/2,d=Math.hypot(dx,dy)||1,shift=Math.sin(d/12)*offset;values=[0,1,2].map(c=>sample(x+dx/d*shift,y+dy/d*shift,c));break;}
        case 'row-shift': {const d=noise(0,Math.floor(y/5),seed)>.7?(noise(1,y,seed)-.5)*offset*8:0;values=[0,1,2].map(c=>sample(x+d,y,c));break;}
        case 'block-glitch': {const bx=Math.floor(x/24),by=Math.floor(y/12),d=noise(bx,by,seed)>.7?(noise(bx,by,seed+1)-.5)*offset*12:0;values=[0,1,2].map(c=>sample(x+d,y,c));break;}
        case 'bitcrush': {const bits=Math.max(1,Math.round(8-a*7)),step=2**(8-bits);values=values.map(v=>Math.floor(v/step)*step);break;}
        case 'jpeg': {const bx=Math.floor(x/8)*8,by=Math.floor(y/8)*8;values=values.map((v,c)=>v*(1-a*.7)+Math.round(sample(bx,by,c)/32)*32*a*.7);break;}
        case 'edges':case 'emboss': {
          const delta=sample(x+1,y+1,0)-sample(x-1,y-1,0)+sample(x+1,y,1)-sample(x-1,y,1);
          values=values.map(v=>type==='edges'?v*(1-a)+clamp(255-Math.abs(delta)*2)*a:v*(1-a)+clamp(128+delta)*a);break;
        }
      }
      out[p]=clamp(values[0]);out[p+1]=clamp(values[1]);out[p+2]=clamp(values[2]);out[p+3]=source[p+3];
    }
    data=out;
  }
  return {width:w,height:h,data};
}
