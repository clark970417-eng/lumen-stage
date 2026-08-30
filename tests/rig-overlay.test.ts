import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { rigOverlayPoints, type RigOverlayPoints } from '../src/rigOverlay.ts'

const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

function fallbackPoints(): RigOverlayPoints {
  return {
    hips: point(0, 0.98, 0), chest: point(0, 1.42, 0), neck: point(0, 1.58, 0), head: point(0, 1.70, 0),
    leftShoulder: point(-0.19, 1.48, 0), rightShoulder: point(0.19, 1.48, 0),
    leftElbow: point(-0.28, 1.17, 0), rightElbow: point(0.28, 1.17, 0),
    leftWrist: point(-0.31, 0.88, 0), rightWrist: point(0.31, 0.88, 0),
    leftHip: point(-0.10, 0.96, 0), rightHip: point(0.10, 0.96, 0),
    leftKnee: point(-0.11, 0.51, 0), rightKnee: point(0.11, 0.51, 0),
    leftAnkle: point(-0.11, 0.07, 0), rightAnkle: point(0.11, 0.07, 0),
  }
}

test('imported pose handles use the rendered bone positions in figure-local space', () => {
  const rigRoot = new THREE.Group()
  rigRoot.position.set(4, 0.35, -2)
  rigRoot.rotation.y = 0.7
  rigRoot.scale.setScalar(1.25)

  const hips = new THREE.Bone()
  hips.position.set(0.08, 0.96, 0.03)
  const leftUpperLeg = new THREE.Bone()
  leftUpperLeg.position.set(-0.13, -0.02, 0.01)
  const leftLowerLeg = new THREE.Bone()
  leftLowerLeg.position.set(0.02, -0.49, 0.04)
  const leftFoot = new THREE.Bone()
  leftFoot.position.set(0.01, -0.46, 0.02)
  hips.add(leftUpperLeg)
  leftUpperLeg.add(leftLowerLeg)
  leftLowerLeg.add(leftFoot)
  rigRoot.add(hips)
  rigRoot.updateMatrixWorld(true)

  const fallback = fallbackPoints()
  const points = rigOverlayPoints({ hips, leftUpperLeg, leftLowerLeg, leftFoot }, rigRoot, fallback)

  assert.ok(points.hips.distanceTo(new THREE.Vector3(0.08, 0.96, 0.03)) < 1e-7)
  assert.ok(points.leftHip.distanceTo(new THREE.Vector3(-0.05, 0.94, 0.04)) < 1e-7)
  assert.ok(points.leftKnee.distanceTo(new THREE.Vector3(-0.03, 0.45, 0.08)) < 1e-7)
  assert.ok(points.leftAnkle.distanceTo(new THREE.Vector3(-0.02, -0.01, 0.10)) < 1e-7)
  assert.ok(points.rightKnee.distanceTo(fallback.rightKnee) < 1e-7)
})
