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
 * The eyebrow, in metres on a 1.82 m actor.
 *
 * A brow runs from about 18 mm off the centreline out to 50 mm, sits roughly
 * 16 mm above the pupil at its peak, and is a couple of millimetres of hair
 * standing off the ridge. Laid down as segments, each one placed on the face
 * surface it covers.
 */
export const BROW_SEGMENTS = 13
export const BROW_INNER_X = 0.0125
export const BROW_LENGTH = 0.0295
export const BROW_RISE_ABOVE_EYE = 0.0124
export const BROW_ARCH = 0.0042
export const BROW_OUTER_DROP = 0.0036
export const BROW_THICKNESS = 0.0022
export const BROW_SEGMENT_LENGTH = 0.0023
export const BROW_PROUD_OF_FACE = 0.0012
export const BROW_SAMPLE_RADIUS = 0.006

/**
 * How much wider than the skull the scalp shell sits.
 *
 * Hair has thickness, so a shell scaled to the bare cranium reads as a shaved
 * head with a stain on it. Six per cent is about a centimetre of hair on a
 * grown head, which is the reference the styles below work against.
 */
export const STUDIO_HAIR_SKULL_MARGIN = 1.06

/** The extra mass a style hangs off the back of the scalp shell, if any. */
export type StudioHairMass = 'none' | 'nape' | 'shoulders' | 'tail' | 'knot'

/**
 * What each hairstyle does to the shipped actors' scalp shell.
 *
 * There is one shell — a CC0 MakeHuman short cut — and nine styles in the
 * catalogue, so until now eight of them rendered the ninth. That is not a
 * missing asset so much as a missing interpretation: what a lighting tool
 * needs from a hairstyle is its volume, where its edge falls and what it hangs
 * over, and all three can be driven off the one shell plus a mass behind it.
 *
 * `margin` scales the shell against the measured skull, `lift` raises or drops
 * it against the crown in metres, `mass` is what falls behind, and `frizz`
 * scales the strand normal map, which is what separates a curl from a sheet.
 */
export type StudioHairPlan = {
  margin: number
  lift: number
  mass: StudioHairMass
  frizz: number
  /** Roughness added on top of the gloss control, for a matted style. */
  matte: number
}

const HAIR_PLANS: Record<string, StudioHairPlan> = {
  // Cropped close enough that the scalp reads through it.
  buzz: { margin: 1.012, lift: -0.004, mass: 'none', frizz: 0.7, matte: 0.06 },
  // Off the ears, edge above the collar.
  short: { margin: 1.05, lift: 0.012, mass: 'none', frizz: 1, matte: 0 },
  // Down over the ears, ending at the jaw.
  bob: { margin: 1.07, lift: 0.002, mass: 'nape', frizz: 1, matte: 0 },
  // Over the shoulders, which is what eats a rim light.
  long: { margin: 1.07, lift: 0.004, mass: 'shoulders', frizz: 1.05, matte: 0 },
  // Pulled back off the neck, gathered behind.
  ponytail: { margin: 1.03, lift: 0.008, mass: 'tail', frizz: 0.9, matte: 0 },
  // Pulled back and coiled — the cleanest silhouette in the list.
  bun: { margin: 1.025, lift: 0.008, mass: 'knot', frizz: 0.85, matte: 0 },
  // More volume and a broken surface, so a backlight scatters instead of
  // returning one band.
  curly: { margin: 1.11, lift: 0.006, mass: 'nape', frizz: 2.1, matte: 0.04 },
  afro: { margin: 1.20, lift: 0.004, mass: 'none', frizz: 2.6, matte: 0.06 },
}

export const STUDIO_HAIR_BALD: StudioHairPlan = { margin: 0, lift: 0, mass: 'none', frizz: 0, matte: 0 }

export function studioHairPlan(style: string): StudioHairPlan {
  if (style === 'bald') return STUDIO_HAIR_BALD
  return HAIR_PLANS[style] ?? HAIR_PLANS.short
}

/**
 * Where the centre of the hair shell goes, given the measured skull.
 *
 * Centred on the skull the actor actually has rather than hung off a head bone
 * the two riggers placed three centimetres apart, and capped just over the
 * crown rather than dropped a fixed distance below it — a shell hung from a
 * constant sat in front of the face on whichever actor was authored deeper.
 * `shellHeight` is the fitted shell's own height, which is what turns "cap the
 * crown" into a centre position.
 */
export function studioHairAnchor(headPosition: THREE.Vector3, modelTop: number, skull?: THREE.Box3, shellHeight?: number) {
  if (!skull || shellHeight === undefined || shellHeight <= 0) {
    return new THREE.Vector3(headPosition.x, modelTop - 0.105, headPosition.z + FACE_FORWARD * 0.01)
  }
  const centre = skull.getCenter(new THREE.Vector3())
  // A hairline starts behind the brow, so the shell sits a little back of the
  // skull's own centre of depth.
  return new THREE.Vector3(centre.x, modelTop + 0.004 - shellHeight / 2, centre.z - FACE_FORWARD * 0.008)
}
