/* ===== lib/30-nesting.js：長料下料排版（First-Fit Decreasing，含鋸縫） =====
 * lens: 裁切長度陣列(mm)；stock: 長料長度；kerf: 鋸縫
 * 回傳 {bars:[{cuts:[...],rem,over?}], over:超長件數}
 */
function packBars(lens,stock,kerf){
  const L=[...lens].sort((a,b)=>b-a), bars=[]; let over=0;
  L.forEach(l=>{
    if(l>stock){ over++; bars.push({cuts:[l],rem:0,over:true}); return; }
    let b=bars.find(b=>!b.over && (b.rem>=l+kerf || (b.rem>=l && b.rem-l<kerf)));
    if(!b){ b={cuts:[],rem:stock}; bars.push(b); }
    b.cuts.push(l); b.rem=Math.max(0,b.rem-l-kerf);
  });
  return {bars,over};
}
