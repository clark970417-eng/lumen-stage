import test from 'node:test'
import assert from 'node:assert/strict'
import { CHAIR_SEAT_TOP, DEFAULT_SEAT_HEIGHT, FOOTPRINT, SEAT_TO_HIP, seatedHipHeight, seatedModelY, seatHeightOf } from '../src/layout.ts'
import { pelvisHeight } from '../src/ik.ts'
import { NEUTRAL_POSE, POSE_LIBRARY, type ModelPose } from '../src/pose.ts'
import { DEFAULT_PHYSIQUE } from '../src/physique.ts'
import { seatingForPose } from '../src/seating.ts'
import type { StudioObject } from '../src/store.ts'

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
  // Four solved and three captured. A count rather than a floor, so adding a
  // seated pose without checking it lands on the chair trips this.
  assert.equal(seated.length, 7)
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

test('a chair is the size chairs are, and only catches an actor over its seat', () => {
  // It was half as big again in every direction, which made every actor sat on
  // it look like a child.
  assert.ok(CHAIR_SEAT_TOP >= 0.43 && CHAIR_SEAT_TOP <= 0.48, 'a dining chair seat height')
  // And the reach that decides whether an actor is sitting on it has to follow
  // the seat down, or a smaller chair still captures someone standing beside it.
  assert.ok(FOOTPRINT.chair > 0.23, 'forgiving enough to place by hand')
  assert.ok(FOOTPRINT.chair < 0.35, 'but not wider than the seat it stands for')
})

/** The fields a chair needs that say nothing about seating. */
const PROP_FILLER = {
  scale: 1, color: '#6f4938', material: 'matte' as const, locked: false,
  subjectHeight: 1.74, subjectSkinColor: '#b9826b', subjectOutfitColor: '#343c48',
  subjectSkinRoughness: 55, subjectSkinOil: 22, subjectSubsurface: 45,
  subjectMakeup: 'natural' as const, subjectEyeColor: '#4b372b', subjectHairColor: '#211815',
  subjectHairGloss: 35, subjectOutfitFabric: 'cotton' as const, subjectPosePreset: 'neutral' as const,
  subjectPose: { ...NEUTRAL_POSE }, subjectPhysique: { ...DEFAULT_PHYSIQUE },
  subjectHairStyle: 'long' as const, subjectOutfitStyle: 'tshirt' as const, swatchFabric: 'cotton' as const,
}
const prop = (over: Partial<StudioObject>): StudioObject => ({
  id: 'prop', name: 'Prop', type: 'chair', position: [0, 0, 0], rotationY: 0, ...PROP_FILLER, ...over,
})
const seated = { seated: true }
const standing = { seated: false }
const HERE: [number, number, number] = [0, 0, 0]

test('sitting down puts out a chair, and standing up takes it away again', () => {
  // The reported bug: the chair outlived the pose. Choosing a standing preset
  // afterwards left the actor walking through a chair nobody asked for, with
  // no way out but to find it in the object list and delete it.
  const sat = seatingForPose([], seated, 'model', HERE, 0, 'seated-upright')
  assert.equal(sat.length, 1)
  assert.equal(sat[0].type, 'chair')
  assert.equal(sat[0].seatFor, 'model')

  assert.deepEqual(seatingForPose(sat, standing, 'model', HERE, 0, 'neutral'), [])
})

test('a chair the photographer placed is never taken away', () => {
  // It carries no seatFor, so it is theirs. It is also reused rather than
  // duplicated: sitting down on it must not stack a second chair on the first.
  const theirs = prop({ id: 'their-chair' })
  const sat = seatingForPose([theirs], seated, 'model', HERE, 0, 'seated-upright')
  assert.deepEqual(sat, [theirs], 'a second chair was stacked on the first')
  assert.deepEqual(seatingForPose(sat, standing, 'model', HERE, 0, 'neutral'), [theirs])
})

test('straddling turns our chair round, and leaves theirs alone', () => {
  const sat = seatingForPose([], seated, 'model', HERE, 0, 'seated-upright')
  assert.equal(sat[0].rotationY, 0)
  // The backrest belongs in front of the sitter for this one, and switching
  // between two seated presets reuses the chair -- so it has to turn.
  const straddled = seatingForPose(sat, seated, 'model', HERE, 0, 'seated-backward')
  assert.equal(straddled[0].rotationY, Math.PI)
  assert.equal(seatingForPose(straddled, seated, 'model', HERE, 0, 'seated-upright')[0].rotationY, 0)

  const theirs = prop({ id: 'their-chair', rotationY: 0.7 })
  assert.equal(seatingForPose([theirs], seated, 'model', HERE, 0, 'seated-backward')[0].rotationY, 0.7)
})

test('two subjects each keep their own seat', () => {
  const mine = seatingForPose([], seated, 'model', HERE, 0, 'seated-upright')
  const both = seatingForPose(mine, seated, 'other', [2.5, 0, 0], 0, 'seated-upright')
  assert.equal(both.length, 2)
  // One standing up must not clear the other's chair.
  const oneUp = seatingForPose(both, standing, 'model', HERE, 0, 'neutral')
  assert.deepEqual(oneUp.map((object) => object.seatFor), ['other'])
})

test('a pose that changes no seating returns the list it was given', () => {
  // Pose changes run through the undo stack, so handing back a new array for
  // every standing preset would churn the object list for nothing.
  const objects = [prop({ id: 'their-chair', position: [3, 0, 3] })]
  assert.equal(seatingForPose(objects, standing, 'model', HERE, 0, 'neutral'), objects)
  const sat = seatingForPose([], seated, 'model', HERE, 0, 'seated-upright')
  assert.equal(seatingForPose(sat, seated, 'model', HERE, 0, 'seated-upright'), sat)
})

test('every seated preset in the library asks for a seat', () => {
  // The removal side keys off exactly this flag, so a seated pose that forgot
  // to set it would leave a chairless sitter and, worse, clear a real one.
  for (const entry of POSE_LIBRARY.filter((p) => p.category === 'seated')) {
    assert.equal(entry.pose.seated, true, `${entry.id} is filed under seated but does not sit`)
  }
})
