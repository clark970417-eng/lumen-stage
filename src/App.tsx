import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { StudioScene } from './components/StudioScene'
import { Inspector } from './components/Inspector'
import { Library } from './components/Library'
import { ExposureAnalysis } from './components/ExposureAnalysis'
import { ShotLibrary } from './components/ShotLibrary'
import { ProfessionalPanel } from './components/ProfessionalPanel'
import { SetupSheet } from './components/SetupSheet'
import { ShortcutHelp, ShortcutHint, ShortcutLauncher } from './components/ShortcutHelp'
import { runShortcut } from './shortcuts'
import { applyLensOpticsToCanvas, calculateDepthOfField } from './optics'
import { LOCALES, useLocaleStore, useT, type Locale } from './i18n'
import { useStudio } from './store'
import { applyColorScienceToCanvas, COLOR_PROFILES } from './colorScience'
import { applySensorProcessingToCanvas } from './sensorProcessing'
import { CAMERA_BODIES } from './cameraProfiles'

let hintSequence = 0

const FRAME_RATIOS = { '3:2': 3 / 2, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 } as const
const SENSOR_LABELS = { 'full-frame': 'FULL FRAME', 'aps-c': 'APS-C', mft: 'MFT' } as const
const SENSOR_COC = { 'full-frame': 0.03, 'aps-c': 0.019, mft: 0.015 } as const

function getFrameRatio(aspect: keyof typeof FRAME_RATIOS, orientation: 'landscape' | 'portrait') {
  const ratio = FRAME_RATIOS[aspect]
  const landscape = Math.max(ratio, 1 / ratio)
  return orientation === 'landscape' ? landscape : 1 / landscape
}

function ViewfinderOverlay() {
  const view = useStudio((state) => state.view)
  const renderMode = useStudio((state) => state.renderMode)
  const focusGuide = useStudio((state) => state.focusGuide)
  const focusDistance = useStudio((state) => state.focusDistance)
  const focalLength = useStudio((state) => state.focalLength)
  const aperture = useStudio((state) => state.aperture)
  const sensorFormat = useStudio((state) => state.sensorFormat)
  const frameAspect = useStudio((state) => state.frameAspect)
  const frameOrientation = useStudio((state) => state.frameOrientation)
  const compositionGuide = useStudio((state) => state.compositionGuide)
  const shutter = useStudio((state) => state.shutter)
  const cameraMode = useStudio((state) => state.cameraMode)
  const frameRate = useStudio((state) => state.frameRate)
  const shutterAngle = useStudio((state) => state.shutterAngle)
  const syncSpeed = useStudio((state) => state.syncSpeed)
  const lights = useStudio((state) => state.lights)
  const syncError = shutter > syncSpeed && lights.some((light) => light.enabled && light.operationMode === 'flash' && !light.hssEnabled)
  const depth = calculateDepthOfField(focalLength, aperture, focusDistance, SENSOR_COC[sensorFormat])
  const landscapeSizes = { '3:2': [94, 82], '4:5': [86, 90], '1:1': [69, 90], '16:9': [94, 69] } as const
  const portraitSizes = { '3:2': [46, 90], '4:5': [55, 90], '1:1': [69, 90], '16:9': [39, 90] } as const
  const [frameWidth, frameHeight] = (frameOrientation === 'landscape' ? landscapeSizes : portraitSizes)[frameAspect]

  return (
    <div className={`viewfinder ${view === 'camera' ? 'is-visible' : ''}`} aria-hidden="true">
      <div className="composition-frame" style={{ '--frame-width': `${frameWidth}%`, '--frame-height': `${frameHeight}%` } as React.CSSProperties}>
        <span className="frame-corner top-left" />
        <span className="frame-corner top-right" />
        <span className="frame-corner bottom-left" />
        <span className="frame-corner bottom-right" />
        {focusGuide && renderMode === 'preview' && <span className="focus-point"><i /><b>AF-S · {focusDistance.toFixed(2)} M</b><small>DOF {depth.range.toFixed(2)} M</small></span>}
        {compositionGuide === 'thirds' && <><div className="thirds vertical one" /><div className="thirds vertical two" /><div className="thirds horizontal one" /><div className="thirds horizontal two" /></>}
        {compositionGuide === 'golden' && <><div className="guide-line vertical golden-one" /><div className="guide-line vertical golden-two" /><div className="guide-line horizontal golden-one" /><div className="guide-line horizontal golden-two" /></>}
        {compositionGuide === 'safe' && <div className="safe-area-guide"><span>SAFE AREA</span></div>}
      </div>
      <span className="frame-format-label">{frameAspect} · {frameOrientation === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT'}</span>
      {cameraMode === 'cinema' && <><span className="cinema-frame-line top" /><span className="cinema-frame-line bottom" /><span className="cinema-status">REC FORMAT · {frameRate} FPS · {shutterAngle}°</span></>}
      {syncError && <div className="sync-curtain-warning" style={{ '--curtain-height': `${Math.round((1 - syncSpeed / shutter) * 100)}%` } as React.CSSProperties}><i /><span>FLASH SYNC LIMIT · 1/{syncSpeed}s</span></div>}
    </div>
  )
}

function SetupSheetHost() {
  const open = useStudio((state) => state.setupSheetOpen)
  return open ? <SetupSheet /> : null
}

/** 把匯入／匯出／載入收進一個選單，讓頂欄剩下真正常用的動作 */
function FileMenu({ onImport, onExport, onLoad }: { onImport: () => void; onExport: () => void; onLoad: () => void }) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const t = useT()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    // 用捕獲階段攔下 Esc，避免同時觸發全域快捷鍵把其他面板一起關掉
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      setOpen(false)
      trigger.current?.focus()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const pick = (action: () => void) => () => { setOpen(false); action() }

  return (
    <div className="file-menu" ref={wrapper}>
      <button ref={trigger} className={open ? 'active' : ''} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title={t('file.menu.title')}>
        {t('file.menu')} <i aria-hidden="true" />
      </button>
      {open && (
        <div className="file-menu-list" role="menu">
          <button role="menuitem" onClick={pick(onImport)}>{t('file.import')}<small>.json</small></button>
          <button role="menuitem" onClick={pick(onExport)}>{t('file.export')}<small>⌘E</small></button>
          <button role="menuitem" onClick={pick(onLoad)}>{t('file.load')}<small>{t('file.load.sub')}</small></button>
        </div>
      )}
    </div>
  )
}

