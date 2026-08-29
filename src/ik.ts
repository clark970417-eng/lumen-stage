/**
 * Forward and inverse kinematics for the figure rig.
 *
 * Sliders are precise and slow. Reaching for a wrist and dragging it is how a
 * photographer actually thinks about a pose — "put the hand there" — so this
 * module turns a dragged point back into the joint angles the rig stores.
 *
 * Everything works in *figure-local* space: the frame the figure is authored
 * in, before the scene applies its position, facing and height scale. The
 * caller converts.
 *
 * The chains are two-bone, which is exactly what an arm and a leg are, so the
 * solution is closed-form. No iteration, no convergence failures, no jitter.
 */

import * as THREE from 'three'
import { HEAD, resolvePhysique, SEGMENT, type Physique } from './anatomy'
import type { ModelPose } from './pose'

const rad = THREE.MathUtils.degToRad
const deg = THREE.MathUtils.radToDeg
const clamp = THREE.MathUtils.clamp

/** Folds an angle into (−180°, 180°]. Without this a wrap reads as a limit hit. */
const wrap = (degrees: number) => {
  let value = degrees % 360
  if (value > 180) value -= 360
  if (value <= -180) value += 360
  return value
}

export type Side = -1 | 1

/** Where every draggable point currently sits, in figure-local space. */
export type RigPoints = {
  head: THREE.Vector3
  leftWrist: THREE.Vector3
  rightWrist: THREE.Vector3
  leftElbow: THREE.Vector3
  rightElbow: THREE.Vector3
  leftAnkle: THREE.Vector3
  rightAnkle: THREE.Vector3
  leftKnee: THREE.Vector3
  rightKnee: THREE.Vector3
  hips: THREE.Vector3
}

export type RigFrames = {
  pelvisPosition: THREE.Vector3
  pelvisRotation: THREE.Quaternion
  spineRotation: THREE.Quaternion
  shoulder: (side: Side) => THREE.Vector3
  hip: (side: Side) => THREE.Vector3
}

