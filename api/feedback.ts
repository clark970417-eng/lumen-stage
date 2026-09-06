import { consumeRateLimit, requestClientId } from './requestGuard.ts'

type Request = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }
type Response = { status: (code: number) => Response; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }

export default async function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ ok: false })
  }
  const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {}
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!message || message.length > 4000 || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || body.website) return response.status(400).json({ ok: false })
  const limit = consumeRateLimit(`feedback:${requestClientId(request.headers)}`)
  if (!limit.allowed) {
    response.setHeader('Retry-After', '60')
    return response.status(429).json({ ok: false })
  }
  // The forwarding destination is server configuration, never visitor input.
  const endpoint = process.env.FEEDBACK_FORWARD_URL
  if (!endpoint) return response.status(503).json({ ok: false })
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Referer: 'https://lumen-stage.vercel.app/' },
      body: JSON.stringify({ message, ...(email ? { email } : {}), locale: ['zh', 'en', 'ja'].includes(String(body.locale)) ? body.locale : 'en', _subject: 'Lumen Stage — website feedback' }),
      signal: AbortSignal.timeout(15000),
    })
    if (!upstream.ok) {
      console.warn('[feedback-forward]', { status: upstream.status })
      return response.status(502).json({ ok: false })
    }
    const result = await upstream.json() as { success?: boolean | string; message?: string }
    if (result.success !== true && result.success !== 'true') {
      console.warn('[feedback-forward]', { reason: /activat/i.test(result.message ?? '') ? 'activation_required' : 'provider_rejected' })
      return response.status(502).json({ ok: false })
    }
    return response.status(200).json({ ok: true })
  } catch (error) {
    console.warn('[feedback-forward]', { reason: error instanceof Error ? error.name : 'network_error' })
    return response.status(502).json({ ok: false })
  }
}
