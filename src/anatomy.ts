/**
 * Parametric human geometry.
 *
 * Set.A.Light ships a fixed library of scanned people. We generate the body
 * instead, which costs realism in the fine detail but buys something a scan
 * library cannot give you: any physique, at any height, without a download.
 *
 * Every segment is a loft — a stack of elliptical rings swept along the bone.
 * That is what separates a body from a pile of capsules: a thigh is wide and
 * flat at the hip and round at the knee, a calf bulges at a third of its
 * length, a ribcage is deeper than it is wide at the sternum and the reverse
 * at the shoulders. Those changes are exactly what a key light reveals.
 *
 * All figures are authored at 1.82 m and scaled by the caller.
 */

import * as THREE from 'three'

export type Ring = {
  /** Distance along the segment, 0 at the proximal joint. */
  t: number
  /** Half-width across the body's X. */
  rx: number
  /** Half-depth along the body's Z. */
  rz: number
  /** Lateral offset of the ring centre. */
  cx?: number
  /** Fore/aft offset of the ring centre. */
  cz?: number
}

export type FigureSex = 'feminine' | 'masculine' | 'neutral'

export type Physique = {
  sex: FigureSex
  /**
   * Face variation seed, 0–100.
   *
   * Real faces are asymmetric and no two are proportioned alike; a generated
   * one that is perfectly symmetric reads as a mannequin no matter how good the
   * shading is. This drives a small, deterministic set of offsets — eye spacing,
   * brow height, nose length, jaw width, and a left/right asymmetry — so every
   * person in a scene is recognisably a different person.
   */
  face: number
  /** 0 lean … 100 heavy. Adds fat evenly with a waist and hip bias. */
  build: number
  /** 0 untrained … 100 athletic. Adds shoulder, arm and calf mass. */
  muscle: number
  /** −50 … 50, biacromial width against the default for the sex. */
  shoulders: number
  waist: number
  hips: number
  bust: number
}

export const DEFAULT_PHYSIQUE: Physique = { sex: 'feminine', face: 34, build: 42, muscle: 38, shoulders: 0, waist: 0, hips: 0, bust: 0 }

export const PHYSIQUE_PRESETS: Record<string, Physique> = {
  slim: { face: 12, sex: 'feminine', build: 18, muscle: 26, shoulders: -8, waist: -14, hips: -6, bust: -8 },
  editorial: { face: 68, sex: 'feminine', build: 24, muscle: 34, shoulders: 10, waist: -10, hips: -4, bust: -4 },
  average: { face: 34, sex: 'feminine', build: 46, muscle: 36, shoulders: 0, waist: 0, hips: 4, bust: 4 },
  curvy: { face: 51, sex: 'feminine', build: 62, muscle: 32, shoulders: -2, waist: 6, hips: 22, bust: 20 },
  athletic: { face: 79, sex: 'masculine', build: 34, muscle: 78, shoulders: 18, waist: -10, hips: -6, bust: 6 },
  'athletic-f': { face: 23, sex: 'feminine', build: 28, muscle: 74, shoulders: 12, waist: -12, hips: 0, bust: -2 },
  lean: { face: 90, sex: 'masculine', build: 22, muscle: 44, shoulders: 6, waist: -12, hips: -8, bust: -2 },
  heavy: { face: 44, sex: 'masculine', build: 78, muscle: 40, shoulders: 8, waist: 30, hips: 16, bust: 12 },
  neutral: { face: 5, sex: 'neutral', build: 40, muscle: 40, shoulders: 0, waist: 0, hips: 0, bust: 0 },
}

const lerp = THREE.MathUtils.lerp
const clamp = THREE.MathUtils.clamp

/**
 * Builds a closed surface through a stack of elliptical rings.
 *
 * The rings run along local −Y for limbs (proximal joint at the origin, which
 * is where the rotation has to happen) and along +Y for the torso.
 */
