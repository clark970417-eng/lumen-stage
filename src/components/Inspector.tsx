import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useStudio, type MakeupStyle, type OutfitFabric, type PosePreset, type StudioLight, type StudioObject, type StudioState } from '../store'
import { calculateDepthOfField } from '../optics'
import { effectiveLightOutput, flashSyncFactor, lightWattage, opticTransmission, percentForWattage, wattageMinimum, wattageLimit } from '../lightProfiles'
import { automaticLensProfileId, CAMERA_BODIES, LENS_PROFILES } from '../cameraProfiles'
import { COLOR_PROFILES, type ColorProfileId } from '../colorScience'
import { useCatalogT, useLocaleStore, useT, type MessageKey } from '../i18n'
import { GEL_CATEGORIES, GELS, gelStopLoss, geledTemperature, getGel, type GelCategory } from '../gels'
import { CastPanel, PhysiquePanel, PoseControls, PoseLibraryPanel, WardrobePanel } from './SubjectPanels'
import { castMember } from '../actorCast'
import { lightAimAngles, targetFromLightAim } from '../lightAim'
import { appearanceIsBaked, DEFAULT_HUMAN_NAME, shippedHumanFor } from '../characterAssets'
import { useWorkflow } from '../workflow'
import { workflowModeForStage, type WorkflowMode } from '../workflowControl'

type RangeProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  displayValue?: string
  disabled?: boolean
  onChange: (value: number) => void
}

const beginRangeEdit = () => useStudio.getState().beginHistoryTransaction()
const endRangeEdit = () => useStudio.getState().endHistoryTransaction()

function Range({ label, value, min, max, step = 1, unit = '', displayValue, disabled = false, onChange }: RangeProps) {
  const progress = ((value - min) / (max - min)) * 100
  return (
    <label className="control-row">
      <span>{label}</span><output>{displayValue ?? `${value}${unit}`}</output>
      <input aria-label={label} disabled={disabled} type="range" min={min} max={max} step={step} value={value} style={{ '--progress': `${progress}%` } as React.CSSProperties} onPointerDown={beginRangeEdit} onPointerUp={endRangeEdit} onPointerCancel={endRangeEdit} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

type DrawerComparison<T> = { capture: () => T; apply: (snapshot: T) => void }

const InspectorSearchContext = createContext('')

function InspectorDrawer<T>({ title, meta, action, comparison, className = '', children }: { title: string; meta?: string; action?: ReactNode; comparison?: DrawerComparison<T>; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const search = useContext(InspectorSearchContext)
  const locale = useLocaleStore((state) => state.locale)
  const baseline = useRef<T | null>(null)
  const current = useRef<T | null>(null)
  const labels = locale === 'zh'
    ? { compare: '前後', compareAria: '按住查看調整前', reset: '重設' }
    : locale === 'ja'
      ? { compare: '前後', compareAria: '長押しで調整前を表示', reset: 'リセット' }
      : { compare: 'Before', compareAria: 'Hold to preview before', reset: 'Reset' }
  const toggle = () => {
    if (!open && comparison) baseline.current = comparison.capture()
    setOpen((value) => !value)
  }
  const showBefore = () => {
    if (!comparison || baseline.current === null || current.current !== null) return
    current.current = comparison.capture()
    comparison.apply(baseline.current)
  }
  const showAfter = () => {
    if (!comparison || current.current === null) return
    comparison.apply(current.current)
    current.current = null
  }
  const resetSection = () => {
    showAfter()
    if (comparison && baseline.current !== null) comparison.apply(baseline.current)
  }
  return <section className={`inspector-section inspector-drawer ${open ? 'is-open' : 'is-collapsed'} ${className}`}>
    <div className="section-title inspector-drawer-heading">
      <button className="inspector-drawer-toggle" aria-expanded={open} onClick={toggle}>
        <i aria-hidden="true" /><span>{title}</span>{meta && <small>{meta}</small>}
      </button>
      {(action || comparison) && <div className="inspector-drawer-action">
        {comparison && <div className="inspector-drawer-tools">
          <button disabled={baseline.current === null} title={labels.compareAria} aria-label={labels.compareAria}
            onPointerDown={(event) => { event.preventDefault(); showBefore() }} onPointerUp={showAfter} onPointerCancel={showAfter} onPointerLeave={showAfter}
            onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') showBefore() }} onKeyUp={showAfter}>{labels.compare}</button>
          <button disabled={baseline.current === null} onClick={resetSection}>{labels.reset}</button>
        </div>}
        {action}
      </div>}
    </div>
    {(open || Boolean(search)) && <div className="inspector-drawer-content">{children}</div>}
  </section>
}

function captureStudio<K extends keyof StudioState>(state: StudioState, keys: readonly K[]): Pick<StudioState, K> {
  return Object.fromEntries(keys.map((key) => [key, structuredClone(state[key])])) as Pick<StudioState, K>
}

function applyStudio(snapshot: Partial<StudioState>) {
  useStudio.setState(snapshot)
}

function captureLight<K extends keyof StudioLight>(light: StudioLight, keys: readonly K[]): Pick<StudioLight, K> {
  return Object.fromEntries(keys.map((key) => [key, structuredClone(light[key])])) as Pick<StudioLight, K>
}

function applyLight(id: string, snapshot: Partial<StudioLight>) {
  useStudio.setState((state) => ({ lights: state.lights.map((item) => item.id === id ? { ...item, ...snapshot } : item) }))
}

function InspectorFooter({ mode }: { mode: WorkflowMode }) {
  const state = useStudio()
  const locale = useLocaleStore((item) => item.locale)
  const [saved, setSaved] = useState(false)
  const [presetOpen, setPresetOpen] = useState(false)
  const storageKey = `lumen-stage:${mode}-preset`
  const [hasPreset, setHasPreset] = useState(() => Boolean(localStorage.getItem(storageKey)))
  const copy = locale === 'zh'
    ? { reset: '重設', presets: '預設', save: '儲存預設', saved: '預設已儲存', title: '目前模式的預設', current: '已儲存的預設', empty: '尚未儲存預設', apply: '套用', remove: '刪除' }
    : locale === 'ja'
      ? { reset: 'リセット', presets: 'プリセット', save: 'プリセットを保存', saved: '保存しました', title: '現在のモードのプリセット', current: '保存済みプリセット', empty: 'プリセットはまだありません', apply: '適用', remove: '削除' }
      : { reset: 'Reset', presets: 'Presets', save: 'Save preset', saved: 'Preset saved', title: 'Preset for this mode', current: 'Saved preset', empty: 'No preset saved yet', apply: 'Apply', remove: 'Delete' }
  useEffect(() => {
    setPresetOpen(false)
    setHasPreset(Boolean(localStorage.getItem(storageKey)))
  }, [storageKey])
  const readPreset = (): { savedAt: number; value: unknown } | null => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { savedAt?: unknown; value?: unknown }
      return typeof parsed.savedAt === 'number' && 'value' in parsed
        ? { savedAt: parsed.savedAt, value: parsed.value }
        : { savedAt: 0, value: parsed }
    } catch {
      return null
    }
  }
  const reset = () => {
    if (mode === 'lighting') {
      state.resetLighting()
      return
    }
    if (mode === 'person') {
      const selectedObject = state.studioObjects.find((item) => item.id === state.selected)
      if (selectedObject) {
        if (selectedObject.type === 'subject') state.applyStudioSubjectPose(selectedObject.id, 'neutral')
        state.updateStudioObject(selectedObject.id, {
          rotationY: 0,
          ...(selectedObject.type === 'subject' ? { position: [selectedObject.position[0], 0, selectedObject.position[2]] as [number, number, number] } : {}),
        })
      } else {
        state.applyPosePreset('neutral')
        state.setModelTransform([state.modelPosition[0], 0, state.modelPosition[2]], 0)
      }
      return
    }
    if (mode === 'layout') {
      useStudio.setState({ roomWidth: 8, roomDepth: 10, roomHeight: 4.5, backdropWidth: 2.72, backdropDistance: 1.6, wallColor: '#8f8d86', floorColor: '#6d6f68', windowEnabled: false, sunEnabled: false, haze: 0 })
      return
    }
    useStudio.setState({
      focalLength: 50, aperture: 4, iso: 100, shutter: 125, focusDistance: 5.5,
      dofEnabled: true, focusGuide: true, cameraPosition: [0, 1.56, 5.8], cameraTarget: [0, 1.45, 0],
      cameraTargetSubjectId: undefined, cameraTargetZone: 'face', cameraAutoFocus: false, cameraFramingPreset: 'full',
      cameraBodyId: 'generic-ff', lensProfileId: 'zoom-24-70', compositionGuide: 'thirds', lensOpticsEnabled: true,
      lensVignette: 18, lensDistortion: -8, lensChromaticAberration: 9, lensBreathing: 8, imageFormat: 'jpeg',
      whiteBalance: 5600, whiteBalanceTint: 0, colorProfileId: 'neutral', highlightRolloff: 55, toneCurve: 58,
      lutIntensity: 100, sensorSimulationEnabled: true, shutterMode: 'mechanical', sensorDynamicRange: 14,
      noiseReduction: 35, colorNoise: 35, motionBlur: 55, rollingShutter: 50, sensorFormat: 'full-frame',
      frameAspect: '3:2', frameOrientation: 'landscape', syncSpeed: 200, ambientLevel: 20, ambientTemperature: 4300,
    })
  }
  const savePreset = () => {
    const value = mode === 'lighting'
      ? { lights: state.lights }
      : mode === 'camera'
        ? captureStudio(state, ['focalLength', 'aperture', 'iso', 'shutter', 'focusDistance', 'dofEnabled', 'focusGuide', 'cameraPosition', 'cameraTarget', 'cameraTargetSubjectId', 'cameraTargetZone', 'cameraAutoFocus', 'cameraFramingPreset', 'cameraBodyId', 'lensProfileId', 'compositionGuide', 'lensOpticsEnabled', 'lensVignette', 'lensDistortion', 'lensChromaticAberration', 'lensBreathing', 'imageFormat', 'whiteBalance', 'whiteBalanceTint', 'colorProfileId', 'highlightRolloff', 'toneCurve', 'lutIntensity', 'sensorSimulationEnabled', 'shutterMode', 'sensorDynamicRange', 'noiseReduction', 'colorNoise', 'motionBlur', 'rollingShutter', 'sensorFormat', 'frameAspect', 'frameOrientation', 'syncSpeed', 'ambientLevel', 'ambientTemperature'] as const)
        : mode === 'layout'
          ? captureStudio(state, ['roomWidth', 'roomDepth', 'roomHeight', 'backdropId', 'backdropWidth', 'backdropDistance', 'wallColor', 'floorColor', 'windowEnabled', 'sunEnabled', 'sunAzimuth', 'sunElevation', 'sunIntensity', 'haze'] as const)
          : state.selected === 'model'
            ? captureStudio(state, ['modelPosition', 'modelRotation', 'modelHeight', 'skinColor', 'outfitColor', 'skinRoughness', 'skinOil', 'skinSubsurface', 'makeupStyle', 'eyeColor', 'hairColor', 'hairGloss', 'outfitFabric', 'posePreset', 'physique', 'hairStyle', 'outfitStyle', 'actorId', 'modelPose'] as const)
            : structuredClone(state.studioObjects.find((item) => item.id === state.selected) ?? {})
    try {
      localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), value }))
      setHasPreset(true)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    } catch {
      setSaved(false)
    }
  }
  const applyPreset = () => {
    const stored = readPreset()
    if (!stored || !stored.value || typeof stored.value !== 'object') return
    if (mode === 'lighting' && 'lights' in stored.value && Array.isArray(stored.value.lights)) {
      useStudio.setState({ lights: structuredClone(stored.value.lights) as StudioLight[] })
    } else if (mode === 'person' && state.selected !== 'model' && 'id' in stored.value) {
      const { id: _id, name: _name, ...patch } = stored.value as StudioObject
      state.updateStudioObject(state.selected, patch)
    } else {
      useStudio.setState(structuredClone(stored.value) as Partial<StudioState>)
    }
    setPresetOpen(false)
  }
  const removePreset = () => {
    localStorage.removeItem(storageKey)
    setHasPreset(false)
    setPresetOpen(false)
  }
  const stored = presetOpen ? readPreset() : null
  return <footer className="inspector-footer-actions">
    {presetOpen && <section className="inspector-preset-popover" role="dialog" aria-label={copy.title}>
      <header><span>{copy.title}</span><button aria-label="Close" onClick={() => setPresetOpen(false)}>×</button></header>
      {hasPreset ? <div className="inspector-preset-entry"><div><strong>{copy.current}</strong>{stored?.savedAt ? <small>{new Date(stored.savedAt).toLocaleString(locale === 'zh' ? 'zh-TW' : locale === 'ja' ? 'ja-JP' : 'en-US')}</small> : null}</div><button onClick={applyPreset}>{copy.apply}</button><button className="danger" onClick={removePreset}>{copy.remove}</button></div>
        : <p>{copy.empty}</p>}
    </section>}
    <button onClick={reset}>{copy.reset}</button>
    <button className="preset-toggle" aria-expanded={presetOpen} onClick={() => setPresetOpen((open) => !open)}>{copy.presets}</button>
    <button className={saved ? 'saved' : ''} onClick={savePreset}>{saved ? copy.saved : copy.save}</button>
  </footer>
}

