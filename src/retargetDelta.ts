import * as THREE from 'three'

/**
 * Reflects a rotation across the body's plane of symmetry, in place.
 *
 * Reflecting a rotation about an axis a by an angle reverses the angle and
 * flips the axis in x, which on a unit quaternion is exactly negating y and z.
 */
export function mirrorAcrossBody(quaternion: THREE.Quaternion) {
  return quaternion.set(quaternion.x, -quaternion.y, -quaternion.z, quaternion.w)
}

/**
 * Applies a pose delta while preserving the imported rig's authored rest roll.
 *
 * `mirrored` is for rigs that number their sides the other way round. A pose
 * delta is a rotation in world space, and a rotation in world space knows
 * nothing about sides: the swing that brings the procedural figure's left arm
 * in across its chest is, to a rig whose left arm is on the other side of the
 * body, the swing that takes that arm out. Symmetric poses survive it because
 * the two errors mirror each other and cancel on the eye; asymmetric ones do
 * not, which is why folding the arms spread them instead. Reflecting the delta
 * first makes the gesture anatomical rather than merely directional.
 */
export function applyWorldPoseDelta(
  output: THREE.Quaternion,
  target: THREE.Quaternion,
  neutralTarget: THREE.Quaternion,
  importedRestWorld: THREE.Quaternion,
  mirrored = false,
) {
  output.copy(target).multiply(neutralTarget.clone().invert())
  if (mirrored) mirrorAcrossBody(output)
  return output.multiply(importedRestWorld)
}

/** Applies a local finger delta without replacing the imported relaxed arc. */
export function applyFingerCurlDelta(output: THREE.Quaternion, importedRestLocal: THREE.Quaternion, degrees: number) {
  const bend = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    THREE.MathUtils.degToRad(-degrees),
  )
  return output.copy(importedRestLocal).multiply(bend)
}