/** 語言切換：三種語言下都顯示原生名稱，不必先看懂目前的介面語言 */
function LanguageSwitch() {
  const locale = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)
  const t = useT()
  return (
    <div className="language-switch" role="group" aria-label={t('lang.label')} title={t('lang.title')}>
      {LOCALES.map((item) => (
        <button
          key={item.id}
          lang={item.htmlLang}
          title={item.native}
          aria-label={item.native}
          className={locale === item.id ? 'active' : ''}
          aria-pressed={locale === item.id}
          onClick={() => setLocale(item.id as Locale)}
        >{item.short}</button>
      ))}
    </div>
  )
}

function TopBar({ onOpenGuide }: { onOpenGuide: () => void }) {
  const t = useT()
  const view = useStudio((state) => state.view)
  const renderMode = useStudio((state) => state.renderMode)
  const openStudioView = useStudio((state) => state.openStudioView)
  const openCameraView = useStudio((state) => state.openCameraView)
  const openTopView = useStudio((state) => state.openTopView)
  const startPhotoRender = useStudio((state) => state.startPhotoRender)
  const saveProject = useStudio((state) => state.saveProject)
  const loadProject = useStudio((state) => state.loadProject)
  const exportProject = useStudio((state) => state.exportProject)
  const importProject = useStudio((state) => state.importProject)
  const saveStatus = useStudio((state) => state.saveStatus)
  const projectName = useStudio((state) => state.projectName)
  const setValue = useStudio((state) => state.setValue)
  const professionalPanelOpen = useStudio((state) => state.professionalPanelOpen)
  const projectInput = useRef<HTMLInputElement>(null)

  return (
    <header className="topbar">
      <div className="brand" aria-label="Lumen Stage">
        <span className="brand-mark"><i /></span>
        <div><strong>LUMEN</strong><small>STAGE / 001</small></div>
      </div>
      <div className="project-title"><span>PROJECT</span><input className="project-name-input" aria-label={t('topbar.projectName')} value={projectName} onChange={(event) => setValue('projectName', event.target.value)} /><small className={`save-state ${saveStatus}`}>{saveStatus === 'saved' ? t('topbar.save.saved') : saveStatus === 'autosaved' ? t('topbar.save.autosaved') : saveStatus === 'loaded' ? t('topbar.save.loaded') : saveStatus === 'exported' ? t('topbar.save.exported') : saveStatus === 'error' ? t('topbar.save.error') : t('topbar.save.idle')}</small><LanguageSwitch /></div>
      <div className="view-switch" role="group" aria-label={t('topbar.views')}>
        <button className={view === 'studio' ? 'active' : ''} onClick={openStudioView} title={t('view.studio.title')}>{t('view.studio')} <kbd>1</kbd></button>
        <button className={view === 'top' ? 'active' : ''} onClick={openTopView} title={t('view.top.title')}>{t('view.top')} <kbd>2</kbd></button>
        <button className={view === 'camera' && renderMode === 'preview' ? 'active' : ''} onClick={openCameraView} title={t('view.camera.title')}>{t('view.camera')} <kbd>3</kbd></button>
        <button className={renderMode === 'path' ? 'active render-active' : ''} onClick={startPhotoRender} title={t('view.render.title')}>{t('view.render')} <kbd>4</kbd></button>
      </div>
      <div className="project-actions">
        <button className="setup-sheet-button" onClick={() => setValue('setupSheetOpen', true)} title={t('topbar.setupSheet.title')}>{t('topbar.setupSheet')}</button>
        <button className={professionalPanelOpen ? 'pro-console-button active' : 'pro-console-button'} onClick={() => setValue('professionalPanelOpen', !professionalPanelOpen)} title={t('topbar.pro.title')} aria-pressed={professionalPanelOpen}>PRO</button>
        <button className="guide-button" onClick={onOpenGuide} title={t('topbar.guide.title')}>{t('topbar.guide')}</button>
        <input ref={projectInput} className="asset-input" type="file" accept=".json,.lumen.json,application/json" onChange={async (event) => { const file = event.target.files?.[0]; if (file) importProject(await file.text()); event.target.value = '' }} />
        <FileMenu onImport={() => projectInput.current?.click()} onExport={exportProject} onLoad={loadProject} />
        <button className="save-button" onClick={saveProject} title={t('topbar.save.title')}>{t('topbar.save')} <span>⌘S</span></button>
      </div>
    </header>
  )
}

function GuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const pageCount = 11
  const locale = useLocaleStore((state) => state.locale)
  const t = useT()

  useEffect(() => {
    if (!open) return
    setPage(1)
    window.requestAnimationFrame(() => stageRef.current?.scrollTo({ top: 0 }))
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose, locale])

  if (!open) return null
  const guideUrl = locale === 'en'
    ? '/LUMEN_STAGE_Site_Guide_EN.pdf'
    : locale === 'ja'
      ? '/LUMEN_STAGE_サイトガイド_JA.pdf'
      : '/LUMEN_STAGE_網站使用教學.pdf'

  return (
    <div className="guide-overlay" role="dialog" aria-modal="true" aria-label={t('guide.aria')} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="guide-dialog">
        <header>
          <div><strong>{t('guide.title')}</strong><small>{t('guide.languageNote')}</small></div>
          <div className="guide-actions">
            <a href={guideUrl} download>{t('guide.download')}</a>
            <button ref={closeButton} onClick={onClose} aria-label={t('guide.close')}>×</button>
          </div>
        </header>
        <div ref={stageRef} className="guide-page-stage" role="document" aria-label={t('guide.stage')} tabIndex={0} onScroll={(event) => {
          const viewport = event.currentTarget.getBoundingClientRect()
          const center = viewport.top + viewport.height / 2
          const pages = Array.from(event.currentTarget.querySelectorAll<HTMLImageElement>('[data-guide-page]'))
          let nearest = 1
          let distance = Number.POSITIVE_INFINITY
          pages.forEach((image, index) => {
            const rect = image.getBoundingClientRect()
            const nextDistance = Math.abs(rect.top + rect.height / 2 - center)
            if (nextDistance < distance) { distance = nextDistance; nearest = index + 1 }
          })
          setPage((current) => current === nearest ? current : nearest)
        }}>
          {Array.from({ length: pageCount }, (_, index) => <img key={`${locale}-${index + 1}`} data-guide-page={index + 1} loading={index < 2 ? 'eager' : 'lazy'} src={`/guide-pages/${locale}/page-${String(index + 1).padStart(2, '0')}.jpg`} alt={t('guide.page', { n: index + 1 })} />)}
        </div>
        <div className="guide-page-indicator" aria-live="polite"><strong>{page}</strong><span>/ {pageCount}</span></div>
      </section>
    </div>
  )
}