export function loft(rings: Ring[], options: { segments?: number; up?: boolean; capStart?: boolean; capEnd?: boolean; startAngle?: number; endAngle?: number } = {}) {
  const segments = options.segments ?? 24
  const sign = options.up ? 1 : -1
  const startAngle = options.startAngle ?? 0
  const endAngle = options.endAngle ?? Math.PI * 2
  const closed = Math.abs(endAngle - startAngle - Math.PI * 2) < 1e-6
  const capStart = (options.capStart ?? true) && closed
  const capEnd = (options.capEnd ?? true) && closed

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const total = rings.length

  rings.forEach((ring, row) => {
    const v = row / (total - 1)
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i / segments) * (endAngle - startAngle)
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      positions.push((ring.cx ?? 0) + cos * ring.rx, sign * ring.t, (ring.cz ?? 0) + sin * ring.rz)
      uvs.push(i / segments, v)
    }
  })

  for (let row = 0; row < total - 1; row++) {
    for (let i = 0; i < segments; i++) {
      const a = row * (segments + 1) + i
      const b = a + segments + 1
      // Winding flips with the sweep direction so normals always point out.
      if (sign > 0) { indices.push(a, b, a + 1, a + 1, b, b + 1) }
      else { indices.push(a, a + 1, b, a + 1, b + 1, b) }
    }
  }

  const capRing = (ring: Ring, rowIndex: number, outward: boolean) => {
    const centre = positions.length / 3
    positions.push(ring.cx ?? 0, sign * ring.t, ring.cz ?? 0)
    uvs.push(0.5, outward ? 1 : 0)
    const base = rowIndex * (segments + 1)
    for (let i = 0; i < segments; i++) {
      if (outward) indices.push(centre, base + i, base + i + 1)
      else indices.push(centre, base + i + 1, base + i)
    }
  }
  if (capStart) capRing(rings[0], 0, sign > 0 ? false : true)
  if (capEnd) capRing(rings[total - 1], total - 1, sign > 0 ? true : false)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Takes the run of a segment between two normalized positions. */
export function sliceRings(rings: Ring[], from: number, to: number): Ring[] {
  const total = rings[rings.length - 1].t
  const lo = from * total
  const hi = to * total
  const sample = (t: number): Ring => {
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i]
      const b = rings[i + 1]
      if (t >= a.t && t <= b.t) {
        const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
        return {
          t,
          rx: lerp(a.rx, b.rx, k),
          rz: lerp(a.rz, b.rz, k),
          cx: lerp(a.cx ?? 0, b.cx ?? 0, k),
          cz: lerp(a.cz ?? 0, b.cz ?? 0, k),
        }
      }
    }
    return { ...rings[rings.length - 1], t }
  }
  const inner = rings.filter((ring) => ring.t > lo && ring.t < hi)
  return [sample(lo), ...inner, sample(hi)]
}

/** Softens the seam where two lofts butt together, so joints read as skin. */
export function jointBall(radius: number, squashY = 1, squashZ = 1) {
  const geometry = new THREE.SphereGeometry(radius, 24, 18)
  geometry.scale(1, squashY, squashZ)
  return geometry
}

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
  pelvisDrop: 0.15,
  /** Hip joint to the acromion. */
  torso: 0.56,
  /** Shoulder line to the chin. */
  neckLength: 0.085,
  clavicle: 0.155,
  upperArm: 0.335,
  forearm: 0.265,
  hand: 0.185,
  thigh: 0.420,
  shin: 0.445,
  foot: 0.260,
  ankleY: 0.075,
}

/**
 * Face variation.
 *
 * Deterministic from the seed — the same figure renders identically every
 * frame, and reloading a saved scene gives back the same face.
 */
export type FaceVariation = {
  eyeSpacing: number
  eyeHeight: number
  browHeight: number
  noseLength: number
  noseWidth: number
  mouthWidth: number
  jawWidth: number
  cheekHeight: number
  /** Left/right offsets. Small — the eye reads 2 mm of asymmetry as "a person". */
  asymmetry: number
}

export function faceVariation(seed: number): FaceVariation {
  // A cheap hash chain: each draw is stable for a given seed and uncorrelated
  // with the others, which is all a variation table needs.
  const draw = (index: number) => {
    const n = Math.sin((seed + 1) * 12.9898 + index * 78.233) * 43758.5453
    return (n - Math.floor(n)) * 2 - 1
  }
  return {
    eyeSpacing: draw(1) * 0.0035,
    eyeHeight: draw(2) * 0.004,
    browHeight: draw(3) * 0.005,
    noseLength: draw(4) * 0.006,
    noseWidth: draw(5) * 0.18,
    mouthWidth: draw(6) * 0.14,
    jawWidth: draw(7) * 0.09,
    cheekHeight: draw(8) * 0.005,
    asymmetry: draw(9) * 0.0022,
  }
}

