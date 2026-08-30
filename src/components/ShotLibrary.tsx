import { useState } from 'react'
import { useStudio, type FrameAspect, type FrameOrientation, type MakeupStyle, type OutfitFabric, type StudioLight, type StudioModifier, type StudioObject, type StudioShot } from '../store'
import { CAMERA_BODIES, LENS_PROFILES, type CameraBodyId, type LensProfileId } from '../cameraProfiles'
import { COLOR_PROFILES, type ColorProfileId, type ImageFormat } from '../colorScience'
import { type ShutterMode } from '../sensorProcessing'
import { useLocaleStore, useT } from '../i18n'
import { captureCurrentShot, captureThumbnail } from '../shotCapture'
import { openSetupSheetForShot } from './SetupSheet'
import { getBackdrop } from '../backdrops'

type ShotScene = {
  projectName: string
  focalLength: number
  aperture: number
  iso: number
  shutter: number
  focusDistance: number
  sensorFormat: 'full-frame' | 'aps-c' | 'mft'
  frameAspect: FrameAspect
  frameOrientation: FrameOrientation
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]
  modelPosition: [number, number, number]
  lights: StudioLight[]
  modifiers?: StudioModifier[]
  studioObjects?: StudioObject[]
  cameraBodyId?: CameraBodyId
  lensProfileId?: LensProfileId
  compositionGuide?: 'none' | 'thirds' | 'golden' | 'safe'
  lensOpticsEnabled?: boolean
  lensVignette?: number
  lensDistortion?: number
  lensChromaticAberration?: number
  lensBreathing?: number
  imageFormat?: ImageFormat
  whiteBalance?: number
  whiteBalanceTint?: number
  colorProfileId?: ColorProfileId
  highlightRolloff?: number
  toneCurve?: number
  lutIntensity?: number
  sensorSimulationEnabled?: boolean
  shutterMode?: ShutterMode
  sensorDynamicRange?: number
  noiseReduction?: number
  colorNoise?: number
  motionBlur?: number
  rollingShutter?: number
  skinRoughness?: number
  skinOil?: number
  skinSubsurface?: number
  makeupStyle?: MakeupStyle
  hairGloss?: number
  outfitFabric?: OutfitFabric
  backdropId?: string
}

function sceneFromShot(shot: StudioShot): ShotScene | null {
  try { return JSON.parse(shot.sceneJson) as ShotScene } catch { return null }
}

function cameraLabel(scene: ShotScene) {
  return CAMERA_BODIES[scene.cameraBodyId ?? 'generic-ff'].model
}

function lensLabel(scene: ShotScene) {
  return LENS_PROFILES[scene.lensProfileId ?? 'zoom-24-70'].model
}

/**
 * A/B comparison.
 *
 * Two lighting setups are only meaningfully different at the same framing, so
 * the wipe is the default: a vertical seam you drag across both frames. Side by
 * side is there for when the difference is in the background, which a wipe
 * hides at exactly the moment you want to see it.
 */
function ShotCompare({ a, b, onClose }: { a: StudioShot; b: StudioShot; onClose: () => void }) {
  const t = useT()
  const [mode, setMode] = useState<'slider' | 'side'>('slider')
  const [split, setSplit] = useState(50)
  const sceneA = sceneFromShot(a)
  const sceneB = sceneFromShot(b)

  const caption = (shot: StudioShot, scene: ShotScene | null, tag: string) => (
    <div className="compare-caption">
      <b>{tag}</b>
      <span>{shot.name}</span>
      {scene && <small>{scene.focalLength}mm · f/{scene.aperture} · ISO {scene.iso} · {t('compare.diffLights', { value: scene.lights.length })}</small>}
    </div>
  )

  return (
    <div className="shot-compare" role="dialog" aria-label={t('compare.title')}>
      <header>
        <strong>{t('compare.title')}</strong>
        <div className="pose-category-tabs compare-modes" role="tablist">
          <button role="tab" aria-selected={mode === 'slider'} className={mode === 'slider' ? 'active' : ''} onClick={() => setMode('slider')}>{t('compare.mode.slider')}</button>
          <button role="tab" aria-selected={mode === 'side'} className={mode === 'side' ? 'active' : ''} onClick={() => setMode('side')}>{t('compare.mode.side')}</button>
        </div>
        <button className="compare-close" aria-label={t('compare.close')} onClick={onClose}>✕</button>
      </header>

      {mode === 'slider' ? (
        <div className="compare-stage">
          <div className="compare-wipe">
            <img src={a.thumbnail} alt={t('shots.preview', { name: a.name })} />
            <div className="compare-wipe-top" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
              <img src={b.thumbnail} alt={t('shots.preview', { name: b.name })} />
            </div>
            <span className="compare-seam" style={{ left: `${split}%` }} />
          </div>
          <input className="compare-slider" aria-label={t('compare.title')} type="range" min={0} max={100} value={split}
            style={{ '--progress': `${split}%` } as React.CSSProperties}
            onChange={(event) => setSplit(Number(event.target.value))} />
          <div className="compare-captions">
            {caption(b, sceneB, t('compare.a'))}
            {caption(a, sceneA, t('compare.b'))}
          </div>
        </div>
      ) : (
        <div className="compare-stage compare-side">
          <figure><img src={a.thumbnail} alt={t('shots.preview', { name: a.name })} />{caption(a, sceneA, t('compare.a'))}</figure>
          <figure><img src={b.thumbnail} alt={t('shots.preview', { name: b.name })} />{caption(b, sceneB, t('compare.b'))}</figure>
        </div>
      )}
    </div>
  )
}

