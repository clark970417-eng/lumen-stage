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
import { elbowFlexion, type RigPoints } from './ik.ts'
import { CHEST_LIFT_NECK_RETURN, chestLiftDegrees, NEUTRAL_POSE, type HandPose, type ModelPose } from './pose.ts'
import { applyFingerCurlDelta, applyWorldPoseDelta } from './retargetDelta.ts'
import type { CapturedPose } from './capturedPoses.ts'

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
/**
 * Which side of the centreline the pose library puts a left limb on.
 *
 * A property of the procedural figure the library is measured against, whose
 * left shoulder sits at x = -0.169. A rig that disagrees needs its deltas
 * reflected — see applyWorldPoseDelta.
 */
const LIBRARY_LEFT_SIDE = -1

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
  ['leftLowerLeg', /^(leftleg|leftlowerleg|leftshin|leftcalf|leftknee|lleg|lshin|lcalf)$/],
  ['leftFoot', /^(leftfoot|lfoot|leftankle)$/],

  ['rightUpperLeg', /^(right(up)?leg|rightthigh|rupleg|rthigh|righthip)$/],
  ['rightLowerLeg', /^(rightleg|rightlowerleg|rightshin|rightcalf|rightknee|rleg|rshin|rcalf)$/],
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
  /** Local position each bone had in the file, for the one joint that moves. */
  localPosition: Map<THREE.Bone, THREE.Vector3>
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
  const localPosition = new Map<THREE.Bone, THREE.Vector3>()
  const worldQuaternion = new Map<THREE.Bone, THREE.Quaternion>()
  const normalize = new Map<THREE.Bone, THREE.Quaternion>()

  root.traverse((node) => {
    if (!(node as THREE.Bone).isBone) return
    const bone = node as THREE.Bone
    localQuaternion.set(bone, bone.quaternion.clone())
    localPosition.set(bone, bone.position.clone())
    worldQuaternion.set(bone, bone.getWorldQuaternion(new THREE.Quaternion()))
  })

  for (const [slot, reference] of Object.entries(REFERENCE_DIRECTION) as [HumanoidBone, THREE.Vector3][]) {
    const bone = map[slot]
    if (!bone) continue
    const direction = boneDirection(bone)
    if (!direction) continue
    normalize.set(bone, new THREE.Quaternion().setFromUnitVectors(direction, reference.clone().normalize()))
  }

  return { localQuaternion, localPosition, worldQuaternion, normalize }
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
  // A lifted chest is the ribcage tilting back off the pelvis — the same
  // rotation the solver applies, so the handles and the actor agree.
  const lift = chestLiftDegrees(pose.chestLift)
  const bend = pose.spineBend - lift
  const spine = chain(hips.clone(), axis(X, bend * 0.45), axis(Y, (pose.torsoYaw - pose.hipYaw) * 0.45), axis(Z, -pose.spineSide * 0.5))
  const chest = chain(hips.clone(), axis(X, bend), axis(Y, pose.torsoYaw - pose.hipYaw), axis(Z, -pose.spineSide))
  const carry = lift * CHEST_LIFT_NECK_RETURN
  const neck = chain(chest.clone(), axis(X, pose.neckExtend * -0.25 + carry))
  const head = chain(chest.clone(), axis(X, pose.headTilt + carry), axis(Y, pose.headYaw), axis(Z, -pose.headRoll))

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
  // A hand at rest is not a flat hand. Both shipped actors are modelled with
  // the fingers straight and fanned — a glove on a rack — so even "relaxed"
  // has to close it, or every standing pose ends in two starfish. Fifteen
  // degrees was set against an export that already carried some of the arc;
  // these carry none of it.
  relaxed: { fingers: 26, index: 23, thumb: 12 },
  open: { fingers: -6, index: -6, thumb: -3 },
  fist: { fingers: 40, index: 40, thumb: 24 },
  point: { fingers: 40, index: -6, thumb: 16 },
  pocket: { fingers: 28, index: 26, thumb: 15 },
  grip: { fingers: 34, index: 31, thumb: 20 },
}

