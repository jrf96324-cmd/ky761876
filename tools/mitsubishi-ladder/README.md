# 三菱 PLC 階梯圖產生器

單一 HTML 工具（`index.html`），用瀏覽器直接開啟即可使用，不需安裝。

## 功能

1. **I/O 配置表 + 動作步序（時序）→ 自動產生指令表 (IL)**
   - 步序法：M100（STEP0 待機）→ M101… 以 SET/RST 移步
   - 運轉自保持（M0）、停止、緊急停止（B 接點）、復歸、單循環 / 連續循環
   - 每步延時計時器 T1～、逾時計時器 T101～ → 異常 M50 → 異常燈閃爍
   - 輸出寫法：`Y1`（該步 ON）、`+Y2`（SET 保持）、`-Y2`（RST）
   - 完成條件：`&` 串聯、`|` 並聯、`!` B 接點
2. **指令表 → 階梯圖 (SVG)**：支援 LD/LDI/LDP/LDF、AND/ANI/ANDP/ANDF、OR/ORI/ORP/ORF、
   ANB/ORB、MPS/MRD/MPP、比較接點（LD= 等）、INV/MEP/MEF、OUT/SET/RST/PLS/PLF 與應用指令
3. **檢查**：雙線圈、FX 系列 X/Y 8 進位位址、未定義 I/O、ANB/ORB/MPS 配對
4. **匯出**：IL 文字檔、GX Developer 清單格式程式 CSV、裝置註解 CSV、階梯圖 SVG、專案 JSON

## 機種

| 機種 | 軟體 | 初始脈衝 | 1 秒時脈 | X/Y 進位 |
|---|---|---|---|---|
| FX3U / FX3G | GX Works2 | M8002 | M8013 | 8 |
| FX5U / FX5UC | GX Works3 | SM402 | SM412 | 8 |
| Q 系列 | GX Works2 | SM402 | SM412 | 16 |
| iQ-R | GX Works3 | SM402 | SM412 | 16 |

## 注意

- 程式 CSV 的步號為 FX 系列估算值；CSV 匯入格式隨 GX Works / GX Developer 版本不同，首次使用請先以小程式確認。
- 匯入後請在 GX Works 執行轉換（F4）與程式檢查再寫入 PLC。
- 緊急停止等安全迴路必須以硬體配線實現，PLC 程式只作監控。
