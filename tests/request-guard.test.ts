import assert from 'node:assert/strict'
import test from 'node:test'
import { consumeRateLimit, requestClientId, resetRateLimitsForTests } from '../api/requestGuard.ts'

test('analysis requests are limited per forwarded client', () => {
  const previous = process.env.ANALYSIS_RATE_LIMIT_PER_MINUTE
  process.env.ANALYSIS_RATE_LIMIT_PER_MINUTE = '2'
  resetRateLimitsForTests()
  try {
    assert.equal(consumeRateLimit('visitor', 1_000).allowed, true)
    assert.equal(consumeRateLimit('visitor', 1_001).allowed, true)
    assert.equal(consumeRateLimit('visitor', 1_002).allowed, false)
    assert.equal(consumeRateLimit('other', 1_002).allowed, true)
    assert.equal(consumeRateLimit('visitor', 61_001).allowed, true)
  } finally {
    if (previous === undefined) delete process.env.ANALYSIS_RATE_LIMIT_PER_MINUTE
    else process.env.ANALYSIS_RATE_LIMIT_PER_MINUTE = previous
    resetRateLimitsForTests()
  }
})

test('forwarded client parsing uses only the first address', () => {
  assert.equal(requestClientId({ 'x-forwarded-for': '203.0.113.7, 10.0.0.2' }), '203.0.113.7')
  assert.equal(requestClientId({ 'x-real-ip': '198.51.100.9' }), '198.51.100.9')
})
