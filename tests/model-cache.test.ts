import test from 'node:test'
import assert from 'node:assert/strict'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { loadActorSource } from '../src/modelCache.ts'

test('concurrent and repeated actors decode once; rejected loads can retry', async () => {
  const original = GLTFLoader.prototype.loadAsync
  let loads = 0
  let fail = true
  GLTFLoader.prototype.loadAsync = async function (url) {
    loads++
    if (url === 'broken' && fail) throw new Error('offline')
    return { scene: { name: url } } as unknown as GLTF
  }
  try {
    const first = loadActorSource('actor-a')
    assert.equal(loadActorSource('actor-a'), first)
    await first
    await loadActorSource('actor-a')
    assert.equal(loads, 1)
    await assert.rejects(loadActorSource('broken'), /offline/)
    fail = false
    await loadActorSource('broken')
    assert.equal(loads, 3)
    await loadActorSource('actor-c')
    await loadActorSource('actor-a')
    assert.equal(loads, 5, 'least recently used actor is evicted')
  } finally { GLTFLoader.prototype.loadAsync = original }
})
