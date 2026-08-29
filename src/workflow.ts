import { create } from 'zustand'

export type WorkflowStage = 'intent' | 'blocking' | 'lighting' | 'framing' | 'verify'

type WorkflowState = {
  stage: WorkflowStage
  assetDrawerOpen: boolean
  referencePanelOpen: boolean
  continuityPanelOpen: boolean
  setStage: (stage: WorkflowStage) => void
  setAssetDrawerOpen: (open: boolean) => void
  setReferencePanelOpen: (open: boolean) => void
  setContinuityPanelOpen: (open: boolean) => void
}

export const useWorkflow = create<WorkflowState>((set) => ({
  stage: 'lighting',
  assetDrawerOpen: false,
  referencePanelOpen: false,
  continuityPanelOpen: false,
  setStage: (stage) => set({ stage }),
  setAssetDrawerOpen: (assetDrawerOpen) => set({ assetDrawerOpen }),
  setReferencePanelOpen: (referencePanelOpen) => set({ referencePanelOpen }),
  setContinuityPanelOpen: (continuityPanelOpen) => set({ continuityPanelOpen }),
}))
