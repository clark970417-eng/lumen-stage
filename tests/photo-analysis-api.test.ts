import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../api/analyze.ts'
import { resetRateLimitsForTests } from '../api/requestGuard.ts'

test('returns a structured ChatGPT fallback when the API key is missing', async () => {
  const previousKey = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY
  let statusCode = 0
  let payload: unknown
  const response = {
    status(code: number) { statusCode = code; return response },
    json(body: unknown) { payload = body },
    setHeader() {}
  }

  try {
    await handler({ method: 'POST', body: {} }, response)
  } finally {
    if (previousKey) process.env.OPENAI_API_KEY = previousKey
  }

  assert.equal(statusCode, 503)
  assert.deepEqual(payload, {
    code: 'OPENAI_API_KEY_MISSING',
    error: '網站自動分析尚未啟用；可改用免 API 的 ChatGPT 模式。'
  })
})

test('paid analysis applies an output budget and hides upstream failures', async () => {
  const previousKey = process.env.OPENAI_API_KEY
  const previousFetch = globalThis.fetch
  const previousConsoleError = console.error
  process.env.OPENAI_API_KEY = 'test-key'
  resetRateLimitsForTests()
  console.error = () => undefined
  let requestBody: { max_output_tokens?: number } = {}
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as { max_output_tokens?: number }
    return new Response(JSON.stringify({ error: { message: 'sensitive provider detail' } }), { status: 500 })
  }
  let statusCode = 0
  let payload: unknown
  const response = {
    status(code: number) { statusCode = code; return response },
    json(body: unknown) { payload = body },
    setHeader() {}
  }

  try {
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.20' }, body: { imageData: 'data:image/png;base64,AA==' } }, response)
  } finally {
    globalThis.fetch = previousFetch
    console.error = previousConsoleError
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
    resetRateLimitsForTests()
  }

  assert.equal(requestBody.max_output_tokens, 2_200)
  assert.equal(statusCode, 502)
  assert.deepEqual(payload, { code: 'ANALYSIS_FAILED', error: '分析暫時失敗，請稍後再試。' })
})
