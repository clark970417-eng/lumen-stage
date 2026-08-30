import * as THREE from 'three'

const assetBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
const assetHref = (path: string) => `${assetBase}${path.replace(/^\/+/, '')}`

export const STUDIO_HAIR_SOURCE_URL = assetHref('models/lumen-human/hair/short04.obj')
export const STUDIO_HAIR_SOURCE_SCALE = 0.108

export function studioSkinResponse(skinRoughness: number, skinOil: number, subsurface: number, age = 28) {
  const rough = THREE.MathUtils.clamp(skinRoughness / 100, 0, 1)
  const ageFactor = THREE.MathUtils.clamp((age - 18) / 62, 0, 1)
  return {
    roughness: THREE.MathUtils.clamp(THREE.MathUtils.lerp(0.62, 0.86, rough) + ageFactor * 0.03, 0.58, 0.9),
    normalScale: 0.2,
    specularIntensity: 0.32,
    clearcoat: THREE.MathUtils.clamp(skinOil / 100, 0, 1) * 0.04,
    clearcoatRoughness: THREE.MathUtils.lerp(0.62, 0.82, rough),
    sheen: THREE.MathUtils.clamp(subsurface / 100, 0, 1) * 0.08,
    sheenRoughness: 0.88,
    envMapIntensity: 0.16,
  }
}

export function studioHairResponse(hairGloss: number) {
  const gloss = THREE.MathUtils.clamp(hairGloss / 100, 0, 1)
  return {
    roughness: THREE.MathUtils.lerp(0.78, 0.5, gloss),
    sheen: THREE.MathUtils.lerp(0.14, 0.38, gloss),
    sheenRoughness: THREE.MathUtils.lerp(0.8, 0.54, gloss),
    anisotropy: THREE.MathUtils.lerp(0.1, 0.38, gloss),
    specularIntensity: THREE.MathUtils.lerp(0.22, 0.36, gloss),
    envMapIntensity: 0.24,
  }
}

/**
 * Where the pupils sit below the crown, on a 1.82 m actor.
 *
 * Measured against the sockets in the render rather than reasoned from
 * proportion, because the proportion was what put the eyeballs on the
 * cheekbones. It is the fallback: a fixed drop only ever fits one skull, and
 * the two shipped actors' crowns sit 4 mm apart above the same head bone —
 * enough to move his pupils onto the lower lid while hers stayed centred.
 */
export const EYE_DEPTH_BELOW_CROWN = 0.1175

/**
 * The same drop as a fraction of crown-to-head-bone, which is the one length
 * on a rigged actor that scales with the skull rather than with the body.
 */
export const EYE_DEPTH_HEAD_FRACTION = 0.771

/** Half the interpupillary distance on that same normalised head. */
export const EYE_HALF_SEPARATION = 0.0311

/**
 * How far the eyeball centre sits behind the measured face surface.
 *
 * Small, because these faces are closed: the eyes are painted onto solid
 * geometry with no socket to sink into, so the eyeball is a prosthetic that
 * has to stand slightly proud to be seen at all. It is measured to put the
 * cornea's apex level with the lid: the sclera reaches 9.4 mm forward of the
 * eyeball centre and the cornea another 3 mm past that.
 */
export const EYEBALL_SET_BACK = 0.0086

/**
 * Which way is out of the face.
 *
 * The shipped actors face +Z — the same way the rig itself faces — so the
 * front of the head is the most positive z at eye height, and everything that
 * sits on the face has to be measured and offset in that direction. This used
 * to be assumed to be −Z, which put both eyeballs a centimetre and a half
 * inside the skull: a portrait showed bare sclera ringed by the painted socket
 * and no iris at all, and the hair sat back far enough to invent a forehead.
 */
export const FACE_FORWARD = 1

/** The band of head, measured down from the crown, that the eyes occupy. */
export const EYE_BAND_HALF_HEIGHT = 0.010

/**
 * Where to sample the face, as a distance either side of the centreline.
 *
 * Inside this the reading would be the nose, which is the most forward part of
 * a face and the least useful place to put an eye.
 */
export const EYE_SAMPLE_X = { min: 0.020, max: 0.043 }

/**
 * Where the eyeballs go, measured off the actor's own face.
 *
 * This used to be a fixed offset from the head bone, and a head bone is
 * wherever the rigger decided to put it: the male export carries his three
 * centimetres further back than the female export carries hers, so no single
 * constant could place both. It placed neither.
 *
 * So the face is measured instead. `faceZ` is the front-most surface at eye
 * height, sampled off the nose centreline, which makes it the eyelid; the
 * eyeball centre goes a cornea's depth behind it, and the cornea then sits
 * just proud of the lid the way a real one does.
 */
export function studioEyeAnchor(faceZ: number, modelTop: number, centreX = 0, crownToHeadBone?: number) {
  const scaled = crownToHeadBone !== undefined && crownToHeadBone > 0
    ? crownToHeadBone * EYE_DEPTH_HEAD_FRACTION
    : EYE_DEPTH_BELOW_CROWN
  const depth = THREE.MathUtils.clamp(scaled, 0.095, 0.135)
  return new THREE.Vector3(centreX, modelTop - depth, faceZ - FACE_FORWARD * EYEBALL_SET_BACK)
}

/**
 * Where the hair shell goes.
 *
 * Centred on the skull rather than hung off the head bone: `skullFrontZ` and
 * `skullBackZ` come from the actor's own mesh, and a scalp shell wants to sit
 * on the middle of that, pulled back a little because a hairline starts behind
 * the brow. Hung off the bone it drifted with whatever depth the rigger chose.
 */
export function studioHairAnchor(headPosition: THREE.Vector3, modelTop: number, skullFrontZ?: number, skullBackZ?: number) {
  const centreZ = skullFrontZ !== undefined && skullBackZ !== undefined
    ? (skullFrontZ + skullBackZ) / 2 - FACE_FORWARD * 0.006
    : headPosition.z + FACE_FORWARD * 0.01
  return new THREE.Vector3(headPosition.x, modelTop - 0.105, centreZ)
}
