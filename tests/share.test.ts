import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeScene, encodeScene } from '../src/share.ts'

test('scene links round-trip multilingual project data', async () => {
  const scene = JSON.stringify({ schemaVersion: 23, projectName: '棚拍 Portrait ポートレート', lights: [{ power: 13 }] })
  assert.equal(await decodeScene(await encodeScene(scene)), scene)
})

test('scene decoder rejects malformed data', async () => {
  await assert.rejects(() => decodeScene('not-a-scene'))
})

test('scene encoder enforces the five megabyte safety limit', async () => {
  await assert.rejects(() => encodeScene('x'.repeat(5 * 1024 * 1024 + 1)), /sharing limit/)
})
