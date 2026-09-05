import { create } from 'zustand'
import { CAMERA_BODIES, LENS_PROFILES, type CameraBodyId, type LensProfileId } from './cameraProfiles'
import type { ColorProfileId, HistogramMode, ImageFormat } from './colorScience'
import type { ShutterMode } from './sensorProcessing'
import { DEFAULT_HEAD_ID, getModifier, LIGHT_HEADS, MODIFIERS } from './gear'
import { getPoseEntry, NEUTRAL_POSE, normalizePose, type ModelPose } from './pose'
import { DEFAULT_PHYSIQUE, PHYSIQUE_PRESETS, type FigureSex, type Physique } from './physique'
import { castMember, MAX_SUBJECT_HEIGHT, MIN_SUBJECT_HEIGHT } from './actorCast.ts'
import { asFabric, asHairStyle, asOutfit, DEFAULT_HAIR_STYLE, DEFAULT_OUTFIT, type FabricKind, type HairStyle, type OutfitStyle } from './wardrobe'
import { BACKDROPS, DEFAULT_BACKDROP_ID, getBackdrop } from './backdrops'
import { GELS } from './gels'
import { getSetup, specToLight } from './setups'
import { clampToRoom, FOOTPRINT, isSittable, resolveCollisions, snapAroundSubject, type Occupant } from './layout'
import { mirrorProject } from './persistence'
import { reportError } from './monitoring'
import { lockPositionToAxis, type TransformAxis } from './transformAxis'
import { createAutosaveScheduler } from './autosave'
import { createHistoryTransaction } from './historyTransaction'
import { useRenderProgress } from './renderProgress'

