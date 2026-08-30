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
import type { FigureSex, Physique } from './physique.ts'

export { DEFAULT_PHYSIQUE, PHYSIQUE_PRESETS, type FigureSex, type Physique } from './physique.ts'

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

/** Turns the seed into the sculpt's shape sliders. */
export function faceShapeFor(seed: number): FaceShape {
  const draw = (index: number) => {
    const n = Math.sin((seed + 1) * 12.9898 + index * 78.233) * 43758.5453
    return n - Math.floor(n)
  }
  return {
    browRidge: draw(11),
    noseLength: draw(12),
    noseWidth: draw(13),
    noseBridge: draw(14),
    lipFullness: draw(15),
    mouthWidth: draw(16),
    cheekbone: draw(17),
    jawWidth: draw(18),
    chinLength: draw(19),
    eyeDepth: draw(20),
    asymmetry: draw(21) * 2 - 1,
  }
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
    ring(-SEGMENT.pelvisDrop, p.hipHalf * 0.70, p.hipDepth * 0.78, -0.004),
    ring(-SEGMENT.pelvisDrop * 0.55, p.hipHalf * 0.93, p.hipDepth * 1.00, -0.010),
    ring(-SEGMENT.pelvisDrop * 0.20, p.hipHalf * 1.00, p.hipDepth * 1.02, -0.008),
    ring(SEGMENT.torso * 0.06, p.hipHalf, p.hipDepth, -0.004),
    ring(SEGMENT.torso * 0.18, lerp(p.hipHalf, p.waistHalf, 0.62), lerp(p.hipDepth, p.waistDepth, 0.60), 0.002),
    ring(SEGMENT.torso * 0.31, p.waistHalf, p.waistDepth, 0.004),
    ring(SEGMENT.torso * 0.47, lerp(p.waistHalf, p.chestHalf, 0.58), lerp(p.waistDepth, p.chestDepth, 0.62), 0.004),
    ring(SEGMENT.torso * 0.64, p.chestHalf, p.chestDepth + p.bust, 0.010),
    ring(SEGMENT.torso * 0.80, p.chestHalf * 1.03, p.chestDepth * 0.98, 0.002),
    ring(SEGMENT.torso * 0.92, p.shoulderHalf * 0.94, p.chestDepth * 0.90, -0.004),
    ring(SEGMENT.torso, p.shoulderHalf * 0.72, p.chestDepth * 0.72, -0.010),
    // Above the acromion the trapezius climbs toward the neck. Without these
    // rings the neck meets a flat shelf, which reads as a collar.
    ring(SEGMENT.torso + 0.028, p.shoulderHalf * 0.50, p.chestDepth * 0.58, -0.012),
    ring(SEGMENT.torso + 0.050, p.neck * 1.42, p.neck * 1.50, -0.012),
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
    { t: 0, rx: p.armUpper * 1.02, rz: p.armUpper * 1.04 },
    { t: L * 0.13, rx: p.armUpper * 1.24, rz: p.armUpper * 1.18, cz: -0.004 },
    { t: L * 0.28, rx: p.armUpper * 1.10, rz: p.armUpper * 1.12, cz: -0.005 },
    { t: L * 0.48, rx: p.armUpper * 0.94, rz: p.armUpper * 1.00, cz: -0.003 },
    { t: L * 0.82, rx: p.armUpper * 0.80, rz: p.armUpper * 0.85 },
    { t: L, rx: p.armUpper * 0.68, rz: p.armUpper * 0.74 },
  ]
}

/** Forearm mass sits high — brachioradialis — then tapers hard to the wrist. */
export function forearmRings(p: Resolved): Ring[] {
  const L = SEGMENT.forearm
  return [
    { t: 0, rx: p.armLower * 0.82, rz: p.armLower * 0.88 },
    { t: L * 0.22, rx: p.armLower * 1.10, rz: p.armLower * 1.12 },
    { t: L * 0.58, rx: p.armLower * 0.84, rz: p.armLower * 0.90 },
    { t: L * 0.88, rx: p.armLower * 0.62, rz: p.armLower * 0.74 },
    { t: L, rx: p.armLower * 0.58, rz: p.armLower * 0.70 },
  ]
}

