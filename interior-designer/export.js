'use strict';
/* 匯出：3D STEP（AP214 組立，每件家具一個零件、mm、含顏色）與 2D PDF（A3 橫式，平面圖依比例、3D 視圖、清單） */

function toast(msg, ms = 4200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, ms);
}
async function download(name, data, mime, ext, desc) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  if (window.showSaveFilePicker && !navigator.webdriver && window.self === window.top) { // Chrome／Edge：另存新檔對話框
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: desc, accept: { [mime]: ['.' + ext] } }] });
      const w = await h.createWritable(); await w.write(blob); await w.close();
      toast(`已儲存 ${h.name}（${(blob.size / 1024 / 1024).toFixed(2)} MB）`); return true;
    } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast(`已輸出 ${name}（${(blob.size / 1024 / 1024).toFixed(2)} MB）。若沒有出現下載，請改用單機版 HTML 檔開啟。`);
  return true;
}
function safeName(s) { return String(s).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'design'; }
function stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; }

/* ---------- STEP ---------- */
function stepStr(s) { // ISO 10303-21 字串：非 ASCII 以 \X2\ UTF-16 編碼
  let o = '', run = '';
  const flush = () => { if (run) { o += '\\X2\\' + run + '\\X0\\'; run = ''; } };
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c < 127) { flush(); o += ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch; }
    else if (c < 0x10000) run += c.toString(16).toUpperCase().padStart(4, '0');
  }
  flush(); return "'" + o + "'";
}
function sNum(n, d = 4) { if (Math.abs(n) < 1e-9) n = 0; let s = n.toFixed(d); if (s.includes('.')) s = s.replace(/0+$/, ''); if (s === '-0.') s = '0.'; return s; }

/* 由 three.js 網格取出凸多面體（STEP 座標：X 東、Y 北、Z 上，原點＝房間內側西南角，mm） */
function meshPoly(m) {
  const g = m.geometry, P = g.parameters || {};
  let lv = [], lf = [];
  if (g === BOXG) {
    lv = [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, .5, -.5], [-.5, .5, -.5], [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]];
    lf = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  } else if (g.type === 'CylinderGeometry') {
    const n = Math.min(P.radialSegments, 24), h = P.height / 2;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; lv.push([P.radiusBottom * Math.sin(a), -h, P.radiusBottom * Math.cos(a)]); }
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; lv.push([P.radiusTop * Math.sin(a), h, P.radiusTop * Math.cos(a)]); }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; lf.push([i, j, n + j, n + i]); }
    lf.push([...Array(n).keys()]); lf.push([...Array(n).keys()].map(i => n + i));
  } else if (g.type === 'SphereGeometry') {
    const la = 6, lo = 10, r = P.radius;
    lv.push([0, r, 0]);
    for (let i = 1; i < la; i++) { const t = i / la * Math.PI; for (let j = 0; j < lo; j++) { const p = j / lo * Math.PI * 2; lv.push([r * Math.sin(t) * Math.cos(p), r * Math.cos(t), r * Math.sin(t) * Math.sin(p)]); } }
    lv.push([0, -r, 0]); const bot = lv.length - 1, idx = (i, j) => 1 + (i - 1) * lo + (j % lo);
    for (let j = 0; j < lo; j++) lf.push([0, idx(1, j), idx(1, j + 1)]);
    for (let i = 1; i < la - 1; i++) for (let j = 0; j < lo; j++) { lf.push([idx(i, j), idx(i + 1, j), idx(i + 1, j + 1)]); lf.push([idx(i, j), idx(i + 1, j + 1), idx(i, j + 1)]); }
    for (let j = 0; j < lo; j++) lf.push([bot, idx(la - 1, j + 1), idx(la - 1, j)]);
  } else return null;
  const W = S.room.W, D = S.room.D, v3 = new THREE.Vector3();
  const verts = lv.map(p => { v3.set(p[0], p[1], p[2]).applyMatrix4(m.matrixWorld); return [v3.x * 1000 + W / 2, D / 2 - v3.z * 1000, v3.y * 1000]; });
  const c = verts.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]).map(x => x / verts.length);
  const faces = lf.map(f => { // 以質心判定外法向（所有零件皆為凸體）
    const n = newell(f.map(i => verts[i])), fc = f.reduce((a, i) => [a[0] + verts[i][0], a[1] + verts[i][1], a[2] + verts[i][2]], [0, 0, 0]).map(x => x / f.length);
    return (n[0] * (fc[0] - c[0]) + n[1] * (fc[1] - c[1]) + n[2] * (fc[2] - c[2])) < 0 ? f.slice().reverse() : f;
  });
  return { verts, faces };
}
function newell(pts) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); }
  const L = Math.hypot(x, y, z) || 1; return [x / L, y / L, z / L];
}

