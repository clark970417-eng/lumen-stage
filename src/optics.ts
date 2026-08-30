export type DepthOfFieldResult = {
  near: number
  far: number | null
  range: number
  hyperfocal: number
}

export type LensOpticsSettings = {
  enabled: boolean
  vignette: number
  distortion: number
  chromaticAberration: number
  breathing: number
}

/** Circle of confusion in millimetres for each supported sensor format. */
export const SENSOR_CIRCLE_OF_CONFUSION = {
  'full-frame': 0.03,
  'aps-c': 0.019,
  mft: 0.015,
} as const

export function breathingAdjustedFocalLength(focalLengthMm: number, focusDistanceM: number, breathing: number, enabled = true) {
  if (!enabled || breathing <= 0) return focalLengthMm
  const closeFocusFactor = Math.max(0, Math.min(1, (10 - focusDistanceM) / 9))
  return focalLengthMm * (1 + (breathing / 100) * closeFocusFactor * 0.12)
}

/** Applies an export-safe approximation of radial distortion, lateral CA and optical vignetting. */
export function applyLensOpticsToCanvas(canvas: HTMLCanvasElement, settings: LensOpticsSettings) {
  if (!settings.enabled || (!settings.vignette && !settings.distortion && !settings.chromaticAberration)) return
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const source = new Uint8ClampedArray(image.data)
  const width = canvas.width
  const height = canvas.height
  const distortion = settings.distortion * 0.0008
  const fringe = settings.chromaticAberration * 0.025
  const vignette = settings.vignette * 0.0065
  const sample = (x: number, y: number, channel: number) => {
    const sx = Math.max(0, Math.min(width - 1, Math.round(x)))
    const sy = Math.max(0, Math.min(height - 1, Math.round(y)))
    return source[(sy * width + sx) * 4 + channel]
  }
  for (let y = 0; y < height; y += 1) {
    const ny = (y / Math.max(1, height - 1)) * 2 - 1
    for (let x = 0; x < width; x += 1) {
      const nx = (x / Math.max(1, width - 1)) * 2 - 1
      const radius2 = nx * nx + ny * ny
      const radialScale = 1 + distortion * radius2
      const sourceX = ((nx * radialScale + 1) * 0.5) * (width - 1)
      const sourceY = ((ny * radialScale + 1) * 0.5) * (height - 1)
      const shiftX = nx * fringe * radius2
      const shiftY = ny * fringe * radius2
      const edge = Math.max(0, Math.min(1, (radius2 - 0.22) / 1.25))
      const falloff = Math.max(0.3, 1 - vignette * edge * edge)
      const target = (y * width + x) * 4
      image.data[target] = sample(sourceX + shiftX, sourceY + shiftY, 0) * falloff
      image.data[target + 1] = sample(sourceX, sourceY, 1) * falloff
      image.data[target + 2] = sample(sourceX - shiftX, sourceY - shiftY, 2) * falloff
      image.data[target + 3] = source[target + 3]
    }
  }
  context.putImageData(image, 0, 0)
}

/** Depth-of-field approximation; circle of confusion defaults to full frame. */
export function calculateDepthOfField(
  focalLengthMm: number,
  aperture: number,
  focusDistanceM: number,
  circleOfConfusionMm = 0.03,
): DepthOfFieldResult {
  const subjectMm = Math.max(100, focusDistanceM * 1000)
  const hyperfocalMm = (focalLengthMm * focalLengthMm) / (aperture * circleOfConfusionMm) + focalLengthMm
  const nearMm = (hyperfocalMm * subjectMm) / (hyperfocalMm + subjectMm - focalLengthMm)
  const farDenominator = hyperfocalMm - subjectMm + focalLengthMm
  const farMm = farDenominator > 0 ? (hyperfocalMm * subjectMm) / farDenominator : null
  const near = nearMm / 1000
  const far = farMm === null ? null : farMm / 1000
  const range = far === null ? 8 : Math.max(0.08, far - near)

  return {
    near,
    far,
    range,
    hyperfocal: hyperfocalMm / 1000,
  }
}
