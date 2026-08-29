import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PhysicalCamera, WebGLPathTracer } from 'three-gpu-pathtracer'
import { LENS_PROFILES } from '../cameraProfiles'
import { breathingAdjustedFocalLength } from '../optics'
import { useStudio } from '../store'

const SENSOR_WIDTH = { 'full-frame': 36, 'aps-c': 23.5, mft: 17.3 } as const

/** Loaded only when the user enables the substantially heavier path renderer. */
export default function PathTracingRenderer() {
  const { gl, scene, camera } = useThree()
  const paused = useStudio((state) => state.pathTracingPaused)
  const renderRevision = useStudio((state) => state.renderRevision)
  const aperture = useStudio((state) => state.aperture)
  const cameraMode = useStudio((state) => state.cameraMode)
  const tStop = useStudio((state) => state.tStop)
  const anamorphic = useStudio((state) => state.anamorphic)
  const focalLength = useStudio((state) => state.focalLength)
  const focusDistance = useStudio((state) => state.focusDistance)
  const shutter = useStudio((state) => state.shutter)
  const lights = useStudio((state) => state.lights)
  const modifiers = useStudio((state) => state.modifiers)
  const studioObjects = useStudio((state) => state.studioObjects)
  const modelPosition = useStudio((state) => state.modelPosition)
  const modelRotation = useStudio((state) => state.modelRotation)
  const modelHeight = useStudio((state) => state.modelHeight)
  const modelPose = useStudio((state) => state.modelPose)
  const skinColor = useStudio((state) => state.skinColor)
  const outfitColor = useStudio((state) => state.outfitColor)
  const modelImportStatus = useStudio((state) => state.modelImportStatus)
  const soloLightId = useStudio((state) => state.soloLightId)
  const cameraPosition = useStudio((state) => state.cameraPosition)
  const cameraTarget = useStudio((state) => state.cameraTarget)
  const sensorFormat = useStudio((state) => state.sensorFormat)
  const lensProfileId = useStudio((state) => state.lensProfileId)
  const lensOpticsEnabled = useStudio((state) => state.lensOpticsEnabled)
  const lensBreathing = useStudio((state) => state.lensBreathing)
  const syncSpeed = useStudio((state) => state.syncSpeed)
  const ambientLevel = useStudio((state) => state.ambientLevel)
  const ambientTemperature = useStudio((state) => state.ambientTemperature)
  const iesUrl = useStudio((state) => state.iesUrl)
  const hdriUrl = useStudio((state) => state.hdriUrl)
  const roomWidth = useStudio((state) => state.roomWidth)
  const roomDepth = useStudio((state) => state.roomDepth)
  const roomHeight = useStudio((state) => state.roomHeight)
  const wallColor = useStudio((state) => state.wallColor)
  const floorColor = useStudio((state) => state.floorColor)
  const windowEnabled = useStudio((state) => state.windowEnabled)
  const sunEnabled = useStudio((state) => state.sunEnabled)
  const sunAzimuth = useStudio((state) => state.sunAzimuth)
  const sunElevation = useStudio((state) => state.sunElevation)
  const sunIntensity = useStudio((state) => state.sunIntensity)
  const haze = useStudio((state) => state.haze)
  const setValue = useStudio((state) => state.setValue)
  const tracer = useMemo(() => new WebGLPathTracer(gl), [gl])
  const physicalCamera = useMemo(() => new PhysicalCamera(), [])
  const ready = useRef(false)
  const lastReport = useRef(0)

  useEffect(() => {
    tracer.bounces = 5
    tracer.transmissiveBounces = 8
    tracer.multipleImportanceSampling = true
    tracer.renderDelay = 0
    tracer.fadeDuration = 250
    tracer.minSamples = 1
    tracer.renderScale = 1
    tracer.tiles.set(2, 2)
    tracer.dynamicLowRes = false
    tracer.rasterizeScene = true
    tracer.renderToCanvas = true

    return () => {
      ready.current = false
      tracer.dispose()
      useStudio.setState({ pathTracingSamples: 0, pathTracingStatus: 'idle' })
    }
  }, [tracer])

  useEffect(() => {
    try {
      ready.current = false
      setValue('pathTracingStatus', 'building')
      setValue('pathTracingSamples', 0)

      const source = camera as THREE.PerspectiveCamera
      physicalCamera.position.copy(source.position)
      physicalCamera.quaternion.copy(source.quaternion)
      physicalCamera.scale.copy(source.scale)
      physicalCamera.aspect = source.aspect
      physicalCamera.near = source.near
      physicalCamera.far = source.far
      physicalCamera.zoom = source.zoom
      physicalCamera.filmGauge = SENSOR_WIDTH[sensorFormat] * anamorphic
      physicalCamera.setFocalLength(breathingAdjustedFocalLength(focalLength, focusDistance, lensBreathing, lensOpticsEnabled))
      physicalCamera.fStop = cameraMode === 'cinema' ? tStop : aperture
      physicalCamera.focusDistance = focusDistance
      physicalCamera.apertureBlades = LENS_PROFILES[lensProfileId].blades
      physicalCamera.apertureRotation = Math.PI / 18
      physicalCamera.updateProjectionMatrix()
      physicalCamera.updateMatrixWorld(true)

      tracer.setScene(scene, physicalCamera)
      ready.current = true
      lastReport.current = 0
      setValue('pathTracingStatus', paused ? 'paused' : 'rendering')
    } catch (error) {
      console.error('Path tracing scene build failed', error)
      setValue('pathTracingStatus', 'error')
    }
  }, [
    ambientLevel, ambientTemperature, anamorphic, aperture, camera, cameraMode, cameraPosition, cameraTarget, floorColor, focalLength, focusDistance, haze, hdriUrl, iesUrl, lensBreathing, lensOpticsEnabled, lensProfileId, lights, modifiers, roomDepth, roomHeight, roomWidth, studioObjects,
    modelHeight, modelImportStatus, modelPose, modelPosition, modelRotation, outfitColor, physicalCamera, renderRevision, skinColor, soloLightId,
    scene, sensorFormat, setValue, shutter, sunAzimuth, sunElevation, sunEnabled, sunIntensity, syncSpeed, tracer, tStop, wallColor, windowEnabled,
  ])

  useEffect(() => {
    if (!ready.current) return
    setValue('pathTracingStatus', paused ? 'paused' : 'rendering')
  }, [paused, setValue])

  useFrame((_, delta) => {
    if (!ready.current) return
    tracer.pausePathTracing = paused
    tracer.renderSample()
    lastReport.current += delta
    if (lastReport.current >= 0.2) {
      lastReport.current = 0
      const samples = tracer.samples
      if (Math.abs(useStudio.getState().pathTracingSamples - samples) >= 0.2) {
        useStudio.setState({ pathTracingSamples: samples })
      }
    }
  }, 1)

  return null
}
