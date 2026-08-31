import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FEMALE_CASUAL_URL, ROCKETBOX_FEMALE_URL, ROCKETBOX_MALE_URL, shippedHumanFor } from '../src/characterAssets.ts'
import { PHYSIQUE_PRESETS } from '../src/physique.ts'

function readGlbJson(url: string) {
  const glb = readFileSync(`public${url}`)
  assert.equal(glb.toString('ascii', 0, 4), 'glTF')
  const jsonLength = glb.readUInt32LE(12)
  return JSON.parse(glb.subarray(20, 20 + jsonLength).toString())
}

test('every wardrobe choice routes to the Rocketbox actor for that sex', () => {
  // The Rocketbox pair dress themselves — their clothing is painted into the
  // body map — so the wardrobe no longer selects a file. It still drives
  // fabric response, and the outfit-specific MakeHuman actors are kept in the
  // registry for when a matching Rocketbox avatar is chosen for each.
  for (const outfit of ['dress', 'gown', 'activewear', 'tank', 'tshirt', 'shirt', 'suit', 'coat'] as const) {
    assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.average, outfit), ROCKETBOX_FEMALE_URL)
  }
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.curvy, 'gown'), ROCKETBOX_FEMALE_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS['athletic-f'], 'activewear'), ROCKETBOX_FEMALE_URL)
})

test('the masculine actor is the Rocketbox male whatever the wardrobe says', () => {
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.athletic, 'suit'), ROCKETBOX_MALE_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.athletic, 'dress'), ROCKETBOX_MALE_URL)
})

test('both actors carry their own eyes, lids and brows', () => {
  // The whole reason for the swap: these rigs have real eyes, so the studio
  // does not have to cut a socket into a closed face and park a sphere in it.
  for (const url of [ROCKETBOX_MALE_URL, ROCKETBOX_FEMALE_URL]) {
    const gltf = readGlbJson(url)
    const joints = new Set<number>(gltf.skins.flatMap((skin: { joints: number[] }) => skin.joints))
    const names: string[] = gltf.nodes.map((node: { name?: string }) => node.name ?? '')
    const targetNames: string[] = gltf.meshes.flatMap((mesh: { extras?: { targetNames?: string[] } }) => mesh.extras?.targetNames ?? [])
    assert.equal(joints.size, 80)
    assert.equal(targetNames.length, 24)
    for (const bone of ['Bip01_LEye', 'Bip01_REye', 'Bip01_LEyeBlinkTop', 'Bip01_REyeBlinkBottom', 'Bip01_LOuterEyebrow']) {
      assert.ok(names.includes(bone), `${url} is missing ${bone}`)
    }
    assert.ok(targetNames.some((name) => name.includes('EyeBlinkLeft')))
    assert.ok(targetNames.some((name) => name.includes('EyeBlinkRight')))
  }
})

test('the casual female actor ships the expected MakeHuman rig and motion library', () => {
  const gltf = readGlbJson(FEMALE_CASUAL_URL)
  const joints = new Set<number>(gltf.skins.flatMap((skin: { joints: number[] }) => skin.joints))
  assert.equal(joints.size, 53)
  assert.deepEqual(gltf.animations.map((animation: { name: string }) => animation.name).sort(), ['idle', 'run', 'walk', 'wave'])
})
