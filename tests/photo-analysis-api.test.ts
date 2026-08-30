import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../api/analyze.ts'

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
