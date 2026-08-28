# Lumen Stage

Lumen Stage 是一套在瀏覽器中運作的 3D 攝影棚燈光與相機模擬器，讓使用者配置燈具、調整曝光與鏡頭參數，並預覽或輸出拍攝結果。

![Lumen Stage 攝影棚介面](assets/lumen-stage-preview.png)

## 主要功能

- 棚內、俯視燈位、相機取景與照片渲染等多種檢視模式
- 可調整燈具、柔光附件、曝光、白平衡、鏡頭與感光元件設定
- 景深、測光、閃燈同步與構圖輔助分析
- 以漸進式路徑追蹤產生高品質預覽並輸出 PNG
- 場景可儲存在瀏覽器，也可匯入或匯出專案檔
- 產生燈位工作表，方便實際拍攝時重現配置

## 本機執行

需要近期版本的 Node.js 與 npm。

```bash
npm install
npm run dev
```

依終端顯示的網址在瀏覽器開啟即可。建立正式版本：

```bash
npm run build
npm run preview
```

## 專案結構

```text
src/                         React 介面、攝影計算與 3D 場景
src/components/              場景、控制面板、分析與工作表元件
scripts/build_website_guide.py  網站使用教學 PDF 產生工具
output/pdf/                  已產生的網站使用教學
palace_*.jpg                 場景環境圖片
```

## 技術架構

介面以 React、TypeScript 與 Zustand 建立；3D 場景採用 Three.js、React Three Fiber 與 Drei。照片模式透過 `three-gpu-pathtracer` 漸進取樣，後製則包含鏡頭特性、色彩科學與感光元件效果模擬。

字型由 Google Fonts 載入，因此首次顯示時需要網路連線。部分 3D 功能需要支援 WebGL 的現代瀏覽器與較佳的圖形效能。

## 文件

完整操作說明可參考 [`output/pdf/LUMEN_STAGE_網站使用教學.pdf`](output/pdf/LUMEN_STAGE_網站使用教學.pdf)。

## 授權

目前尚未指定開源授權。原始碼可供檢視，但未明確授予重製、修改或散布權利。
