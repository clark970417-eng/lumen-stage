import type { WorkflowStage } from './workflow'

export type WorkflowMode = 'person' | 'lighting' | 'camera' | 'layout'
export type WorkflowControlKind = 'person' | 'set' | 'light' | 'grip' | 'camera'

export function workflowModeForStage(stage: WorkflowStage): WorkflowMode {
  if (stage === 'layout') return 'layout'
  if (stage === 'lighting') return 'lighting'
  if (stage === 'framing' || stage === 'verify') return 'camera'
  return 'person'
}

export function canControlInWorkflow(stage: WorkflowStage, kind: WorkflowControlKind) {
  const mode = workflowModeForStage(stage)
  if (mode === 'layout') return true
  if (mode === 'person') return kind === 'person' || kind === 'set'
  if (mode === 'lighting') return kind === 'light' || kind === 'grip'
  return kind === 'camera'
}
