/*
 * 瀏覽器端圖面讀取：DXF（向量）→ PDF（文字層，無文字則 OCR）→ 圖片（OCR）
 * 全部使用本機 vendor/ 函式庫，不連網。
 */
(function (root) {
  const base = (p) => new URL(p, location.href).href;
  const VENDOR = {
    pdf: "vendor/pdfjs/pdf.min.js", pdfWorker: "vendor/pdfjs/pdf.worker.min.js", cmaps: "vendor/pdfjs/cmaps/",
    tess: "vendor/tesseract/tesseract.min.js", inline: "vendor/ocr-inline/",
  };
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("無法載入 " + src)); document.head.appendChild(s); });
    return loaded[src];
  }
  const isFileProtocol = () => location.protocol === "file:";

  async function getPdfjs() {
    await loadScript(VENDOR.pdf);
    const lib = root.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = base(VENDOR.pdfWorker);
    if (isFileProtocol()) await loadScript(VENDOR.pdfWorker); // file:// 無法開 Worker，改主執行緒
    return lib;
  }

  let ocrWorker = null, ocrLangs = null;
  /**
   * OCR Worker 由頁面自行組裝成 blob：核心 + Worker 程式 + 字庫（攔截 fetch 從記憶體提供）
   * 這樣直接雙擊 index.html（file://）也能執行 OCR，不必啟動本機伺服器。
   */
  let workerURL = null;
  async function ocrWorkerURL() {
    if (workerURL) return workerURL;
    const simd = typeof WebAssembly === "object" && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    const core = simd ? "core-simd" : "core";
    await Promise.all([core, "worker", "lang-eng", "lang-chi_tra"].map((n) => loadScript(VENDOR.inline + n + ".js")));
    const O = root.__D2Q_OCR;
    const prelude = `self.__LANGS={eng:${JSON.stringify(O["lang-eng"])},chi_tra:${JSON.stringify(O["lang-chi_tra"])}};
(function(){var of=self.fetch;self.fetch=function(u,o){var m=String(u).match(/([A-Za-z_]+)\.traineddata(\.gz)?$/);
if(m&&self.__LANGS[m[1]]){var b=atob(self.__LANGS[m[1]]),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return Promise.resolve(new Response(a));}
return of(u,o);};})();\n`;
    workerURL = URL.createObjectURL(new Blob([prelude, O[core], "\n;\n", O.worker], { type: "text/javascript" }));
    return workerURL;
  }
  const workerOpts = async (extra = {}) => ({ workerPath: await ocrWorkerURL(), workerBlobURL: false, langPath: "https://d2q.local/tessdata", gzip: true, cacheMethod: "none", ...extra });

  async function getOcr(langs, onProgress) {
    await loadScript(VENDOR.tess);
    if (ocrWorker && ocrLangs === langs) return ocrWorker;
    if (ocrWorker) await ocrWorker.terminate();
    ocrWorker = await root.Tesseract.createWorker(langs.split("+"), 1, await workerOpts());
    await ocrWorker.setParameters({ tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" }); // 稀疏文字：適合工程圖
    ocrLangs = langs;
    return ocrWorker;
  }

  // ───────────── 掃描圖前處理 ─────────────
  let lineWorker = null;
  async function getLineOcr() { // 尺寸行專用：英文模型 + 字元白名單
    if (lineWorker) return lineWorker;
    await loadScript(VENDOR.tess);
    lineWorker = await root.Tesseract.createWorker(["eng"], 1, await workerOpts());
    await lineWorker.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789.,+-±RMxXhHgGfFjJkKpPnNsSLT@Ø°/ ", user_defined_dpi: "300" });
    return lineWorker;
  }
  async function readLine(canvas) {
    const lw = await getLineOcr(); await lw.setParameters({ tessedit_pageseg_mode: "7" }); const { data } = await lw.recognize(canvas);
    return { words: (data.words || []).filter((x) => x.text.trim()), conf: data.confidence };
  }

  /** 判斷一行文字的第一個字形是否為 Ø：寬字形 + 兩個封閉孔（斜線把圓切成兩半） */
  function firstGlyphIsDiameter(canvas) {
    const W = canvas.width, H = canvas.height, bin = adaptiveBin(toGray(canvas), W, H);
    const lab = new Int32Array(W * H), comps = []; let id = 0;
    for (let p0 = 0; p0 < W * H; p0++) {
      if (!bin[p0] || lab[p0]) continue; id++;
      let x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0; const st = [p0]; lab[p0] = id;
      while (st.length) { const p = st.pop(), x = p % W, y = (p / W) | 0; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < W * H && bin[q] && !lab[q] && Math.abs((q % W) - x) <= 1) { lab[q] = id; st.push(q); } }
      if (n > 20) comps.push({ id, x0, x1, y0, y1, n });
    }
    if (!comps.length) return false;
    const hmax = Math.max(...comps.map((c) => c.y1 - c.y0));
    const first = comps.filter((c) => c.y1 - c.y0 > hmax * 0.6).sort((a, b) => a.x0 - b.x0)[0];
    if (!first) return false;
    const w = first.x1 - first.x0 + 1, h = first.y1 - first.y0 + 1;
    if (w / h < 0.7) return false;
    // 計算封閉孔數：從外框灌水，剩下的背景區塊即為孔
    const bw = w + 2, bh = h + 2, seen = new Uint8Array(bw * bh);
    const fg = (x, y) => x >= 0 && y >= 0 && x < w && y < h && lab[(first.y0 + y) * W + first.x0 + x] === first.id;
    const fill = (sx, sy) => { let area = 0; const st = [[sx, sy]]; seen[sy * bw + sx] = 1;
      while (st.length) { const [x, y] = st.pop(); area++; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || seen[ny * bw + nx] || fg(nx - 1, ny - 1)) continue; seen[ny * bw + nx] = 1; st.push([nx, ny]); } }
      return area; };
    fill(0, 0);
    let holes = 0;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (!seen[y * bw + x] && !fg(x - 1, y - 1)) { if (fill(x, y) > w * h * 0.02) holes++; }
    return holes >= 2;
  }

  /** 數字/符號專用全頁稀疏辨識（英文模型 + 白名單）：尺寸數字、孔/牙標註 */
  async function numericPass(canvas, tag) {
    const lw = await getLineOcr(); await lw.setParameters({ tessedit_pageseg_mode: "11" });
    const { data } = await lw.recognize(canvas);
    return { tag, conf: data.confidence, words: (data.words || []).filter((x) => x.text.trim() && x.confidence > 40 && /\d/.test(x.text)) };
  }

  function scaledCanvas(src, longSide, blurPx = 0) {
    const k = longSide / Math.max(src.width, src.height);
    const c = document.createElement("canvas"); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.imageSmoothingQuality = "high"; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    if (blurPx) ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(src, 0, 0, c.width, c.height); ctx.filter = "none";
    return { c, k };
  }
  /** 翻拍螢幕/手機照片判斷：亮部有明顯彩色條紋（摩爾紋）或亮度不均 */
  function isPhoto(c) {
    const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    let sat = 0, n = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < d.length; i += 4 * 97) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]); if (mx > 150) { sat += mx - mn; n++; const g = (d[i] + d[i + 1] + d[i + 2]) / 3; s1 += g; s2 += g * g; } }
    if (!n) return false;
    const std = Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2));
    return sat / n > 4 || std > 14; // 彩色雜訊或底色明暗不均 → 翻拍/手機照片
  }
  function toGray(c, photo) {
    const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data, g = new Uint8Array(c.width * c.height);
    if (photo) for (let i = 0, p = 0; p < g.length; i += 4, p++) g[p] = Math.max(d[i], d[i + 1], d[i + 2]); // 取最亮通道：彩色摩爾紋變成均勻底色，黑字不受影響
    else for (let i = 0, p = 0; p < g.length; i += 4, p++) g[p] = (77 * d[i] + 150 * d[i + 1] + 29 * d[i + 2]) >> 8;
    return g;
  }
  /** 自適應二值化（局部平均，處理掃描灰底、陰影、褪色） */
  function adaptiveBin(g, W, H, photo) {
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
    const r = Math.max(12, Math.round(Math.min(W, H) / 70)), bin = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const mean = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        const v = g[y * W + x]; bin[y * W + x] = photo ? (v < mean * 0.78 && mean - v > 28 ? 1 : 0) : (v < mean * 0.82 && v < 215 ? 1 : 0);
      }
    }
    return bin;
  }
  /** 傾斜角估計：投影輪廓變異數最大者（±4°） */
  function skewAngle(bin, W, H) {
    const f = Math.max(1, Math.ceil(Math.max(W, H) / 1400)), pts = [];
    for (let y = 0; y < H; y += f) for (let x = 0; x < W; x += f) if (bin[y * W + x]) pts.push(x, y);
    if (pts.length < 200) return 0;
    let best = 0, bestV = -1;
    for (let a = -4; a <= 4.001; a += 0.1) {
      const t = Math.tan(a * Math.PI / 180), hist = new Float64Array(Math.ceil(H / f) + Math.ceil(W / f) + 10), off = Math.ceil(W * Math.abs(t) / f) + 2;
      for (let i = 0; i < pts.length; i += 2) hist[Math.round((pts[i + 1] - pts[i] * t) / f) + off]++;
      let v = 0; for (const h of hist) v += h * h;
      if (v > bestV) { bestV = v; best = a; }
    }
    return best;
  }
  function rotateCanvas(src, deg) {
    const q = ((deg % 360) + 360) % 360, quarter = q === 90 || q === 270, r = deg * Math.PI / 180;
    const c = document.createElement("canvas");
    if (q % 90 === 0) { c.width = quarter ? src.height : src.width; c.height = quarter ? src.width : src.height; }
    else { c.width = Math.ceil(Math.abs(src.width * Math.cos(r)) + Math.abs(src.height * Math.sin(r))); c.height = Math.ceil(Math.abs(src.width * Math.sin(r)) + Math.abs(src.height * Math.cos(r))); }
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate(deg * Math.PI / 180); ctx.drawImage(src, -src.width / 2, -src.height / 2);
    return c;
  }
  /** 去除圖框/表格/尺寸線 + 去雜點，輸出黑白 canvas */
  function cleanCanvas(src, photo) {
    const W = src.width, H = src.height, bin = adaptiveBin(toGray(src, photo), W, H, photo);
    // 長直線（容許 3px 斷點、±1px 殘邊）視為圖框/表格/尺寸線
    const L = Math.max(60, Math.round(Math.min(W, H) * 0.025)), GAP = 3, kill = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      let start = -1, last = -1;
      for (let x = 0; x <= W; x++) {
        const on = x < W && bin[y * W + x];
        if (on) { if (start < 0 || x - last > GAP + 1) { if (start >= 0 && last - start + 1 >= L) for (let k = start; k <= last; k++) kill[y * W + k] = 1; start = x; } last = x; }
        else if (x === W && start >= 0 && last - start + 1 >= L) for (let k = start; k <= last; k++) kill[y * W + k] = 1;
      }
    }
    for (let x = 0; x < W; x++) {
      let start = -1, last = -1;
      for (let y = 0; y <= H; y++) {
        const on = y < H && bin[y * W + x];
        if (on) { if (start < 0 || y - last > GAP + 1) { if (start >= 0 && last - start + 1 >= L) for (let k = start; k <= last; k++) kill[k * W + x] = 1; start = y; } last = y; }
        else if (y === H && start >= 0 && last - start + 1 >= L) for (let k = start; k <= last; k++) kill[k * W + x] = 1;
      }
    }
    // 殘邊：被刪線上下/左右 2px 內、且自身不是長筆畫的像素
    const k2 = kill.slice();
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const p = y * W + x; if (!bin[p] || k2[p]) continue;
      if (k2[p - W] || k2[p + W] || k2[p - 2 * W] || k2[p + 2 * W]) { if (!(bin[p - 3 * W] && bin[p + 3 * W])) kill[p] = 2; }
      else if (k2[p - 1] || k2[p + 1] || k2[p - 2] || k2[p + 2]) { if (!(bin[p - 3] && bin[p + 3])) kill[p] = 2; }
    }
    // 去雜點：面積過小的連通區塊（摩爾紋、灰塵、紙紋）
    const on = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) on[p] = bin[p] && !kill[p] ? 1 : 0;
    const minArea = photo ? Math.max(14, Math.round(W * H / 400000)) : 3, lab = new Uint8Array(W * H), stack = new Int32Array(W * H);
    for (let p0 = 0; p0 < W * H; p0++) {
      if (!on[p0] || lab[p0]) continue;
      let sp = 0, n = 0; stack[sp++] = p0; lab[p0] = 1; const list = [];
      while (sp) { const p = stack[--sp]; n++; if (n <= minArea) list.push(p); const x = p % W;
        if (x > 0 && on[p - 1] && !lab[p - 1]) { lab[p - 1] = 1; stack[sp++] = p - 1; } if (x < W - 1 && on[p + 1] && !lab[p + 1]) { lab[p + 1] = 1; stack[sp++] = p + 1; }
        if (p >= W && on[p - W] && !lab[p - W]) { lab[p - W] = 1; stack[sp++] = p - W; } if (p < W * (H - 1) && on[p + W] && !lab[p + W]) { lab[p + W] = 1; stack[sp++] = p + W; } }
      if (n < minArea) for (const p of list) on[p] = 0;
    }
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d"), img = ctx.createImageData(W, H), d = img.data;
    for (let p = 0, i = 0; p < W * H; p++, i += 4) { const v = on[p] ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    return { c, bin, W, H };
  }

  const ANCHOR = /(圖\s*號|品\s*名|名\s*稱|材\s*[料質]|數\s*量|表\s*面|熱\s*處|比\s*例|單\s*位|CAD|DWG|MATERIAL|Q'?TY|SCALE|TITLE)/i;
  const CALLOUT = /^\d{1,2}\s*-\s*[ØM@0O]|^\d{1,2}-[A-Z]|^M\d{1,2}|^[Ø@]\d|^PT|x\s*\d+(\.\d+)?L$|通$/i;
  // 斜向孔/牙標註：「N-Ø…」「N-M…」開頭即可（後段常因 CAD 線字讀不準，但數量與孔徑已足夠估價）
  const SLANT_CALLOUT = /^\d{1,2}\s*-\s*(Ø\s*\d|M\s*\d|PT)/i;
  /** 孔/牙標註修正：8-26 / 8-@6 / 8-P6 → 8-Ø6；8-06.5x011 → 8-Ø6.5xØ11 */
  function fixCallout(t) {
    return t.replace(/^[@]/, "Ø").replace(/^(\d{1,2})\s*-\s*[0O@P2Ø](?=\d)/, "$1-Ø").replace(/^(\d{1,2})\s*-\s*[NW](?=\d)/, "$1-M").replace(/([xX×])\s*[0O@](?=\d)/g, "$1Ø").replace(/^(\d{1,2})-N(?=\d)/, "$1-M");
  }
  const JUNK = /^[一二三_\-—–=~.·,'"`|上丁]{1,}$|^[^\p{L}\p{N}Ø±]+$/u; // 殘線、雜點被讀成的字
  const DIMLIKE = /^(\d+\s*[-xX×]\s*)?[ØR@0oO]?\s*\d{1,4}(\.\d{1,3})?(\s*[±+\-]\s*0?\.\d+)?(\s*[a-hA-H]\d{1,2})?$/;

  async function ocrPass(worker, canvas, psm, tag) {
    await worker.setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: "1", user_defined_dpi: "300" });
    const { data } = await worker.recognize(canvas);
    const words = (data.words || []).filter((x) => x.text.trim() && x.confidence > 30 && !JUNK.test(x.text.trim()));
    return { tag, conf: data.confidence, words, anchors: words.filter((w) => ANCHOR.test(w.text) || (w.line && ANCHOR.test(w.line.text) && w.confidence > 50)).length };
  }
  const toItem = (w, mapFn, k) => { const p = mapFn(w.bbox); return { s: w.text.replace(/^[@]/, "Ø").replace(/[|]/g, "1"), x: p.x / k, y: p.y / k, h: p.h / k, conf: w.confidence }; };

  /**
   * 掃描圖 OCR（加強版）
   *  1. 縮放到約 300 dpi → 自適應二值化 → 自動校正傾斜
   *  2. 方向判斷：0° / 90° / 270° / 180° 以標題欄關鍵字數決定
   *  3. 主方向全頁辨識（稀疏文字）＋ 旋轉 90° 辨識直書尺寸
   *  4. 標題欄區域裁切放大，以表格模式再辨識一次，取代原結果
   */
  async function ocrCanvas(canvas, langs, onProgress) {
    const w = await getOcr(langs);
    const step = (m) => onProgress && onProgress(m);
    const photo = isPhoto(canvas);
    const { c: big, k } = scaledCanvas(canvas, 4600, photo ? 1.6 : 0);
    step(photo ? "前處理：翻拍照片模式（去摩爾紋）、二值化、校正傾斜" : "前處理：二值化、校正傾斜");
    const pre = cleanCanvas(big, photo);
    const ang = skewAngle(pre.bin, pre.W, pre.H);
    const straight = Math.abs(ang) > 0.15 ? rotateCanvas(big, -ang) : big;
    const clean0 = Math.abs(ang) > 0.15 ? cleanCanvas(straight, photo).c : pre.c;
    const W = clean0.width, H = clean0.height;
    // 各方向的座標換回 straight 座標
    const maps = {
      0: (b) => ({ x: b.x0, y: b.y1, h: b.y1 - b.y0 }),
      90: (b) => { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return { x: cy - (b.y1 - b.y0) / 2, y: H - cx + (b.x1 - b.x0) / 2, h: b.y1 - b.y0 }; },   // 畫面順時針轉 90°
      270: (b) => { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return { x: W - cy - (b.y1 - b.y0) / 2, y: cx + (b.x1 - b.x0) / 2, h: b.y1 - b.y0 }; },
      180: (b) => ({ x: W - b.x1, y: H - b.y0, h: b.y1 - b.y0 }),
    };
    step("OCR 0°");
    const p0 = await ocrPass(w, clean0, 11, 0);
    step("OCR 90°（直書尺寸／橫放圖）");
    const c90 = rotateCanvas(clean0, 90);
    const p90 = await ocrPass(w, c90, 11, 90);
    let main = p0, side = p90, mainCanvas = clean0;
    const canv = { 0: clean0, 90: c90 };
    if (p90.anchors > p0.anchors + 1) { main = p90; side = p0; mainCanvas = c90; }
    if (main.anchors < 2) {
      step("OCR 270°／180°");
      for (const deg of [270, 180]) {
        const cc = rotateCanvas(clean0, deg), pp = await ocrPass(w, cc, 11, deg); canv[deg] = cc;
        if (pp.anchors > main.anchors + 1) { if (main.tag === 0) side = p90; main = pp; mainCanvas = cc; }
      }
    }
    // 直書尺寸方向 = 主方向再順時針 90°（CAD 直書文字為逆時針 90°）
    const sideDeg = (main.tag + 90) % 360;
    if (side.tag !== sideDeg) {
      const known = { 0: p0, 90: p90 }[sideDeg];
      if (!canv[sideDeg]) canv[sideDeg] = rotateCanvas(clean0, sideDeg);
      side = known || await (step(`OCR ${sideDeg}°（直書尺寸）`), ocrPass(w, canv[sideDeg], 11, sideDeg));
    }
    // 尺寸行重讀：配合公差（g6、H7）或 ± 旁邊的數字常漏讀 → 裁切該行放大 3 倍、單行模式再讀
    const grayRot = {}; const gray = (deg) => (grayRot[deg] = grayRot[deg] || (deg ? rotateCanvas(straight, deg) : straight));
    async function reread(pass, canvas) {
      const extra = [];
      const keys = pass.words.filter((x) => /^[a-hA-H]\d{1,2}$|^[±+]\s*0?\.\d+$|^Ø$/.test(x.text.trim()));
      for (const kw of keys.slice(0, 8)) {
        const h = kw.bbox.y1 - kw.bbox.y0, x0 = Math.max(0, kw.bbox.x0 - h * 7), x1 = Math.min(canvas.width, kw.bbox.x1 + h * 2);
        const y0 = Math.max(0, kw.bbox.y0 - h * 0.6), y1 = Math.min(canvas.height, kw.bbox.y1 + h * 0.6), sc = 3;
        const cc = document.createElement("canvas"); cc.width = Math.round((x1 - x0) * sc); cc.height = Math.round((y1 - y0) * sc);
        const cx = cc.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cc.width, cc.height); cx.imageSmoothingQuality = "high"; cx.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, cc.width, cc.height);
        cx.fillRect(0, 0, cc.width, cc.height); cx.drawImage(gray(pass.tag), x0, y0, x1 - x0, y1 - y0, 0, 0, cc.width, cc.height);
        const r = await readLine(cc);
        // 白名單下 Ø 常被讀成 0 / 2 / 3 / @：以字形判斷第一個字是否為 Ø
        r.words.forEach((x) => { x.text = x.text.replace(/^[@]/, "Ø"); });
        if (r.words[0] && /^\d{2,5}(\.\d+)?$/.test(r.words[0].text)) {
          const tight = document.createElement("canvas"), bx = r.words[0].bbox, pad = 6;
          tight.width = bx.x1 - bx.x0 + pad * 2; tight.height = bx.y1 - bx.y0 + pad * 2;
          const tc = tight.getContext("2d"); tc.fillStyle = "#fff"; tc.fillRect(0, 0, tight.width, tight.height); tc.drawImage(cc, bx.x0 - pad, bx.y0 - pad, tight.width, tight.height, 0, 0, tight.width, tight.height);
          if (firstGlyphIsDiameter(tight)) r.words[0].text = "Ø" + r.words[0].text.slice(1);
        }
        const txt = r.words.map((x) => x.text).join(" ").trim();
        const strong = /^Ø?\d{1,4}(\.\d+)?\s*([a-hA-H]\d{1,2}|±\s*0?\.\d+)$/.test(txt); // 「數字 + 配合公差」型態本身就可信
        if (txt && (r.conf > 50 || strong) && /\d/.test(txt)) extra.push({ text: txt, confidence: Math.max(r.conf, strong ? 70 : 0), bbox: { x0, y0, x1, y1 } });
      }
      return extra;
    }
    step("尺寸行重讀");
    side.words = side.words.concat(await reread(side, canv[side.tag]));
    main.words = main.words.concat(await reread(main, canv[main.tag]));
    // 主方向座標系：輸出一律換成「主方向畫面」座標，讓標題欄左右/上下關係正確
    const mW = mainCanvas.width, mH = mainCanvas.height;
    const toMain = (pt) => { // straight 座標 → 主方向座標
      if (main.tag === 0) return pt;
      if (main.tag === 90) return { x: H - pt.y, y: pt.x, h: pt.h };
      if (main.tag === 270) return { x: pt.y, y: W - pt.x, h: pt.h };
      return { x: W - pt.x, y: H - pt.y, h: pt.h };
    };
    let items = main.words.filter((x) => x.confidence > 40).map((x) => toItem(x, (b) => ({ x: b.x0, y: b.y1, h: b.y1 - b.y0 }), k));
    // 直書尺寸：從另一方向取數字型文字
    const sideMap = (b) => toMain(maps[side.tag](b));
    for (const x of side.words) {
      if (x.confidence < 55 || !(DIMLIKE.test(x.text.trim()) || /^[ØR@0oO]?\s*\d{1,4}(\.\d+)?\s*([a-hA-H]\d{1,2}|±\s*0?\.\d+)$/.test(x.text.trim()))) continue;
      const it = toItem(x, sideMap, k);
      if (!items.some((o) => o.s === it.s && Math.abs(o.x - it.x) < it.h * 3 && Math.abs(o.y - it.y) < it.h * 3)) items.push({ ...it, vertical: true });
    }
    // 數字專用辨識（主方向 + 直書方向）：取代同位置信心較低的數字
    {
      step("數字專用辨識");
      for (const [pass, cvs, mapFn] of [[main, canv[main.tag], (b) => ({ x: b.x0, y: b.y1, h: b.y1 - b.y0 })], [side, canv[side.tag], sideMap]]) {
        const np = await numericPass(cvs, "n" + pass.tag);
        for (const x of np.words) {
          const t = fixCallout(x.text.trim()); if (x.confidence < 60 || !(DIMLIKE.test(t) || CALLOUT.test(t))) continue;
          const it = { ...toItem({ ...x, text: t }, mapFn, k), numeric: true, vertical: pass === side || undefined };
          const near = items.filter((o) => Math.abs(o.x - it.x) < it.h * 2.5 && Math.abs(o.y - it.y) < it.h * 0.8 && /\d/.test(o.s));
          if (near.some((o) => o.s === it.s)) continue;
          if (near.length && near.every((o) => (o.conf || 0) < x.confidence)) items = items.filter((o) => !near.includes(o));
          if (!near.length || near.every((o) => (o.conf || 0) < x.confidence)) items.push(it);
        }
      }
    }

    // 斜引線標註（孔、螺牙）：以 ±20°/±35°/±50° 各讀一次，只保留孔/牙型文字
    const have = items.filter((it) => CALLOUT.test(it.s)).length;
    {
      const { c: mid, k: km } = scaledCanvas(gray(main.tag), 3000);
      for (const deg of [-20, 20, -35, 35, -50, 50]) {
        step(`OCR 斜向標註 ${deg}°`);
        const rc = rotateCanvas(mid, deg), rcc = cleanCanvas(rc, photo).c, pr = await ocrPass(w, rcc, 11, "a" + deg); // 轉正後引線變水平，順便被去線
        const cxr = rc.width / 2, cyr = rc.height / 2, cx0 = mid.width / 2, cy0 = mid.height / 2, rr = -deg * Math.PI / 180;
        for (const x of pr.words) {
          const t = fixCallout(x.text.trim()); if (x.confidence < 15 || !SLANT_CALLOUT.test(t)) continue;
          const px = (x.bbox.x0 + x.bbox.x1) / 2 - cxr, py = (x.bbox.y0 + x.bbox.y1) / 2 - cyr;
          const ox = (px * Math.cos(rr) - py * Math.sin(rr) + cx0) / km, oy = (px * Math.sin(rr) + py * Math.cos(rr) + cy0) / km; // 換回主方向座標
          const it = { s: t, x: ox / k, y: oy / k, h: (x.bbox.y1 - x.bbox.y0) / km / k, conf: x.confidence, slanted: deg };
          if (!items.some((o) => Math.hypot(o.x - it.x, o.y - it.y) < it.h * 4 && (o.s === it.s || (o.slanted != null && o.conf >= it.conf)))) {
            items = items.filter((o) => !(o.slanted != null && Math.hypot(o.x - it.x, o.y - it.y) < it.h * 4));
            items.push(it);
          }
        }
      }
      void have;
    }

    // 標題欄裁切重辨識
    const anchors = main.words.filter((x) => ANCHOR.test(x.text) && x.confidence > 40);
    if (anchors.length >= 2) {
      step("OCR 標題欄");
      const hh = Math.max(...anchors.map((a) => a.bbox.y1 - a.bbox.y0));
      const bx0 = Math.max(0, Math.min(...anchors.map((a) => a.bbox.x0)) - hh), by0 = Math.max(0, Math.min(...anchors.map((a) => a.bbox.y0)) - hh * 1.5);
      const bx1 = Math.min(mW, Math.max(...anchors.map((a) => a.bbox.x1)) + mW * 0.32), by1 = Math.min(mH, Math.max(...anchors.map((a) => a.bbox.y1)) + hh * 2);
      const s = 2, crop = document.createElement("canvas"); crop.width = Math.round((bx1 - bx0) * s); crop.height = Math.round((by1 - by0) * s);
      const cx = crop.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, crop.width, crop.height); cx.imageSmoothingQuality = "high";
      cx.drawImage(mainCanvas, bx0, by0, bx1 - bx0, by1 - by0, 0, 0, crop.width, crop.height);
      const back = (b) => ({ x: bx0 + b.x0 / s, y: by0 + b.y1 / s, h: (b.y1 - b.y0) / s });
      // 稀疏 + 表格兩種模式各跑一次，同位置取信心高者
      const pa = await ocrPass(w, crop, 11, "tb11"), pb = await ocrPass(w, crop, 6, "tb6");
      const cand = [...pa.words, ...pb.words].filter((x) => x.confidence > 45).map((x) => toItem(x, back, k)).sort((a, b) => b.conf - a.conf);
      const tbItems = [];
      for (const it of cand) if (!tbItems.some((o) => Math.abs(o.y - it.y) < it.h * 0.6 && it.x < o.x + o.s.length * o.h && o.x < it.x + it.s.length * it.h)) tbItems.push(it);
      if (tbItems.length >= 4) {
        const inBox = (it) => it.x * k >= bx0 && it.x * k <= bx1 && it.y * k >= by0 && it.y * k <= by1 + hh;
        items = items.filter((it) => !inBox(it)).concat(tbItems.map((t) => ({ ...t, titleBlock: true })));
      }
    }
    return { items, photo, meanConf: main.conf, rotation: main.tag, skew: ang, titleBox: anchors.length >= 2, view: gray(main.tag), k };
  }

  /** 預覽圖（1400px 寬）＋ 圖面座標 → 預覽像素的換算，供標示辨識位置 */
  function thumb(canvas, map = { sx: 1, ox: 0, sy: 1, oy: 0 }, w = 1400) {
    const f = Math.min(1, w / canvas.width) || 1, c = document.createElement("canvas"); c.width = Math.round(canvas.width * f); c.height = Math.round(canvas.height * f);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.imageSmoothingQuality = "high"; ctx.drawImage(canvas, 0, 0, c.width, c.height);
    return { preview: c.toDataURL("image/jpeg", 0.85), previewSize: { w: c.width, h: c.height }, previewMap: { sx: map.sx * f, ox: map.ox * f, sy: map.sy * f, oy: map.oy * f } };
  }

  /**
   * PDF 文字層整理：CAD 匯出的 PDF 常把直書尺寸「Ø」「1」「0」「0」逐字輸出，
   * 依文字方向與間距把連續的字合併成一段，並標記直書（90°）／斜向文字。
   */
  function mergePdfText(raw, pageH) {
    const out = [];
    for (const i of raw) {
      if (!i.str || !i.str.trim()) { continue; }
      const t = i.transform, ang = Math.atan2(t[1], t[0]) * 180 / Math.PI, h = Math.hypot(t[2], t[3]) || 8;
      const cos = Math.cos(ang * Math.PI / 180), sin = Math.sin(ang * Math.PI / 180);
      const w = i.width || i.str.length * h * 0.6;
      const prev = out[out.length - 1];
      if (prev && Math.abs(prev.ang - ang) < 2 && h / prev.h > 0.75 && h / prev.h < 1.33) {
        const dx = t[4] - prev.ex, dy = t[5] - prev.ey;          // 與上一段結尾的距離（PDF 座標）
        const along = dx * cos + dy * sin, perp = -dx * sin + dy * cos;
        if (along > -0.4 * h && along < 0.9 * h && Math.abs(perp) < 0.35 * h) {
          prev.s += (along > 0.3 * h ? " " : "") + i.str; prev.ex = t[4] + w * cos; prev.ey = t[5] + w * sin; continue;
        }
      }
      out.push({ s: i.str, ox: t[4], oy: t[5], ex: t[4] + w * cos, ey: t[5] + w * sin, h, ang });
    }
    return out.map((o) => {
      const a = ((o.ang % 360) + 360) % 360, vertical = Math.abs(a - 90) < 3 || Math.abs(a - 270) < 3, flat = a < 3 || a > 357 || Math.abs(a - 180) < 3;
      return { s: o.s, x: o.ox, y: pageH - o.oy, h: o.h, ...(vertical ? { vertical: true } : {}), ...(!vertical && !flat ? { slanted: -o.ang } : {}) };
    });
  }

  /**
   * PDF 向量幾何（不經 OCR）：從繪圖指令取出直線與圓。
   *  - 圓：貝茲曲線或多邊形近似的封閉路徑，半徑變異 < 6%
   *  - 用途：辨認以線條畫出的 Ø 符號、圓形視圖、以線長驗證尺寸與比例
   */
  async function pdfGeometry(page, lib, pageH) {
    const OPS = lib.OPS, ol = await page.getOperatorList();
    const segs = [], circles = [];
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    const P = (x, y) => ({ x: ctm[0] * x + ctm[2] * y + ctm[4], y: pageH - (ctm[1] * x + ctm[3] * y + ctm[5]) });
    const finish = (sub) => {
      if (sub.pts.length < 2) return;
      const pts = sub.pts, closed = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.5 || sub.closed;
      if (closed && (sub.curves >= 2 || pts.length >= 12)) {
        let on = sub.curves ? sub.on : pts; // 貝茲曲線只用曲線上的端點（控制點不在圓上）
        if (on.length > 2 && Math.hypot(on[0].x - on[on.length - 1].x, on[0].y - on[on.length - 1].y) < 0.5) on = on.slice(0, -1); // 起終點重複只算一次
        const cx = on.reduce((a, p) => a + p.x, 0) / on.length, cy = on.reduce((a, p) => a + p.y, 0) / on.length;
        const rs = on.map((p) => Math.hypot(p.x - cx, p.y - cy)), r = rs.reduce((a, b) => a + b, 0) / rs.length;
        const sd = Math.sqrt(rs.reduce((a, b) => a + (b - r) ** 2, 0) / rs.length);
        if (r > 0.2 && sd / r < 0.06) { circles.push({ x: cx, y: cy, r }); return; }
      }
      if (!sub.curves) for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y); if (len > 0.3) segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, len }); }
    };
    for (let i = 0; i < ol.fnArray.length && segs.length < 200000; i++) {
      const fn = ol.fnArray[i], args = ol.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args[0]) ctm = mul(ctm, args[0]); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.constructPath) {
        const ops = args[0], co = args[1]; let k = 0, sub = { pts: [], on: [], curves: 0 };
        for (const op of ops) {
          if (op === OPS.moveTo) { finish(sub); const p0 = P(co[k], co[k + 1]); sub = { pts: [p0], on: [p0], curves: 0 }; k += 2; }
          else if (op === OPS.lineTo) { const q = P(co[k], co[k + 1]); sub.pts.push(q); sub.on.push(q); k += 2; }
          else if (op === OPS.curveTo) { const q = P(co[k + 4], co[k + 5]); sub.pts.push(P(co[k], co[k + 1]), P(co[k + 2], co[k + 3]), q); sub.on.push(q); sub.curves++; k += 6; }
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) { const q = P(co[k + 2], co[k + 3]); sub.pts.push(P(co[k], co[k + 1]), q); sub.on.push(q); sub.curves++; k += 4; }
          else if (op === OPS.closePath) { sub.closed = true; }
          else if (op === OPS.rectangle) { finish(sub); const x = co[k], y = co[k + 1], w = co[k + 2], h = co[k + 3]; sub = { pts: [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h), P(x, y)], on: [], curves: 0 }; finish(sub); sub = { pts: [], on: [], curves: 0 }; k += 4; }
        }
        finish(sub);
      }
    }
    // 共線且相接的水平／垂直線段合併成一段（軸的多段外形、分段畫的外框）→ 用來量測全長
    const spans = [];
    for (const dir of ["h", "v"]) {
      const g = {};
      for (const sg of segs) {
        const hz = Math.abs(sg.y1 - sg.y2) < 0.2, vt = Math.abs(sg.x1 - sg.x2) < 0.2;
        if ((dir === "h" && !hz) || (dir === "v" && !vt)) continue;
        const key = Math.round((dir === "h" ? sg.y1 : sg.x1) * 2) / 2, a = dir === "h" ? Math.min(sg.x1, sg.x2) : Math.min(sg.y1, sg.y2), b = dir === "h" ? Math.max(sg.x1, sg.x2) : Math.max(sg.y1, sg.y2);
        (g[key] = g[key] || []).push([a, b]);
      }
      for (const arr of Object.values(g)) {
        arr.sort((p, q) => p[0] - q[0]); let [a, b] = arr[0];
        for (const [c, d] of arr.slice(1)) { if (c <= b + 0.6) b = Math.max(b, d); else { if (b - a > 1) spans.push(b - a); [a, b] = [c, d]; } }
        if (b - a > 1) spans.push(b - a);
      }
    }
    return { segs, circles, spans };
  }

  /** 以線條畫出的 Ø：數字前方約半個字高處，有「小圓 + 穿過圓心的斜線」→ 在數字前補上 Ø */
  function applyVectorDiameter(items, geom) {
    const small = geom.circles.filter((c) => c.r < 6);
    let n = 0;
    for (const it of items) {
      if (!/^\d/.test(it.s)) continue;
      const h = it.h || 3;
      const exp = it.vertical ? { x: it.x - 0.38 * h, y: it.y + 0.55 * h } : { x: it.x - 0.55 * h, y: it.y - 0.38 * h };
      const c = small.find((c) => c.r > 0.15 * h && c.r < 0.75 * h && Math.hypot(c.x - exp.x, c.y - exp.y) < 0.9 * h &&
        geom.segs.some((s) => s.len > 1.5 * c.r && s.len < 4 * c.r && Math.hypot((s.x1 + s.x2) / 2 - c.x, (s.y1 + s.y2) / 2 - c.y) < 0.5 * c.r));
      if (c) { it.s = "Ø" + it.s; it.vecDia = true; n++; }
    }
    return n;
  }

  /** 讀一個檔案 → 一或多張圖面（PDF 每頁一張） */
  async function readFile(file, opts = {}, onStep = () => {}) {
    const name = file.name, ext = (name.split(".").pop() || "").toLowerCase();
    const langs = opts.langs || "eng+chi_tra";
    if (ext === "dxf") {
      onStep("解析 DXF 向量圖");
      const dxf = root.DXF.parseDXF(new Uint8Array(await file.arrayBuffer()));
      const c = document.createElement("canvas"); const bw = dxf.bbox.x1 - dxf.bbox.x0, bh = dxf.bbox.y1 - dxf.bbox.y0;
      c.width = 1400; c.height = Math.max(200, Math.round(1400 * bh / Math.max(bw, 1e-6)));
      root.DXF.drawDXF(dxf, c);
      const pad = 8, sc = Math.min((c.width - 2 * pad) / Math.max(bw, 1e-6), (c.height - 2 * pad) / Math.max(bh, 1e-6));
      return [{ fileName: name, page: 1, source: "dxf", ...thumb(c, { sx: sc, ox: pad - dxf.bbox.x0 * sc, sy: sc, oy: c.height - pad + dxf.bbox.y0 * sc }), input: root.DrawingParser.fromDXF(dxf, name), note: `DXF 單位：${dxf.units}；文字 ${dxf.texts.length}、標註 ${dxf.dims.length}、圓 ${dxf.circles.length}` }];
    }
    if (ext === "pdf") {
      onStep("讀取 PDF");
      const lib = await getPdfjs();
      const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: base(VENDOR.cmaps), cMapPacked: true }).promise;
      const out = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        onStep(`PDF 第 ${n}/${pdf.numPages} 頁`);
        const page = await pdf.getPage(n);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        let items = mergePdfText(tc.items, vp.height);
        let geom = { segs: [], circles: [] }, vecDia = 0;
        try { geom = await pdfGeometry(page, lib, vp.height); vecDia = applyVectorDiameter(items, geom); } catch (e) { console.warn("PDF 向量解析略過", e); }
        const scale = Math.min(4.2, 4600 / Math.max(vp.width, vp.height)); // 約 300 dpi
        const c = document.createElement("canvas"); const v2 = page.getViewport({ scale }); c.width = v2.width; c.height = v2.height;
        const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: v2 }).promise;
        let source = "pdf", note = `PDF 文字層 ${items.length} 段`, view = thumb(c, { sx: scale, ox: 0, sy: scale, oy: 0 });
        if (items.length < 6 && opts.ocrPdf !== false) {
          onStep(`第 ${n} 頁無文字層，OCR 辨識中`);
          const r = await ocrCanvas(c, langs, (m) => onStep(`第 ${n} 頁 ${m}`));
          items = r.items.map((i) => ({ ...i, x: i.x / scale, y: i.y / scale, h: i.h / scale })); source = "ocr";
          view = thumb(r.view, { sx: scale * r.k, ox: 0, sy: scale * r.k, oy: 0 }); // 顯示校正後（轉正、去傾斜）的圖 note = `掃描 PDF，OCR 信心 ${Math.round(r.meanConf)}%${r.rotation ? `，已轉正 ${r.rotation}°` : ""}${Math.abs(r.skew) > 0.15 ? `，校正傾斜 ${r.skew.toFixed(1)}°` : ""}`;
        }
        out.push({ fileName: pdf.numPages > 1 ? `${name.replace(/\.pdf$/i, "")}_p${n}.pdf` : name, page: n, source, ...view, input: { source, fileName: name, items, dims: [], circles: [], geom: source === "pdf" ? { segs: [...geom.segs.map((g) => g.len), ...(geom.spans || [])], circles: geom.circles.filter((c) => c.r >= 1.2), pageW: vp.width, pageH: vp.height } : null }, note: note + (vecDia ? `；線條 Ø 符號 ${vecDia} 處` : "") });
      }
      return out;
    }
    if (/^(png|jpe?g|bmp|webp|gif|tiff?)$/.test(ext)) {
      onStep("載入圖片");
      const bmp = await createImageBitmap(file);
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
      onStep("OCR 辨識中");
      const r = await ocrCanvas(c, langs, onStep);
      return [{ fileName: name, page: 1, source: "ocr", ...thumb(r.view, { sx: r.k, ox: 0, sy: r.k, oy: 0 }), input: { source: "ocr", fileName: name, items: r.items, dims: [], circles: [] }, note: `OCR 信心 ${Math.round(r.meanConf)}%${r.rotation ? `，已轉正 ${r.rotation}°` : ""}${Math.abs(r.skew) > 0.15 ? `，校正傾斜 ${r.skew.toFixed(1)}°` : ""}，請核對尺寸` }];
    }
    throw new Error(`不支援的格式 .${ext}（支援 DXF、PDF、PNG、JPG）。DWG 請先在 CAD 另存為 DXF 或 PDF。`);
  }

  root.DrawingReader = { readFile, isFileProtocol };
})(typeof globalThis !== "undefined" ? globalThis : this);
