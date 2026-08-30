import assert from 'node:assert/strict'
import test from 'node:test'
import { automaticLensProfileId } from '../src/cameraProfiles.ts'

test('direct focal control covers ultra-wide through telephoto without lens selection', () => {
  assert.equal(automaticLensProfileId(12), 'mft-12-35')
  assert.equal(automaticLensProfileId(24), 'zoom-24-70')
  assert.equal(automaticLensProfileId(70), 'zoom-24-70')
  assert.equal(automaticLensProfileId(85), 'zoom-70-200')
  assert.equal(automaticLensProfileId(200), 'zoom-70-200')
})
