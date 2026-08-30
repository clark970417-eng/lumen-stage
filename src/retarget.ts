/**
 * Humanoid retargeting for imported models.
 *
 * An imported GLB arrives with someone else's skeleton: different bone names,
 * a different rest pose (T or A), and a different local axis per bone. None of
 * that is knowable in advance, so nothing here assumes it.
 *
 * The approach is to work entirely in world space. For every bone we can
 * identify we compute the world orientation the pose asks for, then convert
 * that back into the bone's local frame against its *posed* parent. Two
 * consequences fall out of that: bone axes never need to be guessed, and a
 * T-pose and an A-pose both end up in the same place, because the rest pose is
 * normalized to a common reference first.
 */

import * as THREE from 'three'
import { elbowFlexion } from './ik.ts'
import { NEUTRAL_POSE, type HandPose, type ModelPose } from './pose.ts'
import { applyFingerCurlDelta, applyWorldPoseDelta } from './retargetDelta.ts'

/** Every joint the rig can drive. Anything else in the skeleton is left alone. */
export type HumanoidBone =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'leftShoulder' | 'leftUpperArm' | 'leftLowerArm' | 'leftHand'
  | 'rightShoulder' | 'rightUpperArm' | 'rightLowerArm' | 'rightHand'
  | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot'
  | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot'

/**
 * Name patterns, checked against a normalized bone name.
 *
 * Normalization strips the namespace prefixes exporters add (`mixamorig:`,
 * `Armature|`), the separators, and the case — which collapses `mixamorig:
 * LeftForeArm`, `left_fore_arm` and `LeftForearm` onto one string.
 */
const PATTERNS: [HumanoidBone, RegExp][] = [
  ['hips', /^(hips?|pelvis|bip01pelvis|root(bone)?hips?)$/],
  ['spine', /^(spine|spine0?1|abdomen|lowerspine|torso)$/],
  ['chest', /^(chest|spine0?2|spine0?3|upperchest|ribcage|thorax)$/],
  ['neck', /^(neck|neck0?1)$/],
  ['head', /^(head|head0?1)$/],

  ['leftShoulder', /^(left(shoulder|clavicle|collar)|l(shoulder|clavicle|collar))$/],
  ['leftUpperArm', /^(left(upper)?arm|leftshoulderarm|l(upper)?arm|leftarm0?1)$/],
  ['leftLowerArm', /^(left(fore|lower)arm|left(elbow)|l(fore|lower)arm)$/],
  ['leftHand', /^(lefthand|lhand|leftwrist)$/],

  ['rightShoulder', /^(right(shoulder|clavicle|collar)|r(shoulder|clavicle|collar))$/],
  ['rightUpperArm', /^(right(upper)?arm|rightshoulderarm|r(upper)?arm|rightarm0?1)$/],
  ['rightLowerArm', /^(right(fore|lower)arm|right(elbow)|r(fore|lower)arm)$/],
  ['rightHand', /^(righthand|rhand|rightwrist)$/],

  ['leftUpperLeg', /^(left(up)?leg|leftthigh|lupleg|lthigh|lefthip)$/],
  ['leftLowerLeg', /^(leftleg|leftlowerleg|leftshin|leftcalf|leftknee|lleg|lshin)$/],
  ['leftFoot', /^(leftfoot|lfoot|leftankle)$/],

  ['rightUpperLeg', /^(right(up)?leg|rightthigh|rupleg|rthigh|righthip)$/],
  ['rightLowerLeg', /^(rightleg|rightlowerleg|rightshin|rightcalf|rightknee|rleg|rshin)$/],
  ['rightFoot', /^(rightfoot|rfoot|rightankle)$/],
]

/** Collapses an exporter's bone name to something matchable. */
export function normalizeBoneName(name: string) {
  return name
    .replace(/^.*[:|]/, '')
    .replace(/[\s_.\-]/g, '')
    .replace(/^(mixamorig\d*|bip\d*|bone)/i, '')
    .toLowerCase()
}

