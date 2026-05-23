# 全道親車輛安排系統

## 點這裡一鍵部署

[點我建立雲端網站](https://render.com/deploy?repo=https://github.com/jrf96324-cmd/ky761876)

或按這個按鈕：

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/jrf96324-cmd/ky761876)

## 部署時不用找密碼欄位

如果 Render 畫面沒有 `DAO_CAR_PASSWORD`，這是正常的。

部署完成後，打開 Render 給你的網站網址，第一次進入會出現：

```text
第一次使用，請建立登入密碼
```

你在那裡輸入密碼即可。之後大家進入排車系統時，就使用這個密碼登入。

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
- `DATA_DIR`: 資料儲存目錄，預設 `./data`
- `DAO_CAR_PASSWORD`: 可選；若不設定，第一次開啟網站時建立密碼

## 雲端部署

請參考 `DEPLOY.md`。公開 repo 不包含 `data/arrangements.json`，避免上傳實際乘車名單。