function buildSTEP() {
  scene.updateMatrixWorld(true);
  const out = []; let n = 0;
  const E = s => { out.push(`#${++n}=${s};`); return '#' + n; };
  const dir = v => E(`DIRECTION('',(${sNum(v[0], 9)},${sNum(v[1], 9)},${sNum(v[2], 9)}))`);
  const ctxApp = E(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`);
  E(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${ctxApp})`);
  const prodCtx = E(`PRODUCT_CONTEXT('',${ctxApp},'mechanical')`);
  const pdCtx = E(`PRODUCT_DEFINITION_CONTEXT('part definition',${ctxApp},'design')`);
  const uLen = E(`(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))`);
  const uAng = E(`(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))`);
  const uSol = E(`(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())`);
  const unc = E(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-03),${uLen},'distance_accuracy_value','confusion accuracy')`);
  const ctx = E(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${uLen},${uAng},${uSol}))REPRESENTATION_CONTEXT('Context3D','3D Context with 1E-03 mm'))`);
  const origin = () => E(`AXIS2_PLACEMENT_3D('',${E(`CARTESIAN_POINT('',(0.,0.,0.))`)},${dir([0, 0, 1])},${dir([1, 0, 0])})`);
  const product = (name, cat) => {
    const pr = E(`PRODUCT(${stepStr(name)},${stepStr(name)},'',(${prodCtx}))`);
    E(`PRODUCT_RELATED_PRODUCT_CATEGORY('${cat}',$,(${pr}))`);
    const pdf = E(`PRODUCT_DEFINITION_FORMATION('','',${pr})`);
    const pd = E(`PRODUCT_DEFINITION('design','',${pdf},${pdCtx})`);
    return { pd, pds: E(`PRODUCT_DEFINITION_SHAPE('','',${pd})`) };
  };
  const styles = new Map(), styled = [];
  const styleFor = hex => {
    if (styles.has(hex)) return styles.get(hex);
    const c = new THREE.Color(hex);
    const col = E(`COLOUR_RGB('',${sNum(c.r, 4)},${sNum(c.g, 4)},${sNum(c.b, 4)})`);
    const fs = E(`FILL_AREA_STYLE('',(${E(`FILL_AREA_STYLE_COLOUR('',${col})`)}))`);
    const ss = E(`SURFACE_SIDE_STYLE('',(${E(`SURFACE_STYLE_FILL_AREA(${fs})`)}))`);
    const psa = E(`PRESENTATION_STYLE_ASSIGNMENT((${E(`SURFACE_STYLE_USAGE(.BOTH.,${ss})`)}))`);
    styles.set(hex, psa); return psa;
  };
  const solid = (m, name) => {
    const poly = meshPoly(m); if (!poly) return null;
    const vp = poly.verts.map(v => { const p = E(`CARTESIAN_POINT('',(${sNum(v[0])},${sNum(v[1])},${sNum(v[2])}))`); return { p, v: E(`VERTEX_POINT('',${p})`), c: v }; });
    const edges = new Map(), faces = [];
    const edge = (a, b) => {
      const k = a < b ? a + '_' + b : b + '_' + a;
      if (!edges.has(k)) {
        const i = Math.min(a, b), j = Math.max(a, b), A = vp[i].c, B = vp[j].c, d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], L = Math.hypot(...d) || 1;
        const line = E(`LINE('',${vp[i].p},${E(`VECTOR('',${dir(d.map(x => x / L))},${sNum(L)})`)})`);
        edges.set(k, { ec: E(`EDGE_CURVE('',${vp[i].v},${vp[j].v},${line},.T.)`), s: i });
      }
      return edges.get(k);
    };
    for (const f of poly.faces) {
      const oes = f.map((a, i) => { const b = f[(i + 1) % f.length], e = edge(a, b); return E(`ORIENTED_EDGE('',*,*,${e.ec},${e.s === a ? '.T.' : '.F.'})`); });
      const loop = E(`EDGE_LOOP('',(${oes.join(',')}))`), nrm = newell(f.map(i => vp[i].c));
      const A = vp[f[0]].c, B = vp[f[1]].c, r = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], rl = Math.hypot(...r) || 1;
      const pl = E(`PLANE('',${E(`AXIS2_PLACEMENT_3D('',${vp[f[0]].p},${dir(nrm)},${dir(r.map(x => x / rl))})`)})`);
      faces.push(E(`ADVANCED_FACE('',(${E(`FACE_OUTER_BOUND('',${loop},.T.)`)}),${pl},.T.)`));
    }
    const sb = E(`MANIFOLD_SOLID_BREP(${stepStr(name)},${E(`CLOSED_SHELL('',(${faces.join(',')}))`)})`);
    const hex = m.userData.stepColor || '#' + m.material.color.getHexString();
    styled.push(E(`STYLED_ITEM('color',(${styleFor(hex)}),${sb})`));
    return sb;
  };
  const parts = [];
  const room = [];
  roomG.traverse(o => { if (o.isMesh && o.geometry.type !== 'PlaneGeometry') room.push(o); });
  parts.push({ name: 'ROOM_' + S.room.W + 'x' + S.room.D + 'x' + S.room.H, meshes: room });
  itemsG.children.forEach((g, i) => { const it = itemById(g.userData.id), ms = []; g.traverse(o => { if (o.isMesh) ms.push(o); }); parts.push({ name: `${String(i + 1).padStart(2, '0')}_${it ? it.name : 'ITEM'}`, meshes: ms }); });
  const root = product(S.meta.name || 'ROOM_ASSEMBLY', 'assembly');
  const rootAx = origin(), instAx = [], links = [];
  let solids = 0;
  for (const p of parts) {
    const pr = product(p.name, 'part'), ax = origin(), items = [ax];
    p.meshes.forEach((m, k) => { const sb = solid(m, `${p.name}_${k + 1}`); if (sb) { items.push(sb); solids++; } });
    const rep = E(`ADVANCED_BREP_SHAPE_REPRESENTATION(${stepStr(p.name)},(${items.join(',')}),${ctx})`);
    E(`SHAPE_DEFINITION_REPRESENTATION(${pr.pds},${rep})`);
    const ia = origin(); instAx.push(ia);
    links.push({ pd: pr.pd, rep, ax, ia, name: p.name });
  }
  const rootRep = E(`SHAPE_REPRESENTATION(${stepStr(S.meta.name || 'ROOM_ASSEMBLY')},(${[rootAx, ...instAx].join(',')}),${ctx})`);
  E(`SHAPE_DEFINITION_REPRESENTATION(${root.pds},${rootRep})`);
  links.forEach((l, i) => {
    const nauo = E(`NEXT_ASSEMBLY_USAGE_OCCURRENCE('NAUO${i + 1}',${stepStr(l.name)},'',${root.pd},${l.pd},$)`);
    const pds = E(`PRODUCT_DEFINITION_SHAPE('','',${nauo})`);
    const idt = E(`ITEM_DEFINED_TRANSFORMATION('','',${l.ax},${l.ia})`);
    const rel = E(`(REPRESENTATION_RELATIONSHIP('','',${l.rep},${rootRep})REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(${idt})SHAPE_REPRESENTATION_RELATIONSHIP())`);
    E(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(${rel},${pds})`);
  });
  E(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${styled.join(',')}),${ctx})`);
  const ts = new Date().toISOString().slice(0, 19);
  const head = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Interior 3D Designer export'),'2;1');\nFILE_NAME(${stepStr(safeName(S.meta.name) + '.stp')},'${ts}',(''),(''),'Interior3D','Interior3D','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n`;
  return { text: head + out.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n', parts: parts.length, solids };
}
async function exportSTEP() {
  try {
    const r = buildSTEP();
    if (await download(`${safeName(S.meta.name)}_${stamp()}.stp`, r.text, 'model/step', 'stp', 'STEP AP214 3D 模型')) toast(`已輸出 STEP：${r.parts} 個零件、${r.solids} 個實體（單位 mm，原點在房間內側西南角）。若沒有出現下載，請改用單機版 HTML 檔開啟。`, 6000);
  } catch (e) { toast('STEP 輸出失敗：' + e.message); }
}

/* ---------- PDF（A3 橫式，每頁為 150 dpi 影像） ---------- */
const PG = { w: 420, h: 297, dpi: 150 }, PX = PG.dpi / 25.4;
const PFONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC","Heiti TC",sans-serif';
const PRINT_CSS = `#plan text{font-family:${PFONT};fill:#111;paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}
.sym *,#plan *{vector-effect:non-scaling-stroke}
.sym .body{fill:var(--c);fill-opacity:.35;stroke:#222;stroke-width:1.2}
.sym .ln{fill:none;stroke:#333;stroke-opacity:.8;stroke-width:.8}
.sym .dk{fill:#333;fill-opacity:.5;stroke:#333;stroke-width:.8}
#plan .wall{fill:#5a5f66;stroke:#111;stroke-width:1.2}
#plan .floor{fill:#fff} #plan .cut{fill:#fff}
#plan .gridl{stroke:#e4e7eb;stroke-width:.6}
#plan .op{fill:none;stroke:#c25b12;stroke-width:1.2}
#plan .opwin{fill:none;stroke:#1d6fb8;stroke-width:1}
#plan .op-hit,#plan .zone{fill:none;stroke:none}
#plan .swing{fill:#f0883e;fill-opacity:.08}
#plan .dim line{stroke:#333;stroke-width:.8}
#plan .dim rect{fill:#fff;stroke:#333;stroke-width:.6}
#plan .dim.o rect{fill:#fff3e8;stroke:#c25b12}
#plan .dim text{fill:#111;stroke:none;font-family:Consolas,"Courier New",monospace}
#plan .it .body{stroke:#222}
#plan .it.ceil .body{fill-opacity:.08;stroke:#1d6fb8;stroke-dasharray:6 4}
#plan .it.ceil .ln{stroke:#1d6fb8}
#plan .rot-h,#plan .rot-l{display:none}`;

function newPage() {
  const cv = document.createElement('canvas'); cv.width = Math.round(PG.w * PX); cv.height = Math.round(PG.h * PX);
  const x = cv.getContext('2d'); x.scale(PX, PX); x.fillStyle = '#fff'; x.fillRect(0, 0, PG.w, PG.h);
  x.textBaseline = 'middle'; return { cv, x };
}
function frame(pg, title, scale, no, total) {
  const x = pg.x, m = 10, tbW = 190, tbH = 24, tx = PG.w - m - tbW, ty = PG.h - m - tbH;
  x.strokeStyle = '#111'; x.lineWidth = .5; x.strokeRect(m, m, PG.w - 2 * m, PG.h - 2 * m);
  x.lineWidth = .35; x.strokeRect(tx, ty, tbW, tbH);
  const cols = [0, 70, 120, 155, 190];
  cols.slice(1, -1).forEach(c => { x.beginPath(); x.moveTo(tx + c, ty); x.lineTo(tx + c, ty + tbH); x.stroke(); });
  x.beginPath(); x.moveTo(tx + 70, ty + 12); x.lineTo(tx + tbW, ty + 12); x.stroke();
  const lab = (s, cx, cy) => { x.fillStyle = '#666'; x.font = `2.3px ${PFONT}`; x.fillText(s, cx, cy); };
  const val = (s, cx, cy, sz = 3.4) => { x.fillStyle = '#111'; x.font = `600 ${sz}px ${PFONT}`; x.fillText(s, cx, cy); };
  lab('專案名稱', tx + 2, ty + 3.5); val(S.meta.name, tx + 2, ty + 10, 4.2);
  lab('圖名', tx + 2, ty + 16.5); val(title, tx + 2, ty + 21, 3.4);
  const d = new Date();
  lab('比例', tx + 72, ty + 3.5); val(scale, tx + 72, ty + 8.5);
  lab('單位', tx + 122, ty + 3.5); val('mm', tx + 122, ty + 8.5);
  lab('頁次', tx + 157, ty + 3.5); val(`${no} / ${total}`, tx + 157, ty + 8.5);
  lab('日期', tx + 72, ty + 15.5); val(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, tx + 72, ty + 20.5);
  lab('空間', tx + 122, ty + 15.5); val(`${S.room.W}×${S.room.D}×${S.room.H}`, tx + 122, ty + 20.5, 3);
  x.fillStyle = '#888'; x.font = `2.2px ${PFONT}`; x.fillText('室內空間 3D 設計器輸出', m + 2, PG.h - m - 2.5);
}
async function svgImage(xml) {
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
  await img.decode(); return img;
}
async function planPage(layer = 'floor') {
  const keep = sel; sel = null; PRINT = layer; checks = runChecks(); renderPlan(true); PRINT = false;
  const clone = svg.cloneNode(true), vb = svg.viewBox.baseVal;
  sel = keep; renderPlan();
  const areaW = PG.w - 30, areaH = PG.h - 20 - 40;
  const sc = [20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300].find(k => vb.width / k <= areaW && vb.height / k <= areaH) || 400;
  const wmm = vb.width / sc, hmm = vb.height / sc;
  clone.removeAttribute('hidden'); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', Math.round(wmm * PX)); clone.setAttribute('height', Math.round(hmm * PX));
  clone.insertAdjacentHTML('afterbegin', `<style>${PRINT_CSS}</style>`);
  const img = await svgImage(new XMLSerializer().serializeToString(clone));
  const pg = newPage(), x0 = 15 + (areaW - wmm) / 2, y0 = 14 + (areaH - hmm) / 2;
  pg.x.drawImage(img, x0, y0, wmm, hmm);
  const c = calc(); pg.x.fillStyle = '#111'; pg.x.font = `600 4px ${PFONT}`; pg.x.fillText(layer === 'ceil' ? '天花配置圖（由上往下看，虛線為天花設備）' : '平面配置圖', 15, 17);
  pg.x.font = `2.8px ${PFONT}`; pg.x.fillStyle = '#444';
  pg.x.fillText(`室內淨面積 ${fx(c.A)} m²（${fx(c.ping)} 坪）・地板 ${c.fl.name}・家具 ${S.items.length} 件・佔地 ${fx(c.foot / c.A * 100, 1)}%・動線檢查 ${checks.list.length ? checks.list.length + ' 項待確認' : '全部通過'}`, 15, 22.5);
  if (layer === 'ceil') { const cs = S.items.filter(i => LIB[i.type].mount === 'ceiling'); pg.x.fillText(`天花高 ${S.room.H} mm・${S.room.ceiling === 'grid' ? '輕鋼架天花' : S.room.ceiling === 'flat' ? '平釘天花' : '不做天花'}・天花設備 ${cs.length} 件・燈具 ${fmt(cs.reduce((s, i) => s + (LIB[i.type].lm ? (i.lm || LIB[i.type].lm) : 0), 0))} lm`, 15, 27); }
  pg.title = layer === 'ceil' ? '天花配置圖' : '平面配置圖'; pg.scale = `1:${sc}（A3）`; return pg;
}
function viewsPage() {
  const keepCam = { th: cam.th, ph: cam.ph, r: cam.r, tg: cam.tg.clone() }, keepSel = sel, el = renderer.domElement;
  const keepW = el.clientWidth, keepH = el.clientHeight, keepBg = scene.background;
  sel = null; buildHelpers(); scene.background = new THREE.Color('#ffffff');
  const grid = scene.children.find(o => o.type === 'GridHelper'); if (grid) grid.visible = false;
  const pg = newPage(), cw = 193, ch = 108, pos = [[14, 26], [213, 26], [14, 146], [213, 146]];
  const views = [['iso', '等角視圖'], ['front', '前視圖（由南向北）'], ['right', '右視圖（由東向西）'], ['top', '俯視圖']];
  renderer.setPixelRatio(1); renderer.setSize(Math.round(cw * PX), Math.round(ch * PX), false);
  camera.aspect = cw / ch; camera.updateProjectionMatrix();
  views.forEach(([k, name], i) => {
    fitCam(k); renderer.render(scene, camera);
    const [x, y] = pos[i]; pg.x.drawImage(el, x, y, cw, ch);
    pg.x.strokeStyle = '#999'; pg.x.lineWidth = .25; pg.x.strokeRect(x, y, cw, ch);
    pg.x.fillStyle = '#111'; pg.x.font = `600 3.2px ${PFONT}`; pg.x.fillText(name, x + 1, y - 2.5);
  });
  pg.x.fillStyle = '#111'; pg.x.font = `600 4px ${PFONT}`; pg.x.fillText('3D 擺設視圖', 14, 17);
  scene.background = keepBg; if (grid) grid.visible = true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(keepW, keepH);
  camera.aspect = keepW / keepH; camera.updateProjectionMatrix();
  Object.assign(cam, { th: keepCam.th, ph: keepCam.ph, r: keepCam.r }); cam.tg.copy(keepCam.tg); updCam();
  sel = keepSel; buildHelpers();
  pg.title = '3D 擺設視圖'; pg.scale = '—'; return pg;
}
function tablePages(sections) { // sections: [{title, cols:[[label,widthMM,align]], rows:[[...]], foot?}]
  const pages = []; let pg = null, y = 0; const bottom = PG.h - 40, rh = 6;
  const start = t => { pg = newPage(); pg.title = t; pg.scale = '—'; pages.push(pg); y = 20; };
  for (const s of sections) {
    if (!pg || y + rh * 4 > bottom) start(s.title);
    const x = pg.x, totalW = s.cols.reduce((a, c) => a + c[1], 0);
    const head = () => {
      x.fillStyle = '#111'; x.font = `600 4px ${PFONT}`; x.fillText(s.title, 15, y); y += 5;
      x.fillStyle = '#e9eef4'; x.fillRect(15, y, totalW, rh); x.fillStyle = '#333'; x.font = `600 2.8px ${PFONT}`;
      let cx = 15; s.cols.forEach(c => { cellText(x, c[0], cx, y, c[1], c[2]); cx += c[1]; }); y += rh;
    };
    head();
    const rows = s.foot ? [...s.rows, ...s.foot.map(r => Object.assign(r, { foot: true }))] : s.rows;
    rows.forEach((r, i) => {
      if (y + rh > bottom) { start(s.title + '（續）'); head(); }
      const xx = pg.x; if (r.foot) { xx.fillStyle = '#f4f6f8'; xx.fillRect(15, y, totalW, rh); }
      else if (i % 2) { xx.fillStyle = '#fafbfc'; xx.fillRect(15, y, totalW, rh); }
      xx.strokeStyle = '#d5dbe2'; xx.lineWidth = .2; xx.beginPath(); xx.moveTo(15, y + rh); xx.lineTo(15 + totalW, y + rh); xx.stroke();
      xx.fillStyle = '#111'; xx.font = `${r.foot ? '600 ' : ''}2.8px ${PFONT}`;
      let cx = 15; s.cols.forEach((c, k) => { cellText(xx, r[k] ?? '', cx, y, c[1], c[2]); cx += c[1]; }); y += rh;
    });
    y += 9;
  }
  return pages;
}
function cellText(x, t, cx, y, w, al) {
  t = String(t); while (t.length > 1 && x.measureText(t).width > w - 3) t = t.slice(0, -2) + '…';
  x.textAlign = al === 'r' ? 'right' : 'left'; x.fillText(t, al === 'r' ? cx + w - 1.5 : cx + 1.5, y + 3); x.textAlign = 'left';
}
function reportSections() {
  const c = calc(), cl = cutList(), P = S.prices;
  const sec = [];
  sec.push({ title: '家具清單', cols: [['#', 10], ['品名', 70], ['類別', 26], ['W×D×H (mm)', 46, 'r'], ['中心 X, Y', 40, 'r'], ['角度', 18, 'r'], ['顏色', 26], ['計價', 50], ['小計 NT$', 40, 'r'], ['檢查', 22]],
    rows: S.items.map((it, i) => { const L = LIB[it.type]; return [i + 1, it.name, CATS.find(x => x[0] === L.cat)[1], `${it.w}×${it.d}×${it.h}`, `${fmt(it.x)}, ${fmt(it.y)}`, it.rot + '°', it.color, L.pricing === 'chi' ? `${chis(it.w)} 尺 × ${fmt(it.chiPrice)}` : '件', fmt(itemPrice(it)), checks.flags[it.id] === 'bad' ? '干涉' : checks.flags[it.id] ? '注意' : 'OK']; }),
    foot: [['', `合計 ${S.items.length} 件`, '', '', '', '', '', '', fmt(c.furn), '']] });
  sec.push({ title: '估價單', cols: [['#', 10], ['工程項目', 50], ['規格說明', 130], ['數量', 30, 'r'], ['單位', 18], ['單價', 40, 'r'], ['複價 NT$', 50, 'r']],
    rows: [...c.rows.map((x, i) => [i + 1, x.name, x.spec, x.k === 'furn' ? '—' : fx(x.qty, x.unit === '盞' ? 0 : x.unit === 'kW' ? 1 : 2), x.unit, x.k === 'furn' ? '—' : fmt(x.price), fmt(x.total)]),
      [8, '設計費', '依室內坪數計', fx(c.ping), '坪', fmt(P.design), fmt(c.design)], [9, '工程管理費', '工程項目（2～7）', P.mgmt, '%', fmt(c.eng), fmt(c.mgmt)]],
    foot: [['', '未稅小計', '', '', '', '', fmt(c.sub)], ['', '營業稅', '', P.tax, '%', '', fmt(c.tax)], ['', '含稅總價', '', '', '', '', fmt(c.total)]] });
  sec.push({ title: '裝修材料計算', cols: [['項目', 60], ['計算內容', 170], ['結果', 100, 'r']],
    rows: [['地板', `${c.fl.name}，淨面積 ${fx(c.A)} m²，損耗 ${Math.round(c.fl.waste * 100)}%`, `${fx(c.needPing)} 坪${c.tiles ? `／${fmt(c.tiles)} 片` : ''}`],
      ['牆面油漆', `周長 ${fx(c.perim)} m × 高 ${S.room.H} − 開口 ${fx(c.openA)} m²，含天花`, `${fx(c.paintA)} m²／${fx(c.paintL, 1)} L`],
      ['天花板', S.room.ceiling === 'flat' ? '矽酸鈣板平釘' : '不施作', `${fx(c.ceilPing)} 坪`], ['踢腳板', '周長扣除門及開口', `${fx(c.skirt)} m`],
      ['照明', `目標 ${c.lux} lx，E×A÷(0.6×0.8)，單盞 ${S.room.lm} lm`, `${fmt(c.lumens)} lm／${c.lights} 盞`],
      ['空調', `450 kcal/h・坪${S.room.west ? ' ×1.2 西曬' : ''}${S.room.top ? ' ×1.15 頂樓' : ''} = ${fmt(c.kcal)} kcal/h（${fx(c.kw)} kW）`, `${c.acKw} kW`]] });
  sec.push({ title: '動線檢查', cols: [['等級', 24], ['檢查項目', 306]], rows: checks.list.length ? checks.list.map(x => [x.lv === 'err' ? '干涉' : '注意', x.msg]) : [['通過', '沒有干涉、擋門或通道不足的情況。']] });
  if (cl.parts.length) {
    sec.push({ title: '系統櫃拆單', cols: [['櫃體', 70], ['部件', 50], ['長 mm', 30, 'r'], ['寬 mm', 30, 'r'], ['厚', 18, 'r'], ['數量', 20, 'r'], ['面積 m²', 30, 'r'], ['材質', 80]],
      rows: cl.parts.map(p => [p.tag, p.part, fmt(p.a), fmt(p.b), p.th, p.n, fx(p.a * p.b * p.n / 1e6, 3), p.th === 8 ? '背板 8t' : p.th === 15 ? '抽屜板 15t' : 'E1 塑合板 18t 四邊封邊']),
      foot: [['合計', `18/15t ${cl.s18} 張・8t ${cl.s8} 張`, '', '', '', '', fx(cl.a18 + cl.a8, 2), `封邊 ${fx(cl.edge, 1)} m・鉸鏈 ${cl.hinge}・把手 ${cl.handle}・滑軌 ${cl.slide}`]] });
  }
  return sec;
}
function b64bytes(dataUrl) { const b = atob(dataUrl.split(',')[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function buildPDF(pages) {
  const enc = new TextEncoder(), chunks = [], offs = []; let pos = 0;
  const push = d => { const u = typeof d === 'string' ? enc.encode(d) : d; chunks.push(u); pos += u.length; };
  const W = PG.w / 25.4 * 72, H = PG.h / 25.4 * 72, n = pages.length;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\xE2\xE3\xCF\xD3]/g, 'X'));
  const obj = (id, body) => { offs[id] = pos; push(`${id} 0 obj\n`); body(); push('\nendobj\n'); };
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${n} >>`));
  pages.forEach((p, i) => {
    const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2, jpg = b64bytes(p.cv.toDataURL('image/jpeg', .9));
    const content = `q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} 0 0 cm /Im0 Do Q`;
    obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`));
    obj(cid, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(iid, () => { push(`<< /Type /XObject /Subtype /Image /Width ${p.cv.width} /Height ${p.cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
  });
  const total = 3 + n * 3, xref = pos;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R /Info << /Title (Interior Design) /Producer (Interior3D) >> >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
async function exportPDF() {
  const btn = $('#pdfBtn'); btn.disabled = true; toast('正在產生 PDF…');
  try {
    checks = runChecks();
    const pages = [await planPage('floor')];
    if (S.items.some(i => LIB[i.type].mount === 'ceiling')) pages.push(await planPage('ceil'));
    pages.push(viewsPage(), ...tablePages(reportSections()));
    pages.forEach((p, i) => frame(p, p.title, p.scale, i + 1, pages.length));
    await download(`${safeName(S.meta.name)}_${stamp()}.pdf`, buildPDF(pages), 'application/pdf', 'pdf', 'PDF 圖面');
  } catch (e) { console.error(e); toast('PDF 輸出失敗：' + e.message); }
  finally { btn.disabled = false; checks = runChecks(); renderPlan(); dirty = true; }
}
