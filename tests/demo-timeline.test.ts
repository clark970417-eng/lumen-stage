import assert from 'node:assert/strict'
import test from 'node:test'
import { DEMO_STEP_MOVEMENT_STARTS, demoStepAt } from '../src/demoTimeline.ts'

test('demo chapters seek to the start of cursor travel', () => {
  assert.deepEqual(DEMO_STEP_MOVEMENT_STARTS, [0, 2.5, 3.75, 5, 7.5, 10])
})

test('active demo chapter follows the same movement timeline', () => {
  assert.equal(demoStepAt(0), 0)
  assert.equal(demoStepAt(2.49), 0)
  assert.equal(demoStepAt(2.5), 1)
  assert.equal(demoStepAt(3.75), 2)
  assert.equal(demoStepAt(5), 3)
  assert.equal(demoStepAt(7.5), 4)
  assert.equal(demoStepAt(10), 5)
  assert.equal(demoStepAt(15), 5)
})