/** Chin-relative landmarks. Everything on the face is placed from these. */
export const HEAD = {
  /** Chin to crown. */
  height: 0.232,
  halfWidth: 0.077,
  halfDepth: 0.101,
  eyeY: 0.124,
  eyeX: 0.032,
  eyeZ: 0.076,
  browY: 0.146,
  noseBridgeY: 0.122,
  noseTipY: 0.086,
  noseTipZ: 0.098,
  mouthY: 0.046,
  mouthZ: 0.088,
  chinY: 0.014,
  chinZ: 0.072,
  cheekY: 0.098,
  cheekX: 0.052,
  cheekZ: 0.060,
  earY: 0.116,
  earX: 0.073,
  crownY: 0.190,
}

/**
 * Torso, swept from below the seat up to the top of the shoulders.
 *
 * The waist sits at 30 % of the run, not the midpoint — putting it halfway is
 * the single most common tell of a generated body.
 */
export function torsoRings(p: Resolved): Ring[] {
  const run = SEGMENT.torso + SEGMENT.pelvisDrop
  const at = (y: number) => (y + SEGMENT.pelvisDrop) / run
  const ring = (y: number, rx: number, rz: number, cz = 0): Ring => ({ t: at(y) * run, rx, rz, cz })
  return [
    ring(-SEGMENT.pelvisDrop, p.hipHalf * 0.62, p.hipDepth * 0.70, 0.004),
    ring(-SEGMENT.pelvisDrop * 0.62, p.hipHalf * 0.90, p.hipDepth * 0.96, -0.006),
    ring(-SEGMENT.pelvisDrop * 0.20, p.hipHalf * 1.00, p.hipDepth * 1.02, -0.008),
    ring(SEGMENT.torso * 0.06, p.hipHalf, p.hipDepth, -0.004),
    ring(SEGMENT.torso * 0.18, lerp(p.hipHalf, p.waistHalf, 0.62), lerp(p.hipDepth, p.waistDepth, 0.60), 0.002),
    ring(SEGMENT.torso * 0.31, p.waistHalf, p.waistDepth, 0.004),
    ring(SEGMENT.torso * 0.47, lerp(p.waistHalf, p.chestHalf, 0.58), lerp(p.waistDepth, p.chestDepth, 0.62), 0.004),
    ring(SEGMENT.torso * 0.64, p.chestHalf, p.chestDepth + p.bust, 0.010),
    ring(SEGMENT.torso * 0.80, p.chestHalf * 1.03, p.chestDepth * 0.98, 0.002),
    ring(SEGMENT.torso * 0.92, p.shoulderHalf * 0.94, p.chestDepth * 0.90, -0.004),
    ring(SEGMENT.torso, p.shoulderHalf * 0.74, p.chestDepth * 0.74, -0.010),
  ]
}

export function neckRings(p: Resolved): Ring[] {
  return [
    { t: 0, rx: p.neck * 1.34, rz: p.neck * 1.40, cz: -0.008 },
    { t: SEGMENT.neckLength * 0.38, rx: p.neck, rz: p.neck * 1.04 },
    { t: SEGMENT.neckLength * 0.80, rx: p.neck * 0.94, rz: p.neck * 0.98, cz: 0.006 },
    { t: SEGMENT.neckLength, rx: p.neck * 0.90, rz: p.neck * 0.96, cz: 0.010 },
  ]
}

/** Deltoid at the top, a triceps swell, then the elbow. */
export function upperArmRings(p: Resolved): Ring[] {
  const L = SEGMENT.upperArm
  return [
    { t: 0, rx: p.armUpper * 1.20, rz: p.armUpper * 1.22 },
    { t: L * 0.18, rx: p.armUpper * 1.14, rz: p.armUpper * 1.16, cz: -0.004 },
    { t: L * 0.48, rx: p.armUpper * 0.94, rz: p.armUpper * 1.00, cz: -0.003 },
    { t: L * 0.82, rx: p.armUpper * 0.80, rz: p.armUpper * 0.85 },
    { t: L, rx: p.armUpper * 0.76, rz: p.armUpper * 0.80 },
  ]
}

