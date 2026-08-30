import type { CSSProperties } from 'react'

type GuideFamily = 'lightroom' | 'photoshop'

type GuideItem = {
  id: string
  family: GuideFamily
  title: string
  kicker: string
  description: string
  crop: string
}

const guideItems: GuideItem[] = [
  { id: 'basic', family: 'lightroom', title: 'Basic', kicker: '先定曝光與白平衡', description: '先讓主體亮度與色溫站穩，再進入造型調整。', crop: '50% 38%' },
  { id: 'tone-curve', family: 'lightroom', title: 'Tone Curve', kicker: '塑造高光滾降', description: '以控制點建立對比；端點抬起時會保留霧黑。', crop: '42% 46%' },
  { id: 'hsl', family: 'lightroom', title: 'HSL', kicker: '只動目標色域', description: '色相、飽和度與明度分開處理，避免全圖偏色。', crop: '62% 44%' },
  { id: 'masking', family: 'lightroom', title: 'Masking', kicker: '限制調整範圍', description: '紅色覆蓋區代表遮罩；羽化邊緣避免局部調整露餡。', crop: '48% 32%' },
  { id: 'detail', family: 'lightroom', title: 'Detail', kicker: '在 100% 檢查細節', description: '銳化只留在輪廓，平坦區域交給 Masking 保護。', crop: '54% 52%' },
  { id: 'heal', family: 'photoshop', title: 'Heal', kicker: '由乾淨紋理取樣', description: '短筆觸逐點修復，保留原本的光影與表面質感。', crop: '46% 38%' },
  { id: 'layers', family: 'photoshop', title: 'Layers', kicker: '讓每一步可回頭', description: '修復、色調與銳化分層，調整不直接寫死在原圖。', crop: '70% 40%' },
  { id: 'curves', family: 'photoshop', title: 'Curves', kicker: '用曲線控制明暗', description: '建立調整圖層，搭配遮色片把效果限制在需要的位置。', crop: '37% 52%' },
  { id: 'mask', family: 'photoshop', title: 'Mask', kicker: '白顯示、黑隱藏', description: '在遮色片上作畫，不擦掉任何原始像素。', crop: '58% 48%' },
  { id: 'dodge-burn', family: 'photoshop', title: 'Dodge & Burn', kicker: '小幅修整光影', description: '白筆提亮、黑筆壓暗；低流量反覆堆疊更自然。', crop: '50% 34%' },
  { id: 'sharpen', family: 'photoshop', title: 'Sharpen', kicker: '輸出尺寸決定強度', description: '以邊緣遮罩限制銳化，避免放大噪點與膚質。', crop: '45% 50%' }
]

function PhotoCrop({ imageUrl, crop, className = '' }: { imageUrl: string; crop: string; className?: string }) {
  return <img className={`guide-photo ${className}`} src={imageUrl} alt="" style={{ objectPosition: crop }} />
}

function BasicVisual({ imageUrl, crop }: { imageUrl: string; crop: string }) {
  return <div className="guide-visual guide-basic"><PhotoCrop imageUrl={imageUrl} crop={crop} /><div className="basic-controls"><b>WB</b><i style={{ '--value': '62%' } as CSSProperties} /><b>EXP</b><i style={{ '--value': '47%' } as CSSProperties} /><b>HIGHLIGHTS</b><i style={{ '--value': '34%' } as CSSProperties} /></div><span className="visual-chip">−0.15 EV</span></div>
}

function CurveVisual({ imageUrl, crop }: { imageUrl: string; crop: string }) {
  return <div className="guide-visual guide-curve"><PhotoCrop imageUrl={imageUrl} crop={crop} /><svg viewBox="0 0 360 210" aria-hidden="true"><path className="curve-grid" d="M20 52H340M20 105H340M20 158H340M100 20V190M180 20V190M260 20V190" /><path className="curve-base" d="M20 190L340 20" /><path className="curve-line" d="M20 179 C82 174 102 148 154 122 S246 72 340 32" /><g><circle cx="20" cy="179" r="5"/><circle cx="154" cy="122" r="5"/><circle cx="340" cy="32" r="5"/></g></svg><span className="visual-chip">POINT CURVE</span></div>
}

