import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/feedback.ts'
function response() { return { code: 0, body: undefined as unknown, status(code: number) { this.code = code; return this }, json(body: unknown) { this.body = body }, setHeader() {} } }
test('feedback rejects server-side submissions', () => {
  const res = response(); handler({ method: 'POST', headers: {} }, res); assert.equal(res.code, 405)
})
test('feedback config fails closed when no owner key is configured', () => {
  const old = process.env.WEB3FORMS_ACCESS_KEY; delete process.env.WEB3FORMS_ACCESS_KEY
  try { const res = response(); handler({ method: 'GET', headers: {} }, res); assert.equal(res.code, 503) }
  finally { if (old) process.env.WEB3FORMS_ACCESS_KEY = old }
})
test('feedback only exposes the configured public form identifier', () => {
  const old = process.env.WEB3FORMS_ACCESS_KEY; process.env.WEB3FORMS_ACCESS_KEY = 'owner-public-form-key'
  try { const res = response(); handler({ method: 'GET', headers: {} }, res); assert.equal(res.code, 200); assert.deepEqual(res.body, { accessKey: 'owner-public-form-key' }) }
  finally { if (old) process.env.WEB3FORMS_ACCESS_KEY = old; else delete process.env.WEB3FORMS_ACCESS_KEY }
})
