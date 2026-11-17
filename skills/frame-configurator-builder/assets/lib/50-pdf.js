/* ===== lib/50-pdf.js：PDF 輸出（零相依） =====
 * (A) 向量 2D 圖面：PdfCtx 模擬 Canvas 2D API → PDF 向量指令。同一支 draw2D(ctx,...) 可畫螢幕也可畫 PDF。
 *     支援：save/restore/translate/rotate/scale/setTransform、beginPath/moveTo/lineTo/closePath/rect/arc、
 *           stroke/fill/fillRect/strokeRect/fillText/measureText/setLineDash，
 *           屬性 fillStyle/strokeStyle/lineWidth/font/textAlign/textBaseline。
 *     不支援：漸層、globalAlpha（顏色的 alpha 會與白底混色）、clip、drawImage。
 *     斜線填充：fillStyle 設成 {__hatch:'#色碼'}（螢幕版用 createPattern，PDF 版畫向量斜線）。
 *     英數字 → PDF 內建 Helvetica/Courier（向量、可搜尋）；中文 → 約 600dpi 文字遮罩影像。
 *     K=0.75 → 1 個畫面 px = 0.75pt（96dpi），因此依 96/(sc*25.4) 算出的比例在 100% 列印時正確。
 * (B) 圖片式多頁報告：buildRasterPDF(jpegBytesArray, pxW, pxH, pageWpt, pageHpt)。中文版面用 canvas 畫，最穩。
 */
