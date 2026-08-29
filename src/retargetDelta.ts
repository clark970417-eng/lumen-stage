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