export function ShotLibrary() {
  const shots = useStudio((state) => state.shots)
  const open = useStudio((state) => state.shotPanelOpen)
  const activeShotId = useStudio((state) => state.activeShotId)
  const frameAspect = useStudio((state) => state.frameAspect)
  const frameOrientation = useStudio((state) => state.frameOrientation)
  const setValue = useStudio((state) => state.setValue)
  const updateShot = useStudio((state) => state.updateShot)
  const loadShot = useStudio((state) => state.loadShot)
  const overwriteShot = useStudio((state) => state.overwriteShot)
  const deleteShot = useStudio((state) => state.deleteShot)
  const t = useT()
  const locale = useLocaleStore((item) => item.locale)
  const shortShot = locale === 'zh' ? '鏡位' : locale === 'ja' ? 'ショット' : 'Shot'
  const [compareIds, setCompareIds] = useState<string[]>([])
  const thumbnail = () => captureThumbnail(frameAspect, frameOrientation)
  const toggleCompare = (id: string) => setCompareIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-2))
  const comparePair = compareIds.length === 2
    ? compareIds.map((id) => shots.find((shot) => shot.id === id)).filter(Boolean) as StudioShot[]
    : []
  const captureCurrent = captureCurrentShot

  return <>
    <div className="shot-launcher">
      <button className={open ? 'active' : ''} onClick={() => setValue('shotPanelOpen', !open)}>{t('shots.launcher')} <b>{String(shots.length).padStart(2, '0')}</b></button>
      <button className="capture-shot-button" onClick={captureCurrent}>＋ {shortShot}</button>
    </div>
    {open && <aside className="shot-panel" aria-label={t('shots.launcher')}>
      <header><span>{t('shots.launcher')}</span><button aria-label={t('shots.close')} onClick={() => setValue('shotPanelOpen', false)}>×</button></header>
      <div className="shot-panel-actions"><span>{t('shots.count', { count: shots.length })}</span><button onClick={captureCurrent}>{t('shots.capture')}</button></div>
      {compareIds.length === 1 && <p className="compare-hint">{t('compare.hint')}</p>}
      {comparePair.length === 2 && <ShotCompare a={comparePair[0]} b={comparePair[1]} onClose={() => setCompareIds([])} />}
      <div className="shot-list">
        {!shots.length && <div className="empty-shots"><b>{t('shots.count', { count: 0 })}</b><span>{t('shots.emptyHint')}</span></div>}
        {shots.map((shot, index) => {
          const scene = sceneFromShot(shot)
          return <article key={shot.id} className={activeShotId === shot.id ? 'active' : ''}>
            <img src={shot.thumbnail} alt={t('shots.preview', { name: shot.name })} />
            <div className="shot-card-body">
              <span>{shortShot} {String(index + 1).padStart(2, '0')}{activeShotId === shot.id ? ` · ${locale === 'zh' ? '目前使用' : locale === 'ja' ? '使用中' : 'Active'}` : ''}</span>
              <input aria-label={t('shots.nameAria', { name: shot.name })} defaultValue={shot.name} onBlur={(event) => updateShot(shot.id, event.target.value)} />
              <small>{scene ? `${cameraLabel(scene)} · ${lensLabel(scene)} @ ${scene.focalLength}mm · ${scene.imageFormat?.toUpperCase() ?? 'JPEG'} / ${COLOR_PROFILES[scene.colorProfileId ?? 'neutral'].code} · LOOK ${(scene.makeupStyle ?? 'natural').toUpperCase()} / ${(scene.outfitFabric ?? 'cotton').toUpperCase()} · ISO ${scene.iso} · ${scene.lights.length} LIGHTS · ${(scene.modifiers ?? []).length} GRIP · ${(scene.studioObjects ?? []).length} SET · ${getBackdrop(scene.backdropId ?? 'studio-grey').label.toUpperCase()}` : 'SCENE DATA ERROR'}</small>
            </div>
            <div className="shot-card-actions">
              <button className={compareIds.includes(shot.id) ? 'active' : ''} onClick={() => toggleCompare(shot.id)}>{t('compare.pick')}</button>
              <button onClick={() => loadShot(shot.id)}>{t('common.load')}</button>
              <button onClick={() => overwriteShot(shot.id, thumbnail())}>{t('shots.overwrite')}</button>
              <button onClick={() => openSetupSheetForShot(shot)}>{t('topbar.setupSheet')}</button>
              <button className="danger" onClick={() => { if (window.confirm(t('shots.deleteConfirm', { name: shot.name }))) deleteShot(shot.id) }}>{t('common.delete')}</button>
            </div>
          </article>
        })}
      </div>
    </aside>}
  </>
}
