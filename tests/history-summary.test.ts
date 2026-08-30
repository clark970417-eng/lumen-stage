import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeHistoryChange } from '../src/historySummary.ts'

const labels = { project: 'project', subject: 'subject', lighting: 'lighting', camera: 'camera', stage: 'stage', scene: 'scene' }
const base = { projectName: 'Test', lights: [{ power: 10 }], modifiers: [], studioObjects: [], modelPosition: [0, 0, 0], modelRotation: 0, modelHeight: 1.82, modelPose: { head: 0 }, posePreset: 'neutral', cameraPosition: [0, 1, 5], cameraTarget: [0, 1, 0], focalLength: 50, aperture: 4, iso: 100, shutter: 125, focusDistance: 5, backdropId: 'white', roomWidth: 8, roomDepth: 10, roomHeight: 3 }

test('history summaries identify the edited area', () => {
  assert.equal(summarizeHistoryChange(base, { ...base, lights: [{ power: 20 }] }, labels), 'lighting')
  assert.equal(summarizeHistoryChange(base, { ...base, focalLength: 85 }, labels), 'camera')
  assert.equal(summarizeHistoryChange(base, { ...base, posePreset: 'walking' }, labels), 'subject')
  assert.equal(summarizeHistoryChange(base, { ...base, roomWidth: 12 }, labels), 'stage')
})
