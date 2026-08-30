import * as THREE from 'three'

/** Geometry contract for the shipped MakeHuman actor after 1.82 m normalization. */
export const STUDIO_HAIR_CAP = {
  radius: 0.13,
  thetaLength: Math.PI * 0.43,
  scale: new THREE.Vector3(0.86, 1, 0.94),
} as const

/** The shipped actor's face points toward -Z, not Three.js' common +Z assumption. */
export function studioEyeAnchor(headPosition: THREE.Vector3, modelTop: number) {
  return new THREE.Vector3(headPosition.x, modelTop - 0.126, headPosition.z - 0.062)
}

export function studioHairAnchor(headPosition: THREE.Vector3, modelTop: number) {
  return new THREE.Vector3(headPosition.x, modelTop - 0.118, headPosition.z + 0.022)
}