/**
 * Left and right are ambiguous when a rig marks sides with a suffix
 * (`Arm.L`, `UpperArm_R`) rather than a prefix, so those are folded to the
 * prefix form before matching.
 */
function canonicalName(raw: string) {
  const stripped = raw.replace(/^.*[:|]/, '')
  const suffix = stripped.match(/[._\- ]([LR])$/i)
  if (suffix) {
    const side = suffix[1].toUpperCase() === 'L' ? 'left' : 'right'
    return normalizeBoneName(side + stripped.replace(/[._\- ][LR]$/i, ''))
  }
  return normalizeBoneName(stripped)
}

export type BoneMap = Partial<Record<HumanoidBone, THREE.Bone>>

/** Finds the humanoid joints in whatever skeleton the file brought with it. */
export function mapSkeleton(root: THREE.Object3D): BoneMap {
  const map: BoneMap = {}
  root.traverse((node) => {
    if (!(node as THREE.Bone).isBone) return
    const bone = node as THREE.Bone
    const name = canonicalName(bone.name)
    for (const [slot, pattern] of PATTERNS) {
      if (map[slot]) continue
      if (pattern.test(name)) { map[slot] = bone; break }
    }
  })
  // A rig with only one spine bone names it either way round; treat the one we
  // found as both, so the chest rotation still lands somewhere sensible.
  if (map.chest && !map.spine) map.spine = map.chest
  if (map.spine && !map.chest) map.chest = map.spine
  return map
}

/** How complete the mapping is, for the UI to report honestly. */
export function mappingQuality(map: BoneMap) {
  const essential: HumanoidBone[] = ['hips', 'spine', 'head', 'leftUpperArm', 'rightUpperArm', 'leftUpperLeg', 'rightUpperLeg']
  const found = essential.filter((slot) => map[slot]).length
  return { found, total: essential.length, usable: found >= 5 }
}

// ---------------------------------------------------------------------------
// Rest pose capture and normalization
// ---------------------------------------------------------------------------

export type RestPose = {
  /** Local rotation each bone had in the file. */
  localQuaternion: Map<THREE.Bone, THREE.Quaternion>
  /** World rotation each bone had in the file. */
  worldQuaternion: Map<THREE.Bone, THREE.Quaternion>
  /**
   * Per-bone world-space rotation that takes the file's rest direction to this
   * rig's reference direction. This is what makes a T-pose model and an A-pose
   * model respond identically to the same pose.
   */
  normalize: Map<THREE.Bone, THREE.Quaternion>
}

/** The direction each joint's bone points in this rig's own rest pose. */
const REFERENCE_DIRECTION: Partial<Record<HumanoidBone, THREE.Vector3>> = {
  spine: new THREE.Vector3(0, 1, 0),
  chest: new THREE.Vector3(0, 1, 0),
  neck: new THREE.Vector3(0, 1, 0),
  head: new THREE.Vector3(0, 1, 0),
  leftUpperArm: new THREE.Vector3(-0.12, -0.99, 0),
  leftLowerArm: new THREE.Vector3(-0.06, -1, 0),
  leftHand: new THREE.Vector3(0, -1, 0),
  rightUpperArm: new THREE.Vector3(0.12, -0.99, 0),
  rightLowerArm: new THREE.Vector3(0.06, -1, 0),
  rightHand: new THREE.Vector3(0, -1, 0),
  leftUpperLeg: new THREE.Vector3(0, -1, 0),
  leftLowerLeg: new THREE.Vector3(0, -1, 0),
  rightUpperLeg: new THREE.Vector3(0, -1, 0),
  rightLowerLeg: new THREE.Vector3(0, -1, 0),
}

/**
 * The world direction a bone points, measured to its first child.
 *
 * A bone with no children (a fingertip, or a hand on a rig without fingers)
 * has no measurable direction, so those keep their rest orientation.
 */
