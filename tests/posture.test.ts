import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { applyPoseToSkeleton, captureRestPose, mapSkeleton } from '../src/retarget.ts'
import { chestLiftDegrees, NEUTRAL_CHEST_LIFT, NEUTRAL_POSE, POSE_LIBRARY, type ModelPose } from '../src/pose.ts'
import { forwardKinematics } from '../src/ik.ts'
import { PHYSIQUE_PRESETS } from '../src/physique.ts'

function buildRig() {
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
  const neck = bone('Bip01_Neck', chest, 0, 0.14, 0)
  const head = bone('Bip01_Head', neck, 0, 0.08, 0)
  bone('Bip01_L_UpperArm', chest, 0.169, 0.07, 0)
  bone('Bip01_R_UpperArm', chest, -0.169, 0.07, 0)
  const lThigh = bone('Bip01_L_Thigh', hips, 0.1, -0.02, 0)
  const lCalf = bone('Bip01_L_Calf', lThigh, 0, -0.42, 0)
  const lFoot = bone('Bip01_L_Foot', lCalf, 0, -0.445, 0)
  bone('Bip01_R_Thigh', hips, -0.1, -0.02, 0)
  root.updateMatrixWorld(true)
  const map = mapSkeleton(root)
  return { root, map, rest: captureRestPose(root, map), hips, chest, head, foot: lFoot }
}

function place(patch: Partial<ModelPose>) {
  const rig = buildRig()
  applyPoseToSkeleton(rig.root, rig.map, rig.rest, { ...NEUTRAL_POSE, ...patch } as ModelPose, 0)
  rig.root.updateMatrixWorld(true)
  const at = (b: THREE.Object3D) => b.getWorldPosition(new THREE.Vector3())
  return { hips: at(rig.hips), chest: at(rig.chest), head: at(rig.head), foot: at(rig.foot) }
}

test('the chest lift reaches the actor, and the neutral stance is its zero', () => {
  // It sat in the panel and in twenty-three library poses and was read by
  // nothing at all.
  assert.equal(chestLiftDegrees(NEUTRAL_CHEST_LIFT), 0)
  assert.ok(chestLiftDegrees(100) > 5, 'a full lift is worth several degrees')
  assert.ok(chestLiftDegrees(0) < 0, 'and slumping is the other way')

  const neutral = place({})
  const lifted = place({ chestLift: 80 })
  const slumped = place({ chestLift: 0 })
  assert.ok(neutral.chest.distanceTo(place({ chestLift: NEUTRAL_CHEST_LIFT }).chest) < 1e-9, 'neutral is unchanged')
  assert.ok(lifted.chest.z < neutral.chest.z, 'the ribcage tilts back off the pelvis')
  assert.ok(slumped.chest.z > neutral.chest.z)
})

test('standing tall does not mean leaning back', () => {
  // Extend the thoracic spine alone and the head goes with it. Most of the tilt
  // is handed back at the neck, so the eyes stay near where they were.
  const neutral = place({})
  const lifted = place({ chestLift: 100 })
  const headTravel = Math.abs(lifted.head.z - neutral.head.z)
  const chestTravel = Math.abs(lifted.chest.z - neutral.chest.z)
  assert.ok(chestTravel > 0.005, 'the chest does move')
  assert.ok(headTravel < 0.09, `the head stays near the feet (${headTravel.toFixed(3)} m)`)
})

test('the hips slide sideways when a pose asks them to', () => {
  // Every other joint the library drives is a rotation, so the retarget carried
  // rotations and dropped this one: the drag handle moved and the actor did not.
  const middle = place({ hipShift: 0 })
  const left = place({ hipShift: -0.1 })
  const right = place({ hipShift: 0.1 })
  assert.ok(Math.abs(left.hips.x - right.hips.x) > 0.19, 'the pelvis travels the full shift')
  assert.ok(Math.abs(middle.hips.x) < 1e-9)
  // The legs hang off the pelvis, the way they do on the figure the library was
  // measured against.
  assert.ok(Math.abs(left.foot.x - right.foot.x) > 0.19)
})

test('the solver and the actor read the same posture', () => {
  // The drag handles are placed by forward kinematics; if it disagreed about
  // the chest the handles would sit off the person they belong to.
  for (const lift of [0, NEUTRAL_CHEST_LIFT, 60]) {
    const points = forwardKinematics({ ...NEUTRAL_POSE, chestLift: lift } as ModelPose, PHYSIQUE_PRESETS.average)
    const posed = place({ chestLift: lift })
    // Both tilt the same way, even though the two rigs have different segments.
    const solverBack = points.chest.z - forwardKinematics({ ...NEUTRAL_POSE } as ModelPose, PHYSIQUE_PRESETS.average).chest.z
    const actorBack = posed.chest.z - place({}).chest.z
    assert.ok(solverBack * actorBack >= 0, `chest lift ${lift} agrees in direction`)
  }
})

test('the library still carries the lift values the control was written for', () => {
  const lifts = POSE_LIBRARY.filter((entry) => entry.pose.chestLift !== undefined)
  assert.ok(lifts.length > 20, 'the poses that set it')
  for (const entry of lifts) {
    assert.ok(entry.pose.chestLift! >= 0 && entry.pose.chestLift! <= 100, entry.id)
  }
})
