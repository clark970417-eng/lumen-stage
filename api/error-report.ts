type VercelRequest = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }

const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : undefined

export default function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('cache-control', 'no-store')
  if (request.method !== 'POST') return response.status(405).json({ ok: false })
  const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {}
  const report = {
    message: text(body.message, 500), name: text(body.name, 80), stack: text(body.stack, 3000),
    area: text(body.area, 80), source: text(body.source, 180), route: text(body.route, 240),
    release: text(body.release, 120), receivedAt: new Date().toISOString(),
  }
  if (!report.message) return response.status(400).json({ ok: false })
  console.error('[lumen-client-error]', JSON.stringify(report))
  return response.status(202).json({ ok: true })
}
