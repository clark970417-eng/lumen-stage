import test from 'node:test'
import assert from 'node:assert/strict'
import { searchForUiMode } from '../src/uiMode.ts'

test('switching to the full interface replaces a forced mobile query', () => {
  assert.equal(searchForUiMode('?ui=mobile', 'full'), '?ui=full')
})

test('switching shells preserves unrelated query parameters', () => {
  assert.equal(searchForUiMode('?project=portrait&ui=mobile', 'full'), '?project=portrait&ui=full')
  assert.equal(searchForUiMode('?project=portrait&ui=full', 'auto'), '?project=portrait')
})