/** Forearm mass sits high — brachioradialis — then tapers hard to the wrist. */
export function forearmRings(p: Resolved): Ring[] {
  const L = SEGMENT.forearm
  return [
    { t: 0, rx: p.armLower * 1.00, rz: p.armLower * 1.04 },
    { t: L * 0.22, rx: p.armLower * 1.10, rz: p.armLower * 1.12 },
    { t: L * 0.58, rx: p.armLower * 0.84, rz: p.armLower * 0.90 },
    { t: L * 0.88, rx: p.armLower * 0.62, rz: p.armLower * 0.74 },
    { t: L, rx: p.armLower * 0.58, rz: p.armLower * 0.70 },
  ]
}

export function thighRings(p: Resolved): Ring[] {
  const L = SEGMENT.thigh
  return [
    { t: 0, rx: p.thigh * 1.06, rz: p.thigh * 1.04 },
    { t: L * 0.16, rx: p.thigh * 1.00, rz: p.thigh * 0.98, cz: 0.004 },
    { t: L * 0.48, rx: p.thigh * 0.84, rz: p.thigh * 0.88, cz: 0.002 },
    { t: L * 0.82, rx: p.thigh * 0.64, rz: p.thigh * 0.70 },
    { t: L, rx: p.thigh * 0.58, rz: p.thigh * 0.62 },
  ]
}

/** Calf belly at 28 % of the shin, then a hard taper into the ankle. */
export function shinRings(p: Resolved): Ring[] {
  const L = SEGMENT.shin
  return [
    { t: 0, rx: p.calf * 1.02, rz: p.calf * 1.00 },
    { t: L * 0.28, rx: p.calf * 1.06, rz: p.calf * 1.18, cz: -0.012 },
    { t: L * 0.58, rx: p.calf * 0.80, rz: p.calf * 0.90, cz: -0.006 },
    { t: L * 0.88, rx: p.calf * 0.50, rz: p.calf * 0.58 },
    { t: L, rx: p.calf * 0.45, rz: p.calf * 0.52 },
  ]
}

/**
 * The skull, built chin-up.
 *
 * A loft rather than a scaled sphere, so the jaw, the cheekbone and the cranium
 * are three separate widths — which is the entire reason short lighting looks
 * different from broad lighting.
 */
export function headRings(jawSet: number): Ring[] {
  const W = HEAD.halfWidth
  const D = HEAD.halfDepth
  const jaw = 1 + clamp(jawSet, -30, 40) / 100 * 0.22
  return [
    { t: 0, rx: W * 0.42 * jaw, rz: D * 0.46 * jaw, cz: 0.020 },
    { t: 0.028, rx: W * 0.62 * jaw, rz: D * 0.66 * jaw, cz: 0.016 },
    { t: 0.058, rx: W * 0.80 * jaw, rz: D * 0.82 * jaw, cz: 0.010 },
    { t: 0.094, rx: W * 0.94, rz: D * 0.94, cz: 0.004 },
    { t: 0.132, rx: W * 1.00, rz: D * 1.00, cz: 0 },
    { t: 0.166, rx: W * 1.00, rz: D * 0.99, cz: -0.006 },
    { t: 0.196, rx: W * 0.90, rz: D * 0.88, cz: -0.010 },
    { t: 0.219, rx: W * 0.62, rz: D * 0.60, cz: -0.010 },
    { t: HEAD.height, rx: W * 0.24, rz: D * 0.24, cz: -0.008 },
  ]
}

/** A foot: a wedge that rises at the heel and flattens at the toe. */
export function footRings(width: number): Ring[] {
  const L = SEGMENT.foot
  return [
    { t: 0, rx: width * 0.70, rz: 0.038 },
    { t: L * 0.16, rx: width * 0.94, rz: 0.044, cz: 0.004 },
    { t: L * 0.46, rx: width, rz: 0.036, cz: 0.006 },
    { t: L * 0.76, rx: width * 0.90, rz: 0.028, cz: 0.004 },
    { t: L * 0.94, rx: width * 0.60, rz: 0.019 },
    { t: L, rx: width * 0.32, rz: 0.013 },
  ]
}

/** The palm block; fingers are added separately so they can curl. */
export function palmRings(scale: number): Ring[] {
  const L = SEGMENT.hand * 0.52
  return [
    { t: 0, rx: 0.028 * scale, rz: 0.018 * scale },
    { t: L * 0.30, rx: 0.039 * scale, rz: 0.020 * scale },
    { t: L * 0.72, rx: 0.043 * scale, rz: 0.019 * scale },
    { t: L, rx: 0.041 * scale, rz: 0.016 * scale },
  ]
}