export function boneDirection(bone: THREE.Bone): THREE.Vector3 | null {
  const child = bone.children.find((node) => (node as THREE.Bone).isBone)
  if (!child) return null
  const here = new THREE.Vector3()
  const there = new THREE.Vector3()
  bone.getWorldPosition(here)
  child.getWorldPosition(there)
  const direction = there.sub(here)
  return direction.lengthSq() < 1e-8 ? null : direction.normalize()
}

/** Records the file's rest pose. Call once, after the model is in the scene. */
export function captureRestPose(root: THREE.Object3D, map: BoneMap): RestPose {
  root.updateWorldMatrix(true, true)
  const localQuaternion = new Map<THREE.Bone, THREE.Quaternion>()
  const worldQuaternion = new Map<THREE.Bone, THREE.Quaternion>()
  const normalize = new Map<THREE.Bone, THREE.Quaternion>()

  root.traverse((node) => {
    if (!(node as THREE.Bone).isBone) return
    const bone = node as THREE.Bone
    localQuaternion.set(bone, bone.quaternion.clone())
    worldQuaternion.set(bone, bone.getWorldQuaternion(new THREE.Quaternion()))
  })

  for (const [slot, reference] of Object.entries(REFERENCE_DIRECTION) as [HumanoidBone, THREE.Vector3][]) {
    const bone = map[slot]
    if (!bone) continue
    const direction = boneDirection(bone)
    if (!direction) continue
    normalize.set(bone, new THREE.Quaternion().setFromUnitVectors(direction, reference.clone().normalize()))
  }

  return { localQuaternion, worldQuaternion, normalize }
}

// ---------------------------------------------------------------------------
// Pose application
// ---------------------------------------------------------------------------

const rad = THREE.MathUtils.degToRad
const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)

const axis = (vector: THREE.Vector3, degrees: number) => new THREE.Quaternion().setFromAxisAngle(vector, rad(degrees))

/**
 * The world-space orientation each joint should end up with.
 *
 * These mirror the procedural rig exactly — same sign conventions, same
 * hierarchy — so a pose that looks right on the built-in figure looks right on
 * an imported one.
 */
function accumulate(pose: ModelPose, stanceSplay: number): Partial<Record<HumanoidBone, THREE.Quaternion>> {
  const chain = (...parts: THREE.Quaternion[]) => parts.reduce((total, part) => total.multiply(part), new THREE.Quaternion())

  const hips = chain(axis(Y, pose.hipYaw), axis(Z, -pose.hipTilt + pose.weightShift * 2.5))
  const spine = chain(hips.clone(), axis(X, pose.spineBend * 0.45), axis(Y, (pose.torsoYaw - pose.hipYaw) * 0.45), axis(Z, -pose.spineSide * 0.5))
  const chest = chain(hips.clone(), axis(X, pose.spineBend), axis(Y, pose.torsoYaw - pose.hipYaw), axis(Z, -pose.spineSide))
  const neck = chain(chest.clone(), axis(X, pose.neckExtend * -0.25))
  const head = chain(chest.clone(), axis(X, pose.headTilt), axis(Y, pose.headYaw), axis(Z, -pose.headRoll))

  const armChain = (side: -1 | 1) => {
    const left = side === -1
    const shoulderLift = left ? pose.leftShoulder : pose.rightShoulder
    const abduct = left ? pose.leftArm : pose.rightArm
    const forward = left ? pose.leftArmForward : pose.rightArmForward
    const twist = left ? pose.leftArmTwist : pose.rightArmTwist
    const elbow = left ? pose.leftElbow : pose.rightElbow
    const forearmTwist = left ? pose.leftForearmTwist : pose.rightForearmTwist
    const wrist = left ? pose.leftWrist : pose.rightWrist
    const shoulder = chain(chest.clone(), axis(Z, shoulderLift * side * -0.35))
    const upper = chain(shoulder.clone(), axis(X, -forward), axis(Y, twist), axis(Z, abduct))
    const lower = chain(upper.clone(), axis(X, elbowFlexion(elbow, side)), axis(Y, forearmTwist))
    const hand = chain(lower.clone(), axis(X, wrist))
    return { shoulder, upper, lower, hand }
  }

  const legChain = (side: -1 | 1) => {
    const left = side === -1
    const hip = left ? pose.leftLeg : pose.rightLeg
    const splay = (left ? pose.leftLegSplay : pose.rightLegSplay) + side * stanceSplay
    const knee = left ? pose.leftKnee : pose.rightKnee
    const ankle = left ? pose.leftAnkle : pose.rightAnkle
    const turn = left ? pose.leftFootTurn : pose.rightFootTurn
    const upper = chain(hips.clone(), axis(X, -hip), axis(Z, splay))
    const lower = chain(upper.clone(), axis(X, knee))
    const foot = chain(lower.clone(), axis(X, ankle), axis(Y, side * turn))
    return { upper, lower, foot }
  }

  const leftArm = armChain(-1)
  const rightArm = armChain(1)
  const leftLeg = legChain(-1)
  const rightLeg = legChain(1)

  return {
    hips, spine, chest, neck, head,
    leftShoulder: leftArm.shoulder, leftUpperArm: leftArm.upper, leftLowerArm: leftArm.lower, leftHand: leftArm.hand,
    rightShoulder: rightArm.shoulder, rightUpperArm: rightArm.upper, rightLowerArm: rightArm.lower, rightHand: rightArm.hand,
    leftUpperLeg: leftLeg.upper, leftLowerLeg: leftLeg.lower, leftFoot: leftLeg.foot,
    rightUpperLeg: rightLeg.upper, rightLowerLeg: rightLeg.lower, rightFoot: rightLeg.foot,
  }
}

