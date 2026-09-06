import { consumeRateLimit, requestClientId } from './requestGuard.ts'

type Request = { method?: string; headers: Record<string, string | string[] | undefined> }
type Response = { status: (code: number) => Response; json: (body: unknown) => void; setHeader: (name: string, value: string) => void }

/** Web3Forms' public form key selects the owner inbox; submission is browser-only. */
export default function handler(request: Request, response: Response) {
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ ok: false })
  }
  const limit = consumeRateLimit(`feedback:${requestClientId(request.headers)}`)
  if (!limit.allowed) {
    response.setHeader('Retry-After', '60')
    return response.status(429).json({ ok: false })
  }
  const accessKey = process.env.WEB3FORMS_ACCESS_KEY
  if (!accessKey) return response.status(503).json({ ok: false })
  return response.status(200).json({ accessKey })
}
