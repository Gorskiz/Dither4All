/** Original procedural artwork. No stock image downloads or third-party assets. */
export function makeSample():HTMLCanvasElement {
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;
  const ctx=canvas.getContext('2d')!;
  const sky=ctx.createLinearGradient(0,0,0,900);sky.addColorStop(0,'#dfded0');sky.addColorStop(.6,'#b6bfb5');sky.addColorStop(1,'#797e6b');
  ctx.fillStyle=sky;ctx.fillRect(0,0,1200,900);
  const image=ctx.getImageData(0,0,1200,900);
  for(let y=100;y<700;y++) for(let x=290;x<910;x++) {
    const nx=(x-600)/280,ny=(y-400)/280,r2=nx*nx+ny*ny;
    if(r2>1) continue;
    const z=Math.sqrt(1-r2),light=Math.max(0,-nx*.48-ny*.56+z*.62);
    const texture=Math.sin(nx*28+Math.sin(ny*18)*2)*Math.sin(ny*32)*3+Math.sin(nx*67+ny*15)*2;
    const tone=27+light*197+texture,p=(y*1200+x)*4;
    image.data[p]=tone*.97;image.data[p+1]=tone;image.data[p+2]=tone*.92;
  }
  ctx.putImageData(image,0,0);
  // Orbital band crossing the sphere, then distant, wind-cut hills.
  ctx.save();ctx.translate(600,410);ctx.rotate(-.3);ctx.scale(1,.22);
  ctx.strokeStyle='#e5d9b8';ctx.lineWidth=44;ctx.beginPath();ctx.ellipse(0,0,400,250,0,0,Math.PI);ctx.stroke();
  ctx.strokeStyle='#777f75';ctx.lineWidth=12;ctx.beginPath();ctx.ellipse(0,0,426,270,0,0,Math.PI);ctx.stroke();ctx.restore();
  for(let layer=0;layer<4;layer++) {
    ctx.beginPath();ctx.moveTo(0,900);
    for(let x=0;x<=1200;x+=3) {
      const y=655+layer*62+Math.sin(x/180+layer*1.7)*38+Math.sin(x/71+layer)*13+Math.sin(x/330)*40;
      ctx.lineTo(x,y);
    }
    ctx.lineTo(1200,900);ctx.closePath();ctx.fillStyle=['#93998b','#6d786b','#465449','#263a32'][layer];ctx.fill();
  }
  return canvas;
}
