import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { armPatch, elbowFlexion, forwardKinematics, solveArm, type Side } from '../src/ik.ts'
import { NEUTRAL_POSE, type ModelPose } from '../src/pose.ts'
import { DEFAULT_PHYSIQUE } from '../src/physique.ts'

const posed = (patch: Partial<ModelPose>): ModelPose => ({ ...NEUTRAL_POSE, ...patch })

test('an elbow flexes the forearm forward, not out to the side', () => {
  // The whole point of the axis: bending an elbow has to carry the hand toward
  // the front of the body. On the old Z axis it swept the forearm sideways
  // through the frontal plane, so a hand could never reach a hip or a chin.
  const straight = forwardKinematics(posed({ leftElbow: 0, rightElbow: 0 }), DEFAULT_PHYSIQUE)
  const bent = forwardKinematics(posed({ leftElbow: 80, rightElbow: -80 }), DEFAULT_PHYSIQUE)

  for (const side of ['left', 'right'] as const) {
    const before = straight[`${side}Wrist`]
    const after = bent[`${side}Wrist`]
    assert.ok(after.z - before.z > 0.2, `${side} forearm has to swing forward when the elbow closes`)
    assert.ok(after.y > before.y, `${side} hand has to rise, not drop`)
    assert.ok(Math.abs(after.x - before.x) < 0.12, `${side} hand should not swing out sideways`)
  }
  // Mirrored in the library, identical in the rig.
  assert.equal(elbowFlexion(80, -1), elbowFlexion(-80, 1))
})

test('dragging a wrist puts the hand where it was dropped', () => {
  // This is the guarantee the pose handles rest on: solve for a target, apply
  // the solution, and forward kinematics has to agree. A rig where the two
  // disagree is one where a dragged hand drifts away from the cursor.
  const targets: [Side, THREE.Vector3][] = [
    [-1, new THREE.Vector3(-0.14, 1.02, 0.05)],   // on the hip
    [-1, new THREE.Vector3(-0.09, 1.62, 0.10)],   // up by the face
    [-1, new THREE.Vector3(0.10, 1.28, 0.22)],    // across the chest
    [-1, new THREE.Vector3(-0.34, 1.30, -0.08)],  // out and back
    [1, new THREE.Vector3(0.14, 1.02, 0.05)],
    [1, new THREE.Vector3(0.02, 1.60, 0.11)],     // hand to chin
    [1, new THREE.Vector3(-0.10, 1.28, 0.22)],
    [1, new THREE.Vector3(0.26, 1.72, 0.05)],     // raised, waving
  ]

  for (const [side, target] of targets) {
    const solved = posed(armPatch(side, solveArm(side, target, NEUTRAL_POSE, DEFAULT_PHYSIQUE)))
    const wrist = forwardKinematics(solved, DEFAULT_PHYSIQUE)[side === -1 ? 'leftWrist' : 'rightWrist']
    const miss = wrist.distanceTo(target)
    assert.ok(miss < 0.02, `${side === -1 ? 'left' : 'right'} wrist missed ${target.toArray().join(',')} by ${miss.toFixed(3)} m`)
  }
})

test('an unreachable target straightens the arm toward it rather than tearing', () => {
  const far = new THREE.Vector3(0.9, 1.9, 0.6)
  const solved = posed(armPatch(1, solveArm(1, far, NEUTRAL_POSE, DEFAULT_PHYSIQUE)))
  const points = forwardKinematics(solved, DEFAULT_PHYSIQUE)
  const reach = points.rightWrist.distanceTo(points.rightShoulder)

  assert.ok(Math.abs(solved.rightElbow) < 12, 'the elbow opens out when the hand cannot get there')
  assert.ok(reach > 0.5, 'and the arm extends toward it')
  const toTarget = far.clone().sub(points.rightShoulder).normalize()
  const toWrist = points.rightWrist.clone().sub(points.rightShoulder).normalize()
  assert.ok(toWrist.dot(toTarget) > 0.99, 'pointing at the target it could not reach')
})
