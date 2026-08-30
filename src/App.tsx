import { Canvas } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { StudioScene } from './components/StudioScene'
import { ExposureAnalysis } from './components/ExposureAnalysis'
import { ShotLibrary } from './components/ShotLibrary'
import { SetupLibrary } from './components/SetupLibrary'
import { ProfessionalPanel } from './components/ProfessionalPanel'
import { AboutDialog, CopyrightMark } from './components/AboutDialog'
import { SetupSheet } from './components/SetupSheet'
import { ShortcutHelp, ShortcutHint, ShortcutLauncher } from './components/ShortcutHelp'
import { runShortcut } from './shortcuts'
import { downloadFramePng } from './shotCapture'
import { calculateDepthOfField } from './optics'
import { LOCALES, useLocaleStore, useT, type Locale } from './i18n'
import { useStudio } from './store'
import { buildShareLink, copyToClipboard } from './share'
import { COLOR_PROFILES } from './colorScience'
import { CAMERA_BODIES } from './cameraProfiles'
import { MAX_PROJECT_FILE_BYTES, readTextFileWithinLimit } from './security'
import { BrandMark } from './components/BrandMark'
import { CanvasHealth } from './components/CanvasHealth'
import { useDialogFocus } from './components/DialogFocus'
import { OnboardingTour, shouldShowOnboarding } from './components/OnboardingTour'
import { AssetDrawer, BlueprintPanel, ContinuityGuardPanel, DecisionConsole, ReferenceMatchPanel, ViewModeDock, WorkflowNavigation } from './components/WorkflowShell'
import { useUiModeStore } from './uiMode'

let hintSequence = 0

const SENSOR_COC = { 'full-frame': 0.03, 'aps-c': 0.019, mft: 0.015 } as const
const GUIDE_CHAPTERS: Record<Locale, readonly string[]> = {
  en: ['Start here', 'Three-stage workflow', 'Define', 'Block', 'Shape', 'Frame', 'Verify', 'Shoot Blueprint', 'Selected Decision', 'Finish and export'],
  zh: ['從這裡開始', '三階段拍攝流程', '定調', '走位', '塑光', '取景', '驗證', '拍攝藍圖', '目前決策', '完成與輸出'],
  ja: ['ここから開始', '3 段階のフロー', '方向', '配置', '光作り', '構図', '検証', '撮影ブループリント', '現在の判断', '完了と出力'],
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
  const locale = useLocaleStore((state) => state.locale)
  const overlayCopy = locale === 'zh'
    ? { depth: '景深', landscape: '橫幅', portrait: '直幅' }
    : locale === 'ja'
      ? { depth: '被写界深度', landscape: '横位置', portrait: '縦位置' }
      : { depth: 'DOF', landscape: 'Landscape', portrait: 'Portrait' }
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
        {focusGuide && renderMode === 'preview' && <span className="focus-point"><i /><b>AF-S · {focusDistance.toFixed(2)} m</b><small>{overlayCopy.depth} {depth.range.toFixed(2)} m</small></span>}
        {compositionGuide === 'thirds' && <><div className="thirds vertical one" /><div className="thirds vertical two" /><div className="thirds horizontal one" /><div className="thirds horizontal two" /></>}
        {compositionGuide === 'golden' && <><div className="guide-line vertical golden-one" /><div className="guide-line vertical golden-two" /><div className="guide-line horizontal golden-one" /><div className="guide-line horizontal golden-two" /></>}
        {compositionGuide === 'safe' && <div className="safe-area-guide"><span>SAFE AREA</span></div>}
      </div>
      <span className="frame-format-label">{frameAspect} · {frameOrientation === 'landscape' ? overlayCopy.landscape : overlayCopy.portrait}</span>
      {cameraMode === 'cinema' && <><span className="cinema-frame-line top" /><span className="cinema-frame-line bottom" /><span className="cinema-status">REC FORMAT · {frameRate} FPS · {shutterAngle}°</span></>}
      {syncError && <div className="sync-curtain-warning" style={{ '--curtain-height': `${Math.round((1 - syncSpeed / shutter) * 100)}%` } as React.CSSProperties}><i /><span>FLASH SYNC LIMIT · 1/{syncSpeed}s</span></div>}
    </div>
  )
}

