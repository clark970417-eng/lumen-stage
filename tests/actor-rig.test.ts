import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { handDirection } from '../src/actorRig.ts'

test('the thumb does not pull a neutral wrist away from the forearm', () => {
  const hand = new THREE.Bone()
  hand.name = 'Bip01_L_Hand'
  const addFinger = (name: string, position: [number, number, number]) => {
    const finger = new THREE.Bone()
    finger.name = name
    finger.position.set(...position)
    hand.add(finger)
  }
  addFinger('Bip01_L_Finger0', [0.5, -0.2, 0.55])
  addFinger('Bip01_L_Finger1', [-0.12, -1, 0])
  addFinger('Bip01_L_Finger2', [-0.04, -1.05, 0])
  addFinger('Bip01_L_Finger3', [0.04, -1.05, 0])
  addFinger('Bip01_L_Finger4', [0.12, -1, 0])
  hand.updateMatrixWorld(true)

  const direction = handDirection(hand)
  assert.ok(direction)
  assert.ok(direction.dot(new THREE.Vector3(0, -1, 0)) > 0.999)
})
