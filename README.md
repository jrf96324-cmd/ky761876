# 全道親車輛安排系統

Node.js 網頁版車輛安排系統，支援密碼登入、活動日期分組、車輛/趟次管理、LINE 公布文字複製、CSV 匯出。

## 一鍵部署

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/jrf96324-cmd/ky761876)

部署時請在 Render 填入環境變數 `DAO_CAR_PASSWORD` 作為登入密碼。

## 本機啟動

```bash
npm start
```

開啟 `http://localhost:3000`。

## 環境變數

- `PORT`: 服務連接埠，預設 `3000`
- `DAO_CAR_PASSWORD`: 登入密碼，雲端部署時請手動設定
- `DATA_DIR`: 資料儲存目錄，預設 `./data`

## 雲端部署

請參考 `DEPLOY.md`。公開 repo 不包含 `data/arrangements.json`，避免上傳實際乘車名單。