/** Drag-to-pose handles on the selected figure. */
function PoseHandleButton() {
  const t = useT()
  const on = useStudio((state) => state.poseHandles)
  const setValue = useStudio((state) => state.setValue)
  const isFigure = useStudio((state) => state.selected === 'model' || state.studioObjects.some((object) => object.id === state.selected && object.type === 'subject'))
  if (!isFigure) return null
  return (
    <button
      className={on ? 'active pose-active' : ''}
      onClick={() => setValue('poseHandles', !on)}
      title={t('scene.pose.title')}
    >
      <i className="pose-glyph" />{t('scene.pose')} <kbd>H</kbd>
    </button>
  )
}

/** Placement snapping: 15° and 25 cm steps around the subject a light is aimed at. */
function SnapButton() {
  const t = useT()
  const snap = useStudio((state) => state.placementSnap)
  const setValue = useStudio((state) => state.setValue)
  return (
    <button className={snap ? 'active' : ''} onClick={() => setValue('placementSnap', !snap)} title={t('scene.snap.title')}>
      <i className="snap-glyph" />{t('scene.snap')} <kbd>⇧S</kbd>
    </button>
  )
}

/** Measure-mode toggle. Shows the live reading so the tool is worth keeping on. */
function MeasureButton() {
  const t = useT()
  const measureMode = useStudio((state) => state.measureMode)
  const points = useStudio((state) => state.measurePoints)
  const setValue = useStudio((state) => state.setValue)
  const clearMeasure = useStudio((state) => state.clearMeasure)
  const complete = points.length === 2
  const distance = complete ? Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]) : 0

  return (
    <button
      className={measureMode ? 'active measure-active' : ''}
      onClick={() => { if (measureMode) clearMeasure(); else { setValue('lightAimMode', false); setValue('measureMode', true) } }}
      title={t('scene.measure.title')}
    >
      <i className="measure-glyph" />
      {complete ? `${distance.toFixed(2)} m` : t('scene.measure')} <kbd>N</kbd>
    </button>
  )
}

function SetupLibraryHost() {
  const open = useStudio((state) => state.setupLibraryOpen)
  return open ? <SetupLibrary /> : null
}

function SetupSheetHost() {
  const open = useStudio((state) => state.setupSheetOpen)
  return open ? <SetupSheet /> : null
}

const MORE_MENU_COPY: Record<Locale, { trigger: string; title: string; history: string; undo: string; redo: string; workspace: string; project: string; focus: string; showPanels: string; pro: string; presets: string; on: string; off: string; mobile: string; export: string }> = {
  en: { trigger: 'More', title: 'Workspace and project tools', history: 'History', undo: 'Undo', redo: 'Redo', workspace: 'Workspace', project: 'Project', focus: 'Focus view', showPanels: 'Show panels', pro: 'Professional controls', presets: 'Presets', on: 'On', off: 'Off', mobile: 'Mobile', export: 'Export' },
  zh: { trigger: '更多', title: '工作區與專案工具', history: '操作紀錄', undo: '復原', redo: '重做', workspace: '工作區', project: '專案', focus: '專注檢視', showPanels: '顯示面板', pro: '專業控制', presets: '預設', on: '開啟', off: '關閉', mobile: '手機', export: '匯出' },
  ja: { trigger: 'その他', title: 'ワークスペースとプロジェクト', history: '履歴', undo: '元に戻す', redo: 'やり直す', workspace: 'ワークスペース', project: 'プロジェクト', focus: '集中表示', showPanels: 'パネル表示', pro: 'プロ設定', presets: 'プリセット', on: 'オン', off: 'オフ', mobile: 'モバイル', export: '書き出す' },
}

