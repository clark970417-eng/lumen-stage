import * as THREE from 'three'
import type { BoneMap, HumanoidBone } from './retarget'
import type { forwardKinematics } from './ik'

export type RigOverlayPoints = ReturnType<typeof forwardKinematics>

const POINT_BONES: Record<keyof RigOverlayPoints, HumanoidBone[]> = {
  hips: ['hips'],
  chest: ['chest', 'spine'],
  neck: ['neck', 'chest'],
  head: ['head'],
  leftShoulder: ['leftShoulder', 'leftUpperArm'],
  rightShoulder: ['rightShoulder', 'rightUpperArm'],
  leftElbow: ['leftLowerArm'],
  rightElbow: ['rightLowerArm'],
  leftWrist: ['leftHand'],
  rightWrist: ['rightHand'],
  leftHip: ['leftUpperLeg'],
  rightHip: ['rightUpperLeg'],
  leftKnee: ['leftLowerLeg'],
  rightKnee: ['rightLowerLeg'],
  leftAnkle: ['leftFoot'],
  rightAnkle: ['rightFoot'],
}

/**
 * Reads the joints from the skeleton actually rendered on screen.
 *
 * Imported people have different limb lengths and rest stances from the
 * procedural solver. The overlay therefore uses real bone positions for its
 * dots and lines while the solver keeps its own normalized coordinates.
 */
export function rigOverlayPoints(map: BoneMap, rigRoot: THREE.Object3D, fallback: RigOverlayPoints): RigOverlayPoints {
  rigRoot.updateWorldMatrix(true, true)
  const result = {} as RigOverlayPoints
  for (const [pointName, slots] of Object.entries(POINT_BONES) as [keyof RigOverlayPoints, HumanoidBone[]][]) {
    const bone = slots.map((slot) => map[slot]).find(Boolean)
    result[pointName] = bone
      ? rigRoot.worldToLocal(bone.getWorldPosition(new THREE.Vector3()))
      : fallback[pointName].clone()
  }
  return result
}