const NAMED_FINGER = /(thumb|index|middle|ring|pinky|little)/
/**
 * A Biped rig numbers the digits instead of naming them — `Bip01_L_Finger0`
 * through `Finger4`, thumb first — so nothing in the named pattern matched and
 * every hand pose was a no-op on the Rocketbox actors. They stood with the
 * flat, fanned hand the source was modelled with whether they were asked for a
 * relaxed hand, a fist or a grip.
 */
const NUMBERED_FINGER = /finger(\d)/

/** Which curl a finger bone takes, or null if the bone is not a finger. */
function fingerRole(name: string): 'thumb' | 'index' | 'pinky' | 'other' | null {
  const named = name.match(NAMED_FINGER)
  if (named) {
    if (named[1] === 'thumb') return 'thumb'
    if (named[1] === 'index') return 'index'
    return named[1] === 'pinky' || named[1] === 'little' ? 'pinky' : 'other'
  }
  const numbered = name.match(NUMBERED_FINGER)
  if (!numbered) return null
  if (numbered[1] === '0') return 'thumb'
  if (numbered[1] === '1') return 'index'
  return numbered[1] === '4' ? 'pinky' : 'other'
}

/** The far end of a finger, for measuring which way it points. */
function fingerTip(root: THREE.Object3D): THREE.Object3D {
  let tip = root
  for (;;) {
    const next = tip.children.find((node) => (node as THREE.Bone).isBone)
    if (!next) return tip
    tip = next
  }
}

/**
 * The axis a finger bends about, measured off the hand rather than assumed.
 *
 * A finger's flexion axis is whatever the rigger chose, and the rigs disagree:
 * bending about the local Z that suits one of them fans a Biped's fingers apart
 * instead of closing them, so a fist opened the hand a centimetre and spread it
 * wider. What every hand agrees on is that a finger curls about the line
 * through the knuckles, so that line is what gets measured — in the room, then
 * expressed in each bone's own frame by the caller.
 *
 * Which way along that line closes the hand rather than opening it cannot be
 * read off the axis, because a left hand and a right hand mirror. It is settled
 * by asking whether turning that way carries the fingertip toward the wrist.
 */
function fingerCurlAxis(hand: THREE.Bone): THREE.Vector3 | null {
  const roots = hand.children.filter((node) => (node as THREE.Bone).isBone)
  const rootFor = (role: string) => roots.find((node) => fingerRole(canonicalName(node.name)) === role)
  const index = rootFor('index')
  const pinky = rootFor('pinky')
  if (!index || !pinky) return null
  const across = pinky.getWorldPosition(new THREE.Vector3()).sub(index.getWorldPosition(new THREE.Vector3()))
  if (across.lengthSq() < 1e-10) return null
  across.normalize()

  const knuckle = index.getWorldPosition(new THREE.Vector3())
  const tip = fingerTip(index).getWorldPosition(new THREE.Vector3())
  const reach = tip.clone().sub(knuckle)
  if (reach.lengthSq() < 1e-10) return null
  // Turning about `across` moves the tip by across x reach. Curling is the
  // sense of that which brings it back toward the wrist.
  const swing = new THREE.Vector3().crossVectors(across, reach)
  const towardWrist = hand.getWorldPosition(new THREE.Vector3()).sub(tip)
  return swing.dot(towardWrist) < 0 ? across.negate() : across
}

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
  const across = fingerCurlAxis(hand)
  const inBone = new THREE.Vector3()
  const boneWorld = new THREE.Quaternion()
  hand.traverse((node) => {
    if (!(node as THREE.Bone).isBone || node === hand) return
    const bone = node as THREE.Bone
    const role = fingerRole(canonicalName(bone.name))
    if (!role) return
    const degrees = role === 'thumb' ? curl.thumb : role === 'index' ? curl.index : curl.fingers
    const restLocal = rest.localQuaternion.get(bone)
    if (!restLocal) return
    // MPFB exports already carry a relaxed finger arc. Treating that authored
    // arc as zero prevents every pose from curling it a second time into a hook.
    if (!across) { applyFingerCurlDelta(bone.quaternion, restLocal, degrees); return }
    bone.getWorldQuaternion(boneWorld)
    applyFingerCurlDelta(bone.quaternion, restLocal, degrees, inBone.copy(across).applyQuaternion(boneWorld.invert()))
  })
}

