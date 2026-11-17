/* ===== lib/20-prism.js：可輸出 STEP 的幾何描述 =====
 * 每個要進 STEP 的 THREE 幾何都要掛 userData.prism：
 *   截面多邊形 outer（局部 XY）＋孔 holes，沿局部 Z 從 z0 擠出到 z1；
 *   pre = 把「稜柱座標」轉成「幾何座標」的 Matrix4（幾何有 translate/rotate 過時才需要）。
 * 沒掛 prism 的幾何（線、圓環等）不會輸出到 STEP。
 */
const rect=(w,h)=>[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
const circ=(r,n)=>{ n=n||16; return Array.from({length:n},(_,i)=>[r*Math.cos(i/n*Math.PI*2),r*Math.sin(i/n*Math.PI*2)]); };
const RXN=new THREE.Matrix4().makeRotationX(-Math.PI/2);   // 稜柱 Z 軸 → 幾何 Y 軸（CylinderGeometry 用）
function setPrism(g,outer,holes,z0,z1,pre){ g.userData.prism={outer,holes:holes||[],z0,z1,pre:pre||null}; return g; }
/* 常用：已掛好 prism 的幾何 */
const boxGeo=(w,h,d)=>setPrism(new THREE.BoxGeometry(w,h,d),rect(w,h),[],-d/2,d/2);
const cylGeo=(r,h,n)=>setPrism(new THREE.CylinderGeometry(r,r,h,n||20),circ(r,n||20),[],-h/2,h/2,RXN);
/* T 槽型材：沿 Z 置中擠出（mesh 再旋轉到 X/Y/Z 軸向） */
function profileExtrude(series,len){
  const p=PROFILES[series];
  const sh=new THREE.Shape(profilePts(p.s,p.slot).map(q=>new THREE.Vector2(q[0],q[1])));
  const hole=new THREE.Path(); hole.absarc(0,0,p.s*0.11,0,Math.PI*2,true); sh.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(sh,{depth:len,bevelEnabled:false,curveSegments:10}); g.translate(0,0,-len/2);
  return setPrism(g,profilePts(p.s,p.slot),[circ(p.s*0.11,16)],-len/2,len/2);
}