function RenderToolbar() {
  const renderMode = useStudio((state) => state.renderMode)
  const paused = useStudio((state) => state.pathTracingPaused)
  const samples = useStudio((state) => state.pathTracingSamples)
  const status = useStudio((state) => state.pathTracingStatus)
  const setValue = useStudio((state) => state.setValue)
  const restart = useStudio((state) => state.restartPhotoRender)
  const frameAspect = useStudio((state) => state.frameAspect)
  const frameOrientation = useStudio((state) => state.frameOrientation)
  const lensOpticsEnabled = useStudio((state) => state.lensOpticsEnabled)
  const lensVignette = useStudio((state) => state.lensVignette)
  const lensDistortion = useStudio((state) => state.lensDistortion)
  const lensChromaticAberration = useStudio((state) => state.lensChromaticAberration)
  const lensBreathing = useStudio((state) => state.lensBreathing)
  const imageFormat = useStudio((state) => state.imageFormat)
  const whiteBalance = useStudio((state) => state.whiteBalance)
  const whiteBalanceTint = useStudio((state) => state.whiteBalanceTint)
  const colorProfileId = useStudio((state) => state.colorProfileId)
  const highlightRolloff = useStudio((state) => state.highlightRolloff)
  const toneCurve = useStudio((state) => state.toneCurve)
  const lutIntensity = useStudio((state) => state.lutIntensity)
  const cameraBodyId = useStudio((state) => state.cameraBodyId)
  const sensorSimulationEnabled = useStudio((state) => state.sensorSimulationEnabled)
  const shutterMode = useStudio((state) => state.shutterMode)
  const sensorDynamicRange = useStudio((state) => state.sensorDynamicRange)
  const noiseReduction = useStudio((state) => state.noiseReduction)
  const colorNoise = useStudio((state) => state.colorNoise)
  const motionBlur = useStudio((state) => state.motionBlur)
  const rollingShutter = useStudio((state) => state.rollingShutter)
  const iso = useStudio((state) => state.iso)
  const shutter = useStudio((state) => state.shutter)
  const outputResolution = useStudio((state) => state.outputResolution)
  const denoiseEnabled = useStudio((state) => state.denoiseEnabled)
  const t = useT()

  if (renderMode !== 'path') return null

  const download = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.viewport canvas:not(.exposure-overlay)')
    if (!canvas) return
    const targetRatio = getFrameRatio(frameAspect, frameOrientation)
    const sourceRatio = canvas.width / canvas.height
    let sourceX = 0
    let sourceY = 0
    let sourceWidth = canvas.width
    let sourceHeight = canvas.height
    if (sourceRatio > targetRatio) {
      sourceWidth = Math.round(canvas.height * targetRatio)
      sourceX = Math.round((canvas.width - sourceWidth) / 2)
    } else {
      sourceHeight = Math.round(canvas.width / targetRatio)
      sourceY = Math.round((canvas.height - sourceHeight) / 2)
    }
    const output = document.createElement('canvas')
    const longEdge = outputResolution === '4k' ? 3840 : outputResolution === '2k' ? 2560 : 1920
    if (targetRatio >= 1) { output.width = longEdge; output.height = Math.round(longEdge / targetRatio) } else { output.height = longEdge; output.width = Math.round(longEdge * targetRatio) }
    const outputContext = output.getContext('2d')
    if (outputContext) { if (denoiseEnabled) outputContext.filter = 'blur(0.35px)'; outputContext.drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, output.width, output.height); outputContext.filter = 'none' }
    applyLensOpticsToCanvas(output, { enabled: lensOpticsEnabled, vignette: lensVignette, distortion: lensDistortion, chromaticAberration: lensChromaticAberration, breathing: lensBreathing })
    applyColorScienceToCanvas(output, { imageFormat, whiteBalance, whiteBalanceTint, colorProfileId, highlightRolloff, toneCurve, lutIntensity })
    const body = CAMERA_BODIES[cameraBodyId]
    applySensorProcessingToCanvas(output, { enabled: sensorSimulationEnabled, iso, nativeIso: body.nativeIso, noiseFactor: body.noiseFactor, dynamicRange: sensorDynamicRange, noiseReduction, colorNoise, shutter, shutterMode, motionBlur, rollingShutter, readoutMs: body.readoutMs, raw: imageFormat === 'raw' })
    const link = document.createElement('a')
    link.download = `lumen-stage-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
    link.href = output.toDataURL('image/png')
    link.click()
  }

  const label = t(status === 'building' ? 'render.status.building' : status === 'error' ? 'render.status.error' : paused ? 'render.status.paused' : 'render.status.sampling')

  return (
    <div className="render-toolbar" role="toolbar" aria-label={t('render.aria')}>
      <div className="render-progress">
        <span>{label}</span>
        <strong>{Math.floor(samples)} <small>SPP</small></strong>
        <i style={{ '--render-progress': `${Math.min(100, samples / 2.56)}%` } as React.CSSProperties} />
      </div>
      <button onClick={() => setValue('pathTracingPaused', !paused)} disabled={status === 'building' || status === 'error'} title={t('render.pause.title')}>{t(paused ? 'render.resume' : 'render.pause')} <kbd>Space</kbd></button>
      <button onClick={restart} title={t('render.restart.title')}>{t('render.restart')} <kbd>⇧R</kbd></button>
      <button className="export-button" onClick={download} disabled={samples < 1}>{t('render.exportPng')}</button>
    </div>
  )
}

function PathLensOverlay() {
  const view = useStudio((state) => state.view)
  const renderMode = useStudio((state) => state.renderMode)
  const enabled = useStudio((state) => state.lensOpticsEnabled)
  const vignette = useStudio((state) => state.lensVignette)
  const chromaticAberration = useStudio((state) => state.lensChromaticAberration)
  if (view !== 'camera' || renderMode !== 'path' || !enabled) return null
  return <div className="path-lens-overlay" aria-hidden="true" style={{ '--vignette': Math.min(0.7, vignette * 0.0065), '--fringe': Math.min(0.2, chromaticAberration * 0.0012) } as React.CSSProperties} />
}

function PathColorOverlay() {
  const renderMode = useStudio((state) => state.renderMode)
  const profileId = useStudio((state) => state.colorProfileId)
  const imageFormat = useStudio((state) => state.imageFormat)
  const lutIntensity = useStudio((state) => state.lutIntensity)
  if (renderMode !== 'path') return null
  const colors = { neutral: '#ffffff', portrait: '#d98a73', vivid: '#e5b93d', cinema: '#2a7f83', monochrome: '#777777' } as const
  const opacity = (imageFormat === 'raw' ? 0.018 : 0.075) * (lutIntensity / 100)
  return <div className="path-color-overlay" aria-hidden="true" style={{ '--profile-tint': colors[profileId], '--profile-opacity': opacity } as React.CSSProperties} />
}

function PathSensorOverlay() {
  const renderMode = useStudio((state) => state.renderMode)
  const enabled = useStudio((state) => state.sensorSimulationEnabled)
  const iso = useStudio((state) => state.iso)
  const cameraBodyId = useStudio((state) => state.cameraBodyId)
  const noiseReduction = useStudio((state) => state.noiseReduction)
  const imageFormat = useStudio((state) => state.imageFormat)
  if (renderMode !== 'path' || !enabled) return null
  const body = CAMERA_BODIES[cameraBodyId]
  const isoGain = Math.max(1, iso / body.nativeIso)
  const opacity = Math.min(0.18, Math.sqrt(isoGain - 1) * 0.018 * body.noiseFactor * (1 - noiseReduction / 120) * (imageFormat === 'raw' ? 1 : 0.62))
  return <div className="path-sensor-overlay" aria-hidden="true" style={{ '--sensor-noise': opacity } as React.CSSProperties} />
}

function SceneToolbar() {
  const selected = useStudio((state) => state.selected)
  const view = useStudio((state) => state.view)
  const mode = useStudio((state) => state.transformMode)
  const setValue = useStudio((state) => state.setValue)
  const selectedLight = useStudio((state) => state.lights.find((light) => light.id === state.selected))
  const selectedModifier = useStudio((state) => state.modifiers.find((modifier) => modifier.id === state.selected))
  const selectedStudioObject = useStudio((state) => state.studioObjects.find((object) => object.id === state.selected))
  const selectedCount = useStudio((state) => state.selectedIds.length)
  const aimMode = useStudio((state) => state.lightAimMode)
  const t = useT()
  if (view === 'camera') return null

  return (
    <div className="scene-toolbar" role="toolbar" aria-label={t('scene.aria')}>
      <span>{selectedLight ? `${selectedLight.name.toUpperCase()}${selectedCount > 1 ? ` · ${selectedCount} SELECTED` : ''}` : selectedModifier ? `${selectedModifier.name.toUpperCase()} · GRIP` : selectedStudioObject ? `${selectedStudioObject.name.toUpperCase()} · SET` : selected === 'camera' ? 'CAMERA 01' : 'MODEL'}</span>
      <button className={mode === 'translate' && !aimMode ? 'active' : ''} onClick={() => { setValue('lightAimMode', false); setValue('transformMode', 'translate') }} title={t('scene.move.title')}><i className="move-glyph" />{t('scene.move')} <kbd>G</kbd></button>
      {selectedLight && <button className={aimMode ? 'active aim-active' : ''} onClick={() => setValue('lightAimMode', !aimMode)} title={t('scene.aim.title')}><i className="target-glyph" />{t('scene.aim')} <kbd>T</kbd></button>}
      <button disabled={selected !== 'model' && !selectedModifier && !selectedStudioObject} className={mode === 'rotate' ? 'active' : ''} onClick={() => { setValue('lightAimMode', false); setValue('transformMode', 'rotate') }} title={t('scene.rotate.title')}><i className="rotate-glyph" />{t('scene.rotate')} <kbd>R</kbd></button>
    </div>
  )
}

function BottomReadout() {
  const { focalLength, aperture, iso, shutter, lights, cameraMode, frameRate, shutterAngle, tStop } = useStudio()
  const keyLight = lights[0]
  const ev = Math.log2((aperture * aperture * 100) / (1 / shutter * iso)).toFixed(1)
  return (
    <footer className="readout">
      <div><span>LENS</span><strong>{focalLength}<small>mm</small></strong></div>
      <div><span>{cameraMode === 'cinema' ? 'T-STOP' : 'APERTURE'}</span><strong>{cameraMode === 'cinema' ? `T${tStop}` : `ƒ/${aperture}`}</strong></div>
      <div><span>{cameraMode === 'cinema' ? 'FPS / ANGLE' : 'SHUTTER'}</span><strong>{cameraMode === 'cinema' ? `${frameRate} / ${shutterAngle}°` : `1/${shutter}`}<small>{cameraMode === 'photo' ? 's' : ''}</small></strong></div>
      <div><span>ISO</span><strong>{iso}</strong></div>
      <div><span>{keyLight?.colorMode === 'rgb' ? 'KEY RGB' : 'KEY TEMP'}</span><strong>{keyLight?.colorMode === 'rgb' ? keyLight.rgb.toUpperCase() : keyLight?.temperature ?? '—'}{keyLight?.colorMode === 'kelvin' && <small>K</small>}</strong></div>
      <div className="ev"><span>SCENE EV</span><strong>{ev}</strong><i style={{ '--meter': `${Math.min(100, Number(ev) * 7)}%` } as React.CSSProperties} /></div>
    </footer>
  )
}

export default function App() {
  const view = useStudio((state) => state.view)
  const renderMode = useStudio((state) => state.renderMode)
  const pathStatus = useStudio((state) => state.pathTracingStatus)
  const pathSamples = useStudio((state) => state.pathTracingSamples)
  const sensorFormat = useStudio((state) => state.sensorFormat)
  const frameAspect = useStudio((state) => state.frameAspect)
  const frameOrientation = useStudio((state) => state.frameOrientation)
  const imageFormat = useStudio((state) => state.imageFormat)
  const colorProfileId = useStudio((state) => state.colorProfileId)
  const lutIntensity = useStudio((state) => state.lutIntensity)
  const whiteBalance = useStudio((state) => state.whiteBalance)
  const roomWidth = useStudio((state) => state.roomWidth)
  const roomDepth = useStudio((state) => state.roomDepth)
  const activeCameraId = useStudio((state) => state.activeCameraId)
  const cameras = useStudio((state) => state.cameras)
  const cameraMode = useStudio((state) => state.cameraMode)
  const profile = COLOR_PROFILES[colorProfileId]
  const rawMix = imageFormat === 'raw' ? 0.24 : 1
  const colorStrength = rawMix * lutIntensity / 100
  const pathSaturation = 1 + (profile.saturation - 1) * colorStrength
  const pathContrast = 1 + (profile.contrast - 1) * colorStrength
  const pathSepia = Math.max(0, (whiteBalance - 5600) / 3400) * 0.14 * rawMix

  const t = useT()
  const [sceneReady, setSceneReady] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [hint, setHint] = useState<{ id: number; text: string } | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const result = runShortcut(event)
      if (!result?.message) return
      const text = result.message
      setHint({ id: hintSequence++, text })
      if (hintTimer.current) clearTimeout(hintTimer.current)
      hintTimer.current = setTimeout(() => setHint(null), 1600)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (hintTimer.current) clearTimeout(hintTimer.current)
    }
  }, [])

  return (
    <main className="app-shell">
      <TopBar onOpenGuide={() => setGuideOpen(true)} />
      <Library />
      <section className={`viewport ${renderMode === 'path' ? 'path-color-science' : ''}`} aria-label={t('viewport.aria')} style={{ '--path-saturation': pathSaturation, '--path-contrast': pathContrast, '--path-sepia': pathSepia } as React.CSSProperties}>
        <Canvas
          onCreated={() => setSceneReady(true)}
          shadows="percentage"
          dpr={[1, 1.75]}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          camera={{ position: [6.8, 4.8, 7.2], fov: 42, near: 0.05, far: 100 }}
        >
          <Suspense fallback={null}><StudioScene /></Suspense>
        </Canvas>
        {!sceneReady && (
          <div className="viewport-loading" role="status">
            <span className="viewport-loading-mark"><i /></span>
            <strong>{t('viewport.loading')}</strong>
            <small>BUILDING STUDIO · WEBGL</small>
          </div>
        )}
        <div className={`viewport-label ${renderMode === 'path' ? 'rendering' : ''}`}><span className="status-dot" /> {renderMode === 'path' ? (pathStatus === 'building' ? 'BUILDING SCENE' : `PATH TRACING · ${Math.floor(pathSamples)} SPP`) : 'LIVE LIGHTING'} <b>{renderMode === 'path' ? 'HQ' : '60 FPS'}</b></div>
        <div className="axis-label">{renderMode === 'path' ? `${cameraMode.toUpperCase()} · ${SENSOR_LABELS[sensorFormat]} · ${frameAspect}` : view === 'camera' ? `${cameras.find((camera) => camera.id === activeCameraId)?.name.toUpperCase() ?? 'CAMERA'} · ${SENSOR_LABELS[sensorFormat]} · ${frameAspect} ${frameOrientation === 'portrait' ? 'V' : 'H'}` : view === 'top' ? 'TOP PLAN · METERS' : `STUDIO · ${roomWidth} × ${roomDepth} M`}</div>
        <SceneToolbar />
        <RenderToolbar />
        <ViewfinderOverlay />
        <PathLensOverlay />
        <PathColorOverlay />
        <PathSensorOverlay />
        <ExposureAnalysis />
        <ShotLibrary />
        <ShortcutLauncher />
        <ShortcutHint hint={hint} />
      </section>
      <Inspector />
      <ProfessionalPanel />
      <BottomReadout />
      <ShortcutHelp />
      <SetupSheetHost />
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </main>
  )
}
