import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeReferencePixels } from '../src/referenceLighting.ts'

function splitImage(left: number, right: number) {
  const width = 20
  const height = 10
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const value = x < width / 2 ? left : right
    const offset = (y * width + x) * 4
    pixels.set([value, value, value, 255], offset)
  }
  return analyzeReferencePixels(pixels, width, height)
}

test('detects a brighter left side without overstating confidence', () => {
  const result = splitImage(220, 55)
  assert.equal(result.direction, 'left')
  assert.ok(result.contrastRatio > 2)
  assert.ok(result.fillPower < result.keyPower)
})

test('treats an even reference as frontal light', () => {
  const result = splitImage(128, 128)
  assert.equal(result.direction, 'front')
  assert.equal(result.confidence, 'low')
})