type AppearancePanelProps = {
  ariaPrefix: string
  skinRoughness: number
  skinOil: number
  subsurface: number
  makeup: MakeupStyle
  eyeColor: string
  hairColor: string
  hairGloss: number
  /** True when the actor's colour is photographed, so nothing here re-tints it. */
  baked?: boolean
  onChange: (patch: { skinRoughness?: number; skinOil?: number; subsurface?: number; makeup?: MakeupStyle; eyeColor?: string; hairColor?: string; hairGloss?: number; outfitFabric?: OutfitFabric }) => void
}

function AppearancePanel({ ariaPrefix, skinRoughness, skinOil, subsurface, makeup, eyeColor, hairColor, hairGloss, baked = false, onChange }: AppearancePanelProps) {
  const t = useT()
  const prefixed = (key: MessageKey) => `${ariaPrefix}${t(key)}`
  return <div className="subject-material-block">
    <div className="subject-material-heading"><span>{t('appearance.title')}</span><small>SKIN / HAIR / FABRIC</small></div>
    <Range label={prefixed('appearance.skinRoughness')} value={skinRoughness} min={0} max={100} unit="%" onChange={(value) => onChange({ skinRoughness: value })} />
    <Range label={prefixed('appearance.skinOil')} value={skinOil} min={0} max={100} unit="%" onChange={(value) => onChange({ skinOil: value })} />
    <Range label={prefixed('appearance.subsurface')} value={subsurface} min={0} max={100} unit="%" onChange={(value) => onChange({ subsurface: value })} />
    {/* Colour is painted into a photographed actor's two texture maps, so none
        of these can re-tint anything — a skin colour laid over the body map
        takes the shirt with it. The three sliders above are how the surface
        answers the light, and they apply to anybody. */}
    {!baked && <>
      <div className="subject-look-control"><span>{t('appearance.makeup')}</span><div role="group" aria-label={prefixed('appearance.makeup')}>{([['none','makeup.none'],['natural','makeup.natural'],['editorial','makeup.editorial']] as [MakeupStyle,MessageKey][]).map(([value,key]) => <button key={value} className={makeup === value ? 'active' : ''} onClick={() => onChange({ makeup: value })}>{t(key)}</button>)}</div></div>
      <div className="appearance-controls material-colors">
        <label><span>{t('appearance.eyes')}</span><input aria-label={prefixed('appearance.eyeColor')} type="color" value={eyeColor} onChange={(event) => onChange({ eyeColor: event.target.value })} /></label>
        <label><span>{t('appearance.hair')}</span><input aria-label={prefixed('appearance.hairColor')} type="color" value={hairColor} onChange={(event) => onChange({ hairColor: event.target.value })} /></label>
      </div>
      <Range label={prefixed('appearance.hairGloss')} value={hairGloss} min={0} max={100} unit="%" onChange={(value) => onChange({ hairGloss: value })} />
    </>}
  </div>
}

/**
 * Gel picker.
 *
 * Grouped by what the gel is for, and it reports the two numbers that decide
 * whether you can afford it: the stops it costs and where it leaves the source
 * temperature.
 */
function GelPicker({ light }: { light: StudioLight }) {
  const t = useT()
  const fitGel = useStudio((state) => state.fitGel)
  const gel = getGel(light.gelId)
  const [category, setCategory] = useState<GelCategory>(gel.id === 'none' ? 'correction' : gel.category)
  const entries = GELS.filter((item) => item.category === category && item.id !== 'none')
  const loss = gelStopLoss(gel)
  const shifted = geledTemperature(light.temperature, gel)

  return (
    <div className="gel-picker">
      <div className="optic-heading"><span>{t('gel.title')}</span><small>{t('gel.sub')}</small></div>
      <div className="pose-category-tabs" role="tablist">
        {GEL_CATEGORIES.map((item) => (
          <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
            {t(`gel.category.${item}` as MessageKey)}
          </button>
        ))}
      </div>
      <div className="pose-grid gel-grid" role="group" aria-label={t('gel.title')}>
        <button className={gel.id === 'none' ? 'active' : ''} onClick={() => fitGel(light.id, 'none')}>
          <i style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.3)' }} />{t('gel.none')}
        </button>
        {entries.map((item) => (
          <button key={item.id} className={gel.id === item.id ? 'active' : ''} title={`${item.maker} ${item.code} — ${item.note}`} onClick={() => fitGel(light.id, item.id)}>
            <i style={{ background: item.tint === '#ffffff' ? (item.miredShift > 0 ? '#ffc98a' : item.miredShift < 0 ? '#9ec8ff' : '#e8e8e4') : item.tint }} />{item.name}
          </button>
        ))}
      </div>
      {gel.id !== 'none' && (
        <div className="backdrop-readout gel-readout">
          <span>{t('gel.loss', { value: loss.toFixed(1) })}</span>
          <strong>{shifted !== light.temperature ? t('gel.shift', { value: shifted }) : gel.code}</strong>
        </div>
      )}
    </div>
  )
}

