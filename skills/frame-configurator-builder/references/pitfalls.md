# 踩過的坑（都是在圍籬設計器實際發生過的）

| # | 症狀 | 原因 | 作法 |
|---|---|---|---|
| 1 | 使用者電腦打開後整頁空白，只看到標題和空輸入框 | 頂層用 `const chrome=…`，與真實 Chrome 的全域 `window.chrome` 撞名，發生 SyntaxError，整支程式都沒執行。測試用的無頭瀏覽器沒有這個全域物件，所以抓不到 | App 全部包在 `(function(){ "use strict"; … })()` 裡；smoke test 用 addInitScript 注入 `window.chrome`。也要避開 `name`、`top`、`status`、`event`、`print` 這類全域名稱 |
| 2 | 公司電腦 3D 區全黑、BOM 也空白 | 硬體加速關閉或 GPU 被封鎖，`new THREE.WebGLRenderer` 丟出例外，後續程式全部中斷 | 用 try/catch 建立 renderer（先試 antialias，失敗再用 low-power），HAS3D=false 時自動切到三視圖，並顯示如何開啟硬體加速（chrome://settings/system、chrome://gpu）。三視圖、BOM、STEP、PDF 在沒有 WebGL 時都必須能用 |
| 3 | 錯誤時使用者看不出原因 | 錯誤只出現在 console | 在第一支 script 設定 `window.onerror`，把錯誤顯示在頁面紅色橫幅，請使用者截圖。之後一張截圖就能對症下藥 |
| 4 | 3D 無法使用的提示列擋住右上角匯出按鈕 | 橫幅用 position:fixed 疊在頂列上 | 降級提示改成 `position:static` 並 `document.body.prepend()`，放進版面流 |
| 5 | build 腳本在專案內執行失敗：require is not defined | 上層 package.json 有 `"type":"module"` | 腳本副檔名用 `.cjs` |
| 6 | 某個區塊報 `s is not defined` | 重構時刪掉了區域變數，但後面還有地方用到 | 每次改完都跑 smoke test；整段搬移時用 grep 檢查變數名稱 |
| 7 | 網片遠看消失 | alphaTest 在 mipmap 後低於門檻 | 改用 `transparent:true, depthWrite:false` 加 alphaMap |
| 8 | 顏色看起來偏淡、偏灰 | sRGB 輸出時沒有把材質顏色轉成線性 | `new THREE.Color(hex).convertSRGBToLinear()` |
| 9 | 鋁板沿用黑色板材顏色 | 個別指定材質時沒有預設色 | 每種材質給 `defColor`，切換材質時套用 |
| 10 | 總尺寸標籤和分格標籤重疊，點不到 | 兩者都放在同一邊的中點 | 總尺寸改放頂邊（往上偏移），分格放底邊 |
| 11 | PDF 的估價單被拆到下一頁，只剩一行合計 | 表格分頁只看剩餘空間 | 整段塞得進一頁的小表格就整段換頁 |
| 12 | 2D PDF 的中文變成亂碼或缺字 | PDF 內建字型不支援中文，內嵌 CJK 字型又太大 | 英數字用 Helvetica／Courier（向量、可搜尋），中文用約 600 dpi 的文字遮罩影像（SMask） |
| 13 | STEP 匯入後面翻轉或實體無效 | 迴圈方向錯誤，或轉換矩陣的行列式為負 | 外框逆時針、孔順時針；側面迴圈固定為 Eb[i]→V[j]→Et[i](F)→V[i](F)；InstancedMesh 的 Z 軸用 X×Y |
| 14 | STEP 中文名稱亂碼 | Part 21 只允許 ASCII | 用 `\X2\XXXX\X0\` 編碼；FILE_NAME 只放 ASCII |
| 15 | 匯出時帶到選取高亮的藍色 | 匯出時材質還是高亮後 clone 的那份 | 匯出前先取消選取，匯出後再選回來；顏色從 `userData.orig` 讀取 |
| 16 | Playwright 下載檔都叫 `download` 並互相覆蓋 | 下載的是 blob URL | smoke test 改用按鈕 id 命名 |
| 17 | 3D 預覽沒問題，但 STEP 少了某些配件 | 那些幾何沒有掛 `userData.prism` | 一律用 `boxGeo`、`cylGeo`、`setPrism` 建立；不能用稜柱表示的（例如圓環）在交付時說明 |
| 18 | 列印時比例不準 | 自動縮放到剛好塞滿圖框，比例不是標準值 | `std:true` 時取標準比例，PdfCtx 的 K=0.75（96 dpi），標題欄的比例才會和實際相符 |
