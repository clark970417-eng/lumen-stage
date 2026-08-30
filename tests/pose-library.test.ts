import test from 'node:test'
import assert from 'node:assert/strict'
import { translateCatalog } from '../src/i18n.ts'
import { POSE_LIBRARY } from '../src/pose.ts'

test('every pose has finite joint values and localized guidance', () => {
  assert.equal(new Set(POSE_LIBRARY.map((entry) => entry.id)).size, POSE_LIBRARY.length)
  for (const entry of POSE_LIBRARY) {
    for (const [key, value] of Object.entries(entry.pose)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${entry.id}.${key} must be finite`)
    }
    assert.notEqual(translateCatalog('zh', `pose.note.${entry.id}`, entry.note), entry.note, `${entry.id} needs Chinese guidance`)
    assert.notEqual(translateCatalog('ja', `pose.note.${entry.id}`, entry.note), entry.note, `${entry.id} needs Japanese guidance`)
  }
})

test('walking pose keeps a readable counter-swing and grounded stride', () => {
  const walking = POSE_LIBRARY.find((entry) => entry.id === 'walking')!.pose
  assert.ok(walking.leftLeg > 0 && walking.rightLeg < 0)
  assert.ok(walking.leftArmForward < 0 && walking.rightArmForward > 0)
  assert.ok(walking.rightKnee > walking.leftKnee)
  assert.ok(Math.abs(walking.leftArmForward) <= 15 && Math.abs(walking.rightArmForward) <= 15)
})
