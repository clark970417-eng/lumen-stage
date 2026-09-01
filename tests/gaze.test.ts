import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { aimEyes, captureRestPose, findEyeBones, mapSkeleton } from '../src/retarget.ts'

/** A head with two eyeballs, and the neighbours that must not be mistaken for them. */
function buildHead(headTurn = 0) {
  const root = new THREE.Group()
  const bone = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const made = new THREE.Bone()
    made.name = name
    made.position.set(x, y, z)
    parent.add(made)
    return made
  }
  const hips = bone('Bip01_Pelvis', root, 0, 0.94, 0)
  const spine = bone('Bip01_Spine', hips, 0, 0.2, 0)
  const chest = bone('Bip01_Spine2', spine, 0, 0.24, 0)
  const head = bone('Bip01_Head', chest, 0, 0.22, 0)
  head.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(headTurn))
  const left = bone('Bip01_LEye', head, 0.03, 0.09, 0.09)
  const right = bone('Bip01_REye', head, -0.03, 0.09, 0.09)
  // Neighbours whose names start the same way.
  bone('Bip01_LEyeBlinkTop', head, 0.03, 0.10, 0.09)
  bone('Bip01_LOuterEyebrow', head, 0.05, 0.12, 0.08)
  bone('Bip01_L_UpperArm', chest, 0.169, 0.07, 0)
  bone('Bip01_R_UpperArm', chest, -0.169, 0.07, 0)
  bone('Bip01_L_Thigh', hips, 0.1, -0.02, 0)
  bone('Bip01_R_Thigh', hips, -0.1, -0.02, 0)
  root.updateMatrixWorld(true)
  return { root, head, left, right, map: mapSkeleton(root), rest: captureRestPose(root, mapSkeleton(root)) }
}

/** Where the eye is looking, in the room. */
const gazeDirection = (eye: THREE.Bone) =>
  new THREE.Vector3(0, 0, 1).applyQuaternion(eye.getWorldQuaternion(new THREE.Quaternion()))

test('the eyeballs are found, and their neighbours are not', () => {
  const names = findEyeBones(buildHead().root).map((bone) => bone.name).sort()
  assert.deepEqual(names, ['Bip01_LEye', 'Bip01_REye'])
})

test('a centred gaze leaves the eyes exactly where the file put them', () => {
  const rig = buildHead()
  const before = rig.left.quaternion.clone()
  aimEyes(rig.map, rig.rest, [rig.left, rig.right], 0, 0, 1)
  assert.ok(rig.left.quaternion.angleTo(before) < 1e-6)
})

test('a positive gaze swings toward +X and a positive pitch drops it', () => {
  // The sense the pose values are authored in, and the one the prosthetic eyes
  // already used — so a pose reads the same whichever eyes the actor has.
  const rig = buildHead()
  aimEyes(rig.map, rig.rest, [rig.left, rig.right], 25, 0, 1)
  rig.root.updateMatrixWorld(true)
  assert.ok(gazeDirection(rig.left).x > 0.3, 'yaw right')

  const dropped = buildHead()
  aimEyes(dropped.map, dropped.rest, [dropped.left, dropped.right], 0, 20, 1)
  dropped.root.updateMatrixWorld(true)
  assert.ok(gazeDirection(dropped.left).y < -0.2, 'pitch down')
})

test('the gaze is measured from the head, not from the room', () => {
  // Chin down, eyes up: the offset has to survive the head turning under it,
  // or every head movement drags the gaze along with it.
  const straight = buildHead(0)
  const turned = buildHead(40)
  aimEyes(straight.map, straight.rest, [straight.left, straight.right], 20, 0, 1)
  aimEyes(turned.map, turned.rest, [turned.left, turned.right], 20, 0, 1)
  assert.ok(straight.left.quaternion.angleTo(turned.left.quaternion) < 1e-6)
})

test('the eyes cannot roll up far enough to show only whites', () => {
  const far = buildHead()
  const limit = buildHead()
  aimEyes(far.map, far.rest, [far.left, far.right], 0, -60, 1)
  aimEyes(limit.map, limit.rest, [limit.left, limit.right], 0, -20, 1)
  assert.ok(far.left.quaternion.angleTo(limit.left.quaternion) < 1e-6, 'clamped to the socket')

  // Sideways travel is not clamped — an eye can go there.
  const wide = buildHead()
  const narrow = buildHead()
  aimEyes(wide.map, wide.rest, [wide.left, wide.right], 35, 0, 1)
  aimEyes(narrow.map, narrow.rest, [narrow.left, narrow.right], 20, 0, 1)
  assert.ok(wide.left.quaternion.angleTo(narrow.left.quaternion) > 1e-3)
})

test('a rig facing the other way looks the other way', () => {
  const forward = buildHead()
  const backward = buildHead()
  aimEyes(forward.map, forward.rest, [forward.left, forward.right], 25, 0, 1)
  aimEyes(backward.map, backward.rest, [backward.left, backward.right], 25, 0, -1)
  forward.root.updateMatrixWorld(true)
  backward.root.updateMatrixWorld(true)
  assert.ok(gazeDirection(forward.left).x * gazeDirection(backward.left).x < 0)
})
