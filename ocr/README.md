# 圖片／PDF 轉文字 OCR（繁中＋英文數字）

單一 `index.html`，在瀏覽器本機完成辨識，檔案不上傳。

## 功能
- 圖片（PNG/JPG/WebP…）、貼上截圖、擷取螢幕、**PDF（多頁）**
- PDF 有內嵌文字（非掃描）→ 直接讀取，最快最準；掃描版 → 逐頁轉影像後 OCR
- 繁中＋英文＋數字，全形英數自動轉半形
- 辨識完自動複製，另有「📋 一鍵複製」按鈕（`Ctrl+Shift+C`）
- 匯出 TXT／CSV、轉名單分欄（貼 Excel）

## 離線使用（選用）
有網路時自動從 CDN 載入引擎。若要完全離線，在 `index.html` 旁建立 `assets/`：

```
assets/tesseract.min.js        tesseract.js@5.1.1  dist/
assets/worker.min.js           tesseract.js@5.1.1  dist/
assets/core/                   tesseract.js-core@5.1.1 的 *.js 與 *.wasm
assets/lang/chi_tra.traineddata.gz   @tesseract.js-data/chi_tra  4.0.0_best_int/
assets/lang/eng.traineddata.gz       @tesseract.js-data/eng      4.0.0_best_int/
assets/pdf.min.js              pdfjs-dist@3.11.174 build/
assets/pdf.worker.min.js       pdfjs-dist@3.11.174 build/
```

離線模式需用本機網頁伺服器開啟（例如 `npx serve ocr`）；直接雙擊 html 時會改用線上引擎（圖片仍只在本機處理）。
