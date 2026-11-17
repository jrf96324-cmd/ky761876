# 架構說明：參數化結構配置器

## 目錄
1. 資料流（單一資料來源）
2. Part 物件格式
3. 模組地圖（starter.html 的 11 段）
4. 把範本改成新題目的步驟
5. 3D 細節慣例
6. 2D 圖面慣例
7. BOM／估價慣例
8. UI 慣例

---

## 1. 資料流（單一資料來源）

```
使用者輸入 / 點 3D / 點尺寸標籤
        │  (只改 S，絕不直接改 3D 物件)
        ▼
   S（狀態）──► buildParts() ──► parts[]  ──┬─► build3D()     （Three.js）
                                            ├─► draw2D(opt)   （螢幕 canvas ／ PdfCtx 向量 PDF）
                                            ├─► computeBOM()  （裁切、板材、五金、下料、估價）
                                            └─► collectSolids() → buildStepAssembly()（STEP）
```
- 每次變更都呼叫 `update()`：重建 parts → BOM → 3D → UI。三四百件以內每次都重建也很順，不需要做增量更新。
- **原因**：3D、2D、BOM、STEP 四者只要有一個自己算尺寸，遲早會不一致；只從 parts 取數，就能保證「看到的＝算到的＝匯出的」。
- 尺寸以「總尺寸＋各格淨距陣列」表示（`S.w` 與 `S.spW[]`，`S.h` 與 `S.spH[]`）。關係式：`total = Σ淨距 + (格數+1)×型材寬`。
  - 鎖定總尺寸：改某一格時，由最後一格吸收差值（改最後一格時則由前一格吸收）。
  - 解除鎖定：總尺寸跟著改。
  - 改總尺寸：各格平均分配，有特殊格（例如門）時，先固定特殊格再平分其餘格。

## 2. Part 物件格式

```js
{ id:'BW0-1-2',            // 穩定且唯一；個別顏色或材質覆寫以 id 為 key（S.overrides[id]）
  kind:'post'|'beam'|'panel'|'plate'|'brace'|'dframe'|'dpanel'|…,
  name:'頂橫梁',            // 會出現在 BOM、STEP 零件名、tooltip
  series:'4040', len:690,   // 型材類料件必填（裁切長度 = BOM 數字）
  w,h,t,                    // 板材類料件的下料尺寸（已含入槽）
  axis:'x'|'y'|'z'|'diag',  // 型材擠出方向；diag 時加 rotY
  box:{cx,cy,cz,sx,sy,sz},  // 世界座標外框（mm，Y 朝上），2D 三視圖直接用它投影
  dir,line,bay,lvl,         // 拓樸資訊：讓「點選料件 → 改對應尺寸」找得到要改哪個陣列元素
  door:true, local:{x,y,z}, pivot   // 會轉動的子組件（門扇）用本地座標掛在 pivot Group 下
}
```
**原因**：box 讓三視圖不必另外寫投影邏輯；dir、bay、lvl 讓「點 3D 料件改尺寸」可以直接對應到 `S.spW[bay]`、`S.spH[lvl]`。

## 3. 模組地圖（assets/starter.html）
| 段落 | 內容 | 換題目時 |
|---|---|---|
| 1 資料表 | 顏色、板材、底座 | 依領域增修（參考 domain-data.md） |
| 2 狀態 S | 所有參數＋overrides＋price | 依題目增修 |
| 3 尺寸邏輯 | resetSpacing、setSpan、setTotal、setCount | 通常直接沿用 |
| 4 buildParts | 結構展開 | **主要改寫處** |
| 5 computeBOM | 分組、排料、五金、估價 | 增修五金規則 |
| 6 3D | 場景、材質、makePart、角座、尺寸標籤、選取 | 增加配件時擴充 |
| 7 draw2D | 三視圖＋尺寸＋標題欄 | 通常沿用，增加特殊符號 |
| 8 UI | 頂列、側欄、選取面板、BOM 表 | 依題目增修 |
| 9 事件 | 委派式事件 | 沿用 |
| 10 匯出 | CSV、STEP、2D PDF、報告 PDF | 通常沿用 |
| 11 啟動 | WebGL 降級、錯誤列 | 沿用 |

assets/lib 的程式庫由 build 腳本插入 IIFE 開頭，App 內可直接呼叫：`PROFILES`、`profilePts`、`profileSVG`、`rect`、`circ`、`setPrism`、`boxGeo`、`cylGeo`、`profileExtrude`、`packBars`、`collectSolids`、`buildStepAssembly`、`PdfCtx`、`vectorPDF`、`PDF_PAPER`、`buildRasterPDF`、`canvasJpegBytes`。

