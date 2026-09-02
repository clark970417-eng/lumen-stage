import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { applyPoseToSkeleton, captureRestPose, landHands, mapSkeleton } from '../src/retarget.ts'
import { NEUTRAL_POSE, POSE_LIBRARY, type ModelPose } from '../src/pose.ts'
import { forwardKinematics } from '../src/ik.ts'
import { PHYSIQUE_PRESETS } from '../src/physique.ts'

/**
 * A minimal humanoid, built with either side's arm on either side of the
 * centreline, and standing wherever it is put.
 *
 * `leftSign` is which side of its own hips this rig calls its left — the
 * Rocketbox pair say +1, the pose library says -1.
 */
function buildRig(leftSign: 1 | -1, standingAt = 0) {
  const root = new THREE.Group()
  root.position.x = standingAt
  const bone = (name: string, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const made = new THREE.Bone()
    made.name = name
    made.position.set(x, y, z)
    parent.add(made)
    return made
  }
  const hips = bone('Bip01_Pelvis', 0, 0.94, 0, root)
  const spine = bone('Bip01_Spine', 0, 0.2, 0, hips)
  const chest = bone('Bip01_Spine2', 0, 0.24, 0, spine)
  const arm = (side: 'L' | 'R', sign: number) => {
    const upper = bone(`Bip01_${side}_UpperArm`, sign * 0.169, 0.07, 0, chest)
    const lower = bone(`Bip01_${side}_Forearm`, 0, -0.335, 0, upper)
    const hand = bone(`Bip01_${side}_Hand`, 0, -0.265, 0, lower)
    // Biped numbers the digits rather than naming them; thumb is Finger0.
    bone(`Bip01_${side}_Finger0`, sign * 0.02, -0.03, 0.01, hand)
    bone(`Bip01_${side}_Finger1`, sign * 0.01, -0.09, 0, hand)
    return { upper, lower, hand }
  }
  const left = arm('L', leftSign)
  const right = arm('R', -leftSign)
  bone('Bip01_L_Thigh', leftSign * 0.1, -0.02, 0, hips)
  bone('Bip01_R_Thigh', -leftSign * 0.1, -0.02, 0, hips)
  bone('Bip01_Head', 0, 0.22, 0, chest)
  root.updateMatrixWorld(true)
  return { root, map: mapSkeleton(root), left, right }
}

const armsCrossed = () => ({
  ...NEUTRAL_POSE,
  ...POSE_LIBRARY.find((entry) => entry.id === 'arms-crossed')!.pose,
}) as ModelPose

test('a folded arm is carried across the body, on whichever side the rig calls left', () => {
  // Poses that reach across used to be refused outright, because a hand sent
  // to the mirrored hip was judged worse than one left where the angles put
  // it. With the sides read consistently it lands where the pose meant.
  const pose = armsCrossed()
  const want = forwardKinematics(pose, PHYSIQUE_PRESETS.average)
  const { root, map, left } = buildRig(1)
  const rest = captureRestPose(root, map)
  applyPoseToSkeleton(root, map, rest, pose, 0)
  root.updateMatrixWorld(true)
  landHands(map, want, 1, root)
  root.updateMatrixWorld(true)

  const hips = map.hips!.getWorldPosition(new THREE.Vector3())
  const shoulder = left.upper.getWorldPosition(new THREE.Vector3())
  const hand = left.hand.getWorldPosition(new THREE.Vector3())
  assert.ok(shoulder.x - hips.x > 0, 'this rig calls its +x arm the left one')
  assert.ok(hand.x - hips.x < 0, 'the folded hand finishes on the far side of the body')
})

test('which side a rig calls left does not depend on where it is standing', () => {
  // Read from the world origin instead of the hips, an actor moved a metre
  // sideways has both shoulders on the same side of x = 0, and the landing
  // mirrored — or failed to mirror — according to its floor position.
  const pose = armsCrossed()
  const want = forwardKinematics(pose, PHYSIQUE_PRESETS.average)
  const reach = (standingAt: number) => {
    const { root, map, left } = buildRig(1, standingAt)
    const rest = captureRestPose(root, map)
    applyPoseToSkeleton(root, map, rest, pose, 0)
    root.updateMatrixWorld(true)
    landHands(map, want, 1, root)
    root.updateMatrixWorld(true)
    return left.hand.getWorldPosition(new THREE.Vector3()).x - map.hips!.getWorldPosition(new THREE.Vector3()).x
  }
  assert.ok(Math.abs(reach(0) - reach(-1.4)) < 1e-6)
  assert.ok(Math.abs(reach(0) - reach(2.7)) < 1e-6)
})

test('a Biped hand closes, though it numbers its fingers instead of naming them', () => {
  const build = (hand: ModelPose['leftHand']) => {
    const { root, map, left } = buildRig(1)
    const rest = captureRestPose(root, map)
    applyPoseToSkeleton(root, map, rest, { ...NEUTRAL_POSE, leftHand: hand }, 0)
    return { rest, index: left.hand.children.find((bone) => bone.name.endsWith('Finger1'))! }
  }
  const open = build('open')
  const fist = build('fist')
  const rested = open.rest.localQuaternion.get(open.index as THREE.Bone)!
  assert.ok(fist.index.quaternion.angleTo(rested) > THREE.MathUtils.degToRad(30), 'a fist curls the finger')
  assert.ok(fist.index.quaternion.angleTo(open.index.quaternion) > THREE.MathUtils.degToRad(30), 'an open hand does not')
})

test('the folded pose puts each wrist past the centreline and the elbows at the sides', () => {
  // The library entry is what both the procedural figure and every imported
  // actor are measured against, so the fold has to be true here first.
  const points = forwardKinematics(armsCrossed(), PHYSIQUE_PRESETS.average)
  const across = (point: THREE.Vector3) => point.x - points.hips.x
  assert.ok(across(points.leftWrist) > 0.02, 'the left wrist crosses to the right')
  assert.ok(across(points.rightWrist) < -0.02, 'the right wrist crosses to the left')
  assert.ok(Math.abs(across(points.leftElbow)) > 0.14, 'the left elbow stays at the side')
  assert.ok(Math.abs(across(points.rightElbow)) > 0.14, 'the right elbow stays at the side')
  assert.ok(points.leftElbow.y < points.leftWrist.y, 'the forearm rises across the chest')
})
