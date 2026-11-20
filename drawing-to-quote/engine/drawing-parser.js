/*
 * 2D 製作圖欄位辨識器（規則式，完全離線）
 * ------------------------------------------------------------------
 * 輸入（任一來源統一格式）：
 *   { source: "dxf"|"pdf"|"ocr", fileName, items:[{s,x,y,h}]  // y 向下
 *     dims:[{kind:"linear"|"diameter"|"radius"|"angle", value, text}], circles:[{x,y,r}] }
 * 輸出：{ fields:{CSV 欄位: 值}, conf:{欄位: "high"|"mid"|"low"}, evidence:{欄位: 依據文字}, score }
 *
 * 辨識順序：標題欄標籤 → 圖面註記關鍵字 → 尺寸標註統計 → 幾何（DXF 圓）→ 檔名
 */
(function (root) {
  const DB = (typeof module !== "undefined" && module.exports) ? require("./price-db.js") : root.PRICE_DB;

  const LABELS = {
    drawingNo: /^(圖\s*號|圖\s*面\s*編\s*號|DWG\.?\s*NO\.?|DRAWING\s*NO\.?|PART\s*NO\.?|料\s*號)\s*[:：]?/i,
    cadNo: /^(CAD\s*NO\.?|CAD\s*編號|檔\s*名|FILE\s*NAME)\s*[:：]?/i,
    name: /^(品\s*名|圖\s*名|零件名稱|名\s*稱|PART\s*NAME|DESCRIPTION|TITLE|NAME)\s*[:：]?/i,
    material: /^(材\s*料|材\s*質|MATERIAL|MAT'?L\.?)\s*[:：]?/i,
    qty: /^(數\s*量|QTY\.?|Q'TY|QUANTITY|件\s*數)\s*[:：]?/i,
    surface: /^(表\s*面(\s*處)?(\s*理)?|表\s*處|FINISH|SURFACE(\s*TREATMENT)?|處\s*理)\s*[:：]?/i,
    heat: /^(熱\s*處(\s*理)?|HEAT\s*TREAT(MENT)?|硬\s*度|HARDNESS)\s*[:：]?/i,
    scale: /^(比\s*例|SCALE)\s*[:：]?/i,
    unit: /^(單\s*位|UNIT)\s*[:：]?/i,
  };

  const norm = (s) => String(s ?? "")
    .replace(/[⌀∅φΦ]/g, "Ø").replace(/%%[cC]/g, "Ø").replace(/%%[pP]/g, "±").replace(/%%[dD]/g, "°")
    .replace(/[＋]/g, "+").replace(/[－—–]/g, "-").replace(/[：]/g, ":").replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, " ").trim();

  /** 把散落的字串依位置組成「行」與「詞段」（OCR 常把「圖號」拆成單字） */
  const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
  const estW = (it) => [...it.s].reduce((a, ch) => a + (CJK.test(ch) ? 1 : 0.62), 0) * it.h;
  const glue = (a, b) => (CJK.test(a.slice(-1)) || CJK.test(b[0]) ? "" : " ");
  function buildLines(items) {
    const its = items.filter((i) => i.s && i.s.trim()).map((i) => ({ ...i, s: norm(i.s), h: i.h || 3 })).sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const it of its) {
      const ln = lines.find((l) => Math.abs(l.y - it.y) < Math.max(l.h, it.h) * 0.6 && it.x - l.x1 < Math.max(l.h, it.h) * 3 && it.x + estW(it) >= l.x0 - Math.max(l.h, it.h) * 3);
      if (ln) { ln.parts.push(it); ln.x0 = Math.min(ln.x0, it.x); ln.x1 = Math.max(ln.x1, it.x + estW(it)); }
      else lines.push({ y: it.y, h: it.h, x0: it.x, x1: it.x + estW(it), parts: [it] });
    }
    const segs = [];
    lines.forEach((l) => {
      l.parts.sort((a, b) => a.x - b.x);
      l.s = l.parts.reduce((acc, p) => (acc ? acc + glue(acc, p.s) : "") + p.s, "");
      let cur = null;
      for (const p of l.parts) {
        if (cur && p.x - cur.xe <= Math.max(cur.h, p.h) * 0.9 && !cur.vertical === !p.vertical) { cur.s += glue(cur.s, p.s) + p.s; cur.xe = Math.max(cur.xe, p.x + estW(p)); cur.conf = Math.min(cur.conf, p.conf ?? 90); cur.titleBlock = cur.titleBlock || p.titleBlock; }
        else { cur = { s: p.s, x: p.x, y: p.y, h: p.h, xe: p.x + estW(p), line: l, conf: p.conf ?? 90, vertical: p.vertical, titleBlock: p.titleBlock, slanted: p.slanted }; segs.push(cur); }
      }
    });
    return { items: segs, lines };
  }

  /** 找標籤旁的值：同字串冒號後 → 右方最近 → 下方最近 */
  function valueNear(doc, labelRe, accept = () => true) {
    for (const it of doc.items) {
      const m = it.s.match(labelRe);
      if (!m) continue;
      const rest = it.s.slice(m[0].length).trim();
      if (rest && accept(rest)) return { v: rest, ev: it.s };
      const h = it.h || 3, labelEnd = it.x + Math.max(m[0].length, 1) * h * 0.6;
      const right = doc.items.filter((o) => o !== it && Math.abs(o.y - it.y) < h * 0.9 && o.x > labelEnd - h && o.x - labelEnd < h * 25 && !Object.values(LABELS).some((re) => re.test(o.s)) && accept(o.s))
        .sort((a, b) => a.x - b.x)[0];
      if (right) return { v: right.s, ev: `${it.s} → ${right.s}` };
      const below = doc.items.filter((o) => o !== it && o.y > it.y && o.y - it.y < h * 3.5 && Math.abs(o.x - it.x) < h * 10 && !Object.values(LABELS).some((re) => re.test(o.s)) && accept(o.s))
        .sort((a, b) => (a.y - b.y) || Math.abs(a.x - it.x) - Math.abs(b.x - it.x))[0];
      if (below) return { v: below.s, ev: `${it.s} ↓ ${below.s}` };
    }
    return null;
  }

  // 材料辨識：資料庫代號 + 別名 + 常見寫法
  function matchMaterial(s) {
    const up = s.toUpperCase().replace(/\s+/g, "");
    const keys = Object.keys(DB.materials).sort((a, b) => b.length - a.length);
    for (const k of keys) if (up.includes(k.toUpperCase())) return k;
    const extra = { "AL6061": "A6061", "AL-6061": "A6061", "6061-T6": "A6061", "AL5052": "A5052", "AL7075": "A7075", "SUS-304": "SUS304", "SUS-316": "SUS316",
      "SK-D11": "SKD11", "DC53": "SKD11", "SKD-11": "SKD11", "S45CH": "S45C", "S-45C": "S45C", "SCM-440": "SCM440", "黃銅": "C3604", "紅銅": "C1100", "鋁擠": "A6063", "塑鋼": "POM", "電木": "POM", "尼龍": "MC尼龍", "鐵板": "SS400", "冷軋": "SPCC", "電鍍鋅鋼板": "SECC" };
    for (const [a, k] of Object.entries(extra)) if (up.includes(a.toUpperCase())) return k;
    const m = up.match(/\b(A?[5-7]0[0-9]{2})\b/); if (m) { const k = "A" + m[1].replace(/^A/, ""); if (DB.materials[k]) return k; }
    return null;
  }
  const SURF_WORDS = [["硬陽極", "硬陽極"], ["硬質陽極", "硬陽極"], ["黑色陽極", "黑陽極"], ["黑陽極", "黑陽極"], ["陽極", "陽極"], ["ANODIZ", "陽極"], ["染黑", "染黑"], ["發黑", "染黑"], ["BLACK OXIDE", "染黑"],
    ["鍍鋅", "鍍鋅"], ["ZINC", "鍍鋅"], ["無電解鎳", "無電解鎳"], ["化學鎳", "無電解鎳"], ["ELECTROLESS", "無電解鎳"], ["鍍鎳", "鍍鎳"], ["鍍硬鉻", "鍍硬鉻"], ["硬鉻", "鍍硬鉻"], ["鍍鉻", "鍍硬鉻"],
    ["粉體", "粉體塗裝"], ["烤漆", "烤漆"], ["噴漆", "烤漆"], ["PAINT", "烤漆"], ["漆", "烤漆"], ["塗裝", "烤漆"], ["電解拋光", "電解拋光"], ["鈍化", "鈍化"], ["鐵氟龍", "鐵氟龍"], ["TEFLON", "鐵氟龍"], ["噴砂", "噴砂"]];
  const HEAT_WORDS = [["真空熱處理", "真空熱處理"], ["真空淬火", "真空熱處理"], ["高周波", "高周波"], ["高頻", "高周波"], ["滲碳", "滲碳"], ["軟氮化", "氮化"], ["氮化", "氮化"], ["調質", "調質"], ["淬火", "淬火回火"], ["QUENCH", "淬火回火"], ["退火", "退火"]];
  const wordHit = (s, list) => { const up = s.toUpperCase(); for (const [w, k] of list) if (up.includes(w.toUpperCase())) return k; return null; };

  function parseQtyText(s) {
    const m = norm(s).match(/(\d+\s*(?:[+xX×*]\s*\d+)*)\s*(PCS|EA|SET|件|個|支|片|組)?/i);
    return m ? m[1].replace(/\s/g, "") : null;
  }

  /** 主辨識 */
  // OCR 常見誤讀修正：Ø 被讀成 0 / @ / o
  function fixOcr(s) {
    s = s.replace(/(?<=\d)[oO](?=[\d\-A-Z]|$)|(?<=[A-Z\-])[oO](?=\d)/g, "0")   // SO67→S067、SUS3O4→SUS304、S5OC→S50C
      .replace(/(?<=\d)[lI|](?=\d)/g, "1").replace(/(?<=[A-Z])[lI](?=\d)/g, "1")  // l/I 夾在數字中 → 1
      .replace(/(?<=\d)[sS](?=\d)/g, "5").replace(/(?<=\d),(?=\d{1,2}\b)/g, ".");  // 6,6 → 6.6
    s = s.replace(/[士£]\s*(?=0?[.,]?\d)/g, "±")
      .replace(/(\d)\s*\+\s*(0\.\d+)(?!\s*\/?\s*-)/g, "$1±$2")                      // 120+0.01（± 被讀成 +）
      .replace(/(\d+\s*-\s*)9(\d)/g, "$1Ø$2")                                         // 6-96.6 → 6-Ø6.6（Ø 被讀成 9）
      .replace(/(沉頭|孔|通孔|錐孔|THRU)\s*9(\d)/g, "$1Ø$2");
    return s.replace(/(\d+\s*-\s*)[0oO@](\d)/g, "$1Ø$2").replace(/^[@oO](\d)/, "Ø$1").replace(/(^|\s)0(\d{2,3}(?:\.\d)?)(?=\s|$|[a-zA-Z])/g, "$1Ø$2")
      .replace(/R[aа]\s*[oO](\.\d)/g, "Ra0$1").replace(/\bM(\d+)[xX×]0(\.\d+)/g, "M$1x0$2");
  }

  function recognize(input) {
    if (input.source === "ocr") {
      let its = (input.items || []).map((i) => ({ ...i, s: fixOcr(norm(i.s)) }));
      // 小數點漏讀：「37」「68」緊貼在同一基線 → 37.68
      its = its.sort((a, b) => a.y - b.y || a.x - b.x);
      const out = [];
      for (const it of its) {
        const prev = !it.vertical && out.find((p) => !p.vertical && /^\d{1,3}$/.test(p.s) && /^\d{2}$/.test(it.s) && Math.abs(p.y - it.y) < it.h * 0.4 && it.x - (p.x + p.s.length * p.h * 0.62) < p.h * 0.9 && it.x > p.x);
        if (prev) { prev.s = prev.s + "." + it.s; prev.conf = Math.min(prev.conf ?? 90, it.conf ?? 90); } else out.push(it);
      }
      input = { ...input, items: out };
    }
    const doc = buildLines(input.items || []);
    const fields = {}, conf = {}, ev = {};
    const set = (k, v, c, e) => { if (v === undefined || v === null || v === "") return; fields[k] = v; conf[k] = c; ev[k] = e; };
    const all = doc.lines.map((l) => l.s);
    const allText = all.join("\n");
    const allWithDims = allText + "\n" + (input.dims || []).map((d) => norm(d.text)).join("\n");
    const stem = String(input.fileName || "").replace(/\.[^.]+$/, "").replace(/_p\d+$/, "");

    // 1) 標題欄
    const dno = valueNear(doc, LABELS.drawingNo, (v) => /[A-Z0-9]{2,}[-_A-Z0-9]*/i.test(v) && v.length <= 30);
    if (dno) set("圖號", dno.v.split(" ")[0], "high", dno.ev);
    else {
      const m = allText.match(/\b\d{5,8}-[A-Z]{0,2}\d{1,3}\b/) || allText.match(/\b[A-Z]{1,4}\d{2,6}-[A-Z0-9]{1,6}(-[A-Z0-9]{1,4})?\b/);
      if (m) set("圖號", m[0], "mid", "圖號樣式 " + m[0]); else if (stem) set("圖號", stem, "low", "取自檔名");
    }
    const cad = valueNear(doc, LABELS.cadNo, (v) => /[A-Z0-9]/i.test(v) && v.length <= 30);
    if (cad) set("CAD NO", cad.v.split(" ")[0], "high", cad.ev);
    else { const m = allText.match(/\bS\d{3}-[A-Z]\d{1,3}\b/); if (m) set("CAD NO", m[0], "mid", m[0]); }

    const nm = valueNear(doc, LABELS.name, (v) => v.length <= 24 && !/^\d+([.,]\d+)?$/.test(v) && !matchMaterial(v));
    if (nm) set("零件名稱", nm.v, "high", nm.ev);
    else { const m = allText.match(/(滾輪|軸|環|塊|板|座|架|蓋|套|桿|銷|支架|治具|底座|墊片|夾爪|導軌|齒輪|皮帶輪|法蘭|接頭)/); if (m) { const ln = all.find((l) => l.includes(m[0]) && l.length <= 16); if (ln) set("零件名稱", ln, "low", "關鍵字 " + m[0]); } }

    const mat = valueNear(doc, LABELS.material, (v) => !!matchMaterial(v));
    if (mat) set("材料", matchMaterial(mat.v), "high", mat.ev);
    else { for (const l of all) { const k = matchMaterial(l); if (k) { set("材料", k, "mid", l); break; } } }

    const q = valueNear(doc, LABELS.qty, (v) => /^\d/.test(norm(v)));
    if (q) set("數量", parseQtyText(q.v), "high", q.ev);
    else { const m = allText.match(/(\d+)\s*(PCS|件|SET)\b/i); set("數量", m ? m[1] : "1", m ? "mid" : "low", m ? m[0] : "未標示，預設 1"); }

    const sf = valueNear(doc, LABELS.surface, (v) => !!wordHit(v, SURF_WORDS) || /^(無|NONE|N\/A|-)$/i.test(v));
    if (sf) set("表面處理", wordHit(sf.v, SURF_WORDS) || "無", "high", sf.ev);
    else { const k = wordHit(allText, SURF_WORDS); set("表面處理", k || "", k ? "mid" : "low", k ? "註記關鍵字" : "未標示"); }

    const ht = valueNear(doc, LABELS.heat, (v) => !!wordHit(v, HEAT_WORDS) || /HRC|HV|HB/i.test(v));
    let heat = ht ? wordHit(ht.v, HEAT_WORDS) : wordHit(allText, HEAT_WORDS);
    const hrc = allText.match(/HRC\s*(\d{2})/i);
    if (!heat && hrc) heat = /SKD/.test(fields["材料"] || "") ? "真空熱處理" : "淬火回火";
    set("熱處理", heat || "無", heat ? (ht ? "high" : "mid") : "low", ht ? ht.ev : hrc ? hrc[0] : heat ? "註記關鍵字" : "未標示");
    if (hrc) ev["熱處理"] = (ev["熱處理"] || "") + `（${hrc[0]}）`;

    // 2) 註記：螺牙、孔、深孔、交叉孔、PT、折彎、焊接、板厚
    let taps = 0, pt = 0, holes = 0, deep = 0, ext = 0, bends = 0;
    const tapEv = [], holeEv = [];
    const textPool = [...all, ...(input.dims || []).map((d) => norm(d.text))];
    const seen = new Set();
    for (const l of textPool) {
      if (seen.has(l)) continue; seen.add(l);
      for (const m of l.matchAll(/(?:(\d+)\s*[-xX×]\s*)?(PT|NPT|Rc|RC|PF|G)\s*(\d\s*\/\s*\d+|(?<=PT\s*)\d(?![\d.]))/g)) { const n = +(m[1] || 1); if (/PF|^G$/.test(m[2])) taps += n; else pt += n; tapEv.push(m[0]); }
      for (const m of l.matchAll(/(?:(\d+)\s*[-xX×]\s*)?M\s*(\d+(?:\.\d+)?)(?:\s*[xX×]\s*P?\s*(\d+(?:\.\d+)?))?/g)) {
        if (/[A-Z]$/i.test(l.slice(0, m.index))) continue; // 避免 "SCM440" 之類
        const n = +(m[1] || 1); taps += n; tapEv.push(m[0].trim());
        const dep = l.slice(m.index).match(/(?:深|DP|DEPTH|↧)\s*(\d+(?:\.\d+)?)/i); if (dep && +dep[1] >= 5 * +m[2]) deep += n;
      }
      for (const m of l.matchAll(/(\d+)\s*[-xX×]\s*Ø\s*(\d+(?:\.\d+)?)/g)) {
        const n = +m[1]; holes += n; holeEv.push(m[0]);
        const dep = l.slice(m.index).match(/(?:深|DP|DEPTH|↧)\s*(\d+(?:\.\d+)?)/i); if (dep && +dep[1] >= 5 * +m[2]) deep += n;
      }
      const ud = l.match(/(UP|DOWN|上折|下折|向上折|向下折|折彎)\s*(\d+)\s*°/gi) || l.match(/\b(UP|DOWN)\b|上折|下折/gi); if (ud) bends += ud.length;
    }
    if (!deep) for (const l of textPool) for (const m of l.matchAll(/(?:(\d+)\s*[-xX×]\s*)?(?:PT\s*\d\/\d+\D*?)?Ø\s*(\d+(?:\.\d+)?)[^Ø\n]*?(?:深|DP|DEPTH|↧)\s*(\d+(?:\.\d+)?)/gi)) if (+m[3] >= 5 * +m[2]) deep += +(m[1] || 1);
    const mOnly = tapEv.filter((t) => /M\s*\d/.test(t));
    if (taps) set("攻牙數", taps, "mid", (mOnly.length ? mOnly : tapEv).slice(0, 6).join("、"));
    if (pt) set("PT牙數", pt, "mid", tapEv.filter((t) => /PT|NPT|RC/i.test(t)).join("、"));
    const crossKw = /(交叉孔|流道|貫穿交叉|CROSS\s*HOLE)/i.test(allText);
    if (deep) set("深孔數", deep, "mid", "孔深 ≥ 5D");
    if (crossKw) set("交叉孔數", /流道/.test(allText) ? 2 : 1, "low", "註記：交叉孔/流道");
    if (/(清角|銳角|內直角|R\s*0(?![.\d]))/.test(allText)) set("內直角數", (allText.match(/清角|銳角|內直角/g) || [1]).length, "low", "註記：清角/銳角");
    if (/(焊接|滿焊|點焊|WELD)/i.test(allText)) { const m = allText.match(/焊道\s*(\d+)/); set("焊道長mm", m ? +m[1] : "", m ? "mid" : "low", "註記：焊接"); }
    if (/(展開|折彎|BEND|鈑金)/i.test(allText) && !bends) bends = (allText.match(/折彎線|BEND LINE/gi) || []).length || 1;
    if (bends) set("折彎數", bends, "low", "註記：折彎/UP/DOWN");
    const tm = allText.match(/(?:板厚|厚度|\bt\s*=|\bT\s*=)\s*(\d+(?:\.\d+)?)/i) || (input.source !== "ocr" && allText.match(/\bt\s*(\d+(?:\.\d+)?)\b/));
    if (tm) set("板厚T", +tm[1], "mid", tm[0]);

    // 3) 公差與粗糙度
    let tolBand = Infinity; const tolEv = [];
    for (const m of allWithDims.matchAll(/±\s*(0\.\d+)/g)) { tolBand = Math.min(tolBand, 2 * +m[1]); tolEv.push(m[0]); }
    for (const m of allWithDims.matchAll(/\+\s*(0\.\d+)\s*\/?\s*-\s*(0\.\d+)/g)) { tolBand = Math.min(tolBand, +m[1] + +m[2]); tolEv.push(m[0]); }
    for (const m of allWithDims.matchAll(/\b([A-HJ-NP-Z]|[a-hj-np-z]|js)([5-9])\b/g)) { if (!/[HhGgFfKkMmNnPpJj]|js/.test(m[1])) continue; const it = +m[2]; tolBand = Math.min(tolBand, it <= 6 ? 0.01 : it === 7 ? 0.025 : 0.05); tolEv.push(m[0]); }
    const generalTol = allText.match(/(未註公差|一般公差|未標註公差)[^\n]*?±\s*(0\.\d+)/);
    if (generalTol) tolEv.unshift(generalTol[0]);
    if (tolEv.length) set("公差", tolBand <= 0.02 ? "嚴" : tolBand <= 0.1 ? "中等" : "一般", "mid", tolEv.slice(0, 5).join("、"));
    else set("公差", "一般", "low", "未見公差標註");

    let ra = Infinity; const raEv = [];
    for (const m of allWithDims.matchAll(/Ra\s*(\d+(?:\.\d+)?)/gi)) { ra = Math.min(ra, +m[1]); raEv.push(m[0]); }
    const tri = allWithDims.match(/▽+/g); if (tri) { const n = Math.max(...tri.map((t) => t.length)); ra = Math.min(ra, [25, 12.5, 6.3, 1.6, 0.4][n] ?? 0.4); raEv.push("▽".repeat(n)); }
    if (raEv.length) { const opts = [0.4, 0.8, 1.6, 3.2, 6.3]; const pick = opts.find((o) => ra <= o + 1e-9) ?? 6.3; set("粗糙度", "Ra" + pick, "mid", raEv.slice(0, 4).join("、")); }
    else set("粗糙度", "Ra3.2", "low", "未標示，預設 Ra3.2");

    // 4) 尺寸
    const dims = [];
    for (const d of input.dims || []) if (Number.isFinite(d.value) && d.value > 0) dims.push({ kind: d.kind, v: d.value, text: norm(d.text) });
    if (!dims.length) { // PDF / OCR：從文字推斷尺寸
      const reserved = new Set([fields["圖號"], fields["CAD NO"], fields["數量"]].filter(Boolean).map(String));
      // 標題欄範圍（由標籤位置推得）內的數字一律不當尺寸
      const labs = doc.items.filter((it) => Object.values(LABELS).some((re) => re.test(it.s)));
      let tb = null;
      if (labs.length >= 2) {
        const h = Math.max(...labs.map((l) => l.h));
        tb = { x0: Math.min(...labs.map((l) => l.x)) - h, y0: Math.min(...labs.map((l) => l.y)) - h * 2.5, y1: Math.max(...labs.map((l) => l.y)) + h * 2.5 };
      }
      const inTB = (it) => it.titleBlock || (tb && it.x >= tb.x0 && it.y >= tb.y0 && it.y <= tb.y1);
      // 一般公差表（≤10 ≤100 ≤500 >500 / ±0.1 …）整區排除
      const tolRows = doc.lines.filter((l) => /Grade|等級|[≤≦<>≥≧]\s*\d|±\s*0?\.\d.*±\s*0?\.\d/i.test(l.s) || (l.s.match(/\b2?(10|100|500)\b/g) || []).length >= 3);
      // 公差表範圍：由「Grade、≤、>500、±0.x」等指標字推出整個表格框
      const ind = doc.items.filter((it) => /Grade|等級|[≤≦≥≧]|^[<>]|^±\s*0?\.\d|^2(100|500)$/i.test(it.s));
      let tz = null;
      if (ind.length >= 3) { const h = Math.max(...ind.map((i) => i.h)); tz = { x0: Math.min(...ind.map((i) => i.x)) - h * 3, x1: Math.max(...ind.map((i) => i.x + estW(i))) + h * 3, y0: Math.min(...ind.map((i) => i.y)) - h * 3, y1: Math.max(...ind.map((i) => i.y)) + h * 3 }; }
      const inTolTable = (it) => (tz && it.x >= tz.x0 && it.x <= tz.x1 && it.y >= tz.y0 && it.y <= tz.y1) || tolRows.some((l) => Math.abs(l.y - it.y) < l.h * 1.2 && it.x >= l.x0 - l.h * 2 && it.x <= l.x1 + l.h * 2);
      for (const it of doc.items) {
        if (inTB(it) || inTolTable(it) || reserved.has(it.s) || Object.values(LABELS).some((re) => re.test(it.s))) continue;
        if (/[A-Z]{1,4}\d*-[A-Z0-9]|\d{5,}|^1\s*[\/:]\s*\d+$/i.test(it.s)) continue; // 圖號、料號、比例 1/10
        if (input.source === "ocr") { // OCR：逐詞檢查，只收乾淨的尺寸字串（如 600、Ø80 g6、120±0.01）
          for (const tok of it.s.split(/\s+(?![a-hA-H]\d\b|±)/)) {
            const m = tok.trim().match(/^([ØR]?)\s*(\d{1,4}(?:\.\d{1,3})?)(\s*±.*|\s*[a-hA-H]\d{1,2}.*|\s*[+\-]\s*0?\.\d.*)?$/);
            if (!m || !(+m[2] >= 1 && +m[2] <= 6000) || (it.conf ?? 90) < 60) continue;
            dims.push({ kind: m[1] === "Ø" ? "diameter" : m[1] === "R" ? "radius" : "linear", v: +m[2], text: tok, x: it.x, y: it.y, h: it.h, vertical: !!it.vertical, conf: it.conf ?? 90 });
          }
          continue;
        }
        if (!input.dims?.length && /[\u3400-\u9fff]/.test(it.line ? it.line.s : it.s)) continue; // 中文註記行裡的數字不是尺寸
        if (/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d+\s*:\s*\d+|HRC|Ra|M\d|PT|\b[A-Z]{2,}\d{3}/i.test(it.s) || /通|深|沉頭|孔|DP|THRU|倒角|\bC\d|UP|DOWN|處|M\d|PT/i.test(it.line ? it.line.s : it.s)) continue; // 註記內的數字不是外形尺寸
        for (const m of it.s.matchAll(/(\d+\s*[-xX×]\s*)?(Ø|R)?\s*(\d{1,4}(?:\.\d{1,3})?)(?![\d/°.]|\s*°)/g)) {
          if (m[1]) continue; // 4-Ø6 這類是孔，不當外形
          const v = +m[3]; if (!(v >= 1 && v <= 6000)) continue;
          dims.push({ kind: m[2] === "Ø" ? "diameter" : m[2] === "R" ? "radius" : "linear", v, text: m[0] + (/[a-hA-H]\d\b|±/.test(it.s) ? " " + it.s : ""), x: it.x, y: it.y, h: it.h, vertical: !!it.vertical, conf: it.conf ?? 90 });
        }
      }
    }
    const lin = [...new Set(dims.filter((d) => d.kind === "linear").map((d) => +d.v.toFixed(2)))].sort((a, b) => b - a);
    const dia = [...new Set(dims.filter((d) => d.kind === "diameter").map((d) => +d.v.toFixed(2)))].sort((a, b) => b - a);
    const dimConf = (input.dims || []).length ? "mid" : "low";
    const maxL = lin[0] || 0, maxD = dia[0] || 0;
    // 板厚以外的外形尺寸：取最大的三個不同值（且 ≥ 最大值 8%）
    let overall = lin.filter((v) => v >= maxL * 0.08).filter((v) => !(fields["板厚T"] && Math.abs(v - fields["板厚T"]) < 1e-6));
    // 掃描/照片：座標式（連鎖）尺寸辨識。同一欄（x 相近）≥4 個數字 = 量測垂直方向位置 → 最大值為寬；
    // 同一列（y 相近）≥4 個數字 = 量測水平方向位置。連鎖中的中間值（孔位）不當外形尺寸。
    let chainW = 0, thinCand = 0;
    const raster = !(input.dims || []).length;
    if (raster) {
      const pts = dims.filter((d) => d.kind === "linear" && d.x != null);
      const clusters = (key, other) => {
        const cs = [];
        for (const d of [...pts].sort((a, b) => a[key] - b[key])) {
          const c = cs.find((c) => Math.abs(c.c - d[key]) < d.h * 0.9); if (c) { c.m.push(d); c.c = (c.c * (c.m.length - 1) + d[key]) / c.m.length; } else cs.push({ c: d[key], m: [d] });
        }
        return cs.filter((c) => c.m.length >= 4 && (Math.max(...c.m.map((d) => d[other])) - Math.min(...c.m.map((d) => d[other]))) > c.m[0].h * 4);
      };
      const horiz = pts.filter((d) => !d.vertical);
      // 列：只有「數值隨位置單調變化」才是座標式連鎖（如板件上方 210/130/105/85/80）；
      // 不單調的一排直書數字是並列尺寸（如架構件 600/560/300），全部保留
      const monotonic = (c) => { const v = [...c.m].sort((a, b) => a.x - b.x).map((d) => d.v); let up = 0, dn = 0; for (let i = 1; i < v.length; i++) { if (v[i] > v[i - 1]) up++; else if (v[i] < v[i - 1]) dn++; } return Math.min(up, dn) <= 1; };
      const cols = ((all) => { const save = pts.splice(0, pts.length, ...horiz); const r = clusters("x", "y"); pts.splice(0, pts.length, ...save); return r; })(), rows = clusters("y", "x").filter(monotonic), inChain = new Set();
      cols.forEach((c) => c.m.forEach((d) => inChain.add(d)));
      rows.forEach((c) => c.m.forEach((d) => inChain.add(d)));
      if (cols.length) chainW = Math.max(...cols.map((c) => Math.max(...c.m.map((d) => d.v))));
      const free = pts.filter((d) => !inChain.has(d)).map((d) => d.v);
      const keep = [...free, ...rows.map((c) => Math.max(...c.m.map((d) => d.v)))];
      if (keep.length) {
        overall = [...new Set(keep.map((v) => +v.toFixed(2)))].sort((a, b) => b - a);
        if (chainW && chainW < overall[0]) overall = [overall[0], chainW, ...overall.slice(1).filter((v) => v !== chainW && v < chainW)];
        const big = Math.min(overall[0] || Infinity, overall[1] || Infinity);
        const isolated = (d) => !pts.some((o) => o !== d && Math.hypot(o.x - d.x, o.y - d.y) < d.h * 6);
        // 視圖範圍：連鎖尺寸與最大尺寸所在的外框（擴大 25%），範圍外的小數字（標題欄、公差表）不當板厚
        const core = pts.filter((d) => (inChain.has(d) || d.v >= big * 0.5) && d.conf >= 70);
        const zx0 = Math.min(...core.map((d) => d.x)), zx1 = Math.max(...core.map((d) => d.x)), zy0 = Math.min(...core.map((d) => d.y)), zy1 = Math.max(...core.map((d) => d.y));
        const inView = (d) => core.length >= 2 && d.x >= zx0 - (zx1 - zx0) * 0.25 && d.x <= zx1 + (zx1 - zx0) * 0.25 && d.y >= zy0 - (zy1 - zy0) * 0.25 && d.y <= zy1 + (zy1 - zy0) * 0.25;
        thinCand = pts.filter((d) => !inChain.has(d) && d.conf >= 85 && d.v < big / 4 && d.v >= 1 && isolated(d) && inView(d)).map((d) => d.v).sort((a, b) => a - b)[0] || 0;
        overall = overall.filter((v) => v >= (overall[0] || 0) * 0.08 || v === thinCand);
      }
    }

    // 5) 外形判斷
    let shape;
    const tVal = +fields["板厚T"] || 0;
    const section = /(\d+\s*[xX×]\s*\d+\s*[xX×]\s*\d+(\.\d+)?\s*t)|角鐵|方管|槽鐵|[HC]型鋼|扁鐵|圓管/.test(allWithDims);
    const big3 = overall.length >= 3 && Math.min(overall[0], overall[1], overall[2]) > 250;
    if ((fields["焊道長mm"] !== undefined && maxL > 300) || (section && maxL > 300) || (raster && big3 && !fields["板厚T"])) shape = "frame";
    else if (fields["折彎數"] || (tVal && tVal <= 6)) shape = "sheet";
    else if (maxD && maxD >= maxL * 0.25 && lin.length <= 8 + dia.length * 2 && (!overall[1] || maxD >= overall[1] * 0.8)) shape = "round";
    else if (tVal) shape = "plate";
    else if (raster && thinCand && thinCand <= 6 && !fields["焊道長mm"]) shape = "sheet";
    else if (raster && chainW && !thinCand) shape = "plate"; // 座標式標註的平面圖，多為板件；板厚請人工補
    else shape = (overall[2] && overall[2] < overall[1] * 0.25) || (raster && thinCand) ? "plate" : "block";
    set("外形", shape, "low", { round: "直徑標註為主", sheet: "板厚/折彎註記", frame: section ? "型鋼規格註記（角鐵/方管）" : fields["焊道長mm"] !== undefined ? "焊接註記 + 大尺寸" : "三向尺寸皆 > 250mm，判為架構/焊接件", plate: "厚度遠小於長寬", block: "三向尺寸相近" }[shape]);

    if (shape === "round") {
      set("外徑OD", maxD, dimConf, "最大直徑 Ø" + maxD);
      set("長L", overall[0] || "", dimConf, "最大長度 " + (overall[0] || "?"));
      const bore = dims.find((d) => d.kind === "diameter" && d.v < maxD * 0.9 && /H\d|內|孔|ID/i.test(d.text));
      const holeDias = new Set(holeEv.map((h) => +(h.match(/Ø\s*(\d+(?:\.\d+)?)/) || [])[1]));
      const inner = bore ? bore.v : dia.find((v) => v < maxD * 0.9 && v > maxD * 0.2 && !holeDias.has(v));
      if (inner) set("內徑ID", inner, "low", bore ? bore.text : "次大直徑（請確認是否為內孔）");
      const extM = tapEv.find((t) => { const m = t.match(/M\s*(\d+)/); return m && +m[1] >= maxD * 0.85; });
      if (extM) { set("外螺紋數", 1, "mid", extM); fields["攻牙數"] = Math.max(0, (fields["攻牙數"] || 1) - 1); }
      const gm = allText.match(/(?:退刀槽|溝槽|GROOVE)\s*(\d+)\s*(?:處|PLACES|個)?/i); const grooves = gm ? +gm[1] : (allText.match(/退刀槽|溝槽|GROOVE/gi) || []).length; if (grooves) set("退刀槽數", grooves, "low", "註記：退刀槽");
    } else {
      set("長L", overall[0] || "", dimConf, "最大長度 " + (overall[0] || "?"));
      set("寬W", overall[1] || "", dimConf, "次大長度 " + (overall[1] || "?"));
      if (shape === "block" || shape === "frame") set("高H", overall[2] || "", dimConf, "第三大長度 " + (overall[2] || "?"));
      if ((shape === "plate" || shape === "sheet") && !tVal && (thinCand || (!chainW && overall[2]))) set("板厚T", thinCand || overall[2], "low", thinCand ? "側視圖小尺寸當板厚" : "第三大尺寸當板厚");
      if ((shape === "plate" || shape === "sheet") && !fields["板厚T"]) { fields["板厚T"] = ""; conf["板厚T"] = "low"; ev["板厚T"] = "⚠ 未讀到板厚，請輸入（影響材料與加工估價）"; }
      if (chainW) { conf["寬W"] = "mid"; ev["寬W"] = `座標尺寸欄最大值 ${chainW}`; }
    }

    // 6) 孔數（註記優先；DXF 可用圓輔助）
    if (holes) set("孔數", holes, "mid", holeEv.slice(0, 6).join("、"));
    else if ((input.circles || []).length) {
      const size = shape === "round" ? maxD : Math.min(overall[0] || Infinity, overall[1] || Infinity);
      const small = input.circles.filter((c) => c.r * 2 < size * 0.3 && c.r > 0.5);
      // 同心圓（沉頭、螺牙）只算一次；多視圖重複以「同半徑最多出現的視圖」近似
      const uniq = []; for (const c of small) if (!uniq.some((u) => Math.hypot(u.x - c.x, u.y - c.y) < 0.2)) uniq.push(c);
      const n = Math.max(0, uniq.length - taps - pt);
      if (n) set("孔數", n, "low", `DXF 小圓 ${uniq.length} 個（扣除螺牙）`);
    }
    const faces = shape === "round" ? 2 : shape === "sheet" ? 1 : Math.min(6, 1 + (/側視|右視|左視|SIDE/i.test(allText) ? 2 : 1) + (/後視|底視|BOTTOM|BACK/i.test(allText) ? 1 : 0) + (pt || crossKw ? 1 : 0));
    set("加工面數", faces, "low", "依視圖與特徵推估");

    // 7) 備註：技術要求
    const notes = all.filter((l) => /(注意|備註|技術要求|NOTE|未註|去毛邊|倒角|清洗|洩漏|氣密|同心|平行|垂直|HRC)/i.test(l) && l.length < 60).slice(0, 4);
    if (notes.length) set("備註", notes.join("；"), "mid", "圖面註記");

    // 單位
    if (input.unitNote) ev["單位"] = input.unitNote;
    else if (input.units && input.units !== "mm" && input.units !== "未指定") ev["單位"] = `⚠ 圖檔單位為 ${input.units}，請換算為 mm`;

    const weights = { 圖號: 2, 零件名稱: 2, 材料: 3, 數量: 2, 外形: 1, 長L: 2, 寬W: 1, 外徑OD: 2, 表面處理: 1, 公差: 1 };
    let got = 0, tot = 0;
    for (const [k, w] of Object.entries(weights)) { if (k === "寬W" && shape === "round") continue; if (k === "外徑OD" && shape !== "round") continue; tot += w; got += w * ({ high: 1, mid: 0.7, low: 0.3 }[conf[k]] || 0); }
    return { fields, conf, evidence: ev, score: Math.round(got / tot * 100), lines: all };
  }

  /** DXF 解析結果 → 辨識器輸入（翻轉 y） */
  function fromDXF(dxf, fileName) {
    // 圖檔單位換算為 mm（inch ×25.4、cm ×10、m ×1000）；文字仍保留原樣
    const f = { 1: 25.4, 2: 304.8, 5: 10, 6: 1000 }[dxf.unitCode] || 1;
    const dims = dxf.dims.map((d) => (f === 1 || d.kind === "angle" ? d : { ...d, value: d.value * f, text: d.text + `（${dxf.units}→mm ×${f}）` }));
    return { source: "dxf", fileName, units: f === 1 ? dxf.units : "mm", unitNote: f === 1 ? "" : `圖檔單位 ${dxf.units}，尺寸已 ×${f} 換算為 mm`, items: dxf.texts.map((t) => ({ s: t.s, x: t.x, y: -t.y, h: t.h })), dims, circles: dxf.circles.map((c) => ({ ...c, r: c.r * f })) };
  }

  const API = { recognize, fromDXF, buildLines, matchMaterial, norm, fixOcr };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.DrawingParser = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
