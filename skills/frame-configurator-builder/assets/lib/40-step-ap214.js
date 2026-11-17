/* ===== lib/40-step-ap214.js：STEP AP214 組立件輸出（純 JS、零相依） =====
 * 用法：
 *   const solids = collectSolids([modelGroup, extrasGroup], scene, nameFn);
 *   const text = buildStepAssembly(solids, {asmName:'機架_1500x750x900', fileName:'frame.stp'});
 * - 每個 Mesh/InstancedMesh 的 geometry.userData.prism（見 20-prism.js）會變成一個平面面片構成的
 *   MANIFOLD_SOLID_BREP；相同名稱＋顏色＋截面的實體共用一個零件定義，以 NAUO 實例化（Creo/SW 讀成組立件）。
 * - 座標：three.js Y 朝上 → STEP Z 朝上；單位 mm。轉換矩陣需為剛體（無縮放、det=+1）。
 * - 中文名稱以 \X2\...\X0\ 編碼。已用 OpenCASCADE 驗證：實體有效、體積為正、XCAF 讀得到顏色。
 */
function stepEnc(s){
  let o='', g=''; const fl=()=>{ if(g){ o+='\\X2\\'+g+'\\X0\\'; g=''; } };
  s=String(s);
  for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i);
    if(c>=32&&c<=126){ fl(); o+= c===39?"''":(c===92?'\\\\':s[i]); }
    else g+=c.toString(16).toUpperCase().padStart(4,'0'); }
  fl(); return "'"+o+"'";
}
const SR=v=>{ let s=(+(+v).toFixed(5)).toString(); if(s==='-0') s='0'; return /[.e]/.test(s)?s:s+'.'; };
function stepWriter(){
  const W={n:0,lines:[],
    add(s){ this.n++; this.lines.push('#'+this.n+'='+s+';'); return '#'+this.n; },
    reserve(){ this.n++; this.lines.push(null); return {id:'#'+this.n,idx:this.lines.length-1}; },
    fill(r,s){ this.lines[r.idx]=r.id+'='+s+';'; }};
  W.P=(x,y,z)=>W.add(`CARTESIAN_POINT('',(${SR(x)},${SR(y)},${SR(z)}))`);
  W.D=(x,y,z)=>W.add(`DIRECTION('',(${SR(x)},${SR(y)},${SR(z)}))`);
  W.AX=(o,z,x)=>W.add(`AXIS2_PLACEMENT_3D('',${W.P(...o)},${W.D(...z)},${W.D(...x)})`);
  return W;
}
/* 稜柱 → B-rep：外框逆時針、孔順時針；側面＋上下面皆為 PLANE，每條邊被兩面以相反方向共用 */
function stepPrism(W,pr,name){
  const area=L=>{ let a=0; for(let i=0;i<L.length;i++){ const p=L[i],q=L[(i+1)%L.length]; a+=p[0]*q[1]-q[0]*p[1]; } return a/2; };
  const clean=L=>L.filter((p,i)=>{ const q=L[(i+1)%L.length]; return Math.hypot(p[0]-q[0],p[1]-q[1])>1e-6; }).map(p=>[p[0],p[1]]);
  const outer=clean(pr.outer); if(area(outer)<0) outer.reverse();
  const holes=(pr.holes||[]).map(h=>{ const c=clean(h); if(area(c)>0) c.reverse(); return c; }).filter(h=>h.length>2);
  const z0=pr.z0, z1=pr.z1, faces=[];
  const VP=c=>W.add(`VERTEX_POINT('',${W.P(...c)})`);
  const EC=(a,b,pa,pb)=>{ const dx=pb[0]-pa[0],dy=pb[1]-pa[1],dz=pb[2]-pa[2],l=Math.hypot(dx,dy,dz);
    const vec=W.add(`VECTOR('',${W.D(dx/l,dy/l,dz/l)},${SR(l)})`);
    const ln=W.add(`LINE('',${W.P(...pa)},${vec})`);
    return W.add(`EDGE_CURVE('',${a},${b},${ln},.T.)`); };
  const OE=(e,s)=>W.add(`ORIENTED_EDGE('',*,*,${e},${s?'.T.':'.F.'})`);
  const face=(bounds,o,n,x)=>{ const pl=W.add(`PLANE('',${W.AX(o,n,x)})`); return W.add(`ADVANCED_FACE('',(${bounds.join(',')}),${pl},.T.)`); };
  const L=[outer,...holes].map(Lp=>{
    const n=Lp.length, cb=Lp.map(p=>[p[0],p[1],z0]), ct=Lp.map(p=>[p[0],p[1],z1]);
    const vb=cb.map(VP), vt=ct.map(VP), Eb=[], Et=[], V=[];
    for(let i=0;i<n;i++){ const j=(i+1)%n; Eb.push(EC(vb[i],vb[j],cb[i],cb[j])); Et.push(EC(vt[i],vt[j],ct[i],ct[j])); V.push(EC(vb[i],vt[i],cb[i],ct[i])); }
    for(let i=0;i<n;i++){ const j=(i+1)%n, dx=Lp[j][0]-Lp[i][0], dy=Lp[j][1]-Lp[i][1], l=Math.hypot(dx,dy);
      const lp=W.add(`EDGE_LOOP('',(${[OE(Eb[i],1),OE(V[j],1),OE(Et[i],0),OE(V[i],0)].join(',')}))`);
      faces.push(face([W.add(`FACE_OUTER_BOUND('',${lp},.T.)`)],cb[i],[dy/l,-dx/l,0],[dx/l,dy/l,0])); }
    return {Eb,Et};
  });
  const topB=L.map((l,k)=>{ const lp=W.add(`EDGE_LOOP('',(${l.Et.map(e=>OE(e,1)).join(',')}))`); return W.add(`${k?'FACE_BOUND':'FACE_OUTER_BOUND'}('',${lp},.T.)`); });
  faces.push(face(topB,[0,0,z1],[0,0,1],[1,0,0]));
  const botB=L.map((l,k)=>{ const lp=W.add(`EDGE_LOOP('',(${l.Eb.slice().reverse().map(e=>OE(e,0)).join(',')}))`); return W.add(`${k?'FACE_BOUND':'FACE_OUTER_BOUND'}('',${lp},.T.)`); });
  faces.push(face(botB,[0,0,z0],[0,0,-1],[1,0,0]));
  const sh=W.add(`CLOSED_SHELL('',(${faces.join(',')}))`);
  return W.add(`MANIFOLD_SOLID_BREP(${stepEnc(name)},${sh})`);
}
/* 走訪場景收集實體（含 InstancedMesh）。nameFn(mesh) 回傳零件名稱。選取高亮時請先取消選取或讓 nameFn 用 userData.orig 材質。 */
function collectSolids(roots,scene,nameFn){
  scene.updateMatrixWorld(true);
  const Zup=new THREE.Matrix4().set(1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1), out=[], im=new THREE.Matrix4();
  roots.forEach(root=>root.traverse(o=>{
    if(!o.isMesh||!o.visible) return; const pr=o.geometry&&o.geometry.userData.prism; if(!pr) return;
    const mat=o.userData.orig||o.material, c=mat.color.clone().convertLinearToSRGB(), rgb=[c.r,c.g,c.b].map(v=>Math.round(v*1000)/1000);
    const name=nameFn(o);
    const sig=JSON.stringify([pr.outer.map(q=>[+q[0].toFixed(2),+q[1].toFixed(2)]),(pr.holes||[]).map(h=>h.length),+pr.z0.toFixed(2),+pr.z1.toFixed(2)]);
    const key=name+'|'+rgb.join(',')+'|'+sig, mats=[];
    if(o.isInstancedMesh){ for(let i=0;i<o.count;i++){ o.getMatrixAt(i,im); mats.push(o.matrixWorld.clone().multiply(im)); } }
    else mats.push(o.matrixWorld.clone());
    mats.forEach(M=>{ const T=Zup.clone().multiply(M); if(pr.pre) T.multiply(pr.pre); out.push({pr,T,name,rgb,key}); });
  }));
  return out;
}
function buildStepAssembly(solids,opt){
  opt=opt||{}; const asmName=opt.asmName||'ASSEMBLY', fileName=opt.fileName||'model.stp';
  const W=stepWriter();
  const app=W.add(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`);
  W.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${app})`);
  const pc=W.add(`PRODUCT_CONTEXT('',${app},'mechanical')`);
  const pdc=W.add(`PRODUCT_DEFINITION_CONTEXT('part definition',${app},'design')`);
  const lu=W.add(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`);
  const au=W.add(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`);
  const su=W.add(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`);
  const unc=W.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-03),${lu},'distance_accuracy_value','confusion accuracy')`);
  const ctx=W.add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${lu},${au},${su}))REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY'))`);
  const prods=[];
  const mkProd=(id,name)=>{ const pr=W.add(`PRODUCT(${stepEnc(id)},${stepEnc(name)},'',(${pc}))`); prods.push(pr);
    const pdf=W.add(`PRODUCT_DEFINITION_FORMATION('','',${pr})`), pd=W.add(`PRODUCT_DEFINITION('design','',${pdf},${pdc})`);
    return {pd,pds:W.add(`PRODUCT_DEFINITION_SHAPE('','',${pd})`)}; };
  const root=mkProd('ASM',asmName);
  const rootAx=W.AX([0,0,0],[0,0,1],[1,0,0]), rootSR=W.reserve();
  const defs=new Map(), styled=[], places=[], styles={};
  const style=rgb=>{ const k=rgb.join(); if(styles[k]) return styles[k];
    const c=W.add(`COLOUR_RGB('',${SR(rgb[0])},${SR(rgb[1])},${SR(rgb[2])})`);
    const fa=W.add(`FILL_AREA_STYLE('',(${W.add(`FILL_AREA_STYLE_COLOUR('',${c})`)}))`);
    const sss=W.add(`SURFACE_SIDE_STYLE('',(${W.add(`SURFACE_STYLE_FILL_AREA(${fa})`)}))`);
    return styles[k]=W.add(`PRESENTATION_STYLE_ASSIGNMENT((${W.add(`SURFACE_STYLE_USAGE(.BOTH.,${sss})`)}))`); };
  solids.forEach((s,i)=>{
    let d=defs.get(s.key);
    if(!d){ const no=defs.size+1, r=mkProd(`P${String(no).padStart(3,'0')}`,s.name), cax=W.AX([0,0,0],[0,0,1],[1,0,0]);
      const brep=stepPrism(W,s.pr,s.name);
      styled.push(W.add(`STYLED_ITEM('color',(${style(s.rgb)}),${brep})`));
      const rep=W.add(`ADVANCED_BREP_SHAPE_REPRESENTATION(${stepEnc(s.name)},(${cax},${brep}),${ctx})`);
      W.add(`SHAPE_DEFINITION_REPRESENTATION(${r.pds},${rep})`);
      d={pd:r.pd,rep,cax}; defs.set(s.key,d); }
    const e=s.T.elements, nz=new THREE.Vector3(e[8],e[9],e[10]).normalize(), nx=new THREE.Vector3(e[0],e[1],e[2]).normalize();
    const pl=W.AX([e[12],e[13],e[14]],[nz.x,nz.y,nz.z],[nx.x,nx.y,nx.z]); places.push(pl);
    const idt=W.add(`ITEM_DEFINED_TRANSFORMATION('','',${d.cax},${pl})`);
    const rr=W.add(`(REPRESENTATION_RELATIONSHIP('','',${d.rep},${rootSR.id})REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(${idt})SHAPE_REPRESENTATION_RELATIONSHIP())`);
    const nauo=W.add(`NEXT_ASSEMBLY_USAGE_OCCURRENCE(${stepEnc('NAUO'+(i+1))},${stepEnc(s.name)},'',${root.pd},${d.pd},$)`);
    W.add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(${rr},${W.add(`PRODUCT_DEFINITION_SHAPE('','',${nauo})`)})`);
  });
  W.fill(rootSR,`SHAPE_REPRESENTATION(${stepEnc(asmName)},(${[rootAx,...places].join(',')}),${ctx})`);
  W.add(`SHAPE_DEFINITION_REPRESENTATION(${root.pds},${rootSR.id})`);
  W.add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${prods.join(',')}))`);
  W.add(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled.join(',')}),${ctx})`);
  const ts=new Date().toISOString().slice(0,19), ascii=String(fileName).replace(/[^\x20-\x7e]/g,'_').replace(/'/g,'');
  return {text:['ISO-10303-21;','HEADER;',"FILE_DESCRIPTION(('Configurator export'),'2;1');",
    `FILE_NAME('${ascii}','${ts}',('Configurator'),(''),'Configurator','Configurator','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",'ENDSEC;','DATA;',...W.lines,'ENDSEC;','END-ISO-10303-21;',''].join('\n'),
    solids:solids.length, defs:defs.size};
}
