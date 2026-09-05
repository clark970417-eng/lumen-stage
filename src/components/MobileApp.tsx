import { useShallow } from 'zustand/react/shallow'
/**
 * Lumen Stage on a phone.
 *
 * Same store, same 3D studio, a tenth of the controls. The full interface asks
 * you to build a setup; this one asks three questions instead — which lighting
 * pattern, how the key light sits, and what the camera does with it — because
 * those are the three a photographer can usefully answer with a thumb.
 *
 * Everything here writes to the same store as the desktop shell, so a scene
 * started on a phone opens in the full interface unchanged.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import { AboutDialog, CopyrightMark } from './AboutDialog'
import { BrandMark } from './BrandMark'
import { BACKDROPS } from '../backdrops'
import { LOCALES, useCatalogT, useLocaleStore, useT, type Locale, type MessageKey } from '../i18n'
import { renderExportCanvas, exportFileName } from '../shotCapture'
import { SETUP_CATEGORIES, SETUP_LIBRARY, type SetupCategory } from '../setups'
import { useStudio, type LightOptic, type LightShape, type StudioLight, type StudioState } from '../store'
import { useRenderProgress } from '../renderProgress'
import { usePhoneScreen, useUiModeStore } from '../uiMode'
import { lightAimAngles, targetFromLightAim } from '../lightAim'
import { POSE_LIBRARY } from '../pose'
import { OUTFITS, type OutfitStyle } from '../wardrobe'
import { buildShareLink, copyToClipboard } from '../share'
import { MAX_PROJECT_FILE_BYTES, readTextFileWithinLimit } from '../security'
import { formatStorage, storageUsage } from '../persistence'
import { useDialogFocus } from './DialogFocus'
import { OnboardingTour, shouldShowOnboarding } from './OnboardingTour'
import { analyzeReferencePixels, type ReferenceLightingAnalysis } from '../referenceLighting'
import { captureContinuityBaseline, evaluateContinuity, type ContinuityBaseline } from '../continuity'
import { useWorkflow, type WorkflowStage } from '../workflow'
import { assetHref, routeHref } from '../routing'
import { lightWattage, percentForWattage, wattageMinimum, wattageLimit } from '../lightProfiles'
import '../mobile.css'

type Tab = 'planning' | 'lighting' | 'shooting' | 'layout'

const MOBILE_WORKFLOW = {
  en: { planning: 'Person', lighting: 'Light', shooting: 'Camera', layout: 'Layout', reference: 'Reference → light', choose: 'Choose photo', apply: 'Build starting light', local: 'Local luminance estimate', direction: 'Key direction', ratio: 'Key : fill', confidence: 'Confidence', left: 'Left', right: 'Right', front: 'Front', low: 'Low', medium: 'Medium', high: 'High', continuity: 'Continuity guard', baseline: 'Set baseline', track: 'Track subject', restore: 'Restore values', stable: 'Baseline matched', noBaseline: 'Save the hero shot before changing the scene.' },
  zh: { planning: '人物', lighting: '佈光', shooting: '相機', layout: '配置', reference: '參考照 → 起始燈位', choose: '選擇照片', apply: '建立起始燈位', local: '本機明暗推測', direction: '主光方向', ratio: '主光：補光', confidence: '推測信心', left: '左側', right: '右側', front: '正面', low: '低', medium: '中', high: '高', continuity: '光線連戲', baseline: '建立基準', track: '跟隨人物', restore: '恢復讀值', stable: '目前與基準吻合', noBaseline: '先儲存主鏡位，再調整場景。' },
  ja: { planning: '人物', lighting: '照明', shooting: 'カメラ', layout: '配置', reference: '参照写真 → 初期配光', choose: '写真を選択', apply: '初期配光を作成', local: '端末内の明暗推定', direction: 'キー方向', ratio: 'キー：フィル', confidence: '信頼度', left: '左', right: '右', front: '正面', low: '低', medium: '中', high: '高', continuity: '光の連続性', baseline: '基準を設定', track: '人物を追従', restore: '基準値に戻す', stable: '基準と一致', noBaseline: '変更前に基準ショットを保存します。' },
}

const tabStage: Record<Tab, WorkflowStage> = {
  planning: 'intent',
  lighting: 'lighting',
  shooting: 'framing',
  layout: 'layout',
}

const MobileStage = lazy(() => import('./MobileStage'))

/** A short backdrop shelf — the papers that cover most of what a studio shoots. */
const BACKDROP_CHOICES = ['super-white', 'bone', 'fashion-grey', 'studio-grey', 'thunder-grey', 'charcoal', 'black-paper', 'cobalt', 'crimson']

/**
 * The shapers worth carrying on a phone, each a real modifier from the
 * catalogue rather than a look: fitting one moves the beam, the size and the
 * transmission together, so the meter agrees with the picture.
 */
const MOBILE_MODIFIERS: { id: string; optic: LightOptic }[] = [
  { id: 'rfi-3x3', optic: 'softbox' },
  { id: 'umbrella-shoot-105', optic: 'umbrella-shoot' },
  { id: 'umbrella-silver-105', optic: 'umbrella-reflect' },
  { id: 'godox-dish-55', optic: 'beauty-dish' },
  { id: 'aputure-lantern-90', optic: 'lantern' },
  { id: 'standard-reflector', optic: 'standard' },
  { id: 'fresnel-8', optic: 'fresnel' },
  { id: 'snoot', optic: 'snoot' },
]

/** Nothing on the head at all — the hardest light in the room. */
const BARE_BULB = 'bare-bulb'

/** Sizes named the way a rental house names them. */
const MODIFIER_SIZES: { label: string; shape: LightShape; width: number; height: number }[] = [
  { label: '60×60', shape: 'square', width: 0.6, height: 0.6 },
  { label: '90×90', shape: 'square', width: 0.9, height: 0.9 },
  { label: 'Ø120', shape: 'round', width: 1.2, height: 1.2 },
  { label: '30×120', shape: 'strip', width: 0.3, height: 1.2 },
]

/** Shapers with a lit surface; the rest are a bare reflector or a tube. */
const SIZED_OPTICS: LightOptic[] = ['softbox', 'umbrella-shoot', 'umbrella-reflect', 'beauty-dish', 'deep-parabolic', 'lantern']

