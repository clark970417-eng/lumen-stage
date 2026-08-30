import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { STUDIO_HAIR_CAP, studioEyeAnchor, studioHairAnchor } from '../src/studioHumanDetails.ts'

test('shipped human face details use its real -Z forward axis', () => {
  const head = new THREE.Vector3(0, 1.672, -0.090)
  const eyes = studioEyeAnchor(head, 1.82)
  const hair = studioHairAnchor(head, 1.82)

  assert.ok(eyes.z < head.z, 'eyeballs must sit toward the face, not behind the skull')
  assert.ok(Math.abs(eyes.y - 1.694) < 1e-9)
  assert.ok(hair.z > head.z, 'hair cap centre follows the rearward scalp centre')
})

test('hair cap stops above the equator and hugs the head', () => {
  assert.ok(STUDIO_HAIR_CAP.thetaLength < Math.PI / 2, 'hairline must not become a bowl-cut equator')
  assert.ok(STUDIO_HAIR_CAP.scale.x < STUDIO_HAIR_CAP.scale.y)
  assert.ok(STUDIO_HAIR_CAP.scale.z < STUDIO_HAIR_CAP.scale.y)
})
