export type ShutterMode = 'mechanical' | 'electronic'

export type SensorSettings = {
  enabled: boolean
  iso: number
  nativeIso: number
  noiseFactor: number
  dynamicRange: number
  noiseReduction: number
  colorNoise: number
  shutter: number
  shutterMode: ShutterMode
  motionBlur: number
  rollingShutter: number
  readoutMs: number
  raw: boolean
}

function pseudoNoise(x: number, y: number, seed: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

export function applySensorProcessingToCanvas(canvas: HTMLCanvasElement, settings: SensorSettings) {
  if (!settings.enabled) return
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const source = new Uint8ClampedArray(image.data)
  const width = canvas.width
  const height = canvas.height
  const isoGain = Math.max(1, settings.iso / Math.max(1, settings.nativeIso))
  const rawFactor = settings.raw ? 1 : 0.62
  const reduction = 1 - Math.min(0.92, settings.noiseReduction / 110)
  const noiseAmount = Math.sqrt(isoGain - 1) * 5.2 * settings.noiseFactor * reduction * rawFactor
  const chromaAmount = noiseAmount * settings.colorNoise / 100
  const blurPixels = Math.max(0, Math.min(12, (125 / Math.max(8, settings.shutter) - 1) * settings.motionBlur / 30))
  const rollingPixels = settings.shutterMode === 'electronic' ? Math.min(16, settings.readoutMs / 4 * settings.rollingShutter / 100) : 0
  const shadowFloor = Math.max(0, (14.8 - settings.dynamicRange) * 1.7)
  const sample = (x: number, y: number, channel: number) => {
    const sx = Math.max(0, Math.min(width - 1, Math.round(x)))
    const sy = Math.max(0, Math.min(height - 1, Math.round(y)))
    return source[(sy * width + sx) * 4 + channel]
  }

  for (let y = 0; y < height; y += 1) {
    const rowSkew = (y / Math.max(1, height - 1) - 0.5) * rollingPixels
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4
      let red = 0; let green = 0; let blue = 0
      const taps = blurPixels > 0.5 ? 5 : 1
      for (let tap = 0; tap < taps; tap += 1) {
        const blurOffset = taps === 1 ? 0 : (tap / (taps - 1) - 0.5) * blurPixels
        red += sample(x + rowSkew + blurOffset, y, 0)
        green += sample(x + rowSkew + blurOffset, y, 1)
        blue += sample(x + rowSkew + blurOffset, y, 2)
      }
      red /= taps; green /= taps; blue /= taps
      const lumaNoise = pseudoNoise(x, y, 1) * noiseAmount
      red += lumaNoise + pseudoNoise(x, y, 2) * chromaAmount
      green += lumaNoise + pseudoNoise(x, y, 3) * chromaAmount * 0.55
      blue += lumaNoise + pseudoNoise(x, y, 4) * chromaAmount
      image.data[target] = Math.max(shadowFloor, Math.min(255, red))
      image.data[target + 1] = Math.max(shadowFloor, Math.min(255, green))
      image.data[target + 2] = Math.max(shadowFloor, Math.min(255, blue))
      image.data[target + 3] = source[target + 3]
    }
  }
  context.putImageData(image, 0, 0)
}
