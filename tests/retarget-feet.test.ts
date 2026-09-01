import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { landFeet, mapSkeleton } from '../src/retarget.ts'

/**
 * A pair of legs on a model inside a group, which is the arrangement that
 * matters: the model is moved within the group to seat the actor, so where the
 * floor is cannot be read from inside the model.
 */
// Seating moves the model down inside its group until the pelvis meets the
// seat, so the offset is negative — a 0.94 m standing pelvis onto a 0.54 m
// perch is -0.40.
const SEATED_OFFSET = -0.4

function buildLegs({ modelY = SEATED_OFFSET, leftKnee = 1.4, rightKnee = 1.4 } = {}) {
  const group = new THREE.Group()
  const model = new THREE.Group()
  model.position.y = modelY
  group.add(model)
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const made = new THREE.Bone()
    made.name = name
    made.position.set(x, y, z)
    parent.add(made)
    return made
  }
  const hips = bone('Bip01_Pelvis', model, 0, 0.94, 0)
  const spine = bone('Bip01_Spine', hips, 0, 0.2, 0)
  const chest = bone('Bip01_Spine2', spine, 0, 0.24, 0)
  bone('Bip01_L_UpperArm', chest, 0.169, 0.07, 0)
  bone('Bip01_R_UpperArm', chest, -0.169, 0.07, 0)
  bone('Bip01_Head', chest, 0, 0.22, 0)
  const leg = (side: 'L' | 'R', sign: number, bend: number) => {
    const thigh = bone(`Bip01_${side}_Thigh`, hips, sign * 0.1, -0.02, 0)
    thigh.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend)
    const calf = bone(`Bip01_${side}_Calf`, thigh, 0, -0.42, 0)
    calf.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -bend)
    const foot = bone(`Bip01_${side}_Foot`, calf, 0, -0.445, 0)
    return { thigh, calf, foot }
  }
  const left = leg('L', 1, leftKnee)
  const right = leg('R', -1, rightKnee)
  group.updateMatrixWorld(true)
  return { group, model, map: mapSkeleton(model), left, right }
}

/** The foot bone's height in the frame the model's own position lives in. */
const PLANTED = 0.075

const footInGroup = (rig: ReturnType<typeof buildLegs>, foot: THREE.Bone) =>
  rig.group.worldToLocal(foot.getWorldPosition(new THREE.Vector3())).y

test('a seated actor reaches the floor with the legs, not by dropping the body', () => {
  // The pelvis is on the seat, so the body cannot move — only the legs can.
  const rig = buildLegs()
  const before = footInGroup(rig, rig.left.foot)
  assert.ok(Math.abs(before - PLANTED) > 0.05, 'the pose leaves the foot off the floor to begin with')

  landFeet(rig.map, rig.model, PLANTED)
  rig.group.updateMatrixWorld(true)
  // A few passes of cyclic descent, so within a centimetre rather than exact.
  assert.ok(Math.abs(footInGroup(rig, rig.left.foot) - PLANTED) < 0.01)
  assert.ok(Math.abs(footInGroup(rig, rig.right.foot) - PLANTED) < 0.01)
  assert.equal(rig.model.position.y, SEATED_OFFSET, 'the body stays on the seat')
})

test('the floor is read outside the model, not inside it', () => {
  // Matching a height measured inside the model only means "on the floor"
  // while the model has not moved. A seated one has just been lifted onto a
  // seat, and asked for its resting height there the leg drove the foot a
  // fifth of a metre through the floor.
  for (const modelY of [-0.5, -0.4, -0.28]) {
    const rig = buildLegs({ modelY })
    landFeet(rig.map, rig.model, PLANTED)
    rig.group.updateMatrixWorld(true)
    assert.ok(Math.abs(footInGroup(rig, rig.left.foot) - PLANTED) < 0.01, `model at ${modelY}`)
  }
})

test('an asymmetric pose stays asymmetric — only the height is corrected', () => {
  // Crossed legs have to stay crossed, so the target keeps the foot's own
  // ground position and moves it only up or down.
  const rig = buildLegs({ leftKnee: 1.55, rightKnee: 1.15 })
  const groundOf = (foot: THREE.Bone) => {
    const p = rig.group.worldToLocal(foot.getWorldPosition(new THREE.Vector3()))
    return new THREE.Vector2(p.x, p.z)
  }
  const leftBefore = groundOf(rig.left.foot)
  const rightBefore = groundOf(rig.right.foot)
  const apartBefore = leftBefore.distanceTo(rightBefore)

  landFeet(rig.map, rig.model, PLANTED)
  rig.group.updateMatrixWorld(true)
  assert.ok(groundOf(rig.left.foot).distanceTo(leftBefore) < 0.03, 'the left foot stays where it was on the ground')
  assert.ok(groundOf(rig.right.foot).distanceTo(rightBefore) < 0.03)
  // What matters is that the difference between them survives, not its size.
  const apartAfter = groundOf(rig.left.foot).distanceTo(groundOf(rig.right.foot))
  assert.ok(Math.abs(apartAfter - apartBefore) < 0.02, 'the two feet stay as far apart as the pose put them')
})

test('a seat too high to reach the floor from leaves the leg hanging', () => {
  // A stool or a plinth. The chain reaches as far as it can and stops, which
  // is a straightened leg — what a leg does when it cannot find the floor.
  const rig = buildLegs({ modelY: 0.2 })
  landFeet(rig.map, rig.model, PLANTED)
  rig.group.updateMatrixWorld(true)
  const hip = rig.group.worldToLocal(rig.map.hips!.getWorldPosition(new THREE.Vector3()))
  const foot = rig.group.worldToLocal(rig.left.foot.getWorldPosition(new THREE.Vector3()))
  assert.ok(foot.y > PLANTED, 'the foot does not reach the floor')
  // Thigh plus shin is 0.865; the pose started with the knee bent to 0.54.
  // Reaching for a floor it cannot touch opens the leg out toward straight.
  assert.ok(hip.y - foot.y > 0.75, 'and the leg opens out toward straight')
})
