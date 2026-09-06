import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/feedback.ts'

function response() {
  return { code: 0, body: undefined as unknown, status(code: number) { this.code = code; return this }, json(body: unknown) { this.body = body }, setHeader() {} }
}
test('feedback rejects empty messages and invalid reply addresses', async () => {
  for (const body of [{ message: ' ' }, { message: 'hello', email: 'invalid' }, { message: 'hello', website: 'spam' }]) {
    const res = response()
    await handler({ method: 'POST', body, headers: {} }, res)
    assert.equal(res.code, 400)
  }
})
test('feedback never reports success without a configured delivery service', async () => {
  const old = process.env.FEEDBACK_FORWARD_URL
  delete process.env.FEEDBACK_FORWARD_URL
  try {
    const res = response()
    await handler({ method: 'POST', body: { message: 'hello' }, headers: {} }, res)
    assert.equal(res.code, 503)
    assert.deepEqual(res.body, { ok: false })
  } finally { if (old) process.env.FEEDBACK_FORWARD_URL = old }
})
test('anonymous feedback forwards only permitted fields and handles service failure', async () => {
  const old = process.env.FEEDBACK_FORWARD_URL
  const originalFetch = globalThis.fetch
  process.env.FEEDBACK_FORWARD_URL = 'https://example.test/feedback'
  try {
    let payload: Record<string, unknown> = {}
    globalThis.fetch = async (_url, options) => { assert.equal(new Headers(options?.headers).get('referer'), 'https://lumen-stage.vercel.app/'); payload = JSON.parse(String(options?.body)); return new Response(JSON.stringify({ success: 'true' })) }
    const res = response()
    await handler({ method: 'POST', body: { message: 'anonymous feedback', recipient: 'attacker', locale: 'zh' }, headers: {} }, res)
    assert.equal(res.code, 200)
    assert.equal(payload.message, 'anonymous feedback')
    assert.equal(payload.email, undefined)
    assert.equal(payload.recipient, undefined)
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false }))
    const failed = response()
    await handler({ method: 'POST', body: { message: 'retry' }, headers: {} }, failed)
    assert.equal(failed.code, 502)
  } finally {
    globalThis.fetch = originalFetch
    if (old) process.env.FEEDBACK_FORWARD_URL = old
    else delete process.env.FEEDBACK_FORWARD_URL
  }
})
