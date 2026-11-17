---
name: frame-configurator-builder
description: 製作「單檔、可離線」的互動式網頁配置器程式（HTML 設計工具），主題是鋁擠型或型材結構的設備與構造物，例如圍籬、安全護欄、機台外罩、工作台、貨架、輸送機架、龍門架、無塵室隔間、機器人工作站圍欄、展示架。成品有 Three.js 3D 預覽（可旋轉、點料件改尺寸或顏色、點尺寸標籤直接輸入）、選型卡片（型材系列、顏色、板材、接點與轉角配件、門五金、底座）、BOM 裁切清單、長料下料排版、估價單，以及工程三視圖與匯出（2D 向量 PDF 照比例可量測、PDF 報告書、STEP AP214 組立件、CSV）。使用者說「做一個像圍籬程式一樣的…」「參數化設計器」「線上選配／報價工具」「輸入尺寸就自動出 BOM 和 3D」「可以匯出 STEP 和 PDF 的網頁」，或要把現有 HTML 設計器加上 STEP、PDF、BOM、估價、配件選型時，都要使用本 skill，即使沒有明說「配置器」。Use for any parametric aluminium-extrusion / frame / guard / enclosure configurator web app with 3D, BOM, cost estimate, STEP or PDF export. 不適用於：在 CAD 中直接建模單一 STEP 零件、整站機器人模擬，或純文件型的評估報告。
---

# 鋁擠型結構配置器產生器

在這裡做的是給工程師或業務使用的工具：調整尺寸、選配件，立刻看到 3D，並取得料單、價格和圖面。品質標準有三：看到的、算到的、匯出的完全一致；使用者的電腦（常是公司的 Windows 加 Chrome）打開就能用；匯出的 STEP 和 PDF 能直接進入 CAD 與工廠流程。

本 skill 提供：
- `assets/starter.html`：可直接執行的機架配置器範本。功能都已接好，包括 3D、選取編輯、尺寸標籤、三視圖、BOM、下料、估價，以及 CSV、2D PDF、報告 PDF、STEP 四種匯出。新題目從它改起。
- `assets/lib/*.js`：已驗證的零相依程式庫（T 槽斷面、STEP 稜柱幾何、排料、STEP AP214、向量／圖片 PDF），build 時自動內嵌。
- `assets/examples/fence-designer.src.html`：功能最完整的實例（圍籬：6 種結構模式、門與門五金、逐片指定材質、轉角配件、InstancedMesh 角座）。需要門、配件選型、逐片材質時，直接參考它的作法。
- `scripts/`：抓 three.js、組成單一 HTML、冒煙測試、STEP 驗證。
- `references/`：架構（architecture.md）、踩過的坑（pitfalls.md）、領域資料與參考價格（domain-data.md）。

## 工作流程

### 1. 釐清需求（先看對話，不要逼問）
需要知道：結構類型與格線（寬、深、高方向各有幾格或幾層）、哪些面裝板、特殊組件（門、抽屜、檯面、斜撐…）、要選型的配件、要哪些輸出。對話或附件已有答案就直接採用；缺少的部分用 domain-data.md 的常見預設值先做出來，並在交付時列出你做的假設。只有會大幅改變結構的不確定點才問使用者（例如「門要開在哪一面？」）。

### 2. 準備環境
```bash
SK=<本 skill 路徑>; WORK=<scratchpad 或專案資料夾>
bash $SK/scripts/fetch_three.sh $WORK/vendor          # three.js r128（非模組版，可內嵌）
cp $SK/assets/starter.html $WORK/app.src.html
```
開發時只修改 `app.src.html`，它保留了 `/*__THREE__*/`、`/*__ORBIT__*/`、`/*__LIBS__*/` 三個佔位字串。

### 3. 建模：先改資料與 buildParts()
閱讀 `references/architecture.md` 第 1–4 節。核心原則：**所有輸出都從 `buildParts()` 產生的 parts 陣列取數**。3D、2D、BOM、STEP 都不另外算尺寸，才不會互相矛盾。
- 尺寸用「總尺寸＋各格淨距陣列」表示，保留鎖定總尺寸的邏輯。
- 型材長度＝淨距。板材下料＝淨距＋2×入槽。在 BOM 寫出這些規則，讓使用者可以核對。
- 每個 part 都要有穩定的 id，以及 dir、bay、lvl 等拓樸欄位，「點料件改尺寸」和「個別指定顏色」都靠它們。