export function Inspector({ footer }: { footer?: ReactNode } = {}) {
  const state = useStudio()
  const mode = useWorkflow((workflow) => workflowModeForStage(workflow.stage))
  const t = useT()
  const ct = useCatalogT()
  const locale = useLocaleStore((item) => item.locale)
  const [search, setSearch] = useState('')
  const [searchCount, setSearchCount] = useState(0)
  const scrollRegion = useRef<HTMLDivElement>(null)
  const meta = locale === 'zh'
    ? { lightOutput: '燈光／輸出', meters: '公尺', tracking: '人物追蹤', manual: '手動', grip: '控光附件', metersDeg: '公尺／角度', subjectPose: '人物／姿勢', cameraBody: '相機機身', optical: '鏡頭特性', color: 'RAW／色彩流程', sensor: '感光元件／快門', frame: '構圖／曝光', ambient: '環境光／閃燈同步', cameraExposure: '相機／曝光', fullFrame: '全片幅' }
    : locale === 'ja'
      ? { lightOutput: '照明／出力', meters: 'メートル', tracking: '人物追従', manual: '手動', grip: '遮光・反射', metersDeg: 'メートル／角度', subjectPose: '人物／ポーズ', cameraBody: 'カメラ本体', optical: 'レンズ特性', color: 'RAW／カラー処理', sensor: 'センサー／シャッター', frame: '構図／露出', ambient: '環境光／フラッシュ同期', cameraExposure: 'カメラ／露出', fullFrame: 'フルサイズ' }
      : { lightOutput: 'Light / output', meters: 'Meters', tracking: 'Subject tracking', manual: 'Manual', grip: 'Grip', metersDeg: 'Meters / degrees', subjectPose: 'Subject / pose', cameraBody: 'Camera body', optical: 'Optical character', color: 'RAW / color pipeline', sensor: 'Sensor / shutter', frame: 'Frame / exposure', ambient: 'Ambient / flash sync', cameraExposure: 'Camera / exposure', fullFrame: 'Full frame' }
  const setValue = state.setValue
  const editableBuiltin = !state.modelAssetUrl || state.modelImportStatus === 'error'
  // Which actor is on stage decides which of these controls can act at all.
  const bakedMain = editableBuiltin && appearanceIsBaked(shippedHumanFor(state.physique, state.outfitStyle))
  const light = state.lights.find((item) => item.id === state.selected)
  const modifier = state.modifiers.find((item) => item.id === state.selected)
  const studioObject = state.studioObjects.find((item) => item.id === state.selected)
  // Every extra subject is one of the shipped actors, and both of those are photographed.
  const bakedSubject = !!studioObject && appearanceIsBaked(shippedHumanFor(studioObject.subjectPhysique, studioObject.subjectOutfitStyle))
  const subjectObjects = state.studioObjects.filter((item) => item.type === 'subject')
  const isLight = Boolean(light)
  const selectionLabel = light ? `${light.name.toUpperCase()}${state.selectedIds.length > 1 ? ` +${state.selectedIds.length - 1}` : ''}` : modifier ? modifier.name.toUpperCase() : studioObject ? studioObject.name.toUpperCase() : state.selected === 'model' ? 'MODEL' : 'CAM 01'
  const depth = calculateDepthOfField(state.focalLength, state.aperture, state.focusDistance, state.sensorFormat === 'full-frame' ? 0.03 : state.sensorFormat === 'aps-c' ? 0.019 : 0.015)
  const cameraDistance = Math.hypot(state.cameraPosition[0] - state.cameraTarget[0], state.cameraPosition[1] - state.cameraTarget[1], state.cameraPosition[2] - state.cameraTarget[2])
  const lightColor = light ? (light.colorMode === 'rgb' ? light.rgb : `rgb(${kelvinToRgb(light.temperature).join(',')})`) : '#ffffff'
  const outputLumens = light ? effectiveLightOutput(light) : 0
  const syncFactor = light ? flashSyncFactor(light, state.shutter, state.syncSpeed) : 1
  const shapeLabel = t(light?.shape === 'square' ? 'shape.square' : light?.shape === 'round' ? 'shape.round' : 'shape.strip')
  const lightDistance = light ? Math.hypot(light.position[0] - light.target[0], light.position[1] - light.target[1], light.position[2] - light.target[2]) : 0
  const lightDirection = light ? lightAimAngles(light.position, light.target) : { pan: 0, tilt: 0, distance: 0.1 }
  const solidAngle = light ? 2 * Math.PI * (1 - Math.cos((light.beamAngle * Math.PI / 180) / 2)) : 1
  const estimatedLux = light ? Math.round((outputLumens / Math.max(0.08, solidAngle)) / Math.max(0.25, lightDistance * lightDistance) * opticTransmission(light)) : 0
  const cameraBody = CAMERA_BODIES[state.cameraBodyId]
  const lensProfile = LENS_PROFILES[state.lensProfileId]
  const sizedModifier = light ? ['softbox', 'umbrella-shoot', 'umbrella-reflect', 'beauty-dish', 'deep-parabolic', 'lantern'].includes(light.optic) : false
  const setFocalLength = (value: number) => {
    const profileId = automaticLensProfileId(value)
    if (profileId !== state.lensProfileId) state.selectLensProfile(profileId)
    setValue('focalLength', value)
  }

  useEffect(() => {
    const root = scrollRegion.current
    if (!root) return
    const frame = window.requestAnimationFrame(() => {
      root.querySelectorAll('.inspector-search-hit, .inspector-search-miss').forEach((element) => element.classList.remove('inspector-search-hit', 'inspector-search-miss'))
      const query = search.trim().toLocaleLowerCase(locale === 'zh' ? 'zh-TW' : locale === 'ja' ? 'ja-JP' : 'en-US')
      if (!query) { setSearchCount(0); return }
      const hits = new Set<HTMLElement>()
      root.querySelectorAll<HTMLElement>('[aria-label]').forEach((element) => {
        const label = element.getAttribute('aria-label')?.toLocaleLowerCase() ?? ''
        if (!label.includes(query)) return
        const control = element.closest<HTMLElement>('.control-row, .select-row, .sub-control, .subject-look-control, .appearance-controls > label, .target-binding-panel label, .color-profile-select, .shutter-speed-control') ?? element
        control.classList.add('inspector-search-hit')
        hits.add(control)
      })
      root.querySelectorAll<HTMLElement>('.inspector-section').forEach((section) => {
        if (!section.querySelector('.inspector-search-hit')) section.classList.add('inspector-search-miss')
      })
      setSearchCount(hits.size)
      hits.values().next().value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [locale, mode, search, state.selected])

  return (
    <aside className={`inspector panel workflow-mode-${mode}`}>
      <div className="panel-heading"><span>{t('inspector.title')}</span><b>{selectionLabel}</b></div>
      <div className="inspector-search">
        <i aria-hidden="true" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('inspector.search.placeholder')} aria-label={t('inspector.search.placeholder')} />
        {search && <><small className={searchCount ? '' : 'empty'}>{searchCount ? t('inspector.search.count', { count: searchCount }) : t('inspector.search.none')}</small><button aria-label={t('inspector.search.clear')} onClick={() => setSearch('')}>×</button></>}
      </div>
      <InspectorSearchContext.Provider value={search}>
      <div ref={scrollRegion} className={`inspector-scroll-region${search ? ' is-searching' : ''}`}>
      {mode === 'layout' && <section className="inspector-section layout-position-inspector">
        <div className="pose-heading"><span>{t('axis.section')}</span><small>{meta.meters}</small></div>
        {state.selected === 'model' && <>
          <Range label={t('axis.x')} value={state.modelPosition[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setModelTransform([value, state.modelPosition[1], state.modelPosition[2]])} />
          <Range label={t('axis.y')} value={state.modelPosition[1]} min={0} max={3} step={0.05} unit=" m" onChange={(value) => state.setModelTransform([state.modelPosition[0], value, state.modelPosition[2]])} />
          <Range label={t('axis.z')} value={state.modelPosition[2]} min={-1.5} max={5} step={0.05} onChange={(value) => state.setModelTransform([state.modelPosition[0], state.modelPosition[1], value])} />
        </>}
        {light && <>
          <Range label={t('axis.x')} disabled={light.locked} value={light.position[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setLightAxis(light.id, 0, value)} />
          <Range label={t('axis.y')} disabled={light.locked} value={light.position[1]} min={0.8} max={4.5} step={0.05} unit=" m" onChange={(value) => state.setLightAxis(light.id, 1, value)} />
          <Range label={t('axis.z')} disabled={light.locked} value={light.position[2]} min={-2} max={5} step={0.05} onChange={(value) => state.setLightAxis(light.id, 2, value)} />
        </>}
        {modifier && <>
          <Range label={t('axis.x')} disabled={modifier.locked} value={modifier.position[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setModifierTransform(modifier.id, [value, modifier.position[1], modifier.position[2]])} />
          <Range label={t('axis.y')} disabled={modifier.locked} value={modifier.position[1]} min={0.3} max={3.5} step={0.05} unit=" m" onChange={(value) => state.setModifierTransform(modifier.id, [modifier.position[0], value, modifier.position[2]])} />
          <Range label={t('axis.z')} disabled={modifier.locked} value={modifier.position[2]} min={-2} max={5} step={0.05} onChange={(value) => state.setModifierTransform(modifier.id, [modifier.position[0], modifier.position[1], value])} />
        </>}
        {studioObject && <>
          <Range label={t('axis.x')} disabled={studioObject.locked} value={studioObject.position[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setStudioObjectTransform(studioObject.id, [value, studioObject.position[1], studioObject.position[2]])} />
          <Range label={t('axis.y')} disabled={studioObject.locked} value={studioObject.position[1]} min={0} max={3} step={0.05} unit=" m" onChange={(value) => state.setStudioObjectTransform(studioObject.id, [studioObject.position[0], value, studioObject.position[2]])} />
          <Range label={t('axis.z')} disabled={studioObject.locked} value={studioObject.position[2]} min={-1.5} max={5} step={0.05} onChange={(value) => state.setStudioObjectTransform(studioObject.id, [studioObject.position[0], studioObject.position[1], value])} />
        </>}
        {state.selected === 'camera' && <>
          <Range label={t('camera.x')} value={state.cameraPosition[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setCameraPosition([value, state.cameraPosition[1], state.cameraPosition[2]])} />
          <Range label={t('camera.y')} value={state.cameraPosition[1]} min={0.35} max={3.5} step={0.05} unit=" m" onChange={(value) => state.setCameraPosition([state.cameraPosition[0], value, state.cameraPosition[2]])} />
          <Range label={t('camera.z')} value={state.cameraPosition[2]} min={1.2} max={9} step={0.05} onChange={(value) => state.setCameraPosition([state.cameraPosition[0], state.cameraPosition[1], value])} />
        </>}
      </section>}
      {mode === 'lighting' && isLight && light && <>
        <InspectorDrawer key="light-output" title={t('light.section')} meta={meta.lightOutput}
          comparison={{
            capture: () => captureLight(light, ['name', 'enabled', 'powerPercent', 'profileId', 'headType', 'temperature', 'shape', 'softbox', 'grid', 'colorMode', 'rgb', 'beamAngle', 'feather', 'modifierWidth', 'modifierHeight', 'optic', 'modifierId', 'gelId', 'gridDegrees', 'barnDoorAngle', 'goboPattern', 'goboRotation', 'goboScale', 'operationMode', 'hssEnabled', 'flashDuration', 'locked', 'groupId'] as const),
            apply: (snapshot) => applyLight(light.id, snapshot),
          }}>
          {state.selectedIds.length > 1 && <div className="multi-selection-note"><b>{state.selectedIds.length}</b><span>{t('light.multiNote')}</span></div>}
          <div className="object-management">
            <input aria-label={t('light.name')} value={light.name} maxLength={32} onChange={(event) => state.updateLight(light.id, { name: event.target.value || 'Untitled light' })} />
            <button onClick={state.duplicateSelectedLights}>{t('common.duplicate')}</button>
            <button className="danger" onClick={state.deleteSelectedLights}>{t('common.delete')}</button>
          </div>
          <div className="lock-row"><span>{light.groupId ? t('light.group', { id: light.groupId.slice(-4).toUpperCase() }) : t('light.ungrouped')}</span><button className={light.locked ? 'locked' : ''} onClick={() => state.updateLight(light.id, { locked: !light.locked })}>{t(light.locked ? 'common.unlock' : 'common.lock')}</button></div>
          <div className="light-chip"><span style={{ background: lightColor, color: lightColor }} /><div><strong>{light.name}</strong><small>{shapeLabel} · {light.optic.replace('-', ' ')}{light.grid ? ` · ${t('light.gridSuffix')}` : ''}</small></div><button className={light.enabled ? 'light-toggle on' : 'light-toggle'} onClick={() => state.updateLight(light.id, { enabled: !light.enabled })}>{light.enabled ? 'ON' : 'OFF'}</button></div>
          <div className="fixture-profile-card wattage-card"><div><span>{light.operationMode === 'flash' ? 'FLASH ENERGY' : 'LIGHT OUTPUT'}</span><strong>{t('light.power')}</strong><small>{light.operationMode === 'flash' ? 'WATT-SECONDS' : 'WATTS'} · {light.temperature} K</small></div><b>{lightWattage(light)}<small>{light.operationMode === 'flash' ? ' Ws' : ' W'}</small></b></div>
          <Range label={t('light.power')} value={lightWattage(light)} min={wattageMinimum(light)} max={wattageLimit(light)} step={1} unit={light.operationMode === 'flash' ? ' Ws' : ' W'} onChange={(value) => state.updateLight(light.id, { powerPercent: percentForWattage(light, value) })} />
          <div className="sub-control operation-mode-control"><span>{t('light.mode')}</span><div className="segmented-control" role="group" aria-label={t('light.mode')}><button className={light.operationMode === 'continuous' ? 'active' : ''} onClick={() => state.updateLight(light.id, { operationMode: 'continuous' })}>{t('light.continuous')}</button><button className={light.operationMode === 'flash' ? 'active' : ''} onClick={() => state.updateLight(light.id, { operationMode: 'flash', headType: 'strobe' })}>{t('light.flash')}</button></div></div>
          {light.operationMode === 'flash' && <div className="flash-controls">
            <div className={state.shutter > state.syncSpeed && !light.hssEnabled ? 'flash-status sync-error' : 'flash-status'}><div><span>SYNC</span><strong>1/{state.syncSpeed}s</strong></div><div><span>CAPTURE</span><strong>{Math.round(syncFactor * 100)}%</strong></div><div><span>FREEZE</span><strong>1/{Math.round(light.flashDuration)}s</strong></div></div>
            <button className={light.hssEnabled ? 'hss-toggle active' : 'hss-toggle'} onClick={() => state.updateLight(light.id, { hssEnabled: !light.hssEnabled })}><i />{t('light.hss')} {light.hssEnabled ? 'ON' : 'OFF'}</button>
            <Range label={t('light.flashDuration')} value={light.flashDuration} min={125} max={20000} step={125} displayValue={`1/${Math.round(light.flashDuration)} s`} onChange={(value) => state.updateLight(light.id, { flashDuration: value })} />
          </div>}
          <div className="sub-control head-type-control"><span>{t('light.headType')}</span><div className="segmented-control" role="group" aria-label={t('light.headType')}>{([['cob', 'COB'], ['strobe', t('head.strobe')], ['panel', t('head.panel')]] as const).map(([headType, label]) => <button key={headType} className={light.headType === headType ? 'active' : ''} onClick={() => state.updateLight(light.id, { headType })}>{label}</button>)}</div></div>
          <div className="sub-control">
            <span>{t('light.shape')}</span>
            <div className="segmented-control" role="group" aria-label={t('light.shape')}>
              {([['square', t('shape.square')], ['round', t('shape.round')], ['strip', t('shape.strip')]] as const).map(([shape, label]) => <button key={shape} className={light.shape === shape ? 'active' : ''} onClick={() => state.updateLight(light.id, { shape, ...(shape === 'strip' ? { modifierWidth: 0.4, modifierHeight: 1.2 } : shape === 'round' ? { modifierWidth: 0.9, modifierHeight: 0.9 } : { modifierWidth: 0.9, modifierHeight: 0.9 }) })}>{label}</button>)}
            </div>
          </div>
          <div className="optic-heading"><span>{t('optic.title')}</span><small>LIGHT SHAPER</small></div>
          <div className="optic-grid" role="group" aria-label={t('optic.title')}>
            {([['softbox', 55, 78], ['umbrella-shoot', 82, 92], ['umbrella-reflect', 68, 82], ['beauty-dish', 50, 58], ['deep-parabolic', 38, 46], ['lantern', 110, 96], ['standard', 60, 48], ['fresnel', 35, 42], ['snoot', 16, 22], ['barn-doors', 42, 40], ['projection', 24, 22]] as const).map(([optic, beamAngle, feather]) => <button key={optic} className={light.optic === optic ? `active ${optic}` : optic} onClick={() => state.updateLight(light.id, { optic, softbox: optic === 'softbox', beamAngle, feather, shape: optic === 'softbox' ? light.shape : 'round', ...(optic === 'projection' && light.goboPattern === 'none' ? { goboPattern: 'window' as const } : {}) })}><i />{t(`optic.${optic}`)}</button>)}
          </div>
          <GelPicker light={light} />
          <div className="modifier-controls">
            <button className={light.optic === 'softbox' ? 'active' : ''} onClick={() => state.updateLight(light.id, { optic: 'softbox', softbox: true, beamAngle: 55, feather: 78 })}><i />{t('light.diffuser')}</button>
            <button className={light.grid ? 'active' : ''} onClick={() => state.updateLight(light.id, { grid: !light.grid })}><i />{t('light.honeycomb')}</button>
          </div>
          {light.optic === 'barn-doors' && <Range label={t('light.barnDoorAngle')} value={light.barnDoorAngle} min={10} max={85} step={1} unit="°" onChange={(value) => state.updateLight(light.id, { barnDoorAngle: value })} />}
          {light.optic === 'projection' && <div className="gobo-controls">
            <div className="modifier-size-heading"><span>{t('gobo.title')}</span><small>PROJECTION PATTERN</small></div>
            <div className="gobo-grid" role="group" aria-label={t('gobo.aria')}>
              {(['none', 'window', 'blinds', 'foliage', 'breakup'] as const).map((pattern) => <button key={pattern} aria-label={`Gobo ${pattern}`} className={light.goboPattern === pattern ? `active ${pattern}` : pattern} onClick={() => state.updateLight(light.id, { goboPattern: pattern })}><i /><span>{t(`gobo.${pattern}`)}</span></button>)}
            </div>
            <Range label={t('gobo.rotation')} value={light.goboRotation} min={-180} max={180} step={5} unit="°" onChange={(value) => state.updateLight(light.id, { goboRotation: value })} />
            <Range label={t('gobo.scale')} value={light.goboScale} min={0.5} max={2.5} step={0.05} displayValue={`${light.goboScale.toFixed(2)}×`} onChange={(value) => state.updateLight(light.id, { goboScale: value })} />
          </div>}
          {sizedModifier && <><div className="modifier-size-heading"><span>{t('modifier.size')}</span><small>{light.shape === 'round' ? 'Ø ' : ''}{Math.round(light.modifierWidth * 100)} CM</small></div>
          <div className="modifier-size-presets" role="group" aria-label={t('modifier.presets')}>
            <button onClick={() => state.updateLight(light.id, { shape: 'square', modifierWidth: 0.6, modifierHeight: 0.6 })}>60×60</button>
            <button onClick={() => state.updateLight(light.id, { shape: 'square', modifierWidth: 0.9, modifierHeight: 0.9 })}>90×90</button>
            <button onClick={() => state.updateLight(light.id, { shape: 'strip', modifierWidth: 0.3, modifierHeight: 1.2 })}>30×120</button>
            <button onClick={() => state.updateLight(light.id, { shape: 'round', modifierWidth: 1.2, modifierHeight: 1.2 })}>Ø120</button>
          </div>
          <Range label={t('modifier.width')} value={light.modifierWidth} min={0.18} max={2.4} step={0.02} unit=" m" onChange={(value) => state.updateLight(light.id, { modifierWidth: value })} />
          <Range label={t('modifier.height')} value={light.modifierHeight} min={0.18} max={2.4} step={0.02} unit=" m" onChange={(value) => state.updateLight(light.id, { modifierHeight: value })} />
          </>}
          <div className="sub-control color-mode-control">
            <span>{t('light.colorMode')}</span>
            <div className="segmented-control" role="group" aria-label={t('light.colorMode')}>
              <button className={light.colorMode === 'kelvin' ? 'active' : ''} onClick={() => state.updateLight(light.id, { colorMode: 'kelvin' })}>{t('light.kelvin')}</button>
              <button className={light.colorMode === 'rgb' ? 'active' : ''} onClick={() => state.updateLight(light.id, { colorMode: 'rgb' })}>RGB</button>
            </div>
          </div>
          {light.colorMode === 'kelvin' ? (
            <Range label={t('light.kelvin')} value={light.temperature} min={2800} max={7500} step={100} unit=" K" onChange={(value) => state.updateLight(light.id, { temperature: value })} />
          ) : (
            <label className="rgb-control"><span>{t('light.rgbColor')}</span><input aria-label={t('light.rgbColor')} type="color" value={light.rgb} onChange={(event) => state.updateLight(light.id, { rgb: event.target.value })} /><output>{light.rgb.toUpperCase()}</output></label>
          )}
        </InspectorDrawer>
        <InspectorDrawer key="light-position" title={t('axis.section')} meta={meta.meters} comparison={{
          capture: () => captureLight(light, ['position'] as const),
          apply: (snapshot) => applyLight(light.id, snapshot),
        }}>
          <Range label={t('axis.x')} disabled={light.locked} value={light.position[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setLightAxis(light.id, 0, value)} />
          <Range label={t('axis.y')} disabled={light.locked} value={light.position[1]} min={0.8} max={4.5} step={0.05} onChange={(value) => state.setLightAxis(light.id, 1, value)} />
          <Range label={t('axis.z')} disabled={light.locked} value={light.position[2]} min={-2} max={5} step={0.05} onChange={(value) => state.setLightAxis(light.id, 2, value)} />
        </InspectorDrawer>
        <InspectorDrawer key="light-aim" title={t('beam.title')} meta={light.targetSubjectId ? meta.tracking : meta.manual} className="beam-controls" comparison={{
          capture: () => captureLight(light, ['target', 'targetSubjectId', 'targetZone', 'beamAngle', 'feather'] as const),
          apply: (snapshot) => applyLight(light.id, snapshot),
        }}>
          <div className="target-binding-panel">
            <label><span>{t('beam.follow')}</span><select aria-label={t('beam.follow.aria')} value={light.targetSubjectId ?? 'manual'} onChange={(event) => state.bindLightToSubject(light.id, event.target.value === 'manual' ? null : event.target.value, light.targetZone ?? 'face')}>
              <option value="manual">{t('beam.manual')}</option>
              {state.mainSubjectEnabled && <option value="model">{t('subject.main')}</option>}
              {subjectObjects.map((subject, index) => <option key={subject.id} value={subject.id}>{t('subject.numbered', { n: index + 2, name: subject.name })}</option>)}
            </select></label>
            <div role="group" aria-label={t('beam.zone.aria')}>
              {([['face','zone.face'],['chest','zone.chest'],['full','zone.full']] as const).map(([zone,labelKey]) => <button key={zone} disabled={!light.targetSubjectId} className={light.targetZone === zone ? 'active' : ''} onClick={() => light.targetSubjectId && state.bindLightToSubject(light.id, light.targetSubjectId, zone)}>{t(labelKey)}</button>)}
            </div>
            <small>{t(light.targetSubjectId ? 'beam.tracking.note' : 'beam.tracking.hint')}</small>
          </div>
          <div className="beam-meter"><div><span>DISTANCE</span><strong>{lightDistance.toFixed(2)} m</strong></div><div><span>EST. AT TARGET</span><strong>{estimatedLux.toLocaleString()} lx</strong></div></div>
          <button className={state.lightAimMode ? 'aim-mode-button active' : 'aim-mode-button'} onClick={() => setValue('lightAimMode', !state.lightAimMode)}><i />{t(state.lightAimMode ? 'beam.aim.active' : 'beam.aim.idle')}</button>
          <Range label={t('beam.pan')} value={Number(lightDirection.pan.toFixed(1))} min={-180} max={180} step={1} unit="°" onChange={(value) => state.setLightTarget(light.id, targetFromLightAim(light.position, lightDirection.distance, value, lightDirection.tilt))} />
          <Range label={t('beam.tilt')} value={Number(lightDirection.tilt.toFixed(1))} min={-75} max={75} step={1} unit="°" onChange={(value) => state.setLightTarget(light.id, targetFromLightAim(light.position, lightDirection.distance, lightDirection.pan, value))} />
          <Range label={t('beam.targetX')} value={light.target[0]} min={-3} max={3} step={0.05} onChange={(value) => state.setLightTarget(light.id, [value, light.target[1], light.target[2]])} />
          <Range label={t('beam.targetY')} value={light.target[1]} min={0.1} max={3} step={0.05} onChange={(value) => state.setLightTarget(light.id, [light.target[0], value, light.target[2]])} />
          <Range label={t('beam.targetZ')} value={light.target[2]} min={-1.5} max={4} step={0.05} onChange={(value) => state.setLightTarget(light.id, [light.target[0], light.target[1], value])} />
          <Range label={t('beam.angle')} value={light.beamAngle} min={12} max={90} step={1} unit="°" onChange={(value) => state.updateLight(light.id, { beamAngle: value })} />
          <Range label={t('beam.feather')} value={light.feather} min={0} max={100} step={1} unit="%" onChange={(value) => state.updateLight(light.id, { feather: value })} />
        </InspectorDrawer>
      </>}

      {mode === 'lighting' && modifier && <InspectorDrawer key="grip" title={t('library.grip')} meta={meta.grip} className="grip-inspector" comparison={{
        capture: () => structuredClone(modifier),
        apply: (snapshot) => useStudio.setState((current) => ({ modifiers: current.modifiers.map((item) => item.id === modifier.id ? snapshot : item) })),
      }}>
        <div className="object-management">
          <input aria-label={t('grip.name')} value={modifier.name} maxLength={32} onChange={(event) => state.updateModifier(modifier.id, { name: event.target.value || 'Untitled grip' })} />
          <button onClick={() => state.duplicateModifier(modifier.id)}>{t('common.duplicate')}</button>
          <button className="danger" onClick={() => state.deleteModifier(modifier.id)}>{t('common.delete')}</button>
        </div>
        <div className="lock-row"><span>{modifier.type === 'reflector' ? t('grip.reflector') : modifier.type === 'flag' ? t('grip.flag') : 'V-FLAT'}</span><button className={modifier.locked ? 'locked' : ''} onClick={() => state.updateModifier(modifier.id, { locked: !modifier.locked })}>{t(modifier.locked ? 'common.unlock' : 'common.lock')}</button></div>
        <div className="sub-control">
          <span>{t('common.type')}</span>
          <div className="segmented-control" role="group" aria-label={t('grip.type.aria')}>
            {([['reflector', t('grip.reflector.short')], ['flag', t('grip.flag')], ['vflat', 'V-Flat']] as const).map(([type, label]) => <button key={type} className={modifier.type === type ? 'active' : ''} onClick={() => state.updateModifier(modifier.id, { type, surface: type === 'flag' ? 'black' : modifier.surface })}>{label}</button>)}
          </div>
        </div>
        <div className="surface-control"><span>{t('grip.surface')}</span><div role="group" aria-label={t('grip.surface')}>
          {([['white', t('surface.white')], ['silver', t('surface.silver')], ['gold', t('surface.gold')], ['black', t('surface.black')]] as const).map(([surface, label]) => <button key={surface} title={label} aria-label={t('surface.aria', { label })} className={modifier.surface === surface ? `active ${surface}` : surface} onClick={() => state.updateModifier(modifier.id, { surface })}><i /></button>)}
        </div></div>
        <Range label={t('common.width')} disabled={modifier.locked} value={modifier.width} min={0.3} max={3} step={0.05} unit=" m" onChange={(value) => state.updateModifier(modifier.id, { width: value })} />
        <Range label={t('common.height')} disabled={modifier.locked} value={modifier.height} min={0.4} max={3} step={0.05} unit=" m" onChange={(value) => state.updateModifier(modifier.id, { height: value })} />
        <div className="coordinate-label"><span>{t('axis.posAndAngle')}</span><small>{meta.metersDeg}</small></div>
        <Range label={t('axis.x')} disabled={modifier.locked} value={modifier.position[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setModifierTransform(modifier.id, [value, modifier.position[1], modifier.position[2]])} />
        <Range label={t('axis.y')} disabled={modifier.locked} value={modifier.position[1]} min={0.3} max={3.5} step={0.05} onChange={(value) => state.setModifierTransform(modifier.id, [modifier.position[0], value, modifier.position[2]])} />
        <Range label={t('axis.z')} disabled={modifier.locked} value={modifier.position[2]} min={-2} max={5} step={0.05} onChange={(value) => state.setModifierTransform(modifier.id, [modifier.position[0], modifier.position[1], value])} />
        <Range label={t('axis.rotY')} disabled={modifier.locked} value={Math.round(THREE_RAD_TO_DEG * modifier.rotationY)} min={-180} max={180} step={5} unit="°" onChange={(value) => state.setModifierTransform(modifier.id, modifier.position, value / THREE_RAD_TO_DEG)} />
        <p className="grip-note">{t('grip.note')}</p>
      </InspectorDrawer>}

      {mode === 'person' && studioObject && <InspectorDrawer key="object" title={t('object.section')} meta={studioObject.type.toUpperCase()} className="studio-object-inspector">
        <div className="object-management"><input aria-label={t('object.name')} value={studioObject.name} maxLength={32} onChange={(event) => state.updateStudioObject(studioObject.id, { name: event.target.value || 'Untitled object' })} /><button onClick={() => state.duplicateStudioObject(studioObject.id)}>{t('common.duplicate')}</button><button className="danger" onClick={() => state.deleteStudioObject(studioObject.id)}>{t('common.delete')}</button></div>
        <div className="lock-row"><span>{t(studioObject.type === 'subject' ? 'object.subjectRig' : 'object.setPiece')}</span><button className={studioObject.locked ? 'locked' : ''} onClick={() => state.updateStudioObject(studioObject.id, { locked: !studioObject.locked })}>{t(studioObject.locked ? 'common.unlock' : 'common.lock')}</button></div>
        {studioObject.type !== 'subject' ? <>
          <div className="sub-control"><span>{t('grip.surface')}</span><div className="segmented-control" role="group" aria-label={t('object.materialAria')}>{(['matte','glossy','metal'] as const).map((material) => <button key={material} className={studioObject.material === material ? 'active' : ''} onClick={() => state.updateStudioObject(studioObject.id, { material })}>{t(`material.${material}`)}</button>)}</div></div>
          <label className="object-color-control"><span>{t('object.color')}</span><input aria-label={t('object.colorAria')} type="color" value={studioObject.color} onChange={(event) => state.updateStudioObject(studioObject.id, { color: event.target.value })} /><output>{studioObject.color.toUpperCase()}</output></label>
          <Range label={t('object.scale')} disabled={studioObject.locked} value={studioObject.scale} min={0.2} max={3} step={0.05} displayValue={`${studioObject.scale.toFixed(2)}×`} onChange={(value) => state.updateStudioObject(studioObject.id, { scale: value })} />
        </> : <>
          <div className="pose-heading subject-pose-heading"><span>{t('subject.poseSection')}</span><small>PROCEDURAL RIG</small></div>
          <PoseLibraryPanel current={studioObject.subjectPosePreset} onApply={(id) => state.applyStudioSubjectPose(studioObject.id, id)} />
          {!bakedSubject && <>
          <div className="appearance-controls subject-appearance-controls">
            <label><span>{t('subject.skinColor')}</span><input aria-label={t('subject.skinColorAria')} disabled={bakedSubject} type="color" value={studioObject.subjectSkinColor} onChange={(event) => state.updateStudioObject(studioObject.id, { subjectSkinColor: event.target.value })} /></label>
            <label><span>{t('subject.outfitColor')}</span><input aria-label={t('subject.outfitColorAria')} disabled={bakedSubject} type="color" value={studioObject.subjectOutfitColor} onChange={(event) => state.updateStudioObject(studioObject.id, { subjectOutfitColor: event.target.value })} /></label>
          </div>
          </>}
          <AppearancePanel baked={bakedSubject} ariaPrefix={t('subject.prefixSecond')} skinRoughness={studioObject.subjectSkinRoughness} skinOil={studioObject.subjectSkinOil} subsurface={studioObject.subjectSubsurface} makeup={studioObject.subjectMakeup} eyeColor={studioObject.subjectEyeColor} hairColor={studioObject.subjectHairColor} hairGloss={studioObject.subjectHairGloss} onChange={(patch) => state.updateStudioObject(studioObject.id, {
            ...(patch.skinRoughness !== undefined ? { subjectSkinRoughness: patch.skinRoughness } : {}),
            ...(patch.skinOil !== undefined ? { subjectSkinOil: patch.skinOil } : {}),
            ...(patch.subsurface !== undefined ? { subjectSubsurface: patch.subsurface } : {}),
            ...(patch.makeup ? { subjectMakeup: patch.makeup } : {}),
            ...(patch.eyeColor ? { subjectEyeColor: patch.eyeColor } : {}),
            ...(patch.hairColor ? { subjectHairColor: patch.hairColor } : {}),
            ...(patch.hairGloss !== undefined ? { subjectHairGloss: patch.hairGloss } : {}),
          })} />
          <Range label={t('subject.height')} value={studioObject.subjectHeight} min={1.15} max={2.2} step={0.01} unit=" m" onChange={(value) => state.updateStudioObject(studioObject.id, { subjectHeight: Number(value.toFixed(2)) })} />
          <PhysiquePanel physique={studioObject.subjectPhysique} baked={bakedSubject}
            onChange={(patch) => state.updateStudioSubjectPhysique(studioObject.id, patch)}
            onPreset={(id) => state.applyStudioSubjectPhysique(studioObject.id, id)} />
          <WardrobePanel baked={bakedSubject} hairStyle={studioObject.subjectHairStyle} outfit={studioObject.subjectOutfitStyle} fabric={studioObject.subjectOutfitFabric} onChange={(patch) => state.updateStudioObject(studioObject.id, {
            ...(patch.hairStyle ? { subjectHairStyle: patch.hairStyle } : {}),
            ...(patch.outfit ? { subjectOutfitStyle: patch.outfit } : {}),
            ...(patch.fabric ? { subjectOutfitFabric: patch.fabric } : {}),
          })} />
          <PoseControls pose={studioObject.subjectPose} baked={bakedSubject} onChange={(patch) => state.updateStudioSubjectPose(studioObject.id, patch)} />
        </>}
        <div className="coordinate-label"><span>{t('axis.posAndFacing')}</span><small>{meta.metersDeg}</small></div>
        <Range label={t('axis.x')} disabled={studioObject.locked} value={studioObject.position[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setStudioObjectTransform(studioObject.id, [value, studioObject.position[1], studioObject.position[2]])} />
        <Range label={t('axis.y')} disabled={studioObject.locked} value={studioObject.position[1]} min={0} max={3} step={0.05} onChange={(value) => state.setStudioObjectTransform(studioObject.id, [studioObject.position[0], value, studioObject.position[2]])} />
        <Range label={t('axis.z')} disabled={studioObject.locked} value={studioObject.position[2]} min={-1.5} max={5} step={0.05} onChange={(value) => state.setStudioObjectTransform(studioObject.id, [studioObject.position[0], studioObject.position[1], value])} />
        <Range label={t('axis.rotY')} disabled={studioObject.locked} value={Math.round(THREE_RAD_TO_DEG * studioObject.rotationY)} min={-180} max={180} step={5} unit="°" onChange={(value) => state.setStudioObjectTransform(studioObject.id, studioObject.position, value / THREE_RAD_TO_DEG)} />
      </InspectorDrawer>}

      {mode === 'person' && state.selected === 'model' && <section className="inspector-section model-inspector model-inspector-direct">
        <div className="selection-chip"><span className="model-silhouette" /><div><strong>{state.modelAssetName || (castMember(state.actorId) ? ct(`cast.${state.actorId}`, castMember(state.actorId)!.label) : DEFAULT_HUMAN_NAME)}</strong><small>{state.modelImportStatus === 'ready' ? 'Rigged human · 1.82 m normalized' : state.modelImportStatus === 'error' ? 'Model failed · procedural fallback' : 'Loading realistic human…'}</small></div><b>SELECTED</b></div>
        <div className="object-management main-subject-management"><span>{t('subject.main')}</span><button className="danger" onClick={state.deleteMainSubject}>{t('common.delete')}</button></div>
        <Range label={t('axis.x')} value={state.modelPosition[0]} min={-3} max={3} step={0.05} onChange={(value) => state.setModelTransform([value, state.modelPosition[1], state.modelPosition[2]])} />
        <Range label={t('axis.y')} value={state.modelPosition[1]} min={0} max={3} step={0.05} unit=" m" onChange={(value) => state.setModelTransform([state.modelPosition[0], value, state.modelPosition[2]])} />
        <Range label={t('axis.z')} value={state.modelPosition[2]} min={-1} max={4} step={0.05} onChange={(value) => state.setModelTransform([state.modelPosition[0], state.modelPosition[1], value])} />
        <Range label={t('model.facing')} value={Math.round(THREE_RAD_TO_DEG * state.modelRotation)} min={-180} max={180} step={5} unit="°" onChange={(value) => state.setModelTransform(state.modelPosition, value / THREE_RAD_TO_DEG)} />
        <Range label={t('subject.height')} value={state.modelHeight} min={1.15} max={2.2} step={0.01} unit=" m" onChange={(value) => setValue('modelHeight', Number(value.toFixed(2)))} />
        <div className="pose-heading">
          <span>{t('pose.section')}</span>
          <small>{state.modelRigStatus === 'rigged' ? t('pose.retargeted') : state.modelRigStatus === 'unrigged' ? t('pose.unrigged') : 'LOADING SKELETON'}</small>
        </div>
        <PoseLibraryPanel current={state.posePreset} onApply={state.applyPosePreset} />
        {state.modelRigStatus === 'rigged' && (
          <>
            <p className="pose-note">{t('pose.retargetNote')}</p>
            <PoseControls pose={state.modelPose} baked={bakedMain} onChange={state.updateModelPose} />
          </>
        )}
        {state.modelRigStatus === 'unrigged' && <p className="pose-note">{t('pose.unriggedNote')}</p>}
        {editableBuiltin && <>
          {!bakedMain && <>
          <div className="appearance-controls">
            <label><span>{t('appearance.skin')}</span><input aria-label={t('appearance.skinAria')} disabled={bakedMain} type="color" value={state.skinColor} onChange={(event) => setValue('skinColor', event.target.value)} /></label>
            <label><span>{t('appearance.outfit')}</span><input aria-label={t('appearance.outfitAria')} disabled={bakedMain} type="color" value={state.outfitColor} onChange={(event) => setValue('outfitColor', event.target.value)} /></label>
          </div>
          </>}
          <AppearancePanel baked={bakedMain} ariaPrefix={t('subject.prefixMain')} skinRoughness={state.skinRoughness} skinOil={state.skinOil} subsurface={state.skinSubsurface} makeup={state.makeupStyle} eyeColor={state.eyeColor} hairColor={state.hairColor} hairGloss={state.hairGloss} onChange={(patch) => {
            if (patch.skinRoughness !== undefined) setValue('skinRoughness', patch.skinRoughness)
            if (patch.skinOil !== undefined) setValue('skinOil', patch.skinOil)
            if (patch.subsurface !== undefined) setValue('skinSubsurface', patch.subsurface)
            if (patch.makeup) setValue('makeupStyle', patch.makeup)
            if (patch.eyeColor) setValue('eyeColor', patch.eyeColor)
            if (patch.hairColor) setValue('hairColor', patch.hairColor)
            if (patch.hairGloss !== undefined) setValue('hairGloss', patch.hairGloss)
          }} />
          {editableBuiltin && <CastPanel current={state.actorId} onCast={state.castActor} />}
          <PhysiquePanel physique={state.physique} baked={bakedMain} onChange={state.updatePhysique} onPreset={state.applyPhysiquePreset} />
          <WardrobePanel baked={bakedMain} hairStyle={state.hairStyle} outfit={state.outfitStyle} fabric={state.outfitFabric} onChange={(patch) => {
            if (patch.hairStyle) setValue('hairStyle', patch.hairStyle)
            if (patch.outfit) setValue('outfitStyle', patch.outfit)
            if (patch.fabric) setValue('outfitFabric', patch.fabric)
          }} />
        </>}
      </section>}

      {mode === 'camera' && <>
      {state.selected === 'camera' && <InspectorDrawer key="camera-position" title={t('camera.section')} meta={state.cameraTargetSubjectId ? meta.tracking : meta.manual} className="camera-body-controls" comparison={{
        capture: () => captureStudio(state, ['cameraPosition', 'cameraTarget', 'cameraTargetSubjectId', 'cameraTargetZone', 'cameraAutoFocus', 'cameraFramingPreset', 'focusDistance'] as const),
        apply: applyStudio,
      }}>
        <div className="target-binding-panel camera-target-panel">
          <label><span>{t('beam.follow')}</span><select aria-label={t('camera.followAria')} value={state.cameraTargetSubjectId ?? 'manual'} onChange={(event) => state.bindCameraToSubject(event.target.value === 'manual' ? null : event.target.value, state.cameraTargetZone)}>
            <option value="manual">{t('camera.manual')}</option>
            {state.mainSubjectEnabled && <option value="model">{t('subject.main')}</option>}
            {subjectObjects.map((subject, index) => <option key={subject.id} value={subject.id}>{t('subject.numbered', { n: index + 2, name: subject.name })}</option>)}
          </select></label>
          <div role="group" aria-label={t('camera.zoneAria')}>
            {([['face','zone.face'],['chest','zone.chest'],['full','zone.full']] as const).map(([zone,labelKey]) => <button key={zone} disabled={!state.cameraTargetSubjectId} className={state.cameraTargetZone === zone ? 'active' : ''} onClick={() => state.cameraTargetSubjectId && state.bindCameraToSubject(state.cameraTargetSubjectId, zone)}>{t(labelKey)}</button>)}
          </div>
          <button className={state.cameraAutoFocus ? 'camera-af-toggle active' : 'camera-af-toggle'} onClick={() => state.setCameraAutoFocus(!state.cameraAutoFocus)}><i />{state.cameraAutoFocus ? `AF TRACK · ${state.focusDistance.toFixed(2)} M` : t('camera.afEnable')}</button>
          <small>{t('camera.trackNote')}</small>
        </div>
        <div className="camera-framing-presets" role="group" aria-label={t('camera.framingAria')}>
          {(['headshot','half','full'] as const).map((preset) => <button key={preset} className={state.cameraFramingPreset === preset && state.cameraTargetSubjectId ? 'active' : ''} onClick={() => state.frameCameraSubject(state.cameraTargetSubjectId ?? 'model', preset)}>{t(`framing.${preset}`)}<small>{preset === 'headshot' ? 'TIGHT' : preset === 'half' ? 'MEDIUM' : 'WIDE'}</small></button>)}
        </div>
        <div className="camera-position-status"><span>CAMERA 01</span><b>{cameraDistance.toFixed(2)} m TO TARGET</b></div>
        <div className="coordinate-label"><span>{t('camera.bodyPos')}</span><small>X / Y / Z</small></div>
        <Range label={t('camera.x')} value={state.cameraPosition[0]} min={-4} max={4} step={0.05} onChange={(value) => state.setCameraPosition([value, state.cameraPosition[1], state.cameraPosition[2]])} />
        <Range label={t('camera.y')} value={state.cameraPosition[1]} min={0.35} max={3.5} step={0.05} onChange={(value) => state.setCameraPosition([state.cameraPosition[0], value, state.cameraPosition[2]])} />
        <Range label={t('camera.z')} value={state.cameraPosition[2]} min={1.2} max={9} step={0.05} onChange={(value) => state.setCameraPosition([state.cameraPosition[0], state.cameraPosition[1], value])} />
        <div className="coordinate-label target-label"><span>{t('camera.aimPoint')}</span><small>X / Y / Z</small></div>
        <Range label={t('camera.aimX')} value={state.cameraTarget[0]} min={-3} max={3} step={0.05} onChange={(value) => state.setCameraTarget([value, state.cameraTarget[1], state.cameraTarget[2]])} />
        <Range label={t('camera.aimY')} value={state.cameraTarget[1]} min={0.2} max={2.6} step={0.05} onChange={(value) => state.setCameraTarget([state.cameraTarget[0], value, state.cameraTarget[2]])} />
        <Range label={t('camera.aimZ')} value={state.cameraTarget[2]} min={-1.5} max={4} step={0.05} onChange={(value) => state.setCameraTarget([state.cameraTarget[0], state.cameraTarget[1], value])} />
      </InspectorDrawer>}

      <InspectorDrawer key="camera-body" title={t('camera.section')} meta={meta.cameraBody} className="camera-controls" comparison={{
        capture: () => captureStudio(state, ['cameraBodyId', 'sensorFormat', 'sensorDynamicRange'] as const),
        apply: applyStudio,
      }}>
        <div className="camera-gear-block">
          <label><span>{t('cam.body')}</span><select aria-label={t('cam.body')} value={state.cameraBodyId} onChange={(event) => state.selectCameraBody(event.target.value as keyof typeof CAMERA_BODIES)}>{Object.values(CAMERA_BODIES).map((body) => <option key={body.id} value={body.id}>{body.brand} · {body.model}</option>)}</select></label>
          <div><span>{cameraBody.sensor === 'full-frame' ? meta.fullFrame : cameraBody.sensor === 'aps-c' ? 'APS-C' : 'MFT'}</span><b>{cameraBody.megapixels} MP</b><small>12–200 mm · ƒ/{lensProfile.maxAperture}</small></div>
        </div>
      </InspectorDrawer>
      <InspectorDrawer key="camera-optics" title={t('lens.character')} meta={meta.optical} className="camera-controls" comparison={{
        capture: () => captureStudio(state, ['lensProfileId', 'lensOpticsEnabled', 'lensVignette', 'lensDistortion', 'lensChromaticAberration', 'lensBreathing'] as const),
        apply: applyStudio,
      }}>
        <div className="lens-character-block">
          <div className="lens-optics-switch-row"><button className={state.lensOpticsEnabled ? 'active' : ''} onClick={() => setValue('lensOpticsEnabled', !state.lensOpticsEnabled)}><i />{t(state.lensOpticsEnabled ? 'lens.opticsOn' : 'lens.opticsOff')}</button><button onClick={() => { setValue('lensVignette', lensProfile.vignette); setValue('lensDistortion', lensProfile.distortion); setValue('lensChromaticAberration', lensProfile.chromaticAberration); setValue('lensBreathing', lensProfile.breathing) }}>{t('lens.preset')}</button></div>
          <Range label={t('lens.vignette')} disabled={!state.lensOpticsEnabled} value={state.lensVignette} min={0} max={100} unit="%" onChange={(value) => setValue('lensVignette', value)} />
          <Range label={t('lens.distortion')} disabled={!state.lensOpticsEnabled} value={state.lensDistortion} min={-100} max={100} unit="" onChange={(value) => setValue('lensDistortion', value)} />
          <div className="distortion-legend"><span>{t('lens.barrel')}</span><i /><span>{t('lens.pincushion')}</span></div>
          <Range label={t('lens.ca')} disabled={!state.lensOpticsEnabled} value={state.lensChromaticAberration} min={0} max={100} unit="%" onChange={(value) => setValue('lensChromaticAberration', value)} />
          <Range label={t('lens.breathing')} disabled={!state.lensOpticsEnabled} value={state.lensBreathing} min={0} max={100} unit="%" onChange={(value) => setValue('lensBreathing', value)} />
          <div className="bokeh-blade-readout"><span>{t('lens.blades')}</span><b>{lensProfile.blades}</b><small>{lensProfile.blades >= 11 ? 'ROUND' : 'DEFINED'}</small></div>
        </div>
      </InspectorDrawer>
      <InspectorDrawer key="camera-color" title={t('color.title')} meta={meta.color} className="camera-controls" comparison={{
        capture: () => captureStudio(state, ['imageFormat', 'whiteBalance', 'whiteBalanceTint', 'colorProfileId', 'highlightRolloff', 'toneCurve', 'lutIntensity'] as const),
        apply: applyStudio,
      }}>
        <div className="color-science-block">
          <div className="image-format-control" role="group" aria-label={t('color.formatAria')}>
            <button className={state.imageFormat === 'raw' ? 'active' : ''} onClick={() => setValue('imageFormat', 'raw')}><b>RAW</b><small>{t('color.raw.sub')}</small></button>
            <button className={state.imageFormat === 'jpeg' ? 'active' : ''} onClick={() => setValue('imageFormat', 'jpeg')}><b>JPEG</b><small>{t('color.jpeg.sub')}</small></button>
          </div>
          <label className="color-profile-select"><span>{t('color.profile')}</span><select aria-label={t('color.profile')} value={state.colorProfileId} onChange={(event) => setValue('colorProfileId', event.target.value as keyof typeof COLOR_PROFILES)}>{Object.values(COLOR_PROFILES).map((profile) => <option key={profile.id} value={profile.id}>{profile.code} · {t(`colorProfile.${profile.id as ColorProfileId}`)}</option>)}</select></label>
          <div className="wb-presets" role="group" aria-label={t('wb.aria')}>{([[3200,'wb.tungsten'],[4300,'wb.strobe'],[5600,'wb.daylight'],[6500,'wb.cloudy']] as [number, MessageKey][]).map(([temperature,key]) => <button key={temperature} className={state.whiteBalance === temperature ? 'active' : ''} onClick={() => setValue('whiteBalance', temperature)}>{t(key)}<small>{temperature}K</small></button>)}</div>
          <Range label={t('wb.label')} value={state.whiteBalance} min={2000} max={9000} step={100} unit=" K" onChange={(value) => setValue('whiteBalance', value)} />
          <Range label="Tint" value={state.whiteBalanceTint} min={-100} max={100} onChange={(value) => setValue('whiteBalanceTint', value)} />
          <Range label={t('color.highlightRolloff')} value={state.highlightRolloff} min={0} max={100} unit="%" onChange={(value) => setValue('highlightRolloff', value)} />
          <Range label={t('color.toneCurve')} value={state.toneCurve} min={0} max={100} unit="%" onChange={(value) => setValue('toneCurve', value)} />
          <Range label={t('color.lut')} disabled={state.imageFormat === 'raw'} value={state.lutIntensity} min={0} max={100} unit="%" onChange={(value) => setValue('lutIntensity', value)} />
          <div className="raw-pipeline-note"><i /><span>{state.imageFormat === 'raw' ? t('color.note.raw') : t('color.note.baked', { code: COLOR_PROFILES[state.colorProfileId].code })}</span></div>
        </div>
      </InspectorDrawer>
      <InspectorDrawer key="camera-sensor" title={t('sensor.title')} meta={meta.sensor} className="camera-controls" comparison={{
        capture: () => captureStudio(state, ['sensorSimulationEnabled', 'shutterMode', 'sensorDynamicRange', 'noiseReduction', 'colorNoise', 'motionBlur', 'rollingShutter'] as const),
        apply: applyStudio,
      }}>
        <div className="sensor-simulation-block">
          <div className="sensor-spec-strip"><span>BASE ISO <b>{cameraBody.nativeIso}</b></span><span>DR <b>{cameraBody.dynamicRange} STOPS</b></span><span>READOUT <b>{cameraBody.readoutMs} MS</b></span></div>
          <button className={state.sensorSimulationEnabled ? 'sensor-master active' : 'sensor-master'} onClick={() => setValue('sensorSimulationEnabled', !state.sensorSimulationEnabled)}><i />{t(state.sensorSimulationEnabled ? 'sensor.simOn' : 'sensor.simOff')}</button>
          <div className="shutter-mode-control" role="group" aria-label={t('sensor.shutterTypeAria')}><button className={state.shutterMode === 'mechanical' ? 'active' : ''} onClick={() => setValue('shutterMode', 'mechanical')}>{t('sensor.mechanical')}<small>GLOBAL</small></button><button className={state.shutterMode === 'electronic' ? 'active' : ''} onClick={() => setValue('shutterMode', 'electronic')}>{t('sensor.electronic')}<small>{cameraBody.readoutMs} MS</small></button></div>
          <Range label={t('sensor.dynamicRange')} disabled={!state.sensorSimulationEnabled} value={state.sensorDynamicRange} min={8} max={16} step={0.1} displayValue={`${state.sensorDynamicRange.toFixed(1)} stops`} onChange={(value) => setValue('sensorDynamicRange', Number(value.toFixed(1)))} />
          <Range label={t('sensor.noiseReduction')} disabled={!state.sensorSimulationEnabled} value={state.noiseReduction} min={0} max={100} unit="%" onChange={(value) => setValue('noiseReduction', value)} />
          <Range label={t('sensor.colorNoise')} disabled={!state.sensorSimulationEnabled} value={state.colorNoise} min={0} max={100} unit="%" onChange={(value) => setValue('colorNoise', value)} />
          <Range label={t('sensor.motionBlur')} disabled={!state.sensorSimulationEnabled} value={state.motionBlur} min={0} max={100} unit="%" onChange={(value) => setValue('motionBlur', value)} />
          <Range label="Rolling Shutter" disabled={!state.sensorSimulationEnabled || state.shutterMode !== 'electronic'} value={state.rollingShutter} min={0} max={100} unit="%" onChange={(value) => setValue('rollingShutter', value)} />
          <div className={`sensor-warning ${state.shutterMode === 'electronic' && state.rollingShutter > 60 ? 'warning' : ''}`}><i /><span>{state.shutterMode === 'electronic' ? t('sensor.rollingWarn', { ms: cameraBody.readoutMs }) : t('sensor.mechNote')}</span></div>
        </div>
      </InspectorDrawer>
      <InspectorDrawer key="camera-frame" title={t('guide.composition')} meta={meta.frame} className="camera-controls" action={<button onClick={state.openCameraView}>{t('cam.enterView')}</button>} comparison={{
        capture: () => captureStudio(state, ['compositionGuide', 'dofEnabled', 'focusGuide'] as const),
        apply: applyStudio,
      }}>
        <div className="composition-guide-control"><span>{t('guide.composition')}</span><div role="group" aria-label={t('guide.compositionAria')}>{(['none','thirds','golden','safe'] as const).map((guide) => <button key={guide} className={state.compositionGuide === guide ? 'active' : ''} onClick={() => setValue('compositionGuide', guide)}>{t(`guide.${guide}`)}</button>)}</div></div>
        <div className="optics-status">
          <div><span>NEAR</span><strong>{depth.near.toFixed(2)} m</strong></div>
          <div><span>FOCUS</span><strong>{state.focusDistance.toFixed(2)} m</strong></div>
          <div><span>FAR</span><strong>{depth.far ? `${depth.far.toFixed(2)} m` : '∞'}</strong></div>
        </div>
        <div className="optics-toggles">
          <button className={state.dofEnabled ? 'active' : ''} onClick={() => setValue('dofEnabled', !state.dofEnabled)}><i />{t('optics.dofPreview')}</button>
          <button className={state.focusGuide ? 'active' : ''} onClick={() => setValue('focusGuide', !state.focusGuide)}><i />{t('optics.focusGuide')}</button>
        </div>
      </InspectorDrawer>
      <InspectorDrawer key="camera-ambient" title={t('ambient.title')} meta={meta.ambient} className="camera-controls" comparison={{
        capture: () => captureStudio(state, ['ambientLevel', 'ambientTemperature', 'syncSpeed'] as const),
        apply: applyStudio,
      }}>
        <div className="ambient-control-block">
          <Range label={t('ambient.level')} value={state.ambientLevel} min={0} max={100} step={1} unit="%" onChange={(value) => setValue('ambientLevel', value)} />
          <Range label={t('ambient.temperature')} value={state.ambientTemperature} min={2200} max={7500} step={100} unit=" K" onChange={(value) => setValue('ambientTemperature', value)} />
          <label className="select-row"><span>{t('sync.max')}</span><select aria-label={t('sync.max')} value={state.syncSpeed} onChange={(event) => setValue('syncSpeed', Number(event.target.value))}>{[125, 160, 200, 250, 320, 500].map((value) => <option key={value} value={value}>1/{value} s</option>)}</select></label>
          {state.lights.some((item) => item.enabled && item.operationMode === 'flash') && <div className={state.shutter > state.syncSpeed && state.lights.some((item) => item.enabled && item.operationMode === 'flash' && !item.hssEnabled) ? 'global-sync-status error' : 'global-sync-status'}><i /><span>{t(state.shutter > state.syncSpeed ? 'sync.over' : 'sync.ok')}</span><b>1/{state.shutter}s</b></div>}
        </div>
      </InspectorDrawer>
      <InspectorDrawer key="camera-exposure" title={t('cam.section')} meta={meta.cameraExposure} className="camera-controls" comparison={{
        capture: () => captureStudio(state, ['sensorFormat', 'frameAspect', 'frameOrientation', 'cameraAutoFocus', 'focusDistance', 'focalLength', 'lensProfileId', 'aperture', 'shutter', 'iso'] as const),
        apply: applyStudio,
      }}>
        <div className="sub-control sensor-control">
          <span>{t('sensor.override')}</span>
          <div className="segmented-control" role="group" aria-label={t('sensor.formatAria')}>
            {([['full-frame', 'FF'], ['aps-c', 'APS-C'], ['mft', 'MFT']] as const).map(([format, label]) => <button key={format} className={state.sensorFormat === format ? 'active' : ''} onClick={() => setValue('sensorFormat', format)}>{label}</button>)}
          </div>
        </div>
        <div className="sub-control frame-control">
          <span>{t('frame.ratio')}</span>
          <div className="segmented-control" role="group" aria-label={t('frame.ratio')}>
            {(['3:2', '4:5', '1:1', '16:9'] as const).map((ratio) => <button key={ratio} className={state.frameAspect === ratio ? 'active' : ''} onClick={() => setValue('frameAspect', ratio)}>{ratio}</button>)}
          </div>
        </div>
        <div className="orientation-control" role="group" aria-label={t('frame.orientation')}>
          <button className={state.frameOrientation === 'landscape' ? 'active' : ''} onClick={() => setValue('frameOrientation', 'landscape')}><i className="landscape-icon" />{t('frame.landscape')}</button>
          <button className={state.frameOrientation === 'portrait' ? 'active' : ''} onClick={() => setValue('frameOrientation', 'portrait')}><i className="portrait-icon" />{t('frame.portrait')}</button>
        </div>
        <button className="focus-target-button" onClick={() => { state.setCameraAutoFocus(false); setValue('focusDistance', Number(cameraDistance.toFixed(2))) }}>{t('cam.focusAtTarget', { distance: cameraDistance.toFixed(2) })}</button>
        <div className="focal-presets" role="group" aria-label={t('cam.focal')}>{[24,35,50,70,85,105,135,200].map((value) => <button key={value} className={state.focalLength === value ? 'active' : ''} onClick={() => setFocalLength(value)}>{value}</button>)}</div>
        <Range label={t('cam.focal')} value={state.focalLength} min={12} max={200} unit=" mm" onChange={setFocalLength} />
        <Range label={t('cam.aperture')} value={state.aperture} min={lensProfile.maxAperture} max={16} step={0.1} onChange={(value) => setValue('aperture', Number(value.toFixed(1)))} />
        <Range label={t('cam.focusDistance')} value={state.focusDistance} min={1} max={10} step={0.05} displayValue={`${state.focusDistance.toFixed(2)} m`} onChange={(value) => { if (state.cameraAutoFocus) state.setCameraAutoFocus(false); setValue('focusDistance', Number(value.toFixed(2))) }} />
        <div className="shutter-speed-control">
          <div><span>{t('cam.shutter')}</span><output>1/{state.shutter} s</output></div>
          <div role="group" aria-label={t('cam.shutterAria')}>
            {[8, 15, 30, 60, 125, 250, 500, 1000, 2000].map((value) => <button key={value} aria-label={t('cam.shutterValue', { value })} className={state.shutter === value ? 'active' : ''} onClick={() => setValue('shutter', value)}>1/{value}</button>)}
          </div>
        </div>
        <Range label="ISO" value={state.iso} min={100} max={12800} step={100} onChange={(value) => setValue('iso', value)} />
      </InspectorDrawer>
      </>}
      {footer}
      </div>
      </InspectorSearchContext.Provider>
      <InspectorFooter mode={mode} />
    </aside>
  )
}

const THREE_RAD_TO_DEG = 180 / Math.PI

function kelvinToRgb(kelvin: number): [number, number, number] {
  const temp = kelvin / 100
  const red = temp <= 66 ? 255 : 329.698727446 * Math.pow(temp - 60, -0.1332047592)
  const green = temp <= 66 ? 99.4708025861 * Math.log(temp) - 161.1195681661 : 288.1221695283 * Math.pow(temp - 60, -0.0755148492)
  const blue = temp >= 66 ? 255 : temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.044792731
  return [red, green, blue].map((value) => Math.round(Math.max(0, Math.min(255, value)))) as [number, number, number]
}
