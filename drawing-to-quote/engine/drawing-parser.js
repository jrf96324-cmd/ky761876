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
    qty: /^(數\s*量|QTY\.?|Q'TY|QUANTITY|件\s*數|個\s*\/\s*台|台\s*數|PIECES|PCS)(\s*(PIECES|PCS|QTY))?\s*[:：]?/i,
    surface: /^(表\s*面(\s*處)?(\s*理)?|表\s*處|FINISH|SURFACE(\s*TREATMENT)?|處\s*理)\s*[:：]?/i,
    heat: /^(熱\s*處(\s*理)?|HEAT\s*TREAT(MENT)?|硬\s*度|HARDNESS)\s*[:：]?/i,
    scale: /^(比\s*例|SCALE)\s*[:：]?/i,
    unit: /^(單\s*位|UNIT)\s*[:：]?/i,
  };

  const SHEET_MAT = /^(SPCC|SPCD|SPCE|SECC|SGCC|SGHC|SPHC|SPTE)$/; // 鈑金板材（冷軋、鍍鋅、熱軋酸洗、馬口鐵）
  // CAD 符號字型（GDT 類）在 PDF 文字層以控制字元包住：\u0001n\u0002＝Ø、\u0001#\u0002＝±、\u0001d\u0002＝°
  const SYM = { n: "Ø", N: "Ø", "#": "±", d: "°", "%": "°", c: "Ø" };
  const norm = (s) => String(s ?? "").replace(/\u0001(.)\u0002/g, (m, c) => SYM[c] ?? "")
    .replace(/[⌀∅φΦøФфϕ]/g, "Ø").replace(/%%[cC]/g, "Ø").replace(/(\d)\s+\.(\d)/g, "$1.$2").replace(/Ø\s+(\d)/g, "Ø$1")
    .replace(/[\u0000-\u001f\uE000-\uF8FF\uFFFD](?=\s*\d)/g, "Ø") // CAD 符號字型未對應 Unicode 時，數字前的亂碼多為 Ø
    .replace(/%%[pP]/g, "±").replace(/%%[dD]/g, "°")
    .replace(/[＋]/g, "+").replace(/[－—–]/g, "-").replace(/[：]/g, ":").replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/Ø\s*Ø/g, "Ø").replace(/\s+/g, " ").trim();

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
        // 詞段只合併「字高相近且緊鄰」的字（標題欄的大標籤與小字值不合併，如「圖名」與「BEC8…」）
        const simH = Math.min(cur ? cur.h : 0, p.h) / Math.max(cur ? cur.h : 1, p.h) > 0.7;
        if (cur && simH && p.x - cur.xe <= Math.min(cur.h, p.h) * 0.7 && Math.abs(p.y - cur.y) < Math.min(cur.h, p.h) * 0.5 && !cur.vertical === !p.vertical) { cur.s += glue(cur.s, p.s) + p.s; cur.xe = Math.max(cur.xe, p.x + estW(p)); cur.conf = Math.min(cur.conf, p.conf ?? 90); cur.titleBlock = cur.titleBlock || p.titleBlock; }
        else { cur = { s: p.s, x: p.x, y: p.y, h: p.h, xe: p.x + estW(p), line: l, conf: p.conf ?? 90, vertical: p.vertical, titleBlock: p.titleBlock, slanted: p.slanted }; segs.push(cur); }
      }
    });
    return { items: segs, lines };
  }

  /** 找標籤旁的值：同字串冒號後 → 右方最近 → 下方最近 */
  /** 圖號 / CAD NO：去掉「-」兩側空白，取含數字的代碼詞（避免讀成「圖」或只取前半段） */
  function pickCode(v) {
    const t = String(v).replace(/\s*([-_])\s*/g, "$1").split(/\s+/).filter(Boolean);
    return t.find((x) => /\d/.test(x) && /^[A-Z0-9][A-Z0-9\-_.\/]*$/i.test(x)) || t.find((x) => /^[A-Z0-9][A-Z0-9\-_.\/]+$/i.test(x)) || t[0] || "";
  }

  /**
   * 圖名欄（3 行）：第 1 行＝品名（零件名稱），第 2、3 行合併＝圖名說明（機種／組立名稱）
   */
  function nameBlock(doc) {
    const lab = doc.items.find((it) => /^(圖\s*名|品\s*名|零件名稱|名\s*稱|PART\s*NAME|TITLE)\s*[:：]?$/i.test(it.s.trim()) || /^(圖\s*名|品\s*名)/.test(it.s));
    if (!lab) return null;
    const h = lab.h || 3, x0 = lab.x + Math.max(estW(lab), h * 1.5) - h * 0.5;
    const isLabel = (s) => Object.values(LABELS).some((re) => re.test(s)) || /^(Title|Scale|Pieces|Material|DWG|比例|個\s*\/\s*台|材料)$/i.test(s.trim()) || /^[\d.\s:\/]+$/.test(s);
    const rest = lab.s.replace(/^(圖\s*名|品\s*名|零件名稱|名\s*稱|PART\s*NAME|TITLE)\s*[:：]?/i, "").trim();
    // 同欄：標籤右側、上下約 4 行高範圍內，x 與第一行對齊
    let cand = doc.items.filter((o) => o !== lab && o.x >= x0 && o.x < x0 + h * 30 && o.y >= lab.y - h * 1.3 && o.y <= lab.y + h * 4.2 && !isLabel(o.s) && !matchMaterial(o.s) && o.s.length <= 30);
    if (!cand.length && !rest) return null;
    const first = rest ? { s: rest, x: lab.x, y: lab.y, h } : cand.sort((a, b) => a.y - b.y || a.x - b.x)[0];
    cand = cand.filter((o) => Math.abs(o.x - first.x) < h * 12 || (o.x < first.x + h * 14 && o.x + estW(o) > first.x)); // 同一欄
    const lines = [];
    for (const o of cand.sort((a, b) => a.y - b.y || a.x - b.x)) { const l = lines.find((L) => Math.abs(L.y - o.y) < Math.max(L.h, o.h) * 0.6); if (l) l.s += (/[\u3400-\u9fff]$/.test(l.s) || /^[\u3400-\u9fff]/.test(o.s) ? "" : " ") + o.s; else lines.push({ y: o.y, h: o.h, s: o.s }); }
    if (rest) lines.unshift({ s: rest });
    const main = lines[0]?.s, extra = lines.slice(1, 3).map((l) => l.s).join(" ");
    return main ? { name: main, desc: extra, ev: `${lab.s} → ${lines.slice(0, 3).map((l) => l.s).join(" ｜ ")}` } : null;
  }

  function valueNear(doc, labelRe, accept = () => true) {
    for (const it of doc.items) {
      const m = it.s.match(labelRe);
      if (!m) continue;
      const rest = it.s.slice(m[0].length).replace(/^(DWG\.?\s*No\.?|Drawing\s*No\.?|Material|Mat'?l\.?|Pieces|PCS|Q'?ty|Scale|Title|Part\s*Name|Name|Unit|Surface(\s*Treatment)?|Finish|Heat\s*Treatment)\s*[:：]?/i, "").trim();
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
    if (/^(SP|SPC|鐵板)$/.test(up)) return "SPCC";             // 公司慣用「SP」＝冷軋鋼板
    if (/^SS41$|^SS-41$/.test(up)) return "SS400";
    if (/壓克力|ACRYLIC|PMMA/.test(up)) return "PMMA";
    if (/鐵氟龍|TEFLON|PTFE/.test(up)) return "PTFE";
    const keys = Object.keys(DB.materials).sort((a, b) => b.length - a.length);
    for (const k of keys) { const K = k.toUpperCase(); if (K.length <= 2 ? new RegExp(`(^|[^A-Z0-9])${K}([^A-Z0-9]|$)`).test(up) : up.includes(K)) return k; } // PP、PC、PU 需整詞
    // 資料庫別名（排除純數字別名，避免把日期、圖號裡的數字當材料）
    const al = Object.entries(DB.materialAlias || {}).filter(([a]) => !/^[\d\-#]+$/.test(a) && (/[\u3400-\u9fff]{2}/.test(a) || a.length >= 3)).sort((x, y) => y[0].length - x[0].length);
    for (const [a, k] of al) if (up.includes(a.toUpperCase())) return k;
    const extra = { "AL6061": "A6061", "AL-6061": "A6061", "6061-T6": "A6061", "AL5052": "A5052", "AL7075": "A7075", "SUS-304": "SUS304", "SUS-316": "SUS316",
      "SK-D11": "SKD11", "DC53": "SKD11", "SKD-11": "SKD11", "S45CH": "S45C", "S-45C": "S45C", "SCM-440": "SCM440", "黃銅": "C3604", "紅銅": "C1100", "鋁擠": "A6063", "塑鋼": "POM", "電木": "BAKELITE", "尼龍": "MC尼龍", "鐵板": "SS400", "冷軋": "SPCC", "電鍍鋅鋼板": "SECC" };
    for (const [a, k] of Object.entries(extra)) if (up.includes(a.toUpperCase())) return k;
    const m = up.match(/\b(A?[5-7]0[0-9]{2})\b/); if (m) { const k = "A" + m[1].replace(/^A/, ""); if (DB.materials[k]) return k; }
    return null;
  }
  const SURF_WORDS = [["硬陽極", "硬陽極"], ["硬陽", "硬陽極"], ["HARD ANOD", "硬陽極"], ["三價鉻", "三價鉻鍍鋅"], ["熱浸", "熱浸鍍鋅"], ["熱鍍鋅", "熱浸鍍鋅"], ["磷化", "磷化"], ["皮膜", "磷化"],
    ["電著", "電著塗裝"], ["PVD", "PVD"], ["鍍鈦", "PVD"], ["DLC", "DLC"], ["化學拋光", "化學拋光"], ["髮絲", "髮絲紋"], ["拉絲", "髮絲紋"], ["HAIRLINE", "髮絲紋"], ["鍍銀", "鍍銀"], ["鍍錫", "鍍錫"], ["鍍金", "鍍金"], ["酸洗", "酸洗"],
    ["硬質陽極", "硬陽極"], ["黑色陽極", "黑陽極"], ["黑陽極", "黑陽極"], ["陽極", "陽極"], ["ANODIZ", "陽極"], ["染黑", "染黑"], ["發黑", "染黑"], ["BLACK OXIDE", "染黑"],
    ["鍍鋅", "鍍鋅"], ["ZINC", "鍍鋅"], ["無電解鎳", "無電解鎳"], ["化學鎳", "無電解鎳"], ["ELECTROLESS", "無電解鎳"], ["鍍鎳", "鍍鎳"], ["鍍硬鉻", "鍍硬鉻"], ["硬鉻", "鍍硬鉻"], ["鍍鉻", "鍍硬鉻"],
    ["粉體", "粉體塗裝"], ["烤漆", "烤漆"], ["噴漆", "烤漆"], ["PAINT", "烤漆"], ["漆", "烤漆"], ["塗裝", "烤漆"], ["電解拋光", "電解拋光"], ["鈍化", "鈍化"], ["鐵氟龍", "鐵氟龍"], ["TEFLON", "鐵氟龍"], ["噴砂", "噴砂"]];
  const HEAT_WORDS = [["QPQ", "鹽浴氮化"], ["鹽浴", "鹽浴氮化"], ["固溶", "固溶時效"], ["時效", "固溶時效"], ["深冷", "深冷"], ["火焰", "火焰淬火"], ["正常化", "正常化"], ["焼準", "正常化"], ["真空熱處理", "真空熱處理"], ["真空淬火", "真空熱處理"], ["高周波", "高周波"], ["高頻", "高周波"], ["滲碳", "滲碳"], ["軟氮化", "氮化"], ["氮化", "氮化"], ["調質", "調質"], ["淬火", "淬火回火"], ["QUENCH", "淬火回火"], ["退火", "退火"]];
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

  /**
   * CAD 線字（SHX）的「°」常不輸出成文字，只畫成數字後方的一個小圓圈（6～12 段短線）。
   * 找到後在該數字後補「°」，角度（60°、45°）就不會被當成長度。
   */
  /**
   * 孔數前綴與後面的 Ø 分成兩段字（「2-」＋「Ø6」，斜向引線上也常見）→ 依文字方向接回「2-Ø6」，
   * 孔數、牙數才算得到，「2」也不會被當成尺寸
   */
  function joinCountPrefix(items) {
    const its = items.map((i) => ({ ...i }));
    for (const a of its) {
      const sa = norm(a.s);
      if (a._drop || !/^\d{1,3}\s*[-xX×]\s*Ø?$/.test(sa)) continue;
      const w = estW({ s: sa, h: a.h });
      const ang = a.vertical ? 90 : (a.slanted || 0);
      const ends = [1, -1].map((sg) => ({ x: a.x + w * Math.cos(ang * Math.PI / 180), y: a.y - sg * w * Math.sin(ang * Math.PI / 180) }));
      const b = its.filter((o) => o !== a && !o._drop && !!o.vertical === !!a.vertical && Math.abs((o.slanted || 0) - (a.slanted || 0)) < 3 && /^\s*\(?\s*[Ø\d]/.test(norm(o.s)))
        .map((o) => ({ o, d: Math.min(...ends.map((e) => Math.hypot(o.x - e.x, o.y - e.y))) })).filter((c) => c.d < a.h * 1.3).sort((p, q) => p.d - q.d)[0];
      if (b) { a.s = sa.replace(/Ø$/, "") + norm(b.o.s); b.o._drop = true; }
    }
    // 「2-M 通」＋另一段「5」：螺牙徑被輸出成獨立一段字，位置正好在「M」之後 → 插回「2-M5 通」
    for (const a of its) {
      if (a._drop) continue;
      const sa = norm(a.s), m = sa.match(/^(.*?M)\s*(?![\d.])/);
      if (!m || !/^\d{1,3}\s*[-xX×]\s*M$|^M$/.test(m[1].trim())) continue;
      const w = estW({ s: m[1], h: a.h }), ang = a.vertical ? 90 : (a.slanted || 0);
      const ends = [1, -1].map((sg) => ({ x: a.x + w * Math.cos(ang * Math.PI / 180), y: a.y + sg * w * Math.sin(ang * Math.PI / 180) }));
      const b = its.filter((o) => o !== a && !o._drop && /^\d{1,2}(\.\d)?$/.test(norm(o.s)) && Math.abs((o.slanted || 0) - (a.slanted || 0)) < 3 && !!o.vertical === !!a.vertical)
        .map((o) => ({ o, d: Math.min(...ends.map((e) => Math.hypot(o.x - e.x, o.y - e.y))) })).filter((c) => c.d < a.h * 1.0).sort((p, q) => p.d - q.d)[0];
      if (b) { a.s = m[1] + norm(b.o.s) + " " + sa.slice(m[0].length); b.o._drop = true; }
    }
    return its.filter((i) => !i._drop);
  }

  function markDegrees(items, geom) {
    const segs = geom.lines.filter((l) => Math.hypot(l[2] - l[0], l[3] - l[1]) < 4);
    if (!segs.length) return items;
    return items.map((it) => {
      if (!/^\d{1,3}(\.\d+)?$/.test(String(it.s).trim()) || !it.h) return it;
      const h = it.h, w = String(it.s).trim().length * 0.62 * h;
      // 字尾後方、字身上半部（直書：往上讀，字尾在 y 較小處、字頂在 x 較小處）
      const c = it.vertical ? { x: it.x - h * 0.75, y: it.y - w - h * 0.15 } : { x: it.x + w + h * 0.15, y: it.y - h * 0.75 };
      const R = h * 0.6;
      const near = segs.filter((l) => Math.hypot(l[0] - c.x, l[1] - c.y) < R * 1.6 && Math.hypot(l[2] - c.x, l[3] - c.y) < R * 1.6);
      if (near.length < 6) return it;
      // 依端點相接分成各個筆畫群，逐群檢查是否為封閉小圓（數字本身的筆畫與圓圈分開判斷）
      const par = near.map((_, k) => k), find = (k) => (par[k] === k ? k : (par[k] = find(par[k])));
      const touch = (a, b) => [[a[0], a[1]], [a[2], a[3]]].some(([x, y]) => [[b[0], b[1]], [b[2], b[3]]].some(([u, v]) => Math.hypot(x - u, y - v) < 0.25));
      for (let a = 0; a < near.length; a++) for (let b = a + 1; b < near.length; b++) if (touch(near[a], near[b])) par[find(a)] = find(b);
      const comps = {}; near.forEach((l, k) => (comps[find(k)] = comps[find(k)] || []).push(l));
      const key = (x, y) => `${Math.round(x * 4)},${Math.round(y * 4)}`;
      for (const g of Object.values(comps)) {
        if (g.length < 6) continue;
        const xs = g.flatMap((l) => [l[0], l[2]]), ys = g.flatMap((l) => [l[1], l[3]]);
        const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys), cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
        const cnt = {}; g.forEach((l) => { cnt[key(l[0], l[1])] = (cnt[key(l[0], l[1])] || 0) + 1; cnt[key(l[2], l[3])] = (cnt[key(l[2], l[3])] || 0) + 1; });
        const closed = Object.values(cnt).every((n) => n >= 2); // 封閉小圓：每個端點都與另一段相接
        if (closed && Math.hypot(cx - c.x, cy - c.y) < R && bw >= h * 0.12 && bw <= h * 0.45 && bh >= h * 0.12 && bh <= h * 0.45 && Math.abs(bw - bh) <= Math.max(bw, bh) * 0.45) return { ...it, s: String(it.s).trim() + "°", degree: true };
      }
      return it;
    });
  }

  function recognize(input) {
    if (input.source === "pdf" && (input.items || []).some((i) => /^\s*[⌀∅ØøΦφ]\s*$/.test(i.s))) {
      // CAD 匯出的 Ø 常是獨立一段字，放在數字前方（同方向、相距 < 1.5 字高）→ 併入該數字
      const its = input.items.map((i) => ({ ...i })), lone = its.filter((i) => /^\s*[⌀∅ØøΦφ]\s*$/.test(i.s));
      for (const o of lone) {
        const t = its.filter((i) => i !== o && !i._used && /^\s*\(?\s*[⌀∅ØøΦφ]?\s*\d/.test(i.s) && !!i.vertical === !!o.vertical && (i.slanted == null) === (o.slanted == null) && Math.hypot(i.x - o.x, i.y - o.y) < o.h * 1.8)
          .sort((a, b) => Math.hypot(a.x - o.x, a.y - o.y) - Math.hypot(b.x - o.x, b.y - o.y))[0];
        if (t && !/[⌀∅ØøΦφ]/.test(t.s)) { t.s = t.s.replace(/^(\s*\(?)/, "$1Ø"); o._used = true; } else if (t) o._used = true;
      }
      input = { ...input, items: its.filter((i) => !i._used || !/^\s*[⌀∅ØøΦφ]\s*$/.test(i.s)) };
    }
    if (input.source === "pdf") input = { ...input, items: joinCountPrefix(input.items || []) };
    if (input.source === "pdf" && input.geom && (input.geom.lines || []).length) input = { ...input, items: markDegrees(input.items || [], input.geom) };
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
    if (dno && /\d/.test(pickCode(dno.v))) set("圖號", pickCode(dno.v), "high", dno.ev);
    else {
      const m = allText.replace(/\s*-\s*/g, "-").match(/\b\d{5,8}-[A-Z]{0,2}\d{1,3}\b/) || allText.match(/\b[A-Z]{1,4}\d{2,6}-[A-Z0-9]{1,6}(-[A-Z0-9]{1,4})?\b/);
      if (m) set("圖號", m[0], "mid", "圖號樣式 " + m[0]); else if (stem) set("圖號", stem, "low", "取自檔名");
    }
    const cad = valueNear(doc, LABELS.cadNo, (v) => /[A-Z0-9]/i.test(v) && v.length <= 30);
    if (cad) set("CAD NO", pickCode(cad.v), "high", cad.ev);
    else { const m = allText.match(/\bS\d{3}-[A-Z]\d{1,3}\b/); if (m) set("CAD NO", m[0], "mid", m[0]); }

    const nb = nameBlock(doc);
    const nm = nb ? null : valueNear(doc, LABELS.name, (v) => v.length <= 24 && !/^\d+([.,]\d+)?$/.test(v) && !matchMaterial(v));
    if (nb) { set("零件名稱", nb.name, "high", nb.ev); if (nb.desc) set("圖名說明", nb.desc, "high", "圖名欄第 2、3 行"); }
    else if (nm) set("零件名稱", nm.v, "high", nm.ev);
    else { const m = allText.match(/(滾輪|軸|環|塊|板|座|架|蓋|套|桿|銷|支架|治具|底座|墊片|夾爪|導軌|齒輪|皮帶輪|法蘭|接頭)/); if (m) { const ln = all.find((l) => l.includes(m[0]) && l.length <= 16); if (ln) set("零件名稱", ln, "low", "關鍵字 " + m[0]); } }

    const mat = valueNear(doc, LABELS.material, (v) => !!matchMaterial(v));
    if (mat) set("材料", matchMaterial(mat.v), "high", mat.ev);
    else { for (const l of all) { const k = matchMaterial(l); if (k) { set("材料", k, "mid", l); break; } } }

    const q = valueNear(doc, LABELS.qty, (v) => /^\d{1,4}(\s*[+xX×*]\s*\d{1,4})*\s*(PCS|件|個|SET|組)?$/i.test(norm(v).trim()));
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
    // 內直角／清角：只認要求「保留銳角、清角」的註記；「未標示銳角皆以 C1 去除」是去毛邊倒角，不算
    const cornerLines = all.filter((l) => /(清角|內直角|銳角|R\s*0(?![.\d]))/.test(l) && !/(去除|倒角|倒圓|C\s*\d|去毛邊|R\s*0\.\d)/.test(l));
    if (cornerLines.length) set("內直角數", cornerLines.length, "low", "註記：" + cornerLines.slice(0, 2).join("、"));
    if (/(焊接|滿焊|點焊|WELD)/i.test(allText)) { const m = allText.match(/焊道\s*(\d+)/); set("焊道長mm", m ? +m[1] : "", m ? "mid" : "low", "註記：焊接"); }
    if (/(展開|折彎|BEND|鈑金)/i.test(allText) && !bends) bends = (allText.match(/折彎線|BEND LINE/gi) || []).length || 1;
    if (bends) set("折彎數", bends, "low", "註記：折彎/UP/DOWN");
    // 板厚只認明確寫法：板厚 3、厚度 3、t=3、T=3、t3.0（t 緊接數字）；不認「t 1」這類鬆散字串
    const tm = allText.match(/(?:板厚|厚度|\bt\s*=|\bT\s*=)\s*(\d+(?:\.\d+)?)/i) || (input.source !== "ocr" && allText.match(/(?:^|[\s(（,，])t(\d+(?:\.\d+)?)(?:\s*mm)?(?=$|[\s)），,])/m));
    if (tm) set("板厚T", +tm[1], "mid", tm[0]);

    // 3) 公差與粗糙度
    let tolBand = Infinity; const tolEv = []; const holeTolVals = new Set(), shaftTolVals = new Set(), holeTolCnt = {};
    // 疊式公差：尺寸右側上下兩個小字（+0.025 / 0、-0.01 / -0.03）
    const DEV = /^([+\-±]?\s*0?\.\d+|0)(\s+([+\-]\s*0?\.\d+|0))?$/; // 單一偏差，或上下兩偏差被併成一段（直書「0 -0.02」）
    for (const num of doc.items) {
      if (!/\d/.test(num.s) || DEV.test(num.s)) continue;
      const nx1 = num.x + estW(num);
      const ny1 = num.y - estW(num); // 直書（由下往上讀）：字尾在上方
      const sl = num.slanted != null && Math.abs(num.slanted) > 3 ? num.slanted * Math.PI / 180 : null, nw = estW(num);
      const devs = doc.items.filter((d) => d !== num && DEV.test(d.s) && d.h < num.h * 0.85 && (num.vertical
        ? d.vertical && d.y <= ny1 + num.h * 0.6 && d.y >= ny1 - num.h * 2.5 && Math.abs(d.x - num.x) <= num.h * 1.2
        : sl != null // 斜向引線上的尺寸：換到文字座標（u 沿字、v 垂直字）判斷右上／右下
          ? d.slanted != null && Math.abs(d.slanted * Math.PI / 180 - sl) < 0.06 && (() => { const dx = d.x - num.x, dy = d.y - num.y, du = dx * Math.cos(sl) + dy * Math.sin(sl), dv = dx * Math.sin(sl) - dy * Math.cos(sl); return du >= nw - num.h * 0.6 && du <= nw + num.h * 2.5 && Math.abs(dv) <= num.h * 1.2; })()
          : !d.vertical && d.slanted == null && d.x >= nx1 - num.h * 0.6 && d.x <= nx1 + num.h * 2.5 && Math.abs(d.y - num.y) <= num.h * 1.2));
      if (!devs.length) continue;
      const vals = devs.flatMap((d) => d.s.replace(/([+\-±])\s+/g, "$1").split(/\s+/)).map((x) => +x.replace(/±/g, "")).filter(Number.isFinite);
      const band = devs.some((d) => /^±/.test(d.s)) ? 2 * Math.max(...vals.map(Math.abs)) : vals.length >= 2 ? Math.max(...vals) - Math.min(...vals) : Math.abs(vals[0]);
      if (band > 0) {
        tolBand = Math.min(tolBand, band); tolEv.push(`${num.s} ${devs.sort((a, b) => a.y - b.y).map((d) => d.s).join("/")}`);
        const nv = num.s.match(/Ø\s*(\d+(?:\.\d+)?)/); if (nv && Math.min(...vals) >= 0) { holeTolVals.add(+nv[1]); holeTolCnt[+nv[1]] = Math.max(holeTolCnt[+nv[1]] || 0, +(num.s.match(/^(\d+)\s*-/) || [])[1] || 1); } // +x/0 → 孔公差（內徑／精度孔）
        if (nv && Math.max(...vals) <= 0) shaftTolVals.add(+nv[1]); // 0/-x → 軸公差（外徑段）
      }
    }
    for (const m of allWithDims.matchAll(/±\s*(0\.\d+)/g)) { tolBand = Math.min(tolBand, 2 * +m[1]); tolEv.push(m[0]); }
    for (const m of allWithDims.matchAll(/\+\s*(0\.\d+)\s*\/?\s*-\s*(0\.\d+)/g)) { tolBand = Math.min(tolBand, +m[1] + +m[2]); tolEv.push(m[0]); }
    for (const m of allWithDims.matchAll(/(?:(\d+)\s*-\s*)?Ø\s*(\d+(?:\.\d+)?)\s*H([6-9])(?![\d])/g)) holeTolCnt[+m[2]] = Math.max(holeTolCnt[+m[2]] || 0, +(m[1] || 1)); // Ø10H7 配合孔
    for (const m of allWithDims.matchAll(/(?:^|(?<=[^A-Za-z\-]))(js|[HGFJKNPhgfjkmnp])([5-9])(?![\dxX×.])/gm)) { // 配合公差 H7、g6、35k6（排除 8-M5 這類螺牙）
      const it = +m[2]; tolBand = Math.min(tolBand, it <= 6 ? 0.01 : it === 7 ? 0.025 : 0.05); tolEv.push(m[0]); }
    const generalTol = allText.match(/(未註公差|一般公差|未標註公差)[^\n]*?±\s*(0\.\d+)/);
    if (generalTol) tolEv.unshift(generalTol[0]);
    if (tolEv.length) set("公差", tolBand <= 0.02 ? "嚴" : tolBand <= 0.1 ? "中等" : "一般", "mid", tolEv.slice(0, 5).join("、"));
    else set("公差", "一般", "low", "未見公差標註");

    let ra = Infinity; const raEv = [];
    // 粗糙度圖例（標題欄上方一排 ▽ 符號＋Ra 值）是說明，不代表實際加工面：同一列 ≥3 個 Ra 視為圖例排除
    const raItems = doc.items.filter((it) => /R[az]\s*\d/i.test(it.s));
    const legend = new Set(raItems.filter((it) => raItems.filter((o) => Math.abs(o.y - it.y) < it.h * 0.8).length >= 3 || (it.s.match(/R[az]\s*\d/gi) || []).length >= 3));
    const raText = [...raItems.filter((it) => !legend.has(it)).map((it) => it.s), ...(input.dims || []).map((d) => norm(d.text))].join("\n");
    for (const m of raText.matchAll(/R([az])\s*(\d+(?:\.\d+)?)/gi)) { const v = /z/i.test(m[1]) ? +m[2] / 4 : +m[2]; ra = Math.min(ra, v); raEv.push(m[0] + (/z/i.test(m[1]) ? `（≈Ra${+(v.toFixed(1))}）` : "")); } // Rz ≈ 4×Ra
    if (legend.size) raEv.push(`（已排除圖例 ${legend.size} 個）`);
    const tri = allWithDims.match(/▽+/g); if (tri) { const n = Math.max(...tri.map((t) => t.length)); ra = Math.min(ra, [25, 12.5, 6.3, 1.6, 0.4][n] ?? 0.4); raEv.push("▽".repeat(n)); }
    if (Number.isFinite(ra)) { const opts = [0.4, 0.8, 1.6, 3.2, 6.3]; const pick = opts.find((o) => ra <= o + 1e-9) ?? 6.3; set("粗糙度", "Ra" + pick, "mid", raEv.slice(0, 4).join("、")); }
    else set("粗糙度", "Ra3.2", "low", "未標示，預設 Ra3.2");

    // 4) 尺寸
    const dims = [];
    for (const d of input.dims || []) if (Number.isFinite(d.value) && d.value > 0) dims.push({ kind: d.kind, v: d.value, text: norm(d.text) });
    if (!dims.length) { // PDF / OCR：從文字推斷尺寸
      const reserved = new Set([fields["圖號"], fields["CAD NO"], fields["數量"]].filter(Boolean).map(String));
      // 標題欄範圍（由標籤位置推得）內的數字一律不當尺寸
      // 只取最大的一群相鄰標籤（標題欄本身）；圖面註記「表面塗裝…」之類的單一標籤字不可把範圍撐大
      const labs0 = doc.items.filter((it) => Object.values(LABELS).some((re) => re.test(it.s)));
      const lg = []; for (const it of labs0) { const g = lg.find((G) => G.some((o) => Math.hypot(o.x - it.x, o.y - it.y) < Math.max(o.h, it.h) * 10)); if (g) g.push(it); else lg.push([it]); }
      const labs = lg.sort((a, b) => b.length - a.length)[0] || [];
      let tb = null;
      if (labs.length >= 2) {
        const h = Math.max(...labs.map((l) => l.h));
        tb = { x0: Math.min(...labs.map((l) => l.x)) - h, y0: Math.min(...labs.map((l) => l.y - l.h * 1.6)), y1: Math.max(...labs.map((l) => l.y)) + h * 2.5 };
      }
      const inTB = (it) => it.titleBlock || (tb && it.x >= tb.x0 && it.y >= tb.y0 && it.y <= tb.y1);
      // 一般公差表（≤10 ≤100 ≤500 >500 / ±0.1 …）整區排除
      const tolRows = doc.lines.filter((l) => /Grade|等級|[≤≦<>≥≧]\s*\d|±\s*0?\.\d.*±\s*0?\.\d/i.test(l.s) || (l.s.match(/\b2?(10|100|500)\b/g) || []).length >= 3);
      // 公差表範圍：由「Grade、≤、>500、±0.x」等指標字推出整個表格框
      const ind = doc.items.filter((it) => /Grade|等級|[≤≦≥≧]|^[<>]|^±\s*0?\.\d|^2(100|500)$/i.test(it.s));
      let tz = null;
      // 只取最大的一群緊鄰指標字（公差表本身）；圖中零星的「68 ±0.05」不會把範圍撐大
      const groups = [];
      for (const it of ind) { const g = groups.find((G) => G.some((o) => Math.hypot(o.x - it.x, o.y - it.y) < Math.max(o.h, it.h) * 12)); if (g) g.push(it); else groups.push([it]); }
      const tg = groups.sort((a, b) => b.length - a.length)[0] || [];
      if (tg.length >= 3) { const h = Math.max(...tg.map((i) => i.h)); tz = { x0: Math.min(...tg.map((i) => i.x)) - h * 3, x1: Math.max(...tg.map((i) => i.x + estW(i))) + h * 3, y0: Math.min(...tg.map((i) => i.y)) - h * 3, y1: Math.max(...tg.map((i) => i.y)) + h * 3 }; }
      const bareDec = doc.items.filter((it) => /^[±]?\s*\d?\.\d+$/.test(it.s.trim()) && +it.s.replace(/[±\s]/g, "") < 2);
      const decRow = (it) => bareDec.includes(it) && bareDec.filter((o) => o !== it && Math.abs(o.y - it.y) < it.h * 0.6 && Math.abs(o.x - it.x) < it.h * 12).length >= 2; // 一列 ≥3 個小數（一般公差表 ±0.1 ±0.15…，± 以線條繪製）
      const inTolTable = (it) => decRow(it) || (tz && it.x >= tz.x0 && it.x <= tz.x1 && it.y >= tz.y0 && it.y <= tz.y1) || tolRows.some((l) => Math.abs(l.y - it.y) < l.h * 1.2 && it.x >= l.x0 - l.h * 2 && it.x <= l.x1 + l.h * 2);
      for (const it of doc.items) {
        // 圖號／數量等標題欄值：只在標題欄附近排除（圖中的板厚「2」可能剛好等於數量 2）
        const nearTB = !tb || (it.x >= tb.x0 - 60 && it.y >= tb.y0 - 60);
        if (inTB(it) || inTolTable(it) || (reserved.has(it.s) && nearTB) || Object.values(LABELS).some((re) => re.test(it.s))) continue;
        if (/[A-Z]{1,4}\d*-[A-Z0-9]|\d{5,}|^1\s*[\/:]\s*\d+$/i.test(it.s)) continue; // 圖號、料號、比例 1/10
        // 孔／沉頭／牙標註（2-Ø3.4xØ6x2.5L、Ø6 深 5、4-M5）裡的直徑是孔特徵，不是外形
        if (/^\d{1,2}\s*-\s*[ØMR]|[xX×]\s*Ø|\d(\.\d+)?\s*L$|沉頭|深|通|THRU|DP|C'?BORE|錐孔/i.test(it.s)) continue;
        if (/^\d+\s*-\s*R|^R\s*\d/i.test(it.s)) continue; // 圓角 R、2-R0.2
        if (/^\d{1,3}\s*[-xX×]\s*[ØM]?$/.test(it.s.trim())) continue; // 「2-」「3-」是孔數前綴（後面的 Ø30 為另一段字）
        if (input.source === "ocr") { // OCR：逐詞檢查，只收乾淨的尺寸字串（如 600、Ø80 g6、120±0.01）
          for (const tok of it.s.split(/\s+(?![a-hA-H]\d\b|±)/)) {
            const m = tok.trim().match(/^([ØR]?)\s*(\d{1,4}(?:\.\d{1,3})?)(\s*±.*|\s*[a-hA-H]\d{1,2}.*|\s*[+\-]\s*0?\.\d.*)?$/);
            if (!m || !(+m[2] <= 6000 && (+m[2] >= 1 || (+m[2] >= 0.1 && /^0?\.\d{1,2}$/.test(tok.trim())))) || (it.conf ?? 90) < 60) continue;
            dims.push({ kind: m[1] === "Ø" ? "diameter" : m[1] === "R" ? "radius" : "linear", v: +m[2], text: tok, x: it.x, y: it.y, h: it.h, vertical: !!it.vertical, conf: it.conf ?? 90 });
          }
          continue;
        }
        if (!input.dims?.length && /[\u3400-\u9fff]/.test(it.line ? it.line.s : it.s)) continue; // 中文註記行裡的數字不是尺寸
        if (/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d+\s*:\s*\d+|HRC|R[az]\s*\d|M\d|PT|\b[A-Z]{2,}\d{3}/i.test(it.s) || /通|深|沉頭|孔|DP|THRU|倒角|\bC\d|UP|DOWN|處|M\d|PT/i.test(it.line ? it.line.s : it.s)) continue; // 註記內的數字不是外形尺寸
        // 英吋管徑（3/4"、1-1/2"）不是 mm 尺寸
        for (const m of it.s.replace(/(\d+\s*-\s*)?\d+\s*\/\s*\d+\s*("|”|″|吋|英吋|inch|B)?/gi, " ").matchAll(/(\d+\s*[-xX×]\s*)?(Ø|R)?\s*(\d{1,4}(?:\.\d{1,3})?)(?![\d/°.]|\s*°)/g)) {
          if (m[1]) continue; // 4-Ø6 這類是孔，不當外形
          const v = +m[3];
          // < 1 mm 只收「單獨一個小數」的標註（薄片板厚 0.5、0.8）；±0.05、C0.5、R0.2、Ra0.8 都已排除
          if (!(v <= 6000 && (v >= 1 || (v >= 0.1 && /^0?\.\d{1,2}$|^0\.\d{1,2}$/.test(it.s.trim()))))) continue;
          dims.push({ kind: m[2] === "Ø" ? "diameter" : m[2] === "R" ? "radius" : "linear", v, text: m[0] + (/[a-hA-H]\d\b|±/.test(it.s) ? " " + it.s : ""), x: it.x, y: it.y, h: it.h, vertical: !!it.vertical, conf: it.conf ?? 90, slanted: it.slanted != null && Math.abs(it.slanted) > 3 && Math.abs(Math.abs(it.slanted) - 90) > 3 });
        }
      }
      // 座標式（基準 0）尺寸：與「0」同欄（橫書、對齊左端或右端）或同列（直書、對齊頭或尾）的一串數字是位置，
      // 只有最大值是外形；其餘標 ordPos，不當外形、不當外形量測的對齊值
      const zeros = doc.items.filter((it) => it.s.trim() === "0" && !inTB(it) && !inTolTable(it));
      const medH = dims.length ? [...dims.map((d) => d.h)].sort((a, b) => a - b)[dims.length >> 1] : 0;
      for (const z of zeros) {
        if (z.h < medH * 0.8) continue; // 疊式公差的「0」字較小
        const zw = estW(z);
        // 對齊方式（頭對齊或尾對齊）擇一：取成員較多者，避免把相鄰另一串座標尺寸併進來
        const same = dims.filter((d) => d.kind === "linear" && d.x != null && !d.slanted && !!d.vertical === !!z.vertical);
        const tail = (d) => d.text.trim().length * 0.62 * d.h;
        const headM = same.filter((d) => (z.vertical ? Math.abs(d.y - z.y) : Math.abs(d.x - z.x)) < z.h * 0.8);
        const tailM = same.filter((d) => (z.vertical ? Math.abs((d.y - tail(d)) - (z.y - zw)) : Math.abs((d.x + tail(d)) - (z.x + zw))) < z.h * 0.8);
        const mem = tailM.length > headM.length ? tailM : headM;
        const spread = z.vertical ? Math.max(...mem.map((d) => d.x)) - Math.min(...mem.map((d) => d.x)) : Math.max(...mem.map((d) => d.y)) - Math.min(...mem.map((d) => d.y));
        if (mem.length < 2 || spread < z.h * 2) continue;
        const mx = Math.max(...mem.map((d) => d.v));
        mem.forEach((d) => { if (d.v < mx) d.ordPos = true; else d.ordMax = true; });
      }
    }
    // 軸類判斷（Ø 符號未被讀成文字時）：長件 + 多個遠小於全長的直書尺寸，或帶軸用配合公差（k6、h6、g6…）
    // → 這些尺寸其實是直徑
    let shaftEv = "";
    if (!dims.some((d) => d.kind === "diameter") && !SHEET_MAT.test(fields["材料"] || "")) { // 鈑金材不會是車削軸
      const lv = dims.filter((d) => d.kind === "linear" && !d.ordPos && !d.slanted), Lmax = Math.max(0, ...lv.map((d) => d.v));
      const FIT = /\d\s*([a-hj-np-z]{1,2}\d{1,2}|js\d{1,2})(?![\w.])/;
      const fitD = lv.filter((d) => FIT.test(d.text) && d.v < Lmax * 0.5);
      const vert = lv.filter((d) => d.vertical && d.v < Lmax * 0.35 && d.v >= 3);
      const cand = [...new Set([...fitD, ...vert])];
      const runout = /[↗⌰◎⊚]|同心|偏擺|圓周|振れ/.test(allWithDims);
      if (Lmax > 0 && cand.length >= 2 && (fitD.length >= 1 || vert.length >= 3 || runout)) {
        cand.forEach((d) => { d.kind = "diameter"; });
        shaftEv = `直書／配合公差尺寸視為直徑：Ø${[...new Set(cand.map((d) => d.v))].sort((a, b) => b - a).join("、Ø")}`;
      }
    }
    const lin = [...new Set(dims.filter((d) => d.kind === "linear" && !d.slanted && !d.ordPos).map((d) => +d.v.toFixed(2)))].sort((a, b) => b - a);
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
      const pts = dims.filter((d) => d.kind === "linear" && d.x != null && !d.slanted);
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

    // 三視圖正交取尺寸：長＝主視圖最大水平尺寸、高＝主視圖最大直書尺寸、第三向＝其他視圖的最大尺寸
    // （與前兩者同列／同欄的尺寸是連鎖或分段，不當外形）
    let orthoEv = "", orthoC3 = 0;
    if (!chainW && !shaftEv) {
      const pts = dims.filter((d) => d.kind === "linear" && d.x != null && d.v >= 0.1 && !d.slanted && !d.ordPos);
      const H0 = pts.filter((d) => !d.vertical), V0 = pts.filter((d) => d.vertical);
      if (H0.length && V0.length && pts.length >= 3) {
        const clusterOf = (arr) => { const cl = []; for (const d of arr) { const hit = cl.filter((c) => c.some((o) => Math.hypot(o.x - d.x, o.y - d.y) < 10 * Math.max(o.h, d.h))); if (!hit.length) cl.push([d]); else { hit[0].push(d); for (const o of hit.slice(1)) { hit[0].push(...o); cl.splice(cl.indexOf(o), 1); } } } return cl; };
        const mx = (c) => Math.max(...c.map((d) => d.v)), rng = (c, k) => [Math.min(...c.map((d) => d[k])), Math.max(...c.map((d) => d[k]))];
        const HC = clusterOf(H0).sort((a, b) => mx(b) - mx(a)), VC = clusterOf(V0).sort((a, b) => mx(b) - mx(a));
        const hc = HC[0], vc = VC[0], a = mx(hc), b = mx(vc), hh = Math.max(...pts.map((d) => d.h));
        // 向量 PDF：以尺寸數字下方（直書為右方）的尺度線長度當作該視圖的範圍，比文字位置更準
        const GL = (input.geom && input.geom.lines) || [];
        const span = (d) => {
          const w = d.text.trim().length * 0.62 * d.h;
          if (!d.vertical) { const cx = d.x + w / 2; const c = GL.filter((l) => Math.abs(l[1] - l[3]) < 0.5 && l[1] >= d.y - d.h * 0.3 && l[1] <= d.y + d.h * 0.9 && Math.min(l[0], l[2]) <= cx && Math.max(l[0], l[2]) >= cx && Math.abs(l[2] - l[0]) >= w).sort((p, q) => Math.abs(p[2] - p[0]) - Math.abs(q[2] - q[0]))[0]; return c ? [Math.min(c[0], c[2]), Math.max(c[0], c[2])] : [d.x, d.x]; }
          const cy = d.y - w / 2; const c = GL.filter((l) => Math.abs(l[0] - l[2]) < 0.5 && l[0] >= d.x - d.h * 0.3 && l[0] <= d.x + d.h * 0.9 && Math.min(l[1], l[3]) <= cy && Math.max(l[1], l[3]) >= cy && Math.abs(l[3] - l[1]) >= w).sort((p, q) => Math.abs(p[3] - p[1]) - Math.abs(q[3] - q[1]))[0];
          return c ? [Math.min(c[1], c[3]), Math.max(c[1], c[3])] : [d.y, d.y];
        };
        const spanOf = (c) => { const sp = c.map(span); return [Math.min(...sp.map((x) => x[0])), Math.max(...sp.map((x) => x[1]))]; };
        const [hx0, hx1] = spanOf(hc), [vy0, vy1] = spanOf(vc);
        const sameX = (c) => { const [x0, x1] = rng(c, "x"); return x1 >= hx0 - 8 * hh && x0 <= hx1 + 8 * hh; };   // 同一視圖欄（同方向）
        const sameY = (c) => { const [y0, y1] = rng(c, "y"); return y1 >= vy0 - 8 * hh && y0 <= vy1 + 8 * hh; };
        const others = [...HC.slice(1).filter((c) => !sameX(c)), ...VC.slice(1).filter((c) => !sameY(c))].map(mx).filter((v) => v <= Math.max(a, b));
        const c3 = others.length ? Math.max(...others) : 0;
        const tri = [a, b, c3].filter(Boolean).sort((x, y) => y - x);
        if (tri.length >= 2) {
          overall = [...new Set([...tri, ...overall.filter((v) => !tri.includes(v) && v < tri[tri.length - 1])])];
          orthoEv = `三視圖正交尺寸：水平 ${a}、直書 ${b}${c3 ? `、另一視圖 ${c3}` : ""}`; orthoC3 = c3;
        }
      }
    }

    // 5) 外形判斷
    let shape, shapeNote = "";
    const tVal = +fields["板厚T"] || 0;
    const section = /(\d+\s*[xX×]\s*\d+\s*[xX×]\s*\d+(\.\d+)?\s*t)|角鐵|方管|槽鐵|[HC]型鋼|扁鐵|圓管/.test(allWithDims);
    const big3 = overall.length >= 3 && Math.min(overall[0], overall[1], overall[2]) > 250;
    if ((fields["焊道長mm"] !== undefined && maxL > 300) || (section && maxL > 300) || (raster && big3 && !fields["板厚T"])) shape = "frame";
    else if (fields["折彎數"] || (tVal && tVal <= 6)) shape = "sheet";
    // 方形件證據：水平與直書的「直線尺寸」各 ≥2 個且與最大 Ø 同量級 → Ø 只是凹槽／孔等特徵，外形是方塊
    const linD = dims.filter((d) => d.kind === "linear" && d.x != null && d.v >= Math.max(3, maxD * 0.4));
    const prismatic = !!maxD && !shaftEv && linD.filter((d) => !d.vertical).length >= 2 && linD.filter((d) => d.vertical).length >= 2;
    if (prismatic) shapeNote = `水平／直書直線尺寸皆有（${[...new Set(linD.map((d) => d.v))].sort((a, b) => b - a).slice(0, 4).join("、")}），Ø${maxD} 判為凹槽或孔特徵`;
    if (shape) { /* 已判定 */ }
    else if (overall[2] && overall[2] <= 6 && overall[2] <= overall[1] * 0.15 && !shaftEv && (!maxD || prismatic)) { shape = "sheet"; shapeNote = `第三向尺寸 ${overall[2]}mm 遠小於長寬，判為薄片（板厚 ${overall[2]}）`; set("板厚T", overall[2], "mid", "側視圖厚度尺寸"); }
    else if (prismatic) shape = (overall[2] && overall[2] < overall[1] * 0.25) ? "plate" : "block";
    else if (maxD && maxD >= maxL * 0.25 && lin.length <= 8 + dia.length * 2 && (!overall[1] || maxD >= overall[1] * 0.8)) shape = "round";
    else if (shaftEv) shape = "round";
    else if (maxD && dia.length >= 3 && maxD < maxL * 0.25) shape = "round"; // 細長軸：多段直徑
    else if (maxD && !lin.some((v) => v >= maxD * 0.6 && v <= maxD * 1.6)) { shape = "round"; shapeNote = `Ø${maxD} 之外只有長度方向尺寸（${lin.filter((v) => v > maxD).slice(0, 2).join("、")}），判為圓棒／管／軸`; } // 管、銷、導桿：Ø＋長度
    else if (tVal) shape = "plate";
    else if (raster && thinCand && thinCand <= 6 && !fields["焊道長mm"]) shape = "sheet";
    else if (raster && chainW && !thinCand) shape = "plate"; // 座標式標註的平面圖，多為板件；板厚請人工補
    else shape = (overall[2] && overall[2] < overall[1] * 0.25) || (raster && thinCand) ? "plate" : "block";
    if (prismatic && shape !== "round") { fields["槽數"] = (+fields["槽數"] || 0) + 1; conf["槽數"] = "mid"; ev["槽數"] = `Ø${maxD} 凹弧／凹槽特徵（以 1 槽計工時）`; }
    set("外形", shape, (shaftEv && shape === "round") || shapeNote ? "mid" : "low", shapeNote && (shape !== "round" || !shaftEv) ? shapeNote : { round: shaftEv || "直徑標註為主", sheet: "板厚/折彎註記", frame: section ? "型鋼規格註記（角鐵/方管）" : fields["焊道長mm"] !== undefined ? "焊接註記 + 大尺寸" : "三向尺寸皆 > 250mm，判為架構/焊接件", plate: "厚度遠小於長寬", block: "三向尺寸相近" }[shape]);

    if (shape === "round") {
      set("外徑OD", maxD, dimConf, "最大直徑 Ø" + maxD);
      set("長L", overall[0] || "", dimConf, "最大長度 " + (overall[0] || "?"));
      const holeDias = new Set(holeEv.map((h) => +(h.match(/Ø\s*(\d+(?:\.\d+)?)/) || [])[1]));
      const named = dims.find((d) => d.kind === "diameter" && d.v < maxD * 0.9 && /H\d|內|孔|ID/i.test(d.text));
      const cands = dia.filter((v) => v < maxD * 0.9 && v > maxD * 0.15 && !holeDias.has(v) && !shaftTolVals.has(v));
      // 孔公差（+x/0）標註的直徑＝內孔或沉孔；取料以「最小的貫穿孔」計 → 取 ≤ 該孔徑的最小直徑
      const tolBore = [...holeTolVals].filter((v) => v < maxD * 0.9);
      // 無公差線索時：短件（法蘭、環、套）取最小的非孔直徑為內孔；細長軸視為實心
      // 三段以上不同外徑（階級軸、轉接頭）時，小直徑多為軸肩，不自動當內孔
      const stepped = dia.filter((v) => !holeDias.has(v)).length >= 3 || shaftTolVals.size > 0;
      let inner = 0, innerEv = "";
      if (named) { inner = named.v; innerEv = named.text; }
      else if (tolBore.length) { const lim = Math.max(...tolBore); inner = Math.min(...cands.filter((v) => v <= lim), lim); innerEv = `孔公差 Ø${tolBore.join("、Ø")}（+/0）→ 最小貫穿孔 Ø${inner}`; }
      else if ((overall[0] || 0) < maxD * 2 && !shaftEv && !stepped && cands.length) { inner = Math.min(...cands); innerEv = "次大直徑（請確認是否為內孔）"; }
      if (inner) set("內徑ID", inner, named || tolBore.length ? "mid" : "low", innerEv);
      const extM = tapEv.find((t) => { const m = t.match(/M\s*(\d+)/); return m && +m[1] >= maxD * 0.85; });
      if (extM) { set("外螺紋數", 1, "mid", extM); fields["攻牙數"] = Math.max(0, (fields["攻牙數"] || 1) - 1); }
      const gm = allText.match(/(?:退刀槽|溝槽|GROOVE)\s*(\d+)\s*(?:處|PLACES|個)?/i); const grooves = gm ? +gm[1] : (allText.match(/退刀槽|溝槽|GROOVE/gi) || []).length; if (grooves) set("退刀槽數", grooves, "low", "註記：退刀槽");
    } else {
      set("長L", overall[0] || "", dimConf, (orthoEv || "最大長度") + " → 長 " + (overall[0] || "?"));
      set("寬W", overall[1] || "", dimConf, (orthoEv ? "正交第二向 " : "次大長度 ") + (overall[1] || "?"));
      if (shape === "block" || shape === "frame") set("高H", overall[2] || "", dimConf, (orthoEv ? "正交第三向 " : "第三大長度 ") + (overall[2] || "?"));
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
    // 精度孔（+x/0 孔公差、H7 配合孔）：非圓件逐孔鉸／搪；圓件的同心內孔由車削完成，不另計
    if (fields["外形"] !== "round") { const n = Object.values(holeTolCnt).reduce((a, b) => a + b, 0); if (n) set("精度孔數", n, "mid", "孔公差：" + Object.entries(holeTolCnt).map(([d, c]) => `${c > 1 ? c + "-" : ""}Ø${d}`).join("、")); }
    const faces = shape === "round" ? 2 : shape === "sheet" ? 1 : Math.min(6, 1 + (/側視|右視|左視|SIDE/i.test(allText) ? 2 : 1) + (/後視|底視|BOTTOM|BACK/i.test(allText) ? 1 : 0) + (pt || crossKw ? 1 : 0));
    set("加工面數", faces, "low", "依視圖與特徵推估");

    // 7) 備註：技術要求
    const notes = all.filter((l) => /(注意|備註|技術要求|NOTE|未註|去毛邊|倒角|清洗|洩漏|氣密|同心|平行|垂直|HRC|鍵槽|KEYWAY|滾花|KNURL|刻字|打印|雷雕|刻印|齒數|模數|MODULE|研磨)/i.test(l) && l.length < 60).slice(0, 5);
    if (notes.length) set("備註", notes.join("；"), "mid", "圖面註記");

    // 7.5) 依 CNS 線型從圖形讀出外形（向量 PDF）
    // 比例以標題欄「比例／Scale」欄為準（圖中「比例 3/10」之類是立體圖或詳圖的比例）
    const FRAC = /^(\d+(?:\.\d+)?)\s*[\/:：]\s*(\d+(?:\.\d+)?)$/;
    const labAll = doc.items.filter((it) => Object.values(LABELS).some((re) => re.test(it.s)));
    const sLab = doc.items.filter((it) => LABELS.scale.test(it.s)).map((it) => ({ it, k: labAll.filter((o) => o !== it && Math.hypot(o.x - it.x, o.y - it.y) < it.h * 12).length })).sort((a, b) => b.k - a.k)[0];
    let sclV = null;
    if (sLab && sLab.k >= 2) { // 標題欄內的比例欄：同字串內或右方／下方最近的分數
      const own = sLab.it.s.replace(LABELS.scale, "").trim();
      if (FRAC.test(own)) sclV = own;
      else { const c = doc.items.filter((o) => FRAC.test(o.s.trim()) && o.x > sLab.it.x - sLab.it.h && Math.hypot(o.x - sLab.it.x, o.y - sLab.it.y) < sLab.it.h * 6).sort((a, b) => Math.hypot(a.x - sLab.it.x, a.y - sLab.it.y) - Math.hypot(b.x - sLab.it.x, b.y - sLab.it.y))[0]; if (c) sclV = c.s.trim(); }
    }
    const scaleText = (sclV ? `比例 ${sclV}\n` : "") + allText;
    const outline = readOutline(input.geom, doc, dims, scaleText);
    // 採用條件：至少一個外形量測值與圖上尺寸數字吻合（確認比例）；或標題欄有比例且有 ≥2 個對齊視圖
    // 線寬無粗細差異時（尺度線、指線可能混入輪廓），所有量測值都須與尺寸數字吻合才採用
    const outlineOK = outline && (outline.thickMode
      ? (outline.confirmed >= 1 || (outline.fromTitle && outline.nViews >= 2))
      : (outline.confirmed >= 2 && [outline.size.L, outline.size.H, outline.size.W].filter(Boolean).every((x) => x.exact)) || (outline.round && outline.round.od.exact));
    if (outline && !outlineOK) ev["圖形外形"] = `圖形外形僅供核對（線寬無粗細區分、量測與尺寸數字吻合 ${outline.confirmed} 項）`;
    if (outlineOK) {
      const o = outline, src = `圖形外形量測（CNS ${o.thickMode ? "粗實線" : "實線"}輪廓、${o.nViews} 視圖、${o.fNote}）`;
      const fmt = (x) => x && `${x.v}${x.exact ? "" : "（量測值）"}`;
      ev["圖形外形"] = `${src}：前視 ${fmt(o.size.L)} × ${fmt(o.size.H)}${o.size.W ? `、深度 ${fmt(o.size.W)}` : ""}${o.round ? `；端視圖為圓 Ø${o.round.od.v}` : ""}${o.iso ? `；排除立體圖 ${o.iso} 個` : ""}`;
      const textMax = Math.max(0, ...dims.filter((d) => d.kind === "linear").map((d) => d.v));
      if (o.round && o.round.od.exact) {
        if (fields["外形"] !== "round") set("外形", "round", "high", "圖形：端視圖為圓");
        set("外徑OD", o.round.od.v, "high", `圖形量測 Ø${o.round.od.v}`);
        if (o.round.id && o.round.id.v < o.round.od.v * 0.95 && conf["內徑ID"] !== "high") set("內徑ID", o.round.id.v, o.round.id.exact ? "high" : "mid", `圖形量測內孔 Ø${o.round.id.v}`);
        if (o.round.len && !(textMax > o.round.len.v * 1.05 && fields["長L"] > o.round.len.v)) set("長L", o.round.len.v, o.round.len.exact ? "high" : "mid", `圖形量測長度 ${o.round.len.v}`);
        delete fields["寬W"]; delete fields["高H"]; delete fields["板厚T"];
      } else if (fields["外形"] !== "round" && o.size.W) {
        const tri = [o.size.L, o.size.H, o.size.W].sort((a, b) => b.v - a.v);
        // 斷裂視圖保護：圖上有比量測更長的尺寸數字時，保留文字尺寸
        if (!(textMax > tri[0].v * 1.05)) {
          const thin = tri[2].v <= 6 && tri[2].v <= tri[1].v * 0.15;
          if (thin && fields["外形"] !== "sheet") set("外形", "sheet", "mid", `圖形：厚度 ${tri[2].v} 遠小於長寬，判為薄片`);
          if (!thin && ["sheet"].includes(fields["外形"]) && !fields["折彎數"] && tri[2].v > 6) set("外形", tri[2].v < tri[1].v * 0.25 ? "plate" : "block", "mid", "圖形：三向尺寸");
          set("長L", tri[0].v, tri[0].exact ? "high" : "mid", "圖形外形（最長向）");
          set("寬W", tri[1].v, tri[1].exact ? "high" : "mid", "圖形外形（次長向）");
          if (fields["外形"] === "sheet" || fields["外形"] === "plate") { set("板厚T", tri[2].v, tri[2].exact ? "high" : "mid", "圖形外形（厚度）"); delete fields["高H"]; delete ev["高H"]; delete conf["高H"]; }
          else { set("高H", tri[2].v, tri[2].exact ? "high" : "mid", "圖形外形（第三向）"); if (!tm) { delete fields["板厚T"]; delete ev["板厚T"]; delete conf["板厚T"]; } } // 方塊件沒有板厚（除非圖上明寫）
          if (fields["外形"] === "round") delete fields["外徑OD"];
        } else ev["圖形外形"] += "；圖上有更長尺寸，可能為斷裂視圖，保留尺寸數字";
      }
    }

    // 8) 圖面量測驗證（向量 PDF）：尺寸值 ÷ 比例 應等於圖上某條線長或某個圓的直徑
    const verify = verifyByGeometry(input.geom, fields, dims, scaleText);
    if (verify) {
      ev["比例"] = verify.scaleNote;
      for (const k of verify.ok) { conf[k] = "high"; ev[k] = (ev[k] || "") + "（圖面量測吻合 ✔）"; }
      for (const k of verify.bad) ev[k] = (ev[k] || "") + "（圖面未量到相同長度，建議核對）"; // 只提示、不降級（線段可能以其他方式繪製）
      if (verify.round && !["round", "frame", "sheet"].includes(fields["外形"]) && conf["外形"] !== "high") {
        set("外形", "round", "mid", `圖上有同心圓 Ø${verify.round.od}（量測），判為圓件`);
        set("外徑OD", verify.round.od, "high", `同心圓量測 Ø${verify.round.od}`);
        if (verify.round.id) set("內徑ID", verify.round.id, "mid", `同心圓量測 Ø${verify.round.id}`);
        set("長L", verify.round.len || fields["長L"], "mid", "軸向尺寸");
        delete fields["寬W"]; delete fields["高H"];
      }
    }

    // 9) 鈑金材（SPCC/SECC/SGCC/SPHC…）：一律視為鈑金件。板厚＝明確標註，或圖上最常出現的標準板厚尺寸；
    //    折彎成形的盒／罩保留成形高度（高H），估價以展開尺寸計
    if (SHEET_MAT.test(fields["材料"] || "") && fields["外形"] !== "round") {
      const STD_T = [0.5, 0.6, 0.8, 1, 1.2, 1.5, 1.6, 2, 2.3, 2.5, 3, 3.2, 4, 4.5];
      let t = tm ? +tm[1] : 0, tEv = tm ? tm[0] : "";
      if (!t) {
        const cnt = {}; dims.filter((d) => d.kind === "linear" && !d.ordPos && STD_T.includes(d.v)).forEach((d) => { cnt[d.v] = (cnt[d.v] || 0) + 1; });
        // 圖面證據：板厚在視圖上是「兩條平行輪廓線、間距＝板厚÷比例」，且這對線很長（折邊、側壁）
        const f = (outline && outline.f) || (verify && verify.f) || 1, PTMM = 25.4 / 72;
        const GL = ((input.geom && input.geom.lines) || []).filter((l) => !l[5] && l[4] >= 0.5).map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, h: Math.abs(y1 - y2) < 0.3, v: Math.abs(x1 - x2) < 0.3, len: Math.hypot(x2 - x1, y2 - y1) })).filter((l) => (l.h || l.v) && l.len > 3);
        const pairs = (tt) => {
          const sep = tt / f / PTMM; let n = 0;
          for (const k of ["h", "v"]) {
            const ls = GL.filter((l) => l[k]);
            for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
              const A = ls[i], B = ls[j];
              const d = k === "h" ? Math.abs(A.y1 - B.y1) : Math.abs(A.x1 - B.x1);
              if (Math.abs(d - sep) > Math.max(0.25, sep * 0.06)) continue;
              const [a0, a1] = k === "h" ? [Math.min(A.x1, A.x2), Math.max(A.x1, A.x2)] : [Math.min(A.y1, A.y2), Math.max(A.y1, A.y2)];
              const [b0, b1] = k === "h" ? [Math.min(B.x1, B.x2), Math.max(B.x1, B.x2)] : [Math.min(B.y1, B.y2), Math.max(B.y1, B.y2)];
              if (Math.min(a1, b1) - Math.max(a0, b0) >= Math.max(sep * 4, 8)) n++;
            }
          }
          return n;
        };
        const sc = Object.keys(cnt).map((v) => ({ v: +v, n: cnt[v], g: pairs(+v) }));
        const best = sc.sort((a, b) => (b.g > 0) - (a.g > 0) || b.n - a.n || b.g - a.g || a.v - b.v)[0];
        if (best) { t = best.v; tEv = `鈑金材 ${fields["材料"]}：板厚尺寸 ${best.v}（出現 ${best.n} 次${best.g ? `、圖上 ${best.g} 對平行輪廓線間距相符` : ""}）`; }
        else if (+fields["板厚T"] > 0 && +fields["板厚T"] <= 4.5) { t = +fields["板厚T"]; tEv = ev["板厚T"]; }
      }
      const ext = [fields["長L"], fields["寬W"], fields["高H"], fields["外形"] === "plate" || fields["外形"] === "sheet" ? 0 : fields["板厚T"]].map(Number).filter((v) => v > 6 && v !== t).sort((a, b) => b - a);
      if (ext.length < 3 && orthoC3 > 6 && !ext.includes(orthoC3)) ext.push(orthoC3), ext.sort((a, b) => b - a);
      const prev = fields["外形"];
      set("外形", "sheet", "mid", `材料 ${fields["材料"]} 為鈑金板材，判為鈑金件${prev && prev !== "sheet" ? `（原判 ${prev}）` : ""}`);
      if (ext[0]) set("長L", ext[0], conf["長L"] || dimConf, ev["長L"] || "最大外形");
      if (ext[1]) set("寬W", ext[1], conf["寬W"] || dimConf, ev["寬W"] || "次大外形");
      if (ext[2] && ext[2] > Math.max(6 * (t || 2), 10)) {
        // 折彎數：圖上有折彎半徑 R 標註時依其數量（L 型折板 1 折），否則以盒／罩 4 折估
        // （單獨的「R4」且 ≤ 3t 才算折彎內 R；「4-R5」多為板角倒圓，不算）
        const rN = doc.items.filter((it) => { const m = it.s.trim().match(/^R\s*(\d+(?:\.\d+)?)$/i); return m && +m[1] <= Math.max(3 * (t || 2), 4); }).length;
        if (!fields["折彎數"]) set("折彎數", rN || 4, "low", rN ? `折彎半徑 R 標註 ${rN} 處` : "依成形高度推估（盒／罩 4 折），請依圖修正");
        set("高H", ext[2], conf["高H"] || dimConf, `折彎成形高度 ${ext[2]}（估價以展開尺寸計：1 折 長×(寬+高)、2 折 長×(寬+2高)、≥3 折 (長+2高)×(寬+2高)）`);
      } else delete fields["高H"];
      if (t) set("板厚T", t, tm ? "mid" : "low", tEv);
      else { fields["板厚T"] = ""; conf["板厚T"] = "low"; ev["板厚T"] = `⚠ 鈑金材 ${fields["材料"]} 未讀到板厚，請輸入（常用 1.0／1.2／1.6／2.0）`; }
    }

    // 單位
    if (input.unitNote) ev["單位"] = input.unitNote;
    else if (input.units && input.units !== "mm" && input.units !== "未指定") ev["單位"] = `⚠ 圖檔單位為 ${input.units}，請換算為 mm`;

    const weights = { 圖號: 2, 零件名稱: 2, 材料: 3, 數量: 2, 外形: 1, 長L: 2, 寬W: 1, 外徑OD: 2, 表面處理: 1, 公差: 1 };
    let got = 0, tot = 0;
    for (const [k, w] of Object.entries(weights)) { if (k === "寬W" && shape === "round") continue; if (k === "外徑OD" && shape !== "round") continue; tot += w; got += w * ({ high: 1, mid: 0.7, low: 0.3 }[conf[k]] || 0); }
    return { fields, conf, evidence: ev, score: Math.round(got / tot * 100), lines: all, outline: outline ? { views: outline.views, f: outline.f } : null };
  }

  /**
   * 依 CNS 製圖規範從向量線條讀出工件外形（不靠尺寸文字）
   *  1. 線型分類：粗實線＝可見輪廓；細實線＝尺度線／尺度界線／剖面線；虛線＝隱藏線；鏈線＝中心線
   *     （線寬無差異時：去除兩端帶箭頭的尺度線及接在尺度線端點的尺度界線）
   *  2. 去除圖框、標題欄、一般公差表、等角立體圖（30° 斜線為主）
   *  3. 輪廓線依相連關係分群＝各視圖；依第三角法排列找出前視／上視／側視
   *  4. 量測（mm）× 比例 ＝ 實際外形，並對齊圖上最接近的尺寸數字
   */
  function readOutline(geom, doc, dims, allText) {
    if (!geom || !geom.lines || (!geom.lines.length && !(geom.arcs || []).length)) return null;
    const PT = 25.4 / 72, pageW = geom.pageW || 595, pageH = geom.pageH || 842;
    // ── 1. 線型 ──
    const L = geom.lines.map(([x1, y1, x2, y2, w, d]) => ({ x1, y1, x2, y2, w, dash: !!d, len: Math.hypot(x2 - x1, y2 - y1) }));
    const A = (geom.arcs || []).map((a) => ({ pts: a.p.map(([x, y]) => ({ x, y })), w: a.w, dash: !!a.d }));
    const C = (geom.circles || []).map((c) => ({ ...c, dash: !!c.dash }));
    // CAD 線字（SHX）會同時輸出成文字與大量短筆畫：落在文字框內、且短於字高的筆畫不是工件輪廓
    const tboxes = doc.items.map((i) => { const w = [...i.s].reduce((a, ch) => a + (/[\u3400-\u9fff]/.test(ch) ? 1.05 : 0.75), 0) * i.h; return i.vertical ? { x0: i.x - i.h * 1.3, x1: i.x + i.h * 0.4, y0: i.y - w - i.h * 0.3, y1: i.y + i.h * 0.3, h: i.h } : { x0: i.x - i.h * 0.3, x1: i.x + w + i.h * 0.3, y0: i.y - i.h * 1.25, y1: i.y + i.h * 0.4, h: i.h }; });
    const glyph = (l) => tboxes.some((b) => l.len < b.h * 1.6 && (l.x1 + l.x2) / 2 >= b.x0 && (l.x1 + l.x2) / 2 <= b.x1 && (l.y1 + l.y2) / 2 >= b.y0 && (l.y1 + l.y2) / 2 <= b.y1);
    for (let i = L.length - 1; i >= 0; i--) if (glyph(L[i])) L.splice(i, 1);
    const solid = L.filter((l) => !l.dash);
    const wsum = {}; solid.forEach((l) => { const k = Math.round(l.w * 100) / 100; wsum[k] = (wsum[k] || 0) + l.len; });
    const ws = Object.keys(wsum).map(Number).filter((w) => wsum[w] > 30 && w >= 0.05).sort((a, b) => a - b); // 0 寬髮絲線（箭頭）不參與粗細分級
    const thickMode = ws.length >= 2 && ws[ws.length - 1] / ws[0] >= 1.4;
    const thr = thickMode ? Math.sqrt(ws[0] * ws[ws.length - 1]) : 0;
    const isOutline = (o) => !o.dash && (!thickMode || (o.w || 0) >= thr * 0.98);
    let lines = solid.filter(isOutline), arcs = A.filter(isOutline), circles = C.filter((c) => !c.dash && (!thickMode || (c.w || 0) >= thr * 0.98));
    const arrows = geom.arrows || [];
    if (!thickMode && arrows.length) { // 尺度線：端點旁有箭頭；尺度界線：端點落在尺度線端點附近且與其垂直
      const near = (x, y, r) => arrows.some(([ax, ay]) => Math.hypot(ax - x, ay - y) < r);
      const dimLines = lines.filter((l) => near(l.x1, l.y1, 6) || near(l.x2, l.y2, 6));
      const ends = dimLines.flatMap((l) => [[l.x1, l.y1], [l.x2, l.y2]]);
      const ext = lines.filter((l) => !dimLines.includes(l) && ends.some(([ex, ey]) => (Math.hypot(l.x1 - ex, l.y1 - ey) < 10 || Math.hypot(l.x2 - ex, l.y2 - ey) < 10) && l.len > 2));
      const drop = new Set([...dimLines, ...ext]);
      lines = lines.filter((l) => !drop.has(l));
    }
    // ── 2. 排除區：圖框、標題欄、公差表、等角圖 ──
    const labels = doc.items.filter((it) => Object.values(LABELS).some((re) => re.test(it.s)) || /Grade|[≤≧>]\s*\d|CAD\s*NO|DWG|Title|Scale|比例|個\s*\/\s*台/i.test(it.s));
    const zones = [];
    if (labels.length) {
      const grp = []; for (const it of labels) { const g = grp.find((G) => G.some((o) => Math.hypot(o.x - it.x, o.y - it.y) < 60)); if (g) g.push(it); else grp.push([it]); }
      for (const g of grp) if (g.length >= 2) zones.push({ x0: Math.min(...g.map((i) => i.x)) - 25, x1: Math.max(...g.map((i) => i.x)) + 120, y0: Math.min(...g.map((i) => i.y)) - 25, y1: Math.max(...g.map((i) => i.y)) + 25 });
    }
    const inZone = (x, y) => zones.some((z) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1);
    // 圖框：橫跨 ≥85% 頁寬／頁高的水平或垂直線，或貼近紙邊（大型工件可畫到接近半頁以上，不可用「長於半頁」判斷）
    const frame = (l) => (Math.abs(l.y1 - l.y2) < 1 && l.len >= pageW * 0.85) || (Math.abs(l.x1 - l.x2) < 1 && l.len >= pageH * 0.85) || Math.min(l.x1, l.x2) < 8 || Math.max(l.x1, l.x2) > pageW - 8 || Math.min(l.y1, l.y2) < 8 || Math.max(l.y1, l.y2) > pageH - 8;
    // ── 3. 分群（端點／邊框相距 < 1.5pt 視為相連） ──
    const prims = [
      ...lines.filter((l) => !frame(l)).map((l) => ({ x0: Math.min(l.x1, l.x2), y0: Math.min(l.y1, l.y2), x1: Math.max(l.x1, l.x2), y1: Math.max(l.y1, l.y2), ang: Math.atan2(l.y2 - l.y1, l.x2 - l.x1), len: l.len })),
      ...arcs.map((a) => { const xs = a.pts.map((p) => p.x), ys = a.pts.map((p) => p.y); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; }),
      ...circles.map((c) => ({ x0: c.x - c.r, y0: c.y - c.r, x1: c.x + c.r, y1: c.y + c.r, circle: c })),
    ].filter((p) => !inZone((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2));
    if (prims.length < 3) return null;
    const par = prims.map((_, i) => i), find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    const order = prims.map((p, i) => i).sort((a, b) => prims[a].x0 - prims[b].x0), tol = 1.5;
    for (let a = 0; a < order.length; a++) {
      const P = prims[order[a]];
      for (let b = a + 1; b < order.length; b++) {
        const Q = prims[order[b]]; if (Q.x0 > P.x1 + tol) break;
        if (Q.y0 <= P.y1 + tol && Q.y1 >= P.y0 - tol) par[find(order[a])] = find(order[b]);
      }
    }
    const groups = {}; prims.forEach((p, i) => { (groups[find(i)] = groups[find(i)] || []).push(p); });
    let views = Object.values(groups).map((g) => {
      const v = { x0: Math.min(...g.map((p) => p.x0)), y0: Math.min(...g.map((p) => p.y0)), x1: Math.max(...g.map((p) => p.x1)), y1: Math.max(...g.map((p) => p.y1)), n: g.length };
      const ls = g.filter((p) => p.ang !== undefined && p.len > 3), tot = ls.reduce((a, p) => a + p.len, 0) || 1;
      v.iso = ls.filter((p) => { const d = Math.abs(((p.ang * 180 / Math.PI) % 180 + 180) % 180); return Math.abs(d - 30) < 4 || Math.abs(d - 150) < 4; }).reduce((a, p) => a + p.len, 0) / tot > 0.3;
      if (!v.iso) { // 斜二測／不等角立體圖：斜線佔 ≥30%，且同一斜向有 ≥4 條平行邊（正投影視圖的斜邊不會成群平行）
        const obl = ls.filter((p) => { const d = ((p.ang * 180 / Math.PI) % 180 + 180) % 180; return Math.min(d, 180 - d) > 8 && Math.abs(d - 90) > 8; });
        const bins = {}; obl.forEach((p) => { const d = Math.round((((p.ang * 180 / Math.PI) % 180 + 180) % 180) / 3); bins[d] = (bins[d] || 0) + 1; });
        v.iso = obl.reduce((a, p) => a + p.len, 0) / tot > 0.3 && Math.max(0, ...Object.values(bins)) >= 4;
      }
      v.circ = g.filter((p) => p.circle).map((p) => p.circle);
      v.w = v.x1 - v.x0; v.h = v.y1 - v.y0; return v;
    }).filter((v) => Math.max(v.w, v.h) * PT >= 4 && v.n >= 2);
    if (!views.length) return null;
    // 同一視圖被缺口（切槽、斷裂線）分成數塊：相距 < 3mm 且垂直方向重疊 ≥ 50% 者合併
    for (let changed = true; changed;) {
      changed = false;
      for (let a = 0; a < views.length && !changed; a++) for (let b = a + 1; b < views.length && !changed; b++) {
        const A = views[a], B = views[b], gx = Math.max(0, Math.max(A.x0, B.x0) - Math.min(A.x1, B.x1)), gy = Math.max(0, Math.max(A.y0, B.y0) - Math.min(A.y1, B.y1));
        const oy = Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0)), ox = Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0));
        if (A.iso || B.iso) continue;
        if ((gx < 8.5 && gy === 0 && oy >= 0.5 * Math.min(A.h, B.h)) || (gy < 8.5 && gx === 0 && ox >= 0.5 * Math.min(A.w, B.w))) {
          const m = { x0: Math.min(A.x0, B.x0), y0: Math.min(A.y0, B.y0), x1: Math.max(A.x1, B.x1), y1: Math.max(A.y1, B.y1), n: A.n + B.n, iso: false, circ: [...A.circ, ...B.circ] };
          m.w = m.x1 - m.x0; m.h = m.y1 - m.y0; views.splice(b, 1); views.splice(a, 1, m); changed = true;
        }
      }
    }
    // 表格排除：框內含標題欄／公差表文字（圖號、材料、Grade、≤10、±0.1…）的整群線條不是工件
    const TABLEWORD = /^(圖\s*號|圖\s*名|品\s*名|材\s*料|數\s*量|比\s*例|個\s*\/\s*台|CAD\s*NO|DWG|Title|Scale|Grade|Material|Pieces|設\s*計|製\s*圖|校\s*正|審\s*核|檢查點數|Inspect|SIZE|Revision|限制閱讀|Limited|Reading|Model|Designer|Drawer|APPR|等級|適用機種)|^[≤≦≥≧<>]\s*\d|^±\s*0?\.\d|^R[az]\s*\d|^\(\s*\)$/i;
    const inside = (v, it, pad = 0) => it.x >= v.x0 - pad && it.x <= v.x1 + pad && it.y >= v.y0 - pad && it.y <= v.y1 + pad;
    // 粗糙度符號：視圖旁常有 1～2 個（加工面標示），圖例列才會 ≥3 個 → 只在 ≥3 個時當表格／圖例
    const RZW = /^R[az]\s*\d|^\(\s*\)$/i;
    const tableLike = (v) => doc.items.filter((it) => TABLEWORD.test(it.s.trim()) && !RZW.test(it.s.trim()) && inside(v, it, 2)).length >= 2 || doc.items.filter((it) => RZW.test(it.s.trim()) && inside(v, it, 2)).length >= 3;
    // 視圖須有尺寸數字在旁（15mm 內）；表格、圖框、標記符號旁沒有尺寸
    const dimNear = (v) => dims.some((d) => d.x != null && inside(v, d, 42));
    const ovl = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const anchored = views.filter((v) => !v.iso && !tableLike(v) && dimNear(v));
    const aligned = (v) => anchored.some((a) => a !== v && (ovl(v.x0, v.x1, a.x0, a.x1) >= 0.6 * Math.min(v.x1 - v.x0, a.x1 - a.x0) || ovl(v.y0, v.y1, a.y0, a.y1) >= 0.6 * Math.min(v.y1 - v.y0, a.y1 - a.y0)));
    // 保留：旁邊有尺寸數字的視圖，或與其對齊（第三角法同列／同欄）的視圖（例如只畫不標的側視圖）
    const dropped = views.filter((v) => !v.iso && (tableLike(v) || !(dimNear(v) || aligned(v))));
    views = views.filter((v) => !dropped.includes(v));
    // 過小的線群（符號、記號）排除：以「工件視圖中最大者」為基準（標題欄、公差表不參與比較）
    const big = Math.max(0, ...views.filter((v) => !v.iso).map((v) => v.w * v.h));
    views = views.filter((v) => v.iso || v.w * v.h >= big * 0.03 || Math.max(v.w, v.h) >= Math.sqrt(big) * 0.5);
    const iso = views.filter((v) => v.iso); views = views.filter((v) => !v.iso);
    if (!views.length) return null;
    // ── 4. 第三角法排列 ──
    const F = [...views].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    // 第三角法投影：上視／側視與前視共用同一長度／高度（重疊 ≥ 60% 的較大者）；局部詳圖、剖面圖不算
    const T = views.filter((v) => v !== F && ov(v.x0, v.x1, F.x0, F.x1) >= 0.6 * Math.max(v.w, F.w) && (v.y1 <= F.y0 + 2 || v.y0 >= F.y1 - 2)).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    // 第三角法：上下排列的兩視圖中，下方為前視圖、上方為上視圖；側視圖在前視圖左右且高度對齊
    const front = T && T.y0 > F.y0 ? T : F, top = T ? (front === F ? T : F) : null;
    const sideOf = (base) => views.filter((v) => v !== F && v !== T && ov(v.y0, v.y1, base.y0, base.y1) >= 0.6 * Math.max(v.h, base.h) && (v.x0 >= base.x1 - 2 || v.x1 <= base.x0 + 2)).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const S = sideOf(front) || sideOf(F);
    // ── 比例 ──
    const vals = [...new Set(dims.filter((d) => d.v >= 0.3).map((d) => +d.v))];
    const sm = allText.match(/(?:比\s*例|SCALE)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*[\/:：]\s*(\d+(?:\.\d+)?)/i);
    const meas = [front.w, front.h, top && top.h, S && S.w].filter(Boolean).map((x) => x * PT);
    const hit = (m, f) => vals.some((v) => Math.abs(m * f - v) <= Math.max(0.3, v * 0.02));
    // 比例：標題欄比例需經尺寸數字驗證；若其他標準比例吻合更多，採用吻合者（實際圖面常有比例欄未更新）
    let f = 0, fNote = "", best = -1, bestF = 0;
    for (const c of [1, 2, 5, 10, 0.5, 1.5, 2.5, 4, 6, 8, 3, 20, 0.2]) { const k = meas.filter((m) => hit(m, c)).length; if (k > best) { best = k; bestF = c; } }
    if (sm) {
      const tf = +sm[2] / +sm[1], tk = meas.filter((m) => hit(m, tf)).length;
      if (tk >= best || best < 2) { f = tf; fNote = `標題欄比例 ${sm[1]}/${sm[2]}`; }
      else { f = bestF; fNote = `標題欄比例 ${sm[1]}/${sm[2]} 與圖面不符（吻合 ${tk} 項），改用 1/${bestF}（吻合 ${best} 項）`; }
    } else { f = bestF; fNote = `比例推定 1/${bestF}（外形量測與尺寸數字吻合 ${best} 項）`; }
    const linVals = [...new Set(dims.filter((d) => d.v >= 0.3 && d.kind === "linear" && !d.ordPos && !d.slanted).map((d) => +d.v))], diaVals = [...new Set(dims.filter((d) => d.kind === "diameter").map((d) => +d.v))];
    // 方形外形只對齊直線尺寸、圓形外形只對齊直徑尺寸（避免 Ø20 碰巧對上量測 20）
    // 容差：2.5% 或圖面 0.6pt（線寬、繪製精度）× 比例，取大者 → 1/6 圖上 5mm 板厚量成 4.2 仍可對上「5」
    const snap = (mm, pool = linVals) => { const r = mm * f, v = pool.filter((x) => Math.abs(x - r) <= Math.max(0.3, r * 0.025, 0.6 * PT * f)).sort((a, b) => Math.abs(a - r) - Math.abs(b - r))[0]; return { v: v != null ? v : Math.round(r * 2) / 2, exact: v != null }; };
    const fw = snap(front.w * PT), fh = snap(front.h * PT); // 長、高＝前視圖
    // 深度＝上視圖高與側視圖寬取大者（外形包絡；兩視圖可能各自只看到部分）
    const depth = top || S ? snap(Math.max(top ? top.h : 0, S ? S.w : 0) * PT) : null;
    // 圓形端視圖：視圖本身是圓（寬≈高≈圓徑）
    const roundOf = (v) => { const c = [...(v.circ || [])].sort((a, b) => b.r - a.r)[0]; return c && Math.abs(2 * c.r - v.w) < v.w * 0.06 && Math.abs(2 * c.r - v.h) < v.h * 0.06 ? { c, inner: v.circ.filter((o) => o !== c && Math.hypot(o.x - c.x, o.y - c.y) < c.r * 0.05).sort((a, b) => a.r - b.r)[0] } : null; };
    let round = null;
    for (const [cv, other, axis] of [[F, S || T, S ? "w" : "h"], [S, F, "w"], [T, F, "h"]]) {
      if (!cv) continue; const rc = roundOf(cv); if (!rc) continue;
      const od = snap(2 * rc.c.r * PT, diaVals.length ? diaVals : vals), id = rc.inner ? snap(2 * rc.inner.r * PT, diaVals.length ? diaVals : vals) : null;
      const len = other ? snap((axis === "w" ? other.w : other.h) * PT) : null;
      round = { od, id, len }; break;
    }
    const views3 = [F, T, S].filter(Boolean);
    return {
      f, fNote, fromTitle: !!sm && !/不符/.test(fNote), thickMode, round, iso: iso.length,
      size: { L: fw, H: fh, W: depth }, nViews: views3.length,
      views: [...views3.map((v) => ({ x0: v.x0, y0: v.y0, x1: v.x1, y1: v.y1, role: v === S ? "側視圖" : v === top ? "上視圖" : v === front ? "前視圖" : "主視圖", rw: snap(v.w * PT).v, rh: snap(v.h * PT).v })), ...iso.map((v) => ({ x0: v.x0, y0: v.y0, x1: v.x1, y1: v.y1, role: "立體圖（不量測）" }))],
      confirmed: [fw, fh, depth].filter((x) => x && x.exact).length,
    };
  }

  /**
   * 以向量幾何驗證尺寸：
   *  比例：標題欄「比例 1/2」「SCALE 1:2」；沒有時從標準比例中選吻合數最多者
   *  吻合：|線長(mm) × 比例 − 尺寸| ≤ max(0.6mm, 2%)；直徑另比對圓
   */
  function verifyByGeometry(geom, fields, dims, allText) {
    if (!geom || (!geom.segs?.length && !geom.circles?.length)) return null;
    const PT = 25.4 / 72, segs = geom.segs.map((l) => l * PT), circ = geom.circles.map((c) => ({ ...c, d: 2 * c.r * PT }));
    const sm = allText.match(/(?:比\s*例|SCALE)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*[\/:：]\s*(\d+(?:\.\d+)?)/i) || allText.match(/\b(1)\s*[\/:]\s*(1|2|5|10|20|1\.5|2\.5)\b/);
    const near = (v, pool, f) => pool.some((x) => Math.abs(x * f - v) <= Math.max(0.6, v * 0.02));
    const vals = [...new Set(dims.filter((d) => d.v >= 5).map((d) => d.v))];
    let f, scaleNote;
    if (sm) { f = +sm[2] / +sm[1]; scaleNote = `比例 ${sm[1]}/${sm[2]}（標題欄）`; }
    else {
      let best = 0;
      for (const c of [1, 2, 5, 10, 0.5, 1.5, 2.5, 4, 20, 0.2]) { const m = vals.filter((v) => near(v, segs, c) || near(v, circ.map((x) => x.d), c)).length; if (m > best) { best = m; f = c; } }
      if (!f) return null;
      scaleNote = `比例推定 1/${+f.toFixed(2)}（${best} 個尺寸吻合圖上線長）`;
    }
    const ok = [], bad = [];
    for (const k of ["長L", "寬W", "高H", "板厚T"]) { const v = +fields[k]; if (!v) continue; (near(v, segs, f) ? ok : bad).push(k); }
    for (const k of ["外徑OD", "內徑ID"]) { const v = +fields[k]; if (!v) continue; (near(v, circ.map((x) => x.d), f) || near(v, segs, f) ? ok : bad).push(k); }
    // 同心圓（圓形視圖）：≥2 個同圓心、半徑不同的大圓
    let round = null;
    const bigC = circ.filter((c) => c.d * f >= 10).sort((a, b) => b.d - a.d);
    for (const c of bigC) {
      const group = bigC.filter((o) => Math.hypot(o.x - c.x, o.y - c.y) < c.r * 0.03 + 0.5 && o !== c && o.r < c.r * 0.95);
      if (group.length) {
        const od = +(c.d * f).toFixed(1), match = vals.find((v) => Math.abs(v - od) <= Math.max(0.6, od * 0.02));
        const inner = group.map((o) => +(o.d * f).toFixed(1)).sort((a, b) => a - b)[0];
        const innerM = vals.find((v) => Math.abs(v - inner) <= Math.max(0.6, inner * 0.02));
        const lens = vals.filter((v) => v < (match || od) && !(innerM && v === innerM));
        if ((match || od) < 0.6 * Math.max(0, ...vals)) continue; // 沉頭孔等小同心圓不算圓形外形
        round = { od: match || od, id: innerM || null, len: lens.sort((a, b) => b - a).find((v) => near(v, segs, f) && v < (match || od)) || null };
        break;
      }
    }
    return { f, scaleNote, ok, bad, round };
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
