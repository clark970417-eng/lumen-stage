import * as THREE from 'three'

export const STUDIO_HAIR_SOURCE_URL = '/models/lumen-human/hair/short04.obj'
export const STUDIO_HAIR_SOURCE_SCALE = 0.12

/**
 * Where the pupils sit below the crown, on a 1.82 m actor.
 *
 * Both shipped actors are the same MakeHuman base topology normalised to the
 * same height, so one figure serves both. Measured against the sockets in the
 * render rather than reasoned from proportion, because the proportion was what
 * put the eyeballs on the cheekbones.
 */
export const EYE_DEPTH_BELOW_CROWN = 0.1126

/** Half the interpupillary distance on that same normalised head. */
export const EYE_HALF_SEPARATION = 0.0311

/**
 * How far the eyeball centre sits behind the measured face surface.
 *
 * Small, because these faces are closed: the eyes are painted onto solid
 * geometry with no socket to sink into, so the eyeball is a prosthetic that
 * has to stand slightly proud to be seen at all.
 */
export const EYEBALL_SET_BACK = 0.005

/** The band of head, measured down from the crown, that the eyes occupy. */
export const EYE_BAND_HALF_HEIGHT = 0.022

/**
 * Where to sample the face, as a distance either side of the centreline.
 *
 * Inside this the reading would be the nose, which is the most forward part of
 * a face and the least useful place to put an eye.
 */
export const EYE_SAMPLE_X = { min: 0.02, max: 0.06 }

/**
 * Where the eyeballs go, measured off the actor's own face.
 *
 * This used to be a fixed offset from the head bone, and a head bone is
 * wherever the rigger decided to put it: the male export carries his three
 * centimetres further back than the female export carries hers, so no single
 * constant could place both. It placed neither. Both actors ended up with
 * their eyeballs several centimetres out in front of their faces, which is
 * why the male read as having none at all — his were in the air ahead of his
 * nose, and at that size, against the backdrop, they simply did not register.
 *
 * So the face is measured instead. `faceZ` is the front-most surface at eye
 * height, sampled off the nose centreline, which makes it the eyelid; the
 * eyeball centre goes a cornea's depth behind it, and the cornea then sits
 * just proud of the lid the way a real one does.
 *
 * The shipped actors face -Z, so "in front" is more negative.
 */
export function studioEyeAnchor(faceZ: number, modelTop: number, centreX = 0) {
  return new THREE.Vector3(centreX, modelTop - EYE_DEPTH_BELOW_CROWN, faceZ + EYEBALL_SET_BACK)
}

export function studioHairAnchor(headPosition: THREE.Vector3, modelTop: number) {
  return new THREE.Vector3(headPosition.x, modelTop - 0.105, headPosition.z + 0.005)
}