function HslVisual({ imageUrl, crop }: { imageUrl: string; crop: string }) {
  return <div className="guide-visual guide-hsl"><PhotoCrop imageUrl={imageUrl} crop={crop} /><div className="hsl-spectrum"><span /><span /><span /><span /><span /><span /></div><div className="hsl-target"><i /><b>ORANGE</b><em>H −8</em><em>S +12</em><em>L +6</em></div></div>
}

function MaskingVisual({ imageUrl, crop }: { imageUrl: string; crop: string }) {
  return <div className="guide-visual guide-masking"><PhotoCrop imageUrl={imageUrl} crop={crop} /><div className="mask-overlay" /><svg viewBox="0 0 360 210" aria-hidden="true"><ellipse cx="184" cy="100" rx="92" ry="65"/><line x1="184" y1="24" x2="184" y2="176"/><line x1="78" y1="100" x2="290" y2="100"/></svg><span className="visual-chip">SUBJECT · FEATHER 72</span></div>
}

function DetailVisual({ imageUrl, crop }: { imageUrl: string; crop: string }) {
  return <div className="guide-visual guide-detail"><PhotoCrop imageUrl={imageUrl} crop={crop} /><div className="detail-loupe"><PhotoCrop imageUrl={imageUrl} crop={crop} className="detail-photo" /></div><span className="zoom-label">100%</span><div className="edge-map" /></div>
}

function HealVisual({ imageUrl, crop }: { imageUrl: string; crop: string }) {
  return <div className="guide-visual guide-heal"><PhotoCrop imageUrl={imageUrl} crop={crop} /><svg viewBox="0 0 360 210" aria-hidden="true"><circle className="heal-source" cx="120" cy="82" r="25"/><circle className="heal-target" cx="220" cy="125" r="25"/><path d="M143 92 C165 101 183 111 196 119"/><path d="M187 107L198 120L181 122"/></svg><span className="visual-chip">SAMPLE → REPAIR</span></div>
}

function LayersVisual({ imageUrl, crop }: { imageUrl: string; crop: string }) {
  return <div className="guide-visual guide-layers"><PhotoCrop imageUrl={imageUrl} crop={crop} /><div className="layer-stack"><span><i className="layer-thumb sharpen-thumb"/><b>Output sharpen</b><em>100%</em></span><span><i className="layer-thumb curve-thumb"/><b>Curves</b><em>42%</em></span><span><i className="layer-thumb heal-thumb"/><b>Heal</b><em>100%</em></span><span><i className="layer-thumb photo-thumb"/><b>Original</b><em>🔒</em></span></div></div>
}

function PhotoshopCurvesVisual({ imageUrl, crop }: { imageUrl: string; crop: string }) {
  return <div className="guide-visual guide-ps-curves"><PhotoCrop imageUrl={imageUrl} crop={crop} /><div className="ps-curves-panel"><header><i /><b>Curves 1</b><span>RGB</span></header><svg viewBox="0 0 150 106" aria-hidden="true"><path className="ps-histogram" d="M4 102L4 92L12 89L18 72L24 84L30 45L36 61L43 26L49 54L56 16L62 43L68 36L75 61L82 39L89 69L96 52L103 78L111 63L118 87L126 72L133 94L146 98V102Z"/><path className="ps-diagonal" d="M4 102L146 4"/><path className="ps-curve-line" d="M4 96C31 94 47 83 66 67S106 30 146 17"/><circle cx="66" cy="67" r="3"/><circle cx="146" cy="17" r="3"/></svg><footer><i className="adjustment-thumb"/><i className="mask-thumb"/><span>ADJUSTMENT + MASK</span></footer></div></div>
}

function PhotoshopMaskVisual({ imageUrl, crop }: { imageUrl: string; crop: string }) {
  return <div className="guide-visual guide-ps-mask"><div className="mask-before"><PhotoCrop imageUrl={imageUrl} crop={crop}/></div><div className="mask-after"><PhotoCrop imageUrl={imageUrl} crop={crop}/></div><svg viewBox="0 0 360 210" aria-hidden="true"><defs><radialGradient id="maskGradient"><stop offset="0" stopColor="white"/><stop offset=".55" stopColor="white"/><stop offset="1" stopColor="black"/></radialGradient></defs><rect x="246" y="128" width="76" height="54" fill="url(#maskGradient)"/><rect x="242" y="124" width="84" height="62"/></svg><span className="visual-chip">LAYER MASK</span></div>
}

