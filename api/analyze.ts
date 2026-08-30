import { buildPhotoAnalysisPrompt } from '../src/photoAnalysisPrompt.ts'
import { consumeRateLimit, requestClientId } from './requestGuard.ts'

type VercelRequest = { method?: string; body?: unknown; headers?: Record<string, string | string[] | undefined> }
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }

const MAX_DATA_URL_LENGTH = 4_000_000
const MAX_REMOTE_URL_LENGTH = 2_048
const ANALYSIS_TIMEOUT_MS = 45_000
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

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    styleLabel: { type: 'string' }, diagnosis: { type: 'string' }, confidence: { type: 'string', enum: ['高', '中', '低'] },
    limitations: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { observation: { type: 'string' }, inference: { type: 'string' }, alternative: { type: 'string' }, confidence: { type: 'string' } }, required: ['observation', 'inference', 'alternative', 'confidence'] } },
    editStack: { type: 'array', items: { type: 'string' } },
    lightroom: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { control: { type: 'string' }, range: { type: 'string' }, purpose: { type: 'string' } }, required: ['control', 'range', 'purpose'] } },
    photoshop: { type: 'array', items: { type: 'string' } },
    plugins: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { family: { type: 'string' }, likelihood: { type: 'string' }, manualEquivalent: { type: 'string' } }, required: ['family', 'likelihood', 'manualEquivalent'] } },
    calibration: { type: 'array', items: { type: 'string' } }
  },
  required: ['styleLabel', 'diagnosis', 'confidence', 'limitations', 'evidence', 'editStack', 'lightroom', 'photoshop', 'plugins', 'calibration']
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') return response.status(405).json({ error: '僅支援 POST 請求。' })
  const key = process.env.OPENAI_API_KEY
  if (!key) return response.status(503).json({ code: 'OPENAI_API_KEY_MISSING', error: '網站自動分析尚未啟用；可改用免 API 的 ChatGPT 模式。' })

  const body = (request.body ?? {}) as { imageData?: unknown; imageUrl?: unknown; notes?: unknown }
  const imageData = typeof body.imageData === 'string' ? body.imageData : ''
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : ''
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 800) : ''
  const validData = /^data:image\/(jpeg|png|webp);base64,/i.test(imageData) && imageData.length <= MAX_DATA_URL_LENGTH
  const validRemote = Boolean(imageUrl && imageUrl.length <= MAX_REMOTE_URL_LENGTH && isAllowedRemoteImage(imageUrl))
  if (!validData && !validRemote) return response.status(400).json({ error: '圖片格式、大小或來源不受支援。社群匯入目前僅支援 X 與 Instagram。' })

  const rateLimit = consumeRateLimit(requestClientId(request.headers))
  response.setHeader('RateLimit-Limit', String(rateLimit.limit))
  response.setHeader('RateLimit-Remaining', String(rateLimit.remaining))
  response.setHeader('RateLimit-Reset', String(Math.ceil(rateLimit.resetAt / 1000)))
  if (!rateLimit.allowed) return response.status(429).json({ code: 'RATE_LIMITED', error: '分析請求過於頻繁，請稍後再試。' })

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.PHOTO_ANALYSIS_MODEL || 'gpt-5.4',
        store: false,
        max_output_tokens: 2_200,
        input: [{ role: 'user', content: [{ type: 'input_text', text: buildPhotoAnalysisPrompt({ notes, sourceKind: validRemote ? 'social' : 'upload' }) }, { type: 'input_image', image_url: validData ? imageData : imageUrl, detail: 'high' }] }],
        text: { format: { type: 'json_schema', name: 'photo_postprocess_analysis', strict: true, schema } }
      })
    })
    const payload = await openaiResponse.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } }
    if (!openaiResponse.ok) throw new Error(payload.error?.message || '影像模型沒有回應')
    const text = payload.output_text || payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text
    if (!text) throw new Error('分析結果格式不完整')
    return response.status(200).json(JSON.parse(text))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown analysis error'
    console.error('[photo-analysis]', message.slice(0, 500))
    return response.status(502).json({ code: 'ANALYSIS_FAILED', error: '分析暫時失敗，請稍後再試。' })
  }
}
