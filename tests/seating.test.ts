import test from 'node:test'
import assert from 'node:assert/strict'
import { CHAIR_SEAT_TOP, DEFAULT_SEAT_HEIGHT, SEAT_TO_HIP, seatedHipHeight, seatedModelY, seatHeightOf } from '../src/layout.ts'
import { pelvisHeight } from '../src/ik.ts'
import { NEUTRAL_POSE, POSE_LIBRARY, type ModelPose } from '../src/pose.ts'

/** Where the pelvis ends up in the room, for an actor sat on `seat`. */
const pelvisInRoom = (seat: number, hipLocalY: number, modelScale: number, groupScale: number) =>
  (seatedModelY(seatedHipHeight(seat), hipLocalY, modelScale, groupScale) + hipLocalY * modelScale) * groupScale

test('a seated actor is placed by the pelvis, on whatever is under them', () => {
  // The bug this replaced raised the whole group by the seat height while the
  // actor's own pelvis stayed where standing had left it, so the figure
  // floated a chair's height above the chair.
  const chair = seatHeightOf('chair')!
  // A model normalised to 1.82 m whose posed pelvis sits 94 cm up its own body.
  assert.ok(Math.abs(pelvisInRoom(chair, 0.94, 1, 1) - seatedHipHeight(chair)) < 1e-9)
  // The same actor exported in centimetres, so its own scale is 1/100.
  assert.ok(Math.abs(pelvisInRoom(chair, 94, 0.01, 1) - seatedHipHeight(chair)) < 1e-9)
})

test('the height control does not lift the actor off the seat', () => {
  // The placement happens inside a group the height slider scales, so a 1.5 m
  // actor and a 2 m one have to end up on the same chair.
  const chair = seatHeightOf('chair')!
  for (const height of [1.5, 1.82, 2.0]) {
    const groupScale = height / 1.82
    assert.ok(Math.abs(pelvisInRoom(chair, 0.94, 1, groupScale) - seatedHipHeight(chair)) < 1e-9, `${height} m actor`)
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
    assert.equal(pelvisHeight(pose, null), DEFAULT_SEAT_HEIGHT + SEAT_TO_HIP, entry.id)
    assert.equal(pelvisHeight(pose, seatHeightOf('chair')!), seatedHipHeight(seatHeightOf('chair')!), entry.id)
    assert.ok(Math.abs(pelvisInRoom(DEFAULT_SEAT_HEIGHT, 0.94, 1, 1) - pelvisHeight(pose, null)) < 1e-9)
  }
})

test('a standing pose is still placed by the feet, not the pelvis', () => {
  const standing = { ...NEUTRAL_POSE } as ModelPose
  assert.ok(pelvisHeight(standing, null) > DEFAULT_SEAT_HEIGHT + 0.3, 'a standing pelvis is nowhere near a seat')
})

test('the height a sitter is placed at is the height the seat is drawn at', () => {
  // The chair mesh builds its slab around this, so the surface you can see and
  // the surface the pelvis lands on are the same number rather than two that
  // happen to agree today.
  assert.equal(seatHeightOf('chair'), CHAIR_SEAT_TOP)
  assert.ok(Math.abs(pelvisInRoom(seatHeightOf('chair')!, 0.94, 1, 1) - CHAIR_SEAT_TOP - SEAT_TO_HIP) < 1e-9)
})

test('a sitter rests on the seat rather than inside it', () => {
  // The hip joint is not on the surface — the femoral head and the flesh of
  // the buttock are between them. Placed level with it, the thigh spends its
  // lower half inside the seat slab and the hands come down within a couple of
  // centimetres of the surface, which is what read as passing through.
  const chair = seatHeightOf('chair')!
  const hip = seatedHipHeight(chair)
  assert.ok(hip > chair, 'the pelvis rides above the surface')
  // Enough to clear a thigh, not so much that the actor perches above the seat.
  const thighRadius = 0.07
  assert.ok(hip - chair >= thighRadius - 0.005)
  assert.ok(hip - chair < 0.12)

  // The solver, the drag handles and the imported actor all read it from here.
  const pose = { ...NEUTRAL_POSE, seated: true } as ModelPose
  assert.equal(pelvisHeight(pose, chair), hip)
})
