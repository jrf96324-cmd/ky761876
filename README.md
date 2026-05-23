# 全道親車輛安排系統

Node.js 網頁版車輛安排系統，支援密碼登入、活動日期分組、車輛/趟次管理、LINE 公布文字複製、CSV 匯出。

## 本機啟動

```bash
npm start
```

開啟 `http://localhost:3000`。

## 環境變數

- `PORT`: 服務連接埠，預設 `3000`
- `DAO_CAR_PASSWORD`: 登入密碼，預設 `0151`
- `DATA_DIR`: 資料儲存目錄，預設 `./data`

## 雲端部署

請參考 `DEPLOY.md`。公開 repo 不包含 `data/arrangements.json`，避免上傳實際乘車名單。
