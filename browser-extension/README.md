# Lumen Trace 瀏覽器擴充功能

## 安裝測試版

1. 開啟 Chrome 或 Edge 的「管理擴充功能」。
2. 開啟「開發人員模式」。
3. 選擇「載入未封裝項目」，指定本資料夾 `browser-extension`。
4. 將 Lumen Trace 固定在工具列。

## 使用方式

- 在 X 或 Instagram 對圖片按右鍵，選擇「用 Lumen Trace 分析這張圖片」。
- 或停在貼文畫面，點工具列的 Lumen Trace；它會挑選畫面中最大的貼文圖片。
- 快捷鍵：macOS 為 `⌘⇧L`，Windows / Linux 為 `Alt+Shift+L`。

擴充功能只在使用者點擊時取得目前頁面的圖片網址，不讀取 Cookie、帳號、私訊或瀏覽紀錄。分析由 `https://lumen-stage.vercel.app/analyze` 執行。
