import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FEMALE_ACTIVEWEAR_URL, FEMALE_CASUAL_URL, FEMALE_DRESS_URL, FEMALE_GOWN_URL, SUITED_HUMAN_URL, shippedHumanFor } from '../src/characterAssets.ts'
import { PHYSIQUE_PRESETS } from '../src/physique.ts'

function readGlbJson(url: string) {
  const glb = readFileSync(`public${url}`)
  assert.equal(glb.toString('ascii', 0, 4), 'glTF')
  const jsonLength = glb.readUInt32LE(12)
  return JSON.parse(glb.subarray(20, 20 + jsonLength).toString())
}

test('feminine wardrobe choices route to matching rigged GLB actors', () => {
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.average, 'dress'), FEMALE_DRESS_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.curvy, 'gown'), FEMALE_GOWN_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS['athletic-f'], 'activewear'), FEMALE_ACTIVEWEAR_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.average, 'tank'), FEMALE_ACTIVEWEAR_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.average, 'tshirt'), FEMALE_CASUAL_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.average, 'shirt'), FEMALE_CASUAL_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.average, 'suit'), FEMALE_CASUAL_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.average, 'coat'), FEMALE_CASUAL_URL)
})

test('the fixed suited GLB remains the masculine actor', () => {
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.athletic, 'suit'), SUITED_HUMAN_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.athletic, 'dress'), SUITED_HUMAN_URL)
})

test('the casual female actor ships the expected MakeHuman rig and motion library', () => {
  const gltf = readGlbJson(FEMALE_CASUAL_URL)
  const joints = new Set<number>(gltf.skins.flatMap((skin: { joints: number[] }) => skin.joints))
  assert.equal(joints.size, 53)
  assert.deepEqual(gltf.animations.map((animation: { name: string }) => animation.name).sort(), ['idle', 'run', 'walk', 'wave'])
})
