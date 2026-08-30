import * as THREE from 'three'

export const STUDIO_HAIR_SOURCE_URL = '/models/lumen-human/hair/short04.obj'
export const STUDIO_HAIR_SOURCE_SCALE = 0.12

/** The shipped actor's face points toward -Z, not Three.js' common +Z assumption. */
export function studioEyeAnchor(headPosition: THREE.Vector3, modelTop: number) {
  // The MakeHuman head bone sits well behind the facial surface. The previous
  // offset left the sclera inside the head, so only a control handle appeared
  // where the eye should be. Place the sphere centres at the real socket depth;
  // the iris geometry then lands just proud of the eyelids.
  return new THREE.Vector3(headPosition.x, modelTop - 0.126, headPosition.z - 0.135)
}

export function studioHairAnchor(headPosition: THREE.Vector3, modelTop: number) {
  return new THREE.Vector3(headPosition.x, modelTop - 0.105, headPosition.z + 0.005)
}
