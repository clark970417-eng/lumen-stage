import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveShutter, exposureGain, flashEquivalentOutput, cameraExposure } from '../src/exposure.ts'
import { illuminanceAt, syncTransmission, onAxisIntensity } from '../src/photometry.ts'

test('one stop of ISO, aperture, shutter and ND has the correct linear exposure ratio', () => {
  assert.equal(exposureGain(200, 4, 125, 0), 2)
  assert.ok(Math.abs(exposureGain(100, 4 / Math.SQRT2, 125, 0) - 2) < 1e-12)
  assert.equal(exposureGain(100, 4, 250, 0), 0.5)
  assert.equal(exposureGain(100, 4, 125, 1), 0.5)
  assert.equal(effectiveShutter({ cameraMode: 'cinema', frameRate: 24, shutterAngle: 180, shutter: 125 }), 48)
})

test('slower shutter increases continuous exposure but preserves a complete flash, including mixed light', () => {
  const capture = (shutter: number) => ({
    flash: flashEquivalentOutput(2, shutter, syncTransmission(1 / shutter, 1 / 250, false)) * exposureGain(100, 4, shutter, 0),
    continuous: 100 * exposureGain(100, 4, shutter, 0),
  })
  const fast = capture(250), slow = capture(125)
  assert.equal(slow.flash, fast.flash)
  assert.equal(slow.continuous, fast.continuous * 2)
  assert.equal(capture(500).flash, fast.flash / 2)
})

test('doubling power doubles illuminance and doubling far-field distance quarters it', () => {
  const geometry = { area: false, width: 0.1, height: 0.1, beamDegrees: 60, concentration: 1 }
  const value = illuminanceAt(1000, geometry, 2, 0)
  assert.equal(illuminanceAt(2000, geometry, 2, 0), value * 2)
  assert.equal(illuminanceAt(1000, geometry, 4, 0), value / 4)
})

test('EV100 normalization uses the same camera exposure in preview and export', () => {
  assert.equal(cameraExposure(100, 4, 125, 0), 1 / 2400)
  assert.equal(cameraExposure(800, 4, 125, 0), 8 / 2400)
  assert.equal(cameraExposure(100, 4, 125, 3), 1 / 19200)
})

test('clipping the beam with a grid cannot increase on-axis intensity', () => {
  const optic = { area: true, width: 1, height: 1, beamDegrees: 80, concentration: 1 }
  assert.equal(onAxisIntensity(1000, { ...optic, beamDegrees: 20 }), onAxisIntensity(1000, optic))
  assert.ok(onAxisIntensity(700, { ...optic, beamDegrees: 20 }) < onAxisIntensity(1000, optic))
  const farField = illuminanceAt(1000, optic, 100, 0) * 10000
  assert.ok(Math.abs(farField / onAxisIntensity(1000, optic) - 1) < 0.001)
})
