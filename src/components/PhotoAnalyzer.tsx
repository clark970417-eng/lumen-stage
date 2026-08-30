import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import EditingWorkflowGuide from './EditingWorkflowGuide'
import '../photo-analyzer.css'
import { buildPhotoAnalysisPrompt } from '../photoAnalysisPrompt'
import { copyToClipboard } from '../share'

type AnalysisResult = {
  styleLabel: string
  diagnosis: string
  confidence: '高' | '中' | '低'
  limitations: string[]
  evidence: Array<{ observation: string; inference: string; alternative: string; confidence: string }>
  editStack: string[]
  lightroom: Array<{ control: string; range: string; purpose: string }>
  photoshop: string[]
  plugins: Array<{ family: string; likelihood: string; manualEquivalent: string }>
  calibration: string[]
}

const MAX_BYTES = 18 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

const ANALYSIS_MAX_DATA_URL_LENGTH = 3_750_000

async function prepareImage(source: string) {
  const image = new Image()
  image.src = source
  await image.decode()
  const attempts = [
    { maxSide: 2560, quality: .92 }, { maxSide: 2560, quality: .86 },
    { maxSide: 2304, quality: .86 }, { maxSide: 2048, quality: .84 },
    { maxSide: 1920, quality: .82 }
  ]
  let dataUrl = ''
  let analysisWidth = 0
  let analysisHeight = 0
  for (const attempt of attempts) {
    const ratio = Math.min(1, attempt.maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    analysisWidth = Math.max(1, Math.round(image.naturalWidth * ratio))
    analysisHeight = Math.max(1, Math.round(image.naturalHeight * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = analysisWidth
    canvas.height = analysisHeight
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('瀏覽器無法處理這張圖片')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.fillStyle = '#0b0e12'
    context.fillRect(0, 0, analysisWidth, analysisHeight)
    context.drawImage(image, 0, 0, analysisWidth, analysisHeight)
    dataUrl = canvas.toDataURL('image/jpeg', attempt.quality)
    if (dataUrl.length <= ANALYSIS_MAX_DATA_URL_LENGTH) break
  }
  if (dataUrl.length > ANALYSIS_MAX_DATA_URL_LENGTH) throw new Error('圖片細節過於複雜，無法建立安全的分析副本。請改用較小的圖片。')
  return { dataUrl, width: image.naturalWidth, height: image.naturalHeight, analysisWidth, analysisHeight }
}

function ResultPanel({ result, imageUrl }: { result: AnalysisResult; imageUrl: string }) {
  return (
    <article className="trace-report">
      <header className="report-hero" aria-live="polite" aria-atomic="true">
        <div><span>STYLE DIAGNOSIS</span><h2>{result.styleLabel}</h2></div>
        <p>{result.diagnosis}</p>
        <small>整體信心：{result.confidence}</small>
        <div className="report-limitations">
          <b>判讀限制</b>
          <ul>{result.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </header>

      <section>
        <div className="section-title"><span>01</span><h3>可見證據</h3></div>
        <div className="evidence-table">
          {result.evidence.map((row, index) => (
            <div className="evidence-row" key={`${row.observation}-${index}`}>
              <b>{row.observation}</b><p>{row.inference}</p><small>其他可能：{row.alternative}</small><i>{row.confidence}</i>
            </div>
          ))}
        </div>
      </section>

      <section className="report-split">
        <div>
          <div className="section-title"><span>02</span><h3>建議處理順序</h3></div>
          <ol>{result.editStack.map((item) => <li key={item}>{item}</li>)}</ol>
        </div>
        <div>
          <div className="section-title"><span>03</span><h3>Photoshop 收尾</h3></div>
          <ul>{result.photoshop.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </section>

      <section>
        <div className="section-title"><span>04</span><h3>Lightroom / ACR 起始參數</h3></div>
        <div className="recipe-grid">
          {result.lightroom.map((item) => <div key={item.control}><span>{item.control}</span><strong>{item.range}</strong><small>{item.purpose}</small></div>)}
        </div>
      </section>

      <EditingWorkflowGuide imageUrl={imageUrl} />

      {result.plugins.length > 0 && <section>
        <div className="section-title"><span>06</span><h3>可能的插件家族</h3></div>
        <div className="plugin-list">{result.plugins.map((item) => <div key={item.family}><b>{item.family}</b><span>{item.likelihood}</span><p>手動等效：{item.manualEquivalent}</p></div>)}</div>
      </section>}

      <section>
        <div className="section-title"><span>07</span><h3>比對校正</h3></div>
        <ul className="calibration-list">{result.calibration.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
    </article>
  )
}

export default function PhotoAnalyzer() {
  const input = useRef<HTMLInputElement>(null)
  const localPreviewUrl = useRef<string | null>(null)
  const selectionGeneration = useRef(0)
  const analysisGeneration = useRef(0)
  const analysisController = useRef<AbortController | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [dimensions, setDimensions] = useState('')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null)
  const [autoStart, setAutoStart] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [apiUnavailable, setApiUnavailable] = useState(false)
  const [handoffMessage, setHandoffMessage] = useState('')
  const [handoffError, setHandoffError] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const source = params.get('source')
    if (source && /^https:\/\//i.test(source)) {
      setPreview(source)
      setRemoteUrl(source)
      setFileName('社群貼文圖片')
      setDimensions('由瀏覽器擴充功能匯入')
      setAutoStart(params.get('autostart') === '1')
    }
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'))
      if (file) void selectFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('paste', onPaste)
      selectionGeneration.current += 1
      analysisGeneration.current += 1
      analysisController.current?.abort()
      if (localPreviewUrl.current) URL.revokeObjectURL(localPreviewUrl.current)
    }
  }, [])

  const selectFile = async (file: File) => {
    const selectionId = ++selectionGeneration.current
    analysisGeneration.current += 1
    analysisController.current?.abort()
    analysisController.current = null
    setBusy(false)
    setError('')
    setResult(null)
    setApiUnavailable(false)
    setHandoffMessage('')
    if (!ACCEPTED.includes(file.type)) return setError('請使用 JPG、PNG 或 WebP 圖片。')
    if (file.size > MAX_BYTES) return setError('圖片超過 18 MB，請先縮小後再試。')
    const originalUrl = URL.createObjectURL(file)
    try {
      const prepared = await prepareImage(originalUrl)
      if (selectionId !== selectionGeneration.current) {
        URL.revokeObjectURL(originalUrl)
        return
      }
      if (localPreviewUrl.current) URL.revokeObjectURL(localPreviewUrl.current)
      localPreviewUrl.current = originalUrl
      setPreview(originalUrl)
      setDataUrl(prepared.dataUrl)
      setRemoteUrl(null)
      setFileName(file.name || '貼上的圖片')
      setDimensions(`${prepared.width} × ${prepared.height} 原始預覽 · ${prepared.analysisWidth} × ${prepared.analysisHeight} 分析`)
    } catch (reason) {
      URL.revokeObjectURL(originalUrl)
      if (selectionId === selectionGeneration.current) setError(reason instanceof Error ? reason.message : '圖片處理失敗')
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void selectFile(file)
  }

  const handoffToChatGPT = async () => {
    setHandoffMessage('')
    setHandoffError(false)
    const prompt = buildPhotoAnalysisPrompt({
      notes,
      sourceKind: remoteUrl ? 'social' : 'upload',
      dimensions
    })
    const copied = await copyToClipboard(prompt)
    setHandoffError(!copied)
    setHandoffMessage(copied
      ? '分析提示已複製。請在剛開啟的 ChatGPT 上傳、拖入或貼上同一張照片，再按 ⌘V 貼上提示並送出。'
      : 'ChatGPT 已開啟，但瀏覽器沒有允許複製提示；請上傳照片後，手動說明想分析的後期風格。')
  }

  const onChatGPTHandoff = (event: MouseEvent<HTMLAnchorElement>) => {
    if (busy) return event.preventDefault()
    if (!preview) {
      event.preventDefault()
      input.current?.click()
      return
    }
    void handoffToChatGPT()
  }

  const analyze = async () => {
    if (!dataUrl && !remoteUrl) return input.current?.click()
    const analysisId = ++analysisGeneration.current
    analysisController.current?.abort()
    const controller = new AbortController()
    analysisController.current = controller
    setBusy(true)
    setError('')
    setResult(null)
    setApiUnavailable(false)
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataUrl ? { imageData: dataUrl, notes } : { imageUrl: remoteUrl, notes }),
        signal: controller.signal
      })
      const raw = await response.text()
      let payload: AnalysisResult & { error?: string; code?: string }
      try {
        payload = JSON.parse(raw) as AnalysisResult & { error?: string; code?: string }
      } catch {
        throw new Error(response.status === 404 ? '本機預覽尚未啟動分析後端；部署並設定 API 金鑰後即可使用。' : '分析服務回傳了無法辨識的內容。')
      }
      if (response.status === 503 && payload.code === 'OPENAI_API_KEY_MISSING') {
        setApiUnavailable(true)
        setHandoffError(false)
        setHandoffMessage('網站 API 尚未啟用。請按「用 ChatGPT 分析」，不需要 API 金鑰。')
        return
      }
      if (!response.ok) throw new Error(payload.error || '分析服務暫時無法使用')
      if (analysisId === analysisGeneration.current) {
        setApiUnavailable(false)
        setResult(payload)
      }
    } catch (reason) {
      if (controller.signal.aborted) return
      if (analysisId === analysisGeneration.current) setError(reason instanceof Error ? reason.message : '分析失敗')
    } finally {
      if (analysisId === analysisGeneration.current) {
        analysisController.current = null
        setBusy(false)
      }
    }
  }

  useEffect(() => {
    if (!autoStart || !remoteUrl || busy || result) return
    setAutoStart(false)
    void analyze()
  }, [autoStart, remoteUrl])

  const reset = () => {
    selectionGeneration.current += 1
    analysisGeneration.current += 1
    analysisController.current?.abort()
    analysisController.current = null
    setBusy(false)
    if (localPreviewUrl.current) URL.revokeObjectURL(localPreviewUrl.current)
    localPreviewUrl.current = null
    setPreview(null); setDataUrl(null); setRemoteUrl(null); setResult(null); setError(''); setFileName(''); setDimensions(''); setApiUnavailable(false); setHandoffMessage(''); setHandoffError(false)
    if (input.current) input.current.value = ''
  }

  return (
    <main className="trace-shell">
      <header className="trace-topbar">
        <a href="/" className="trace-brand" aria-label="返回 Lumen Stage"><span><i /></span><div><b>LUMEN TRACE</b><small>POST-PROCESS FORENSICS</small></div></a>
        <div className="privacy-mark"><i /> 本站不會自動上傳圖片</div>
        <a className="studio-link" href="/">LIGHTING STUDIO ↗</a>
      </header>

      <section className={`trace-workspace ${result ? 'has-report' : ''}`}>
        <aside className="trace-intro">
          <span className="eyebrow">VISUAL FORENSICS / 001</span>
          <h1>讀懂一張照片<br />是怎麼被<span>做出來</span>的。</h1>
          <p>從色調曲線、HSL、局部遮罩到柔光與磨皮，將成品拆解成可以重做的工作流程。</p>
          <div className="capability-index">
            <div><b>TONAL</b><small>曝光 · 曲線 · 高光滾降</small></div>
            <div><b>COLOR</b><small>白平衡 · HSL · 分離色調</small></div>
            <div><b>LOCAL</b><small>膚質 · 柔光 · 銳化 · 插件家族</small></div>
          </div>
        </aside>

        <section className="trace-input-panel">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => event.target.files?.[0] && void selectFile(event.target.files[0])} />
          {!preview ? (
            <button className={`drop-zone ${dragging ? 'is-dragging' : ''}`} onClick={() => input.current?.click()} onDragEnter={() => setDragging(true)} onDragLeave={() => setDragging(false)} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
              <span className="scan-frame"><i /><i /><i /><i /><b>+</b></span>
              <strong>放入一張成品照片</strong>
              <p>拖放、點選，或直接按 ⌘V 貼上</p>
              <small>JPG · PNG · WEBP / MAX 18 MB</small>
            </button>
          ) : (
            <div className="image-stage">
              <img src={preview} alt="準備分析的照片" />
              <div className="scan-line" />
              <div className="image-meta"><span>{fileName}</span><b>{dimensions}</b></div>
              <button className="replace-image" onClick={() => input.current?.click()}>更換圖片</button>
            </div>
          )}

          <label className="analysis-notes"><span>分析重點 <small>選填</small></span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="例如：特別判斷柔光插件、膚色處理，並給 Lightroom 參數…" /></label>
          {error && <div className="trace-error" role="alert">{error}</div>}
          {apiUnavailable && <div className="handoff-callout" role="status"><i />目前未設定 API，但可以直接使用你已登入的 ChatGPT。</div>}
          <div className="analysis-actions">
            {preview && <button className="clear-button" onClick={reset}>清除</button>}
            <a className="chatgpt-button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" aria-disabled={busy} onClick={onChatGPTHandoff}>
              <span><small>免 API · 推薦</small><b>用 ChatGPT 分析</b></span><i aria-hidden="true">↗</i>
            </a>
            <button className="analyze-button" disabled={busy} onClick={() => void analyze()}>
              {busy ? <><i /> 正在拆解影像…</> : <span><small>API 模式</small><b>網站自動分析</b></span>}
            </button>
          </div>
          {handoffMessage && <p className={`handoff-status ${handoffError ? 'is-error' : ''}`} role="status">{handoffMessage}</p>}
          <p className="truth-note">免 API 模式只會複製專業提示並開啟 ChatGPT；照片必須由你確認後貼上或上傳，之後依你的 ChatGPT 資料設定處理。</p>
        </section>
      </section>

      {result && preview && <ResultPanel result={result} imageUrl={preview} />}
      <footer className="trace-footer"><span>LUMEN TRACE · PRIVATE BY DESIGN</span><p>你的照片不會建立公開圖庫。請只分析你有權使用的影像。</p></footer>
    </main>
  )
}