/**
 * Slides the pelvis sideways, which is the one thing a pose asks for that is a
 * move rather than a turn.
 *
 * Every other joint the library drives is a rotation, so the retarget was built
 * to carry rotations and quietly dropped this. The drag handle wrote it and the
 * solver read it, so pulling the hips across moved the handle and left the
 * actor standing where she was.
 *
 * The offset is given in the room, so it is turned into the pelvis' parent
 * frame and divided by the scale the actor was normalised with. It reflects
 * with the rest of the pose on a rig that numbers its sides the other way,
 * because a weight shift is only worth anything against the leg it is over.
 */
function shiftHips(map: BoneMap, rest: RestPose, hipShift: number, mirrored: boolean, root: THREE.Object3D) {
  const hips = map.hips
  const restLocal = hips && rest.localPosition.get(hips)
  if (!hips || !restLocal) return
  if (Math.abs(hipShift) < 1e-6) { hips.position.copy(restLocal); return }
  const parent = hips.parent
  const parentWorld = parent ? parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion()
  const scale = parent ? parent.getWorldScale(new THREE.Vector3()).x || 1 : 1
  // Sideways for the actor, not for the room: a figure turned to face the wall
  // still steps onto its own left foot, not onto the wall.
  const inModel = root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(parentWorld)
  const offset = new THREE.Vector3((mirrored ? -hipShift : hipShift) / scale, 0, 0)
  hips.position.copy(restLocal).add(offset.applyQuaternion(inModel.invert()))
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

  // Whether this rig calls left what the pose library calls right. Read once
  // off the shoulders, because a bone's side is a fact about the skeleton and
  // not about the pose being asked for.
  const mirrored = (() => {
    const hips = map.hips
    const shoulder = map.leftUpperArm
    if (!hips || !shoulder) return false
    const hipsAt = hips.getWorldPosition(new THREE.Vector3())
    const shoulderAt = shoulder.getWorldPosition(new THREE.Vector3())
    // Against the actor's own right, not the room's. Which side of itself a rig
    // calls left is a fact about the skeleton; read against the room it changed
    // with the direction the actor happened to be facing, and a quarter turn
    // was enough to decide the arms belonged the other way round.
    const bodyRight = new THREE.Vector3(1, 0, 0).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()))
    const rigSide = Math.sign(shoulderAt.sub(hipsAt).dot(bodyRight))
    return rigSide !== 0 && rigSide !== LIBRARY_LEFT_SIDE
  })()

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
        applyWorldPoseDelta(worldTarget, targets[slot]!, neutralTarget, restWorld, mirrored)
        inverse.copy(posedParentWorld).invert()
        bone.quaternion.copy(inverse).multiply(worldTarget)
      } else if (restLocal) {
        bone.quaternion.copy(restLocal)
      }
      posedWorld = parentWorld.copy(posedParentWorld).multiply(bone.quaternion).clone()
    } else if (node !== root) {
      // Groups between the root and the skeleton turn the world too. Passing
      // the parent's orientation straight through them assumes they are all
      // unrotated, which held for the MakeHuman exports and does not hold for
      // a file that carries its axis conversion on a wrapper node: every bone
      // below it was then solved ninety degrees out, and the actor posed lying
      // on her back.
      posedWorld = parentWorld.copy(posedParentWorld).multiply(node.quaternion).clone()
    }
    node.children.forEach((child) => walk(child, posedWorld))
  }

  // Seeded with the root's own orientation rather than its orientation in the
  // room, because that is the frame the rest pose was recorded in: the model is
  // still detached when captureRestPose runs, so every restWorld is measured
  // against the model and knows nothing about where it was later put.
  //
  // Seeded with the world orientation instead, the two frames disagreed by
  // exactly however far the actor had been turned, and each bone's local
  // rotation came out carrying the opposite of it. The skeleton cancelled the
  // turn: reopen a project with the subject facing away and the group was
  // rotated, the mesh was not, and the facing was silently lost.
  root.updateWorldMatrix(true, false)
  walk(root, root.quaternion.clone())

  // The walk wrote local rotations only, so nothing is where the matrices say
  // yet — and both the pelvis offset and the finger bend axis are measured in
  // the room.
  root.updateMatrixWorld(true)
  shiftHips(map, rest, pose.hipShift, mirrored, root)
  root.updateMatrixWorld(true)
  applyFingers(map.leftHand, pose.leftHand, rest)
  applyFingers(map.rightHand, pose.rightHand, rest)
  root.updateMatrixWorld(true)
}