/** Add seating as part of the same undoable pose change. Existing furniture is reused. */
function objectsWithSeat(state: StudioState, pose: ModelPose, position: [number, number, number], rotation: number, preset: string): StudioObject[] {
  if (!pose.seated || state.studioObjects.some((object) => isSittable(object.type) && Math.hypot(object.position[0] - position[0], object.position[2] - position[2]) <= (FOOTPRINT[object.type as keyof typeof FOOTPRINT] ?? 0.4))) return state.studioObjects
  return [...state.studioObjects, {
    id: `chair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: 'Chair', type: 'chair',
    position: [position[0], 0, position[2]], rotationY: rotation + (preset === 'seated-backward' ? Math.PI : 0), scale: 1,
    color: '#6f4938', material: 'matte', locked: false,
    subjectHeight: 1.74, subjectSkinColor: '#b9826b', subjectOutfitColor: '#343c48',
    subjectSkinRoughness: 55, subjectSkinOil: 22, subjectSubsurface: 45, subjectMakeup: 'natural',
    subjectEyeColor: '#4b372b', subjectHairColor: '#211815', subjectHairGloss: 35, subjectOutfitFabric: 'cotton',
    subjectPosePreset: 'neutral', subjectPose: { ...NEUTRAL_POSE }, subjectPhysique: { ...DEFAULT_PHYSIQUE },
    subjectHairStyle: 'long', subjectOutfitStyle: 'tshirt',
  }]
}

export type ViewMode = 'studio' | 'camera' | 'top'
export type RenderMode = 'preview' | 'path'
export type ExposureOverlay = 'none' | 'false-color' | 'clipping'
export type ExposureSample = { width: number; height: number; pixels: Uint8ClampedArray }
export type SensorFormat = 'full-frame' | 'aps-c' | 'mft'
export type FrameAspect = '3:2' | '4:5' | '1:1' | '16:9'
export type FrameOrientation = 'landscape' | 'portrait'
export type StudioShot = { id: string; name: string; createdAt: number; thumbnail: string; sceneJson: string }
/** Id of an entry in the pose library, or 'custom' once a joint is hand-tuned. */
export type PosePreset = string
export type { ModelPose, HandPose } from './pose'
export type MakeupStyle = 'none' | 'natural' | 'editorial'
export type OutfitFabric = FabricKind
export type { Physique } from './physique'
export type { HairStyle, OutfitStyle } from './wardrobe'
export type CameraMode = 'photo' | 'cinema'
export type QualityPreset = 'performance' | 'balanced' | 'ultra'
export type OutputResolution = '1080p' | '2k' | '4k'
export type CameraSlot = { id: string; name: string; position: [number, number, number]; target: [number, number, number]; focalLength: number; focusDistance: number }
export type TimelineKeyframe = { id: string; frame: number; cameraPosition: [number, number, number]; cameraTarget: [number, number, number]; lightPowers: Record<string, number> }
export type Backdrop = 'paper'
export type TransformMode = 'translate' | 'rotate'
export type { TransformAxis } from './transformAxis'
export type LightShape = 'square' | 'round' | 'strip'
export type LightColorMode = 'kelvin' | 'rgb'
export type LightHeadType = 'cob' | 'strobe' | 'panel'
/** Head id from the gear catalogue in gear.ts. */
export type LightProfileId = string
/** Modifier id from the gear catalogue in gear.ts. */
export type ModifierProfileId = string
export type LightOptic = 'softbox' | 'umbrella-shoot' | 'umbrella-reflect' | 'beauty-dish' | 'deep-parabolic' | 'lantern' | 'standard' | 'fresnel' | 'snoot' | 'barn-doors' | 'projection'
export type GoboPattern = 'none' | 'window' | 'blinds' | 'foliage' | 'breakup'
export type LightOperationMode = 'continuous' | 'flash'
export type LightTargetZone = 'face' | 'chest' | 'full'
export type CameraFramingPreset = 'headshot' | 'half' | 'full'
export type CompositionGuide = 'none' | 'thirds' | 'golden' | 'safe'
export type SceneObjectType = 'subject' | 'dog' | 'cat' | 'product' | 'chair' | 'table' | 'plinth' | 'cube' | 'sphere'
export type SceneObjectMaterial = 'matte' | 'glossy' | 'metal'
export type ModifierType = 'reflector' | 'flag' | 'vflat'
export type ModifierSurface = 'white' | 'silver' | 'gold' | 'black'
export type SelectedObject = 'model' | 'camera' | string

export type StudioLight = {
  id: string
  name: string
  enabled: boolean
  intensity: number
  powerPercent: number
  profileId: LightProfileId
  headType: LightHeadType
  temperature: number
  shape: LightShape
  softbox: boolean
  grid: boolean
  colorMode: LightColorMode
  rgb: string
  position: [number, number, number]
  target: [number, number, number]
  targetSubjectId?: string
  targetZone?: LightTargetZone
  beamAngle: number
  feather: number
  modifierWidth: number
  modifierHeight: number
  optic: LightOptic
  /** Catalogue modifier fitted to this head. */
  modifierId: ModifierProfileId
  /** Fitted gel from the catalogue in gels.ts, or 'none'. */
  gelId: string
  /** Egg-crate grid cut angle in degrees, or null for none. */
  gridDegrees: number | null
  barnDoorAngle: number
  goboPattern: GoboPattern
  goboRotation: number
  goboScale: number
  operationMode: LightOperationMode
  hssEnabled: boolean
  flashDuration: number
  locked: boolean
  groupId?: string
}

export type StudioModifier = {
  id: string
  name: string
  type: ModifierType
  surface: ModifierSurface
  position: [number, number, number]
  rotationY: number
  width: number
  height: number
  locked: boolean
}

export type StudioObject = {
  id: string
  name: string
  type: SceneObjectType
  position: [number, number, number]
  rotationY: number
  scale: number
  color: string
  material: SceneObjectMaterial
  locked: boolean
  subjectHeight: number
  subjectSkinColor: string
  subjectOutfitColor: string
  subjectSkinRoughness: number
  subjectSkinOil: number
  subjectSubsurface: number
  subjectMakeup: MakeupStyle
  subjectEyeColor: string
  subjectHairColor: string
  subjectHairGloss: number
  subjectOutfitFabric: OutfitFabric
  subjectPosePreset: PosePreset
  subjectPose: ModelPose
  subjectPhysique: Physique
  subjectHairStyle: HairStyle
  subjectOutfitStyle: OutfitStyle
}

type SceneSnapshot = {
  schemaVersion: 24
  projectName: string
  backdrop: Backdrop
  backdropId: string
  backdropWidth: number
  backdropDistance: number
  focalLength: number
  aperture: number
  iso: number
  shutter: number
  focusDistance: number
  dofEnabled: boolean
  focusGuide: boolean
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]
  cameraTargetSubjectId?: string
  cameraTargetZone: LightTargetZone
  cameraAutoFocus: boolean
  cameraFramingPreset: CameraFramingPreset
  cameraBodyId: CameraBodyId
  lensProfileId: LensProfileId
  compositionGuide: CompositionGuide
  lensOpticsEnabled: boolean
  lensVignette: number
  lensDistortion: number
  lensChromaticAberration: number
  lensBreathing: number
  imageFormat: ImageFormat
  whiteBalance: number
  whiteBalanceTint: number
  colorProfileId: ColorProfileId
  highlightRolloff: number
  toneCurve: number
  lutIntensity: number
  histogramMode: HistogramMode
  sensorSimulationEnabled: boolean
  shutterMode: ShutterMode
  sensorDynamicRange: number
  noiseReduction: number
  colorNoise: number
  motionBlur: number
  rollingShutter: number
  sensorFormat: SensorFormat
  frameAspect: FrameAspect
  frameOrientation: FrameOrientation
  lights: StudioLight[]
  modifiers: StudioModifier[]
  studioObjects: StudioObject[]
  meterPosition: [number, number, number]
  syncSpeed: number
  ambientLevel: number
  ambientTemperature: number
  mainSubjectEnabled: boolean
  modelPosition: [number, number, number]
  modelRotation: number
  modelHeight: number
  skinColor: string
  outfitColor: string
  skinRoughness: number
  skinOil: number
  skinSubsurface: number
  makeupStyle: MakeupStyle
  eyeColor: string
  hairColor: string
  hairGloss: number
  outfitFabric: OutfitFabric
  cameraMode: CameraMode
  frameRate: number
  shutterAngle: number
  tStop: number
  ndStops: number
  anamorphic: number
  roomWidth: number
  roomDepth: number
  roomHeight: number
  wallColor: string
  floorColor: string
  windowEnabled: boolean
  sunEnabled: boolean
  sunAzimuth: number
  sunElevation: number
  sunIntensity: number
  haze: number
  hdriName: string | null
  qualityPreset: QualityPreset
  outputResolution: OutputResolution
  denoiseEnabled: boolean
  cameras: CameraSlot[]
  activeCameraId: string
  modelLookAtCamera: boolean
  modelEyesAtCamera: boolean
  timelineDuration: number
  timelineKeyframes: TimelineKeyframe[]
  posePreset: PosePreset
  modelPose: ModelPose
  physique: Physique
  hairStyle: HairStyle
  outfitStyle: OutfitStyle
  actorId: string | null
  shots?: StudioShot[]
}

type HistorySnapshot = SceneSnapshot & { selected: SelectedObject; selectedIds: string[] }

export type StudioState = {
  projectName: string
  view: ViewMode
  renderMode: RenderMode
  pathTracingPaused: boolean
  renderRevision: number
  analysisOpen: boolean
  exposureOverlay: ExposureOverlay
  soloLightId: string | null
  exposureSample: ExposureSample | null
  lightAimMode: boolean
  /** Snap a dragged light to 15° / 25 cm around its subject. */
  placementSnap: boolean
  /** Show drag-to-pose joint handles on the selected figure. */
  poseHandles: boolean
  measureMode: boolean
  measurePoints: [number, number, number][]
  backdrop: Backdrop
  backdropId: string
  backdropWidth: number
  backdropDistance: number
  focalLength: number
  aperture: number
  iso: number
  shutter: number
  focusDistance: number
  dofEnabled: boolean
  focusGuide: boolean
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]
  cameraTargetSubjectId?: string
  cameraTargetZone: LightTargetZone
  cameraAutoFocus: boolean
  cameraFramingPreset: CameraFramingPreset
  cameraBodyId: CameraBodyId
  lensProfileId: LensProfileId
  compositionGuide: CompositionGuide
  lensOpticsEnabled: boolean
  lensVignette: number
  lensDistortion: number
  lensChromaticAberration: number
  lensBreathing: number
  imageFormat: ImageFormat
  whiteBalance: number
  whiteBalanceTint: number
  colorProfileId: ColorProfileId
  highlightRolloff: number
  toneCurve: number
  lutIntensity: number
  histogramMode: HistogramMode
  sensorSimulationEnabled: boolean
  shutterMode: ShutterMode
  sensorDynamicRange: number
  noiseReduction: number
  colorNoise: number
  motionBlur: number
  rollingShutter: number
  sensorFormat: SensorFormat
  frameAspect: FrameAspect
  frameOrientation: FrameOrientation
  shots: StudioShot[]
  activeShotId: string | null
  shotPanelOpen: boolean
  lights: StudioLight[]
  modifiers: StudioModifier[]
  studioObjects: StudioObject[]
  meterPosition: [number, number, number]
  syncSpeed: number
  ambientLevel: number
  ambientTemperature: number
  mainSubjectEnabled: boolean
  modelPosition: [number, number, number]
  modelRotation: number
  modelHeight: number
  skinColor: string
  outfitColor: string
  skinRoughness: number
  skinOil: number
  skinSubsurface: number
  makeupStyle: MakeupStyle
  eyeColor: string
  hairColor: string
  hairGloss: number
  outfitFabric: OutfitFabric
  professionalPanelOpen: boolean
  setupSheetOpen: boolean
  setupLibraryOpen: boolean
  shortcutHelpOpen: boolean
  cameraMode: CameraMode
  frameRate: number
  shutterAngle: number
  tStop: number
  ndStops: number
  anamorphic: number
  roomWidth: number
  roomDepth: number
  roomHeight: number
  wallColor: string
  floorColor: string
  windowEnabled: boolean
  sunEnabled: boolean
  sunAzimuth: number
  sunElevation: number
  sunIntensity: number
  haze: number
  hdriUrl: string | null
  hdriName: string | null
  iesName: string | null
  iesUrl: string | null
  qualityPreset: QualityPreset
  outputResolution: OutputResolution
  denoiseEnabled: boolean
  cameras: CameraSlot[]
  activeCameraId: string
  modelLookAtCamera: boolean
  modelEyesAtCamera: boolean
  timelineDuration: number
  timelineFrame: number
  timelinePlaying: boolean
  timelineKeyframes: TimelineKeyframe[]
  posePreset: PosePreset
  modelPose: ModelPose
  physique: Physique
  hairStyle: HairStyle
  outfitStyle: OutfitStyle
  /**
   * Who is being photographed, out of the shipped cast.
   *
   * Null means the project predates casting and still derives its actor from
   * the sex and wardrobe controls, which is what it was saved against.
   */
  actorId: string | null
  modelAssetUrl: string | null
  modelAssetName: string | null
  modelImportStatus: 'idle' | 'loading' | 'ready' | 'error'
  /** Whether the imported skeleton can be posed by the rig. */
  modelRigStatus: 'none' | 'rigged' | 'unrigged'
  selected: SelectedObject
  selectedIds: string[]
  transformMode: TransformMode
  lastSavedAt: number | null
  saveStatus: 'idle' | 'saved' | 'autosaved' | 'loaded' | 'exported' | 'error'
  undoStack: HistorySnapshot[]
  redoStack: HistorySnapshot[]
  beginHistoryTransaction: () => void
  endHistoryTransaction: () => void
  setValue: <K extends keyof StudioState>(key: K, value: StudioState[K]) => void
  updateLight: (id: string, patch: Partial<Omit<StudioLight, 'id'>>) => void
  fitHead: (id: string, headId: string) => void
  fitModifier: (id: string, modifierId: string) => void
  fitGrid: (id: string, gridDegrees: number | null) => void
  fitGel: (id: string, gelId: string) => void
  selectObject: (id: SelectedObject, additive?: boolean) => void
  setLightAxis: (id: string, axis: 0 | 1 | 2, value: number) => void
  setLightPosition: (id: string, position: [number, number, number], axis?: TransformAxis) => void
  setLightTarget: (id: string, target: [number, number, number], axis?: TransformAxis) => void
  bindLightToSubject: (id: string, subjectId: string | null, zone?: LightTargetZone) => void
  addLight: (shape?: LightShape) => void
  duplicateLight: (id: string) => void
  duplicateSelectedLights: () => void
  deleteLight: (id: string) => void
  deleteSelectedLights: () => void
  addModifier: (type: ModifierType) => void
  updateModifier: (id: string, patch: Partial<Omit<StudioModifier, 'id'>>) => void
  duplicateModifier: (id: string) => void
  deleteModifier: (id: string) => void
  setModifierTransform: (id: string, position: [number, number, number], rotationY?: number, axis?: TransformAxis) => void
  setMeterPosition: (position: [number, number, number]) => void
  addMeasurePoint: (point: [number, number, number]) => void
  clearMeasure: () => void
  moveMeterToSubject: (subjectId: string, zone?: LightTargetZone) => void
  addStudioObject: (type: SceneObjectType, subjectSex?: Exclude<FigureSex, 'neutral'>) => void
  updateStudioObject: (id: string, patch: Partial<Omit<StudioObject, 'id'>>) => void
  applyStudioSubjectPose: (id: string, preset: PosePreset) => void
  updateStudioSubjectPose: (id: string, patch: Partial<ModelPose>) => void
  duplicateStudioObject: (id: string) => void
  deleteStudioObject: (id: string) => void
  deleteMainSubject: () => void
  setStudioObjectTransform: (id: string, position: [number, number, number], rotationY?: number, axis?: TransformAxis) => void
  groupSelectedLights: () => void
  ungroupSelectedLights: () => void
  setModelTransform: (position: [number, number, number], rotation?: number, axis?: TransformAxis) => void
  applyPosePreset: (preset: PosePreset) => void
  updateModelPose: (patch: Partial<ModelPose>) => void
  updatePhysique: (patch: Partial<Physique>) => void
  /** Photograph a different person out of the shipped cast. */
  castActor: (id: string) => void
  applyPhysiquePreset: (id: string) => void
  selectBackdrop: (id: string) => void
  applyLightingSetup: (id: string) => void
  updateStudioSubjectPhysique: (id: string, patch: Partial<Physique>) => void
  applyStudioSubjectPhysique: (id: string, presetId: string) => void
  setCameraPosition: (position: [number, number, number], axis?: TransformAxis) => void
  setCameraTarget: (target: [number, number, number]) => void
  bindCameraToSubject: (subjectId: string | null, zone?: LightTargetZone) => void
  setCameraAutoFocus: (enabled: boolean) => void
  addCameraSlot: () => void
  activateCameraSlot: (id: string) => void
  saveActiveCameraSlot: () => void
  deleteCameraSlot: (id: string) => void
  addTimelineKeyframe: () => void
  deleteTimelineKeyframe: (id: string) => void
  setTimelineFrame: (frame: number) => void
  frameCameraSubject: (subjectId: string, preset: CameraFramingPreset) => void
  selectCameraBody: (id: CameraBodyId) => void
  selectLensProfile: (id: LensProfileId) => void
  captureShot: (thumbnail: string) => void
  updateShot: (id: string, name: string) => void
  overwriteShot: (id: string, thumbnail: string) => void
  loadShot: (id: string) => void
  deleteShot: (id: string) => void
  setModelAsset: (url: string | null, name: string | null) => void
  setModelImportStatus: (status: StudioState['modelImportStatus']) => void
  setModelRigStatus: (status: StudioState['modelRigStatus']) => void
  undo: () => void
  redo: () => void
  saveProject: () => void
  loadProject: () => void
  exportProject: () => void
  /** Scene JSON for a share link — shots excluded, they bloat the URL. */
  shareableJson: () => string
  importProject: (raw: string) => void
  mergeProject: (raw: string) => void
  resetLighting: () => void
  openStudioView: () => void
  openCameraView: () => void
  openTopView: () => void
  startPhotoRender: () => void
  restartPhotoRender: () => void
}

const STORAGE_KEY = 'lumen-stage-scene-v22'
const V21_STORAGE_KEY = 'lumen-stage-scene-v21'
const V20_STORAGE_KEY = 'lumen-stage-scene-v20'
const V19_STORAGE_KEY = 'lumen-stage-scene-v19'
const V18_STORAGE_KEY = 'lumen-stage-scene-v18'
const V17_STORAGE_KEY = 'lumen-stage-scene-v17'
const V16_STORAGE_KEY = 'lumen-stage-scene-v16'
const V15_STORAGE_KEY = 'lumen-stage-scene-v15'
const V14_STORAGE_KEY = 'lumen-stage-scene-v14'
const V13_STORAGE_KEY = 'lumen-stage-scene-v13'
const V12_STORAGE_KEY = 'lumen-stage-scene-v12'
const V11_STORAGE_KEY = 'lumen-stage-scene-v11'
const V10_STORAGE_KEY = 'lumen-stage-scene-v10'
const V9_STORAGE_KEY = 'lumen-stage-scene-v9'
const V8_STORAGE_KEY = 'lumen-stage-scene-v8'
const V7_STORAGE_KEY = 'lumen-stage-scene-v7'
const V6_STORAGE_KEY = 'lumen-stage-scene-v6'
const V5_STORAGE_KEY = 'lumen-stage-scene-v5'
const V4_STORAGE_KEY = 'lumen-stage-scene-v4'
const V3_STORAGE_KEY = 'lumen-stage-scene-v3'
const V2_STORAGE_KEY = 'lumen-stage-scene-v2'
const LEGACY_STORAGE_KEY = 'lumen-stage-scene-v1'
const SHOT_STORAGE_KEY = 'lumen-stage-shots-v1'

const initialLights: StudioLight[] = [
  { id: 'key', name: 'Key light', enabled: true, intensity: 1700, powerPercent: 18, profileId: 'godox-ad600pro', headType: 'strobe', temperature: 5600, shape: 'round', softbox: true, grid: false, colorMode: 'kelvin', rgb: '#ff3d8d', position: [-1.15, 2.05, 1.45], target: [0, 1.5, 0], beamAngle: 78, feather: 82, modifierWidth: 1.2, modifierHeight: 1.2, optic: 'softbox', modifierId: 'rfi-octa-5', gelId: 'none', gridDegrees: null, barnDoorAngle: 45, goboPattern: 'none', goboRotation: 0, goboScale: 1, operationMode: 'flash', hssEnabled: false, flashDuration: 220, locked: false },
  { id: 'fill', name: 'Fill light', enabled: true, intensity: 700, powerPercent: 7, profileId: 'godox-ad400pro', headType: 'strobe', temperature: 5600, shape: 'square', softbox: true, grid: false, colorMode: 'kelvin', rgb: '#3b82ff', position: [1.45, 1.7, 1.65], target: [0, 1.45, 0], beamAngle: 80, feather: 88, modifierWidth: 0.9, modifierHeight: 0.9, optic: 'softbox', modifierId: 'rfi-3x3', gelId: 'none', gridDegrees: null, barnDoorAngle: 45, goboPattern: 'none', goboRotation: 0, goboScale: 1, operationMode: 'flash', hssEnabled: false, flashDuration: 220, locked: false },
]

const cloneLights = (lights: StudioLight[]) => lights.map((light) => ({ ...light, position: [...light.position] as [number, number, number], target: [...light.target] as [number, number, number] }))
const cloneModifiers = (modifiers: StudioModifier[]) => modifiers.map((modifier) => ({ ...modifier, position: [...modifier.position] as [number, number, number] }))
const cloneStudioObjects = (objects: StudioObject[]) => objects.map((object) => ({ ...object, position: [...object.position] as [number, number, number], subjectPose: { ...object.subjectPose }, subjectPhysique: { ...object.subjectPhysique } }))


type TargetableState = Pick<StudioState, 'mainSubjectEnabled' | 'modelPosition' | 'modelHeight' | 'studioObjects'>

const subjectTargetPoint = (state: TargetableState, subjectId: string, zone: LightTargetZone = 'face'): [number, number, number] | null => {
  const heightFactor = zone === 'face' ? 0.92 : zone === 'chest' ? 0.66 : 0.5
  if (subjectId === 'model') return state.mainSubjectEnabled
    ? [state.modelPosition[0], Number((state.modelPosition[1] + state.modelHeight * heightFactor).toFixed(2)), state.modelPosition[2]]
    : null
  const subject = state.studioObjects.find((object) => object.id === subjectId && object.type === 'subject')
  if (!subject) return null
  return [subject.position[0], Number((subject.position[1] + subject.subjectHeight * heightFactor).toFixed(2)), subject.position[2]]
}

const syncBoundLightTargets = (state: TargetableState & { lights: StudioLight[] }) => state.lights.map((light) => {
  if (!light.targetSubjectId) return light
  const point = subjectTargetPoint(state, light.targetSubjectId, light.targetZone)
  return point ? { ...light, target: point } : { ...light, targetSubjectId: undefined, targetZone: undefined }
})

/**
 * Everything with a footprint on the floor.
 *
 * People are immovable so a dragged stand goes round them rather than shoving
 * the subject out of the shot.
 */
const floorOccupants = (state: Pick<StudioState, 'lights' | 'modifiers' | 'studioObjects' | 'mainSubjectEnabled' | 'modelPosition'>): Occupant[] => [
  ...(state.mainSubjectEnabled ? [{ id: 'model', position: state.modelPosition, radius: FOOTPRINT.subject, movable: false, kind: 'subject' as const }] : []),
  ...state.studioObjects.map((object) => ({
    id: object.id,
    position: object.position,
    radius: object.type === 'subject' ? FOOTPRINT.subject : FOOTPRINT[object.type] ?? 0.4,
    movable: object.type !== 'subject',
    kind: object.type === 'subject' || object.type === 'dog' || object.type === 'cat' ? ('subject' as const) : isSittable(object.type) ? ('furniture' as const) : ('stand' as const),
  })),
  ...state.lights.map((light) => ({ id: light.id, position: light.position, radius: FOOTPRINT.lightStand, movable: true, kind: 'stand' as const })),
  ...state.modifiers.map((modifier) => ({ id: modifier.id, position: modifier.position, radius: FOOTPRINT.gripStand, movable: true, kind: 'stand' as const })),
]

const cameraFocusDistance = (position: [number, number, number], target: [number, number, number]) => Number(Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]).toFixed(2))

const syncCameraTracking = (state: TargetableState & { cameraPosition: [number, number, number]; cameraTarget: [number, number, number]; cameraTargetSubjectId?: string; cameraTargetZone: LightTargetZone; cameraAutoFocus: boolean }) => {
  if (!state.cameraTargetSubjectId) return {}
  const cameraTarget = subjectTargetPoint(state, state.cameraTargetSubjectId, state.cameraTargetZone)
  if (!cameraTarget) return { cameraTargetSubjectId: undefined }
  return { cameraTarget, ...(state.cameraAutoFocus ? { focusDistance: cameraFocusDistance(state.cameraPosition, cameraTarget) } : {}) }
}

const snapshotFrom = (state: StudioState, includeShots = false): SceneSnapshot => ({
  schemaVersion: 24,
  projectName: state.projectName,
  backdrop: state.backdrop,
  backdropId: state.backdropId,
  backdropWidth: state.backdropWidth,
  backdropDistance: state.backdropDistance,
  focalLength: state.focalLength,
  aperture: state.aperture,
  iso: state.iso,
  shutter: state.shutter,
  focusDistance: state.focusDistance,
  dofEnabled: state.dofEnabled,
  focusGuide: state.focusGuide,
  cameraPosition: [...state.cameraPosition] as [number, number, number],
  cameraTarget: [...state.cameraTarget] as [number, number, number],
  ...(state.cameraTargetSubjectId ? { cameraTargetSubjectId: state.cameraTargetSubjectId } : {}),
  cameraTargetZone: state.cameraTargetZone,
  cameraAutoFocus: state.cameraAutoFocus,
  cameraFramingPreset: state.cameraFramingPreset,
  cameraBodyId: state.cameraBodyId,
  lensProfileId: state.lensProfileId,
  compositionGuide: state.compositionGuide,
  lensOpticsEnabled: state.lensOpticsEnabled,
  lensVignette: state.lensVignette,
  lensDistortion: state.lensDistortion,
  lensChromaticAberration: state.lensChromaticAberration,
  lensBreathing: state.lensBreathing,
  imageFormat: state.imageFormat,
  whiteBalance: state.whiteBalance,
  whiteBalanceTint: state.whiteBalanceTint,
  colorProfileId: state.colorProfileId,
  highlightRolloff: state.highlightRolloff,
  toneCurve: state.toneCurve,
  lutIntensity: state.lutIntensity,
  histogramMode: state.histogramMode,
  sensorSimulationEnabled: state.sensorSimulationEnabled,
  shutterMode: state.shutterMode,
  sensorDynamicRange: state.sensorDynamicRange,
  noiseReduction: state.noiseReduction,
  colorNoise: state.colorNoise,
  motionBlur: state.motionBlur,
  rollingShutter: state.rollingShutter,
  sensorFormat: state.sensorFormat,
  frameAspect: state.frameAspect,
  frameOrientation: state.frameOrientation,
  lights: cloneLights(state.lights),
  modifiers: cloneModifiers(state.modifiers),
  studioObjects: cloneStudioObjects(state.studioObjects),
  meterPosition: [...state.meterPosition] as [number, number, number],
  syncSpeed: state.syncSpeed,
  ambientLevel: state.ambientLevel,
  ambientTemperature: state.ambientTemperature,
  mainSubjectEnabled: state.mainSubjectEnabled,
  modelPosition: [...state.modelPosition] as [number, number, number],
  modelRotation: state.modelRotation,
  modelHeight: state.modelHeight,
  skinColor: state.skinColor,
  outfitColor: state.outfitColor,
  skinRoughness: state.skinRoughness,
  skinOil: state.skinOil,
  skinSubsurface: state.skinSubsurface,
  makeupStyle: state.makeupStyle,
  eyeColor: state.eyeColor,
  hairColor: state.hairColor,
  hairGloss: state.hairGloss,
  outfitFabric: state.outfitFabric,
  cameraMode: state.cameraMode,
  frameRate: state.frameRate,
  shutterAngle: state.shutterAngle,
  tStop: state.tStop,
  ndStops: state.ndStops,
  anamorphic: state.anamorphic,
  roomWidth: state.roomWidth,
  roomDepth: state.roomDepth,
  roomHeight: state.roomHeight,
  wallColor: state.wallColor,
  floorColor: state.floorColor,
  windowEnabled: state.windowEnabled,
  sunEnabled: state.sunEnabled,
  sunAzimuth: state.sunAzimuth,
  sunElevation: state.sunElevation,
  sunIntensity: state.sunIntensity,
  haze: state.haze,
  hdriName: state.hdriName,
  qualityPreset: state.qualityPreset,
  outputResolution: state.outputResolution,
  denoiseEnabled: state.denoiseEnabled,
  cameras: state.cameras.map((camera) => ({ ...camera, position: [...camera.position] as [number, number, number], target: [...camera.target] as [number, number, number] })),
  activeCameraId: state.activeCameraId,
  modelLookAtCamera: state.modelLookAtCamera,
  modelEyesAtCamera: state.modelEyesAtCamera,
  timelineDuration: state.timelineDuration,
  timelineKeyframes: state.timelineKeyframes.map((keyframe) => ({ ...keyframe, cameraPosition: [...keyframe.cameraPosition] as [number, number, number], cameraTarget: [...keyframe.cameraTarget] as [number, number, number], lightPowers: { ...keyframe.lightPowers } })),
  posePreset: state.posePreset,
  physique: { ...state.physique },
  hairStyle: state.hairStyle,
  outfitStyle: state.outfitStyle,
  actorId: state.actorId,
  modelPose: { ...state.modelPose },
  ...(includeShots ? { shots: state.shots } : {}),
})

const historyFrom = (state: StudioState): HistorySnapshot => ({ ...snapshotFrom(state), selected: state.selected, selectedIds: [...state.selectedIds] })

const snapshotState = (snapshot: SceneSnapshot) => ({
  projectName: snapshot.projectName,
  backdrop: snapshot.backdrop,
  backdropId: snapshot.backdropId,
  backdropWidth: snapshot.backdropWidth,
  backdropDistance: snapshot.backdropDistance,
  focalLength: snapshot.focalLength,
  aperture: snapshot.aperture,
  iso: snapshot.iso,
  shutter: snapshot.shutter,
  focusDistance: snapshot.focusDistance,
  dofEnabled: snapshot.dofEnabled,
  focusGuide: snapshot.focusGuide,
  cameraPosition: [...snapshot.cameraPosition] as [number, number, number],
  cameraTarget: [...snapshot.cameraTarget] as [number, number, number],
  cameraTargetSubjectId: snapshot.cameraTargetSubjectId,
  cameraTargetZone: snapshot.cameraTargetZone,
  cameraAutoFocus: snapshot.cameraAutoFocus,
  cameraFramingPreset: snapshot.cameraFramingPreset,
  cameraBodyId: snapshot.cameraBodyId,
  lensProfileId: snapshot.lensProfileId,
  compositionGuide: snapshot.compositionGuide,
  lensOpticsEnabled: snapshot.lensOpticsEnabled,
  lensVignette: snapshot.lensVignette,
  lensDistortion: snapshot.lensDistortion,
  lensChromaticAberration: snapshot.lensChromaticAberration,
  lensBreathing: snapshot.lensBreathing,
  imageFormat: snapshot.imageFormat,
  whiteBalance: snapshot.whiteBalance,
  whiteBalanceTint: snapshot.whiteBalanceTint,
  colorProfileId: snapshot.colorProfileId,
  highlightRolloff: snapshot.highlightRolloff,
  toneCurve: snapshot.toneCurve,
  lutIntensity: snapshot.lutIntensity,
  histogramMode: snapshot.histogramMode,
  sensorSimulationEnabled: snapshot.sensorSimulationEnabled,
  shutterMode: snapshot.shutterMode,
  sensorDynamicRange: snapshot.sensorDynamicRange,
  noiseReduction: snapshot.noiseReduction,
  colorNoise: snapshot.colorNoise,
  motionBlur: snapshot.motionBlur,
  rollingShutter: snapshot.rollingShutter,
  sensorFormat: snapshot.sensorFormat,
  frameAspect: snapshot.frameAspect,
  frameOrientation: snapshot.frameOrientation,
  lights: cloneLights(snapshot.lights),
  modifiers: cloneModifiers(snapshot.modifiers),
  studioObjects: cloneStudioObjects(snapshot.studioObjects),
  meterPosition: [...snapshot.meterPosition] as [number, number, number],
  syncSpeed: snapshot.syncSpeed,
  ambientLevel: snapshot.ambientLevel,
  ambientTemperature: snapshot.ambientTemperature,
  mainSubjectEnabled: snapshot.mainSubjectEnabled,
  modelPosition: [...snapshot.modelPosition] as [number, number, number],
  modelRotation: snapshot.modelRotation,
  modelHeight: snapshot.modelHeight,
  skinColor: snapshot.skinColor,
  outfitColor: snapshot.outfitColor,
  skinRoughness: snapshot.skinRoughness,
  skinOil: snapshot.skinOil,
  skinSubsurface: snapshot.skinSubsurface,
  makeupStyle: snapshot.makeupStyle,
  eyeColor: snapshot.eyeColor,
  hairColor: snapshot.hairColor,
  hairGloss: snapshot.hairGloss,
  outfitFabric: snapshot.outfitFabric,
  cameraMode: snapshot.cameraMode,
  frameRate: snapshot.frameRate,
  shutterAngle: snapshot.shutterAngle,
  tStop: snapshot.tStop,
  ndStops: snapshot.ndStops,
  anamorphic: snapshot.anamorphic,
  roomWidth: snapshot.roomWidth,
  roomDepth: snapshot.roomDepth,
  roomHeight: snapshot.roomHeight,
  wallColor: snapshot.wallColor,
  floorColor: snapshot.floorColor,
  windowEnabled: snapshot.windowEnabled,
  sunEnabled: snapshot.sunEnabled,
  sunAzimuth: snapshot.sunAzimuth,
  sunElevation: snapshot.sunElevation,
  sunIntensity: snapshot.sunIntensity,
  haze: snapshot.haze,
  hdriName: snapshot.hdriName,
  qualityPreset: snapshot.qualityPreset,
  outputResolution: snapshot.outputResolution,
  denoiseEnabled: snapshot.denoiseEnabled,
  cameras: snapshot.cameras.map((camera) => ({ ...camera, position: [...camera.position] as [number, number, number], target: [...camera.target] as [number, number, number] })),
  activeCameraId: snapshot.activeCameraId,
  modelLookAtCamera: snapshot.modelLookAtCamera,
  modelEyesAtCamera: snapshot.modelEyesAtCamera,
  timelineDuration: snapshot.timelineDuration,
  timelineKeyframes: snapshot.timelineKeyframes.map((keyframe) => ({ ...keyframe, cameraPosition: [...keyframe.cameraPosition] as [number, number, number], cameraTarget: [...keyframe.cameraTarget] as [number, number, number], lightPowers: { ...keyframe.lightPowers } })),
  posePreset: snapshot.posePreset,
  physique: { ...snapshot.physique },
  hairStyle: snapshot.hairStyle,
  outfitStyle: snapshot.outfitStyle,
  actorId: snapshot.actorId ?? null,
  modelPose: { ...snapshot.modelPose },
})

const normalizeLight = (light: Partial<StudioLight>, index: number): StudioLight => ({
  gelId: GELS.some((gel) => gel.id === light.gelId) ? String(light.gelId) : 'none',
  id: typeof light.id === 'string' && light.id ? light.id : `light-${index + 1}`,
  name: typeof light.name === 'string' && light.name ? light.name : `Light ${index + 1}`,
  enabled: light.enabled ?? true,
  intensity: Number.isFinite(light.intensity) ? Number(light.intensity) : 800,
  powerPercent: Number.isFinite(light.powerPercent) ? Math.min(100, Math.max(1, Number(light.powerPercent))) : Math.min(100, Math.max(1, (Number(light.intensity) || 800) / 30)),
  profileId: typeof light.profileId === 'string' && LIGHT_HEADS[light.profileId] ? light.profileId : LEGACY_HEAD_IDS[String(light.profileId)] ?? DEFAULT_HEAD_ID,
  headType: light.headType === 'strobe' || light.headType === 'panel' ? light.headType : 'cob',
  temperature: Number.isFinite(light.temperature) ? Number(light.temperature) : 5600,
  shape: light.shape === 'round' || light.shape === 'strip' ? light.shape : 'square',
  softbox: light.softbox ?? true,
  grid: light.grid ?? false,
  colorMode: light.colorMode === 'rgb' ? 'rgb' : 'kelvin',
  rgb: typeof light.rgb === 'string' && /^#[0-9a-f]{6}$/i.test(light.rgb) ? light.rgb : '#ffffff',
  position: Array.isArray(light.position) && light.position.length === 3 ? light.position.map(Number) as [number, number, number] : [0, 2.4, 2],
  target: Array.isArray(light.target) && light.target.length === 3 ? light.target.map(Number) as [number, number, number] : [0, 1.32, 0],
  ...(typeof light.targetSubjectId === 'string' && light.targetSubjectId ? { targetSubjectId: light.targetSubjectId } : {}),
  ...(light.targetZone === 'chest' || light.targetZone === 'full' ? { targetZone: light.targetZone } : typeof light.targetSubjectId === 'string' ? { targetZone: 'face' as const } : {}),
  beamAngle: Number.isFinite(light.beamAngle) ? Math.min(90, Math.max(12, Number(light.beamAngle))) : 50,
  feather: Number.isFinite(light.feather) ? Math.min(100, Math.max(0, Number(light.feather))) : 78,
  modifierWidth: Number.isFinite(light.modifierWidth) ? Math.min(2.4, Math.max(0.18, Number(light.modifierWidth))) : (light.shape === 'strip' ? 0.4 : 0.9),
  modifierHeight: Number.isFinite(light.modifierHeight) ? Math.min(2.4, Math.max(0.18, Number(light.modifierHeight))) : (light.shape === 'strip' ? 1.2 : 0.9),
  optic: light.optic === 'umbrella-shoot' || light.optic === 'umbrella-reflect' || light.optic === 'beauty-dish' || light.optic === 'deep-parabolic' || light.optic === 'lantern' || light.optic === 'standard' || light.optic === 'fresnel' || light.optic === 'snoot' || light.optic === 'barn-doors' || light.optic === 'projection' ? light.optic : 'softbox',
  modifierId: typeof light.modifierId === 'string' && MODIFIERS[light.modifierId] ? light.modifierId : inferModifierId(light),
  gridDegrees: Number.isFinite(light.gridDegrees) ? Number(light.gridDegrees) : light.grid ? 40 : null,
  barnDoorAngle: Number.isFinite(light.barnDoorAngle) ? Math.min(85, Math.max(10, Number(light.barnDoorAngle))) : 45,
  goboPattern: light.goboPattern === 'window' || light.goboPattern === 'blinds' || light.goboPattern === 'foliage' || light.goboPattern === 'breakup' ? light.goboPattern : 'none',
  goboRotation: Number.isFinite(light.goboRotation) ? Number(light.goboRotation) : 0,
  goboScale: Number.isFinite(light.goboScale) ? Math.min(2.5, Math.max(0.5, Number(light.goboScale))) : 1,
  operationMode: light.operationMode === 'flash' ? 'flash' : 'continuous',
  hssEnabled: light.hssEnabled ?? false,
  flashDuration: Number.isFinite(light.flashDuration) ? Math.min(20000, Math.max(125, Number(light.flashDuration))) : 1000,
  locked: light.locked ?? false,
  ...(typeof light.groupId === 'string' && light.groupId ? { groupId: light.groupId } : {}),
})

/** Head ids from schema <= 22, remapped onto the catalogue. */
const LEGACY_HEAD_IDS: Record<string, string> = {
  'profoto-d2': 'profoto-d2-1000',
  'godox-ad600': 'godox-ad600pro',
  'nanlite-720b': 'nanlite-forza720b',
  'aputure-600d': 'aputure-600d',
  'generic-led': 'generic-led',
}

/** Best-guess catalogue modifier for a light saved before the catalogue existed. */
function inferModifierId(light: Partial<StudioLight>): string {
  const width = Number(light.modifierWidth) || 0.9
  const height = Number(light.modifierHeight) || 0.9
  const diagonal = Math.hypot(width, height)
  switch (light.optic) {
    case 'umbrella-shoot': return width > 0.95 ? 'umbrella-shoot-105' : 'umbrella-shoot-85'
    case 'umbrella-reflect': return width > 1.3 ? 'profoto-umbrella-deep-xl' : 'umbrella-silver-105'
    case 'beauty-dish': return width > 0.6 ? 'mola-setti' : 'profoto-softlight-white'
    case 'deep-parabolic': return diagonal > 2 ? 'broncolor-para-177' : diagonal > 1.4 ? 'broncolor-para-133' : 'broncolor-para-88'
    case 'lantern': return width > 0.7 ? 'aputure-lantern-90' : 'chimera-lantern-50'
    case 'standard': return 'standard-reflector'
    case 'fresnel': return 'fresnel-8'
    case 'snoot': return 'snoot'
    case 'barn-doors': return 'barn-doors'
    case 'projection': return 'conical-snoot'
    default: {
      const ratio = Math.max(width, height) / Math.max(0.01, Math.min(width, height))
      if (ratio >= 2.5) return height > 1.5 ? 'rfi-1x6' : height > 1 ? 'rfi-1x4' : 'rfi-1x3'
      if (light.shape === 'round') return diagonal > 1.8 ? 'rfi-octa-5' : 'rfi-octa-3'
      if (diagonal > 2) return 'rfi-4x6'
      if (diagonal > 1.4) return 'rfi-3x4'
      if (diagonal > 1.1) return 'rfi-3x3'
      return 'rfi-2x2'
    }
  }
}

const normalizeModifier = (modifier: Partial<StudioModifier>, index: number): StudioModifier => ({
  id: typeof modifier.id === 'string' && modifier.id ? modifier.id : `modifier-${index + 1}`,
  name: typeof modifier.name === 'string' && modifier.name ? modifier.name : `Grip ${index + 1}`,
  type: modifier.type === 'flag' || modifier.type === 'vflat' ? modifier.type : 'reflector',
  surface: modifier.surface === 'silver' || modifier.surface === 'gold' || modifier.surface === 'black' ? modifier.surface : 'white',
  position: Array.isArray(modifier.position) && modifier.position.length === 3 ? modifier.position.map(Number) as [number, number, number] : [1.5, 1.1, 0.5],
  rotationY: Number.isFinite(modifier.rotationY) ? Number(modifier.rotationY) : 0,
  width: Number.isFinite(modifier.width) ? Math.min(3, Math.max(0.3, Number(modifier.width))) : 1,
  height: Number.isFinite(modifier.height) ? Math.min(3, Math.max(0.4, Number(modifier.height))) : 1.5,
  locked: modifier.locked ?? false,
})

/** Old saves have no physique at all; new ones may have been hand-edited. */
const normalizePhysique = (value: unknown): Physique => {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PHYSIQUE }
  const raw = value as Partial<Physique>
  const span = (input: unknown, fallback: number, min: number, max: number) =>
    Number.isFinite(Number(input)) ? Math.min(max, Math.max(min, Number(input))) : fallback
  return {
    sex: raw.sex === 'masculine' || raw.sex === 'neutral' ? raw.sex : 'feminine',
    age: span(raw.age, DEFAULT_PHYSIQUE.age ?? 28, 18, 80),
    face: span(raw.face, DEFAULT_PHYSIQUE.face, 0, 100),
    build: span(raw.build, DEFAULT_PHYSIQUE.build, 0, 100),
    muscle: span(raw.muscle, DEFAULT_PHYSIQUE.muscle, 0, 100),
    shoulders: span(raw.shoulders, 0, -50, 50),
    waist: span(raw.waist, 0, -50, 50),
    hips: span(raw.hips, 0, -50, 50),
    bust: span(raw.bust, 0, -50, 50),
  }
}

const normalizeStudioObject = (object: Partial<StudioObject>, index: number): StudioObject => ({
  id: typeof object.id === 'string' && object.id ? object.id : `object-${index + 1}`,
  name: typeof object.name === 'string' && object.name ? object.name : `Object ${index + 1}`,
  type: object.type === 'subject' || object.type === 'dog' || object.type === 'cat' || object.type === 'product' || object.type === 'chair' || object.type === 'table' || object.type === 'plinth' || object.type === 'sphere' ? object.type : 'cube',
  position: Array.isArray(object.position) && object.position.length === 3 ? object.position.map(Number) as [number, number, number] : [0.8, 0, 0.4],
  rotationY: Number.isFinite(object.rotationY) ? Number(object.rotationY) : 0,
  scale: Number.isFinite(object.scale) ? Math.min(3, Math.max(0.2, Number(object.scale))) : 1,
  color: typeof object.color === 'string' && /^#[0-9a-f]{6}$/i.test(object.color) ? object.color : '#858b82',
  material: object.material === 'glossy' || object.material === 'metal' ? object.material : 'matte',
  locked: object.locked ?? false,
  subjectHeight: Number.isFinite(object.subjectHeight) ? Math.min(MAX_SUBJECT_HEIGHT, Math.max(MIN_SUBJECT_HEIGHT, Number(object.subjectHeight))) : 1.82,
  subjectSkinColor: typeof object.subjectSkinColor === 'string' && /^#[0-9a-f]{6}$/i.test(object.subjectSkinColor) ? object.subjectSkinColor : '#b9826b',
  subjectOutfitColor: typeof object.subjectOutfitColor === 'string' && /^#[0-9a-f]{6}$/i.test(object.subjectOutfitColor) ? object.subjectOutfitColor : '#343c48',
  subjectSkinRoughness: Number.isFinite(Number(object.subjectSkinRoughness)) ? Math.min(100, Math.max(0, Number(object.subjectSkinRoughness))) : 55,
  subjectSkinOil: Number.isFinite(Number(object.subjectSkinOil)) ? Math.min(100, Math.max(0, Number(object.subjectSkinOil))) : 22,
  subjectSubsurface: Number.isFinite(Number(object.subjectSubsurface)) ? Math.min(100, Math.max(0, Number(object.subjectSubsurface))) : 45,
  subjectMakeup: object.subjectMakeup === 'none' || object.subjectMakeup === 'editorial' ? object.subjectMakeup : 'natural',
  subjectEyeColor: typeof object.subjectEyeColor === 'string' && /^#[0-9a-f]{6}$/i.test(object.subjectEyeColor) ? object.subjectEyeColor : '#4b372b',
  subjectHairColor: typeof object.subjectHairColor === 'string' && /^#[0-9a-f]{6}$/i.test(object.subjectHairColor) ? object.subjectHairColor : '#211815',
  subjectHairGloss: Number.isFinite(Number(object.subjectHairGloss)) ? Math.min(100, Math.max(0, Number(object.subjectHairGloss))) : 35,
  subjectOutfitFabric: asFabric(object.subjectOutfitFabric),
  subjectPosePreset: typeof object.subjectPosePreset === 'string' ? object.subjectPosePreset : 'neutral',
  subjectPose: normalizePose(object.subjectPose as Partial<ModelPose> | undefined),
  subjectPhysique: normalizePhysique(object.subjectPhysique),
  subjectHairStyle: asHairStyle(object.subjectHairStyle),
  subjectOutfitStyle: asOutfit(object.subjectOutfitStyle),
})

const normalizeSnapshot = (value: unknown): SceneSnapshot => {
  if (!value || typeof value !== 'object') throw new Error('Invalid project')
  const raw = value as Record<string, unknown>
  const storedSchemaVersion = Number(raw.schemaVersion)
  const needsNeutralActorMigration = !Number.isFinite(storedSchemaVersion) || storedSchemaVersion < 24
  const lights = Array.isArray(raw.lights)
    ? raw.lights.map((light, index) => normalizeLight(light as Partial<StudioLight>, index))
    : [
        normalizeLight({ id: 'key', name: 'Key light', enabled: true, intensity: raw.lightIntensity as number, temperature: raw.lightTemperature as number, shape: raw.lightShape as LightShape, softbox: raw.lightSoftbox as boolean, grid: raw.lightGrid as boolean, colorMode: raw.lightColorMode as LightColorMode, rgb: raw.lightRgb as string, position: raw.lightPosition as [number, number, number] }, 0),
        normalizeLight({ id: 'fill', name: 'Fill light', enabled: raw.fillEnabled as boolean, intensity: raw.fillIntensity as number, temperature: raw.fillTemperature as number, shape: raw.fillShape as LightShape, softbox: raw.fillSoftbox as boolean, grid: raw.fillGrid as boolean, colorMode: raw.fillColorMode as LightColorMode, rgb: raw.fillRgb as string, position: raw.fillPosition as [number, number, number] }, 1),
      ]
  if (!Array.isArray(raw.modelPosition)) throw new Error('Invalid project scene')
  const vector = (value: unknown, fallback: [number, number, number]): [number, number, number] => Array.isArray(value) && value.length === 3 && value.every((item) => Number.isFinite(Number(item))) ? value.map(Number) as [number, number, number] : fallback
  return {
    schemaVersion: 24,
    projectName: typeof raw.projectName === 'string' ? raw.projectName : 'Portrait study',
    backdrop: 'paper',
    backdropId: BACKDROPS.some((item) => item.id === raw.backdropId) ? String(raw.backdropId) : DEFAULT_BACKDROP_ID,
    backdropWidth: Number.isFinite(Number(raw.backdropWidth)) ? Math.min(6, Math.max(1.2, Number(raw.backdropWidth))) : 2.72,
    backdropDistance: Number.isFinite(Number(raw.backdropDistance)) ? Math.min(4, Math.max(0.6, Number(raw.backdropDistance))) : 1.6,
    focalLength: Number(raw.focalLength) || 50,
    aperture: Number(raw.aperture) || 4,
    iso: Number(raw.iso) || 100,
    shutter: Number(raw.shutter) || 125,
    focusDistance: Number(raw.focusDistance) || 5.5,
    dofEnabled: raw.dofEnabled !== false,
    focusGuide: raw.focusGuide !== false,
    cameraPosition: vector(raw.cameraPosition, [0, 1.56, 5.8]),
    cameraTarget: vector(raw.cameraTarget, [0, 1.45, 0]),
    ...(typeof raw.cameraTargetSubjectId === 'string' && raw.cameraTargetSubjectId ? { cameraTargetSubjectId: raw.cameraTargetSubjectId } : {}),
    cameraTargetZone: raw.cameraTargetZone === 'chest' || raw.cameraTargetZone === 'full' ? raw.cameraTargetZone : 'face',
    cameraAutoFocus: raw.cameraAutoFocus === true,
    cameraFramingPreset: raw.cameraFramingPreset === 'headshot' || raw.cameraFramingPreset === 'half' ? raw.cameraFramingPreset : 'full',
    cameraBodyId: raw.cameraBodyId === 'canon-r5' || raw.cameraBodyId === 'sony-a7iv' || raw.cameraBodyId === 'nikon-z8' || raw.cameraBodyId === 'fuji-xt5' || raw.cameraBodyId === 'panasonic-gh6' ? raw.cameraBodyId : 'generic-ff',
    lensProfileId: raw.lensProfileId === 'prime-35' || raw.lensProfileId === 'prime-50' || raw.lensProfileId === 'prime-85' || raw.lensProfileId === 'zoom-70-200' || raw.lensProfileId === 'mft-12-35' ? raw.lensProfileId : 'zoom-24-70',
    compositionGuide: raw.compositionGuide === 'none' || raw.compositionGuide === 'golden' || raw.compositionGuide === 'safe' ? raw.compositionGuide : 'thirds',
    lensOpticsEnabled: raw.lensOpticsEnabled !== false,
    lensVignette: Number.isFinite(Number(raw.lensVignette)) ? Math.min(100, Math.max(0, Number(raw.lensVignette))) : 18,
    lensDistortion: Number.isFinite(Number(raw.lensDistortion)) ? Math.min(100, Math.max(-100, Number(raw.lensDistortion))) : -8,
    lensChromaticAberration: Number.isFinite(Number(raw.lensChromaticAberration)) ? Math.min(100, Math.max(0, Number(raw.lensChromaticAberration))) : 9,
    lensBreathing: Number.isFinite(Number(raw.lensBreathing)) ? Math.min(100, Math.max(0, Number(raw.lensBreathing))) : 8,
    imageFormat: raw.imageFormat === 'raw' ? 'raw' : 'jpeg',
    whiteBalance: Number.isFinite(Number(raw.whiteBalance)) ? Math.min(9000, Math.max(2000, Number(raw.whiteBalance))) : 5600,
    whiteBalanceTint: Number.isFinite(Number(raw.whiteBalanceTint)) ? Math.min(100, Math.max(-100, Number(raw.whiteBalanceTint))) : 0,
    colorProfileId: raw.colorProfileId === 'portrait' || raw.colorProfileId === 'vivid' || raw.colorProfileId === 'cinema' || raw.colorProfileId === 'monochrome' ? raw.colorProfileId : 'neutral',
    highlightRolloff: Number.isFinite(Number(raw.highlightRolloff)) ? Math.min(100, Math.max(0, Number(raw.highlightRolloff))) : 55,
    toneCurve: Number.isFinite(Number(raw.toneCurve)) ? Math.min(100, Math.max(0, Number(raw.toneCurve))) : 58,
    lutIntensity: Number.isFinite(Number(raw.lutIntensity)) ? Math.min(100, Math.max(0, Number(raw.lutIntensity))) : 100,
    histogramMode: raw.histogramMode === 'rgb' ? 'rgb' : 'luma',
    sensorSimulationEnabled: raw.sensorSimulationEnabled !== false,
    shutterMode: raw.shutterMode === 'electronic' ? 'electronic' : 'mechanical',
    sensorDynamicRange: Number.isFinite(Number(raw.sensorDynamicRange)) ? Math.min(16, Math.max(8, Number(raw.sensorDynamicRange))) : 14,
    noiseReduction: Number.isFinite(Number(raw.noiseReduction)) ? Math.min(100, Math.max(0, Number(raw.noiseReduction))) : 35,
    colorNoise: Number.isFinite(Number(raw.colorNoise)) ? Math.min(100, Math.max(0, Number(raw.colorNoise))) : 35,
    motionBlur: Number.isFinite(Number(raw.motionBlur)) ? Math.min(100, Math.max(0, Number(raw.motionBlur))) : 55,
    rollingShutter: Number.isFinite(Number(raw.rollingShutter)) ? Math.min(100, Math.max(0, Number(raw.rollingShutter))) : 50,
    sensorFormat: raw.sensorFormat === 'aps-c' || raw.sensorFormat === 'mft' ? raw.sensorFormat : 'full-frame',
    frameAspect: raw.frameAspect === '4:5' || raw.frameAspect === '1:1' || raw.frameAspect === '16:9' ? raw.frameAspect : '3:2',
    frameOrientation: raw.frameOrientation === 'portrait' ? 'portrait' : 'landscape',
    lights,
    modifiers: Array.isArray(raw.modifiers) ? raw.modifiers.map((modifier, index) => normalizeModifier(modifier as Partial<StudioModifier>, index)) : [],
    studioObjects: Array.isArray(raw.studioObjects)
      ? raw.studioObjects.map((object, index) => {
          const normalized = normalizeStudioObject(object as Partial<StudioObject>, index)
          return needsNeutralActorMigration && normalized.type === 'subject'
            ? { ...normalized, position: [normalized.position[0], 0, normalized.position[2]], subjectPosePreset: 'neutral', subjectPose: { ...NEUTRAL_POSE } }
            : normalized
        })
      : [],
    meterPosition: vector(raw.meterPosition, [0, 1.45, 0.15]),
    syncSpeed: Number.isFinite(Number(raw.syncSpeed)) ? Math.min(500, Math.max(60, Number(raw.syncSpeed))) : 200,
    ambientLevel: Number.isFinite(Number(raw.ambientLevel)) ? Math.min(100, Math.max(0, Number(raw.ambientLevel))) : 12,
    ambientTemperature: Number.isFinite(Number(raw.ambientTemperature)) ? Math.min(7500, Math.max(2200, Number(raw.ambientTemperature))) : 4300,
    mainSubjectEnabled: raw.mainSubjectEnabled !== false,
    modelPosition: needsNeutralActorMigration
      ? [Number(raw.modelPosition[0]) || 0, 0, Number(raw.modelPosition[2]) || 0]
      : raw.modelPosition.map(Number) as [number, number, number],
    modelRotation: Number(raw.modelRotation) || 0,
    modelHeight: Number.isFinite(Number(raw.modelHeight)) ? Math.min(MAX_SUBJECT_HEIGHT, Math.max(MIN_SUBJECT_HEIGHT, Number(raw.modelHeight))) : 1.82,
    skinColor: typeof raw.skinColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.skinColor) ? raw.skinColor : '#ad7962',
    outfitColor: typeof raw.outfitColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.outfitColor) ? raw.outfitColor : '#191b1a',
    skinRoughness: Number.isFinite(Number(raw.skinRoughness)) ? Math.min(100, Math.max(0, Number(raw.skinRoughness))) : 55,
    skinOil: Number.isFinite(Number(raw.skinOil)) ? Math.min(100, Math.max(0, Number(raw.skinOil))) : 22,
    skinSubsurface: Number.isFinite(Number(raw.skinSubsurface)) ? Math.min(100, Math.max(0, Number(raw.skinSubsurface))) : 45,
    makeupStyle: raw.makeupStyle === 'none' || raw.makeupStyle === 'editorial' ? raw.makeupStyle : 'natural',
    eyeColor: typeof raw.eyeColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.eyeColor) ? raw.eyeColor : '#4b372b',
    hairColor: typeof raw.hairColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.hairColor) ? raw.hairColor : '#211815',
    hairGloss: Number.isFinite(Number(raw.hairGloss)) ? Math.min(100, Math.max(0, Number(raw.hairGloss))) : 35,
    outfitFabric: raw.outfitFabric === 'silk' || raw.outfitFabric === 'leather' ? raw.outfitFabric : 'cotton',
    cameraMode: raw.cameraMode === 'cinema' ? 'cinema' : 'photo',
    frameRate: Number.isFinite(Number(raw.frameRate)) ? Math.min(2000, Math.max(1, Number(raw.frameRate))) : 24,
    shutterAngle: Number.isFinite(Number(raw.shutterAngle)) ? Math.min(360, Math.max(5, Number(raw.shutterAngle))) : 180,
    tStop: Number.isFinite(Number(raw.tStop)) ? Math.min(32, Math.max(0.7, Number(raw.tStop))) : 2.8,
    ndStops: Number.isFinite(Number(raw.ndStops)) ? Math.min(10, Math.max(0, Number(raw.ndStops))) : 0,
    anamorphic: raw.anamorphic === 1.33 || raw.anamorphic === 1.8 || raw.anamorphic === 2 ? raw.anamorphic : 1,
    roomWidth: Number.isFinite(Number(raw.roomWidth)) ? Math.min(30, Math.max(3, Number(raw.roomWidth))) : 8,
    roomDepth: Number.isFinite(Number(raw.roomDepth)) ? Math.min(40, Math.max(4, Number(raw.roomDepth))) : 10,
    roomHeight: Number.isFinite(Number(raw.roomHeight)) ? Math.min(12, Math.max(2.4, Number(raw.roomHeight))) : 4.5,
    wallColor: typeof raw.wallColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.wallColor) ? raw.wallColor : '#8f8d86',
    floorColor: typeof raw.floorColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.floorColor) ? raw.floorColor : '#6d6f68',
    windowEnabled: raw.windowEnabled === true,
    sunEnabled: raw.sunEnabled === true,
    sunAzimuth: Number.isFinite(Number(raw.sunAzimuth)) ? Number(raw.sunAzimuth) : 35,
    sunElevation: Number.isFinite(Number(raw.sunElevation)) ? Math.min(85, Math.max(1, Number(raw.sunElevation))) : 38,
    sunIntensity: Number.isFinite(Number(raw.sunIntensity)) ? Math.min(100, Math.max(0, Number(raw.sunIntensity))) : 45,
    haze: Number.isFinite(Number(raw.haze)) ? Math.min(100, Math.max(0, Number(raw.haze))) : 0,
    hdriName: typeof raw.hdriName === 'string' ? raw.hdriName : null,
    qualityPreset: raw.qualityPreset === 'performance' || raw.qualityPreset === 'ultra' ? raw.qualityPreset : 'balanced',
    outputResolution: raw.outputResolution === '1080p' || raw.outputResolution === '4k' ? raw.outputResolution : '2k',
    denoiseEnabled: raw.denoiseEnabled !== false,
    cameras: Array.isArray(raw.cameras) && raw.cameras.length ? raw.cameras.flatMap((item, index) => {
      if (!item || typeof item !== 'object') return []
      const camera = item as Record<string, unknown>
      return [{ id: typeof camera.id === 'string' ? camera.id : `camera-${index + 1}`, name: typeof camera.name === 'string' ? camera.name : `Camera ${String.fromCharCode(65 + index)}`, position: vector(camera.position, [0, 1.56, 5.8]), target: vector(camera.target, [0, 1.45, 0]), focalLength: Number(camera.focalLength) || 50, focusDistance: Number(camera.focusDistance) || 5.5 }]
    }) : [{ id: 'camera-a', name: 'Camera A', position: vector(raw.cameraPosition, [0, 1.56, 5.8]), target: vector(raw.cameraTarget, [0, 1.45, 0]), focalLength: Number(raw.focalLength) || 50, focusDistance: Number(raw.focusDistance) || 5.5 }],
    activeCameraId: typeof raw.activeCameraId === 'string' ? raw.activeCameraId : 'camera-a',
    modelLookAtCamera: raw.modelLookAtCamera === true,
    modelEyesAtCamera: raw.modelEyesAtCamera === true,
    timelineDuration: Number.isFinite(Number(raw.timelineDuration)) ? Math.min(3600, Math.max(24, Number(raw.timelineDuration))) : 240,
    timelineKeyframes: Array.isArray(raw.timelineKeyframes) ? raw.timelineKeyframes.flatMap((item, index) => {
      if (!item || typeof item !== 'object') return []
      const keyframe = item as Record<string, unknown>
      return [{ id: typeof keyframe.id === 'string' ? keyframe.id : `keyframe-${index}`, frame: Math.max(0, Number(keyframe.frame) || 0), cameraPosition: vector(keyframe.cameraPosition, [0, 1.56, 5.8]), cameraTarget: vector(keyframe.cameraTarget, [0, 1.45, 0]), lightPowers: keyframe.lightPowers && typeof keyframe.lightPowers === 'object' ? { ...(keyframe.lightPowers as Record<string, number>) } : {} }]
    }) : [],
    posePreset: needsNeutralActorMigration ? 'neutral' : typeof raw.posePreset === 'string' ? raw.posePreset : 'neutral',
    modelPose: needsNeutralActorMigration ? { ...NEUTRAL_POSE } : normalizePose(raw.modelPose as Partial<ModelPose> | undefined),
    physique: normalizePhysique(raw.physique),
    hairStyle: asHairStyle(raw.hairStyle),
    outfitStyle: asOutfit(raw.outfitStyle),
    // A cast that has been renamed since the project was saved falls back to
    // deriving the actor, rather than opening on nobody.
    actorId: castMember(typeof raw.actorId === 'string' ? raw.actorId : null)?.id ?? null,
    shots: Array.isArray(raw.shots) ? raw.shots.flatMap((shot) => {
      if (!shot || typeof shot !== 'object') return []
      const item = shot as Record<string, unknown>
      if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.thumbnail !== 'string' || typeof item.sceneJson !== 'string') return []
      return [{ id: item.id, name: item.name, thumbnail: item.thumbnail, sceneJson: item.sceneJson, createdAt: Number(item.createdAt) || Date.now() }]
    }) : undefined,
  }
}

const readStoredShots = (): StudioShot[] => {
  try {
    const value = JSON.parse(localStorage.getItem(SHOT_STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((shot) => shot && typeof shot.id === 'string' && typeof shot.sceneJson === 'string') : []
  } catch { return [] }
}

const persistShots = (shots: StudioShot[]) => {
  try {
    localStorage.setItem(SHOT_STORAGE_KEY, JSON.stringify(shots))
    return true
  } catch (error) {
    reportError(error, { area: 'shot-storage' })
    queueMicrotask(() => useStudio.setState({ saveStatus: 'error' }))
    return false
  }
}

const historyKeys = new Set<keyof StudioState>(['projectName', 'backdrop', 'backdropId', 'backdropWidth', 'backdropDistance', 'cameraMode', 'frameRate', 'shutterAngle', 'tStop', 'ndStops', 'anamorphic', 'roomWidth', 'roomDepth', 'roomHeight', 'wallColor', 'floorColor', 'windowEnabled', 'sunEnabled', 'sunAzimuth', 'sunElevation', 'sunIntensity', 'haze', 'qualityPreset', 'outputResolution', 'denoiseEnabled', 'modelLookAtCamera', 'modelEyesAtCamera', 'timelineDuration', 'focalLength', 'aperture', 'iso', 'shutter', 'focusDistance', 'dofEnabled', 'focusGuide', 'cameraPosition', 'cameraTarget', 'sensorFormat', 'frameAspect', 'frameOrientation', 'modelPosition', 'modelRotation', 'modelHeight', 'skinColor', 'outfitColor', 'skinRoughness', 'skinOil', 'skinSubsurface', 'makeupStyle', 'eyeColor', 'hairColor', 'hairGloss', 'outfitFabric', 'syncSpeed', 'ambientLevel', 'ambientTemperature', 'lensOpticsEnabled', 'lensVignette', 'lensDistortion', 'lensChromaticAberration', 'lensBreathing', 'imageFormat', 'whiteBalance', 'whiteBalanceTint', 'colorProfileId', 'highlightRolloff', 'toneCurve', 'lutIntensity', 'sensorSimulationEnabled', 'shutterMode', 'sensorDynamicRange', 'noiseReduction', 'colorNoise', 'motionBlur', 'rollingShutter'])
const historyTransaction = createHistoryTransaction<HistorySnapshot>()
const withUndo = (state: StudioState) => {
  const snapshot = historyTransaction.capture(() => historyFrom(state))
  return snapshot ? [...state.undoStack, snapshot].slice(-30) : state.undoStack
}

export const useStudio = create<StudioState>((set, get) => ({
  projectName: 'Portrait study',
  view: 'studio',
  renderMode: 'preview',
  pathTracingPaused: false,
  renderRevision: 0,
  analysisOpen: false,
  exposureOverlay: 'none',
  soloLightId: null,
  exposureSample: null,
  lightAimMode: false,
  placementSnap: true,
  poseHandles: true,
  measureMode: false,
  measurePoints: [],
  backdrop: 'paper',
  backdropId: DEFAULT_BACKDROP_ID,
  backdropWidth: 2.72,
  backdropDistance: 1.6,
  focalLength: 50,
  aperture: 4,
  iso: 100,
  shutter: 125,
  focusDistance: 5.5,
  dofEnabled: true,
  focusGuide: true,
  cameraPosition: [0, 1.56, 5.8],
  cameraTarget: [0, 1.45, 0],
  cameraTargetSubjectId: undefined,
  cameraTargetZone: 'face',
  cameraAutoFocus: false,
  cameraFramingPreset: 'full',
  cameraBodyId: 'generic-ff',
  lensProfileId: 'zoom-24-70',
  compositionGuide: 'thirds',
  lensOpticsEnabled: true,
  lensVignette: 18,
  lensDistortion: -8,
  lensChromaticAberration: 9,
  lensBreathing: 8,
  imageFormat: 'jpeg',
  whiteBalance: 5600,
  whiteBalanceTint: 0,
  colorProfileId: 'neutral',
  highlightRolloff: 55,
  toneCurve: 58,
  lutIntensity: 100,
  histogramMode: 'luma',
  sensorSimulationEnabled: true,
  shutterMode: 'mechanical',
  sensorDynamicRange: 14,
  noiseReduction: 35,
  colorNoise: 35,
  motionBlur: 55,
  rollingShutter: 50,
  sensorFormat: 'full-frame',
  frameAspect: '3:2',
  frameOrientation: 'landscape',
  shots: readStoredShots(),
  activeShotId: null,
  shotPanelOpen: false,
  lights: cloneLights(initialLights),
  modifiers: [],
  studioObjects: [],
  meterPosition: [0, 1.45, 0.15],
  syncSpeed: 200,
  ambientLevel: 20,
  ambientTemperature: 4300,
  mainSubjectEnabled: true,
  modelPosition: [0, 0, 0],
  modelRotation: 0,
  modelHeight: 1.82,
  skinColor: '#ad7962',
  outfitColor: '#191b1a',
  skinRoughness: 55,
  skinOil: 22,
  skinSubsurface: 45,
  makeupStyle: 'natural',
  eyeColor: '#4b372b',
  hairColor: '#211815',
  hairGloss: 35,
  outfitFabric: 'cotton',
  professionalPanelOpen: false,
  setupSheetOpen: false,
  setupLibraryOpen: false,
  shortcutHelpOpen: false,
  cameraMode: 'photo',
  frameRate: 24,
  shutterAngle: 180,
  tStop: 2.8,
  ndStops: 0,
  anamorphic: 1,
  roomWidth: 8,
  roomDepth: 10,
  roomHeight: 4.5,
  wallColor: '#8f8d86',
  floorColor: '#6d6f68',
  windowEnabled: false,
  sunEnabled: false,
  sunAzimuth: 35,
  sunElevation: 38,
  sunIntensity: 45,
  haze: 0,
  hdriUrl: null,
  hdriName: null,
  iesName: null,
  iesUrl: null,
  qualityPreset: 'balanced',
  outputResolution: '2k',
  denoiseEnabled: true,
  cameras: [{ id: 'camera-a', name: 'Camera A', position: [0, 1.56, 5.8], target: [0, 1.45, 0], focalLength: 50, focusDistance: 5.5 }],
  activeCameraId: 'camera-a',
  modelLookAtCamera: false,
  modelEyesAtCamera: false,
  timelineDuration: 240,
  timelineFrame: 0,
  timelinePlaying: false,
  timelineKeyframes: [],
  posePreset: 'neutral',
  physique: { ...DEFAULT_PHYSIQUE },
  hairStyle: DEFAULT_HAIR_STYLE,
  outfitStyle: DEFAULT_OUTFIT,
  actorId: null,
  modelPose: { ...NEUTRAL_POSE },
  modelAssetUrl: null,
  modelAssetName: null,
  modelImportStatus: 'idle',
  modelRigStatus: 'none',
  selected: 'key',
  selectedIds: ['key'],
  transformMode: 'translate',
  lastSavedAt: null,
  saveStatus: 'idle',
  undoStack: [],
  redoStack: [],
  beginHistoryTransaction: () => historyTransaction.begin(),
  endHistoryTransaction: () => {
    const snapshot = historyTransaction.end()
    if (snapshot) set((state) => ({ undoStack: [...state.undoStack, snapshot].slice(-30) }))
  },
  setValue: (key, value) => set((state) => ({
    [key]: value,
    ...(key === 'modelHeight' ? { lights: syncBoundLightTargets({ ...state, modelHeight: Number(value) }), ...syncCameraTracking({ ...state, modelHeight: Number(value) }) } : {}),
    ...(key === 'selected' ? { selectedIds: value === 'model' || value === 'camera' ? [] : [String(value)] } : {}),
    ...(historyKeys.has(key) ? { undoStack: withUndo(state), redoStack: [] } : {}),
  } as Partial<StudioState>)),
  updateLight: (id, patch) => set((state) => ({ lights: state.lights.map((light) => light.id === id ? { ...light, ...patch } : light), undoStack: withUndo(state), redoStack: [] })),
  fitHead: (id, headId) => set((state) => {
    const head = LIGHT_HEADS[headId]
    if (!head) return {}
    const headType = head.technology === 'strobe' ? 'strobe' as const : head.technology === 'led-panel' ? 'panel' as const : 'cob' as const
    const operationMode = head.technology === 'strobe' ? 'flash' as const : 'continuous' as const
    const temperature = head.bicolor ? 5600 : Number(head.cct.replace(/[^0-9]/g, '').slice(0, 4)) || 5600
    return {
      lights: state.lights.map((light) => light.id === id ? {
        ...light,
        profileId: headId,
        headType,
        operationMode,
        temperature,
        hssEnabled: head.hss ? light.hssEnabled : false,
        flashDuration: head.flashDurationT05 ? Math.round(1 / head.flashDurationT05) : light.flashDuration,
      } : light),
      undoStack: withUndo(state), redoStack: [],
    }
  }),
  fitModifier: (id, modifierId) => set((state) => {
    const modifier = MODIFIERS[modifierId]
    if (!modifier) return {}
    const ratio = Math.max(modifier.width, modifier.height) / Math.max(0.01, Math.min(modifier.width, modifier.height))
    const shape = modifier.round ? 'round' as const : ratio >= 2.2 ? 'strip' as const : 'square' as const
    return {
      lights: state.lights.map((light) => {
        if (light.id !== id) return light
        const gridDegrees = light.gridDegrees !== null && modifier.grids.includes(light.gridDegrees) ? light.gridDegrees : null
        return {
          ...light,
          modifierId,
          optic: modifier.optic,
          shape,
          softbox: modifier.optic === 'softbox',
          modifierWidth: Math.min(2.4, Math.max(0.18, modifier.width)),
          modifierHeight: Math.min(2.4, Math.max(0.18, modifier.height)),
          beamAngle: Math.min(90, Math.max(12, gridDegrees ?? modifier.beamDegrees)),
          gridDegrees,
          grid: gridDegrees !== null,
        }
      }),
      undoStack: withUndo(state), redoStack: [],
    }
  }),
  fitGel: (id, gelId) => set((state) => ({
    lights: state.lights.map((light) => light.id === id ? { ...light, gelId } : light),
    undoStack: withUndo(state),
    redoStack: [],
  })),
  fitGrid: (id, gridDegrees) => set((state) => ({
    lights: state.lights.map((light) => {
      if (light.id !== id) return light
      const modifier = getModifier(light.modifierId)
      return {
        ...light,
        gridDegrees,
        grid: gridDegrees !== null,
        beamAngle: Math.min(90, Math.max(12, gridDegrees ?? modifier.beamDegrees)),
      }
    }),
    undoStack: withUndo(state), redoStack: [],
  })),
  selectObject: (id, additive = false) => set((state) => {
    if (id === 'model') return state.mainSubjectEnabled ? { selected: id, selectedIds: [] } : state
    if (id === 'camera' || id === 'meter') return { selected: id, selectedIds: [] }
    if (state.modifiers.some((modifier) => modifier.id === id)) return { selected: id, selectedIds: [] }
    if (state.studioObjects.some((object) => object.id === id)) return { selected: id, selectedIds: [] }
    if (!state.lights.some((light) => light.id === id)) return state
    if (!additive) return { selected: id, selectedIds: [id] }
    if (state.selectedIds.includes(id)) {
      if (state.selectedIds.length === 1) return state
      const selectedIds = state.selectedIds.filter((selectedId) => selectedId !== id)
      return { selected: selectedIds.at(-1) ?? id, selectedIds }
    }
    return { selected: id, selectedIds: [...state.selectedIds, id] }
  }),
  setLightAxis: (id, axis, value) => {
    const light = get().lights.find((item) => item.id === id)
    if (!light) return
    const position = [...light.position] as [number, number, number]
    position[axis] = value
    get().setLightPosition(id, position)
  },
  setLightPosition: (id, position, axis) => set((state) => {
    const source = state.lights.find((light) => light.id === id)
    if (!source || source.locked) return state
    const axisLocked = lockPositionToAxis(source.position, position, axis)
    const selectedCohort = state.selectedIds.length > 1 && state.selectedIds.includes(id) ? state.selectedIds : null
    const cohort = selectedCohort ?? (source.groupId ? state.lights.filter((light) => light.groupId === source.groupId).map((light) => light.id) : [id])
    // Snapping and collision run on the light that is actually being dragged;
    // the rest of a group follows the same delta so the shape is preserved.
    const horizontalChanged = Math.abs(axisLocked[0] - source.position[0]) > 1e-6 || Math.abs(axisLocked[2] - source.position[2]) > 1e-6
    const cleared = axis
      ? clampToRoom(axisLocked, FOOTPRINT.lightStand, state.roomWidth, state.roomDepth)
      : horizontalChanged
      ? (() => {
          const subject = subjectTargetPoint(state, source.targetSubjectId ?? 'model', 'full') ?? state.modelPosition
          const snapped = state.placementSnap ? snapAroundSubject(axisLocked, subject) : axisLocked
          return clampToRoom(
            resolveCollisions(snapped, FOOTPRINT.lightStand, floorOccupants(state), id),
            FOOTPRINT.lightStand, state.roomWidth, state.roomDepth,
          )
        })()
      : [source.position[0], axisLocked[1], source.position[2]] as [number, number, number]
    const delta: [number, number, number] = [cleared[0] - source.position[0], cleared[1] - source.position[1], cleared[2] - source.position[2]]
    return {
      lights: state.lights.map((light) => cohort.includes(light.id) && !light.locked ? {
        ...light,
        position: [light.position[0] + delta[0], Math.max(0.8, light.position[1] + delta[1]), light.position[2] + delta[2]],
      } : light),
      undoStack: withUndo(state), redoStack: [],
    }
  }),
  setLightTarget: (id, target, axis) => set((state) => ({ lights: state.lights.map((light) => light.id === id ? { ...light, target: lockPositionToAxis(light.target, target, axis), targetSubjectId: undefined, targetZone: undefined } : light), undoStack: withUndo(state), redoStack: [] })),
  bindLightToSubject: (id, subjectId, zone = 'face') => set((state) => {
    const point = subjectId ? subjectTargetPoint(state, subjectId, zone) : null
    return { lights: state.lights.map((light) => light.id === id ? point && subjectId ? { ...light, target: point, targetSubjectId: subjectId, targetZone: zone } : { ...light, targetSubjectId: undefined, targetZone: undefined } : light), undoStack: withUndo(state), redoStack: [] }
  }),
  addLight: (shape = 'square') => set((state) => {
    const id = `light-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const side = state.lights.length % 2 === 0 ? -1 : 1
    const offset = Math.min(3.6, 2.2 + Math.floor(state.lights.length / 2) * 0.4)
    const light: StudioLight = { id, name: `Light ${state.lights.length + 1}`, enabled: true, intensity: 800, powerPercent: 27, profileId: 'generic-led', headType: 'cob', temperature: 5600, shape, softbox: true, grid: false, colorMode: 'kelvin', rgb: '#8b5cff', position: [side * offset, 2.4, 0.65], target: [0, 1.32, 0], beamAngle: 50, feather: 78, modifierWidth: shape === 'strip' ? 0.4 : 0.9, modifierHeight: shape === 'strip' ? 1.2 : 0.9, optic: 'softbox', modifierId: 'rfi-3x3', gelId: 'none', gridDegrees: null, barnDoorAngle: 45, goboPattern: 'none', goboRotation: 0, goboScale: 1, operationMode: 'continuous', hssEnabled: false, flashDuration: 1000, locked: false }
    return { lights: [...state.lights, light], selected: id, selectedIds: [id], undoStack: withUndo(state), redoStack: [] }
  }),
  duplicateLight: (id) => set((state) => {
    const source = state.lights.find((light) => light.id === id)
    if (!source) return state
    const nextId = `light-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const copy: StudioLight = { ...source, id: nextId, name: `${source.name} Copy`, position: [source.position[0] + 0.45, source.position[1], source.position[2] + 0.25], locked: false, groupId: undefined }
    return { lights: [...state.lights, copy], selected: nextId, selectedIds: [nextId], undoStack: withUndo(state), redoStack: [] }
  }),
  duplicateSelectedLights: () => set((state) => {
    const sources = state.lights.filter((light) => state.selectedIds.includes(light.id))
    if (!sources.length) return state
    const copyGroupId = sources.length > 1 ? `group-${Date.now().toString(36)}` : undefined
    const copies = sources.map((source, index) => ({ ...source, id: `light-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 5)}`, name: `${source.name} Copy`, position: [source.position[0] + 0.45, source.position[1], source.position[2] + 0.25] as [number, number, number], locked: false, groupId: copyGroupId }))
    const selectedIds = copies.map((light) => light.id)
    return { lights: [...state.lights, ...copies], selected: selectedIds.at(-1)!, selectedIds, undoStack: withUndo(state), redoStack: [] }
  }),
  deleteLight: (id) => set((state) => {
    if (!state.lights.some((light) => light.id === id)) return state
    const lights = state.lights.filter((light) => light.id !== id)
    const nextLight = lights[0]
    return { lights, selected: nextLight?.id ?? (state.mainSubjectEnabled ? 'model' : 'camera'), selectedIds: nextLight ? [nextLight.id] : [], soloLightId: state.soloLightId === id ? null : state.soloLightId, undoStack: withUndo(state), redoStack: [] }
  }),
  deleteSelectedLights: () => set((state) => {
    const removable = new Set(state.selectedIds)
    if (!removable.size) return state
    const lights = state.lights.filter((light) => !removable.has(light.id))
    if (lights.length === state.lights.length) return state
    const nextLight = lights[0]
    return { lights, selected: nextLight?.id ?? (state.mainSubjectEnabled ? 'model' : 'camera'), selectedIds: nextLight ? [nextLight.id] : [], soloLightId: state.soloLightId && removable.has(state.soloLightId) ? null : state.soloLightId, undoStack: withUndo(state), redoStack: [] }
  }),
  addModifier: (type) => set((state) => {
    const id = `modifier-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
    const index = state.modifiers.length + 1
    const defaults: Record<ModifierType, Pick<StudioModifier, 'name' | 'surface' | 'position' | 'width' | 'height'>> = {
      reflector: { name: `Reflector ${index}`, surface: 'white', position: [1.35, 1.05, 0.45], width: 1, height: 1.45 },
      flag: { name: `Flag ${index}`, surface: 'black', position: [-1.1, 2.05, 1.15], width: 0.85, height: 1.25 },
      vflat: { name: `V-Flat ${index}`, surface: 'white', position: [1.75, 1.1, -0.2], width: 1.3, height: 2.05 },
    }
    const modifier: StudioModifier = { id, type, rotationY: type === 'flag' ? 2.3 : -1.25, locked: false, ...defaults[type] }
    return { modifiers: [...state.modifiers, modifier], selected: id, selectedIds: [], undoStack: withUndo(state), redoStack: [] }
  }),
  updateModifier: (id, patch) => set((state) => ({ modifiers: state.modifiers.map((modifier) => modifier.id === id && !modifier.locked ? { ...modifier, ...patch } : modifier), undoStack: withUndo(state), redoStack: [] })),
  duplicateModifier: (id) => set((state) => {
    const source = state.modifiers.find((modifier) => modifier.id === id)
    if (!source) return state
    const nextId = `modifier-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
    const copy: StudioModifier = { ...source, id: nextId, name: `${source.name} Copy`, position: [source.position[0] + 0.35, source.position[1], source.position[2] + 0.25], locked: false }
    return { modifiers: [...state.modifiers, copy], selected: nextId, selectedIds: [], undoStack: withUndo(state), redoStack: [] }
  }),
  deleteModifier: (id) => set((state) => {
    if (!state.modifiers.some((modifier) => modifier.id === id)) return state
    return { modifiers: state.modifiers.filter((modifier) => modifier.id !== id), selected: state.lights[0]?.id ?? (state.mainSubjectEnabled ? 'model' : 'camera'), selectedIds: state.lights[0] ? [state.lights[0].id] : [], undoStack: withUndo(state), redoStack: [] }
  }),
  setModifierTransform: (id, position, rotationY, axis) => set((state) => {
    const source = state.modifiers.find((modifier) => modifier.id === id)
    if (!source) return state
    const axisLocked = lockPositionToAxis(source.position, position, axis)
    const horizontalChanged = Math.abs(axisLocked[0] - source.position[0]) > 1e-6 || Math.abs(axisLocked[2] - source.position[2]) > 1e-6
    const cleared = axis
      ? clampToRoom(axisLocked, FOOTPRINT.gripStand, state.roomWidth, state.roomDepth)
      : horizontalChanged
      ? clampToRoom(
          resolveCollisions(axisLocked, FOOTPRINT.gripStand, floorOccupants(state), id),
          FOOTPRINT.gripStand, state.roomWidth, state.roomDepth,
        )
      : [source.position[0], axisLocked[1], source.position[2]] as [number, number, number]
    return {
      modifiers: state.modifiers.map((modifier) => modifier.id === id && !modifier.locked ? { ...modifier, position: cleared, rotationY: rotationY ?? modifier.rotationY } : modifier),
      undoStack: withUndo(state),
      redoStack: [],
    }
  }),
  /** Two clicks make a dimension; a third starts a new one. */
  addMeasurePoint: (point) => set((state) => ({
    measurePoints: state.measurePoints.length >= 2 ? [point] : [...state.measurePoints, point],
  })),
  clearMeasure: () => set({ measurePoints: [], measureMode: false }),
  setMeterPosition: (position) => set((state) => ({ meterPosition: position, undoStack: withUndo(state), redoStack: [] })),
  moveMeterToSubject: (subjectId, zone = 'face') => set((state) => {
    const point = subjectTargetPoint(state, subjectId, zone)
    return point ? { meterPosition: point, selected: 'meter', selectedIds: [], undoStack: withUndo(state), redoStack: [] } : state
  }),
  addStudioObject: (type, subjectSex) => set((state) => {
    const id = `object-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
    const index = state.studioObjects.length + 1
    const subjectCount = state.studioObjects.filter((object) => object.type === 'subject').length
    const labels: Record<SceneObjectType, string> = { subject: 'Subject', dog: 'Dog', cat: 'Cat', product: 'Product', chair: 'Chair', table: 'Table', plinth: 'Plinth', cube: 'Cube', sphere: 'Sphere' }
    const defaults: Record<SceneObjectType, Pick<StudioObject, 'position' | 'scale' | 'color' | 'material'>> = {
      subject: { position: [Number((0.85 + (subjectCount % 3) * 0.72).toFixed(2)), 0, Number((0.35 + Math.floor(subjectCount / 3) * 0.5).toFixed(2))], scale: 1, color: '#454c46', material: 'matte' },
      dog: { position: [1.15, 0, 0.95], scale: 1, color: '#9b6844', material: 'matte' },
      cat: { position: [-0.9, 0, 0.75], scale: 1, color: '#737976', material: 'matte' },
      product: { position: [0.8, 0.02, -0.35], scale: 1, color: '#c7a36a', material: 'glossy' },
      chair: { position: [0.9, 0, 0.55], scale: 1, color: '#6f4938', material: 'matte' },
      table: { position: [-0.95, 0, 0.65], scale: 1, color: '#676d66', material: 'matte' },
      plinth: { position: [0.9, 0, 0.2], scale: 1, color: '#c8c6bd', material: 'matte' },
      cube: { position: [0.85, 0.42, 0.2], scale: 0.8, color: '#8c9288', material: 'glossy' },
      sphere: { position: [0.85, 0.5, 0.2], scale: 0.7, color: '#b58b52', material: 'metal' },
    }
    const appearanceDefaults = { subjectSkinRoughness: 55, subjectSkinOil: 22, subjectSubsurface: 45, subjectMakeup: 'natural' as MakeupStyle, subjectEyeColor: '#4b372b', subjectHairColor: '#211815', subjectHairGloss: 35, subjectOutfitFabric: 'cotton' as OutfitFabric, subjectPhysique: { ...PHYSIQUE_PRESETS.average }, subjectHairStyle: 'long' as HairStyle, subjectOutfitStyle: 'tshirt' as OutfitStyle }
    const resolvedSubjectSex = subjectSex ?? (index % 3 === 2 ? 'masculine' : 'feminine')
    const subjectDefaults = resolvedSubjectSex === 'masculine'
      ? { ...appearanceDefaults, subjectHeight: 1.86, subjectSkinColor: '#805542', subjectOutfitColor: '#5b4339', subjectHairColor: '#15120f', subjectOutfitFabric: 'leather' as OutfitFabric, subjectPosePreset: 'neutral' as PosePreset, subjectPose: { ...NEUTRAL_POSE }, subjectPhysique: { ...PHYSIQUE_PRESETS.athletic }, subjectHairStyle: 'short' as HairStyle, subjectOutfitStyle: 'suit' as OutfitStyle }
      : { ...appearanceDefaults, subjectHeight: 1.74, subjectSkinColor: '#b9826b', subjectOutfitColor: '#343c48', subjectPosePreset: 'neutral' as PosePreset, subjectPose: { ...NEUTRAL_POSE }, subjectPhysique: { ...PHYSIQUE_PRESETS.editorial }, subjectHairStyle: 'bob' as HairStyle, subjectOutfitStyle: 'dress' as OutfitStyle }
    const object: StudioObject = { id, name: `${labels[type]} ${type === 'subject' ? subjectCount + 1 : index}`, type, rotationY: 0, locked: false, ...defaults[type], ...subjectDefaults }
    return { studioObjects: [...state.studioObjects, object], selected: id, selectedIds: [], undoStack: withUndo(state), redoStack: [] }
  }),
  updateStudioObject: (id, patch) => set((state) => {
    const studioObjects = state.studioObjects.map((object) => object.id === id ? { ...object, ...patch } : object)
    return { studioObjects, lights: syncBoundLightTargets({ ...state, studioObjects }), ...syncCameraTracking({ ...state, studioObjects }), undoStack: withUndo(state), redoStack: [] }
  }),
  applyStudioSubjectPose: (id, preset) => set((state) => {
    const subject = state.studioObjects.find((object) => object.id === id && object.type === 'subject')
    if (!subject) return state
    const pose = { ...(getPoseEntry(preset)?.pose ?? NEUTRAL_POSE) }
    const studioObjects = objectsWithSeat(state, pose, subject.position, subject.rotationY, preset)
      .map((object) => object.id === id ? { ...object, subjectPosePreset: preset, subjectPose: pose } : object)
    return { studioObjects, undoStack: withUndo(state), redoStack: [] }
  }),
  updateStudioSubjectPose: (id, patch) => set((state) => ({ studioObjects: state.studioObjects.map((object) => object.id === id && object.type === 'subject' ? { ...object, subjectPosePreset: 'custom', subjectPose: { ...object.subjectPose, ...patch } } : object), undoStack: withUndo(state), redoStack: [] })),
  duplicateStudioObject: (id) => set((state) => {
    const source = state.studioObjects.find((object) => object.id === id)
    if (!source) return state
    const nextId = `object-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
    const copy: StudioObject = { ...source, id: nextId, name: `${source.name} Copy`, position: [source.position[0] + 0.45, source.position[1], source.position[2] + 0.25], locked: false }
    return { studioObjects: [...state.studioObjects, copy], selected: nextId, selectedIds: [], undoStack: withUndo(state), redoStack: [] }
  }),
  deleteStudioObject: (id) => set((state) => {
    if (!state.studioObjects.some((object) => object.id === id)) return state
    const studioObjects = state.studioObjects.filter((object) => object.id !== id)
    return { studioObjects, lights: syncBoundLightTargets({ ...state, studioObjects }), ...syncCameraTracking({ ...state, studioObjects }), selected: state.mainSubjectEnabled ? 'model' : 'camera', selectedIds: [], undoStack: withUndo(state), redoStack: [] }
  }),
  deleteMainSubject: () => set((state) => {
    if (!state.mainSubjectEnabled) return state
    const nextState = { ...state, mainSubjectEnabled: false }
    return {
      mainSubjectEnabled: false,
      lights: syncBoundLightTargets(nextState),
      ...syncCameraTracking(nextState),
      selected: state.studioObjects.find((object) => object.type === 'subject')?.id ?? 'camera',
      selectedIds: [],
      undoStack: withUndo(state),
      redoStack: [],
    }
  }),
  setStudioObjectTransform: (id, position, rotationY, axis) => set((state) => {
    const source = state.studioObjects.find((object) => object.id === id)
    if (!source) return state
    const axisLocked = lockPositionToAxis(source.position, position, axis)
    const radius = source ? (source.type === 'subject' ? FOOTPRINT.subject : FOOTPRINT[source.type] ?? 0.4) : 0.4
    const kind = source ? (source.type === 'subject' ? 'subject' : isSittable(source.type) ? 'furniture' : 'stand') : 'stand'
    const horizontalChanged = Math.abs(axisLocked[0] - source.position[0]) > 1e-6 || Math.abs(axisLocked[2] - source.position[2]) > 1e-6
    const cleared = axis
      ? clampToRoom(axisLocked, radius, state.roomWidth, state.roomDepth)
      : horizontalChanged
      ? clampToRoom(
          resolveCollisions(axisLocked, radius, floorOccupants(state), id, kind),
          radius, state.roomWidth, state.roomDepth,
        )
      : [source.position[0], axisLocked[1], source.position[2]] as [number, number, number]
    const studioObjects = state.studioObjects.map((object) => object.id === id && !object.locked ? { ...object, position: cleared, rotationY: rotationY ?? object.rotationY } : object)
    return { studioObjects, lights: syncBoundLightTargets({ ...state, studioObjects }), ...syncCameraTracking({ ...state, studioObjects }), undoStack: withUndo(state), redoStack: [] }
  }),
  groupSelectedLights: () => set((state) => {
    if (state.selectedIds.length < 2) return state
    const groupId = `group-${Date.now().toString(36)}`
    return { lights: state.lights.map((light) => state.selectedIds.includes(light.id) ? { ...light, groupId } : light), undoStack: withUndo(state), redoStack: [] }
  }),
  ungroupSelectedLights: () => set((state) => {
    const groupIds = new Set(state.lights.filter((light) => state.selectedIds.includes(light.id) && light.groupId).map((light) => light.groupId))
    if (!groupIds.size) return state
    return { lights: state.lights.map((light) => light.groupId && groupIds.has(light.groupId) ? { ...light, groupId: undefined } : light), undoStack: withUndo(state), redoStack: [] }
  }),
  setModelTransform: (position, rotation, axis) => set((state) => {
    const axisLocked = lockPositionToAxis(state.modelPosition, position, axis)
    // The subject yields to stands only when it is the thing being dragged.
    const cleared = axis
      ? clampToRoom(axisLocked, FOOTPRINT.subject, state.roomWidth, state.roomDepth)
      : clampToRoom(
          resolveCollisions(axisLocked, FOOTPRINT.subject, floorOccupants(state), 'model', 'subject'),
          FOOTPRINT.subject, state.roomWidth, state.roomDepth,
        )
    return {
      modelPosition: cleared,
      modelRotation: rotation ?? state.modelRotation,
      lights: syncBoundLightTargets({ ...state, modelPosition: cleared }),
      ...syncCameraTracking({ ...state, modelPosition: cleared }),
      undoStack: withUndo(state),
      redoStack: [],
    }
  }),
  applyPosePreset: (preset) => set((state) => {
    const pose = { ...(getPoseEntry(preset)?.pose ?? NEUTRAL_POSE) }
    return { posePreset: preset, modelPose: pose, studioObjects: objectsWithSeat(state, pose, state.modelPosition, state.modelRotation, preset), undoStack: withUndo(state), redoStack: [] }
  }),
  updateModelPose: (patch) => set((state) => ({ posePreset: 'custom', modelPose: { ...state.modelPose, ...patch }, undoStack: withUndo(state), redoStack: [] })),
  updatePhysique: (patch) => set((state) => ({ physique: { ...state.physique, ...patch }, undoStack: withUndo(state), redoStack: [] })),
  castActor: (id) => set((state) => {
    const member = castMember(id)
    if (!member) return {}
    return {
      actorId: member.id,
      // The sex control still feeds the rest of the rig, so it follows who was
      // cast rather than contradicting them.
      physique: { ...state.physique, sex: member.sex },
      // And the height follows the person: a child left at the adult default
      // stands there as a giant child, which is the first thing anyone would
      // report as a bug.
      modelHeight: member.height,
      undoStack: withUndo(state),
      redoStack: [],
    }
  }),
  /**
   * Drops a whole lighting pattern into the scene.
   *
   * Lights, camera and background all move together — a setup is a
   * relationship between them, and applying half of it teaches nothing.
   */
  applyLightingSetup: (id) => set((state) => {
    const setup = getSetup(id)
    if (!setup) return state
    const template = state.lights[0] ?? initialLights[0]
    const lights = setup.lights.map((spec) => specToLight(spec, template))
    const backdrop = setup.backdropId ? getBackdrop(setup.backdropId) : null
    const next = {
      ...state,
      lights,
      cameraPosition: [...setup.camera.position] as [number, number, number],
      cameraTarget: [...setup.camera.target] as [number, number, number],
      focalLength: setup.camera.focalLength,
      aperture: setup.camera.aperture,
      focusDistance: cameraFocusDistance(setup.camera.position, setup.camera.target),
      ...(backdrop ? { backdropId: backdrop.id, backdropWidth: backdrop.widths[0] } : {}),
    }
    return {
      ...next,
      // Lights bound to the subject need their aim re-solved for this scene's
      // actual subject position, which the setup knows nothing about.
      lights: syncBoundLightTargets(next),
      selected: lights[0]?.id ?? (state.mainSubjectEnabled ? 'model' : 'camera'),
      selectedIds: [],
      undoStack: withUndo(state),
      redoStack: [],
    }
  }),
  selectBackdrop: (id) => set((state) => {
    const profile = getBackdrop(id)
    // Roll widths are physical; keep the nearest legal one rather than a width
    // this paper is never made in.
    const width = profile.widths.includes(state.backdropWidth)
      ? state.backdropWidth
      : profile.widths.reduce((best, option) => Math.abs(option - state.backdropWidth) < Math.abs(best - state.backdropWidth) ? option : best, profile.widths[0])
    return { backdropId: profile.id, backdropWidth: width, undoStack: withUndo(state), redoStack: [] }
  }),
  applyPhysiquePreset: (id) => set((state) => ({ physique: { ...(PHYSIQUE_PRESETS[id] ?? DEFAULT_PHYSIQUE) }, undoStack: withUndo(state), redoStack: [] })),
  updateStudioSubjectPhysique: (id, patch) => set((state) => ({ studioObjects: state.studioObjects.map((object) => object.id === id && object.type === 'subject' ? { ...object, subjectPhysique: { ...object.subjectPhysique, ...patch } } : object), undoStack: withUndo(state), redoStack: [] })),
  applyStudioSubjectPhysique: (id, presetId) => set((state) => ({ studioObjects: state.studioObjects.map((object) => object.id === id && object.type === 'subject' ? { ...object, subjectPhysique: { ...(PHYSIQUE_PRESETS[presetId] ?? DEFAULT_PHYSIQUE) } } : object), undoStack: withUndo(state), redoStack: [] })),
  setCameraPosition: (position, axis) => set((state) => {
    const cameraPosition = lockPositionToAxis(state.cameraPosition, position, axis)
    return { cameraPosition, ...(state.cameraAutoFocus ? { focusDistance: cameraFocusDistance(cameraPosition, state.cameraTarget) } : {}), undoStack: withUndo(state), redoStack: [] }
  }),
  setCameraTarget: (cameraTarget) => set((state) => ({ cameraTarget, cameraTargetSubjectId: undefined, ...(state.cameraAutoFocus ? { focusDistance: cameraFocusDistance(state.cameraPosition, cameraTarget) } : {}), undoStack: withUndo(state), redoStack: [] })),
  bindCameraToSubject: (subjectId, zone = 'face') => set((state) => {
    const cameraTarget = subjectId ? subjectTargetPoint(state, subjectId, zone) : null
    return cameraTarget && subjectId
      ? { cameraTarget, cameraTargetSubjectId: subjectId, cameraTargetZone: zone, ...(state.cameraAutoFocus ? { focusDistance: cameraFocusDistance(state.cameraPosition, cameraTarget) } : {}), undoStack: withUndo(state), redoStack: [] }
      : { cameraTargetSubjectId: undefined, undoStack: withUndo(state), redoStack: [] }
  }),
  setCameraAutoFocus: (cameraAutoFocus) => set((state) => ({ cameraAutoFocus, ...(cameraAutoFocus ? { focusDistance: cameraFocusDistance(state.cameraPosition, state.cameraTarget) } : {}), undoStack: withUndo(state), redoStack: [] })),
  addCameraSlot: () => set((state) => {
    const index = state.cameras.length
    const id = `camera-${Date.now().toString(36)}`
    const camera: CameraSlot = { id, name: `Camera ${String.fromCharCode(65 + Math.min(index, 25))}`, position: [...state.cameraPosition], target: [...state.cameraTarget], focalLength: state.focalLength, focusDistance: state.focusDistance }
    return { cameras: [...state.cameras, camera], activeCameraId: id, undoStack: withUndo(state), redoStack: [] }
  }),
  activateCameraSlot: (id) => set((state) => {
    const camera = state.cameras.find((item) => item.id === id)
    if (!camera) return state
    return { activeCameraId: id, cameraPosition: [...camera.position], cameraTarget: [...camera.target], focalLength: camera.focalLength, focusDistance: camera.focusDistance, selected: 'camera', selectedIds: [], view: 'camera', renderMode: 'preview' }
  }),
  saveActiveCameraSlot: () => set((state) => ({ cameras: state.cameras.map((camera) => camera.id === state.activeCameraId ? { ...camera, position: [...state.cameraPosition], target: [...state.cameraTarget], focalLength: state.focalLength, focusDistance: state.focusDistance } : camera), undoStack: withUndo(state), redoStack: [] })),
  deleteCameraSlot: (id) => set((state) => {
    if (state.cameras.length <= 1) return state
    const cameras = state.cameras.filter((camera) => camera.id !== id)
    return { cameras, activeCameraId: state.activeCameraId === id ? cameras[0].id : state.activeCameraId, undoStack: withUndo(state), redoStack: [] }
  }),
  addTimelineKeyframe: () => set((state) => {
    const keyframe: TimelineKeyframe = { id: `keyframe-${Date.now().toString(36)}`, frame: Math.round(state.timelineFrame), cameraPosition: [...state.cameraPosition], cameraTarget: [...state.cameraTarget], lightPowers: Object.fromEntries(state.lights.map((light) => [light.id, light.powerPercent])) }
    return { timelineKeyframes: [...state.timelineKeyframes.filter((item) => item.frame !== keyframe.frame), keyframe].sort((a, b) => a.frame - b.frame), undoStack: withUndo(state), redoStack: [] }
  }),
  deleteTimelineKeyframe: (id) => set((state) => ({ timelineKeyframes: state.timelineKeyframes.filter((keyframe) => keyframe.id !== id), undoStack: withUndo(state), redoStack: [] })),
  setTimelineFrame: (frame) => set((state) => {
    const timelineFrame = Math.min(state.timelineDuration, Math.max(0, frame))
    const keys = state.timelineKeyframes
    if (!keys.length) return { timelineFrame }
    const left = [...keys].reverse().find((key) => key.frame <= timelineFrame) ?? keys[0]
    const right = keys.find((key) => key.frame >= timelineFrame) ?? keys.at(-1)!
    const mix = left === right ? 0 : (timelineFrame - left.frame) / Math.max(1, right.frame - left.frame)
    const lerpVector = (a: [number, number, number], b: [number, number, number]): [number, number, number] => a.map((value, index) => value + (b[index] - value) * mix) as [number, number, number]
    return { timelineFrame, cameraPosition: lerpVector(left.cameraPosition, right.cameraPosition), cameraTarget: lerpVector(left.cameraTarget, right.cameraTarget), lights: state.lights.map((light) => ({ ...light, powerPercent: (left.lightPowers[light.id] ?? light.powerPercent) + ((right.lightPowers[light.id] ?? light.powerPercent) - (left.lightPowers[light.id] ?? light.powerPercent)) * mix })) }
  }),
  frameCameraSubject: (subjectId, cameraFramingPreset) => set((state) => {
    const zone: LightTargetZone = cameraFramingPreset === 'headshot' ? 'face' : cameraFramingPreset === 'half' ? 'chest' : 'full'
    const cameraTarget = subjectTargetPoint(state, subjectId, zone)
    if (!cameraTarget) return state
    const baseDistance = cameraFramingPreset === 'headshot' ? 1.65 : cameraFramingPreset === 'half' ? 3.15 : 5.35
    const distance = Number((baseDistance * state.focalLength / 50).toFixed(2))
    const cameraPosition: [number, number, number] = [cameraTarget[0], Number((cameraTarget[1] + (cameraFramingPreset === 'full' ? 0.35 : 0.05)).toFixed(2)), Number((cameraTarget[2] + distance).toFixed(2))]
    return { cameraPosition, cameraTarget, cameraTargetSubjectId: subjectId, cameraTargetZone: zone, cameraAutoFocus: true, cameraFramingPreset, focusDistance: cameraFocusDistance(cameraPosition, cameraTarget), view: 'camera', renderMode: 'preview', undoStack: withUndo(state), redoStack: [] }
  }),
  selectCameraBody: (cameraBodyId) => set((state) => ({ cameraBodyId, sensorFormat: CAMERA_BODIES[cameraBodyId].sensor, sensorDynamicRange: CAMERA_BODIES[cameraBodyId].dynamicRange, undoStack: withUndo(state), redoStack: [] })),
  selectLensProfile: (lensProfileId) => set((state) => {
    const lens = LENS_PROFILES[lensProfileId]
    const focalLength = state.focalLength < lens.minFocal || state.focalLength > lens.maxFocal ? lens.defaultFocal : state.focalLength
    return {
      lensProfileId,
      focalLength,
      aperture: Math.max(lens.maxAperture, state.aperture),
      lensVignette: lens.vignette,
      lensDistortion: lens.distortion,
      lensChromaticAberration: lens.chromaticAberration,
      lensBreathing: lens.breathing,
      undoStack: withUndo(state),
      redoStack: [],
    }
  }),
  captureShot: (thumbnail) => set((state) => {
    const shot: StudioShot = { id: `shot-${Date.now().toString(36)}`, name: `Shot ${String(state.shots.length + 1).padStart(2, '0')}`, createdAt: Date.now(), thumbnail, sceneJson: JSON.stringify(snapshotFrom(state)) }
    const shots = [...state.shots, shot]
    persistShots(shots)
    return { shots, activeShotId: shot.id, shotPanelOpen: true }
  }),
  updateShot: (id, name) => set((state) => {
    const shots = state.shots.map((shot) => shot.id === id ? { ...shot, name: name.trim() || shot.name } : shot)
    persistShots(shots)
    return { shots }
  }),
  overwriteShot: (id, thumbnail) => set((state) => {
    const shots = state.shots.map((shot) => shot.id === id ? { ...shot, thumbnail, createdAt: Date.now(), sceneJson: JSON.stringify(snapshotFrom(state)) } : shot)
    persistShots(shots)
    return { shots, activeShotId: id }
  }),
  loadShot: (id) => set((state) => {
    const shot = state.shots.find((item) => item.id === id)
    if (!shot) return state
    try {
      const snapshot = normalizeSnapshot(JSON.parse(shot.sceneJson))
      return { ...snapshotState(snapshot), view: 'camera', renderMode: 'preview', selected: 'camera', selectedIds: [], activeShotId: id, undoStack: withUndo(state), redoStack: [] }
    } catch { return state }
  }),
  deleteShot: (id) => set((state) => {
    const shots = state.shots.filter((shot) => shot.id !== id)
    persistShots(shots)
    return { shots, activeShotId: state.activeShotId === id ? null : state.activeShotId }
  }),
  setModelAsset: (url, name) => set((state) => ({ modelAssetUrl: url, modelAssetName: name, modelImportStatus: url ? 'loading' : 'idle', mainSubjectEnabled: true, selected: 'model', selectedIds: [], undoStack: withUndo(state), redoStack: [] })),
  setModelImportStatus: (status) => set({ modelImportStatus: status }),
  setModelRigStatus: (status) => set({ modelRigStatus: status }),
  undo: () => set((state) => {
    const previous = state.undoStack.at(-1)
    if (!previous) return state
    return { ...snapshotState(previous), selected: previous.selected, selectedIds: previous.selectedIds, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, historyFrom(state)].slice(-30) }
  }),
  redo: () => set((state) => {
    const next = state.redoStack.at(-1)
    if (!next) return state
    return { ...snapshotState(next), selected: next.selected, selectedIds: next.selectedIds, undoStack: [...state.undoStack, historyFrom(state)].slice(-30), redoStack: state.redoStack.slice(0, -1) }
  }),
  saveProject: () => {
    try {
      const state = get()
      const serialized = JSON.stringify(snapshotFrom(state))
      localStorage.setItem(STORAGE_KEY, serialized)
      autosaveController.markSaved(serialized)
      void mirrorProject(serialized).catch((error) => reportError(error, { area: 'project-backup' }))
      autosaveController.cancel()
      set({ lastSavedAt: Date.now(), saveStatus: 'saved' })
    } catch { set({ saveStatus: 'error' }) }
  },
  loadProject: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(V21_STORAGE_KEY) ?? localStorage.getItem(V20_STORAGE_KEY) ?? localStorage.getItem(V19_STORAGE_KEY) ?? localStorage.getItem(V18_STORAGE_KEY) ?? localStorage.getItem(V17_STORAGE_KEY) ?? localStorage.getItem(V16_STORAGE_KEY) ?? localStorage.getItem(V15_STORAGE_KEY) ?? localStorage.getItem(V14_STORAGE_KEY) ?? localStorage.getItem(V13_STORAGE_KEY) ?? localStorage.getItem(V12_STORAGE_KEY) ?? localStorage.getItem(V11_STORAGE_KEY) ?? localStorage.getItem(V10_STORAGE_KEY) ?? localStorage.getItem(V9_STORAGE_KEY) ?? localStorage.getItem(V8_STORAGE_KEY) ?? localStorage.getItem(V7_STORAGE_KEY) ?? localStorage.getItem(V6_STORAGE_KEY) ?? localStorage.getItem(V5_STORAGE_KEY) ?? localStorage.getItem(V4_STORAGE_KEY) ?? localStorage.getItem(V3_STORAGE_KEY) ?? localStorage.getItem(V2_STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
      if (!raw) throw new Error('No save')
      const snapshot = normalizeSnapshot(JSON.parse(raw))
      const shots = snapshot.shots ?? readStoredShots()
      persistShots(shots)
      const firstLight = snapshot.lights[0]
      set((state) => ({ ...snapshotState(snapshot), shots, selected: firstLight?.id ?? (snapshot.mainSubjectEnabled ? 'model' : 'camera'), selectedIds: firstLight ? [firstLight.id] : [], saveStatus: 'loaded', lastSavedAt: Date.now(), undoStack: withUndo(state), redoStack: [] }))
    } catch { set({ saveStatus: 'error' }) }
  },
  shareableJson: () => JSON.stringify(snapshotFrom(get(), false)),
  exportProject: () => {
    try {
      const snapshot = snapshotFrom(get(), true)
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${snapshot.projectName.trim().replace(/[^\w\u3040-\u30ff\u4e00-\u9fff-]+/g, '-') || 'lumen-stage'}.lumen.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      set({ saveStatus: 'exported', lastSavedAt: Date.now() })
    } catch { set({ saveStatus: 'error' }) }
  },
  importProject: (raw) => {
    try {
      const snapshot = normalizeSnapshot(JSON.parse(raw))
      const shots = snapshot.shots ?? []
      persistShots(shots)
      const firstLight = snapshot.lights[0]
      set((state) => ({ ...snapshotState(snapshot), shots, selected: firstLight?.id ?? (snapshot.mainSubjectEnabled ? 'model' : 'camera'), selectedIds: firstLight ? [firstLight.id] : [], saveStatus: 'loaded', lastSavedAt: Date.now(), undoStack: withUndo(state), redoStack: [] }))
    } catch { set({ saveStatus: 'error' }) }
  },
  mergeProject: (raw) => {
    try {
      const incoming = normalizeSnapshot(JSON.parse(raw))
      set((state) => {
        const stamp = Date.now().toString(36)
        const lights = incoming.lights.map((light, index) => ({ ...light, id: `merge-light-${stamp}-${index}`, name: `${light.name} · Merged`, position: [light.position[0] + 0.5, light.position[1], light.position[2] + 0.5] as [number, number, number] }))
        const modifiers = incoming.modifiers.map((modifier, index) => ({ ...modifier, id: `merge-grip-${stamp}-${index}`, name: `${modifier.name} · Merged`, position: [modifier.position[0] + 0.5, modifier.position[1], modifier.position[2] + 0.5] as [number, number, number] }))
        const studioObjects = incoming.studioObjects.map((object, index) => ({ ...object, id: `merge-set-${stamp}-${index}`, name: `${object.name} · Merged`, position: [object.position[0] + 0.5, object.position[1], object.position[2] + 0.5] as [number, number, number] }))
        return { lights: [...state.lights, ...lights], modifiers: [...state.modifiers, ...modifiers], studioObjects: [...state.studioObjects, ...studioObjects], shots: [...state.shots, ...(incoming.shots ?? [])], saveStatus: 'loaded', undoStack: withUndo(state), redoStack: [] }
      })
    } catch { set({ saveStatus: 'error' }) }
  },
  resetLighting: () => set((state) => ({ lights: cloneLights(initialLights), selected: 'key', selectedIds: ['key'], undoStack: withUndo(state), redoStack: [] })),
  openStudioView: () => { useRenderProgress.getState().reset(); set({ view: 'studio', renderMode: 'preview', pathTracingPaused: false }) },
  openCameraView: () => { useRenderProgress.getState().reset(); set({ view: 'camera', renderMode: 'preview', pathTracingPaused: false }) },
  openTopView: () => { useRenderProgress.getState().reset(); set({ view: 'top', renderMode: 'preview', pathTracingPaused: false }) },
  startPhotoRender: () => { useRenderProgress.getState().reset('building'); set((state) => ({ view: 'camera', renderMode: 'path', pathTracingPaused: false, renderRevision: state.renderRevision + 1 })) },
  restartPhotoRender: () => { useRenderProgress.getState().reset('building'); set((state) => ({ pathTracingPaused: false, renderRevision: state.renderRevision + 1 })) },
}))

const autosaveController = createAutosaveScheduler<StudioState>({
  delay: 900,
  initialSerialized: JSON.stringify(snapshotFrom(useStudio.getState())),
  serialize: (state) => JSON.stringify(snapshotFrom(state)),
  persist: (serialized) => {
    localStorage.setItem(STORAGE_KEY, serialized)
    void mirrorProject(serialized).catch((error) => reportError(error, { area: 'project-backup' }))
  },
  onSaved: () => useStudio.setState({ lastSavedAt: Date.now(), saveStatus: 'autosaved' }),
  onError: (error, serialized) => {
    reportError(error, { area: 'project-storage' })
    void mirrorProject(serialized).catch((backupError) => reportError(backupError, { area: 'project-backup' }))
    useStudio.setState({ saveStatus: 'error' })
  },
})

useStudio.subscribe((state) => autosaveController.schedule(state))
