import * as THREE from 'three'

/** Applies a pose delta while preserving the imported rig's authored rest roll. */
export function applyWorldPoseDelta(
  output: THREE.Quaternion,
  target: THREE.Quaternion,
  neutralTarget: THREE.Quaternion,
  importedRestWorld: THREE.Quaternion,
) {
  return output.copy(target).multiply(neutralTarget.clone().invert()).multiply(importedRestWorld)
}

/** Applies a local finger delta without replacing the imported relaxed arc. */
export function applyFingerCurlDelta(output: THREE.Quaternion, importedRestLocal: THREE.Quaternion, degrees: number) {
  const bend = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    THREE.MathUtils.degToRad(-degrees),
  )
  return output.copy(importedRestLocal).multiply(bend)
}