// ---------------------------------------------------------------------------
// Gaze
// ---------------------------------------------------------------------------

/**
 * The eyeball bones, on a rig that has them.
 *
 * Deliberately not part of the humanoid map: an eye is not a link in the pose
 * chain, and the map's job is the chain. `Bip01_LEyeBlinkTop` and
 * `Bip01_LOuterEyebrow` normalize to something longer, so only the eyeballs
 * themselves match.
 */
const EYE_PATTERN = /^(left|l|right|r)eye$/

/** How far the eye may roll up, and down, before the lids give it away. */
const EYE_RAISE_LIMIT = 20
const EYE_LOWER_LIMIT = 26

export function findEyeBones(root: THREE.Object3D): THREE.Bone[] {
  const found: THREE.Bone[] = []
  root.traverse((node) => {
    if ((node as THREE.Bone).isBone && EYE_PATTERN.test(canonicalName(node.name))) found.push(node as THREE.Bone)
  })
  return found
}

/**
 * Points the eyes, on a rig whose eyeballs are its own bones.
 *
 * Until now only the prosthetic eyeballs the studio adds to an eyeless import
 * could be aimed, so the two actors that came with real eyes were the two whose
 * eyes never moved — and eyes that never move are most of what reads as "not a
 * person". Their gaze sliders, and "eyes follow the lens", did nothing at all.
 *
 * The angles are meant relative to the head — chin down, eyes up — so the turn
 * is built in the anatomical frame and then expressed in the head's own
 * coordinates using the rest pose. Which axis a Biped calls up is then beside
 * the point, and the offset stays put when the head turns.
 */
