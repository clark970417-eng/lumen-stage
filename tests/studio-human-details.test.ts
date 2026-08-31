import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { EYE_DEPTH_BELOW_CROWN, STUDIO_HAIR_SOURCE_SCALE, STUDIO_HAIR_SOURCE_URL, studioEyeAnchor, studioHairAnchor, studioHairPlan, studioHairResponse, studioSkinResponse, bakedActorResponse } from '../src/studioHumanDetails.ts'

test('shipped human eyeballs sit behind the measured eyelid, not in front of it', () => {
  // Both shipped actors, as measured from their meshes: the male's eyelid sits
  // at z -0.124 and the female's at -0.168, while their head bones are 3 cm
  // apart in depth. One offset from the bone could not place both.
  const male = studioEyeAnchor(-0.124, 1.82)
  const female = studioEyeAnchor(-0.168, 1.82)

  assert.ok(male.z < -0.124, 'the eyeball centre is behind the +Z-facing eyelid, not out in front of the nose')
  assert.ok(female.z < -0.168, 'the eyeball centre is behind the +Z-facing eyelid, not out in front of the nose')
  assert.ok(-0.124 - male.z < 0.02, 'and only just behind it, or the iris never reaches the socket')
  assert.ok(-0.168 - female.z < 0.02, 'and only just behind it, or the iris never reaches the socket')
  // A deeper-set face pushes its eyes further forward, one for one.
  assert.ok(Math.abs((male.z - female.z) - 0.044) < 1e-9, 'the anchor tracks the face it measured')
  assert.ok(Math.abs(male.y - (1.82 - EYE_DEPTH_BELOW_CROWN)) < 1e-9, 'eye height is the calibrated depth below the crown')
  assert.ok(male.y > 1.68 && male.y < 1.73, 'and stays somewhere a pupil could plausibly be')
})

test('eye height follows the actor own skull, not one baked-in drop', () => {
  // The two shipped actors normalise to the same 1.82 m but not to the same
  // head: her crown sits 152.4 mm above the head bone and his 148.4 mm. Read
  // as a fixed drop from the crown that difference landed his pupils on the
  // lower lid, so the drop scales with the length it belongs to.
  const female = studioEyeAnchor(0.033, 1.82, 0, 0.1524)
  const male = studioEyeAnchor(0.012, 1.82, 0, 0.14837)

  assert.ok(male.y > female.y, 'a shorter skull puts its eyes higher above the chin, not lower')
  assert.ok(male.y - female.y < 0.006, 'but only by the difference between the two skulls')
  for (const eye of [male, female]) {
    assert.ok(eye.y > 1.69 && eye.y < 1.73, 'both stay somewhere a pupil could plausibly be')
  }
  // No measurement, no scaling: the calibrated constant is the fallback.
  assert.ok(Math.abs(studioEyeAnchor(0.033, 1.82).y - (1.82 - EYE_DEPTH_BELOW_CROWN)) < 1e-9)
  // And a nonsense measurement cannot put an eye on the chin or the crown.
  assert.ok(studioEyeAnchor(0.033, 1.82, 0, 0.6).y >= 1.82 - 0.135)
  assert.ok(studioEyeAnchor(0.033, 1.82, 0, 0.02).y <= 1.82 - 0.095)
})

test('the hair shell caps the crown of the skull it was measured against', () => {
  const head = new THREE.Vector3(0, 1.672, -0.090)
  // Her skull, as measured off the mesh: 185 mm across, 212 mm deep, centred
  // 58 mm behind the origin — nowhere near her head bone's depth.
  const skull = new THREE.Box3(
    new THREE.Vector3(-0.0924, 1.698, -0.1635),
    new THREE.Vector3(0.0924, 1.820, 0.0482),
  )
  const shellHeight = 0.254
  const anchor = studioHairAnchor(head, 1.82, skull, shellHeight)

  // The shell's origin is its own centre, so this is where its top lands.
  const top = anchor.y + shellHeight / 2
  assert.ok(top > 1.82 && top - 1.82 < 0.01, 'the shell sits on the crown, not above or inside it')
  const centre = skull.getCenter(new THREE.Vector3())
  assert.ok(anchor.z < centre.z, 'and a little behind the skull centre, where a hairline starts')
  assert.ok(centre.z - anchor.z < 0.015, 'but not so far back it uncovers the forehead')
  assert.ok(Math.abs(anchor.x - centre.x) < 1e-9, 'centred on the head, not on the body')

  // With nothing measured it still has to land on the face-facing side.
  assert.ok(studioHairAnchor(head, 1.82).z > head.z)
  assert.ok(studioHairAnchor(head, 1.82, skull).z > head.z, 'a skull with no shell height falls back too')
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

test('every hairstyle in the catalogue changes the shipped actors shell', () => {
  const styles = ['short', 'buzz', 'bob', 'long', 'ponytail', 'bun', 'curly', 'afro', 'bald']
  const plans = styles.map((style) => studioHairPlan(style))

  assert.equal(studioHairPlan('bald').margin, 0, 'bald is the one style with no shell at all')
  const wearing = plans.filter((plan) => plan.margin > 0)
  assert.equal(wearing.length, styles.length - 1)

  // The point of the control is that the styles are distinguishable. Two of
  // them rendering the same shell at the same size is the bug this replaced.
  const signatures = new Set(wearing.map((plan) => `${plan.margin}|${plan.lift}|${plan.mass}|${plan.frizz}`))
  assert.equal(signatures.size, wearing.length, 'no two styles resolve to the same shell')

  for (const plan of wearing) {
    assert.ok(plan.margin >= 1 && plan.margin < 1.45, 'a shell smaller than the skull would show scalp through it')
    assert.ok(Math.abs(plan.lift) < 0.03, 'and it stays on the head')
    assert.ok(plan.frizz > 0 && plan.frizz <= 3)
  }
  assert.ok(studioHairPlan('afro').margin > studioHairPlan('buzz').margin, 'volume is what separates these two')
  assert.equal(studioHairPlan('long').mass, 'shoulders')
  assert.equal(studioHairPlan('short').mass, 'none')
  // An unknown style from an old saved project must still render hair.
  assert.ok(studioHairPlan('mullet').margin > 0)
})

test('a photographed actor keeps the finish it shipped with, and moves either side of it', () => {
  // The three skin sliders are the only appearance controls these two can
  // answer, so their range has to be centred on the look already on screen —
  // a control that shifts the default finish the moment it appears is worse
  // than one that does nothing.
  const shipped = bakedActorResponse(55, 18, 40)
  assert.ok(Math.abs(shipped.roughness - 0.68) < 0.01, 'the default is the finish the pair were shipped at')

  const glossy = bakedActorResponse(0, 100, 100)
  const matte = bakedActorResponse(100, 0, 0)
  assert.ok(glossy.roughness < shipped.roughness && shipped.roughness < matte.roughness)
  assert.ok(matte.roughness - glossy.roughness > 0.4, 'and the travel is wide enough to see')
  assert.ok(glossy.clearcoat > 0.1 && matte.clearcoat === 0, 'sebum is a coat over the skin, not part of it')
  assert.ok(glossy.sheen > matte.sheen)

  // Their maps read as already lit, but a low environment return leaves them
  // a silhouette with a shirt faintly visible in it.
  assert.equal(shipped.envMapIntensity, 1)
  assert.ok(shipped.envMapIntensity > studioSkinResponse(55, 18, 40).envMapIntensity)
})