/** Finger deltas layered over the imported hand's authored rest shape. */
const HAND_CURL: Record<HandPose, { fingers: number; index: number; thumb: number }> = {
  // A hand at rest is not a flat hand. The MPFB export ships one with the
  // fingers straight and fanned — a glove on a rack — so even "relaxed" has to
  // close it, or every standing pose ends in two starfish.
  relaxed: { fingers: 15, index: 13, thumb: 7 },
  open: { fingers: -6, index: -6, thumb: -3 },
  fist: { fingers: 40, index: 40, thumb: 24 },
  point: { fingers: 40, index: -6, thumb: 16 },
  pocket: { fingers: 28, index: 26, thumb: 15 },
  grip: { fingers: 34, index: 31, thumb: 20 },
}

const FINGER_PATTERN = /(thumb|index|middle|ring|pinky|little)/

/**
 * Curls finger bones about their own local bend axis.
 *
 * Fingers are the one place the world-space method does not help: a finger's
 * bend axis is whatever the rigger chose, and it is not recoverable from the
 * rest direction alone. The local axis with the largest child offset
 * perpendicular to the bone is the bend axis in every rig worth supporting.
 */
function applyFingers(hand: THREE.Bone | undefined, pose: HandPose, rest: RestPose) {
  if (!hand) return
  const curl = HAND_CURL[pose]
  hand.traverse((node) => {
    if (!(node as THREE.Bone).isBone || node === hand) return
    const bone = node as THREE.Bone
    const name = canonicalName(bone.name)
    const match = name.match(FINGER_PATTERN)
    if (!match) return
    const isThumb = match[1] === 'thumb'
    const isIndex = match[1] === 'index'
    const degrees = isThumb ? curl.thumb : isIndex ? curl.index : curl.fingers
    const restLocal = rest.localQuaternion.get(bone)
    if (!restLocal) return
    // MPFB exports already carry a relaxed finger arc. Treating that authored
    // arc as zero prevents every pose from curling it a second time into a hook.
    applyFingerCurlDelta(bone.quaternion, restLocal, degrees)
  })
}

/**
 * Writes a pose onto an imported skeleton.
 *
 * Root-first, so each bone's local rotation is solved against a parent that has
 * already been posed.
 */