const euler = (x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ') =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(x), rad(y), rad(z), order))

/**
 * Stance width is a foot placement; the rig stores it as a splay angle at the
 * hip. Kept here so forward and inverse kinematics agree with the renderer.
 */
export function stanceSplayFor(pose: ModelPose, hipJoint: number) {
  return deg(Math.atan2(pose.stanceWidth / 2 - hipJoint, SEGMENT.thigh + SEGMENT.shin))
}

/** Pelvis height, solved from the leg angles — the same rule the figure uses. */
export function pelvisHeight(pose: ModelPose, seatHeight: number | null) {
  const seated = Math.min(pose.leftLeg, pose.rightLeg) > 60
  if (seated) return seatHeight ?? 0.46
  const drop = (hip: number, knee: number, ankle: number) => {
    const thighEnd = new THREE.Vector3(0, -SEGMENT.thigh, 0).applyEuler(new THREE.Euler(rad(-hip), 0, 0))
    const shinEnd = new THREE.Vector3(0, -SEGMENT.shin, 0).applyEuler(new THREE.Euler(rad(-hip + knee), 0, 0))
    return -(thighEnd.y + shinEnd.y) + SEGMENT.ankleY * Math.cos(rad(ankle))
  }
  return Math.max(drop(pose.leftLeg, pose.leftKnee, pose.leftAnkle), drop(pose.rightLeg, pose.rightKnee, pose.rightAnkle))
}

/** The frames every chain hangs from. Mirrors the figure's group hierarchy. */
export function rigFrames(pose: ModelPose, physique: Physique, seatHeight: number | null = null): RigFrames {
  const p = resolvePhysique(physique)
  const pelvisPosition = new THREE.Vector3(pose.hipShift, pelvisHeight(pose, seatHeight), 0)
  const pelvisRotation = euler(0, pose.hipYaw, -pose.hipTilt + pose.weightShift * 2.5)
  const spineRotation = pelvisRotation.clone().multiply(euler(pose.spineBend, pose.torsoYaw - pose.hipYaw, -pose.spineSide))

  return {
    pelvisPosition,
    pelvisRotation,
    spineRotation,
    shoulder: (side) => {
      const lift = side === -1 ? pose.leftShoulder : pose.rightShoulder
      const local = new THREE.Vector3(side * p.shoulderJoint, SEGMENT.torso - 0.045 + lift * 0.0009, -0.006)
      return local.applyQuaternion(spineRotation).add(pelvisPosition)
    },
    hip: (side) => new THREE.Vector3(side * p.hipJoint, 0, 0).applyQuaternion(pelvisRotation).add(pelvisPosition),
  }
}

/** Where the joints are right now. */
export function forwardKinematics(pose: ModelPose, physique: Physique, seatHeight: number | null = null): RigPoints {
  const frames = rigFrames(pose, physique, seatHeight)
  const splay = stanceSplayFor(pose, resolvePhysique(physique).hipJoint)

  const arm = (side: Side) => {
    const left = side === -1
    const shoulder = frames.shoulder(side)
    const armRotation = frames.spineRotation.clone().multiply(euler(
      -(left ? pose.leftArmForward : pose.rightArmForward),
      left ? pose.leftArmTwist : pose.rightArmTwist,
      left ? pose.leftArm : pose.rightArm,
    ))
    const elbow = new THREE.Vector3(0, -SEGMENT.upperArm, 0).applyQuaternion(armRotation).add(shoulder)
    const forearmRotation = armRotation.clone()
      .multiply(euler(0, 0, left ? pose.leftElbow : pose.rightElbow))
      .multiply(euler(0, left ? pose.leftForearmTwist : pose.rightForearmTwist, 0))
    const wrist = new THREE.Vector3(0, -SEGMENT.forearm, 0).applyQuaternion(forearmRotation).add(elbow)
    return { elbow, wrist }
  }

  const leg = (side: Side) => {
    const left = side === -1
    const root = frames.hip(side)
    const legRotation = frames.pelvisRotation.clone().multiply(euler(
      -(left ? pose.leftLeg : pose.rightLeg),
      0,
      (left ? pose.leftLegSplay : pose.rightLegSplay) + side * splay,
    ))
    const knee = new THREE.Vector3(0, -SEGMENT.thigh, 0).applyQuaternion(legRotation).add(root)
    const shinRotation = legRotation.clone().multiply(euler(left ? pose.leftKnee : pose.rightKnee, 0, 0))
    const ankle = new THREE.Vector3(0, -SEGMENT.shin, 0).applyQuaternion(shinRotation).add(knee)
    return { knee, ankle }
  }

  const leftArm = arm(-1)
  const rightArm = arm(1)
  const leftLeg = leg(-1)
  const rightLeg = leg(1)

  const neck = new THREE.Vector3(0, SEGMENT.torso - 0.012, 0).applyQuaternion(frames.spineRotation).add(frames.pelvisPosition)
  const headRotation = frames.spineRotation.clone().multiply(euler(pose.headTilt, pose.headYaw, -pose.headRoll))
  const head = new THREE.Vector3(0, SEGMENT.neckLength + 0.004 + HEAD.eyeY, pose.neckExtend * 0.0007)
    .applyQuaternion(headRotation).add(neck)

  return {
    head,
    hips: frames.pelvisPosition.clone(),
    leftElbow: leftArm.elbow, leftWrist: leftArm.wrist,
    rightElbow: rightArm.elbow, rightWrist: rightArm.wrist,
    leftKnee: leftLeg.knee, leftAnkle: leftLeg.ankle,
    rightKnee: rightLeg.knee, rightAnkle: rightLeg.ankle,
  }
}

// ---------------------------------------------------------------------------
// Inverse kinematics
// ---------------------------------------------------------------------------

/**
 * The bend angle that makes a two-bone chain span `distance`.
 *
 * The cosine is clamped rather than the distance. Near full extension the
 * relationship is extremely steep — on a leg, the last 0.3 mm of reach is 5° of
 * knee — so clamping the distance by any usable epsilon leaves a straight limb
 * visibly bent. Clamping the cosine instead makes an out-of-reach target simply
 * straighten the limb and point it at the target, which is what a real one does.
 */
function bendForReach(distance: number, upper: number, lower: number) {
  const cosine = clamp((distance * distance - upper * upper - lower * lower) / (2 * upper * lower), -1, 1)
  const angle = deg(Math.acos(cosine))
  // The chain's actual span at that angle — it differs from `distance` only when
  // the target was unreachable.
  const reach = Math.sqrt(upper * upper + lower * lower + 2 * upper * lower * cosine)
  return { angle, reach }
}

export type ArmSolution = {
  forward: number
  twist: number
  abduct: number
  elbow: number
}

/**
 * Solves an arm so the wrist lands on `target` (figure-local space).
 *
 * The shoulder rotation is the shortest arc that takes the bent chain onto the
 * target direction. Shortest-arc gives no explicit elbow-pole control, but it
 * is continuous — the elbow never flips as the hand crosses the body, which is
 * what a pole vector solution does unless it is carefully damped.
 */
export function solveArm(side: Side, target: THREE.Vector3, pose: ModelPose, physique: Physique, seatHeight: number | null = null): ArmSolution {
  const frames = rigFrames(pose, physique, seatHeight)
  const shoulder = frames.shoulder(side)
  const local = target.clone().sub(shoulder).applyQuaternion(frames.spineRotation.clone().invert())

  const { angle } = bendForReach(local.length(), SEGMENT.upperArm, SEGMENT.forearm)
  const elbow = side === -1 ? angle : -angle

  // The chain's shape in its own frame, before the shoulder aims it.
  const bent = new THREE.Vector3(
    SEGMENT.forearm * Math.sin(rad(elbow)),
    -(SEGMENT.upperArm + SEGMENT.forearm * Math.cos(rad(elbow))),
    0,
  )
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    bent.clone().normalize(),
    local.clone().normalize(),
  )
  const angles = new THREE.Euler().setFromQuaternion(rotation, 'XYZ')

  return {
    forward: -deg(angles.x),
    twist: deg(angles.y),
    abduct: deg(angles.z),
    elbow: Number(elbow.toFixed(2)),
  }
}