### 4. 3D、配件、UI
- 新增的幾何一律用 `boxGeo`、`cylGeo`、`profileExtrude`、`setPrism` 建立。原因：STEP 只輸出掛了 `userData.prism` 的幾何，用一般 `new THREE.BoxGeometry` 建的配件會在 STEP 中消失。
- 重複的小配件用 InstancedMesh，基底向量取 X＝沿梁、Y＝離開梁面、Z＝X×Y（保持行列式為正）。
- 選型做成帶 SVG 小圖示的卡片（使用者習慣「按圖示選」），並可在 3D 點選配件後原地更換型式。
- 在 `computeBOM` 加入對應的五金項目，單價用 `S.accPrice[key]` 讓使用者可以修改。
- 要做門、轉角配件、逐片材質時，直接參考 fence-designer.src.html 中的 `buildDoorHW`、`buildJoints`、`buildCorners`、`renderHwSel`、`S.ptype`。

### 5. 組建與驗證（每次修改後都要跑）
```bash
node $SK/scripts/build_single_html.cjs $WORK/app.src.html $WORK/<成品>.html --vendor $WORK/vendor
node $SK/scripts/smoke_test.cjs $WORK/<成品>.html $WORK/test      # WebGL 開／關、模擬 window.chrome、點擊所有 [data-export]
python3 -m venv $WORK/occ && $WORK/occ/bin/pip install -q cadquery-ocp   # 第一次才需要
$WORK/occ/bin/python $SK/scripts/validate_step.py $WORK/test/gl_btn-stp.stp
pdftoppm -r 60 -png $WORK/test/gl_btn-pdf2d.pdf $WORK/test/p2d && pdftotext $WORK/test/gl_btn-pdf2d.pdf -
```
- smoke test 的 exit code 必須是 0，兩種模式都不能有錯誤。
- **實際看截圖**（test/gl.png、nogl.png，以及 PDF 轉出的 PNG）：檢查料件位置、標籤是否重疊、表格分頁。有疑慮時拉近鏡頭再截一張。
- STEP 必須是：invalid=0、nonpositive_volume=0、xcaf=OK，且外框尺寸與設計相符（多出來的部分要能說明原因，例如腳座、開啟的門）。
- 2D PDF 要量一個已知尺寸驗證比例，並確認 `pdftotext` 讀得到尺寸數字。
- 若 smoke test 無法執行（沒有 playwright），至少用 `node --check` 檢查語法，並在交付時說明未經瀏覽器測試。

### 6. 交付
- 把單一 HTML 傳給使用者（必要時附範例 STEP 或 PDF），用條列說明功能、使用方式、測試結果。
- 清楚標示限制：價格是參考值、STEP 中被簡化的幾何（圓柱用多邊形近似、網片當實心板）、3D 沒有做干涉檢查。
- 檔案放在專案時一併 commit；也保留 `.src.html`，方便以後修改。

## 必守的穩定性規則（原因見 pitfalls.md）
1. App 全部包在 IIFE 裡（`(function(){"use strict"; … })()`）。頂層宣告 `const chrome` 會讓真實 Chrome 整頁掛掉，而測試瀏覽器看不出來。
2. 第一支 script 設定 `window.onerror`，把錯誤顯示在頁面上；WebGL 失敗時自動改用三視圖，且提示列不可遮擋按鈕。
3. 沒有 WebGL 時，三視圖、BOM、STEP、PDF 都必須能用（STEP 是從 three.js 物件樹產生的，不需要 renderer）。
4. 腳本用 `.cjs`，避免上層 package.json 的 `"type":"module"`。
5. 2D 繪圖只用 PdfCtx 支援的 API，螢幕和 PDF 才能共用同一支 draw2D。

## 使用者溝通
- 對象多半是資深機構或自動化工程師：用他們的語彙（淨距、入槽、角座、長料、下料、第三角法、比例 1:20），不需要解釋這些術語，但軟體術語要用白話說。
- 回覆用繁體中文。先說成果，再列功能，最後說明驗證方式與限制。
