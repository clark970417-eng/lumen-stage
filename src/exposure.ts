/** Reciprocal seconds, shared by the renderer and flash integration. */
export function effectiveShutter(camera: { cameraMode: string; frameRate: number; shutterAngle: number; shutter: number }) {
  return camera.cameraMode === 'cinema' ? camera.frameRate * 360 / camera.shutterAngle : camera.shutter
}

/** Linear exposure relative to ISO 100, f/4 and 1/125 s. Apply exactly once. */
export function exposureGain(iso: number, aperture: number, shutter: number, ndStops: number) {
  return (iso / 100) * (125 / shutter) * (16 / (aperture * aperture)) * Math.pow(2, -ndStops)
}

/** Integrated flash energy expressed as an equivalent steady source. */
export function flashEquivalentOutput(fluxSeconds: number, shutter: number, transmission: number) {
  return fluxSeconds * shutter * transmission
}

/**
 * Saturation-based EV100 normalization: 1 / (1.2 * 2^EV100).
 * ISO 100, f/4, 1/125 s gives 1/2400; ND multiplies transmission.
 * Reference: https://google.github.io/filament/Filament.md.html#imagingpipeline/physicallybasedcamera/exposure
 */
export function cameraExposure(iso: number, aperture: number, shutter: number, ndStops: number) {
  return exposureGain(iso, aperture, shutter, ndStops) / 2400
}
