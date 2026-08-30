import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { EYE_DEPTH_BELOW_CROWN, STUDIO_HAIR_SOURCE_SCALE, STUDIO_HAIR_SOURCE_URL, studioEyeAnchor, studioHairAnchor, studioHairResponse, studioSkinResponse } from '../src/studioHumanDetails.ts'

test('shipped human eyeballs sit behind the measured eyelid, not in front of it', () => {
  // Both shipped actors, as measured from their meshes: the male's eyelid sits
  // at z -0.124 and the female's at -0.168, while their head bones are 3 cm
  // apart in depth. One offset from the bone could not place both.
  const male = studioEyeAnchor(-0.124, 1.82)
  const female = studioEyeAnchor(-0.168, 1.82)

  assert.ok(male.z > -0.124, 'the eyeball centre is behind the eyelid, not out in front of the nose')
  assert.ok(female.z > -0.168, 'the eyeball centre is behind the eyelid, not out in front of the nose')
  assert.ok(male.z - -0.124 < 0.02, 'and only just behind it, or the iris never reaches the socket')
  assert.ok(female.z - -0.168 < 0.02, 'and only just behind it, or the iris never reaches the socket')
  // A deeper-set face pushes its eyes further forward, one for one.
  assert.ok(Math.abs((male.z - female.z) - 0.044) < 1e-9, 'the anchor tracks the face it measured')
  assert.ok(Math.abs(male.y - (1.82 - EYE_DEPTH_BELOW_CROWN)) < 1e-9, 'eye height is the calibrated depth below the crown')
  assert.ok(male.y > 1.68 && male.y < 1.73, 'and stays somewhere a pupil could plausibly be')
})

test('shipped human hair stays on the face-facing side of the head bone', () => {
  const head = new THREE.Vector3(0, 1.672, -0.090)
  assert.ok(studioHairAnchor(head, 1.82).z < head.z)
})

test('runtime hair is a compact CC0 MakeHuman mesh, not a procedural helmet', () => {
  assert.equal(STUDIO_HAIR_SOURCE_URL, '/models/lumen-human/hair/short04.obj')
  assert.ok(STUDIO_HAIR_SOURCE_SCALE > 0 && STUDIO_HAIR_SOURCE_SCALE < 0.2)
  const source = readFileSync(new URL('../public/models/lumen-human/hair/short04.obj', import.meta.url), 'utf8')
  assert.match(source, /explicitly released as CC0/i)
  assert.ok(source.split('\n').filter((line) => line.startsWith('v ')).length > 500)
  assert.ok(source.split('\n').filter((line) => line.startsWith('f ')).length > 300)
})

test('skin response cannot become metallic, glassy or mirror-like', () => {
  const dry = studioSkinResponse(35, 0, 45)
  const oily = studioSkinResponse(35, 100, 45)
  assert.ok(dry.roughness >= 0.58)
  assert.ok(dry.normalScale <= 0.2)
  assert.ok(dry.specularIntensity <= 0.32)
  assert.equal(dry.clearcoat, 0)
  assert.ok(oily.clearcoat <= 0.04)
  assert.ok(dry.envMapIntensity <= 0.16)
})

test('hair response keeps directional sheen without a plastic clear coat', () => {
  const glossy = studioHairResponse(100)
  assert.ok(glossy.roughness >= 0.5)
  assert.ok(glossy.sheen <= 0.38)
  assert.ok(glossy.anisotropy <= 0.38)
  assert.ok(glossy.specularIntensity <= 0.36)
})
