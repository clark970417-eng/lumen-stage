import { useEffect, useMemo, useRef } from 'react'
import { useStudio, type ExposureOverlay, type ExposureSample } from '../store'
import { calculateMetering } from '../metering'
import { useT } from '../i18n'

type ExposureMetrics = {
  histogram: number[]
  rgbHistogram: { red: number[]; green: number[]; blue: number[] }
  mean: number
  shadows: number
  highlights: number
  clipped: number
  evOffset: number
}

const EMPTY_METRICS: ExposureMetrics = {
  histogram: Array.from({ length: 32 }, () => 0),
  rgbHistogram: { red: Array.from({ length: 32 }, () => 0), green: Array.from({ length: 32 }, () => 0), blue: Array.from({ length: 32 }, () => 0) },
  mean: 0,
  shadows: 0,
  highlights: 0,
  clipped: 0,
  evOffset: 0,
}

function falseColor(luma: number): [number, number, number, number] {
  if (luma < 0.035) return [82, 36, 148, 220]
  if (luma < 0.12) return [32, 112, 214, 205]
  if (luma < 0.38) return [30, 191, 132, 180]
  if (luma < 0.68) return [125, 128, 118, 105]
  if (luma < 0.88) return [244, 205, 46, 195]
  return [239, 55, 48, 225]
}

function analyzeFrame(sample: ExposureSample | null): ExposureMetrics {
  if (!sample) return EMPTY_METRICS
  const { width, height, pixels } = sample
  const histogram = Array.from({ length: 32 }, () => 0)
  const redHistogram = Array.from({ length: 32 }, () => 0)
  const greenHistogram = Array.from({ length: 32 }, () => 0)
  const blueHistogram = Array.from({ length: 32 }, () => 0)
  let total = 0
  let shadows = 0
  let highlights = 0
  let clipped = 0

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] / 255
    const green = pixels[index + 1] / 255
    const blue = pixels[index + 2] / 255
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    total += luma
    histogram[Math.min(31, Math.floor(luma * 32))] += 1
    redHistogram[Math.min(31, Math.floor(red * 32))] += 1
    greenHistogram[Math.min(31, Math.floor(green * 32))] += 1
    blueHistogram[Math.min(31, Math.floor(blue * 32))] += 1
    if (luma < 0.08) shadows += 1
    if (luma > 0.82) highlights += 1
    if (luma < 0.015 || luma > 0.985) clipped += 1

  }

  const pixelCount = width * height
  const mean = total / pixelCount
  const peak = Math.max(1, ...histogram)
  const rgbPeak = Math.max(1, ...redHistogram, ...greenHistogram, ...blueHistogram)
  return {
    histogram: histogram.map((value) => value / peak),
    rgbHistogram: { red: redHistogram.map((value) => value / rgbPeak), green: greenHistogram.map((value) => value / rgbPeak), blue: blueHistogram.map((value) => value / rgbPeak) },
    mean,
    shadows: shadows / pixelCount,
    highlights: highlights / pixelCount,
    clipped: clipped / pixelCount,
    evOffset: Math.max(-5, Math.min(5, Math.log2(Math.max(0.003, mean) / 0.42))),
  }
}

