import { CAMERA_BODIES } from './cameraProfiles'
import { applyColorScienceToCanvas } from './colorScience'
import { applyLensOpticsToCanvas } from './optics'
import { applySensorProcessingToCanvas } from './sensorProcessing'
import { useStudio, type FrameAspect, type FrameOrientation } from './store'

const RATIOS: Record<FrameAspect, number> = { '3:2': 1.5, '4:5': 0.8, '1:1': 1, '16:9': 16 / 9 }

function frameRatio(aspect: FrameAspect, orientation: FrameOrientation) {
  const raw = RATIOS[aspect]
  const landscape = Math.max(raw, 1 / raw)
  return orientation === 'landscape' ? landscape : 1 / landscape
}

export function captureThumbnail(aspect: FrameAspect, orientation: FrameOrientation) {
  const source = document.querySelector<HTMLCanvasElement>('.viewport canvas:not(.exposure-overlay)')
  if (!source) return ''
  const ratio = frameRatio(aspect, orientation)
  const sourceRatio = source.width / source.height
  let sx = 0; let sy = 0; let sw = source.width; let sh = source.height
  if (sourceRatio > ratio) { sw = Math.round(source.height * ratio); sx = Math.round((source.width - sw) / 2) }
  else { sh = Math.round(source.width / ratio); sy = Math.round((source.height - sh) / 2) }
  const width = orientation === 'portrait' ? 180 : 300
  const height = Math.round(width / ratio)
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  canvas.getContext('2d')?.drawImage(source, sx, sy, sw, sh, 0, 0, width, height)
  const optics = useStudio.getState()
  applyLensOpticsToCanvas(canvas, { enabled: optics.lensOpticsEnabled, vignette: optics.lensVignette, distortion: optics.lensDistortion, chromaticAberration: optics.lensChromaticAberration, breathing: optics.lensBreathing })
  applyColorScienceToCanvas(canvas, { imageFormat: optics.imageFormat, whiteBalance: optics.whiteBalance, whiteBalanceTint: optics.whiteBalanceTint, colorProfileId: optics.colorProfileId, highlightRolloff: optics.highlightRolloff, toneCurve: optics.toneCurve, lutIntensity: optics.lutIntensity })
  const body = CAMERA_BODIES[optics.cameraBodyId]
  applySensorProcessingToCanvas(canvas, { enabled: optics.sensorSimulationEnabled, iso: optics.iso, nativeIso: body.nativeIso, noiseFactor: body.noiseFactor, dynamicRange: optics.sensorDynamicRange, noiseReduction: optics.noiseReduction, colorNoise: optics.colorNoise, shutter: optics.shutter, shutterMode: optics.shutterMode, motionBlur: optics.motionBlur, rollingShutter: optics.rollingShutter, readoutMs: body.readoutMs, raw: optics.imageFormat === 'raw' })
  return canvas.toDataURL('image/jpeg', 0.76)
}

/** 擷取目前畫面成為鏡位；若不在相機視角會先切過去等一幀 */
export async function captureCurrentShot() {
  const store = useStudio.getState()
  if (store.view !== 'camera') {
    store.openCameraView()
    // 等畫面重繪；分頁在背景時 rAF 會被凍結，所以加一個逾時保底
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => { if (!settled) { settled = true; resolve() } }
      requestAnimationFrame(() => requestAnimationFrame(finish))
      setTimeout(finish, 150)
    })
  }
  const next = useStudio.getState()
  next.captureShot(captureThumbnail(next.frameAspect, next.frameOrientation))
}
