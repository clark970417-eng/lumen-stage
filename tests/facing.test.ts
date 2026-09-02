import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { applyPoseToSkeleton, captureRestPose, landHands, mapSkeleton } from '../src/retarget.ts'
import { NEUTRAL_POSE, POSE_LIBRARY, type ModelPose } from '../src/pose.ts'
import { forwardKinematics } from '../src/ik.ts'
import { PHYSIQUE_PRESETS } from '../src/physique.ts'

/**
 * A model built the way the studio builds one: the rest pose is recorded while
 * it is still detached, and only afterwards is it put into a group that carries
 * where the actor stands and which way it faces.
 */
function buildActor(facing: number) {
  const model = new THREE.Group()
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
  bone('Bip01_Neck', chest, 0, 0.14, 0)
  bone('Bip01_Head', chest, 0, 0.22, 0)
  const arm = (side: 'L' | 'R', sign: number) => {
    const upper = bone(`Bip01_${side}_UpperArm`, chest, sign * 0.169, 0.07, 0)
    const lower = bone(`Bip01_${side}_Forearm`, upper, 0, -0.335, 0)
    return bone(`Bip01_${side}_Hand`, lower, 0, -0.265, 0)
  }
  const left = arm('L', 1)
  const right = arm('R', -1)
  const thigh = (side: 'L' | 'R', sign: number) => {
    const t = bone(`Bip01_${side}_Thigh`, hips, sign * 0.1, -0.02, 0)
    const c = bone(`Bip01_${side}_Calf`, t, 0, -0.42, 0)
    return bone(`Bip01_${side}_Foot`, c, 0, -0.445, 0)
  }
  thigh('L', 1)
  thigh('R', -1)

  // Rest is captured detached, exactly as the loader does it.
  model.updateMatrixWorld(true)
  const map = mapSkeleton(model)
  const rest = captureRestPose(model, map)

  // Only now does it join the scene, in a group that turns it.
  const group = new THREE.Group()
  group.rotation.y = facing
  group.add(model)
  group.updateMatrixWorld(true)
  return { group, model, map, rest, left, right }
}

/** Where a bone sits in the group's own frame — that is, on the actor. */
function inActor(actor: ReturnType<typeof buildActor>, bone: THREE.Object3D) {
  return actor.group.worldToLocal(bone.getWorldPosition(new THREE.Vector3()))
}

function pose(facing: number, id = 'neutral') {
  const actor = buildActor(facing)
  const modelPose = { ...NEUTRAL_POSE, ...POSE_LIBRARY.find((p) => p.id === id)!.pose } as ModelPose
  applyPoseToSkeleton(actor.model, actor.map, actor.rest, modelPose, 0)
  actor.group.updateMatrixWorld(true)
  landHands(actor.map, forwardKinematics(modelPose, PHYSIQUE_PRESETS.average), 1, actor.model)
  actor.group.updateMatrixWorld(true)
  return actor
}

test('turning an actor turns the actor, not just the group around them', () => {
  // The rest pose is recorded while the model is detached, so every rest
  // orientation is measured against the model. Written against the room
  // instead, the two frames disagreed by however far the actor had been turned
  // and each bone took on the opposite of it: the group turned, the skeleton
  // cancelled it, and reopening a saved project quietly lost the facing.
  const square = pose(0)
  const turned = pose(Math.PI / 2)
  for (const [name, a, b] of [['left hand', square.left, turned.left], ['right hand', square.right, turned.right]] as const) {
    assert.ok(inActor(square, a).distanceTo(inActor(turned, b)) < 1e-6, `${name} sits in the same place on the body`)
  }
  // And in the room, a quarter turn really has moved it.
  const before = square.left.getWorldPosition(new THREE.Vector3())
  const after = turned.left.getWorldPosition(new THREE.Vector3())
  assert.ok(before.distanceTo(after) > 0.2, 'the hand has actually swung round')
})

test('a hand is landed on the body it belongs to, whichever way that body faces', () => {
  // landHands aims at a place on the person — a hip, a chin, the far shoulder.
  // Measured against the room's axes, turning the actor left those targets
  // behind and the wrists were sent out in front of the hips.
  for (const id of ['hands-on-hips', 'arms-crossed']) {
    const square = pose(0, id)
    const turned = pose(2.1, id)
    assert.ok(
      inActor(square, square.left).distanceTo(inActor(turned, turned.left)) < 1e-6,
      `${id}: the hand lands in the same place on the body`,
    )
  }
})
