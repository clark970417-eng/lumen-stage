import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canControlInWorkflow, workflowModeForStage } from '../src/workflowControl.ts'

describe('workflow mode control boundaries', () => {
  it('maps the detailed workflow stages to the three visible modes', () => {
    assert.equal(workflowModeForStage('intent'), 'person')
    assert.equal(workflowModeForStage('blocking'), 'person')
    assert.equal(workflowModeForStage('lighting'), 'lighting')
    assert.equal(workflowModeForStage('framing'), 'camera')
    assert.equal(workflowModeForStage('verify'), 'camera')
  })

  it('only permits controls belonging to the active mode', () => {
    assert.equal(canControlInWorkflow('intent', 'person'), true)
    assert.equal(canControlInWorkflow('intent', 'set'), true)
    assert.equal(canControlInWorkflow('intent', 'light'), false)
    assert.equal(canControlInWorkflow('lighting', 'light'), true)
    assert.equal(canControlInWorkflow('lighting', 'grip'), true)
    assert.equal(canControlInWorkflow('lighting', 'person'), false)
    assert.equal(canControlInWorkflow('framing', 'camera'), true)
    assert.equal(canControlInWorkflow('framing', 'light'), false)
  })
})
