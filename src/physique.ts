export type FigureSex = 'feminine' | 'masculine' | 'neutral'

export type Physique = {
  sex: FigureSex
  /** Adult appearance age. Drives facial soft-tissue detail without changing the authored rig. */
  age?: number
  /** Deterministic face variation seed, 0–100. */
  face: number
  /** 0 lean … 100 heavy. */
  build: number
  /** 0 untrained … 100 athletic. */
  muscle: number
  /** −50 … 50, biacromial width against the default for the sex. */
  shoulders: number
  waist: number
  hips: number
  bust: number
}

export const DEFAULT_PHYSIQUE: Physique = { sex: 'feminine', age: 28, face: 34, build: 42, muscle: 38, shoulders: 0, waist: 0, hips: 0, bust: 0 }

export const PHYSIQUE_PRESETS: Record<string, Physique> = {
  slim: { face: 12, sex: 'feminine', age: 24, build: 18, muscle: 26, shoulders: -8, waist: -14, hips: -6, bust: -8 },
  editorial: { face: 68, sex: 'feminine', age: 27, build: 24, muscle: 34, shoulders: 10, waist: -10, hips: -4, bust: -4 },
  average: { face: 34, sex: 'feminine', age: 32, build: 46, muscle: 36, shoulders: 0, waist: 0, hips: 4, bust: 4 },
  curvy: { face: 51, sex: 'feminine', age: 38, build: 62, muscle: 32, shoulders: -2, waist: 6, hips: 22, bust: 20 },
  athletic: { face: 79, sex: 'masculine', age: 31, build: 34, muscle: 78, shoulders: 18, waist: -10, hips: -6, bust: 6 },
  'athletic-f': { face: 23, sex: 'feminine', age: 29, build: 28, muscle: 74, shoulders: 12, waist: -12, hips: 0, bust: -2 },
  lean: { face: 90, sex: 'masculine', age: 42, build: 22, muscle: 44, shoulders: 6, waist: -12, hips: -8, bust: -2 },
  heavy: { face: 44, sex: 'masculine', age: 54, build: 78, muscle: 40, shoulders: 8, waist: 30, hips: 16, bust: 12 },
  neutral: { face: 5, sex: 'neutral', age: 30, build: 40, muscle: 40, shoulders: 0, waist: 0, hips: 0, bust: 0 },
}