export function aimEyes(map: BoneMap, rest: RestPose, eyes: THREE.Bone[], yaw: number, pitch: number, faceForward: number) {
  const head = map.head
  const headRest = head && rest.worldQuaternion.get(head)
  if (!headRest || eyes.length === 0) return
  // Positive yaw swings the gaze toward +X and positive pitch drops it, the
  // sense the pose values are authored in and the same one the prosthetic eyes
  // already used.
  //
  // Upward travel is held short of the slider's range. A real eye rolled that
  // far takes the iris up behind the lid, and the lid does not rise with it
  // here — what renders is a person showing the whites of their eyes rather
  // than a person glancing up. A prosthetic sphere with no lid around it had
  // no such limit, which is why this one lives with the rig that has a socket.
  const inSocket = THREE.MathUtils.clamp(pitch, -EYE_RAISE_LIMIT, EYE_LOWER_LIMIT)
  const turn = new THREE.Quaternion()
    .setFromAxisAngle(Y, rad(yaw) * faceForward)
    .multiply(new THREE.Quaternion().setFromAxisAngle(X, rad(inSocket)))
  const inHead = headRest.clone().invert().multiply(turn).multiply(headRest)
  for (const eye of eyes) {
    const eyeRest = rest.localQuaternion.get(eye)
    if (!eyeRest) continue
    eye.quaternion.copy(inHead).multiply(eyeRest)
  }
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

/**
 * A shape from the ARKit set, and one from the FACS set that repeats it.
 *
 * These actors ship the same face twice over: a complete ARKit set (AK_) and a
 * FACS set (AU_, HB_) describing the same actions again — and the FACS half
 * carries whole-face shapes beside their own left and right halves, so it
 * repeats itself as well. A slider matched by name drove all of them at once: a
 * squint went on three times over, and forty-five per cent of one shut the eye
 * completely.
 *
 * So where a file offers both, the ARKit set is driven and the other left at
 * zero. It is the complete one, and it says each thing once.
 */
const ARKIT_SHAPE = /(^|\W)AK_\d/
const FACS_SHAPE = /(^|\W)(AU|HB)_\d/

/** Drives whatever blendshapes the file happens to ship. Silently no-ops otherwise. */
export function applyExpressionToMorphs(root: THREE.Object3D, pose: ModelPose) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return
    const names = Object.keys(mesh.morphTargetDictionary)
    const duplicated = names.some((name) => ARKIT_SHAPE.test(name)) && names.some((name) => FACS_SHAPE.test(name))
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      if (duplicated && FACS_SHAPE.test(name)) { mesh.morphTargetInfluences[index] = 0; continue }
      const rule = MORPH_TARGETS.find((item) => item.pattern.test(name))
      if (!rule) continue
      mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(rule.value(pose), 0, 1)
    }
  })
}

// ---------------------------------------------------------------------------
// Landing the hands on a body the pose was not measured on
// ---------------------------------------------------------------------------

/** How far the hand IK may carry a hand before the target is not believed. */
const HAND_LANDING_LIMIT = 0.3

/**
 * Walks a chain so its end lands on a point, by cyclic coordinate descent.
 *
 * Each bone in turn is swung so the end of the chain points at the target,
 * from the tip inward, a few times over. Started from a pose that is already
 * nearly right it barely moves anything — which is what is wanted here, since
 * the pose carries the intent and this only closes the last few centimetres.
 */
function reachTowards(chain: THREE.Bone[], end: THREE.Object3D, target: THREE.Vector3, passes: number) {
  const bonePosition = new THREE.Vector3()
  const endPosition = new THREE.Vector3()
  const toEnd = new THREE.Vector3()
  const toTarget = new THREE.Vector3()
  const swing = new THREE.Quaternion()
  const parentWorld = new THREE.Quaternion()
  const boneWorld = new THREE.Quaternion()
  for (let pass = 0; pass < passes; pass += 1) {
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const bone = chain[index]
      if (!bone.parent) continue
      bone.getWorldPosition(bonePosition)
      end.getWorldPosition(endPosition)
      toEnd.subVectors(endPosition, bonePosition)
      toTarget.subVectors(target, bonePosition)
      if (toEnd.lengthSq() < 1e-10 || toTarget.lengthSq() < 1e-10) continue
      swing.setFromUnitVectors(toEnd.normalize(), toTarget.normalize())
      bone.parent.getWorldQuaternion(parentWorld)
      bone.getWorldQuaternion(boneWorld)
      bone.quaternion.copy(parentWorld.invert()).multiply(swing.multiply(boneWorld))
      bone.updateMatrixWorld(true)
    }
  }
}

/**
 * Puts the hands where the pose meant them, on a body that is not the one the
 * pose was measured on.
 *
 * The library stores angles, and angles only put a hand somewhere if the arm
 * they turn is the length it was measured on. It is not: an actor's reach,
 * shoulder width and torso height are all his own, so hands-on-hips left the
 * hands beside the hips, arms-crossed folded them too high, and hand-to-chin
 * stopped short of the chin. The direction was right every time; the distance
 * was not.
 *
 * So the wrist the procedural figure would have is read in its own hips-local
 * frame, rescaled by how much wider and taller this actor is, and the actor's
 * own arm is then walked onto it. What the pose says still decides where the
 * hand goes; the body decides how far it has to reach to get there.
 */