export function applyPoseToSkeleton(root: THREE.Object3D, map: BoneMap, rest: RestPose, pose: ModelPose, stanceSplay: number) {
  const targets = accumulate(pose, stanceSplay)
  const neutralStanceSplay = THREE.MathUtils.radToDeg(Math.atan2(NEUTRAL_POSE.stanceWidth / 2 - 0.083, 0.865))
  const neutralTargets = accumulate(NEUTRAL_POSE, neutralStanceSplay)
  const bySlot = new Map<THREE.Bone, HumanoidBone>()
  for (const [slot, bone] of Object.entries(map) as [HumanoidBone, THREE.Bone][]) {
    if (bone && !bySlot.has(bone)) bySlot.set(bone, slot)
  }

  const parentWorld = new THREE.Quaternion()
  const inverse = new THREE.Quaternion()
  const worldTarget = new THREE.Quaternion()

  const walk = (node: THREE.Object3D, posedParentWorld: THREE.Quaternion) => {
    let posedWorld = posedParentWorld
    if ((node as THREE.Bone).isBone) {
      const bone = node as THREE.Bone
      const slot = bySlot.get(bone)
      const restLocal = rest.localQuaternion.get(bone)
      const restWorld = rest.worldQuaternion.get(bone)
      const neutralTarget = slot ? neutralTargets[slot] : undefined
      if (slot && targets[slot] && neutralTarget && restWorld && restLocal) {
        // Imported people already have a valid, authored neutral stance. Apply
        // only the delta from our neutral pose, instead of forcing their bones
        // into the procedural figure's axes. This preserves the arm roll and
        // keeps elbows, wrists and hands in front of the torso.
        applyWorldPoseDelta(worldTarget, targets[slot]!, neutralTarget, restWorld)
        inverse.copy(posedParentWorld).invert()
        bone.quaternion.copy(inverse).multiply(worldTarget)
      } else if (restLocal) {
        bone.quaternion.copy(restLocal)
      }
      posedWorld = parentWorld.copy(posedParentWorld).multiply(bone.quaternion).clone()
    }
    node.children.forEach((child) => walk(child, posedWorld))
  }

  const rootWorld = root.parent
    ? root.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion()
  walk(root, rootWorld)

  applyFingers(map.leftHand, pose.leftHand, rest)
  applyFingers(map.rightHand, pose.rightHand, rest)
  root.updateMatrixWorld(true)
}

// ---------------------------------------------------------------------------
// Facial expression via morph targets
// ---------------------------------------------------------------------------

/** ARKit and VRM blendshape names, mapped to this rig's expression sliders. */
const MORPH_TARGETS: { pattern: RegExp; value: (pose: ModelPose) => number }[] = [
  { pattern: /(mouthsmile|^smile|^a$|^happy$|browinnerup)?mouthsmile/i, value: (pose) => Math.max(0, pose.smile / 100) },
  { pattern: /^(smile|happy|joy|fun)$/i, value: (pose) => Math.max(0, pose.smile / 100) },
  { pattern: /(jawopen|mouthopen|^aa$|^o$)/i, value: (pose) => pose.mouthOpen / 100 },
  { pattern: /(eyeblink|^blink)/i, value: (pose) => 1 - pose.eyeOpen / 100 },
  { pattern: /(eyesquint|squint)/i, value: (pose) => pose.squint / 100 },
  { pattern: /(browup|browinnerup|browouterup|browraise)/i, value: (pose) => Math.max(0, pose.browRaise / 100) },
  { pattern: /(browdown|angry|browfurrow)/i, value: (pose) => Math.max(0, -pose.browRaise / 100) },
  { pattern: /(mouthfunnel|lippart|mouthpucker)/i, value: (pose) => pose.lipPart / 100 },
]

/** Drives whatever blendshapes the file happens to ship. Silently no-ops otherwise. */
export function applyExpressionToMorphs(root: THREE.Object3D, pose: ModelPose) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      const rule = MORPH_TARGETS.find((item) => item.pattern.test(name))
      if (!rule) continue
      mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(rule.value(pose), 0, 1)
    }
  })
}
