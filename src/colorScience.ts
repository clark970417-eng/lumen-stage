export type ImageFormat = 'raw' | 'jpeg'
export type ColorProfileId = 'neutral' | 'portrait' | 'vivid' | 'cinema' | 'monochrome'
export type HistogramMode = 'luma' | 'rgb'

export type ColorProfile = {
  id: ColorProfileId
  name: string
  code: string
  saturation: number
  contrast: number
  warmth: number
  tint: number
}

export const COLOR_PROFILES: Record<ColorProfileId, ColorProfile> = {
  neutral: { id: 'neutral', name: 'Natural', code: 'NEUTRAL', saturation: 1, contrast: 1, warmth: 0, tint: 0 },
  portrait: { id: 'portrait', name: 'Portrait', code: 'PORTRAIT', saturation: 0.94, contrast: 0.96, warmth: 0.035, tint: 0.015 },
  vivid: { id: 'vivid', name: 'Vivid', code: 'VIVID', saturation: 1.22, contrast: 1.08, warmth: 0.015, tint: 0 },
  cinema: { id: 'cinema', name: 'Cinema', code: 'CINEMA', saturation: 0.86, contrast: 1.12, warmth: 0.02, tint: -0.025 },
  monochrome: { id: 'monochrome', name: 'Monochrome', code: 'MONO', saturation: 0, contrast: 1.08, warmth: 0, tint: 0 },
}

export type ColorScienceSettings = {
  imageFormat: ImageFormat
  whiteBalance: number
  whiteBalanceTint: number
  colorProfileId: ColorProfileId
  highlightRolloff: number
  toneCurve: number
  lutIntensity: number
}

export function whiteBalanceGains(temperature: number, tint: number) {
  const warmth = Math.max(-1, Math.min(1, (temperature - 5600) / 3600))
  const magenta = Math.max(-1, Math.min(1, tint / 100))
  return {
    red: 1 + warmth * 0.18 + magenta * 0.06,
    green: 1 - Math.abs(warmth) * 0.025 - magenta * 0.09,
    blue: 1 - warmth * 0.2 + magenta * 0.06,
  }
}

export function applyColorScienceToCanvas(canvas: HTMLCanvasElement, settings: ColorScienceSettings) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const profile = COLOR_PROFILES[settings.colorProfileId]
  const rawMix = settings.imageFormat === 'raw' ? 0.24 : 1
  const profileMix = rawMix * settings.lutIntensity / 100
  const gains = whiteBalanceGains(settings.whiteBalance, settings.whiteBalanceTint)
  const curve = (settings.toneCurve - 50) / 50 * profileMix
  const rolloff = settings.highlightRolloff / 100 * rawMix

  for (let index = 0; index < image.data.length; index += 4) {
    let red = image.data[index] / 255 * gains.red
    let green = image.data[index + 1] / 255 * gains.green
    let blue = image.data[index + 2] / 255 * gains.blue
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    const saturation = 1 + (profile.saturation - 1) * profileMix
    red = luma + (red - luma) * saturation
    green = luma + (green - luma) * saturation
    blue = luma + (blue - luma) * saturation
    red += profile.warmth * profileMix + profile.tint * profileMix
    green -= profile.tint * profileMix
    blue -= profile.warmth * profileMix - profile.tint * profileMix
    const contrast = 1 + (profile.contrast - 1) * profileMix
    red = (red - 0.5) * contrast + 0.5
    green = (green - 0.5) * contrast + 0.5
    blue = (blue - 0.5) * contrast + 0.5
    if (curve !== 0) {
      const shape = (value: number) => value * value * (3 - 2 * value)
      red += (shape(Math.max(0, Math.min(1, red))) - red) * curve
      green += (shape(Math.max(0, Math.min(1, green))) - green) * curve
      blue += (shape(Math.max(0, Math.min(1, blue))) - blue) * curve
    }
    if (rolloff > 0) {
      const compress = (value: number) => value <= 0.62 ? value : 0.62 + (1 - Math.exp(-(value - 0.62) * (2.8 - rolloff * 1.4))) * (0.38 / (1 - Math.exp(-0.38 * (2.8 - rolloff * 1.4))))
      red = red * (1 - rolloff) + compress(red) * rolloff
      green = green * (1 - rolloff) + compress(green) * rolloff
      blue = blue * (1 - rolloff) + compress(blue) * rolloff
    }
    image.data[index] = Math.max(0, Math.min(255, red * 255))
    image.data[index + 1] = Math.max(0, Math.min(255, green * 255))
    image.data[index + 2] = Math.max(0, Math.min(255, blue * 255))
  }
  context.putImageData(image, 0, 0)
}