export function ExposureAnalysis() {
  const open = useStudio((state) => state.analysisOpen)
  const overlay = useStudio((state) => state.exposureOverlay)
  const soloLightId = useStudio((state) => state.soloLightId)
  const lights = useStudio((state) => state.lights)
  const modifiers = useStudio((state) => state.modifiers)
  const aperture = useStudio((state) => state.aperture)
  const shutter = useStudio((state) => state.shutter)
  const iso = useStudio((state) => state.iso)
  const syncSpeed = useStudio((state) => state.syncSpeed)
  const ambientLevel = useStudio((state) => state.ambientLevel)
  const modelPosition = useStudio((state) => state.modelPosition)
  const modelHeight = useStudio((state) => state.modelHeight)
  const sample = useStudio((state) => state.exposureSample)
  const setValue = useStudio((state) => state.setValue)
  const histogramMode = useStudio((state) => state.histogramMode)
  const t = useT()
  const overlayCanvas = useRef<HTMLCanvasElement>(null)
  const metrics = useMemo(() => analyzeFrame(sample), [sample])
  const subjectMeterPoint = useMemo<[number, number, number]>(() => [modelPosition[0], modelPosition[1] + modelHeight * 0.72, modelPosition[2]], [modelHeight, modelPosition])
  const metering = useMemo(() => calculateMetering(lights, modifiers, subjectMeterPoint, aperture, shutter, iso, syncSpeed, ambientLevel), [ambientLevel, aperture, iso, lights, modifiers, shutter, subjectMeterPoint, syncSpeed])

  useEffect(() => {
    const canvas = overlayCanvas.current
    if (!canvas || !sample) return
    const context = canvas.getContext('2d')
    if (!context) return
    canvas.width = sample.width
    canvas.height = sample.height
    context.clearRect(0, 0, sample.width, sample.height)
    if (overlay === 'none') return
    const frame = context.createImageData(sample.width, sample.height)
    for (let index = 0; index < sample.pixels.length; index += 4) {
      const red = sample.pixels[index] / 255
      const green = sample.pixels[index + 1] / 255
      const blue = sample.pixels[index + 2] / 255
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
      const color = overlay === 'false-color'
        ? falseColor(luma)
        : luma > 0.92 ? [255, 45, 30, 218]
          : luma < 0.045 ? [33, 93, 255, 205]
            : [0, 0, 0, 0]
      frame.data[index] = color[0]
      frame.data[index + 1] = color[1]
      frame.data[index + 2] = color[2]
      frame.data[index + 3] = color[3]
    }
    context.putImageData(frame, 0, 0)
  }, [overlay, sample])

  const setOverlay = (mode: ExposureOverlay) => setValue('exposureOverlay', overlay === mode ? 'none' : mode)
  const evLabel = `${metrics.evOffset >= 0 ? '+' : ''}${metrics.evOffset.toFixed(1)} EV`

  return <>
    <canvas ref={overlayCanvas} className={`exposure-overlay ${overlay !== 'none' ? 'visible' : ''}`} aria-hidden="true" />
    <div className="exposure-launcher">
      <button className={open ? 'active' : ''} onClick={() => setValue('analysisOpen', !open)} aria-expanded={open} aria-controls="exposure-panel"><i />{t('exposure.launcher')} <kbd>M</kbd></button>
      {overlay !== 'none' && <span>{overlay === 'false-color' ? 'FALSE COLOR' : 'CLIP ALERT'}</span>}
      {soloLightId && <span>SOLO · {lights.find((light) => light.id === soloLightId)?.name.toUpperCase()}</span>}
    </div>
    {open && <aside id="exposure-panel" className="exposure-panel" aria-label={t('exposure.aria')}>
      <header><span>EXPOSURE SCOPE</span><button aria-label={t('exposure.close')} onClick={() => setValue('analysisOpen', false)}>×</button></header>
      <div className="exposure-summary">
        <div><span>{t('exposure.meanLuma')}</span><strong>{Math.round(metrics.mean * 100)}<small>%</small></strong></div>
        <div><span>{t('exposure.evOffset')}</span><strong className={Math.abs(metrics.evOffset) > 1 ? 'warning' : ''}>{evLabel}</strong></div>
      </div>
      <div className="scope-mode-switch" role="group" aria-label={t('exposure.histogramMode')}><button className={histogramMode === 'luma' ? 'active' : ''} onClick={() => setValue('histogramMode', 'luma')}>{t('exposure.luma')}</button><button className={histogramMode === 'rgb' ? 'active' : ''} onClick={() => setValue('histogramMode', 'rgb')}>RGB</button></div>
      <div className={`histogram ${histogramMode === 'rgb' ? 'rgb' : ''}`} aria-label={t(histogramMode === 'rgb' ? 'exposure.histogram.rgb' : 'exposure.histogram.luma')}>
        {histogramMode === 'luma' ? metrics.histogram.map((height, index) => <i key={index} style={{ height: `${Math.max(2, height * 100)}%` }} />) : <>{(['red','green','blue'] as const).map((channel) => <span key={channel} className={`histogram-channel ${channel}`}>{metrics.rgbHistogram[channel].map((height,index) => <i key={index} style={{ height: `${Math.max(1, height * 100)}%` }} />)}</span>)}</>}
        <span className="histogram-mid" />
      </div>
      <div className="exposure-percentages">
        <span><i className="shadow-dot" />{t('exposure.shadows')} <b>{Math.round(metrics.shadows * 100)}%</b></span>
        <span><i className="highlight-dot" />{t('exposure.highlights')} <b>{Math.round(metrics.highlights * 100)}%</b></span>
        <span><i className="clip-dot" />{t('exposure.clipped')} <b>{metrics.clipped < 0.001 ? '<0.1' : (metrics.clipped * 100).toFixed(1)}%</b></span>
      </div>
      <div className="exposure-modes" role="group" aria-label={t('exposure.overlayAria')}>
        <button className={overlay === 'false-color' ? 'active' : ''} onClick={() => setOverlay('false-color')}>{t('exposure.falseColor')}</button>
        <button className={overlay === 'clipping' ? 'active' : ''} onClick={() => setOverlay('clipping')}>{t('exposure.clipAlert')}</button>
        <button className={overlay === 'none' ? 'active' : ''} onClick={() => setValue('exposureOverlay', 'none')}>{t('exposure.original')}</button>
      </div>
      <section className="incident-metering">
        <div className="meter-heading"><span>{t('exposure.autoMeter')}</span><small>AUTO · SUBJECT</small></div>
        <div className="meter-primary">
          <div><span>METER CALL</span><strong>{metering.recommendedApertureLabel}</strong></div>
          <div><span>EV 100</span><strong>{metering.ev100.toFixed(1)}</strong></div>
          <div><span>KEY : FILL</span><strong>{metering.keyFillRatio >= 99 ? '∞' : `${metering.keyFillRatio.toFixed(1)}:1`}</strong></div>
        </div>
        <div className="meter-balance">
          <span>{t('exposure.cameraDelta')}</span><b className={Math.abs(metering.exposureDelta) > 1 ? 'warning' : ''}>{metering.exposureDelta >= 0 ? '+' : ''}{metering.exposureDelta.toFixed(1)} EV</b>
          <i><em style={{ left: `${Math.max(0, Math.min(100, 50 + metering.exposureDelta * 10))}%` }} /></i>
        </div>
        <div className="light-contributions">
          {metering.readings.map((reading) => {
            const contributionTotal = metering.readings.reduce((total, item) => total + item.exposureContribution, 0)
            const share = contributionTotal ? reading.exposureContribution / contributionTotal : 0
            return <div key={reading.lightId} className={reading.blocked ? 'blocked' : ''}>
              <span>{reading.name}<small>{reading.blocked ? 'FLAGGED' : `${lights.find((light) => light.id === reading.lightId)?.operationMode === 'flash' ? 'FLASH' : 'CONT'}${reading.bouncedLux > 0.5 ? ` · +${Math.round(reading.bouncedLux)} bounce` : ''}`}</small></span>
              <i><em style={{ width: `${Math.max(1, share * 100)}%` }} /></i>
              <b>{Math.round(reading.totalLux)} {reading.flash ? 'lx·s' : 'lx'}</b>
            </div>
          })}
        </div>
        <footer>
          <span>CONT {Math.round(metering.continuousLux)} lx</span>
          <span>FLASH {Math.round(metering.flashLuxSeconds)} lx·s</span>
          <span>AMBIENT {Math.round(metering.ambientLux)} lx</span>
        </footer>
      </section>
      <section className="solo-metering">
        <div><span>{t('exposure.soloTitle')}</span><button onClick={() => setValue('soloLightId', null)} disabled={!soloLightId}>{t('exposure.allLights')}</button></div>
        {lights.map((light) => <button key={light.id} className={soloLightId === light.id ? 'active' : ''} disabled={!light.enabled} onClick={() => setValue('soloLightId', soloLightId === light.id ? null : light.id)}><i style={{ background: light.colorMode === 'rgb' ? light.rgb : '#f3e6cd' }} /><span>{light.name}</span><b>{soloLightId === light.id ? 'SOLO' : light.enabled ? `${Math.round(light.powerPercent)}% POWER` : 'OFF'}</b></button>)}
      </section>
      <footer><span>0</span><span>18% GRAY</span><span>100 IRE</span></footer>
    </aside>}
  </>
}