/** Gel-ish colours, so a coloured rim is two taps rather than a colour wheel. */
const RGB_PRESETS = ['#ff3d3d', '#ff8a3d', '#ffd23d', '#5cff8f', '#3ddcff', '#3d6cff', '#8b5cff', '#ff5cc8']
const MOBILE_BODY_PRESETS = ['slim', 'average', 'curvy', 'athletic', 'heavy']
const MOBILE_POSES = ['neutral', 'contrapposto', 'three-quarter', 'seated-upright', 'walking', 'editorial', 'holding']
const MOBILE_OUTFITS: OutfitStyle[] = ['tshirt', 'shirt', 'suit', 'dress', 'activewear', 'coat']

const toDegrees = (radians: number) => (radians * 180) / Math.PI
const toRadians = (degrees: number) => (degrees * Math.PI) / 180

const MOBILE_CAMERA_KEYS = ['focalLength', 'aperture', 'iso', 'focusDistance', 'cameraPosition', 'cameraTarget', 'cameraTargetSubjectId', 'cameraTargetZone', 'cameraAutoFocus', 'cameraFramingPreset', 'lensProfileId', 'frameOrientation', 'backdropId'] as const

function captureMobileCamera(state: StudioState) {
  return Object.fromEntries(MOBILE_CAMERA_KEYS.map((key) => [key, structuredClone(state[key])])) as Pick<StudioState, typeof MOBILE_CAMERA_KEYS[number]>
}

function MobileEditActions<T>({ storageKey, capture, apply }: { storageKey: string; capture: () => T; apply: (snapshot: T) => void }) {
  const locale = useLocaleStore((state) => state.locale)
  const baseline = useRef<T>(capture())
  const current = useRef<T | null>(null)
  const [saved, setSaved] = useState(false)
  const copy = locale === 'zh'
    ? { before: '按住前後', beforeAria: '按住查看調整前', reset: '重設', save: '儲存預設', saved: '已儲存' }
    : locale === 'ja'
      ? { before: '長押し前後', beforeAria: '長押しで調整前を表示', reset: 'リセット', save: 'プリセット保存', saved: '保存済み' }
      : { before: 'Hold before', beforeAria: 'Hold to preview before', reset: 'Reset', save: 'Save preset', saved: 'Saved' }
  const showBefore = () => {
    if (current.current !== null) return
    current.current = capture()
    apply(baseline.current)
  }
  const showAfter = () => {
    if (current.current === null) return
    apply(current.current)
    current.current = null
  }
  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(capture()))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1600)
    } catch { setSaved(false) }
  }
  return <div className="m-edit-actions" role="toolbar">
    <button aria-label={copy.beforeAria} onPointerDown={(event) => { event.preventDefault(); showBefore() }} onPointerUp={showAfter} onPointerCancel={showAfter} onPointerLeave={showAfter}>{copy.before}</button>
    <button onClick={() => { showAfter(); apply(baseline.current) }}>{copy.reset}</button>
    <button className={saved ? 'saved' : ''} onClick={save}>{saved ? copy.saved : copy.save}</button>
  </div>
}

/** Where a light sits relative to the subject, in the terms the sliders use. */
function lightPolar(light: StudioLight, subject: [number, number, number]) {
  const dx = light.position[0] - subject[0]
  const dz = light.position[2] - subject[2]
  return {
    /** 0° is straight in front of the subject; positive swings to camera right. */
    angle: Math.round(toDegrees(Math.atan2(dx, dz))),
    distance: Math.max(0.4, Math.hypot(dx, dz)),
  }
}

function placeLight(subject: [number, number, number], angle: number, distance: number, height: number): [number, number, number] {
  const radians = toRadians(angle)
  return [
    Number((subject[0] + Math.sin(radians) * distance).toFixed(3)),
    Number(height.toFixed(3)),
    Number((subject[2] + Math.cos(radians) * distance).toFixed(3)),
  ]
}

/**
 * Wait until the renderer has actually drawn what we are about to read back.
 *
 * Counting frames rather than milliseconds matters here: switching to the
 * viewfinder moves the camera on the next render, and a slow phone can take
 * longer than any timeout to get there — capture too early and the photo is
 * the studio view, gizmos and all.
 */
function drawnFrames(count: number) {
  return new Promise<void>((resolve) => {
    let settled = false
    let left = count
    let frame = 0
    let timeout = 0
    const finish = () => {
      if (settled) return
      settled = true
      cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
      resolve()
    }
    const step = () => { if (left-- <= 0) finish(); else frame = requestAnimationFrame(step) }
    frame = requestAnimationFrame(step)
    // A backgrounded tab freezes rAF entirely; never hang the shutter on it.
    timeout = window.setTimeout(finish, 2500)
  })
}

/** Stop the realtime WebGL loop when the browser is backgrounded. */
function subscribeToVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

function usePageVisible() {
  return useSyncExternalStore(subscribeToVisibility, () => !document.hidden, () => true)
}

const beginRangeEdit = () => useStudio.getState().beginHistoryTransaction()
const endRangeEdit = () => useStudio.getState().endHistoryTransaction()