export function thighRings(p: Resolved): Ring[] {
  const L = SEGMENT.thigh
  return [
    { t: 0, rx: p.thigh * 0.92, rz: p.thigh * 0.94 },
    { t: L * 0.13, rx: p.thigh * 1.05, rz: p.thigh * 1.02, cz: 0.004 },
    { t: L * 0.48, rx: p.thigh * 0.84, rz: p.thigh * 0.88, cz: 0.002 },
    { t: L * 0.82, rx: p.thigh * 0.64, rz: p.thigh * 0.70 },
    { t: L, rx: p.thigh * 0.52, rz: p.thigh * 0.57 },
  ]
}

/** Calf belly at 28 % of the shin, then a hard taper into the ankle. */
export function shinRings(p: Resolved): Ring[] {
  const L = SEGMENT.shin
  return [
    { t: 0, rx: p.calf * 0.84, rz: p.calf * 0.88 },
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
    { t: 0, rx: W * 0.48 * jaw, rz: D * 0.48 * jaw, cz: 0.020 },
    { t: 0.028, rx: W * 0.70 * jaw, rz: D * 0.68 * jaw, cz: 0.016 },
    { t: 0.058, rx: W * 0.86 * jaw, rz: D * 0.84 * jaw, cz: 0.010 },
    { t: 0.094, rx: W * 0.94, rz: D * 0.94, cz: 0.004 },
    { t: 0.132, rx: W * 1.02, rz: D * 1.00, cz: 0 },
    { t: 0.166, rx: W * 1.01, rz: D * 0.99, cz: -0.006 },
    { t: 0.196, rx: W * 0.90, rz: D * 0.88, cz: -0.010 },
    { t: 0.219, rx: W * 0.62, rz: D * 0.60, cz: -0.010 },
    { t: HEAD.height, rx: W * 0.24, rz: D * 0.24, cz: -0.008 },
  ]
}

/**
 * A foot, swept heel to toe along the loft's own +Y.
 *
 * `cz` carries the vertical profile once the caller lays the loft down: the
 * ankle end is thick and sits high, the toe end is thin and rests on the floor.
 * Authoring it this way means the sole is flat by construction rather than by
 * an offset that only happens to work at one ankle angle.
 */
