import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SEAT_HEIGHT, seatedModelY, seatHeightOf } from '../src/layout.ts'
import { pelvisHeight } from '../src/ik.ts'
import { NEUTRAL_POSE, POSE_LIBRARY, type ModelPose } from '../src/pose.ts'

/** Where the pelvis ends up in the room, given the placement this returns. */
const pelvisInRoom = (seat: number, hipLocalY: number, modelScale: number, groupScale: number) =>
  (seatedModelY(seat, hipLocalY, modelScale, groupScale) + hipLocalY * modelScale) * groupScale

test('a seated actor is placed by the pelvis, on whatever is under them', () => {
  // The bug this replaced raised the whole group by the seat height while the
  // actor's own pelvis stayed where standing had left it, so the figure
  // floated a chair's height above the chair.
  const chair = seatHeightOf('chair')!
  // A model normalised to 1.82 m whose posed pelvis sits 94 cm up its own body.
  assert.ok(Math.abs(pelvisInRoom(chair, 0.94, 1, 1) - chair) < 1e-9)
  // The same actor exported in centimetres, so its own scale is 1/100.
  assert.ok(Math.abs(pelvisInRoom(chair, 94, 0.01, 1) - chair) < 1e-9)
})

test('the height control does not lift the actor off the seat', () => {
  // The placement happens inside a group the height slider scales, so a 1.5 m
  // actor and a 2 m one have to end up on the same chair.
  const chair = seatHeightOf('chair')!
  for (const height of [1.5, 1.82, 2.0]) {
    const groupScale = height / 1.82
    assert.ok(Math.abs(pelvisInRoom(chair, 0.94, 1, groupScale) - chair) < 1e-9, `${height} m actor`)
  }
})

test('a taller seat carries the actor with it', () => {
  const chair = seatHeightOf('chair')!
  const plinth = seatHeightOf('plinth')!
  assert.ok(plinth > chair)
  assert.ok(pelvisInRoom(plinth, 0.94, 1, 1) > pelvisInRoom(chair, 0.94, 1, 1))
  // A scaled-up prop is a taller seat.
  assert.ok(seatHeightOf('chair', 1.4)! > chair)
  assert.equal(seatHeightOf('lightStand'), null)
})

test('sitting on nothing still puts the pelvis at a chair height, on both rigs', () => {
  // The solver and the imported actor have to agree, or the drag handles and
  // the person they belong to sit at different heights.
  const seated = POSE_LIBRARY.filter((entry) => entry.pose.seated)
  assert.equal(seated.length, 4)
  for (const entry of seated) {
    const pose = { ...NEUTRAL_POSE, ...entry.pose } as ModelPose
    assert.equal(pelvisHeight(pose, null), DEFAULT_SEAT_HEIGHT, entry.id)
    assert.equal(pelvisHeight(pose, seatHeightOf('chair')!), seatHeightOf('chair'), entry.id)
    assert.ok(Math.abs(pelvisInRoom(DEFAULT_SEAT_HEIGHT, 0.94, 1, 1) - pelvisHeight(pose, null)) < 1e-9)
  }
})

test('a standing pose is still placed by the feet, not the pelvis', () => {
  const standing = { ...NEUTRAL_POSE } as ModelPose
  assert.ok(pelvisHeight(standing, null) > DEFAULT_SEAT_HEIGHT + 0.3, 'a standing pelvis is nowhere near a seat')
})