function DodgeBurnVisual({ imageUrl, crop }: { imageUrl: string; crop: string }) {
  return <div className="guide-visual guide-dodge"><PhotoCrop imageUrl={imageUrl} crop={crop}/><svg viewBox="0 0 360 210" aria-hidden="true"><path className="dodge-path" d="M74 144 C98 96 126 80 157 66"/><path className="burn-path" d="M210 63 C248 82 272 108 286 153"/><circle className="brush-ring" cx="158" cy="66" r="28"/><text x="70" y="170">DODGE +</text><text x="236" y="180">BURN −</text></svg><span className="visual-chip">FLOW 4%</span></div>
}

function SharpenVisual({ imageUrl, crop }: { imageUrl: string; crop: string }) {
  return <div className="guide-visual guide-sharpen"><div className="sharpen-half is-before"><PhotoCrop imageUrl={imageUrl} crop={crop}/><span>BEFORE</span></div><div className="sharpen-half is-after"><PhotoCrop imageUrl={imageUrl} crop={crop}/><span>EDGE MASK</span></div><i className="split-line"/><span className="visual-chip">RADIUS 0.7 PX</span></div>
}

function GuideVisual({ item, imageUrl }: { item: GuideItem; imageUrl: string }) {
  if (item.id === 'basic') return <BasicVisual imageUrl={imageUrl} crop={item.crop} />
  if (item.id === 'tone-curve') return <CurveVisual imageUrl={imageUrl} crop={item.crop} />
  if (item.id === 'hsl') return <HslVisual imageUrl={imageUrl} crop={item.crop} />
  if (item.id === 'masking') return <MaskingVisual imageUrl={imageUrl} crop={item.crop} />
  if (item.id === 'detail') return <DetailVisual imageUrl={imageUrl} crop={item.crop} />
  if (item.id === 'heal') return <HealVisual imageUrl={imageUrl} crop={item.crop} />
  if (item.id === 'layers') return <LayersVisual imageUrl={imageUrl} crop={item.crop} />
  if (item.id === 'curves') return <PhotoshopCurvesVisual imageUrl={imageUrl} crop={item.crop} />
  if (item.id === 'mask') return <PhotoshopMaskVisual imageUrl={imageUrl} crop={item.crop} />
  if (item.id === 'dodge-burn') return <DodgeBurnVisual imageUrl={imageUrl} crop={item.crop} />
  return <SharpenVisual imageUrl={imageUrl} crop={item.crop} />
}

export default function EditingWorkflowGuide({ imageUrl }: { imageUrl: string }) {
  return <section className="workflow-guide" aria-labelledby="workflow-guide-title">
    <div className="section-title workflow-guide-heading"><span>05</span><div><h3 id="workflow-guide-title">圖像化操作路徑</h3><p>操作位置直接示意在你的原始上傳圖；線條與控制層採向量繪製。實際數值請以上方本次分析為準。</p></div></div>
    {(['lightroom', 'photoshop'] as GuideFamily[]).map((family) => <div className="guide-family" data-family={family} key={family}>
      <header><b>{family === 'lightroom' ? 'LIGHTROOM / ACR' : 'PHOTOSHOP'}</b><span>{family === 'lightroom' ? 'RAW DEVELOPMENT' : 'PIXEL FINISHING'}</span></header>
      <div className="guide-grid">{guideItems.filter((item) => item.family === family).map((item) => <article className="guide-card" key={item.id}>
        <div className="guide-visual-shell" role="img" aria-label={`${item.title} 操作示意：${item.description}`}><GuideVisual item={item} imageUrl={imageUrl} /></div>
        <div className="guide-copy"><span>{item.kicker}</span><h4>{item.title}</h4><p>{item.description}</p></div>
      </article>)}</div>
    </div>)}
  </section>
}
