import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { applyFingerCurlDelta, applyWorldPoseDelta } from '../src/retargetDelta.ts'

test('a neutral pose preserves an imported bone rest orientation', () => {
  const neutral = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, -0.22, 0.08))
  const importedRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.31, 0.17, 0.42))
  const output = new THREE.Quaternion()

  applyWorldPoseDelta(output, neutral, neutral, importedRest)

  assert.ok(output.angleTo(importedRest) < 1e-7)
})

test('a non-neutral pose adds only its delta to the imported rest orientation', () => {
  const neutral = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.12)
  const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.48)
  const importedRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, -0.15, 0.33))
  const expected = target.clone().multiply(neutral.clone().invert()).multiply(importedRest)
  const output = new THREE.Quaternion()

  applyWorldPoseDelta(output, target, neutral, importedRest)

  assert.ok(output.angleTo(expected) < 1e-7)
})

test('a relaxed imported hand preserves its authored finger arc', () => {
  const rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, -0.04, -0.24))
  const output = new THREE.Quaternion()

  applyFingerCurlDelta(output, rest, 0)

  assert.ok(output.angleTo(rest) < 1e-7)
})

test('an explicit hand pose still bends from the imported rest shape', () => {
  const rest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, -0.04, -0.24))
  const output = new THREE.Quaternion()

  applyFingerCurlDelta(output, rest, 30)

  assert.ok(output.angleTo(rest) > THREE.MathUtils.degToRad(29))
})