const _pdfCC=document.createElement('canvas').getContext('2d');
function pdfRGB(str){
  _pdfCC.fillStyle='#000'; _pdfCC.fillStyle=str; const v=_pdfCC.fillStyle; let r,g,b,a=1;
  if(v[0]==='#'){ r=parseInt(v.slice(1,3),16); g=parseInt(v.slice(3,5),16); b=parseInt(v.slice(5,7),16); }
  else { const m=v.match(/[\d.]+/g); r=+m[0]; g=+m[1]; b=+m[2]; if(m[3]!=null) a=+m[3]; }
  return [r,g,b].map(c=>(c*a+255*(1-a))/255);
}
const PN=v=>(Math.round(v*1000)/1000).toString();
class PdfCtx{
  constructor(Hpt,K){ this.isPdf=true; this.H=Hpt; this.K=K||0.75; this.ops=[]; this.imgs=[]; this.imgKey={}; this.stack=[]; this.path=[];
    this.m=[1,0,0,1,0,0]; this.fillStyle='#000'; this.strokeStyle='#000'; this.lineWidth=1; this.font='10px sans-serif';
    this.textAlign='start'; this.textBaseline='alphabetic'; this.globalAlpha=1; this.dash=[]; this._mc=document.createElement('canvas').getContext('2d'); }
  save(){ this.stack.push({m:this.m.slice(),fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,lineWidth:this.lineWidth,font:this.font,textAlign:this.textAlign,textBaseline:this.textBaseline,dash:this.dash.slice()}); }
  restore(){ const s=this.stack.pop(); if(s) Object.assign(this,s); }
  setTransform(a,b,c,d,e,f){ this.m=[a,b,c,d,e,f]; }
  translate(x,y){ const m=this.m; m[4]+=m[0]*x+m[2]*y; m[5]+=m[1]*x+m[3]*y; }
  scale(x,y){ const m=this.m; m[0]*=x; m[1]*=x; m[2]*=y; m[3]*=y; }
  rotate(t){ const m=this.m, c=Math.cos(t), s=Math.sin(t), a=m[0],b=m[1],cc=m[2],d=m[3]; m[0]=a*c+cc*s; m[1]=b*c+d*s; m[2]=-a*s+cc*c; m[3]=-b*s+d*c; }
  P(x,y){ const m=this.m; return [(m[0]*x+m[2]*y+m[4])*this.K, this.H-(m[1]*x+m[3]*y+m[5])*this.K]; }
  sc(){ const m=this.m; return Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]))*this.K; }
  setLineDash(a){ this.dash=a.slice(); }
  measureText(t){ this._mc.font=this.font; return this._mc.measureText(t); }
  createPattern(){ return null; }
  beginPath(){ this.path=[]; }
  moveTo(x,y){ const p=this.P(x,y); this.path.push(`${PN(p[0])} ${PN(p[1])} m`); }
  lineTo(x,y){ const p=this.P(x,y); this.path.push(`${PN(p[0])} ${PN(p[1])} ${this.path.length?'l':'m'}`); }
  closePath(){ this.path.push('h'); }
  rect(x,y,w,h){ this.moveTo(x,y); this.lineTo(x+w,y); this.lineTo(x+w,y+h); this.lineTo(x,y+h); this.closePath(); }
  arc(cx,cy,r,a0,a1,ccw){ let span=a1-a0; if(ccw&&span>0) span-=Math.PI*2; if(!ccw&&span<0) span+=Math.PI*2;
    const n=Math.max(8,Math.ceil(Math.abs(span)/(Math.PI/36)));
    for(let i=0;i<=n;i++){ const a=a0+span*i/n, x=cx+r*Math.cos(a), y=cy+r*Math.sin(a); (i===0&&!this.path.length)?this.moveTo(x,y):this.lineTo(x,y); } }
  _stroke(){ const c=pdfRGB(this.strokeStyle), lw=Math.max(0.1,this.lineWidth*this.sc()), d=this.dash.map(v=>PN(v*this.sc())).join(' ');
    return `${c.map(PN).join(' ')} RG ${PN(lw)} w [${d}] 0 d`; }
  stroke(){ if(this.path.length) this.ops.push(`${this._stroke()} ${this.path.join(' ')} S`); }
  fill(){ if(!this.path.length||(this.fillStyle&&this.fillStyle.__hatch)) return; this.ops.push(`${pdfRGB(this.fillStyle).map(PN).join(' ')} rg ${this.path.join(' ')} f`); }
  fillRect(x,y,w,h){
    const keep=this.path; this.path=[]; this.rect(x,y,w,h); const rp=this.path.join(' '); this.path=keep;
    const fs=this.fillStyle;
    if(fs&&fs.__hatch){ const c=pdfRGB(fs.__hatch).map(v=>v*0.55+0.45), seg=[];
      for(let t=-h;t<w;t+=8){ const a=this.P(x+t,y+h), b=this.P(x+t+h,y); seg.push(`${PN(a[0])} ${PN(a[1])} m ${PN(b[0])} ${PN(b[1])} l`); }
      this.ops.push(`q ${rp} W n ${c.map(PN).join(' ')} RG ${PN(0.75*this.sc())} w [] 0 d ${seg.join(' ')} S Q`); return; }
    this.ops.push(`${pdfRGB(fs).map(PN).join(' ')} rg ${rp} f`);
  }
  strokeRect(x,y,w,h){ const keep=this.path; this.path=[]; this.rect(x,y,w,h); this.stroke(); this.path=keep; }
  fillText(t,x,y){
    t=String(t); if(!t) return;
    const f=this.font, size=parseFloat((f.match(/([\d.]+)px/)||[0,10])[1]), bold=/\b(700|bold)\b/.test(f), mono=/monospace|Consolas/.test(f);
    const w=this.measureText(t).width, al=this.textAlign, bl=this.textBaseline;
    const x0=al==='center'?x-w/2:(al==='right'||al==='end')?x-w:x;
    const yb=bl==='middle'?y+size*0.35:bl==='top'?y+size*0.8:bl==='bottom'?y-size*0.2:y;
    const col=pdfRGB(this.fillStyle);
    if(/^[\x20-\x7e]*$/.test(t)){
      const m=this.m, K=this.K, o=this.P(x0,yb), fn=mono?(bold?'F4':'F3'):(bold?'F2':'F1');
      const tz=mono?Math.max(50,Math.min(150,w/(0.6*size*t.length)*100)):100;
      const esc=t.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
      this.ops.push(`BT ${col.map(PN).join(' ')} rg /${fn} ${PN(size)} Tf ${PN(tz)} Tz ${PN(m[0]*K)} ${PN(-m[1]*K)} ${PN(-m[2]*K)} ${PN(m[3]*K)} ${PN(o[0])} ${PN(o[1])} Tm (${esc}) Tj ET`);
      return;
    }
    const R=Math.max(3,this.sc()/72*600), key=f+'|'+t+'|'+col.join(',');
    let im=this.imgKey[key];
    if(im==null){
      const c=document.createElement('canvas'), W=Math.ceil((w+2)*R), H=Math.ceil(size*1.45*R); c.width=W; c.height=H;
      const x=c.getContext('2d'); x.font=f.replace(/([\d.]+)px/,(m0,v)=>(v*R)+'px'); x.fillStyle='#000'; x.textBaseline='alphabetic'; x.fillText(t,R,size*1.1*R);
      const d=x.getImageData(0,0,W,H).data, a=new Uint8Array(W*H); for(let i=0;i<W*H;i++) a[i]=d[i*4+3];
      im=this.imgs.length; this.imgs.push({W,H,rgb:col,alpha:a}); this.imgKey[key]=im;
    }
    const I=this.imgs[im], lw=I.W/R, lh=I.H/R, top=yb-size*1.1, left=x0-1;
    const BL=this.P(left,top+lh), BR=this.P(left+lw,top+lh), TL=this.P(left,top);
    this.ops.push(`q ${PN(BR[0]-BL[0])} ${PN(BR[1]-BL[1])} ${PN(TL[0]-BL[0])} ${PN(TL[1]-BL[1])} ${PN(BL[0])} ${PN(BL[1])} cm /Im${im} Do Q`);
  }
}
async function pdfZlib(u8){
  if(!window.CompressionStream) return null;
  const s=new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/* 單頁向量 PDF。Wpt/Hpt：A3 橫 1190.55×841.89，A4 橫 841.89×595.28 */
async function vectorPDF(ctx,Wpt,Hpt,title){
  const enc=new TextEncoder(), chunks=[], offs=[]; let len=0;
  const push=b=>{ if(typeof b==='string') b=enc.encode(b); chunks.push(b); len+=b.length; };
  const stream=async(id,dict,data)=>{ const z=await pdfZlib(data); const body=z||data;
    offs[id]=len; push(`${id} 0 obj\n<< ${dict} /Length ${body.length}${z?' /Filter /FlateDecode':''} >>\nstream\n`); push(body); push('\nendstream\nendobj\n'); };
  const obj=(id,s)=>{ offs[id]=len; push(`${id} 0 obj\n${s}\nendobj\n`); };
  push(new Uint8Array([37,80,68,70,45,49,46,52,10,37,226,227,207,211,10]));
  const fonts=['Helvetica','Helvetica-Bold','Courier','Courier-Bold'], nImg=ctx.imgs.length, imgBase=9;
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const xo=ctx.imgs.map((_,i)=>`/Im${i} ${imgBase+i*2} 0 R`).join(' ');
  obj(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PN(Wpt)} ${PN(Hpt)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 8 0 R >> /XObject << ${xo} >> >> /Contents 4 0 R >>`);
  await stream(4,'',enc.encode(ctx.ops.join('\n')));
  fonts.forEach((f,i)=>obj(5+i,`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
  for(let i=0;i<nImg;i++){ const I=ctx.imgs[i], id=imgBase+i*2;
    await stream(id,`/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${id+1} 0 R`,new Uint8Array(I.rgb.map(v=>Math.round(v*255))));
    await stream(id+1,`/Type /XObject /Subtype /Image /Width ${I.W} /Height ${I.H} /ColorSpace /DeviceGray /BitsPerComponent 8`,I.alpha); }
  const total=imgBase+nImg*2, infoId=total, safe=String(title||'').replace(/[^\x20-\x7e]/g,'').replace(/[()\\]/g,'');
  obj(infoId,`<< /Producer (Configurator) /Title (${safe}) >>`);
  const xref=len; let xr=`xref\n0 ${total+1}\n0000000000 65535 f \n`; for(let k=1;k<=total;k++) xr+=String(offs[k]).padStart(10,'0')+' 00000 n \n';
  push(xr); push(`trailer\n<< /Size ${total+1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'});
}
const PDF_PAPER={A3:[1190.55,841.89],A4:[841.89,595.28]};
/* 圖片式多頁 PDF：每頁一張 JPEG（DCTDecode），頁面預設 A4 橫向 */
function canvasJpegBytes(c,q){ const d=atob(c.toDataURL('image/jpeg',q||0.9).split(',')[1]), u=new Uint8Array(d.length); for(let i=0;i<d.length;i++) u[i]=d.charCodeAt(i); return u; }
function buildRasterPDF(jpegs,pxW,pxH,pageW,pageH){
  pageW=pageW||842; pageH=pageH||595;
  const enc=new TextEncoder(), chunks=[], offs=[]; let len=0;
  const push=b=>{ if(typeof b==='string') b=enc.encode(b); chunks.push(b); len+=b.length; };
  push(new Uint8Array([37,80,68,70,45,49,46,52,10,37,226,227,207,211,10]));
  const obj=(id,fn)=>{ offs[id]=len; push(`${id} 0 obj\n`); fn(); push('\nendobj\n'); };
  const n=jpegs.length;
  obj(1,()=>push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2,()=>push(`<< /Type /Pages /Kids [${jpegs.map((_,i)=>`${3+3*i} 0 R`).join(' ')}] /Count ${n} >>`));
  jpegs.forEach((jp,i)=>{ const p=3+3*i, cs=`q ${pageW} 0 0 ${pageH} 0 0 cm /Im${i} Do Q`;
    obj(p,()=>push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im${i} ${p+2} 0 R >> >> /Contents ${p+1} 0 R >>`));
    obj(p+1,()=>{ push(`<< /Length ${cs.length} >>\nstream\n`); push(cs); push('\nendstream'); });
    obj(p+2,()=>{ push(`<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jp.length} >>\nstream\n`); push(jp); push('\nendstream'); });
  });
  const total=3+3*n, xref=len;
  let xr=`xref\n0 ${total}\n0000000000 65535 f \n`; for(let k=1;k<total;k++) xr+=String(offs[k]).padStart(10,'0')+' 00000 n \n';
  push(xr); push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'});
}