export function footRings(width: number): Ring[] {
  const L = SEGMENT.foot
  // Vertical half-thickness at each station, measured from the sole plane.
  const lift = (rz: number) => rz - 0.052
  return [
    { t: 0, rx: width * 0.62, rz: 0.046, cz: lift(0.046) },
    { t: L * 0.10, rx: width * 0.82, rz: 0.052, cz: lift(0.052) },
    { t: L * 0.30, rx: width * 0.92, rz: 0.044, cz: lift(0.044) },
    { t: L * 0.55, rx: width, rz: 0.033, cz: lift(0.033) },
    { t: L * 0.78, rx: width * 0.92, rz: 0.025, cz: lift(0.025) },
    { t: L * 0.93, rx: width * 0.68, rz: 0.018, cz: lift(0.018) },
    { t: L, rx: width * 0.36, rz: 0.013, cz: lift(0.013) },
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

// ---------------------------------------------------------------------------
// The face
// ---------------------------------------------------------------------------

/**
 * A facial feature, expressed as a displacement of the skull surface.
 *
 * Assembling a face out of separate spheres is what makes a generated head read
 * as a toy: every feature has its own silhouette edge, and light breaks at each
 * one. A real face is a single surface, so a brow, a nose and a lip are all the
 * same skin pushed out by different amounts. That is what this models.
 */
type Feature = {
  /** Centre in head-local space: origin at the chin, +Y up, +Z forward. */
  at: [number, number, number]
  /** Falloff radii along X, Y, Z. Outside these the feature has no effect. */
  spread: [number, number, number]
  /** Displacement in metres. Negative carves in. */
  amount: number
  /** Which way the skin moves. Most facial features push forward, not outward. */
  along: 'z' | 'normal' | 'x'
  /** Falloff shape: 2 is a soft blend, 4 is a defined edge. */
  sharpness?: number
}

export type FaceShape = {
  /** 0–1 across the range each slider covers. */
  browRidge: number
  noseLength: number
  noseWidth: number
  noseBridge: number
  lipFullness: number
  mouthWidth: number
  cheekbone: number
  jawWidth: number
  chinLength: number
  eyeDepth: number
  asymmetry: number
}

export const DEFAULT_FACE_SHAPE: FaceShape = {
  browRidge: 0.5, noseLength: 0.5, noseWidth: 0.5, noseBridge: 0.5,
  lipFullness: 0.5, mouthWidth: 0.5, cheekbone: 0.5, jawWidth: 0.5,
  chinLength: 0.5, eyeDepth: 0.5, asymmetry: 0,
}

const span = (value: number, low: number, high: number) => lerp(low, high, clamp(value, 0, 1))

/**
 * The feature set for a face.
 *
 * Positions come from the HEAD landmarks so the sculpted surface and the eyes
 * placed into it cannot drift apart.
 */
function faceFeatures(shape: FaceShape, sex: FigureSex): Feature[] {
  const feminine = sex === 'feminine' ? 1 : sex === 'neutral' ? 0.5 : 0
  const H = HEAD
  const noseTipY = H.noseTipY - span(shape.noseLength, -0.008, 0.010)
  const asym = shape.asymmetry * 0.004
  const features: Feature[] = []

  // --- Brow ridge. Heavier on a masculine skull; it shades the eye socket. ---
  const browOut = span(shape.browRidge, 0.004, 0.013) * lerp(1.15, 0.75, feminine)
  for (const side of [-1, 1]) {
    features.push({
      at: [side * H.eyeX, H.browY + asym * side, H.eyeZ * 0.55],
      spread: [0.040, 0.017, 0.075],
      amount: browOut,
      along: 'z',
      sharpness: 2.4,
    })
  }
  // Glabella, between the brows — flatter than the ridges either side of it.
  features.push({ at: [0, H.browY - 0.002, H.eyeZ * 0.5], spread: [0.014, 0.014, 0.07], amount: browOut * 0.5, along: 'z' })

  // --- Eye sockets. Carved in, which is what gives the eye somewhere to sit. ---
  const socket = -span(shape.eyeDepth, 0.004, 0.011)
  for (const side of [-1, 1]) {
    features.push({
      at: [side * H.eyeX, H.eyeY - 0.002, H.eyeZ],
      spread: [0.026, 0.017, 0.06],
      amount: socket,
      along: 'z',
      sharpness: 2.2,
    })
  }

  // --- Nose. A bridge that starts at the brow, a ball at the tip, wings. ---
  const bridgeHeight = span(shape.noseBridge, 0.008, 0.020)
  const bridgeTop = H.browY - 0.006
  const stations = 5
  for (let i = 0; i <= stations; i++) {
    const k = i / stations
    const y = lerp(bridgeTop, noseTipY, k)
    // The bridge is narrowest at the root and widens toward the tip.
    const width = lerp(0.009, 0.014, k) * span(shape.noseWidth, 0.85, 1.25)
    features.push({
      at: [0, y, H.eyeZ * 0.85],
      spread: [width, 0.016, 0.075],
      amount: lerp(bridgeHeight * 0.55, bridgeHeight, k * k),
      along: 'z',
      sharpness: 3,
    })
  }
  // The tip itself: a ball, slightly below the last bridge station.
  features.push({
    at: [0, noseTipY - 0.004, H.eyeZ * 0.9],
    spread: [0.014 * span(shape.noseWidth, 0.85, 1.3), 0.014, 0.07],
    amount: bridgeHeight * 1.15,
    along: 'z',
    sharpness: 2.6,
  })
  // Wings.
  for (const side of [-1, 1]) {
    features.push({
      at: [side * 0.0125 * span(shape.noseWidth, 0.85, 1.35), noseTipY - 0.008, H.eyeZ * 0.72],
      spread: [0.011, 0.010, 0.06],
      amount: bridgeHeight * 0.72,
      along: 'z',
      sharpness: 2.6,
    })
  }
  // The groove where the wing meets the cheek — small, but it reads.
  for (const side of [-1, 1]) {
    features.push({
      at: [side * 0.023, noseTipY - 0.010, H.eyeZ * 0.7],
      spread: [0.010, 0.012, 0.05],
      amount: -0.0035,
      along: 'z',
      sharpness: 3,
    })
  }

  // --- Mouth. Two lips with a seam between them, and a philtrum above. ---
  const lipOut = span(shape.lipFullness, 0.004, 0.011) * lerp(0.85, 1.15, feminine)
  const mouthHalf = 0.021 * span(shape.mouthWidth, 0.85, 1.25)
  for (let i = -2; i <= 2; i++) {
    const x = (i / 2) * mouthHalf
    // Lips thin toward the corners, which is what stops them reading as a bar.
    const taper = 1 - Math.abs(i / 2) ** 2 * 0.55
    features.push({ at: [x, H.mouthY + 0.006, H.mouthZ * 0.9], spread: [mouthHalf * 0.55, 0.008, 0.05], amount: lipOut * 0.85 * taper, along: 'z', sharpness: 3 })
    features.push({ at: [x, H.mouthY - 0.006, H.mouthZ * 0.9], spread: [mouthHalf * 0.55, 0.009, 0.05], amount: lipOut * taper, along: 'z', sharpness: 3 })
  }
  // The seam.
  features.push({ at: [0, H.mouthY, H.mouthZ], spread: [mouthHalf * 1.25, 0.0035, 0.05], amount: -0.0045, along: 'z', sharpness: 4 })
  // Philtrum: a shallow channel from the nose base to the lip.
  features.push({ at: [0, (noseTipY + H.mouthY) / 2 + 0.004, H.mouthZ * 0.95], spread: [0.006, 0.012, 0.05], amount: -0.0026, along: 'z', sharpness: 3 })
  // The crease under the lower lip.
  features.push({ at: [0, H.mouthY - 0.016, H.mouthZ * 0.92], spread: [mouthHalf * 0.9, 0.006, 0.05], amount: -0.0032, along: 'z', sharpness: 3 })

  // --- Cheekbones, jaw and chin. ---
  const cheek = span(shape.cheekbone, 0.003, 0.012)
  for (const side of [-1, 1]) {
    features.push({
      at: [side * H.cheekX, H.cheekY + 0.012, H.cheekZ],
      spread: [0.034, 0.024, 0.055],
      amount: cheek,
      along: 'normal',
      sharpness: 2,
    })
    // The hollow under it. Without this the cheekbone has nothing to read against.
    features.push({
      at: [side * (H.cheekX + 0.004), H.cheekY - 0.024, H.cheekZ * 0.85],
      spread: [0.026, 0.020, 0.05],
      amount: -cheek * 0.55,
      along: 'normal',
      sharpness: 2,
    })
    features.push({
      at: [side * 0.056, H.chinY + 0.030, 0.006],
      spread: [0.030, 0.034, 0.055],
      amount: span(shape.jawWidth, -0.002, 0.008) * lerp(0.8, 1.25, 1 - feminine),
      along: 'x',
      sharpness: 2,
    })
  }
  features.push({
    at: [0, H.chinY + span(shape.chinLength, 0.010, -0.002), H.chinZ],
    spread: [0.020, 0.020, 0.055],
    amount: span(shape.chinLength, 0.003, 0.011),
    along: 'z',
    sharpness: 2.4,
  })

  return features
}

/** Smooth, compact falloff. Zero and flat at the edge, so features blend. */
function falloff(dx: number, dy: number, dz: number, spread: [number, number, number], sharpness: number) {
  const q = (dx / spread[0]) ** 2 + (dy / spread[1]) ** 2 + (dz / spread[2]) ** 2
  if (q >= 1) return 0
  return (1 - q) ** sharpness
}

/** Adds intermediate rings so the displacement has vertices to move. */
function resampleRings(rings: Ring[], count: number): Ring[] {
  const total = rings[rings.length - 1].t
  const output: Ring[] = []
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * total
    let a = rings[0]
    let b = rings[rings.length - 1]
    for (let j = 0; j < rings.length - 1; j++) {
      if (t >= rings[j].t && t <= rings[j + 1].t) { a = rings[j]; b = rings[j + 1]; break }
    }
    const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
    output.push({
      t,
      rx: lerp(a.rx, b.rx, k),
      rz: lerp(a.rz, b.rz, k),
      cx: lerp(a.cx ?? 0, b.cx ?? 0, k),
      cz: lerp(a.cz ?? 0, b.cz ?? 0, k),
    })
  }
  return output
}

/**
 * The head as one continuous sculpted surface.
 *
 * The skull is lofted, then every vertex is pushed by the features that reach
 * it. One mesh, one silhouette, one set of normals — which is the whole point:
 * a key light now rakes across a brow and down a nose instead of hitting six
 * separate balls.
 */
export function sculptedHead(shape: FaceShape, sex: FigureSex, jawSet: number) {
  const rings = resampleRings(headRings(jawSet), 46)
  const geometry = loft(rings, { segments: 56, up: true })
  const features = faceFeatures(shape, sex)

  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  const vertex = new THREE.Vector3()
  const normal = new THREE.Vector3()

  // Provisional normals, needed for the features that push along the surface.
  geometry.computeVertexNormals()
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i)
    normal.fromBufferAttribute(normals, i)
    let dz = 0
    let dn = 0
    let dx = 0
    for (const feature of features) {
      const weight = falloff(
        vertex.x - feature.at[0],
        vertex.y - feature.at[1],
        vertex.z - feature.at[2],
        feature.spread,
        feature.sharpness ?? 2,
      )
      if (weight === 0) continue
      if (feature.along === 'z') dz += feature.amount * weight
      else if (feature.along === 'x') dx += feature.amount * weight * Math.sign(vertex.x || 1)
      else dn += feature.amount * weight
    }
    // Forward-pushed features only apply to the front of the head; without this
    // the brow ridge would also bulge the back of the skull.
    const front = clamp((vertex.z + 0.02) / 0.06, 0, 1)
    position.setXYZ(
      i,
      vertex.x + dx + normal.x * dn,
      vertex.y + normal.y * dn,
      vertex.z + dz * front + normal.z * dn,
    )
  }

  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}


