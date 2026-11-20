/*
 * 瀏覽器端圖面讀取：DXF（向量）→ PDF（文字層，無文字則 OCR）→ 圖片（OCR）
 * 全部使用本機 vendor/ 函式庫，不連網。
 */
(function (root) {
  const base = (p) => new URL(p, location.href).href;
  const VENDOR = {
    pdf: "vendor/pdfjs/pdf.min.js", pdfWorker: "vendor/pdfjs/pdf.worker.min.js", cmaps: "vendor/pdfjs/cmaps/",
    tess: "vendor/tesseract/tesseract.min.js", tessWorker: "vendor/tesseract/worker.min.js", tessCore: "vendor/tesseract/", tessLang: "vendor/tessdata",
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
  async function getOcr(langs, onProgress) {
    if (isFileProtocol()) throw new Error("影像 OCR 需要用 START 啟動檔開啟（瀏覽器限制 file:// 執行背景辨識）。DXF 與含文字的 PDF 不受影響。");
    await loadScript(VENDOR.tess);
    if (ocrWorker && ocrLangs === langs) return ocrWorker;
    if (ocrWorker) await ocrWorker.terminate();
    ocrWorker = await root.Tesseract.createWorker(langs.split("+"), 1, {
      workerPath: base(VENDOR.tessWorker), corePath: base(VENDOR.tessCore), langPath: base(VENDOR.tessLang), workerBlobURL: false, gzip: true,
      logger: (m) => onProgress && m.status === "recognizing text" && onProgress(m.progress),
    });
    await ocrWorker.setParameters({ tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" }); // 稀疏文字：適合工程圖
    ocrLangs = langs;
    return ocrWorker;
  }

  function preprocess(src, maxSide = 4200) {
    // 灰階 + 對比拉伸，放大到適合 OCR 的解析度
    const k = Math.max(1, Math.min(maxSide / Math.max(src.width, src.height), 3));
    const c = document.createElement("canvas"); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    const W = c.width, H = c.height, bin = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) bin[p] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) < 150 ? 1 : 0;
    // 移除圖框、表格線、尺寸線（長直線會讓 OCR 把標題欄文字讀錯）
    const L = Math.max(70, Math.round(Math.min(W, H) * 0.035)), kill = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { let run = 0; for (let x = 0; x <= W; x++) { const b = x < W && bin[y * W + x]; if (b) run++; else { if (run >= L) for (let k = x - run; k < x; k++) kill[y * W + k] = 1; run = 0; } } }
    for (let x = 0; x < W; x++) { let run = 0; for (let y = 0; y <= H; y++) { const b = y < H && bin[y * W + x]; if (b) run++; else { if (run >= L) for (let k = y - run; k < y; k++) kill[k * W + x] = 1; run = 0; } } }
    for (let p = 0, i = 0; p < W * H; p++, i += 4) { const v = bin[p] && !kill[p] ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, k };
  }

  async function ocrCanvas(canvas, langs, onProgress) {
    const w = await getOcr(langs, onProgress);
    const { canvas: pc, k } = preprocess(canvas);
    const { data } = await w.recognize(pc);
    const items = (data.words || []).filter((x) => x.confidence > 35 && x.text.trim()).map((x) => ({
      s: x.text.replace(/^[@]/, "Ø").replace(/[|]/g, "1"), x: x.bbox.x0 / k, y: x.bbox.y1 / k, h: (x.bbox.y1 - x.bbox.y0) / k, conf: x.confidence,
    }));
    return { items, meanConf: data.confidence };
  }

  function thumb(canvas, w = 520) {
    const k = w / canvas.width, c = document.createElement("canvas"); c.width = w; c.height = Math.round(canvas.height * k);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
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
      return [{ fileName: name, page: 1, source: "dxf", preview: thumb(c, 900), input: root.DrawingParser.fromDXF(dxf, name), note: `DXF 單位：${dxf.units}；文字 ${dxf.texts.length}、標註 ${dxf.dims.length}、圓 ${dxf.circles.length}` }];
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
        let items = tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: vp.height - i.transform[5], h: Math.hypot(i.transform[2], i.transform[3]) || 8 }));
        const scale = Math.min(2.5, 3200 / Math.max(vp.width, vp.height));
        const c = document.createElement("canvas"); const v2 = page.getViewport({ scale }); c.width = v2.width; c.height = v2.height;
        const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: v2 }).promise;
        let source = "pdf", note = `PDF 文字層 ${items.length} 段`;
        if (items.length < 6 && opts.ocrPdf !== false) {
          onStep(`第 ${n} 頁無文字層，OCR 辨識中`);
          const r = await ocrCanvas(c, langs, (p) => onStep(`第 ${n} 頁 OCR ${Math.round(p * 100)}%`));
          items = r.items.map((i) => ({ ...i, x: i.x / scale, y: i.y / scale, h: i.h / scale })); source = "ocr"; note = `掃描/向量字 PDF，OCR 信心 ${Math.round(r.meanConf)}%`;
        }
        out.push({ fileName: pdf.numPages > 1 ? `${name.replace(/\.pdf$/i, "")}_p${n}.pdf` : name, page: n, source, preview: thumb(c, 900), input: { source, fileName: name, items, dims: [], circles: [] }, note });
      }
      return out;
    }
    if (/^(png|jpe?g|bmp|webp|gif|tiff?)$/.test(ext)) {
      onStep("載入圖片");
      const bmp = await createImageBitmap(file);
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
      onStep("OCR 辨識中");
      const r = await ocrCanvas(c, langs, (p) => onStep(`OCR ${Math.round(p * 100)}%`));
      return [{ fileName: name, page: 1, source: "ocr", preview: thumb(c, 900), input: { source: "ocr", fileName: name, items: r.items, dims: [], circles: [] }, note: `OCR 信心 ${Math.round(r.meanConf)}%，請核對尺寸` }];
    }
    throw new Error(`不支援的格式 .${ext}（支援 DXF、PDF、PNG、JPG）。DWG 請先在 CAD 另存為 DXF 或 PDF。`);
  }

  root.DrawingReader = { readFile, isFileProtocol };
})(typeof globalThis !== "undefined" ? globalThis : this);
