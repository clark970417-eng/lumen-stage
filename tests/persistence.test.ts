import test from 'node:test'
import assert from 'node:assert/strict'
import { formatStorage, hasLocalProject } from '../src/persistence.ts'

test('storage usage is formatted for the project panel', () => {
  assert.equal(formatStorage(0), '0 MB')
  assert.equal(formatStorage(1.5 * 1024 * 1024), '1.5 MB')
  assert.equal(formatStorage(128 * 1024 * 1024), '128 MB')
})

test('legacy browser projects are detected for automatic recovery', () => {
  const keys = ['unrelated', 'lumen-stage-scene-v21']
  assert.equal(hasLocalProject({ length: keys.length, key: (index) => keys[index] ?? null }), true)
  assert.equal(hasLocalProject({ length: 1, key: () => 'unrelated' }), false)
})
