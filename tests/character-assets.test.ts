import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { appearanceIsBaked, ROCKETBOX_BUSINESS_FEMALE_URL, ROCKETBOX_BUSINESS_MALE_URL, ROCKETBOX_FEMALE_URL, ROCKETBOX_MALE_URL, shippedHumanFor } from '../src/characterAssets.ts'
import { PHYSIQUE_PRESETS } from '../src/physique.ts'

function readGlbJson(url: string) {
  const glb = readFileSync(`public${url}`)
  assert.equal(glb.toString('ascii', 0, 4), 'glTF')
  const jsonLength = glb.readUInt32LE(12)
  return JSON.parse(glb.subarray(20, 20 + jsonLength).toString())
}

test('the wardrobe picks an actor, because these actors wear their clothes', () => {
  // Their clothing is painted into the body map, so a garment is not something
  // that can be put on somebody — it is somebody else. Anything tailored brings
  // out the business pair; everything else is the everyday pair.
  for (const outfit of ['suit', 'coat', 'shirt'] as const) {
    assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.average, outfit), ROCKETBOX_BUSINESS_FEMALE_URL, outfit)
    assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.athletic, outfit), ROCKETBOX_BUSINESS_MALE_URL, outfit)
  }
  for (const outfit of ['dress', 'gown', 'activewear', 'tank', 'tshirt'] as const) {
    assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.average, outfit), ROCKETBOX_FEMALE_URL, outfit)
    assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.athletic, outfit), ROCKETBOX_MALE_URL, outfit)
  }
  // Sex decides which of the pair, and it is the only physique field that does.
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.curvy, 'gown'), ROCKETBOX_FEMALE_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.heavy, 'suit'), ROCKETBOX_BUSINESS_MALE_URL)
})

test('both actors carry their own eyes, lids and brows', () => {
  // The whole reason for the swap: these rigs have real eyes, so the studio
  // does not have to cut a socket into a closed face and park a sphere in it.
  for (const url of [ROCKETBOX_MALE_URL, ROCKETBOX_FEMALE_URL, ROCKETBOX_BUSINESS_MALE_URL, ROCKETBOX_BUSINESS_FEMALE_URL]) {
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

test('the actors whose look is photographed are the ones the appearance controls cannot reach', () => {
  // What the wardrobe and the colour pickers are disabled against. An actor
  // somebody imports themselves is not one of these, and answers whatever its
  // own materials allow.
  assert.ok(appearanceIsBaked(ROCKETBOX_MALE_URL))
  assert.ok(appearanceIsBaked(ROCKETBOX_FEMALE_URL))
  assert.ok(appearanceIsBaked(ROCKETBOX_BUSINESS_MALE_URL))
  assert.ok(appearanceIsBaked(ROCKETBOX_BUSINESS_FEMALE_URL))
  assert.ok(!appearanceIsBaked(null))
  assert.ok(!appearanceIsBaked('/models/someone-elses-import.glb'))
})

test('the shipped actors carry their morph targets sparsely', () => {
  // glTF stores a morph target as a delta for every vertex in the mesh whether
  // it moves or not, and the FBX these came from leaves float noise on most of
  // the rest: 56% of the deltas were exactly zero and another 42% moved less
  // than a micron. That was well over half of every actor file.
  //
  // scripts/shrink-morphs.mjs drops the ones below ten microns and stores the
  // rest as sparse accessors. Re-run the converter without it and this fails.
  for (const url of [ROCKETBOX_MALE_URL, ROCKETBOX_FEMALE_URL, ROCKETBOX_BUSINESS_MALE_URL, ROCKETBOX_BUSINESS_FEMALE_URL]) {
    const gltf = readGlbJson(url)
    const targets = new Set<number>()
    for (const mesh of gltf.meshes as { primitives: { targets?: { POSITION?: number }[] }[] }[]) {
      for (const primitive of mesh.primitives) {
        for (const target of primitive.targets ?? []) {
          if (target.POSITION !== undefined) targets.add(target.POSITION)
        }
      }
    }
    assert.equal(targets.size, 24, `${url} still has its 24 shapes`)
    for (const index of targets) {
      const accessor = gltf.accessors[index]
      assert.equal(accessor.bufferView, undefined, `${url} target ${index} keeps a dense buffer`)
      assert.ok(accessor.sparse, `${url} target ${index} is not sparse`)
      // A face shape moves a small share of a whole body.
      assert.ok(accessor.sparse.count < accessor.count * 0.2, `${url} target ${index} stores ${accessor.sparse.count} of ${accessor.count}`)
    }
  }
})

test('an actor is small enough to be worth downloading', () => {
  // The four of them are what a visitor pays for before anything appears.
  for (const url of [ROCKETBOX_MALE_URL, ROCKETBOX_FEMALE_URL, ROCKETBOX_BUSINESS_MALE_URL, ROCKETBOX_BUSINESS_FEMALE_URL]) {
    const bytes = readFileSync(`public${url}`).length
    assert.ok(bytes < 8 * 1024 * 1024, `${url} is ${(bytes / 1048576).toFixed(1)} MB`)
  }
})
