import type { SensorFormat } from './store'

export type CameraBodyId = 'generic-ff' | 'canon-r5' | 'sony-a7iv' | 'nikon-z8' | 'fuji-xt5' | 'panasonic-gh6'
export type LensProfileId = 'zoom-24-70' | 'prime-35' | 'prime-50' | 'prime-85' | 'zoom-70-200' | 'mft-12-35'

export type CameraBodyProfile = { id: CameraBodyId; brand: string; model: string; sensor: SensorFormat; megapixels: number; nativeIso: number; dynamicRange: number; readoutMs: number; noiseFactor: number }
export type LensProfile = {
  id: LensProfileId
  brand: string
  model: string
  minFocal: number
  maxFocal: number
  maxAperture: number
  blades: number
  defaultFocal: number
  vignette: number
  distortion: number
  chromaticAberration: number
  breathing: number
}

export const CAMERA_BODIES: Record<CameraBodyId, CameraBodyProfile> = {
  'generic-ff': { id: 'generic-ff', brand: 'LUMEN', model: 'Generic Full Frame', sensor: 'full-frame', megapixels: 24, nativeIso: 100, dynamicRange: 14, readoutMs: 15, noiseFactor: 1 },
  'canon-r5': { id: 'canon-r5', brand: 'CANON', model: 'EOS R5', sensor: 'full-frame', megapixels: 45, nativeIso: 100, dynamicRange: 14.6, readoutMs: 15.5, noiseFactor: 0.92 },
  'sony-a7iv': { id: 'sony-a7iv', brand: 'SONY', model: 'α7 IV', sensor: 'full-frame', megapixels: 33, nativeIso: 100, dynamicRange: 14.7, readoutMs: 26.8, noiseFactor: 0.86 },
  'nikon-z8': { id: 'nikon-z8', brand: 'NIKON', model: 'Z8', sensor: 'full-frame', megapixels: 45.7, nativeIso: 64, dynamicRange: 14.2, readoutMs: 3.7, noiseFactor: 0.9 },
  'fuji-xt5': { id: 'fuji-xt5', brand: 'FUJIFILM', model: 'X-T5', sensor: 'aps-c', megapixels: 40.2, nativeIso: 125, dynamicRange: 13.4, readoutMs: 20, noiseFactor: 1.16 },
  'panasonic-gh6': { id: 'panasonic-gh6', brand: 'PANASONIC', model: 'Lumix GH6', sensor: 'mft', megapixels: 25.2, nativeIso: 100, dynamicRange: 13.2, readoutMs: 14.2, noiseFactor: 1.28 },
}

export const LENS_PROFILES: Record<LensProfileId, LensProfile> = {
  'zoom-24-70': { id: 'zoom-24-70', brand: 'PRO', model: '24–70mm F2.8', minFocal: 24, maxFocal: 70, maxAperture: 2.8, blades: 11, defaultFocal: 50, vignette: 18, distortion: -8, chromaticAberration: 9, breathing: 8 },
  'prime-35': { id: 'prime-35', brand: 'PRIME', model: '35mm F1.4', minFocal: 35, maxFocal: 35, maxAperture: 1.4, blades: 11, defaultFocal: 35, vignette: 28, distortion: -18, chromaticAberration: 18, breathing: 14 },
  'prime-50': { id: 'prime-50', brand: 'PRIME', model: '50mm F1.2', minFocal: 50, maxFocal: 50, maxAperture: 1.2, blades: 11, defaultFocal: 50, vignette: 24, distortion: -6, chromaticAberration: 14, breathing: 11 },
  'prime-85': { id: 'prime-85', brand: 'PRIME', model: '85mm F1.4', minFocal: 85, maxFocal: 85, maxAperture: 1.4, blades: 9, defaultFocal: 85, vignette: 16, distortion: 5, chromaticAberration: 7, breathing: 5 },
  'zoom-70-200': { id: 'zoom-70-200', brand: 'PRO', model: '70–200mm F2.8', minFocal: 70, maxFocal: 200, maxAperture: 2.8, blades: 11, defaultFocal: 105, vignette: 20, distortion: 8, chromaticAberration: 10, breathing: 4 },
  'mft-12-35': { id: 'mft-12-35', brand: 'MFT', model: '12–35mm F2.8', minFocal: 12, maxFocal: 35, maxAperture: 2.8, blades: 9, defaultFocal: 25, vignette: 26, distortion: -14, chromaticAberration: 16, breathing: 12 },
}