export function landHands(map: BoneMap, want: RigPoints, faceForward: number, root: THREE.Object3D) {
  const { hips, leftUpperArm, leftLowerArm, leftHand, rightUpperArm, rightLowerArm, rightHand } = map
  if (!hips || !leftUpperArm || !rightUpperArm) return
  // Which way this actor is facing in the room. The pose describes a hand's
  // place on the body — a hip, a chin, the far shoulder — and those travel with
  // the body. Measured against the room's axes instead, turning the actor left
  // the targets behind: at a right angle the wrists were sent out in front of
  // the hips rather than beside them.
  const facing = root.getWorldQuaternion(new THREE.Quaternion())
  const bodyRight = new THREE.Vector3(1, 0, 0).applyQuaternion(facing)

  const hipsWorld = hips.getWorldPosition(new THREE.Vector3())
  const leftShoulder = leftUpperArm.getWorldPosition(new THREE.Vector3())
  const rightShoulder = rightUpperArm.getWorldPosition(new THREE.Vector3())

  const actorHalfWidth = leftShoulder.distanceTo(rightShoulder) / 2
  const wantHalfWidth = want.leftShoulder.distanceTo(want.rightShoulder) / 2
  const actorRise = (leftShoulder.y + rightShoulder.y) / 2 - hipsWorld.y
  const wantRise = (want.leftShoulder.y + want.rightShoulder.y) / 2 - want.hips.y
  if (wantHalfWidth < 1e-4 || Math.abs(wantRise) < 1e-4) return
  const across = actorHalfWidth / wantHalfWidth
  const along = actorRise / wantRise

  // Which side of its own centreline this rig calls its left. Measured from the
  // hips, not from the world origin: an actor standing off to one side of the
  // studio has both shoulders on the same side of x = 0, and read that way a
  // rig would be called mirrored or not depending on where it was standing.
  const side = (point: THREE.Vector3, origin: THREE.Vector3) => Math.sign(point.clone().sub(origin).dot(bodyRight))
  const mirror = side(leftShoulder, hipsWorld) * (Math.sign(want.leftShoulder.x - want.hips.x) || -1) < 0 ? -1 : 1
  const target = new THREE.Vector3()

  const land = (upper?: THREE.Bone, lower?: THREE.Bone, hand?: THREE.Bone, wrist?: THREE.Vector3) => {
    if (!upper || !lower || !hand || !wrist) return
    // The offset is mirrored onto whichever side this rig calls left, and
    // scaled by how much wider and taller this actor is than the figure the
    // pose was measured on.
    const sideways = (wrist.x - want.hips.x) * across * mirror
    target
      .set(sideways, (wrist.y - want.hips.y) * along, (wrist.z - want.hips.z) * along * faceForward)
      .applyQuaternion(facing)
      .add(hipsWorld)
    if (hand.getWorldPosition(new THREE.Vector3()).distanceTo(target) > HAND_LANDING_LIMIT) return
    reachTowards([upper, lower], hand, target, 4)
  }

  land(leftUpperArm, leftLowerArm, leftHand, want.leftWrist)
  land(rightUpperArm, rightLowerArm, rightHand, want.rightWrist)
}

