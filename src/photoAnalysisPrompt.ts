export type PhotoAnalysisPromptOptions = {
  notes?: string
  sourceKind?: 'upload' | 'social'
  dimensions?: string
}

const MAX_NOTES_LENGTH = 800

export function buildPhotoAnalysisPrompt({
  notes = '',
  sourceKind = 'upload',
  dimensions = ''
}: PhotoAnalysisPromptOptions = {}) {
  const focus = notes.trim().slice(0, MAX_NOTES_LENGTH)
  const safeDimensions = /^\d{2,6}\s*[x×]\s*\d{2,6}$/i.test(dimensions.trim()) ? dimensions.trim() : ''
  const sourceNote = sourceKind === 'social'
    ? '來源品質：這是從社群貼文匯入的影像，可能經過平台縮放、銳化或壓縮；細節、顆粒、降噪與插件判斷的信心必須降低。'
    : '來源品質：這是使用者上傳的成品圖檔；若沒有原始檔或編輯前影像，不得把推論當成已知的編輯歷史。'

  return `請以「專業照片後期鑑識師」的方式分析我附上的照片。如果目前對話沒有看到圖片，請先只提醒我上傳、拖入或貼上照片，不要根據文字猜測。

核心原則：
- 只逆向推理成品像素中可見的結果，不假裝知道 RAW 設定、相機描述檔、預設、圖層堆疊或精確插件。
- 每個主要結論都分成：「可見證據」、「合理推論」、「其他可能解釋」與「信心：高／中／低」。
- 先排除打光、鏡頭／光學柔焦濾鏡、彩妝、景深、社群縮圖、輸出銳化與壓縮所造成的類似效果。
- 不根據外觀推測身分、種族、健康或其他敏感屬性；只討論可見的膚質與修飾處理。

${sourceNote}${safeDimensions ? `
圖片尺寸：${safeDimensions}。` : ''}

請以繁體中文輸出，並依這個順序：
1. 一句風格標籤＋2–3 句整體診斷。
2. 來源品質限制，說明哪些細節不能高信心判斷。
3. 證據表：觀察／推論／其他可能／信心。
4. 可重現的後期堆疊：Profile/WB → 曝光與全局影調 → 曲線 → HSL → 色彩分級 → 局部遮罩 → 修飾 → 柔光／擴散 → 銳化／降噪／顆粒 → 輸出。
5. Lightroom Classic／Adobe Camera Raw 起始參數：給合理區間而非偽造的精確還原值，並寫出每個參數在對齊什麼視覺線索。
6. Photoshop 的局部修飾、Dodge & Burn、膚質、柔光／Bloom／Halation 與銳化收尾步驟。
7. 如果有足夠證據，再列可能的插件或 Evoto／像素蛋糕／美圖秀秀功能家族；不把產品名稱說成事實，並附手動等效做法。
8. 比對校正清單：重做後應先比較哪些區域，看到什麼現象時應降低強度。${focus ? `

我特別想知道：${focus}` : ''}`
}
