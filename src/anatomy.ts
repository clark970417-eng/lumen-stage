/**
 * The measurements a body is placed from.
 *
 * This module used to generate the figure as well — every segment a loft of
 * elliptical rings swept along its bone, a sculpted head, a hair shell. That
 * figure has not been rendered since the studio started loading real actors,
 * so the geometry is gone and the numbers are what is left.
 *
 * They are still load-bearing: the pose solver measures every target against
 * them, the drag handles are placed by them, and an imported actor is aimed
 * into a rest stance built from them. Anthropometric rather than invented —
 * biacromial breadth runs about 23 % of stature, chest breadth about 17 %, hip
 * breadth about 19 % — and authored for a 1.82 m figure, scaled by the caller.
 */

import * as THREE from 'three'
import type { Physique } from './physique.ts'

export { DEFAULT_PHYSIQUE, PHYSIQUE_PRESETS, type FigureSex, type Physique } from './physique.ts'

const lerp = THREE.MathUtils.lerp

// ---------------------------------------------------------------------------
// Physique resolution
// ---------------------------------------------------------------------------

/**
 * Half-widths in metres for a 1.82 m figure.
 *
 * These are anthropometric, not invented: biacromial breadth runs about 23 % of
 * stature, chest breadth about 17 %, hip breadth about 19 %. Getting them wrong
 * is immediately visible — a narrow torso on correctly-sized legs reads as a
 * doll, not a person.
 */
type Resolved = {
  shoulderHalf: number
  shoulderJoint: number
  chestHalf: number
  chestDepth: number
  waistHalf: number
  waistDepth: number
  hipHalf: number
  hipDepth: number
  hipJoint: number
  bust: number
  armUpper: number
  armLower: number
  thigh: number
  calf: number
  neck: number
}

export function resolvePhysique(physique: Physique): Resolved {
  const fat = physique.build / 100
  const muscle = physique.muscle / 100
  const feminine = physique.sex === 'feminine' ? 1 : physique.sex === 'neutral' ? 0.5 : 0
  const shoulderTrim = physique.shoulders / 100
  const waistTrim = physique.waist / 100
  const hipTrim = physique.hips / 100
  const bustTrim = physique.bust / 100

  const shoulderHalf = lerp(0.212, 0.192, feminine) + muscle * 0.014 + fat * 0.008 + shoulderTrim * 0.030
  const chestHalf = lerp(0.157, 0.146, feminine) + muscle * 0.010 + fat * 0.018
  const chestDepth = lerp(0.114, 0.104, feminine) + fat * 0.024 + lerp(0, 0.012, feminine) * (0.5 + bustTrim)
  const waistHalf = lerp(0.140, 0.124, feminine) + fat * 0.052 + waistTrim * 0.040 - muscle * 0.007
  const waistDepth = lerp(0.103, 0.094, feminine) + fat * 0.050 + waistTrim * 0.034 - muscle * 0.006
  const hipHalf = lerp(0.166, 0.178, feminine) + fat * 0.034 + hipTrim * 0.036
  const hipDepth = lerp(0.113, 0.120, feminine) + fat * 0.030 + hipTrim * 0.022

  return {
    shoulderHalf,
    // The glenohumeral joint sits inboard of the acromion by roughly an arm radius.
    shoulderJoint: shoulderHalf - 0.032,
    chestHalf,
    chestDepth,
    waistHalf,
    waistDepth,
    hipHalf,
    hipDepth,
    // Femoral heads are about 0.17 m apart regardless of build.
    hipJoint: 0.083 + hipTrim * 0.008,
    bust: lerp(0, 0.030, feminine) * (0.55 + bustTrim * 0.9 + fat * 0.3),
    armUpper: 0.047 + muscle * 0.014 + fat * 0.012,
    armLower: 0.041 + muscle * 0.009 + fat * 0.008,
    thigh: 0.086 + muscle * 0.014 + fat * 0.026 + hipTrim * 0.010,
    calf: 0.057 + muscle * 0.012 + fat * 0.012,
    neck: 0.058 + muscle * 0.006 + fat * 0.006 - lerp(0, 0.006, feminine),
  }
}

// ---------------------------------------------------------------------------
// Segment lengths — metres on a 1.82 m figure
// ---------------------------------------------------------------------------

export const SEGMENT = {
  /** Femoral head height with the legs straight. */
  pelvisY: 0.94,
  /** How far the seat hangs below the hip joint. */
  pelvisDrop: 0.105,
  /** Hip joint to the acromion. */
  torso: 0.56,
  /** Shoulder line to the chin. */
  neckLength: 0.066,
  clavicle: 0.155,
  upperArm: 0.335,
  forearm: 0.265,
  hand: 0.185,
  thigh: 0.420,
  shin: 0.445,
  foot: 0.260,
  ankleY: 0.075,
}

/** Chin-relative landmarks. Everything on the face is placed from these. */
export const HEAD = {
  /** Chin to crown. */
  height: 0.232,
  halfWidth: 0.081,
  halfDepth: 0.101,
  /** Pupils sit at half the chin-to-crown height on every real face. */
  eyeY: 0.118,
  eyeX: 0.032,
  eyeZ: 0.086,
  browY: 0.140,
  noseBridgeY: 0.112,
  noseTipY: 0.070,
  noseTipZ: 0.100,
  mouthY: 0.042,
  mouthZ: 0.098,
  chinY: 0.012,
  chinZ: 0.078,
  cheekY: 0.092,
  cheekX: 0.050,
  cheekZ: 0.066,
  earY: 0.108,
  earX: 0.073,
  crownY: 0.190,
}