/**
 * Puts a seated actor's feet on the floor.
 *
 * A standing actor is planted by moving the whole model until the lower foot
 * touches. A seated one cannot be: the pelvis is on the seat and that is what
 * fixes the height, so the legs have to make up the difference themselves. Left
 * to the pose angles alone they did not — the library writes a hip and a knee
 * in degrees, and degrees only reach the floor for the leg length and the seat
 * height they were written against. On the studio's own chair every seated pose
 * left both feet about seven centimetres in the air.
 *
 * Only the height is corrected. The target keeps the foot's own x and z, so an
 * asymmetric pose stays asymmetric and crossed legs stay crossed; what changes
 * is how far the knee opens. A seat too tall to reach the floor from — a plinth,
 * a stool — leaves the chain reaching and the leg hanging, which is what a leg
 * does when it cannot reach the floor.
 *
 * `plantedY` is the height the foot bone stands at with the sole down, measured
 * in the frame the model's own position lives in. It has to be that frame and
 * not the model's: matching a height inside the model only means "on the floor"
 * while the model has not moved, and a seated one has just been lifted onto a
 * seat — asked for its resting height there, the leg drove the foot a further
 * twenty centimetres through the floor.
 */
export function landFeet(map: BoneMap, model: THREE.Object3D, plantedY: number, fold = false) {
  const target = new THREE.Vector3()
  const hip = new THREE.Vector3()
  const parent = model.parent
  const land = (upper?: THREE.Bone, lower?: THREE.Bone, foot?: THREE.Bone) => {
    if (!upper || !lower || !foot) return
    foot.getWorldPosition(target)
    if (parent) parent.worldToLocal(target)
    if (fold) {
      // Fold the leg along the line from the hip to where the foot is, rather
      // than lifting the foot straight up and leaving it where it stood.
      //
      // A captured sit was performed on whatever the studio that recorded it
      // had, and ours is a chair: the frames come in wanting half a metre of
      // drop from pelvis to ankle where a 0.46 m seat gives 0.42. Lifting the
      // ankle those centimetres in place is a demand to straighten a bent leg,
      // and the knee answers by swinging out to the side. Moving the foot back
      // toward the hip as it rises is the same thing a person does — the knee
      // folds instead.
      upper.getWorldPosition(hip)
      if (parent) parent.worldToLocal(hip)
      const drop = hip.y - target.y
      if (drop > 1e-4) target.lerpVectors(hip, target, (hip.y - plantedY) / drop)
    }
    target.y = plantedY
    if (parent) parent.localToWorld(target)
    reachTowards([upper, lower], foot, target, 5)
  }
  land(map.leftUpperLeg, map.leftLowerLeg, map.leftFoot)
  land(map.rightUpperLeg, map.rightLowerLeg, map.rightFoot)
}

/**
 * Writes a captured frame onto the skeleton.
 *
 * The frame is stored as a rotation delta from the rest of the rig it was read
 * off, and is applied as a delta here too: every bone starts from *this*
 * actor's rest and turns by however far the performer turned theirs. Writing
 * the recorded rotations straight on would import the source rig's rest along
 * with the pose, and the two shipped actors' bones sit up to fourteen degrees
 * apart — enough to round a straight back or unbend a wrist.
 *
 * Bones the frame does not name go back to rest, the same as a solved pose, so
 * switching between the two leaves nothing behind.
 *
 * Returns how many of the recorded bones this skeleton actually has. A caller
 * can tell a frame that landed from one aimed at a rig that never had these
 * names, which is every imported model that is not a Rocketbox actor.
 */
export function applyCapturedPose(root: THREE.Object3D, rest: RestPose, capture: CapturedPose): number {
  const delta = new THREE.Quaternion()
  let matched = 0
  root.traverse((node) => {
    if (!(node as THREE.Bone).isBone) return
    const bone = node as THREE.Bone
    const restLocal = rest.localQuaternion.get(bone)
    if (!restLocal) return
    const recorded = capture.rotation[bone.name]
    if (recorded) {
      matched += 1
      // Normalized because the stored components are rounded to four decimals
      // to keep the library small, which leaves them a hair off unit length.
      // Composed down a chain of fifty bones that becomes a visible scale.
      delta.set(recorded[0], recorded[1], recorded[2], recorded[3]).normalize()
      bone.quaternion.copy(restLocal).multiply(delta)
    } else {
      bone.quaternion.copy(restLocal)
    }
  })
  return matched
}

