import { create } from 'zustand'

export type PathTracingStatus = 'idle' | 'building' | 'rendering' | 'paused' | 'error'

type RenderProgressState = {
  samples: number
  status: PathTracingStatus
  setSamples: (samples: number) => void
  setStatus: (status: PathTracingStatus) => void
  reset: (status?: PathTracingStatus) => void
}

/** High-frequency render telemetry lives outside the editable scene store. */
export const useRenderProgress = create<RenderProgressState>((set) => ({
  samples: 0,
  status: 'idle',
  setSamples: (samples) => set({ samples }),
  setStatus: (status) => set({ status }),
  reset: (status = 'idle') => set({ samples: 0, status }),
}))
