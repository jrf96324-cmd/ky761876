# 圖片／PDF 轉文字 OCR（繁中＋英文數字）

單一 `index.html`，在瀏覽器本機完成辨識，檔案不上傳。

## 功能
- 圖片（PNG/JPG/WebP…）、貼上截圖、擷取螢幕、**PDF（多頁）**
- PDF 有內嵌文字（非掃描）→ 直接讀取，最快最準；掃描版 → 逐頁轉影像後 OCR
- 繁中＋英文＋數字，全形英數自動轉半形
- 辨識完自動複製，另有「📋 一鍵複製」按鈕（`Ctrl+Shift+C`）
- 匯出 TXT／CSV、轉名單分欄（貼 Excel）、合併斷行成段落

## 辨識強化
- **智慧前處理（預設開）**：估算字高並放大到約 42 px、局部自適應二值化（彩色底也穩定）、移除表格框線與超連結底線、去雜點，輸出灰階給 LSTM 引擎
- **表格自動分格辨識（預設開）**：偵測到框線時一格一格辨識（合併儲存格自動處理），輸出以 Tab 分欄，可直接貼 Excel
  - 小字彩色表格測試：字元正確率 19.4% → 93.0%（高精度 94.5%）
- 放大「自動」：依圖片大小選 1.5×／2×／3×
- 自動判斷深色底並反白
- 自動校正歪斜（掃描、翻拍）
- 高精度（雙重比對）：原圖與自動二值化各辨識一次，取信心值高者
- 工程數字／標點校正：`4O0V→400V`、`l2→12`、`400Ww→400W`、中文旁的半形逗號轉全形；`SUS304`、`B1O` 等型號不受影響
- 表格模式：依文字位置以 Tab 分欄，可直接貼入 Excel
- 低信心字在預覽圖上以紅框標示，方便人工核對
- 自訂校正字典（`錯誤=>正確`，存在本機瀏覽器，辨識後自動套用）

## 兩個版本

| 檔案 | 大小 | 用法 |
|---|---|---|
| `ocr-offline.html` | 約 8.3 MB | **建議**：離線單檔版，下載後直接雙擊開啟，不需網路、不需 assets 資料夾（內建繁中＋英文；需 Chrome/Edge 80 以上或 Safari 16.4 以上） |
| `index.html` | 約 50 KB | 線上版：開啟時依序從 jsDelivr → unpkg → npmmirror 載入引擎；公司網路封鎖 CDN 時無法使用 |

右上角徽章顯示目前引擎狀態；若出現「⚠️ OCR 引擎未載入」，代表網路擋住了 CDN，請改用 `ocr-offline.html`。

## 重新產生離線單檔版

```
npm i tesseract.js@5.1.1 tesseract.js-core@5.1.1 pdfjs-dist@3.11.174 @tesseract.js-data/chi_tra@1.0.0 @tesseract.js-data/eng@1.0.0
python3 build-offline.py ./node_modules ocr-offline.html
```

## 本機 assets 模式（選用）
以網頁伺服器開啟 `index.html` 時，也可在旁邊放 `assets/`：

```
assets/tesseract.min.js        tesseract.js@5.1.1  dist/
assets/worker.min.js           tesseract.js@5.1.1  dist/
assets/core/                   tesseract.js-core@5.1.1 的 *.js 與 *.wasm
assets/lang/chi_tra.traineddata.gz   @tesseract.js-data/chi_tra  4.0.0_best_int/
assets/lang/eng.traineddata.gz       @tesseract.js-data/eng      4.0.0_best_int/
assets/pdf.min.js              pdfjs-dist@3.11.174 build/
assets/pdf.worker.min.js       pdfjs-dist@3.11.174 build/
```
