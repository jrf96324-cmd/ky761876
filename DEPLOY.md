# 全道親車輛安排系統：雲端部署版

這個版本可放到 Node.js 雲端主機。手機與其他人只要有網址，就能用密碼登入使用。

## 重要設定

- 啟動指令：`npm start`
- 服務連接埠：使用雲端提供的 `PORT`，本機預設 `3000`
- 登入密碼：環境變數 `DAO_CAR_PASSWORD`
- 資料儲存目錄：環境變數 `DATA_DIR`
- 健康檢查：`/healthz`

## 建議環境變數

```text
DAO_CAR_PASSWORD=請在雲端後台設定自己的密碼
DATA_DIR=/opt/render/project/src/storage
```

密碼之後可以改成更長的字串。不要把密碼寫在公開頁面。

## Render 部署建議

Render 官方文件提醒，一般服務的檔案系統可能是暫存；要保存排車資料，需掛 persistent disk。官方 persistent disk 文件提到 Node.js 專案可掛在專案目錄下的子資料夾，例如 `/opt/render/project/src/storage`。

Render 設定：

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /healthz
Environment Variables:
  DAO_CAR_PASSWORD=請在 Render Environment 手動設定
  DATA_DIR=/opt/render/project/src/storage
Persistent Disk:
  Mount Path: /opt/render/project/src/storage
```

部署完成後，Render 會提供一個 `https://...onrender.com` 網址。大家用該網址登入即可。

## 注意

系統已取消電話欄位，但仍包含活動、司機姓名、乘車道親名單。請只把網址與密碼給需要使用的人。

## 參考

- Render Persistent Disks: https://render.com/docs/disks
- Render Environment Variables: https://render.com/docs/configure-environment-variables/