## 4. 把範本改成新題目的步驟
1. 複製 `assets/starter.html` 成新檔，改標題和品牌列。
2. 列出新結構的「格線」：X 方向哪些位置有立柱、Z 方向幾排、Y 方向有哪些層。用 `axisPos(total, spans, P)` 算出 xs、zs、ys。
3. 在 `buildParts()` 依序產生：立柱 → 各方向橫梁（逐層）→ 板材（逐格逐層、依安裝面開關）→ 特殊組件（門、抽屜、檯面、斜撐…）。
4. 型材長度一律用**淨距**（立柱之間），板材尺寸＝淨距＋2×入槽深度，在 BOM 註明。
5. 新增配件時，在 3D 用 `boxGeo`／`cylGeo`／`setPrism` 建立幾何（才會輸出到 STEP），在 `computeBOM` 加一行 `A(key, 品名, 規格, 數量, 單位, 參考單價)`。
6. 點選料件可改尺寸：在 `renderSel` 的 E 陣列加入「[標籤, 目前值, 套用函式]」。
7. 跑 build、smoke test 和 validate_step，截圖檢查（見 SKILL.md 第 5 步）。

## 5. 3D 細節慣例
- three.js r128 非模組版（`THREE` 全域＋`examples/js/controls/OrbitControls.js`），build 時內嵌，可離線。
- 單位 mm，Y 朝上；STEP 匯出時才轉成 Z 朝上。
- `renderer.outputEncoding = sRGB`，所以材質顏色要用 `lin(hex)` 轉線性，否則顏色會偏淡。
- 金屬質感靠 PMREM 環境貼圖（漸層球加幾片發光板），沒有環境貼圖時金屬會全黑。
- 大量重複的小配件（角座、螺絲）用 InstancedMesh。基底向量取 X＝沿梁方向、Y＝離開梁面、Z＝X×Y，保持行列式為 +1：這樣 STEP 才不會翻面，打光也不會反。
- 選取：同一個 id 的所有 mesh 一起高亮（clone 材質後設 emissive），單一料件另外加 BoxHelper。
- 網片類用 alphaMap 加 `transparent:true, depthWrite:false`，不要用 alphaTest，否則遠看網線會消失。
- 尺寸標籤是 HTML div，每一幀用 `project(camera)` 定位；總尺寸的標籤要和分格標籤錯開（例如放在頂邊），以免重疊、點不到。

## 6. 2D 圖面慣例
- `draw2D(opt)`：沒有傳 opt 時畫在螢幕 canvas，並記錄可點擊區 hits2d；傳入 `{ctx,w,h,std,paper}` 時畫到 PdfCtx 或報告用的 canvas。
- 只能使用 PdfCtx 支援的 API（見 lib/50-pdf.js 開頭），不可使用漸層、clip、drawImage。斜線填充寫成 `x.isPdf ? {__hatch:c} : createPattern(...)`。
- 採第三角法：俯視圖在前視圖上方（後方朝上），右側視圖在前視圖右側（前方靠左）。依深度排序後由遠到近填色，近的料件自然蓋住遠的。
- `std:true` 時比例取標準值（1:10、1:15、1:20、1:25、1:30…）。換算：`sc = 96/(N*25.4)`，配合 PdfCtx 的 K=0.75，100% 列印時可以用比例尺量測。

## 7. BOM／估價慣例
- 鋁材分組 key：型材＋長度（四捨五入到 0.1 mm）＋顏色＋品名。排料則依「型材＋顏色」分組，因為不同顏色是不同的長料。
- 五金一律用 `A(key, …)` 加入，單價讀 `S.accPrice[key] ?? 預設值`，讓使用者在表格內直接修改。
- 估價項目：鋁材（kg × 單價 ×（1＋表面處理加價））、裁切（刀數）、板材（m² × 單價 × 厚度係數）、五金、工資（工時模型）、管銷利潤 %、營業稅 5%。
- 所有單價都要在畫面和輸出中註明「參考值，請依實際報價修改」。

## 8. UI 慣例
- 深色工程軟體風格：頂列放參數，中間是 3D／三視圖分頁，右側欄放樣式與選取資訊，底部是 BOM 分頁。
- 「按圖示選擇」：型材、板材、底座、配件都用帶 SVG 小圖示的卡片（`.pc`），不要只用下拉選單，使用者一眼就能看懂。
- 所有可匯出的按鈕都加上 `data-export`，smoke test 會自動逐一點擊。
- 寬度 980px 以下改成單欄，讓手機也能看。
