export type ReferenceLightingAnalysis = {
  direction: 'left' | 'front' | 'right'
  contrastRatio: number
  keyPower: number
  fillPower: number
  confidence: 'low' | 'medium' | 'high'
  brightness: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Produces a deliberately conservative lighting starting point from a reference.
 * It reads broad luminance distribution only; it does not claim to detect a face
 * or reconstruct hidden equipment.
 */
export function analyzeReferencePixels(pixels: Uint8ClampedArray, width: number, height: number): ReferenceLightingAnalysis {
  if (width < 2 || height < 1 || pixels.length < width * height * 4) throw new Error('Invalid reference pixels')
  let left = 0
  let right = 0
  let leftCount = 0
  let rightCount = 0
  let sum = 0
  let sumSquares = 0
  let count = 0

  const yStart = Math.floor(height * 0.12)
  const yEnd = Math.max(yStart + 1, Math.ceil(height * 0.88))
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const luminance = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255
      sum += luminance
      sumSquares += luminance * luminance
      count += 1
      if (x < width * 0.45) { left += luminance; leftCount += 1 }
      if (x > width * 0.55) { right += luminance; rightCount += 1 }
    }
  }

  const leftMean = left / Math.max(1, leftCount)
  const rightMean = right / Math.max(1, rightCount)
  const brightness = sum / Math.max(1, count)
  const deviation = Math.sqrt(Math.max(0, sumSquares / Math.max(1, count) - brightness * brightness))
  const sideDifference = leftMean - rightMean
  const direction = Math.abs(sideDifference) < 0.045 ? 'front' : sideDifference > 0 ? 'left' : 'right'
  const contrastRatio = Number(clamp(1.5 + Math.abs(sideDifference) * 8 + deviation * 5, 1.5, 6).toFixed(1))
  const keyPower = Math.round(clamp(16 + (0.48 - brightness) * 18, 10, 28))
  const fillPower = Math.max(2, Math.round(keyPower / contrastRatio))
  const evidence = Math.abs(sideDifference) + deviation * 0.45
  const confidence = evidence > 0.22 ? 'high' : evidence > 0.1 ? 'medium' : 'low'
  return { direction, contrastRatio, keyPower, fillPower, confidence, brightness: Number(brightness.toFixed(2)) }
}