function Dial({ label, value, min, max, step = 1, readout, disabled = false, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  readout: string
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="m-dial">
      <span>{label}<b>{readout}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onPointerDown={beginRangeEdit} onPointerUp={endRangeEdit} onPointerCancel={endRangeEdit} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function SetupsTab({ applied, onApply }: { applied: string | null; onApply: (id: string) => void }) {
  const t = useT()
  const ct = useCatalogT()
  const applyLightingSetup = useStudio((state) => state.applyLightingSetup)
  const [category, setCategory] = useState<SetupCategory>('portrait')

  return (
    <div className="m-tab">
      <div className="m-chips m-chips-scroll" role="tablist">
        {SETUP_CATEGORIES.map((item) => (
          <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
            {t(`setups.category.${item}` as MessageKey)}
          </button>
        ))}
      </div>
      <p className="m-note">{t('mobile.setups.hint')}</p>
      <div className="m-setup-list">
        {SETUP_LIBRARY.filter((setup) => setup.category === category).map((setup) => (
          <button
            key={setup.id}
            className={applied === setup.id ? 'm-setup active' : 'm-setup'}
            onClick={() => { applyLightingSetup(setup.id); onApply(setup.id) }}
          >
            <span className="m-setup-plan" aria-hidden="true">
              <svg viewBox="-3 -3 6 6">
                <circle cx="0" cy="0" r="0.32" className="m-plan-subject" />
                <path d="M -0.42 0.9 L 0.42 0.9 L 0 0.35 Z" className="m-plan-camera"
                  transform={`translate(${setup.camera.position[0] * 0.55} ${setup.camera.position[2] * 0.55}) rotate(180)`} />
                {setup.lights.map((light) => (
                  <rect key={light.id} x={-0.24} y={-0.24} width={0.48} height={0.48} rx={0.09} className="m-plan-light"
                    transform={`translate(${light.position[0] * 0.55} ${light.position[2] * -0.55})`} />
                ))}
              </svg>
            </span>
            <span className="m-setup-text">
              <strong>{ct(`setup.${setup.id}`, setup.label)}</strong>
              <small>{ct(`setup.${setup.id}.summary`, setup.summary)}</small>
              <em>{setup.lights.length} · {setup.ratio}</em>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** The phone keeps only choices that materially change framing or light. */
function SubjectTab() {
  const t = useT()
  const ct = useCatalogT()
  const state = useStudio(useShallow((state) => ({
    addStudioObject: state.addStudioObject,
    applyPhysiquePreset: state.applyPhysiquePreset,
    applyPosePreset: state.applyPosePreset,
    applyStudioSubjectPhysique: state.applyStudioSubjectPhysique,
    applyStudioSubjectPose: state.applyStudioSubjectPose,
    deleteMainSubject: state.deleteMainSubject,
    deleteStudioObject: state.deleteStudioObject,
    mainSubjectEnabled: state.mainSubjectEnabled,
    modelHeight: state.modelHeight,
    modelPosition: state.modelPosition,
    outfitStyle: state.outfitStyle,
    physique: state.physique,
    posePreset: state.posePreset,
    selectObject: state.selectObject,
    selected: state.selected,
    setModelTransform: state.setModelTransform,
    setStudioObjectTransform: state.setStudioObjectTransform,
    setValue: state.setValue,
    studioObjects: state.studioObjects,
    updatePhysique: state.updatePhysique,
    updateStudioObject: state.updateStudioObject,
    updateStudioSubjectPhysique: state.updateStudioSubjectPhysique,
  })))
  const subjects = state.studioObjects.filter((object) => object.type === 'subject')
  const selectedObject = subjects.find((object) => object.id === state.selected)
  const activeId = state.selected === 'model' && state.mainSubjectEnabled
    ? 'model'
    : selectedObject?.id ?? (state.mainSubjectEnabled ? 'model' : subjects[0]?.id)
  const activeObject = subjects.find((object) => object.id === activeId)
  const main = activeId === 'model'
  const height = main ? state.modelHeight : activeObject?.subjectHeight ?? 1.82
  const position = main ? state.modelPosition : activeObject?.position ?? [0, 0, 0]
  const physique = main ? state.physique : activeObject?.subjectPhysique ?? state.physique
  const posePreset = main ? state.posePreset : activeObject?.subjectPosePreset ?? 'neutral'
  const outfit = main ? state.outfitStyle : activeObject?.subjectOutfitStyle ?? 'tshirt'
  const updatePhysique = (patch: Partial<typeof physique>) => main
    ? state.updatePhysique(patch)
    : activeObject && state.updateStudioSubjectPhysique(activeObject.id, patch)
  const applyPhysiquePreset = (id: string) => main
    ? state.applyPhysiquePreset(id)
    : activeObject && state.applyStudioSubjectPhysique(activeObject.id, id)
  const applyPosePreset = (id: string) => main
    ? state.applyPosePreset(id)
    : activeObject && state.applyStudioSubjectPose(activeObject.id, id)
  const setHeight = (value: number) => main
    ? state.setValue('modelHeight', Number(value.toFixed(2)))
    : activeObject && state.updateStudioObject(activeObject.id, { subjectHeight: Number(value.toFixed(2)) })
  const setVerticalPosition = (value: number) => main
    ? state.setModelTransform([position[0], Number(value.toFixed(2)), position[2]])
    : activeObject && state.setStudioObjectTransform(activeObject.id, [position[0], Number(value.toFixed(2)), position[2]], activeObject.rotationY)
  const setOutfit = (value: OutfitStyle) => main
    ? state.setValue('outfitStyle', value)
    : activeObject && state.updateStudioObject(activeObject.id, { subjectOutfitStyle: value })
  const deleteSubject = () => main ? state.deleteMainSubject() : activeObject && state.deleteStudioObject(activeObject.id)

  return <div className="m-tab">
    <div className="m-subject-bar">
      <div className="m-chips m-chips-scroll" role="group" aria-label={t('object.subject')}>
        {state.mainSubjectEnabled && <button className={activeId === 'model' ? 'active' : ''} onClick={() => state.selectObject('model')}>{t('subject.main')}</button>}
        {subjects.map((subject, index) => <button key={subject.id} className={activeId === subject.id ? 'active' : ''} onClick={() => state.selectObject(subject.id)}>{t('subject.numbered', { n: index + 1, name: subject.name })}</button>)}
      </div>
      <div className="m-subject-actions">
        <button onClick={() => state.addStudioObject('subject', 'feminine')}>＋ {t('physique.feminine')}</button>
        <button onClick={() => state.addStudioObject('subject', 'masculine')}>＋ {t('physique.masculine')}</button>
        {activeId && <button className="danger" onClick={deleteSubject}>{t('common.delete')}</button>}
      </div>
    </div>
    {!activeId ? <p className="m-note">{t('mobile.subject.hint')}</p> : <>
    <p className="m-note">{t('mobile.subject.hint')}</p>
    <div className="m-field">
      <span className="m-label">{t('physique.sex')}</span>
      <div className="m-chips">
        {([['feminine','physique.feminine'],['masculine','physique.masculine'],['neutral','physique.neutral']] as const).map(([value,key]) => <button key={value} className={physique.sex === value ? 'active' : ''} onClick={() => updatePhysique({ sex: value })}>{t(key)}</button>)}
      </div>
    </div>
    <Dial label={t('subject.height')} value={height} min={1.45} max={2.2} step={0.01} readout={`${height.toFixed(2)} m`} onChange={setHeight} />
    <Dial label={t('axis.y')} value={position[1]} min={0} max={3} step={0.05} readout={`${position[1].toFixed(2)} m`} onChange={setVerticalPosition} />
    <Dial label={t('physique.age')} value={physique.age ?? 28} min={18} max={80} readout={`${Math.round(physique.age ?? 28)}${t('physique.years')}`} onChange={(value) => updatePhysique({ age: value })} />
    <div className="m-field">
      <span className="m-label">{t('physique.presets')}</span>
      <div className="m-chips m-chips-scroll">
        {MOBILE_BODY_PRESETS.map((id) => <button key={id} onClick={() => applyPhysiquePreset(id)}>{ct(`physique.${id}`, id)}</button>)}
      </div>
    </div>
    <div className="m-field">
      <span className="m-label">{t('pose.library')}</span>
      <div className="m-chips m-chips-scroll">
        {MOBILE_POSES.map((id) => {
          const entry = POSE_LIBRARY.find((item) => item.id === id)
          return <button key={id} className={posePreset === id ? 'active' : ''} onClick={() => applyPosePreset(id)}>{ct(`pose.${id}`, entry?.label ?? id)}</button>
        })}
      </div>
    </div>
    <div className="m-field">
      <span className="m-label">{t('wardrobe.outfit')}</span>
      <div className="m-chips m-chips-scroll">
        {MOBILE_OUTFITS.map((id) => <button key={id} className={outfit === id ? 'active' : ''} onClick={() => setOutfit(id)}>{ct(`outfit.${id}`, OUTFITS.find((item) => item.id === id)?.label ?? id)}</button>)}
      </div>
    </div>
    </>}
  </div>
}

function LightsTab() {
  const t = useT()
  const lights = useStudio((state) => state.lights)
  const selected = useStudio((state) => state.selected)
  const subject = useStudio((state) => state.mainSubjectEnabled ? state.modelPosition : state.studioObjects.find((object) => object.type === 'subject')?.position ?? state.modelPosition)
  const selectObject = useStudio((state) => state.selectObject)
  const updateLight = useStudio((state) => state.updateLight)
  const setLightPosition = useStudio((state) => state.setLightPosition)
  const setLightTarget = useStudio((state) => state.setLightTarget)
  const fitModifier = useStudio((state) => state.fitModifier)
  const addLight = useStudio((state) => state.addLight)
  const deleteLight = useStudio((state) => state.deleteLight)

  const light = lights.find((item) => item.id === selected) ?? lights[0]
  if (!light) {
    return (
      <div className="m-tab">
        <p className="m-note">{t('mobile.light.empty')}</p>
        <button className="m-add-light" onClick={() => addLight()}>{t('mobile.light.add')}</button>
      </div>
    )
  }

  const { angle, distance } = lightPolar(light, subject)
  const direction = lightAimAngles(light.position, light.target)
  const move = (nextAngle: number, nextDistance: number, nextHeight: number) =>
    setLightPosition(light.id, placeLight(subject, nextAngle, nextDistance, nextHeight))
  const aim = (pan: number, tilt: number) =>
    setLightTarget(light.id, targetFromLightAim(light.position, direction.distance, pan, tilt))
  const side = angle === 0 ? t('mobile.light.angle.front')
    : Math.abs(angle) > 150 ? t('mobile.light.angle.back')
      : angle > 0 ? t('mobile.light.angle.right') : t('mobile.light.angle.left')
  // A bare head has no shaper on it; everything else with a lit surface has a
  // size worth setting.
  const bare = light.modifierId === BARE_BULB
  const sized = !bare && SIZED_OPTICS.includes(light.optic)

  return (
    <div className="m-tab">
      <div className="m-chips m-chips-scroll" role="group" aria-label={t('mobile.light.pick')}>
        {lights.map((item) => (
          <button key={item.id} className={item.id === light.id ? 'active' : ''} aria-pressed={item.id === light.id} onClick={() => selectObject(item.id)}>
            <i className={item.enabled ? 'm-led on' : 'm-led'} />
            {item.name.split('·')[0].trim()}
          </button>
        ))}
        <button className="m-chip-add" onClick={() => addLight()} aria-label={t('mobile.light.add')} title={t('mobile.light.add')}>＋</button>
      </div>

      <input
        className="m-light-name"
        aria-label={t('light.name')}
        value={light.name}
        maxLength={24}
        onChange={(event) => updateLight(light.id, { name: event.target.value })}
        onBlur={(event) => { if (!event.target.value.trim()) updateLight(light.id, { name: t('mobile.light.untitled') }) }}
      />

      <div className="m-light-actions">
        <button className={light.enabled ? 'm-toggle active' : 'm-toggle'} aria-pressed={light.enabled} onClick={() => updateLight(light.id, { enabled: !light.enabled })}>
          {t('mobile.light.toggle')}<b>{t(light.enabled ? 'common.on' : 'common.off')}</b>
        </button>
        <button className="m-delete" disabled={lights.length < 2} onClick={() => deleteLight(light.id)}>{t('common.delete')}</button>
      </div>

      <Dial
        label={t('mobile.light.power')}
        value={lightWattage(light)}
        min={wattageMinimum(light)}
        max={wattageLimit(light)}
        readout={`${lightWattage(light)} ${light.operationMode === 'flash' ? 'Ws' : 'W'}`}
        onChange={(value) => updateLight(light.id, { powerPercent: percentForWattage(light, value) })}
      />
      <Dial label={t('mobile.light.angle')} value={angle} min={-180} max={180} step={5} readout={`${Math.abs(angle)}° ${side}`}
        onChange={(value) => move(value, distance, light.position[1])} />
      <Dial label={t('mobile.light.distance')} value={Number(distance.toFixed(2))} min={0.6} max={4.5} step={0.05} readout={`${distance.toFixed(2)} m`}
        onChange={(value) => move(angle, value, light.position[1])} />
      <Dial label={t('mobile.light.height')} value={Number(light.position[1].toFixed(2))} min={0.8} max={3.4} step={0.05} readout={`${light.position[1].toFixed(2)} m`}
        onChange={(value) => move(angle, distance, value)} />

      <div className="m-field">
        <span className="m-label">{t('mobile.light.direction')}</span>
        <Dial label={t('mobile.light.pan')} value={Number(direction.pan.toFixed(1))} min={-180} max={180} step={5} readout={`${Math.round(direction.pan)}°`}
          onChange={(value) => aim(value, direction.tilt)} />
        <Dial label={t('mobile.light.tilt')} value={Number(direction.tilt.toFixed(1))} min={-75} max={75} step={1} readout={`${Math.abs(Math.round(direction.tilt))}° ${t(direction.tilt > 0.5 ? 'mobile.light.tilt.down' : direction.tilt < -0.5 ? 'mobile.light.tilt.up' : 'mobile.light.tilt.level')}`}
          onChange={(value) => aim(direction.pan, value)} />
      </div>

      <div className="m-field">
        <span className="m-label">{t('optic.title')}</span>
        <div className="m-chips">
          {MOBILE_MODIFIERS.map((entry) => (
            <button key={entry.id} className={bare ? '' : light.optic === entry.optic ? 'active' : ''}
              onClick={() => fitModifier(light.id, entry.id)}>
              {t(`optic.${entry.optic}` as MessageKey)}
            </button>
          ))}
          <button className={bare ? 'active' : ''} onClick={() => fitModifier(light.id, BARE_BULB)}>{t('mobile.light.bare')}</button>
        </div>
      </div>

      {sized && (
        <div className="m-field">
          <span className="m-label m-label-row">
            {t('modifier.size')}
            <b>{light.shape === 'round' ? `Ø${Math.round(light.modifierWidth * 100)}` : `${Math.round(light.modifierWidth * 100)}×${Math.round(light.modifierHeight * 100)}`} cm</b>
          </span>
          <div className="m-chips">
            {MODIFIER_SIZES.map((size) => (
              <button key={size.label} className={light.shape === size.shape && Math.abs(light.modifierWidth - size.width) < 0.02 ? 'active' : ''}
                onClick={() => updateLight(light.id, { shape: size.shape, modifierWidth: size.width, modifierHeight: size.height })}>
                {size.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="m-field">
        <span className="m-label">{t('light.colorMode')}</span>
        <div className="m-chips">
          <button className={light.colorMode === 'kelvin' ? 'active' : ''} onClick={() => updateLight(light.id, { colorMode: 'kelvin' })}>{t('light.kelvin')}</button>
          <button className={light.colorMode === 'rgb' ? 'active' : ''} onClick={() => updateLight(light.id, { colorMode: 'rgb' })}>RGB</button>
        </div>
      </div>

      {light.colorMode === 'kelvin' ? (
        <Dial label={t('mobile.light.temperature')} value={light.temperature} min={2800} max={7500} step={50} readout={`${light.temperature} K`}
          onChange={(value) => updateLight(light.id, { temperature: value })} />
      ) : (
        <div className="m-field">
          <label className="m-color-row">
            <span className="m-label">{t('light.rgbColor')}</span>
            <input type="color" aria-label={t('light.rgbColor')} value={light.rgb} onChange={(event) => updateLight(light.id, { rgb: event.target.value })} />
            <output>{light.rgb.toUpperCase()}</output>
          </label>
          <div className="m-swatches">
            {RGB_PRESETS.map((color) => (
              <button key={color} className={light.rgb.toLowerCase() === color ? 'active' : ''} style={{ padding: 4 }}
                aria-label={color} onClick={() => updateLight(light.id, { rgb: color })}><i style={{ background: color }} /></button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CameraTab() {
  const t = useT()
  const ct = useCatalogT()
  const setValue = useStudio((state) => state.setValue)
  const focalLength = useStudio((state) => state.focalLength)
  const aperture = useStudio((state) => state.aperture)
  const iso = useStudio((state) => state.iso)
  const framingPreset = useStudio((state) => state.cameraFramingPreset)
  const frameCameraSubject = useStudio((state) => state.frameCameraSubject)
  const targetSubjectId = useStudio((state) => state.mainSubjectEnabled ? 'model' : state.studioObjects.find((object) => object.type === 'subject')?.id)
  const frameOrientation = useStudio((state) => state.frameOrientation)
  const backdropId = useStudio((state) => state.backdropId)
  const selectBackdrop = useStudio((state) => state.selectBackdrop)
  const cameraPosition = useStudio((state) => state.cameraPosition)
  const cameraTarget = useStudio((state) => state.cameraTarget)
  const setCameraPosition = useStudio((state) => state.setCameraPosition)
  const renderMode = useStudio((state) => state.renderMode)
  const pathStatus = useRenderProgress((state) => state.status)
  const pathSamples = useRenderProgress((state) => state.samples)
  const startPhotoRender = useStudio((state) => state.startPhotoRender)
  const openCameraView = useStudio((state) => state.openCameraView)

  const dx = cameraPosition[0] - cameraTarget[0]
  const dz = cameraPosition[2] - cameraTarget[2]
  const cameraAngle = Math.round(toDegrees(Math.atan2(dx, dz)))
  const cameraRadius = Math.max(0.5, Math.hypot(dx, dz))

  return (
    <div className="m-tab">
      <div className="m-field">
        <span className="m-label">{t('cam.section')}</span>
        <div className="m-chips">
          {(['headshot', 'half', 'full'] as const).map((preset) => (
            <button key={preset} disabled={!targetSubjectId} className={framingPreset === preset ? 'active' : ''} onClick={() => targetSubjectId && frameCameraSubject(targetSubjectId, preset)}>
              {t(`framing.${preset}`)}
            </button>
          ))}
        </div>
      </div>

      <Dial label={t('cam.focal')} value={focalLength} min={24} max={200} readout={`${focalLength} mm`}
        onChange={(value) => setValue('focalLength', value)} />
      <Dial label={t('cam.aperture')} value={aperture} min={1.2} max={16} step={0.1} readout={`ƒ/${aperture.toFixed(1)}`}
        onChange={(value) => setValue('aperture', Number(value.toFixed(1)))} />
      <Dial label="ISO" value={iso} min={100} max={6400} step={100} readout={`${iso}`}
        onChange={(value) => setValue('iso', value)} />
      <Dial label={t('mobile.camera.orbit')} value={cameraAngle} min={-75} max={75} step={5} readout={`${cameraAngle}°`}
        onChange={(value) => {
          const radians = toRadians(value)
          setCameraPosition([
            Number((cameraTarget[0] + Math.sin(radians) * cameraRadius).toFixed(3)),
            cameraPosition[1],
            Number((cameraTarget[2] + Math.cos(radians) * cameraRadius).toFixed(3)),
          ])
        }} />

      <div className="m-field">
        <span className="m-label">{t('frame.orientation')}</span>
        <div className="m-chips">
          <button className={frameOrientation === 'portrait' ? 'active' : ''} onClick={() => setValue('frameOrientation', 'portrait')}>{t('frame.portrait')}</button>
          <button className={frameOrientation === 'landscape' ? 'active' : ''} onClick={() => setValue('frameOrientation', 'landscape')}>{t('frame.landscape')}</button>
        </div>
      </div>

      <div className="m-field">
        <span className="m-label">{t('mobile.camera.backdrop')}</span>
        <div className="m-swatches">
          {BACKDROP_CHOICES.map((id) => {
            const backdrop = BACKDROPS.find((item) => item.id === id)
            if (!backdrop) return null
            return (
              <button key={id} className={backdropId === id ? 'active' : ''} onClick={() => selectBackdrop(id)}
                title={ct(`backdrop.${id}`, backdrop.label)} aria-label={ct(`backdrop.${id}`, backdrop.label)}>
                <i style={{ background: backdrop.color }} />
              </button>
            )
          })}
        </div>
      </div>

      <div className="m-field">
        <button className={renderMode === 'path' ? 'm-hq active' : 'm-hq'} onClick={() => renderMode === 'path' ? openCameraView() : startPhotoRender()}>
          {t(renderMode === 'path' ? 'mobile.camera.hq.stop' : 'mobile.camera.hq')}
          {renderMode === 'path' && <b>{pathStatus === 'building' ? t('render.status.building') : pathStatus === 'error' ? t('render.status.error') : `${Math.floor(pathSamples)} SPP`}</b>}
        </button>
        <p className="m-note">{t('mobile.camera.hq.note')}</p>
      </div>
    </div>
  )
}

function PhotoSheet({ photo, onClose }: { photo: string; onClose: () => void }) {
  const t = useT()
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useDialogFocus(dialog, true, onClose)

  return (
    <div ref={dialog} className="m-photo" role="dialog" aria-modal="true" aria-label={t('mobile.photo.title')}>
      <div className="m-photo-inner">
        <img src={photo} alt={t('mobile.photo.title')} />
        <p>{t('mobile.photo.hint')}</p>
        <div className="m-photo-actions">
          <a href={photo} download={exportFileName()}>{t('mobile.photo.download')}</a>
          <button ref={closeButton} onClick={onClose}>{t('mobile.photo.close')}</button>
        </div>
      </div>
    </div>
  )
}

function ProjectTab({ onOpenAbout, onOpenTour }: { onOpenAbout: () => void; onOpenTour: () => void }) {
  const t = useT()
  const locale = useLocaleStore((state) => state.locale)
  const saveStatus = useStudio((state) => state.saveStatus)
  const saveProject = useStudio((state) => state.saveProject)
  const exportProject = useStudio((state) => state.exportProject)
  const importProject = useStudio((state) => state.importProject)
  const shareableJson = useStudio((state) => state.shareableJson)
  const input = useRef<HTMLInputElement>(null)
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [usage, setUsage] = useState('—')

  useEffect(() => { void storageUsage().then((value) => setUsage(value.quota ? `${formatStorage(value.usage)} / ${formatStorage(value.quota)}` : formatStorage(value.usage))) }, [saveStatus])
  const share = async () => {
    try {
      setShareStatus(await copyToClipboard(await buildShareLink(shareableJson())) ? 'copied' : 'error')
    } catch { setShareStatus('error') }
  }
  const guide = locale === 'en' ? assetHref('LUMEN_STAGE_Site_Guide_EN.pdf') : locale === 'ja' ? assetHref('LUMEN_STAGE_サイトガイド_JA.pdf') : assetHref('LUMEN_STAGE_網站使用教學.pdf')

  return <div className="m-tab m-project">
    <div className={`m-save-card ${saveStatus === 'error' ? 'error' : ''}`} role="status"><span>{t('mobile.project.storage')}</span><strong>{saveStatus === 'error' ? t('mobile.project.failed') : t('mobile.project.saved')}</strong><small>{usage}</small></div>
    <p className="m-note">{t('mobile.project.note')}</p>
    <div className="m-project-actions">
      {saveStatus === 'error' && <button onClick={saveProject}>{t('mobile.project.save')}</button>}
      <button className="m-project-share" onClick={share}>{shareStatus === 'copied' ? t('mobile.project.copied') : shareStatus === 'error' ? t('mobile.project.shareFailed') : t('mobile.project.share')}</button>
      <button onClick={exportProject}>{t('mobile.project.export')}</button>
      <button onClick={() => input.current?.click()}>{t('mobile.project.import')}</button>
    </div>
    <input ref={input} hidden type="file" accept=".json,.lumen.json,application/json" onChange={async (event) => {
      const file = event.target.files?.[0]
      if (file) { try { importProject(await readTextFileWithinLimit(file, MAX_PROJECT_FILE_BYTES)) } catch { useStudio.setState({ saveStatus: 'error' }) } }
      event.target.value = ''
    }} />
    <div className="m-project-links"><button onClick={onOpenTour}>{t('tour.replay')}</button><a href={guide} target="_blank" rel="noreferrer">{t('mobile.project.guide')}</a><button onClick={onOpenAbout}>{t('mobile.project.about')}</button><a href={routeHref('support')}>{t('mobile.project.support')}</a></div>
  </div>
}

function MobileIntentTab() {
  const locale = useLocaleStore((state) => state.locale)
  const copy = MOBILE_WORKFLOW[locale]
  const input = useRef<HTMLInputElement>(null)
  const studio = useStudio()
  const [analysis, setAnalysis] = useState<ReferenceLightingAnalysis | null>(null)
  const [fileName, setFileName] = useState('')

  const readReference = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      const scale = Math.min(1, 180 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(2, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(2, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      setAnalysis(analyzeReferencePixels(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height))
      setFileName(file.name)
    } finally { URL.revokeObjectURL(url) }
  }

  const applyReference = () => {
    if (!analysis) return
    const key = studio.lights[0]
    const fill = studio.lights[1]
    const keyX = analysis.direction === 'right' ? 2.25 : analysis.direction === 'left' ? -2.25 : -0.35
    const subjectId = studio.mainSubjectEnabled ? 'model' : studio.studioObjects.find((object) => object.type === 'subject')?.id
    if (key) { studio.updateLight(key.id, { powerPercent: analysis.keyPower, position: [keyX, 2.65, 2.1] }); studio.bindLightToSubject(key.id, subjectId ?? null, 'face') }
    if (fill) { studio.updateLight(fill.id, { powerPercent: analysis.fillPower, position: [-keyX, 2.05, .8] }); studio.bindLightToSubject(fill.id, subjectId ?? null, 'chest') }
    studio.openStudioView()
  }

  return <div className="m-tab">
    <section className="m-intent-reference">
      <header><span>REFERENCE / LOCAL</span><strong>{copy.reference}</strong><small>{copy.local}</small></header>
      <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void readReference(event)} />
      {!analysis ? <button onClick={() => input.current?.click()}>＋ {copy.choose}</button> : <>
        <div className="m-reference-result"><div><span>{copy.direction}</span><b>{copy[analysis.direction]}</b></div><div><span>{copy.ratio}</span><b>{analysis.contrastRatio}:1</b></div><div><span>{copy.confidence}</span><b>{copy[analysis.confidence]}</b></div></div>
        <small className="m-reference-file">{fileName}</small>
        <div className="m-reference-actions"><button onClick={() => input.current?.click()}>{copy.choose}</button><button onClick={applyReference}>{copy.apply}</button></div>
      </>}
    </section>
  </div>
}

function MobileVerifyTab({ onOpenAbout, onOpenTour }: { onOpenAbout: () => void; onOpenTour: () => void }) {
  const locale = useLocaleStore((state) => state.locale)
  const copy = MOBILE_WORKFLOW[locale]
  const studio = useStudio()
  const [baseline, setBaseline] = useState<ContinuityBaseline | null>(null)
  const report = useMemo(() => baseline ? evaluateContinuity(baseline, studio) : null, [baseline, studio])

  const track = () => {
    const subjectId = studio.mainSubjectEnabled ? 'model' : studio.studioObjects.find((object) => object.type === 'subject')?.id
    if (!subjectId) return
    studio.lights.filter((light) => light.enabled).forEach((light) => studio.bindLightToSubject(light.id, subjectId, light.id === studio.lights[0]?.id ? 'face' : 'chest'))
    studio.bindCameraToSubject(subjectId, 'face')
    studio.setCameraAutoFocus(true)
  }
  const restore = () => {
    if (!baseline) return
    studio.setValue('focalLength', baseline.focalLength)
    studio.setValue('aperture', baseline.aperture)
    studio.setValue('iso', baseline.iso)
    studio.setValue('shutter', baseline.shutter)
    baseline.lights.forEach((saved) => studio.updateLight(saved.id, { powerPercent: saved.power }))
  }

  return <div className="m-tab">
    <section className="m-continuity-card">
      <header><div><span>CONTINUITY</span><strong>{copy.continuity}</strong></div><b>{report?.score ?? '—'}</b></header>
      <p className={report?.score === 100 ? 'stable' : ''}>{!report ? copy.noBaseline : report.issues.length ? report.issues[0].detail : `● ${copy.stable}`}</p>
      <div><button onClick={() => setBaseline(captureContinuityBaseline(studio))}>{copy.baseline}</button><button onClick={track}>{copy.track}</button><button disabled={!baseline} onClick={restore}>{copy.restore}</button></div>
    </section>
    <ProjectTab onOpenAbout={onOpenAbout} onOpenTour={onOpenTour} />
  </div>
}

function MobileLayoutTab({ applied, onApply }: { applied: string | null; onApply: (id: string) => void }) {
  const t = useT()
  const state = useStudio(useShallow((state) => ({
    addLight: state.addLight,
    cameraPosition: state.cameraPosition,
    lights: state.lights,
    mainSubjectEnabled: state.mainSubjectEnabled,
    modelPosition: state.modelPosition,
    modifiers: state.modifiers,
    roomWidth: state.roomWidth,
    selectObject: state.selectObject,
    selected: state.selected,
    setCameraPosition: state.setCameraPosition,
    setLightPosition: state.setLightPosition,
    setModelTransform: state.setModelTransform,
    setModifierTransform: state.setModifierTransform,
    setStudioObjectTransform: state.setStudioObjectTransform,
    studioObjects: state.studioObjects,
  })))
  const items = [
    ...(state.mainSubjectEnabled ? [{ id: 'model', label: t('mobile.tab.subject') }] : []),
    ...state.lights.map((light) => ({ id: light.id, label: light.name })),
    ...state.modifiers.map((modifier) => ({ id: modifier.id, label: modifier.name })),
    ...state.studioObjects.map((object) => ({ id: object.id, label: object.name })),
    { id: 'camera', label: t('mobile.tab.camera') },
  ]
  const selectedItem = items.find((item) => item.id === state.selected) ?? items[0]
  const selectedLight = state.lights.find((light) => light.id === selectedItem.id)
  const selectedModifier = state.modifiers.find((modifier) => modifier.id === selectedItem.id)
  const selectedStudioObject = state.studioObjects.find((object) => object.id === selectedItem.id)
  const selectedPosition = selectedItem.id === 'model'
    ? state.modelPosition
    : selectedItem.id === 'camera'
      ? state.cameraPosition
      : selectedLight?.position ?? selectedModifier?.position ?? selectedStudioObject?.position ?? [0, 0, 0]
  const locked = selectedLight?.locked ?? selectedModifier?.locked ?? selectedStudioObject?.locked ?? false
  const horizontalLimit = Math.max(1, state.roomWidth / 2 - 0.45)
  const moveHorizontally = (value: number) => {
    const x = Number(value.toFixed(2))
    if (selectedItem.id === 'model') state.setModelTransform([x, state.modelPosition[1], state.modelPosition[2]])
    else if (selectedItem.id === 'camera') state.setCameraPosition([x, state.cameraPosition[1], state.cameraPosition[2]], 'X')
    else if (selectedLight) state.setLightPosition(selectedLight.id, [x, selectedLight.position[1], selectedLight.position[2]], 'X')
    else if (selectedModifier) state.setModifierTransform(selectedModifier.id, [x, selectedModifier.position[1], selectedModifier.position[2]], selectedModifier.rotationY, 'X')
    else if (selectedStudioObject) state.setStudioObjectTransform(selectedStudioObject.id, [x, selectedStudioObject.position[1], selectedStudioObject.position[2]], selectedStudioObject.rotationY, 'X')
  }
  return <div className="m-phase-stack">
    <SetupsTab applied={applied} onApply={onApply} />
    <div className="m-tab">
      <h2>{t('mobile.layout.title')}</h2>
      <p className="m-note">{t('mobile.layout.note')}</p>
      <div className="m-chips m-chips-scroll" role="group" aria-label={t('mobile.layout.title')}>
        {items.map((item) => <button key={item.id} className={state.selected === item.id ? 'active' : ''} onClick={() => state.selectObject(item.id)}>{item.label}</button>)}
        <button className="m-chip-add" onClick={() => state.addLight()}>＋ {t('mobile.light.add')}</button>
      </div>
      <Dial
        label={`${selectedItem.label} · ${t('mobile.layout.horizontal')}`}
        value={selectedPosition[0]}
        min={-horizontalLimit}
        max={horizontalLimit}
        step={0.05}
        readout={`${selectedPosition[0].toFixed(2)} m`}
        disabled={locked}
        onChange={moveHorizontally}
      />
    </div>
  </div>
}

export function MobileApp() {
  const t = useT()
  const locale = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)
  const setUiMode = useUiModeStore((state) => state.setMode)
  const phone = usePhoneScreen()
  const view = useStudio((state) => state.view)
  const renderMode = useStudio((state) => state.renderMode)
  const pathSamples = useRenderProgress((state) => state.samples)
  const openStudioView = useStudio((state) => state.openStudioView)
  const openCameraView = useStudio((state) => state.openCameraView)
  const setWorkflowStage = useWorkflow((state) => state.setStage)
  const [tab, setTab] = useState<Tab>('planning')
  const [appliedSetup, setAppliedSetup] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(() => !window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches)
  const [capturing, setCapturing] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const pageVisible = usePageVisible()

  const openTour = () => {
    setTab('planning')
    setSheetOpen(true)
    window.requestAnimationFrame(() => setTourOpen(true))
  }

  const closeTour = () => {
    setTourOpen(false)
    setTab('planning')
    setSheetOpen(true)
  }

  useEffect(() => {
    setWorkflowStage(tabStage[tab])
    const studio = useStudio.getState()
    if (tab === 'layout') {
      studio.setValue('transformMode', 'translate')
      studio.setValue('lightAimMode', false)
      studio.setValue('poseHandles', false)
      studio.openTopView()
    } else if (tab === 'shooting') studio.openCameraView()
    else studio.openStudioView()
  }, [setWorkflowStage, tab])

  useEffect(() => {
    const compactLandscape = window.matchMedia('(orientation: landscape) and (max-height: 520px)')
    const adaptSheet = (event: MediaQueryListEvent) => { if (event.matches) setSheetOpen(false) }
    compactLandscape.addEventListener('change', adaptSheet)
    return () => compactLandscape.removeEventListener('change', adaptSheet)
  }, [])

  useEffect(() => {
    if (!shouldShowOnboarding('mobile')) return
    const timer = window.setTimeout(openTour, 700)
    return () => window.clearTimeout(timer)
  }, [])

  const capture = async () => {
    if (capturing) return
    setCapturing(true)
    try {
      if (useStudio.getState().view !== 'camera') {
        openCameraView()
        await drawnFrames(6)
      } else {
        await drawnFrames(2)
      }
      // 1600 px keeps the per-pixel lens and sensor passes inside a phone's patience.
      const canvas = renderExportCanvas(1600)
      if (canvas) setPhoto(canvas.toDataURL('image/png'))
    } finally {
      setCapturing(false)
    }
  }

  return (
    <main className={sheetOpen ? 'm-shell sheet-open' : 'm-shell'} aria-label={t(phone ? 'mobile.aria' : 'mobile.desktop.aria')}>
      <header className="m-top">
        <span className="m-brand"><BrandMark />LUMEN<small>{t(phone ? 'mobile.badge' : 'mobile.desktop.badge')}</small></span>
        <div className="m-lang" role="group" aria-label={t('lang.label')}>
          {LOCALES.map((item) => (
            <button key={item.id} lang={item.htmlLang} aria-label={item.native} aria-pressed={locale === item.id}
              className={locale === item.id ? 'active' : ''} onClick={() => setLocale(item.id as Locale)}>{item.short}</button>
          ))}
        </div>
        <CopyrightMark compact onOpen={() => setAboutOpen(true)} />
        {!phone && <button className="m-escape" onClick={() => setUiMode('full')} title={t('mobile.full.title')}>{t('mobile.full')}</button>}
      </header>

      <Suspense fallback={
        <section className="viewport m-viewport">
          <div className="viewport-loading" role="status">
            <span className="viewport-loading-mark"><i /></span>
            <strong>{t('viewport.loading')}</strong>
            <small>BUILDING STUDIO · WEBGL</small>
          </div>
        </section>
      }>
        <MobileStage
          pageVisible={pageVisible}
          view={view}
          renderMode={renderMode}
          pathSamples={pathSamples}
          onOpenStudio={openStudioView}
          onOpenCamera={openCameraView}
          onCapture={capture}
          capturing={capturing}
          viewsLabel={t('topbar.views')}
          studioLabel={t('mobile.view.studio')}
          cameraLabel={t('mobile.view.camera')}
          hint={t(view === 'camera' ? 'mobile.hint.camera' : tab === 'layout' ? 'mobile.hint.layout' : 'mobile.hint.orbit')}
          shutterLabel={t('mobile.shutter')}
          loadingLabel={t('viewport.loading')}
        />
      </Suspense>

      <div className="m-console">
        <div className="m-tabs">
          <nav className="m-tablist" role="tablist" aria-label={t(phone ? 'mobile.aria' : 'mobile.desktop.aria')}>
            {(['planning', 'lighting', 'shooting', 'layout'] as const).map((item) => (
              <button key={item} role="tab" id={`m-tab-${item}`} aria-controls="m-tabpanel" aria-selected={tab === item && sheetOpen}
                className={tab === item && sheetOpen ? 'active' : ''}
                onClick={() => { if (tab === item && sheetOpen) setSheetOpen(false); else { setTab(item); setSheetOpen(true) } }}>
                {MOBILE_WORKFLOW[locale][item]}
              </button>
            ))}
          </nav>
          <button className="m-sheet-handle" aria-label={t(sheetOpen ? 'mobile.sheet.collapse' : 'mobile.sheet.expand')} onClick={() => setSheetOpen(!sheetOpen)}>
            {sheetOpen ? '▾' : '▴'}
          </button>
        </div>

        {sheetOpen && (
          <section className="m-sheet" id="m-tabpanel" role="tabpanel" aria-labelledby={`m-tab-${tab}`}>
            <div className="m-sheet-scroll">
              {tab === 'planning' && <SubjectTab />}
              {tab === 'lighting' && <div className="m-phase-stack"><MobileIntentTab /><LightsTab /></div>}
              {tab === 'shooting' && <div className="m-phase-stack"><CameraTab /><MobileVerifyTab onOpenAbout={() => setAboutOpen(true)} onOpenTour={openTour} /></div>}
              {tab === 'layout' && <MobileLayoutTab applied={appliedSetup} onApply={setAppliedSetup} />}
            </div>
            {tab === 'lighting' && <MobileEditActions storageKey="lumen-stage:lighting-preset"
              capture={() => structuredClone(useStudio.getState().lights)}
              apply={(snapshot) => useStudio.setState({ lights: structuredClone(snapshot) })} />}
            {tab === 'shooting' && <MobileEditActions storageKey="lumen-stage:camera-preset"
              capture={() => captureMobileCamera(useStudio.getState())}
              apply={(snapshot) => useStudio.setState(snapshot)} />}
          </section>
        )}
      </div>

      {photo && <PhotoSheet photo={photo} onClose={() => setPhoto(null)} />}
      <OnboardingTour photoTaken={photo !== null} open={tourOpen} scope="mobile" onClose={closeTour} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </main>
  )
}
