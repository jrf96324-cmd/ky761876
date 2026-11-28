# 🏭 機構／自動化工程知識庫

## 路徑結構
| 資料夾 | 用途 |
|---|---|
| `00_收件匣 Inbox` | 新筆記預設落點，每週整理歸檔 |
| `01_專案 Projects` | 一案一資料夾：評估報告、BOM、估價、會議 |
| `02_元件庫 Components` | 標準品元件卡（型號、規格、單價、交期、3D 來源） |
| `03_供應商 Suppliers` | 廠商資料、窗口、折扣、交期紀錄 |
| `04_估價 Quotes` | 報價單紀錄（對應專案與元件） |
| `05_知識庫 Knowledge` | 設計規範、選型計算書 |
| `06_會議紀錄 Meetings` | 會議／客戶訪談 |
| `07_日誌 Daily` | 每日工作日誌 |
| `90_範本 Templates` | 筆記範本（核心外掛「範本」） |
| `99_附件 Attachments` | 圖片、PDF；3D 大檔只放連結 |

## 進行中專案
```dataview
TABLE 客戶, 階段, 預算, 交期
FROM "01_專案 Projects"
WHERE type = "project" AND 階段 != "結案"
SORT 交期 ASC
```

## 元件庫（依類別）
```dataview
TABLE 品牌, 型號, 單價, 交期天數, 3D來源
FROM "02_元件庫 Components"
WHERE type = "component"
SORT 類別 ASC
```
> 以上表格需安裝社群外掛 **Dataview**；未安裝時僅顯示程式碼。
