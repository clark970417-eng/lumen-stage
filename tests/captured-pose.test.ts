import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CAPTURED_POSES, getCapturedPose } from '../src/capturedPoses.ts'
import { normalizePose, POSE_LIBRARY } from '../src/pose.ts'
import { applyCapturedPose, captureRestPose, landCapturedContacts, mapSkeleton } from '../src/retarget.ts'

/** A skeleton with the Rocketbox names, given a rest that is not the identity. */
function buildActor(scale = 1) {
  const root = new THREE.Group()
  const bone = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const made = new THREE.Bone()
    made.name = name
    made.position.set(x * scale, y * scale, z * scale)
    // A rest that is not identity, because that is the whole reason the capture
    // is stored as a delta.
    made.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.11)
    parent.add(made)
    return made
  }
  const hips = bone('Bip01_Pelvis', root, 0, 94, 0)
  const spine = bone('Bip01_Spine', hips, 0, 12, 0)
  const spine1 = bone('Bip01_Spine1', spine, 0, 12, 0)
  const chest = bone('Bip01_Spine2', spine1, 0, 12, 0)
  const neck = bone('Bip01_Neck', chest, 0, 17, 0)
  bone('Bip01_Head', neck, 0, 12, 0)
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1
    const clavicle = bone(`Bip01_${side}_Clavicle`, chest, sign * 3, 12, 0)
    const upper = bone(`Bip01_${side}_UpperArm`, clavicle, sign * 10, 0, 0)
    const lower = bone(`Bip01_${side}_Forearm`, upper, sign * 25, 0, 0)
    bone(`Bip01_${side}_Hand`, lower, sign * 24, 0, 0)
    const thigh = bone(`Bip01_${side}_Thigh`, hips, sign * 9, 0, 0)
    const calf = bone(`Bip01_${side}_Calf`, thigh, 0, -42, 0)
    bone(`Bip01_${side}_Foot`, calf, 0, -40, 0)
  }
  root.updateMatrixWorld(true)
  return root
}

test('every captured library entry points at a frame that exists', () => {
  const captured = POSE_LIBRARY.filter((entry) => entry.category === 'captured')
  assert.equal(captured.length, 8)
  for (const entry of captured) {
    assert.ok(entry.pose.capture, `${entry.id} carries no capture`)
    assert.ok(getCapturedPose(entry.pose.capture), `${entry.id} names a frame that is not in the data`)
  }
  // And nothing outside that category quietly replays a frame.
  for (const entry of POSE_LIBRARY.filter((e) => e.category !== 'captured')) {
    assert.equal(entry.pose.capture, undefined, `${entry.id} should be solved, not replayed`)
  }
})

test('captured frames leave the face alone', () => {
  // Gaze and expression are the studio's to drive. A frame that froze the eyes
  // would stare wherever the performer happened to be looking.
  for (const capture of CAPTURED_POSES) {
    for (const name of Object.keys(capture.rotation)) {
      assert.doesNotMatch(name, /eye|lip|jaw|tongue|brow/i, `${capture.id} records ${name}`)
    }
    assert.ok(Object.keys(capture.rotation).length > 30, `${capture.id} records too little to be a pose`)
    assert.ok(capture.stature > 0, `${capture.id} has no stature to scale contacts by`)
  }
})

test('a saved project naming a capture that no longer exists opens on its joints', () => {
  assert.equal(normalizePose({ capture: 'captured-does-not-exist' }).capture, undefined)
  assert.equal(normalizePose({ capture: 'captured-chin-rest' }).capture, 'captured-chin-rest')
  assert.equal(normalizePose({}).capture, undefined)
})

test('a frame is replayed as a delta from the actor own rest', () => {
  const actor = buildActor()
  const map = mapSkeleton(actor)
  const rest = captureRestPose(actor, map)
  const capture = getCapturedPose('captured-chin-rest')!
  const restLocal = rest.localQuaternion.get(map.head!)!.clone()

  const matched = applyCapturedPose(actor, rest, capture)
  // The stub carries the spine, limbs and head but no fingers or toes, so it
  // matches a fraction of what a real actor does — and still clears the bar
  // the scene uses to tell a frame that landed from one aimed elsewhere.
  assert.ok(matched >= 20, `only ${matched} bones matched`)

  const recorded = capture.rotation.Bip01_Head
  assert.ok(recorded, 'the frame should turn the head')
  const expected = restLocal.clone().multiply(new THREE.Quaternion().fromArray(recorded).normalize())
  assert.ok(map.head!.quaternion.angleTo(expected) < 1e-6)
  // The stored components are rounded, so what is written must still be a unit
  // rotation — an almost-unit quaternion is a scale, and it compounds down the
  // chain.
  assert.ok(Math.abs(map.head!.quaternion.length() - 1) < 1e-9, 'the written rotation is not unit')
  // Every bone the frame does not name goes back to rest, so switching poses
  // leaves nothing of the last one behind.
  const foot = map.leftFoot!
  if (!capture.rotation[foot.name]) {
    assert.ok(foot.quaternion.angleTo(rest.localQuaternion.get(foot)!) < 1e-9)
  }
})

test('a frame aimed at another skeleton reports that it did not land', () => {
  const stranger = new THREE.Group()
  const bone = new THREE.Bone()
  bone.name = 'mixamorig:Hips'
  stranger.add(bone)
  stranger.updateMatrixWorld(true)
  const map = mapSkeleton(stranger)
  const matched = applyCapturedPose(stranger, captureRestPose(stranger, map), getCapturedPose('captured-relaxed')!)
  assert.equal(matched, 0)
})

test('a contact puts the hand back on what it was resting on', () => {
  const capture = getCapturedPose('captured-chin-rest')!
  const contact = capture.contacts.find((item) => item.anchor === 'Bip01_Head')!
  // An actor built at a different size to the one the frame was read off, which
  // is the case the contact exists for.
  const actor = buildActor(1.12)
  const map = mapSkeleton(actor)
  const rest = captureRestPose(actor, map)
  applyCapturedPose(actor, rest, capture)
  actor.updateMatrixWorld(true)

  const stature = 148
  const wanted = () => map.head!.localToWorld(
    new THREE.Vector3().fromArray(contact.offset).multiplyScalar(stature / capture.stature))
  const before = map.rightHand!.getWorldPosition(new THREE.Vector3()).distanceTo(wanted())
  landCapturedContacts(map, actor, capture, stature)
  actor.updateMatrixWorld(true)
  const after = map.rightHand!.getWorldPosition(new THREE.Vector3()).distanceTo(wanted())
  assert.ok(after < before, `contact made it worse: ${before.toFixed(2)} -> ${after.toFixed(2)}`)
  assert.ok(after < 1.5, `hand still ${after.toFixed(2)} from the chin`)
})
