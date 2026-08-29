type VercelRequest = { method?: string; body?: unknown }
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }

const MAX_DATA_URL_LENGTH = 4_000_000
const ALLOWED_REMOTE_HOSTS = [
  'pbs.twimg.com',
  'video.twimg.com',
  'x.com',
  'twitter.com',
  'instagram.com',
  'www.instagram.com'
]
const ALLOWED_REMOTE_SUFFIXES = ['.cdninstagram.com', '.fbcdn.net', '.twimg.com']

function isAllowedRemoteImage(raw: string) {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return ALLOWED_REMOTE_HOSTS.includes(host) || ALLOWED_REMOTE_SUFFIXES.some((suffix) => host.endsWith(suffix))
  } catch {
    return false
  }
}

function analysisPrompt(notes: string) {
  return `你是一位專業的照片後期鑑識師。請分析成品影像中可見的後期結果，而不是假裝知道不可見的編輯歷史。

規則：
- 所有結論要區分可見證據、合理推論、其他可能解釋與信心。
- 不得把精確插件、預設、相機描述檔或滑桿值說成已證實事實。
- 檢查曝光與黑白點、曲線、白平衡、HSL、色彩分級、局部遮罩、膚質、Dodge & Burn、柔光／Bloom／Halation、清晰度、銳化、降噪、顆粒與可能的合成。
- Lightroom／ACR 請給實用的起始範圍，例如「Texture -10 至 -25」，不要偽造還原值。
- 插件只說家族或常見產品類型，並附手動等效方法。
- 使用繁體中文，內容具體、精簡、可操作。
${notes ? `\n使用者特別關注：${notes.slice(0, 800)}` : ''}`
}

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    styleLabel: { type: 'string' }, diagnosis: { type: 'string' }, confidence: { type: 'string', enum: ['高', '中', '低'] },
    evidence: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { observation: { type: 'string' }, inference: { type: 'string' }, alternative: { type: 'string' }, confidence: { type: 'string' } }, required: ['observation', 'inference', 'alternative', 'confidence'] } },
    editStack: { type: 'array', items: { type: 'string' } },
    lightroom: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { control: { type: 'string' }, range: { type: 'string' }, purpose: { type: 'string' } }, required: ['control', 'range', 'purpose'] } },
    photoshop: { type: 'array', items: { type: 'string' } },
    plugins: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { family: { type: 'string' }, likelihood: { type: 'string' }, manualEquivalent: { type: 'string' } }, required: ['family', 'likelihood', 'manualEquivalent'] } },
    calibration: { type: 'array', items: { type: 'string' } }
  },
  required: ['styleLabel', 'diagnosis', 'confidence', 'evidence', 'editStack', 'lightroom', 'photoshop', 'plugins', 'calibration']
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') return response.status(405).json({ error: '僅支援 POST 請求。' })
  const key = process.env.OPENAI_API_KEY
  if (!key) return response.status(503).json({ error: '分析服務尚未設定 API 金鑰。請在 Vercel 加入 OPENAI_API_KEY。' })

  const body = (request.body ?? {}) as { imageData?: unknown; imageUrl?: unknown; notes?: unknown }
  const imageData = typeof body.imageData === 'string' ? body.imageData : ''
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : ''
  const notes = typeof body.notes === 'string' ? body.notes : ''
  const validData = /^data:image\/(jpeg|png|webp);base64,/i.test(imageData) && imageData.length <= MAX_DATA_URL_LENGTH
  const validRemote = Boolean(imageUrl && isAllowedRemoteImage(imageUrl))
  if (!validData && !validRemote) return response.status(400).json({ error: '圖片格式、大小或來源不受支援。社群匯入目前僅支援 X 與 Instagram。' })

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.PHOTO_ANALYSIS_MODEL || 'gpt-5.4',
        store: false,
        input: [{ role: 'user', content: [{ type: 'input_text', text: analysisPrompt(notes) }, { type: 'input_image', image_url: validData ? imageData : imageUrl, detail: 'high' }] }],
        text: { format: { type: 'json_schema', name: 'photo_postprocess_analysis', strict: true, schema } }
      })
    })
    const payload = await openaiResponse.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } }
    if (!openaiResponse.ok) throw new Error(payload.error?.message || '影像模型沒有回應')
    const text = payload.output_text || payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text
    if (!text) throw new Error('分析結果格式不完整')
    return response.status(200).json(JSON.parse(text))
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    return response.status(502).json({ error: `分析暫時失敗：${message}` })
  }
}
