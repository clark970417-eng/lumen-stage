import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { STUDIO_HAIR_SOURCE_SCALE, STUDIO_HAIR_SOURCE_URL, studioEyeAnchor, studioHairAnchor } from '../src/studioHumanDetails.ts'

test('shipped human face details use its real -Z forward axis', () => {
  const head = new THREE.Vector3(0, 1.672, -0.090)
  const eyes = studioEyeAnchor(head, 1.82)
  const hair = studioHairAnchor(head, 1.82)

  assert.ok(eyes.z < head.z, 'eyeballs must sit toward the face, not behind the skull')
  assert.ok(Math.abs(eyes.y - 1.694) < 1e-9)
  assert.ok(hair.z > head.z, 'hair cap centre follows the rearward scalp centre')
})

test('runtime hair is a compact CC0 MakeHuman mesh, not a procedural helmet', () => {
  assert.equal(STUDIO_HAIR_SOURCE_URL, '/models/lumen-human/hair/short04.obj')
  assert.ok(STUDIO_HAIR_SOURCE_SCALE > 0 && STUDIO_HAIR_SOURCE_SCALE < 0.2)
  const source = readFileSync(new URL('../public/models/lumen-human/hair/short04.obj', import.meta.url), 'utf8')
  assert.match(source, /explicitly released as CC0/i)
  assert.ok(source.split('\n').filter((line) => line.startsWith('v ')).length > 500)
  assert.ok(source.split('\n').filter((line) => line.startsWith('f ')).length > 300)
})
