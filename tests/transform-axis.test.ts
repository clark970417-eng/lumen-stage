import assert from 'node:assert/strict'
import test from 'node:test'
import { lockPositionToAxis } from '../src/transformAxis.ts'

test('single-axis transforms cannot change the other coordinates', () => {
  const start: [number, number, number] = [1.25, 2.5, -0.75]
  const requested: [number, number, number] = [4, 5, 6]

  assert.deepEqual(lockPositionToAxis(start, requested, 'X'), [4, 2.5, -0.75])
  assert.deepEqual(lockPositionToAxis(start, requested, 'Y'), [1.25, 5, -0.75])
  assert.deepEqual(lockPositionToAxis(start, requested, 'Z'), [1.25, 2.5, 6])
})

test('center transforms keep free movement on all axes', () => {
  assert.deepEqual(lockPositionToAxis([1, 2, 3], [4, 5, 6]), [4, 5, 6])
})