export type LegSolution = {
  hip: number
  splay: number
  knee: number
}

/**
 * Solves a leg so the ankle lands on `target`.
 *
 * A leg has only two rotations at the hip in this rig — flexion and abduction —
 * so unlike the arm it is solved directly rather than by shortest arc. The knee
 * only ever bends backward, which the closed form respects by construction.
 */
export function solveLeg(side: Side, target: THREE.Vector3, pose: ModelPose, physique: Physique, seatHeight: number | null = null): LegSolution {
  const p = resolvePhysique(physique)
  const frames = rigFrames(pose, physique, seatHeight)
  const root = frames.hip(side)
  const local = target.clone().sub(root).applyQuaternion(frames.pelvisRotation.clone().invert())

  const { angle: knee } = bendForReach(local.length(), SEGMENT.thigh, SEGMENT.shin)

  // Chain shape in the leg's own frame: bends in the YZ plane, toward −Z.
  const vy = -(SEGMENT.thigh + SEGMENT.shin * Math.cos(rad(knee)))
  const vz = -SEGMENT.shin * Math.sin(rad(knee))

  // Abduction first: it is the only rotation that can produce an X component.
  const splay = deg(Math.asin(clamp(-local.x / vy, -1, 1)))
  const projected = vy * Math.cos(rad(splay))
  // Then flexion, as the planar angle between the chain and the target.
  const hip = wrap(deg(Math.atan2(vz, projected) - Math.atan2(local.z, local.y)))

  const stance = stanceSplayFor(pose, p.hipJoint)
  return {
    hip: Number(hip.toFixed(2)),
    splay: Number(wrap(splay - side * stance).toFixed(2)),
    knee: Number(knee.toFixed(2)),
  }
}

/** Aims the head at a point, as yaw and tilt against the current spine. */
export function solveHeadAim(target: THREE.Vector3, pose: ModelPose, physique: Physique, seatHeight: number | null = null) {
  const frames = rigFrames(pose, physique, seatHeight)
  const neck = new THREE.Vector3(0, SEGMENT.torso - 0.012, 0).applyQuaternion(frames.spineRotation).add(frames.pelvisPosition)
  const local = target.clone().sub(neck).applyQuaternion(frames.spineRotation.clone().invert())
  // The head's own +Y runs up the neck; dragging its handle tips that axis.
  const yaw = deg(Math.atan2(local.x, Math.max(0.02, local.y)))
  const tilt = -deg(Math.atan2(local.z, Math.max(0.02, local.y)))
  return {
    headYaw: clamp(Number(yaw.toFixed(1)), -75, 75),
    headTilt: clamp(Number(tilt.toFixed(1)), -32, 32),
  }
}

/** Writes an arm solution into the pose patch shape the store expects. */
export function armPatch(side: Side, solution: ArmSolution): Partial<ModelPose> {
  const limit = (value: number, min: number, max: number) => clamp(Number(value.toFixed(2)), min, max)
  return side === -1
    ? {
        leftArmForward: limit(solution.forward, -70, 110),
        leftArmTwist: limit(solution.twist, -80, 80),
        leftArm: limit(solution.abduct, -175, 60),
        leftElbow: limit(solution.elbow, -10, 145),
      }
    : {
        rightArmForward: limit(solution.forward, -70, 110),
        rightArmTwist: limit(solution.twist, -80, 80),
        rightArm: limit(solution.abduct, -60, 175),
        rightElbow: limit(solution.elbow, -145, 10),
      }
}

export function legPatch(side: Side, solution: LegSolution): Partial<ModelPose> {
  const limit = (value: number, min: number, max: number) => clamp(Number(value.toFixed(2)), min, max)
  return side === -1
    ? {
        leftLeg: limit(solution.hip, -30, 120),
        leftLegSplay: limit(solution.splay, -45, 45),
        leftKnee: limit(solution.knee, 0, 135),
      }
    : {
        rightLeg: limit(solution.hip, -30, 120),
        rightLegSplay: limit(solution.splay, -45, 45),
        rightKnee: limit(solution.knee, 0, 135),
      }
}