/** Keep the header focused on one primary action; occasional tools live here. */
function MoreMenu({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onImport,
  onSave,
  onTogglePanels,
  panelsHidden,
  onOpenSetups,
  onOpenSheet,
  onTogglePro,
  proOpen,
  onOpenGuide,
  onOpenMobile,
}: {
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onImport: () => void
  onSave: () => void
  onTogglePanels: () => void
  panelsHidden: boolean
  onOpenSetups: () => void
  onOpenSheet: () => void
  onTogglePro: () => void
  proOpen: boolean
  onOpenGuide: () => void
  onOpenMobile: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const t = useT()
  const locale = useLocaleStore((state) => state.locale)
  const copy = MORE_MENU_COPY[locale]

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
      <button ref={trigger} className={open ? 'active' : ''} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} title={copy.title}>
        {copy.trigger} <i aria-hidden="true" />
      </button>
      {open && (
        <div className="file-menu-list more-menu-list" role="menu">
          <span className="file-menu-group">{copy.history}</span>
          <button role="menuitem" disabled={!canUndo} onClick={pick(onUndo)}>{copy.undo}<small>⌘Z</small></button>
          <button role="menuitem" disabled={!canRedo} onClick={pick(onRedo)}>{copy.redo}<small>⇧⌘Z</small></button>
          <span className="file-menu-group">{copy.workspace}</span>
          <button role="menuitem" onClick={pick(onTogglePanels)}>{panelsHidden ? copy.showPanels : copy.focus}<small>Tab</small></button>
          <button role="menuitem" onClick={pick(onOpenSetups)}>{t('setups.launcher')}<small>{copy.presets}</small></button>
          <button role="menuitem" onClick={pick(onOpenSheet)}>{t('topbar.setupSheet')}<small>PDF</small></button>
          <button role="menuitem" onClick={pick(onTogglePro)}>{copy.pro}<small>{proOpen ? copy.on : copy.off}</small></button>
          <button role="menuitem" onClick={pick(onOpenGuide)}>{t('topbar.guide')}<small>?</small></button>
          <button role="menuitem" onClick={pick(onOpenMobile)}>{t('mobile.compact')}<small>{copy.mobile}</small></button>
          <span className="file-menu-group">{copy.project}</span>
          <button role="menuitem" onClick={pick(onSave)}>{t('topbar.save')}<small>⌘S</small></button>
          <button role="menuitem" onClick={pick(onImport)}>{t('file.import')}<small>.json</small></button>
          <ShareLinkItem onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

/**
 * "Copy share link".
 *
 * The whole scene goes into the URL, so the link is the scene — nothing is
 * uploaded anywhere and it keeps working with no service behind it.
 */
function ShareLinkItem({ onDone }: { onDone: () => void }) {
  const t = useT()
  const shareableJson = useStudio((state) => state.shareableJson)
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  const share = async () => {
    try {
      const link = await buildShareLink(shareableJson())
      const copied = await copyToClipboard(link)
      setStatus(copied ? 'copied' : 'error')
      // Long enough to read, short enough that the menu is not stuck open.
      window.setTimeout(() => { setStatus('idle'); onDone() }, 1400)
    } catch {
      setStatus('error')
    }
  }

  return (
    <button role="menuitem" onClick={share}>
      {t('file.share')}
      <small>{status === 'copied' ? t('file.share.copied') : status === 'error' ? t('file.share.error') : t('file.share.sub')}</small>
    </button>
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

function TopBar({ onOpenGuide, onOpenAbout, panelsHidden, onTogglePanels }: { onOpenGuide: () => void; onOpenAbout: () => void; panelsHidden: boolean; onTogglePanels: () => void }) {
  const t = useT()
  const locale = useLocaleStore((state) => state.locale)
  const saveProject = useStudio((state) => state.saveProject)
  const exportProject = useStudio((state) => state.exportProject)
  const importProject = useStudio((state) => state.importProject)
  const saveStatus = useStudio((state) => state.saveStatus)
  const projectName = useStudio((state) => state.projectName)
  const setValue = useStudio((state) => state.setValue)
  const professionalPanelOpen = useStudio((state) => state.professionalPanelOpen)
  const undo = useStudio((state) => state.undo)
  const redo = useStudio((state) => state.redo)
  const canUndo = useStudio((state) => state.undoStack.length > 0)
  const canRedo = useStudio((state) => state.redoStack.length > 0)
  const setUiMode = useUiModeStore((state) => state.setMode)
  const projectInput = useRef<HTMLInputElement>(null)

  return (
    <header className="topbar simplified-topbar">
      <div className="brand" aria-label="Lumen Stage">
        <BrandMark />
        <div><strong>LUMEN</strong><small>STAGE / 001</small></div>
      </div>
      <div className="project-title"><span>PROJECT</span><input className="project-name-input" aria-label={t('topbar.projectName')} value={projectName} onChange={(event) => setValue('projectName', event.target.value)} /><small className={`save-state ${saveStatus}`}>{saveStatus === 'saved' ? t('topbar.save.saved') : saveStatus === 'autosaved' ? t('topbar.save.autosaved') : saveStatus === 'loaded' ? t('topbar.save.loaded') : saveStatus === 'exported' ? t('topbar.save.exported') : saveStatus === 'error' ? t('topbar.save.error') : t('topbar.save.idle')}</small><LanguageSwitch /></div>
      <WorkflowNavigation />
      <div className="project-actions is-simplified">
        <button className="history-button" onClick={undo} disabled={!canUndo} title={t('library.undo.title')} aria-label={t('library.undo.title')}>↶</button>
        <button className="history-button" onClick={redo} disabled={!canRedo} title={t('library.redo.title')} aria-label={t('library.redo.title')}>↷</button>
        <input ref={projectInput} className="asset-input" type="file" accept=".json,.lumen.json,application/json" onChange={async (event) => {
          const file = event.target.files?.[0]
          if (file) {
            try { importProject(await readTextFileWithinLimit(file, MAX_PROJECT_FILE_BYTES)) }
            catch { useStudio.setState({ saveStatus: 'error' }) }
          }
          event.target.value = ''
        }} />
        <MoreMenu
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onImport={() => projectInput.current?.click()}
          onSave={saveProject}
          onTogglePanels={onTogglePanels}
          panelsHidden={panelsHidden}
          onOpenSetups={() => setValue('setupLibraryOpen', true)}
          onOpenSheet={() => setValue('setupSheetOpen', true)}
          onTogglePro={() => setValue('professionalPanelOpen', !professionalPanelOpen)}
          proOpen={professionalPanelOpen}
          onOpenGuide={onOpenGuide}
          onOpenMobile={() => setUiMode('mobile')}
        />
        <button className="topbar-export-button" onClick={exportProject} title={t('file.export')}>{MORE_MENU_COPY[locale].export}</button>
        <CopyrightMark onOpen={onOpenAbout} />
      </div>
    </header>
  )
}

export function GuideModal({ open, onClose, onStartTour }: { open: boolean; onClose: () => void; onStartTour: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const [zoomed, setZoomed] = useState(false)
  const pageCount = 10
  const locale = useLocaleStore((state) => state.locale)
  const t = useT()
  const chapters = GUIDE_CHAPTERS[locale]

  const goToPage = useCallback((nextPage: number, behavior: ScrollBehavior = 'smooth') => {
    const targetPage = Math.max(1, Math.min(pageCount, nextPage))
    const stage = stageRef.current
    const target = stage?.querySelector<HTMLElement>(`[data-guide-page="${targetPage}"]`)
    const previousScrollBehavior = stage?.style.scrollBehavior
    if (stage && behavior === 'auto') stage.style.scrollBehavior = 'auto'
    target?.scrollIntoView({ behavior, block: 'start' })
    if (stage && behavior === 'auto') window.requestAnimationFrame(() => { stage.style.scrollBehavior = previousScrollBehavior ?? '' })
    setPage(targetPage)
  }, [])

  useEffect(() => {
    if (!open) return
    setPage(1)
    setZoomed(false)
    window.requestAnimationFrame(() => stageRef.current?.scrollTo({ top: 0 }))
  }, [open, onClose, locale])
  useDialogFocus(dialogRef, open, onClose)

  if (!open) return null
  const guideUrl = locale === 'en'
    ? '/LUMEN_STAGE_Site_Guide_EN.pdf'
    : locale === 'ja'
      ? '/LUMEN_STAGE_サイトガイド_JA.pdf'
      : '/LUMEN_STAGE_網站使用教學.pdf'

  return (
    <div className="guide-overlay" role="dialog" aria-modal="true" aria-label={t('guide.aria')} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="guide-dialog" onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); goToPage(page + 1) }
        if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); goToPage(page - 1) }
        if (event.key === 'Home') { event.preventDefault(); goToPage(1) }
        if (event.key === 'End') { event.preventDefault(); goToPage(pageCount) }
      }}>
        <header>
          <div><strong>{t('guide.title')}</strong><small>{t('guide.languageNote')} · {t('guide.duration')}</small></div>
          <div className="guide-actions">
            <button className="guide-tour-button" onClick={onStartTour}>{t('tour.replay')}</button>
            <button className="guide-zoom-button" onClick={() => setZoomed((current) => !current)} aria-pressed={zoomed}>{zoomed ? t('guide.fitWidth') : t('guide.zoomIn')}</button>
            <a href={guideUrl} download>{t('guide.download')}</a>
            <button ref={closeButton} onClick={onClose} aria-label={t('guide.close')}>×</button>
          </div>
        </header>
        <div className="guide-workspace">
          <aside className="guide-chapters" aria-label={t('guide.contents')}>
            <div className="guide-progress"><span>{t('guide.progress', { n: page, total: pageCount })}</span><i style={{ '--guide-progress': `${page / pageCount * 100}%` } as React.CSSProperties} /></div>
            <ol>
              {chapters.map((chapter, index) => <li key={chapter}><button className={page === index + 1 ? 'active' : ''} aria-current={page === index + 1 ? 'page' : undefined} onClick={() => goToPage(index + 1, 'auto')}><span>{String(index + 1).padStart(2, '0')}</span>{chapter}</button></li>)}
            </ol>
          </aside>
          <div ref={stageRef} className={`guide-page-stage${zoomed ? ' is-zoomed' : ''}`} role="document" aria-label={t('guide.stage')} tabIndex={0} onScroll={(event) => {
            const viewport = event.currentTarget.getBoundingClientRect()
            const center = viewport.top + viewport.height / 2
            const pages = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-guide-page]'))
            let nearest = 1
            let distance = Number.POSITIVE_INFINITY
            pages.forEach((item, index) => {
              const rect = item.getBoundingClientRect()
              const nextDistance = Math.abs(rect.top + rect.height / 2 - center)
              if (nextDistance < distance) { distance = nextDistance; nearest = index + 1 }
            })
            setPage((current) => current === nearest ? current : nearest)
          }}>
            {chapters.map((chapter, index) => <figure key={`${locale}-${index + 1}`} data-guide-page={index + 1}><img loading={index < 2 ? 'eager' : 'lazy'} src={`/guide-pages/${locale}/page-${String(index + 1).padStart(2, '0')}.png`} alt={t('guide.pageNamed', { n: index + 1, title: chapter })} /><figcaption><span>{String(index + 1).padStart(2, '0')}</span>{chapter}</figcaption></figure>)}
          </div>
        </div>
        <footer className="guide-footer">
          <span>{t('guide.keyboardHint')}</span>
          <div><button onClick={() => goToPage(page - 1)} disabled={page === 1}>{t('guide.previous')}</button><strong aria-live="polite">{page} / {pageCount}</strong><button onClick={() => goToPage(page + 1)} disabled={page === pageCount}>{page === pageCount ? t('guide.done') : t('guide.next')}</button></div>
        </footer>
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
  const t = useT()

  if (renderMode !== 'path') return null

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
      <button className="export-button" onClick={downloadFramePng} disabled={samples < 1}>{t('render.exportPng')}</button>
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
      <button disabled={selected !== 'model' && !selectedLight && !selectedModifier && !selectedStudioObject} className={mode === 'rotate' && !aimMode ? 'active' : ''} onClick={() => { setValue('lightAimMode', false); setValue('transformMode', 'rotate') }} title={t('scene.rotate.title')}><i className="rotate-glyph" />{t('scene.rotate')} <kbd>R</kbd></button>
      <PoseHandleButton />
      <SnapButton />
      <MeasureButton />
    </div>
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
  const locale = useLocaleStore((state) => state.locale)
  const viewportCopy = locale === 'zh'
    ? { buildingStudio: '建立攝影棚', interrupted: '3D 畫面已中斷', safe: '專案仍已儲存，重新載入即可重建攝影棚。', reload: '重新載入', buildingScene: '建立場景', pathTracing: '路徑追蹤', liveLighting: '即時佈光', studio: '攝影棚', topPlan: '俯視圖', meters: '公尺', camera: '相機', fullFrame: '全片幅', portrait: '直幅', landscape: '橫幅', photo: '照片', cinema: '電影' }
    : locale === 'ja'
      ? { buildingStudio: 'スタジオを構築中', interrupted: '3D 表示が中断しました', safe: 'プロジェクトは保存されています。再読み込みしてスタジオを再構築してください。', reload: '再読み込み', buildingScene: 'シーンを構築中', pathTracing: 'パストレーシング', liveLighting: 'ライブ照明', studio: 'スタジオ', topPlan: '平面図', meters: 'メートル', camera: 'カメラ', fullFrame: 'フルサイズ', portrait: '縦位置', landscape: '横位置', photo: '写真', cinema: 'シネマ' }
      : { buildingStudio: 'Building studio', interrupted: '3D renderer interrupted', safe: 'Your project is still saved. Reload to rebuild the studio.', reload: 'Reload studio', buildingScene: 'Building scene', pathTracing: 'Path tracing', liveLighting: 'Live lighting', studio: 'Studio', topPlan: 'Top plan', meters: 'Meters', camera: 'Camera', fullFrame: 'Full frame', portrait: 'Portrait', landscape: 'Landscape', photo: 'Photo', cinema: 'Cinema' }
  const sensorLabel = sensorFormat === 'full-frame' ? viewportCopy.fullFrame : sensorFormat === 'aps-c' ? 'APS-C' : 'MFT'
  const selectedCameraName = cameras.find((camera) => camera.id === activeCameraId)?.name
  const cameraLabel = !selectedCameraName || /^camera\s*a$/i.test(selectedCameraName) ? `${viewportCopy.camera} A` : selectedCameraName
  const panelSideLabel = locale === 'zh'
    ? { hideLeft: '收起左側面板', showLeft: '顯示左側面板', hideRight: '收起右側面板', showRight: '顯示右側面板', hideTop: '收起上方功能列', showTop: '顯示上方功能列' }
    : locale === 'ja'
      ? { hideLeft: '左パネルを隠す', showLeft: '左パネルを表示', hideRight: '右パネルを隠す', showRight: '右パネルを表示', hideTop: '上部バーを隠す', showTop: '上部バーを表示' }
      : { hideLeft: 'Hide left panel', showLeft: 'Show left panel', hideRight: 'Hide right panel', showRight: 'Show right panel', hideTop: 'Hide top bar', showTop: 'Show top bar' }
  const panelSideName = locale === 'zh' ? { left: '左欄', right: '右欄', top: '上欄' } : locale === 'ja' ? { left: '左', right: '右', top: '上' } : { left: 'LEFT', right: 'RIGHT', top: 'TOP' }
  const [sceneReady, setSceneReady] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [webglLost, setWebglLost] = useState(false)
  const [workspacePanels, setWorkspacePanels] = useState(() => {
    try {
      const currentSaved = window.localStorage.getItem('lumen-stage:workspace-panels:v3')
      const saved = currentSaved ?? window.localStorage.getItem('lumen-stage:workspace-panels:v2')
      const parsed = saved ? JSON.parse(saved) as Partial<{ left: boolean; right: boolean; top: boolean }> : {}
      return { left: parsed.left ?? true, right: currentSaved ? parsed.right ?? true : true, top: parsed.top ?? true }
    } catch {
      return { left: true, right: true, top: true }
    }
  })
  const onWebglLost = useCallback(() => setWebglLost(true), [])
  const onWebglRestored = useCallback(() => setWebglLost(false), [])
  const [hint, setHint] = useState<{ id: number; text: string } | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const allPanelsHidden = !workspacePanels.left && !workspacePanels.right && !workspacePanels.top
  const anyPanelHidden = !workspacePanels.left || !workspacePanels.right || !workspacePanels.top

  const toggleAllPanels = useCallback(() => {
    setWorkspacePanels((current) => !current.left || !current.right || !current.top
      ? { left: true, right: true, top: true }
      : { left: false, right: false, top: false })
  }, [])

  useEffect(() => {
    window.localStorage.setItem('lumen-stage:workspace-panels:v3', JSON.stringify(workspacePanels))
  }, [workspacePanels])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditing = target?.closest('input, textarea, select, button, a, [contenteditable="true"]')
      if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey && (!isEditing || allPanelsHidden)) {
        event.preventDefault()
        toggleAllPanels()
        return
      }
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
  }, [allPanelsHidden, toggleAllPanels])

  useEffect(() => {
    if (!sceneReady || !shouldShowOnboarding('desktop')) return
    const timer = window.setTimeout(() => setTourOpen(true), 700)
    return () => window.clearTimeout(timer)
  }, [sceneReady])

  return (
    <main className={`app-shell ${workspacePanels.left ? '' : 'left-panel-hidden'} ${workspacePanels.right ? '' : 'right-panel-hidden'} ${workspacePanels.top ? '' : 'top-panel-hidden'}`}>
      <TopBar onOpenGuide={() => setGuideOpen(true)} onOpenAbout={() => setAboutOpen(true)} panelsHidden={anyPanelHidden} onTogglePanels={toggleAllPanels} />
      <BlueprintPanel />
      <section className={`viewport ${renderMode === 'path' ? 'path-color-science' : ''}`} aria-label={t('viewport.aria')} style={{ '--path-saturation': pathSaturation, '--path-contrast': pathContrast, '--path-sepia': pathSepia } as React.CSSProperties}>
        <Canvas
          onCreated={() => setSceneReady(true)}
          shadows="percentage"
          dpr={[1, 1.75]}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          camera={{ position: [6.8, 4.8, 7.2], fov: 42, near: 0.05, far: 100 }}
        >
          <CanvasHealth onLost={onWebglLost} onRestored={onWebglRestored} />
          <Suspense fallback={null}><StudioScene /></Suspense>
        </Canvas>
        {!sceneReady && (
          <div className="viewport-loading" role="status">
            <span className="viewport-loading-mark"><i /></span>
            <strong>{t('viewport.loading')}</strong>
            <small>{viewportCopy.buildingStudio} · WebGL</small>
          </div>
        )}
        {webglLost && <div className="webgl-notice" role="alert"><strong>{viewportCopy.interrupted}</strong><span>{viewportCopy.safe}</span><button onClick={() => location.reload()}>{viewportCopy.reload}</button></div>}
        <div className={`viewport-label ${renderMode === 'path' ? 'rendering' : ''}`}><span className="status-dot" /> {renderMode === 'path' ? (pathStatus === 'building' ? viewportCopy.buildingScene : `${viewportCopy.pathTracing} · ${Math.floor(pathSamples)} SPP`) : viewportCopy.liveLighting} <b>{renderMode === 'path' ? 'HQ' : '60 FPS'}</b></div>
        <div className="axis-label">{renderMode === 'path' ? `${cameraMode === 'cinema' ? viewportCopy.cinema : viewportCopy.photo} · ${sensorLabel} · ${frameAspect}` : view === 'camera' ? `${cameraLabel} · ${sensorLabel} · ${frameAspect} · ${frameOrientation === 'portrait' ? viewportCopy.portrait : viewportCopy.landscape}` : view === 'top' ? `${viewportCopy.topPlan} · ${viewportCopy.meters}` : `${viewportCopy.studio} · ${roomWidth} × ${roomDepth} m`}</div>
        <ViewModeDock />
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
        <button className={`workspace-panel-tab left ${workspacePanels.left ? 'panel-visible' : ''}`} onClick={() => setWorkspacePanels((current) => ({ ...current, left: !current.left }))} aria-label={workspacePanels.left ? panelSideLabel.hideLeft : panelSideLabel.showLeft} title={workspacePanels.left ? panelSideLabel.hideLeft : panelSideLabel.showLeft}><span aria-hidden="true">{panelSideName.left}</span><i aria-hidden="true" /></button>
        <button className={`workspace-panel-tab right ${workspacePanels.right ? 'panel-visible' : ''}`} onClick={() => setWorkspacePanels((current) => ({ ...current, right: !current.right }))} aria-label={workspacePanels.right ? panelSideLabel.hideRight : panelSideLabel.showRight} title={workspacePanels.right ? panelSideLabel.hideRight : panelSideLabel.showRight}><span aria-hidden="true">{panelSideName.right}</span><i aria-hidden="true" /></button>
        <button className={`workspace-panel-tab top ${workspacePanels.top ? 'panel-visible' : ''}`} onClick={() => setWorkspacePanels((current) => ({ ...current, top: !current.top }))} aria-label={workspacePanels.top ? panelSideLabel.hideTop : panelSideLabel.showTop} title={workspacePanels.top ? panelSideLabel.hideTop : panelSideLabel.showTop}><span aria-hidden="true">{panelSideName.top}</span><i aria-hidden="true" /></button>
      </section>
      <DecisionConsole />
      <ProfessionalPanel />
      <ShortcutHelp />
      <SetupLibraryHost />
      <SetupSheetHost />
      <AssetDrawer />
      <ReferenceMatchPanel />
      <ContinuityGuardPanel />
      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} onStartTour={() => { setGuideOpen(false); setTourOpen(true) }} />
      <OnboardingTour open={tourOpen} scope="desktop" onClose={() => setTourOpen(false)} onOpenGuide={() => setGuideOpen(true)} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </main>
  )
}
