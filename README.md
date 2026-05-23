# 全道親車輛安排系統

## 點這裡一鍵部署

👉 [點我建立雲端網站](https://render.com/deploy?repo=https://github.com/jrf96324-cmd/ky761876)

或按這個按鈕：

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/jrf96324-cmd/ky761876)

## 部署時只要填這個密碼欄位

Render 畫面出現環境變數時，找到：

```text
DAO_CAR_PASSWORD
```

在右邊輸入你要的登入密碼。這個密碼就是大家進入排車系統時要輸入的密碼。

## 部署完成後

Render 會給你一個網址，通常長這樣：

```text
https://你的服務名稱.onrender.com
```

把這個網址傳給其他人，大家打開後輸入密碼即可使用。

## 系統功能

Node.js 網頁版車輛安排系統，支援密碼登入、活動日期分組、車輛/趟次管理、LINE 公布文字複製、CSV 匯出。

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
