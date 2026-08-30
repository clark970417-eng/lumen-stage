import * as THREE from 'three'

export const STUDIO_HAIR_SOURCE_URL = '/models/lumen-human/hair/short04.obj'
export const STUDIO_HAIR_SOURCE_SCALE = 0.12

/** The shipped actor's face points toward -Z, not Three.js' common +Z assumption. */
export function studioEyeAnchor(headPosition: THREE.Vector3, modelTop: number) {
  return new THREE.Vector3(headPosition.x, modelTop - 0.126, headPosition.z - 0.066)
}

export function studioHairAnchor(headPosition: THREE.Vector3, modelTop: number) {
  return new THREE.Vector3(headPosition.x, modelTop - 0.105, headPosition.z + 0.005)
}
