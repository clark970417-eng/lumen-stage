import assert from 'node:assert/strict'
import test from 'node:test'
import { captureContinuityBaseline, evaluateContinuity, type ContinuityScene } from '../src/continuity.ts'

const light = {
  id: 'key', name: 'Key', enabled: true, powerPercent: 20, position: [-2, 2, 2], targetSubjectId: 'model',
} as ContinuityScene['lights'][number]

const scene: ContinuityScene = {
  focalLength: 50, aperture: 4, iso: 100, shutter: 125,
  cameraPosition: [0, 1.5, 5], modelPosition: [0, 0, 0], lights: [light],
}

test('a matching scene passes continuity', () => {
  const baseline = captureContinuityBaseline(scene)
  assert.deepEqual(evaluateContinuity(baseline, scene), { score: 100, issues: [] })
})

test('reports meaningful exposure and light drift', () => {
  const baseline = captureContinuityBaseline(scene)
  const report = evaluateContinuity(baseline, { ...scene, aperture: 8, lights: [{ ...light, powerPercent: 35, targetSubjectId: undefined }] })
  assert.ok(report.score < 70)
  assert.ok(report.issues.some((issue) => issue.label === 'Exposure triangle'))
  assert.ok(report.issues.some((issue) => issue.detail.includes('tracking')))
})
