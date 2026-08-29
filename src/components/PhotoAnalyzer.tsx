import { useEffect, useRef, useState, type DragEvent } from 'react'
import '../photo-analyzer.css'

type AnalysisResult = {
  styleLabel: string
  diagnosis: string
  confidence: '高' | '中' | '低'
  evidence: Array<{ observation: string; inference: string; alternative: string; confidence: string }>
  editStack: string[]
  lightroom: Array<{ control: string; range: string; purpose: string }>
  photoshop: string[]
  plugins: Array<{ family: string; likelihood: string; manualEquivalent: string }>
  calibration: string[]
}

const MAX_BYTES = 18 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('無法讀取圖片'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

async function prepareImage(file: File) {
  const source = await fileToDataUrl(file)
  const image = new Image()
  image.src = source
  await image.decode()
  const maxSide = 1800
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * ratio))
  const height = Math.max(1, Math.round(image.naturalHeight * ratio))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('瀏覽器無法處理這張圖片')
  context.drawImage(image, 0, 0, width, height)
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.86), width: image.naturalWidth, height: image.naturalHeight }
}

function ResultPanel({ result }: { result: AnalysisResult }) {
  return (
    <article className="trace-report" aria-live="polite">
      <header className="report-hero">
        <div><span>STYLE DIAGNOSIS</span><h2>{result.styleLabel}</h2></div>
        <p>{result.diagnosis}</p>
        <small>整體信心：{result.confidence}</small>
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

      {result.plugins.length > 0 && <section>
        <div className="section-title"><span>05</span><h3>可能的插件家族</h3></div>
        <div className="plugin-list">{result.plugins.map((item) => <div key={item.family}><b>{item.family}</b><span>{item.likelihood}</span><p>手動等效：{item.manualEquivalent}</p></div>)}</div>
      </section>}

      <section>
        <div className="section-title"><span>06</span><h3>比對校正</h3></div>
        <ul className="calibration-list">{result.calibration.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
    </article>
  )
}

export default function PhotoAnalyzer() {
  const input = useRef<HTMLInputElement>(null)
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
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const selectFile = async (file: File) => {
    setError('')
    setResult(null)
    if (!ACCEPTED.includes(file.type)) return setError('請使用 JPG、PNG 或 WebP 圖片。')
    if (file.size > MAX_BYTES) return setError('圖片超過 18 MB，請先縮小後再試。')
    try {
      const prepared = await prepareImage(file)
      setPreview(prepared.dataUrl)
      setDataUrl(prepared.dataUrl)
      setRemoteUrl(null)
      setFileName(file.name || '貼上的圖片')
      setDimensions(`${prepared.width} × ${prepared.height}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '圖片處理失敗')
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void selectFile(file)
  }

  const analyze = async () => {
    if (!dataUrl && !remoteUrl) return input.current?.click()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataUrl ? { imageData: dataUrl, notes } : { imageUrl: remoteUrl, notes })
      })
      const raw = await response.text()
      let payload: AnalysisResult & { error?: string }
      try {
        payload = JSON.parse(raw) as AnalysisResult & { error?: string }
      } catch {
        throw new Error(response.status === 404 ? '本機預覽尚未啟動分析後端；部署並設定 API 金鑰後即可使用。' : '分析服務回傳了無法辨識的內容。')
      }
      if (!response.ok) throw new Error(payload.error || '分析服務暫時無法使用')
      setResult(payload)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '分析失敗')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!autoStart || !remoteUrl || busy || result) return
    setAutoStart(false)
    void analyze()
  }, [autoStart, remoteUrl])

  const reset = () => {
    setPreview(null); setDataUrl(null); setRemoteUrl(null); setResult(null); setError(''); setFileName(''); setDimensions('')
    if (input.current) input.current.value = ''
  }

  return (
    <main className="trace-shell">
      <header className="trace-topbar">
        <a href="/" className="trace-brand" aria-label="返回 Lumen Stage"><span><i /></span><div><b>LUMEN TRACE</b><small>POST-PROCESS FORENSICS</small></div></a>
        <div className="privacy-mark"><i /> 圖片僅用於本次分析</div>
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
          <div className="analysis-actions">
            {preview && <button className="clear-button" onClick={reset}>清除</button>}
            <button className="analyze-button" disabled={busy} onClick={() => void analyze()}>{busy ? <><i /> 正在拆解影像…</> : '開始專業分析 →'}</button>
          </div>
          <p className="truth-note">分析會提供可驗證的推論與信心程度，不會把無法從成品證明的預設或插件名稱說成事實。</p>
        </section>
      </section>

      {result && <ResultPanel result={result} />}
      <footer className="trace-footer"><span>LUMEN TRACE · PRIVATE BY DESIGN</span><p>你的照片不會建立公開圖庫。請只分析你有權使用的影像。</p></footer>
    </main>
  )
}