/**
 * Puts the hands back on what they were resting on.
 *
 * A captured frame carries joint angles, and joint angles only land a hand
 * somewhere on the body it was measured on. The shipped actors are not the
 * same build — one has arms thirteen percent longer on calves six percent
 * shorter — so replaying the frame drifts a hand two to six centimetres off
 * the chin or thigh it was touching. That reads as a hand hovering.
 *
 * The offset was recorded in the local frame of the bone the hand rested on,
 * so it travels with that bone: the chin stays the chin however the head is
 * turned. It is scaled by how much taller this actor is than the one the frame
 * came from, which is why `stature` is measured at rest, in the model's own
 * units, the same way on both.
 */
export function landCapturedContacts(map: BoneMap, root: THREE.Object3D, capture: CapturedPose, stature: number) {
  if (!capture.contacts.length || !(stature > 0) || !(capture.stature > 0)) return
  const byName = new Map<string, THREE.Bone>()
  root.traverse((node) => {
    if ((node as THREE.Bone).isBone) byName.set(node.name, node as THREE.Bone)
  })
  const scale = stature / capture.stature
  const target = new THREE.Vector3()
  for (const contact of capture.contacts) {
    const anchor = byName.get(contact.anchor)
    const upper = contact.hand === 'left' ? map.leftUpperArm : map.rightUpperArm
    const lower = contact.hand === 'left' ? map.leftLowerArm : map.rightLowerArm
    const hand = contact.hand === 'left' ? map.leftHand : map.rightHand
    if (!anchor || !upper || !lower || !hand) continue
    target.fromArray(contact.offset).multiplyScalar(scale)
    anchor.localToWorld(target)
    reachTowards([upper, lower], hand, target, 6)
  }
}

/**
 * Turns a replayed head toward the camera.
 *
 * A captured frame owns the head, which costs the photographer the one control
 * they reach for most: three of these performances look down, and asking the
 * subject to look at the lens is not an unreasonable thing to want from a
 * person who is standing in your studio. The pose's own headYaw cannot say it,
 * because a capture does not read joint values.
 *
 * So the head is turned from where the performance left it, by the difference
 * between that and the lens. Clamped hard, and measured as a rotation from the
 * head's rest rather than from any assumed local axis: on this skeleton the
 * head bone's own forward is not the direction the face points.
 */
export function aimCapturedHead(head: THREE.Bone | undefined, rest: RestPose, model: THREE.Object3D, cameraYaw: number) {
  const restHead = head ? rest.worldQuaternion.get(head) : undefined
  if (!head || !head.parent || !restHead) return
  const modelWorld = model.getWorldQuaternion(new THREE.Quaternion())
  const posedInModel = modelWorld.clone().invert().multiply(head.getWorldQuaternion(new THREE.Quaternion()))
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(posedInModel.multiply(restHead.clone().invert()))
  const yaw = THREE.MathUtils.radToDeg(Math.atan2(facing.x, facing.z))
  const pitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(facing.y, -1, 1)))

  // Enough to lift a lowered chin and turn a head across a shoulder, not enough
  // to take the neck anywhere a neck does not go.
  const turn = THREE.MathUtils.clamp(THREE.MathUtils.clamp(cameraYaw, -72, 72) - yaw, -38, 38)
  const lift = THREE.MathUtils.clamp(pitch, -24, 24)
  if (Math.abs(turn) < 0.05 && Math.abs(lift) < 0.05) return

  const headWorld = head.getWorldQuaternion(new THREE.Quaternion())
  // Down about the model's own right levels the face; about the room's right it
  // would tip the head sideways as soon as the actor was turned.
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(modelWorld)
  headWorld.premultiply(new THREE.Quaternion().setFromAxisAngle(right, THREE.MathUtils.degToRad(lift)))
  headWorld.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(turn)))
  head.quaternion.copy(head.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(headWorld)
}
