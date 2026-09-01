import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { applyPoseToSkeleton, captureRestPose, mapSkeleton } from '../src/retarget.ts'
import { NEUTRAL_POSE, type HandPose, type ModelPose } from '../src/pose.ts'

/**
 * A hand whose fingers run along their own local Z.
 *
 * Bending such a finger about local Z — the axis this used to assume — spins it
 * about its own length and moves nothing. The axis that closes this hand is the
 * line through the knuckles, and it has to be found rather than assumed.
 */
function buildHand() {
  const root = new THREE.Group()
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const made = new THREE.Bone()
    made.name = name
    made.position.set(x, y, z)
    parent.add(made)
    return made
  }
  const hips = bone('Bip01_Pelvis', root, 0, 0.94, 0)
  const spine = bone('Bip01_Spine', hips, 0, 0.2, 0)
  const chest = bone('Bip01_Spine2', spine, 0, 0.24, 0)
  bone('Bip01_R_UpperArm', chest, -0.169, 0.07, 0)
  bone('Bip01_L_Thigh', hips, 0.1, -0.02, 0)
  bone('Bip01_R_Thigh', hips, -0.1, -0.02, 0)
  bone('Bip01_Head', chest, 0, 0.22, 0)
  const upper = bone('Bip01_L_UpperArm', chest, 0.169, 0.07, 0)
  const fore = bone('Bip01_L_Forearm', upper, 0, -0.335, 0)
  const hand = bone('Bip01_L_Hand', fore, 0, -0.265, 0)
  // Knuckles spread along X; every finger points along +Z.
  const tips: THREE.Bone[] = []
  ;([[0, 0.030], [1, 0.012], [2, -0.006], [3, -0.024], [4, -0.042]] as const).forEach(([digit, x]) => {
    let joint = bone(`Bip01_L_Finger${digit}`, hand, x, 0, 0.035)
    for (let i = 1; i <= 2; i += 1) joint = bone(`Bip01_L_Finger${digit}${i}`, joint, 0, 0, 0.032)
    tips.push(joint)
  })
  root.updateMatrixWorld(true)
  const map = mapSkeleton(root)
  return { root, hand, map, rest: captureRestPose(root, map), index: tips[1], pinky: tips[4] }
}

function reach(hand: HandPose) {
  const rig = buildHand()
  applyPoseToSkeleton(rig.root, rig.map, rig.rest, { ...NEUTRAL_POSE, leftHand: hand } as ModelPose, 0)
  rig.root.updateMatrixWorld(true)
  const wrist = rig.hand.getWorldPosition(new THREE.Vector3())
  return {
    fromWrist: rig.index.getWorldPosition(new THREE.Vector3()).distanceTo(wrist),
    span: rig.index.getWorldPosition(new THREE.Vector3()).distanceTo(rig.pinky.getWorldPosition(new THREE.Vector3())),
  }
}

test('a fist closes the hand, on a rig that does not bend about Z', () => {
  const open = reach('open')
  const fist = reach('fist')
  // Two phalanges of 32 mm curling 46 degrees apiece; the knuckle offset does not.
  assert.ok(fist.fromWrist < open.fromWrist - 0.012, `a fist brings the fingertip in (${open.fromWrist.toFixed(3)} -> ${fist.fromWrist.toFixed(3)})`)
})

test('closing a hand does not fan it', () => {
  // The old axis spread the fingers as it "curled" them: asked for a fist, the
  // shipped actors widened their knuckles by nearly three centimetres.
  const open = reach('open')
  const fist = reach('fist')
  assert.ok(Math.abs(fist.span - open.span) < 0.006, `the knuckles stay as far apart (${open.span.toFixed(3)} -> ${fist.span.toFixed(3)})`)
})

test('the hand poses are ordered from open to closed', () => {
  const order: HandPose[] = ['open', 'relaxed', 'grip', 'fist']
  const reaches = order.map((hand) => reach(hand).fromWrist)
  for (let i = 1; i < reaches.length; i += 1) {
    assert.ok(reaches[i] <= reaches[i - 1] + 1e-6, `${order[i]} is at least as closed as ${order[i - 1]}`)
  }
  assert.ok(reaches[0] - reaches[reaches.length - 1] > 0.012, 'and the two ends are visibly different')
})