/**
 * Hair as a shell over the skull, bounded by a real hairline.
 *
 * Overlapping capsules give hair a hard silhouette and a seam wherever two of
 * them cross, so this is one surface. The part that matters is where it stops:
 * hair meets the forehead high and the nape low, and a shell that starts at the
 * same height all the way round covers the face like a helmet.
 *
 * So the lower edge is a function of angle — high at the front, low at the back
 * — and the surface is swept between that edge and the crown.
 */
export function hairShell(options: { thickness: number; fall: number; spread: number; jawSet?: number }) {
  const skull = resampleRings(headRings(options.jawSet ?? 0), 40)
  const crownTop = skull[skull.length - 1].t

  /** Skull half-widths at a height, interpolated from the profile. */
  const profileAt = (y: number) => {
    const clamped = clamp(y, skull[0].t, crownTop)
    for (let i = 0; i < skull.length - 1; i++) {
      const a = skull[i]
      const b = skull[i + 1]
      if (clamped >= a.t && clamped <= b.t) {
        const k = b.t === a.t ? 0 : (clamped - a.t) / (b.t - a.t)
        return { rx: lerp(a.rx, b.rx, k), rz: lerp(a.rz, b.rz, k), cz: lerp(a.cz ?? 0, b.cz ?? 0, k) }
      }
    }
    const last = skull[skull.length - 1]
    return { rx: last.rx, rz: last.rz, cz: last.cz ?? 0 }
  }

  const hairline = HEAD.browY + 0.026
  const nape = HEAD.earY - 0.030
  const segments = 48
  const stations = 26
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let row = 0; row <= stations; row++) {
    const v = row / stations
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      // +Z is the face. Front-ness drives how high the hair starts.
      const front = Math.max(0, sin)
      const startY = lerp(nape, hairline, front ** 1.6)
      // Long styles hang below the nape at the back and sides only.
      const hang = options.fall * (1 - front ** 0.7)
      const y = lerp(startY - hang, crownTop, v)

      const profile = profileAt(y)
      // Thickness eases in from the hairline so the edge is not a lip.
      const ease = clamp((y - startY + hang) / 0.06, 0, 1)
      const grow = options.thickness * ease
      // Below the skull the shell keeps going and flares onto the shoulders.
      const below = Math.max(0, startY - hang === y ? 0 : startY - y)
      const flare = 1 + (below / Math.max(0.01, options.fall)) * options.spread

      positions.push(
        cos * (profile.rx + grow) * flare,
        y,
        profile.cz + sin * (profile.rz + grow) * flare - 0.004,
      )
      uvs.push(i / segments, v)
    }
  }

  for (let row = 0; row < stations; row++) {
    for (let i = 0; i < segments; i++) {
      const a = row * (segments + 1) + i
      const b = a + segments + 1
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
