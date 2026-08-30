import assert from 'node:assert/strict'
import test from 'node:test'
import { createAutosaveScheduler } from '../src/autosave.ts'

test('autosave serializes only once after a burst of updates', async () => {
  let serializations = 0
  const saved: string[] = []
  const scheduler = createAutosaveScheduler<number>({
    delay: 5,
    initialSerialized: '0',
    serialize: (value) => { serializations += 1; return String(value) },
    persist: (value) => { saved.push(value) },
    onSaved() {},
    onError(error) { throw error },
  })
  scheduler.schedule(1)
  scheduler.schedule(2)
  scheduler.schedule(3)
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(serializations, 1)
  assert.deepEqual(saved, ['3'])
})
