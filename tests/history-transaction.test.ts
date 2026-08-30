import assert from 'node:assert/strict'
import test from 'node:test'
import { createHistoryTransaction } from '../src/historyTransaction.ts'

test('a drag captures one initial undo snapshot', () => {
  const history = createHistoryTransaction<number>()
  history.begin()
  assert.equal(history.capture(() => 10), null)
  assert.equal(history.capture(() => 20), null)
  assert.equal(history.capture(() => 30), null)
  assert.equal(history.end(), 10)
})

test('non-transactional edits produce an immediate snapshot', () => {
  const history = createHistoryTransaction<number>()
  assert.equal(history.capture(() => 42), 42)
})
