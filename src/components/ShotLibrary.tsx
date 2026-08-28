import { useStudio, type FrameAspect, type FrameOrientation, type MakeupStyle, type OutfitFabric, type StudioLight, type StudioModifier, type StudioObject, type StudioShot } from '../store'
import { CAMERA_BODIES, LENS_PROFILES, type CameraBodyId, type LensProfileId } from '../cameraProfiles'
import { COLOR_PROFILES, type ColorProfileId, type ImageFormat } from '../colorScience'
import { type ShutterMode } from '../sensorProcessing'
import { captureCurrentShot, captureThumbnail } from '../shotCapture'
import { openSetupSheetForShot } from './SetupSheet'

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

export function ShotLibrary() {
  const shots = useStudio((state) => state.shots)
  const open = useStudio((state) => state.shotPanelOpen)
  const activeShotId = useStudio((state) => state.activeShotId)
  const frameAspect = useStudio((state) => state.frameAspect)
  const frameOrientation = useStudio((state) => state.frameOrientation)
  const state = useStudio()
  const thumbnail = () => captureThumbnail(frameAspect, frameOrientation)
  const captureCurrent = captureCurrentShot

  return <>
    <div className="shot-launcher">
      <button className={open ? 'active' : ''} onClick={() => state.setValue('shotPanelOpen', !open)}>鏡位庫 <b>{String(shots.length).padStart(2, '0')}</b></button>
      <button className="capture-shot-button" onClick={captureCurrent}>＋ SHOT</button>
    </div>
    {open && <aside className="shot-panel" aria-label="鏡位庫">
      <header><span>SHOT LIBRARY</span><button aria-label="關閉鏡位庫" onClick={() => state.setValue('shotPanelOpen', false)}>×</button></header>
      <div className="shot-panel-actions"><span>{shots.length} 個拍攝方案</span><button onClick={captureCurrent}>擷取目前鏡位</button></div>
      <div className="shot-list">
        {!shots.length && <div className="empty-shots"><b>NO SHOTS</b><span>擷取目前畫面，保存完整燈光與相機設定</span></div>}
        {shots.map((shot, index) => {
          const scene = sceneFromShot(shot)
          return <article key={shot.id} className={activeShotId === shot.id ? 'active' : ''}>
            <img src={shot.thumbnail} alt={`${shot.name} 預覽`} />
            <div className="shot-card-body">
              <span>SHOT {String(index + 1).padStart(2, '0')}{activeShotId === shot.id ? ' · ACTIVE' : ''}</span>
              <input aria-label={`${shot.name} 名稱`} defaultValue={shot.name} onBlur={(event) => state.updateShot(shot.id, event.target.value)} />
              <small>{scene ? `${cameraLabel(scene)} · ${lensLabel(scene)} @ ${scene.focalLength}mm · ${scene.imageFormat?.toUpperCase() ?? 'JPEG'} / ${COLOR_PROFILES[scene.colorProfileId ?? 'neutral'].code} · LOOK ${(scene.makeupStyle ?? 'natural').toUpperCase()} / ${(scene.outfitFabric ?? 'cotton').toUpperCase()} · ISO ${scene.iso} · ${scene.lights.length} LIGHTS · ${(scene.modifiers ?? []).length} GRIP · ${(scene.studioObjects ?? []).length} SET` : 'SCENE DATA ERROR'}</small>
            </div>
            <div className="shot-card-actions">
              <button onClick={() => state.loadShot(shot.id)}>載入</button>
              <button onClick={() => state.overwriteShot(shot.id, thumbnail())}>覆寫</button>
              <button onClick={() => openSetupSheetForShot(shot)}>燈位工作表</button>
              <button className="danger" onClick={() => state.deleteShot(shot.id)}>刪除</button>
            </div>
          </article>
        })}
      </div>
    </aside>}
  </>
}
