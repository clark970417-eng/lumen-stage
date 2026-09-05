/**
 * Puts a shipped actor's rest pose where the pose library measures from.
 *
 * The Rocketbox source is authored in a wide A-stance with straight arms and
 * flat, splayed hands — a modelling pose, not a standing one. Every pose an
 * actor is given is a delta from whatever rest was captured, so if that rest is
 * not the rig's own neutral stance, every delta lands somewhere else.
 *
 * Lives here rather than inside the scene so that the offline harness which
 * measures poses across the whole cast prepares an actor exactly the way the
 * studio does. A harness that approximated this would be measuring something
 * nobody ships.
 */
import * as THREE from 'three'
import { forwardKinematics } from './ik.ts'
import { NEUTRAL_POSE } from './pose.ts'
import type { Physique } from './physique.ts'
import { boneDirection, type BoneMap } from './retarget.ts'

/** How far a forearm is pronated out of the aimed direction, in degrees. */
export const REST_FOREARM_ROLL = 24

export function aimRestToNeutral(model: THREE.Object3D, map: BoneMap, physique: Physique) {
  const neutral = forwardKinematics(NEUTRAL_POSE, physique)
  const aim = (bone: THREE.Bone | undefined, from: THREE.Vector3, to: THREE.Vector3) => {
    if (!bone) return
    const direction = boneDirection(bone)
    if (!direction) return
    const wanted = to.clone().sub(from).normalize()
    if (wanted.lengthSq() < 1e-8) return
    const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
    const desiredWorld = bone.getWorldQuaternion(new THREE.Quaternion())
    desiredWorld.premultiply(new THREE.Quaternion().setFromUnitVectors(direction, wanted))
    bone.quaternion.copy(parentWorld.invert()).multiply(desiredWorld)
    model.updateMatrixWorld(true)
  }
  // These rigs name their arms from the character's own left, which on a
  // figure facing +Z is the +X side — the opposite side from the one the
  // procedural figure puts its left arm on. Aimed at the target as
  // written, each arm was sent to the other side's elbow and wrist: the
  // eight degrees that should splay it clear of the hip tucked it eight
  // degrees in instead, and the hand finished inside the thigh with the
  // fingertips out the front of the jeans. So the target is mirrored
  // onto whichever side this actor's own bone actually sits on, rather
  // than either convention being assumed.
  const sideOf = (bone: THREE.Bone | undefined) => {
    const x = bone?.getWorldPosition(new THREE.Vector3()).x ?? 0
    return x < 0 ? -1 : 1
  }
  const onSide = (point: THREE.Vector3, sign: number) =>
    new THREE.Vector3(Math.abs(point.x) * sign, point.y, point.z)

  const leftSide = sideOf(map.leftUpperArm)
  const rightSide = sideOf(map.rightUpperArm)
  const leftShoulder = onSide(neutral.leftShoulder, leftSide)
  const leftElbow = onSide(neutral.leftElbow, leftSide)
  const leftWrist = onSide(neutral.leftWrist, leftSide)
  const rightShoulder = onSide(neutral.rightShoulder, rightSide)
  const rightElbow = onSide(neutral.rightElbow, rightSide)
  const rightWrist = onSide(neutral.rightWrist, rightSide)

  aim(map.leftUpperArm, leftShoulder, leftElbow)
  aim(map.leftLowerArm, leftElbow, leftWrist)
  aim(map.rightUpperArm, rightShoulder, rightElbow)
  aim(map.rightLowerArm, rightElbow, rightWrist)
  // The hand too, or it keeps the flat splayed one the A-stance was
  // authored with: the arm hangs correctly and the palm still faces
  // front with the fingers out sideways, which on a standing actor puts
  // the whole hand through the front of the thigh and the fingertips out
  // the far side. A relaxed hand carries on the line of its forearm, so
  // that line is where it is aimed.
  // And the legs, for the same reason the arms needed it. A pose delta is
  // a world-space rotation applied to whatever the bone's rest is, so it
  // only lands on the intended anatomical axis when the rest points where
  // the library thinks it does. The arms are aimed, so they were right;
  // the legs were not, and a Biped thigh does not run down -Y the way the
  // MakeHuman rig's does. Every leg pose came out rotating about the
  // wrong axis — asked to sit, the actor splayed her thighs sideways and
  // stayed standing, and crouching, walking and all four seated poses did
  // nothing at all.
  const leftLegSide = sideOf(map.leftUpperLeg)
  const rightLegSide = sideOf(map.rightUpperLeg)
  const leftHip = onSide(neutral.leftHip, leftLegSide)
  const leftKnee = onSide(neutral.leftKnee, leftLegSide)
  const leftAnkle = onSide(neutral.leftAnkle, leftLegSide)
  const rightHip = onSide(neutral.rightHip, rightLegSide)
  const rightKnee = onSide(neutral.rightKnee, rightLegSide)
  const rightAnkle = onSide(neutral.rightAnkle, rightLegSide)

  aim(map.leftUpperLeg, leftHip, leftKnee)
  aim(map.leftLowerLeg, leftKnee, leftAnkle)
  aim(map.rightUpperLeg, rightHip, rightKnee)
  aim(map.rightLowerLeg, rightKnee, rightAnkle)

  const carryOn = (from: THREE.Vector3, to: THREE.Vector3) => to.clone().multiplyScalar(2).sub(from)
  aim(map.leftHand, leftWrist, carryOn(leftElbow, leftWrist))
  aim(map.rightHand, rightWrist, carryOn(rightElbow, rightWrist))
  // Aiming fixes where a bone points, not how it is rolled about its own
  // length. A forearm still has to pronate or the palms face the lens.
  const roll = (bone: THREE.Bone | undefined, degrees: number) => {
    if (!bone) return
    const along = boneDirection(bone)
    if (!along) return
    const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
    const desiredWorld = bone.getWorldQuaternion(new THREE.Quaternion())
    desiredWorld.premultiply(new THREE.Quaternion().setFromAxisAngle(along, THREE.MathUtils.degToRad(degrees)))
    bone.quaternion.copy(parentWorld.invert()).multiply(desiredWorld)
    model.updateMatrixWorld(true)
  }
  roll(map.leftLowerArm, -REST_FOREARM_ROLL)
  roll(map.rightLowerArm, REST_FOREARM_ROLL)
}
