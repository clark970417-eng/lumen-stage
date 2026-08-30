import test from 'node:test'
import assert from 'node:assert/strict'
import { FEMALE_ACTIVEWEAR_URL, FEMALE_DRESS_URL, FEMALE_GOWN_URL, SUITED_HUMAN_URL, shippedHumanFor } from '../src/characterAssets.ts'
import { PHYSIQUE_PRESETS } from '../src/physique.ts'

test('feminine wardrobe choices route to matching rigged GLB actors', () => {
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.average, 'dress'), FEMALE_DRESS_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.curvy, 'gown'), FEMALE_GOWN_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS['athletic-f'], 'activewear'), FEMALE_ACTIVEWEAR_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.average, 'suit'), FEMALE_ACTIVEWEAR_URL)
})

test('the fixed suited GLB remains the masculine actor', () => {
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.athletic, 'suit'), SUITED_HUMAN_URL)
  assert.equal(shippedHumanFor(PHYSIQUE_PRESETS.athletic, 'dress'), SUITED_HUMAN_URL)
})
