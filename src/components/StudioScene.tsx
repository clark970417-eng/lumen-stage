import { Grid, Html, Line, OrbitControls, RoundedBox, TransformControls } from '@react-three/drei'
import { BrightnessContrast, DepthOfField, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame, useThree } from '@react-three/fiber'
import { Effect, ToneMappingMode } from 'postprocessing'
import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { IESLoader } from 'three/addons/loaders/IESLoader.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { breathingAdjustedFocalLength, calculateDepthOfField } from '../optics'
import { useStudio, type OutfitFabric, type SceneObjectMaterial, type SceneObjectType, type StudioLight, type StudioModifier, type StudioObject, type TransformAxis } from '../store'
import type { FigureAppearance } from './Figure'
import { forwardKinematics } from '../ik'
import { isSeatedPose, NEUTRAL_POSE, type ModelPose } from '../pose'
import type { HairStyle } from '../wardrobe'
import { applyExpressionToMorphs, applyPoseToSkeleton, boneDirection, captureRestPose, mappingQuality, mapSkeleton, type BoneMap, type RestPose } from '../retarget'
import { SOCKET_PAINT_SPREAD, HAIRLINE_CUT, HAIRLINE_JITTER, STUDIO_HAIR_SKULL_MARGIN, BROW_ARCH, BROW_INNER_X, BROW_LENGTH, BROW_OUTER_DROP, BROW_PROUD_OF_FACE, BROW_RISE_ABOVE_EYE, BROW_SAMPLE_RADIUS, BROW_SEGMENT_LENGTH, BROW_SEGMENTS, BROW_THICKNESS, EYE_APERTURE_HALF_HEIGHT, EYE_APERTURE_HALF_WIDTH, EYE_BAND_HALF_HEIGHT, EYE_DEPTH_BELOW_CROWN, EYE_HALF_SEPARATION, EYE_RADIUS, EYE_SAMPLE_X, FACE_FORWARD, STUDIO_HAIR_SOURCE_SCALE, STUDIO_HAIR_SOURCE_URL, studioEyeAnchor, studioHairAnchor, studioHairPlan, studioHairResponse, studioSkinResponse, type StudioHairMass } from '../studioHumanDetails'
import { captureLightOutput, PATHTRACE_CANDELA_SCALE, PREVIEW_CANDELA_SCALE } from '../lightProfiles'
import { CAMERA_BODIES, LENS_PROFILES } from '../cameraProfiles'
import { COLOR_PROFILES, whiteBalanceGains } from '../colorScience'
import { getBackdrop, type BackdropProfile } from '../backdrops'
import { FOOTPRINT, seatHeightOf } from '../layout'
import { PoseRig } from './PoseRig'
import { applyGelTint, geledTemperature, getGel } from '../gels'
import { brickNormalMap, canvasNormalMap, concreteNormalMap, fabricNormalMap, fabricRoughnessMap, hairNormalMap, mottleMap, paperNormalMap, plasterNormalMap, skinNormalMap, skinRoughnessMap, woodNormalMap } from '../textures'
import { shippedHumanFor } from '../characterAssets'
import { useWorkflow } from '../workflow'
import { canControlInWorkflow, workflowModeForStage } from '../workflowControl'

// A RectAreaLight is dark until the LTC lookup tables are uploaded. Every bounce
// panel and the window are rect-area sources, so this has to run before the
// first frame or half the scene's light silently contributes nothing.
RectAreaLightUniformsLib.init()

const HorizontalLayoutContext = createContext(false)

const SENSOR_WIDTH = { 'full-frame': 36, 'aps-c': 23.5, mft: 17.3 } as const
const SENSOR_COC = { 'full-frame': 0.03, 'aps-c': 0.019, mft: 0.015 } as const
const PathTracingRenderer = lazy(() => import('./PathTracingRenderer'))

function singleTransformAxis(axis: string | null | undefined): TransformAxis | undefined {
  return axis === 'X' || axis === 'Y' || axis === 'Z' ? axis : undefined
}

function activeTransformAxis(control: TransformControlsImpl | null): TransformAxis | undefined {
  return singleTransformAxis((control as unknown as { axis?: string | null } | null)?.axis)
}

function kelvinColor(kelvin: number) {
  const temp = kelvin / 100
  const r = temp <= 66 ? 255 : 329.698727446 * Math.pow(temp - 60, -0.1332047592)
  const g = temp <= 66 ? 99.4708025861 * Math.log(temp) - 161.1195681661 : 288.1221695283 * Math.pow(temp - 60, -0.0755148492)
  const b = temp >= 66 ? 255 : temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.044792731
  return new THREE.Color(
    THREE.MathUtils.clamp(r, 0, 255) / 255,
    THREE.MathUtils.clamp(g, 0, 255) / 255,
    THREE.MathUtils.clamp(b, 0, 255) / 255,
  )
}

function createGoboTexture(pattern: StudioLight['goboPattern'], rotation: number, scale: number) {
  if (pattern === 'none') return null
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 512
  const context = canvas.getContext('2d')!
  context.fillStyle = '#050505'; context.fillRect(0, 0, 512, 512)
  context.save(); context.translate(256, 256); context.rotate(THREE.MathUtils.degToRad(rotation)); context.scale(scale, scale); context.translate(-256, -256)
  context.fillStyle = '#ffffff'
  if (pattern === 'window') {
    context.fillRect(70, 70, 372, 372); context.fillStyle = '#050505'; context.fillRect(236, 70, 40, 372); context.fillRect(70, 236, 372, 40)
  } else if (pattern === 'blinds') {
    for (let y = 70; y < 450; y += 54) context.fillRect(52, y, 408, 24)
  } else if (pattern === 'foliage') {
    for (let index = 0; index < 42; index += 1) {
      const x = 45 + ((index * 83) % 420); const y = 35 + ((index * 137) % 440); const radius = 14 + (index * 17) % 38
      context.beginPath(); context.ellipse(x, y, radius * 1.5, radius, (index % 8) * 0.44, 0, Math.PI * 2); context.fill()
    }
  } else {
    for (let index = 0; index < 28; index += 1) {
      const x = 35 + ((index * 113) % 440); const y = 35 + ((index * 67) % 440); const size = 18 + (index * 19) % 62
      context.save(); context.translate(x, y); context.rotate(index * 0.71); context.fillRect(-size, -size * 0.24, size * 2, size * 0.48); context.restore()
    }
  }
  context.restore()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function CameraRig() {
  const layoutOnly = useWorkflow((state) => workflowModeForStage(state.stage) === 'layout')
  const { camera } = useThree()
  const view = useStudio((state) => state.view)
  const focalLength = useStudio((state) => state.focalLength)
  const cameraPosition = useStudio((state) => state.cameraPosition)
  const cameraTarget = useStudio((state) => state.cameraTarget)
  const sensorFormat = useStudio((state) => state.sensorFormat)
  const focusDistance = useStudio((state) => state.focusDistance)
  const lensOpticsEnabled = useStudio((state) => state.lensOpticsEnabled)
  const lensBreathing = useStudio((state) => state.lensBreathing)
  const anamorphic = useStudio((state) => state.anamorphic)
  const imagingFocalLength = breathingAdjustedFocalLength(focalLength, focusDistance, lensBreathing, lensOpticsEnabled)

  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera
    perspective.filmGauge = SENSOR_WIDTH[sensorFormat] * anamorphic
    perspective.up.set(0, 1, 0)
    if (view === 'camera') {
      perspective.position.set(...cameraPosition)
      perspective.setFocalLength(imagingFocalLength)
      perspective.lookAt(...cameraTarget)
    } else if (view === 'top') {
      perspective.position.set(0, 11.5, 1.4)
      perspective.up.set(0, 0, -1)
      perspective.fov = 43
      perspective.lookAt(0, 0, 1.4)
    } else {
      perspective.position.set(6.8, 6, 7.2)
      perspective.fov = 42
      perspective.lookAt(0, 1.1, 0)
    }
    perspective.updateProjectionMatrix()
  }, [anamorphic, camera, cameraPosition, cameraTarget, imagingFocalLength, sensorFormat, view])

  useEffect(() => {
    if (view !== 'camera') return
    const perspective = camera as THREE.PerspectiveCamera
    perspective.filmGauge = SENSOR_WIDTH[sensorFormat] * anamorphic
    perspective.setFocalLength(imagingFocalLength)
    perspective.updateProjectionMatrix()
  }, [anamorphic, camera, imagingFocalLength, sensorFormat, view])

  // OrbitControls still owns the camera target while input is disabled. Leaving
  // its studio target here pulled a 200 mm viewfinder down from the eyes to the chest.
  return <OrbitControls enabled={view === 'studio' && !layoutOnly} enableRotate={!layoutOnly} makeDefault target={view === 'camera' ? cameraTarget : [0, 1.15, 0]} minDistance={3.5} maxDistance={13} maxPolarAngle={Math.PI / 2.02} />
}

const LENS_CHARACTER_FRAGMENT = `
uniform float radialDistortion;
uniform float colorFringe;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 centered = uv - 0.5;
  float radius2 = dot(centered, centered);
  vec2 warpedUv = 0.5 + centered * (1.0 + radialDistortion * radius2);
  vec2 fringe = normalize(centered + vec2(0.00001)) * colorFringe * radius2;
  float red = texture2D(inputBuffer, warpedUv + fringe).r;
  float green = texture2D(inputBuffer, warpedUv).g;
  float blue = texture2D(inputBuffer, warpedUv - fringe).b;
  float alpha = texture2D(inputBuffer, warpedUv).a;
  outputColor = vec4(red, green, blue, alpha);
}
`

function LensCharacterPass({ distortion, chromaticAberration }: { distortion: number; chromaticAberration: number }) {
  const effect = useMemo(() => new Effect('LensCharacterEffect', LENS_CHARACTER_FRAGMENT, { uniforms: new Map([
    ['radialDistortion', new THREE.Uniform(0)],
    ['colorFringe', new THREE.Uniform(0)],
  ]) }), [])
  useEffect(() => {
    effect.uniforms.get('radialDistortion')!.value = distortion * 0.0009
    effect.uniforms.get('colorFringe')!.value = chromaticAberration * 0.000018
  }, [chromaticAberration, distortion, effect])
  useEffect(() => () => effect.dispose(), [effect])
  return <primitive object={effect} />
}

const COLOR_SCIENCE_FRAGMENT = `
uniform vec3 whiteBalanceGain;
uniform float profileSaturation;
uniform float profileContrast;
uniform float profileWarmth;
uniform float profileTint;
uniform float profileStrength;
uniform float curveStrength;
uniform float highlightRolloff;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 color = inputColor.rgb * whiteBalanceGain;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float saturation = mix(1.0, profileSaturation, profileStrength);
  color = vec3(luma) + (color - vec3(luma)) * saturation;
  color += vec3(profileWarmth + profileTint, -profileTint, -profileWarmth + profileTint) * profileStrength;
  float contrast = mix(1.0, profileContrast, profileStrength);
  color = (color - 0.5) * contrast + 0.5;
  vec3 limited = clamp(color, 0.0, 1.0);
  vec3 curve = limited * limited * (3.0 - 2.0 * limited);
  color = mix(color, curve, curveStrength);
  vec3 high = max(vec3(0.0), color - 0.62);
  vec3 compressed = vec3(0.62) + high / (vec3(1.0) + high * (2.0 + highlightRolloff * 3.0));
  color = mix(color, min(color, compressed), highlightRolloff);
  outputColor = vec4(max(color, vec3(0.0)), inputColor.a);
}
`

function ColorSciencePass({ imageFormat, temperature, tint, profileId, rolloff, toneCurve, lutIntensity }: { imageFormat: 'raw' | 'jpeg'; temperature: number; tint: number; profileId: keyof typeof COLOR_PROFILES; rolloff: number; toneCurve: number; lutIntensity: number }) {
  const effect = useMemo(() => new Effect('ColorScienceEffect', COLOR_SCIENCE_FRAGMENT, { uniforms: new Map<string, THREE.Uniform<unknown>>([
    ['whiteBalanceGain', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
    ['profileSaturation', new THREE.Uniform(1)],
    ['profileContrast', new THREE.Uniform(1)],
    ['profileWarmth', new THREE.Uniform(0)],
    ['profileTint', new THREE.Uniform(0)],
    ['profileStrength', new THREE.Uniform(1)],
    ['curveStrength', new THREE.Uniform(0)],
    ['highlightRolloff', new THREE.Uniform(0)],
  ]) }), [])
  useEffect(() => {
    const profile = COLOR_PROFILES[profileId]
    const gains = whiteBalanceGains(temperature, tint)
    const rawMix = imageFormat === 'raw' ? 0.24 : 1
    effect.uniforms.get('whiteBalanceGain')!.value.set(gains.red, gains.green, gains.blue)
    effect.uniforms.get('profileSaturation')!.value = profile.saturation
    effect.uniforms.get('profileContrast')!.value = profile.contrast
    effect.uniforms.get('profileWarmth')!.value = profile.warmth
    effect.uniforms.get('profileTint')!.value = profile.tint
    effect.uniforms.get('profileStrength')!.value = rawMix * lutIntensity / 100
    effect.uniforms.get('curveStrength')!.value = (toneCurve - 50) / 50 * rawMix
    effect.uniforms.get('highlightRolloff')!.value = rolloff / 100 * rawMix
  }, [effect, imageFormat, lutIntensity, profileId, rolloff, temperature, tint, toneCurve])
  useEffect(() => () => effect.dispose(), [effect])
  return <primitive object={effect} />
}

const SENSOR_FRAGMENT = `
uniform float frameSeed;
uniform float noiseAmount;
uniform float chromaAmount;
uniform float shadowFloor;
uniform float motionBlur;
uniform float rollingSkew;
float sensorHash(vec2 point) { return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 sensorUv = uv + vec2((uv.y - 0.5) * rollingSkew, 0.0);
  vec2 blurStep = vec2(motionBlur, 0.0);
  vec3 color = texture2D(inputBuffer, sensorUv - blurStep * 2.0).rgb;
  color += texture2D(inputBuffer, sensorUv - blurStep).rgb;
  color += texture2D(inputBuffer, sensorUv).rgb;
  color += texture2D(inputBuffer, sensorUv + blurStep).rgb;
  color += texture2D(inputBuffer, sensorUv + blurStep * 2.0).rgb;
  color *= 0.2;
  float lumaNoise = (sensorHash(uv * 1733.0 + frameSeed) - 0.5) * noiseAmount;
  vec3 chromaNoise = vec3(
    sensorHash(uv * 1291.0 + frameSeed * 1.7),
    sensorHash(uv * 1459.0 + frameSeed * 2.3),
    sensorHash(uv * 1613.0 + frameSeed * 3.1)
  ) - 0.5;
  color += vec3(lumaNoise) + chromaNoise * chromaAmount;
  color = max(color, vec3(shadowFloor));
  outputColor = vec4(color, inputColor.a);
}
`

function SensorPass({ iso, nativeIso, noiseFactor, dynamicRange, noiseReduction, colorNoise, shutter, shutterMode, motionBlur, rollingShutter, readoutMs, raw }: { iso: number; nativeIso: number; noiseFactor: number; dynamicRange: number; noiseReduction: number; colorNoise: number; shutter: number; shutterMode: 'mechanical' | 'electronic'; motionBlur: number; rollingShutter: number; readoutMs: number; raw: boolean }) {
  const effect = useMemo(() => new Effect('SensorEffect', SENSOR_FRAGMENT, { uniforms: new Map<string, THREE.Uniform<number>>([
    ['frameSeed', new THREE.Uniform(0)], ['noiseAmount', new THREE.Uniform(0)], ['chromaAmount', new THREE.Uniform(0)], ['shadowFloor', new THREE.Uniform(0)], ['motionBlur', new THREE.Uniform(0)], ['rollingSkew', new THREE.Uniform(0)],
  ]) }), [])
  useEffect(() => {
    const isoGain = Math.max(1, iso / nativeIso)
    const rawFactor = raw ? 1 : 0.62
    const reduction = 1 - Math.min(0.92, noiseReduction / 110)
    const noise = Math.sqrt(isoGain - 1) * 0.021 * noiseFactor * reduction * rawFactor
    effect.uniforms.get('noiseAmount')!.value = noise
    effect.uniforms.get('chromaAmount')!.value = noise * colorNoise / 100
    effect.uniforms.get('shadowFloor')!.value = Math.max(0, (14.8 - dynamicRange) * 0.0025)
    effect.uniforms.get('motionBlur')!.value = Math.max(0, Math.min(0.0035, (125 / Math.max(8, shutter) - 1) * motionBlur * 0.000004))
    effect.uniforms.get('rollingSkew')!.value = shutterMode === 'electronic' ? readoutMs / 1000 * rollingShutter / 100 : 0
  }, [colorNoise, dynamicRange, effect, iso, motionBlur, nativeIso, noiseFactor, noiseReduction, raw, readoutMs, rollingShutter, shutter, shutterMode])
  useFrame(({ clock }) => { effect.uniforms.get('frameSeed')!.value = Math.floor(clock.elapsedTime * 18) })
  useEffect(() => () => effect.dispose(), [effect])
  return <primitive object={effect} />
}

/**
 * A seamless roll, swept.
 *
 * The curve matters: a paper roll does not meet the floor at a corner, it bends
 * through a radius, and that radius is what kills the shadow line behind the
 * subject's feet. Drawing it as two flat planes throws away the one thing the
 * backdrop is for.
 */
function sweepGeometry(width: number, height: number, radius: number, floorRun: number, segments = 24) {
  const half = width / 2
  const path: [number, number][] = []
  // Down the vertical face to the top of the bend.
  const lift = 0.004
  path.push([-radius, height])
  path.push([-radius, radius + lift])
  for (let i = 1; i <= segments; i++) {
    const angle = (i / segments) * (Math.PI / 2)
    path.push([-radius + radius * Math.sin(angle), lift + radius - radius * (1 - Math.cos(angle))])
  }
  // Out across the floor toward the camera. Held a paper's thickness above the
  // room floor so the two surfaces never contest the same depth.
  path.push([floorRun, lift])

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const runLength = path.length
  path.forEach(([z, y], row) => {
    for (let column = 0; column <= 1; column++) {
      positions.push(column === 0 ? -half : half, y, z)
      uvs.push(column, row / (runLength - 1))
    }
  })
  for (let row = 0; row < runLength - 1; row++) {
    const a = row * 2
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

const SURFACE_NORMAL_MAP: Record<BackdropProfile['surface'], () => THREE.Texture> = {
  paper: paperNormalMap,
  canvas: canvasNormalMap,
  vinyl: paperNormalMap,
  plaster: plasterNormalMap,
  brick: brickNormalMap,
  concrete: concreteNormalMap,
  wood: woodNormalMap,
}

function BackdropSurface() {
  const backdropId = useStudio((state) => state.backdropId)
  const backdropWidth = useStudio((state) => state.backdropWidth)
  const backdropDistance = useStudio((state) => state.backdropDistance)
  const roomHeight = useStudio((state) => state.roomHeight)
  const profile = getBackdrop(backdropId)

  const geometry = useMemo(() => {
    if (profile.family === 'none') return null
    const height = Math.min(roomHeight - 0.4, profile.family === 'wall' ? roomHeight - 0.3 : 3.2)
    return profile.sweep
      ? sweepGeometry(backdropWidth, height, 0.62, 2.6)
      : sweepGeometry(backdropWidth, height, 0.02, 0.02)
  }, [backdropWidth, profile.family, profile.sweep, roomHeight])

  const material = useMemo(() => {
    if (profile.family === 'none') return null
    const normalMap = SURFACE_NORMAL_MAP[profile.surface]()
    return new THREE.MeshStandardMaterial({
      color: profile.color,
      roughness: profile.roughness,
      metalness: profile.surface === 'vinyl' ? 0.06 : 0,
      normalMap,
      normalScale: new THREE.Vector2(profile.surface === 'paper' ? 0.3 : 1, profile.surface === 'paper' ? 0.3 : 1),
      map: profile.mottled ? mottleMap() : null,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  }, [profile])

  useEffect(() => () => { geometry?.dispose(); material?.dispose() }, [geometry, material])
  if (!geometry || !material) return null

  return (
    <group position={[0, 0, -backdropDistance]}>
      <mesh receiveShadow geometry={geometry} material={material} />
      {profile.family === 'paper' && (
        // The roll and its crossbar. Small, but it tells you the paper's width.
        <>
          <mesh position={[0, Math.min(roomHeight - 0.4, 3.2) + 0.06, -0.62]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.055, 0.055, backdropWidth + 0.12, 20]} />
            <meshStandardMaterial color="#5b564d" roughness={0.8} />
          </mesh>
          {([-1, 1] as const).map((side) => (
            <mesh key={side} position={[side * (backdropWidth / 2 + 0.16), Math.min(roomHeight - 0.4, 3.2) / 2, -0.66]}>
              <cylinderGeometry args={[0.022, 0.028, Math.min(roomHeight - 0.4, 3.2) + 0.1, 12]} />
              <meshStandardMaterial color="#2a2d2a" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
        </>
      )}
    </group>
  )
}

/**
 * The measuring tape.
 *
 * Click two points and the scene reports the distance between them, plus the
 * horizontal run and the height difference — because on a light stand those are
 * the two numbers you actually set, and the hypotenuse is the one that decides
 * the exposure.
 */
function MeasureTool() {
  const measureMode = useStudio((state) => state.measureMode)
  const points = useStudio((state) => state.measurePoints)
  const addMeasurePoint = useStudio((state) => state.addMeasurePoint)
  const roomWidth = useStudio((state) => state.roomWidth)
  const roomDepth = useStudio((state) => state.roomDepth)
  const view = useStudio((state) => state.view)
  if (view === 'camera') return null

  const [a, b] = points
  const distance = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) : 0
  const run = a && b ? Math.hypot(b[0] - a[0], b[2] - a[2]) : 0
  const rise = a && b ? b[1] - a[1] : 0
  const midpoint: [number, number, number] = a && b
    ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.12, (a[2] + b[2]) / 2]
    : [0, 0, 0]

  return (
    <group>
      {/* An invisible catcher so a click anywhere in the room lands on the floor. */}
      {measureMode && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.002, 0]}
          onClick={(event) => {
            event.stopPropagation()
            const { x, y, z } = event.point
            addMeasurePoint([Number(x.toFixed(3)), Number(y.toFixed(3)), Number(z.toFixed(3))])
          }}
        >
          <planeGeometry args={[roomWidth * 1.5, roomDepth * 1.5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {points.map((point, index) => (
        <mesh key={index} position={point}>
          <sphereGeometry args={[0.045, 16, 12]} />
          <meshBasicMaterial color="#7ad8ff" toneMapped={false} />
        </mesh>
      ))}
      {a && b && (
        <>
          <Line points={[a, b]} color="#7ad8ff" lineWidth={2} />
          {/* The right-angle legs: the run you pace out and the stand height. */}
          <Line points={[a, [b[0], a[1], b[2]]]} color="#7ad8ff" lineWidth={1} dashed dashSize={0.08} gapSize={0.06} opacity={0.5} transparent />
          <Line points={[[b[0], a[1], b[2]], b]} color="#7ad8ff" lineWidth={1} dashed dashSize={0.08} gapSize={0.06} opacity={0.5} transparent />
          <Html position={midpoint} center distanceFactor={7} className="measure-readout">
            <b>{distance.toFixed(2)} m</b>
            <span>{run.toFixed(2)} run · {rise >= 0 ? '+' : ''}{rise.toFixed(2)} rise</span>
          </Html>
        </>
      )}
    </group>
  )
}

function Backdrop() {
  const roomWidth = useStudio((state) => state.roomWidth)
  const roomDepth = useStudio((state) => state.roomDepth)
  const roomHeight = useStudio((state) => state.roomHeight)
  const wallColor = useStudio((state) => state.wallColor)
  const floorColor = useStudio((state) => state.floorColor)
  const halfWidth = roomWidth / 2
  const plaster = plasterNormalMap()
  return (
    <group>
      <mesh receiveShadow position={[0, roomHeight / 2, -roomDepth * 0.25]}>
        <planeGeometry args={[roomWidth, roomHeight]} />
        <meshStandardMaterial color={wallColor} roughness={0.96} normalMap={plaster} normalScale={new THREE.Vector2(0.4, 0.4)} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, roomDepth * 0.25]}>
        <planeGeometry args={[roomWidth, roomDepth]} />
        <meshStandardMaterial color={floorColor} roughness={0.94} normalMap={plaster} normalScale={new THREE.Vector2(0.5, 0.5)} />
      </mesh>
      <mesh receiveShadow rotation={[0, Math.PI / 2, 0]} position={[-halfWidth, roomHeight / 2, roomDepth * 0.25]}><planeGeometry args={[roomDepth, roomHeight]} /><meshStandardMaterial color={wallColor} roughness={0.95} /></mesh>
      <mesh receiveShadow rotation={[0, -Math.PI / 2, 0]} position={[halfWidth, roomHeight / 2, roomDepth * 0.25]}><planeGeometry args={[roomDepth, roomHeight]} /><meshStandardMaterial color={wallColor} roughness={0.95} /></mesh>
      {/* Skirting. Two flat planes meeting at a hairline read as a render; the
          bead of trim is what tells the eye where the floor actually stops. */}
      <mesh castShadow receiveShadow position={[0, 0.055, -roomDepth * 0.25 + 0.02]}>
        <boxGeometry args={[roomWidth, 0.11, 0.04]} />
        <meshStandardMaterial color={wallColor} roughness={0.72} />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <mesh key={side} castShadow receiveShadow position={[side * (halfWidth - 0.02), 0.055, roomDepth * 0.25]}>
          <boxGeometry args={[0.04, 0.11, roomDepth]} />
          <meshStandardMaterial color={wallColor} roughness={0.72} />
        </mesh>
      ))}
      <BackdropSurface />
    </group>
  )
}

/**
 * How much of the neutral probe the scene as a whole gets.
 *
 * Deliberately almost nothing. A probe bright enough to put a reflection in a
 * chrome ball is also bright enough to act as fill on every wall in the room,
 * and fill nobody asked for is fill the meter did not predict. So the scene
 * keeps a trace of it and the props that actually need reflections buy more
 * through their own envMapIntensity — which, on a metal, is pure specular,
 * because a metal has no diffuse to lift.
 */
const NEUTRAL_ENVIRONMENT_INTENSITY = 0.12

function EnvironmentLighting() {
  const { gl, scene } = useThree()
  const hdriUrl = useStudio((state) => state.hdriUrl)
  const sunEnabled = useStudio((state) => state.sunEnabled)
  const windowEnabled = useStudio((state) => state.windowEnabled)
  const sunAzimuth = useStudio((state) => state.sunAzimuth)
  const sunElevation = useStudio((state) => state.sunElevation)
  const sunIntensity = useStudio((state) => state.sunIntensity)
  const haze = useStudio((state) => state.haze)
  const roomWidth = useStudio((state) => state.roomWidth)
  const roomDepth = useStudio((state) => state.roomDepth)
  const qualityPreset = useStudio((state) => state.qualityPreset)
  // The sun's shadow camera is orthographic and defaults to a 10m box centred on
  // the origin. A room wider than that loses its shadows at the edges, so the
  // frustum is cut to the room instead of to Three's default.
  const sunShadowExtent = Math.max(roomWidth, roomDepth) * 0.8
  const sunShadowMap = qualityPreset === 'performance' ? 1024 : qualityPreset === 'ultra' ? 4096 : 2048
  const sunPosition = useMemo<[number, number, number]>(() => {
    const azimuth = THREE.MathUtils.degToRad(sunAzimuth)
    const elevation = THREE.MathUtils.degToRad(sunElevation)
    return [Math.cos(elevation) * Math.sin(azimuth) * 12, Math.sin(elevation) * 12, Math.cos(elevation) * Math.cos(azimuth) * 12]
  }, [sunAzimuth, sunElevation])

  /*
   * A reflection probe, so metal has something to be metal about.
   *
   * A chrome or glazed prop with nothing to reflect renders as a dark blob.
   * The specular lobe is doing its job — there is simply nothing in the room
   * for it to find, because a studio assembled from spot lights and emissive
   * planes carries no environment. Real chrome on a real set reflects the
   * softboxes and the ceiling. So with no HDRI loaded the scene gets a neutral
   * room, dim enough to read as reflection rather than as fill. Loading an
   * HDRI replaces it outright and takes the intensity back to full.
   */
  useEffect(() => {
    if (hdriUrl) return
    const generator = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const probe = generator.fromScene(room, 0.04)
    room.dispose()
    generator.dispose()
    scene.environment = probe.texture
    scene.environmentIntensity = NEUTRAL_ENVIRONMENT_INTENSITY
    return () => {
      if (scene.environment === probe.texture) scene.environment = null
      probe.dispose()
    }
  }, [gl, hdriUrl, scene])

  useEffect(() => {
    if (!hdriUrl) return
    let active = true
    let texture: THREE.DataTexture | null = null
    new RGBELoader().load(hdriUrl, (loaded) => {
      if (!active) { loaded.dispose(); return }
      texture = loaded
      loaded.mapping = THREE.EquirectangularReflectionMapping
      scene.environment = loaded
      scene.environmentIntensity = 1
    })
    return () => { active = false; if (scene.environment === texture) scene.environment = null; texture?.dispose() }
  }, [hdriUrl, scene])

  return <>
    {haze > 0 && <fog attach="fog" args={['#747b75', Math.max(0.008, 0.045 - haze * 0.00035)]} />}
    {sunEnabled && <directionalLight
      position={sunPosition}
      intensity={sunIntensity / 18}
      color="#fff1d4"
      castShadow
      shadow-mapSize-width={sunShadowMap}
      shadow-mapSize-height={sunShadowMap}
      shadow-camera-near={2}
      shadow-camera-far={26}
      shadow-camera-left={-sunShadowExtent}
      shadow-camera-right={sunShadowExtent}
      shadow-camera-top={sunShadowExtent}
      shadow-camera-bottom={-sunShadowExtent}
      shadow-bias={-0.0004}
      shadow-normalBias={0.05}
    />}
    {/*
      A practical window, built into the left wall.

      The group faces +X so the rect-area light's emissive face points into the
      room rather than out through the wall, and the joinery is solid stock
      rather than decals — a window in a lighting tool is a large soft source
      whose mullions are the only thing that shapes it.
    */}
    {windowEnabled && <group position={[-roomWidth / 2 + 0.06, 2.15, 0.25]} rotation={[0, -Math.PI / 2, 0]}>
      <rectAreaLight width={1.74} height={2.14} intensity={sunIntensity / 22 + 1.2} color="#dceaff" />
      <mesh>
        <planeGeometry args={[1.8, 2.2]} />
        <meshPhysicalMaterial color="#cfe4ef" roughness={0.06} metalness={0} transmission={0.86} thickness={0.02} transparent opacity={0.34} side={THREE.DoubleSide} />
      </mesh>
      {/* Outer casing: head, sill and two jambs, each with real depth. */}
      {([[0, 1.14, 1.94, 0.09], [0, -1.14, 1.94, 0.09]] as const).map(([x, y, w, h]) => (
        <mesh key={`rail-${y}`} castShadow receiveShadow position={[x, y, -0.03]}>
          <boxGeometry args={[w, h, 0.11]} />
          <meshStandardMaterial color="#343a35" roughness={0.62} metalness={0.12} />
        </mesh>
      ))}
      {([-0.925, 0.925] as const).map((x) => (
        <mesh key={`jamb-${x}`} castShadow receiveShadow position={[x, 0, -0.03]}>
          <boxGeometry args={[0.09, 2.28, 0.11]} />
          <meshStandardMaterial color="#343a35" roughness={0.62} metalness={0.12} />
        </mesh>
      ))}
      {/* Mullions and transom — the bars that cut the soft source into panes. */}
      {([-0.45, 0.45] as const).map((x) => (
        <mesh key={`mullion-${x}`} castShadow position={[x, 0, -0.012]}>
          <boxGeometry args={[0.042, 2.16, 0.05]} />
          <meshStandardMaterial color="#2e3430" roughness={0.58} metalness={0.14} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.34, -0.012]}>
        <boxGeometry args={[1.8, 0.042, 0.05]} />
        <meshStandardMaterial color="#2e3430" roughness={0.58} metalness={0.14} />
      </mesh>
      {/* The sill sticks into the room, so it catches a highlight edge-on. */}
      <mesh castShadow receiveShadow position={[0, -1.2, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[2.02, 0.24, 0.05]} />
        <meshStandardMaterial color="#3c423c" roughness={0.7} />
      </mesh>
    </group>}
  </>
}

function TimelinePlayback() {
  const playing = useStudio((state) => state.timelinePlaying)
  const frame = useStudio((state) => state.timelineFrame)
  const duration = useStudio((state) => state.timelineDuration)
  const frameRate = useStudio((state) => state.frameRate)
  const setTimelineFrame = useStudio((state) => state.setTimelineFrame)
  const setValue = useStudio((state) => state.setValue)
  useFrame((_, delta) => {
    if (!playing) return
    const next = frame + delta * frameRate
    if (next >= duration) { setTimelineFrame(duration); setValue('timelinePlaying', false) }
    else setTimelineFrame(next)
  })
  return null
}

/**
 * The scene's wrapper around the figure rig.
 *
 * Everything the rig needs is either passed in (for a standalone person) or
 * read from the main subject's slice of the store.
 */
/**
 * Finds what a figure at this spot would be sitting on.
 *
 * A seat only counts if the figure is actually over it — standing beside a
 * chair should not levitate anybody.
 */
function useSeatHeight(position: [number, number, number]) {
  const studioObjects = useStudio((state) => state.studioObjects)
  return useMemo(() => {
    let best: number | null = null
    for (const object of studioObjects) {
      const seat = seatHeightOf(object.type, object.scale)
      if (seat === null) continue
      const reach = FOOTPRINT[object.type as keyof typeof FOOTPRINT] ?? 0.4
      const gap = Math.hypot(object.position[0] - position[0], object.position[2] - position[2])
      if (gap > reach) continue
      if (best === null || seat > best) best = seat
    }
    return best
  }, [position, studioObjects])
}

function attachHeadDetail(model: THREE.Group, head: THREE.Bone, detail: THREE.Group, worldPosition: THREE.Vector3) {
  model.add(detail)
  detail.position.copy(model.worldToLocal(worldPosition))
  model.updateMatrixWorld(true)
  head.attach(detail)
}

/**
 * The one thing aiming the arms cannot set: the roll about their own length.
 */
/** How far the forearms pronate, so the palms face the thighs not the lens. */
const REST_FOREARM_ROLL = 24

/** Material names the appearance pass looks for on a loaded actor. */
const STUDIO_HAIR_MATERIAL = 'studio-hair-material'
const ACTOR_IRIS_MATERIAL = 'lumen-actor-iris'
const ACTOR_EYE_MATERIAL = 'lumen-actor-eye'
const ACTOR_BROW_MATERIAL = 'lumen-actor-brow'

/**
 * How far the hair colour is lifted toward white, in sRGB.
 *
 * Small: enough to keep a strand's shading readable against a dark colour,
 * not enough to grey it.
 */
const HAIR_COLOUR_LIFT = 0.05

/** Mean linear luminance of the strand map, divided back out of the colour. */
const HAIR_STRAND_MEAN = 0.44

/** Maps the appearance controls to a physically plausible hair response. */
function applyStudioHairAppearance(material: THREE.MeshPhysicalMaterial, hairColor: string, hairGloss: number) {
  const response = studioHairResponse(hairGloss)
  // The colour control tints the photographed strands instead of multiplying
  // a dark texture by another dark colour, which crushed every strand to black.
  // Both halves of that have to happen in the right space. Lifting toward
  // white is a perceptual move, so it is done in sRGB — an eighteen per cent
  // lift applied to linear values turned near-black hair into mid grey, which
  // is how the default subject ended up looking like she had gone silver. And
  // the lift is then divided back out by the strand map's own mean, so what
  // the colour picker says is what the hair renders as.
  const color = new THREE.Color(hairColor)
  const lifted = color.clone().convertLinearToSRGB()
  lifted.lerp(new THREE.Color(1, 1, 1), HAIR_COLOUR_LIFT).convertSRGBToLinear()
  material.color.copy(lifted).multiplyScalar(1 / HAIR_STRAND_MEAN)
  material.metalness = 0
  material.metalnessMap = null
  // A matted style scatters instead of returning a band, so it never reaches
  // the gloss the control would otherwise allow.
  const matte = typeof material.userData.lumenHairMatte === 'number' ? material.userData.lumenHairMatte : 0
  material.roughness = Math.min(0.95, response.roughness + matte)
  material.sheen = response.sheen * (1 - matte * 4)
  material.sheenColor.copy(color).lerp(new THREE.Color('#d8c7b8'), 0.12)
  material.sheenRoughness = response.sheenRoughness
  material.anisotropy = response.anisotropy
  material.clearcoat = 0
  material.clearcoatMap = null
  material.clearcoatNormalMap = null
  material.clearcoatRoughnessMap = null
  material.specularIntensity = response.specularIntensity
  material.envMapIntensity = response.envMapIntensity
  material.needsUpdate = true
}

/** Gives the complete scalp shell fine fibres without cutting holes in it. */
function createStudioHairTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')!
  context.fillStyle = '#b0aaa5'
  context.fillRect(0, 0, 256, 256)
  for (let x = 0; x < 256; x += 2) {
    const shade = 92 + (x * 37 % 70)
    context.strokeStyle = `rgb(${shade},${shade},${shade})`
    context.lineWidth = x % 6 === 0 ? 0.8 : 0.35
    context.beginPath()
    context.moveTo(x, 0)
    context.bezierCurveTo(x + 5, 70, x - 4, 180, x + 2, 256)
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2.2, 1.5)
  texture.anisotropy = 8
  return texture
}

/**
 * Breaks the bottom edge of the scalp shell into strands.
 *
 * The shell is a closed dome, and rendered solid it ends in one hard,
 * continuous line — a swim cap, not a head of hair. No hairline looks like
 * that: it thins out into points. So the lowest band of the mesh is cut away
 * along a ragged threshold, which leaves the fringe and the nape ending in
 * teeth instead of a rim.
 *
 * The cut is driven off the vertex's own height in the shell rather than off
 * its UVs, because this OBJ's UV direction is not something to guess at, and
 * height is the axis a hairline actually runs across. Alpha-tested rather than
 * blended, so the hair still writes depth and still casts a shadow.
 */
function featherHairline(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position')
  if (!position || geometry.getAttribute('color')) return
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) return
  const height = box.max.y - box.min.y
  if (height <= 1e-6) return

  const colors = new Float32Array(position.count * 4)
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) - box.min.y) / height
    // A stable hash of the vertex, so the same head grows the same hairline
    // every time it loads rather than shimmering between reloads.
    const noise = Math.abs(Math.sin((position.getX(i) * 127.1 + position.getZ(i) * 311.7) * 43758.5453)) % 1
    const cut = HAIRLINE_CUT + noise * HAIRLINE_JITTER
    const alpha = t <= cut ? 0 : 1
    colors[i * 4] = 1
    colors[i * 4 + 1] = 1
    colors[i * 4 + 2] = 1
    colors[i * 4 + 3] = alpha
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
}

/**
 * The upper skull, measured off the actor's own mesh.
 *
 * Everything above a fifth of the way up from the head bone and inside a
 * head's width of the centreline: that is the cranium plus the ears, which is
 * exactly the volume a scalp shell has to cover. Read in world space, after
 * the actor has been normalised, so it already carries whatever scale the file
 * needed.
 */
function measureSkull(model: THREE.Object3D, headBoneY: number, modelTop: number) {
  const point = new THREE.Vector3()
  const box = new THREE.Box3()
  const floor = headBoneY + (modelTop - headBoneY) * 0.2
  model.updateMatrixWorld(true)
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const position = child.geometry.getAttribute('position')
    if (!position) return
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position as THREE.BufferAttribute, index).applyMatrix4(child.matrixWorld)
      if (point.y < floor || point.y > modelTop + 1e-4) continue
      if (Math.abs(point.x) > 0.16) continue
      box.expandByPoint(point)
    }
  })
  if (box.isEmpty()) return null
  return { box, width: box.getSize(new THREE.Vector3()).x }
}

/**
 * Marks a generated hair piece fully opaque.
 *
 * The mass shares the shell's material, which reads vertex colour so the
 * hairline can be feathered. A lathe or a capsule has no colour attribute, and
 * an absent attribute reads as opaque black in the shader — which is what the
 * nape and the side locks were rendering as: unlit black slabs hanging off the
 * hair. They want no feathering, so white at full alpha.
 */
function paintOpaque(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position')
  if (!position) return geometry
  const colors = new Float32Array(position.count * 4).fill(1)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4))
  return geometry
}

/**
 * The mass a style hangs behind the scalp shell.
 *
 * Built from the measured skull rather than from constants, so a nape length
 * on one actor is a nape length on the other. Every piece is a lathe or a
 * capsule: hair at this distance is a silhouette and a sheen, and a silhouette
 * is all these have to be right.
 */
function buildHairMass(mass: StudioHairMass, skull: THREE.Box3, material: THREE.Material) {
  if (mass === 'none') return null
  const size = skull.getSize(new THREE.Vector3())
  const width = size.x
  const depth = size.z
  const group = new THREE.Group()
  const back = -FACE_FORWARD * depth * 0.28

  if (mass === 'knot') {
    const knot = new THREE.Mesh(paintOpaque(new THREE.SphereGeometry(width * 0.27, 20, 14)), material)
    knot.scale.set(1, 0.86, 0.86)
    knot.position.set(0, -size.y * 0.06, back - FACE_FORWARD * width * 0.2)
    knot.castShadow = true
    group.add(knot)
    return group
  }

  if (mass === 'tail') {
    const tail = new THREE.Mesh(paintOpaque(new THREE.CapsuleGeometry(width * 0.14, size.y * 0.95, 6, 16)), material)
    tail.scale.set(1, 1, 0.78)
    tail.rotation.x = -FACE_FORWARD * 0.24
    tail.position.set(0, -size.y * 0.62, back - FACE_FORWARD * width * 0.14)
    tail.castShadow = true
    group.add(tail)
    return group
  }

  // A sheet down the back of the head, longer for 'shoulders'. Half a lathe,
  // so it wraps the nape instead of standing off it as a slab.
  const drop = mass === 'shoulders' ? size.y * 2.05 : size.y * 0.62
  const profile: THREE.Vector2[] = []
  const steps = 12
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    // Widest at the nape, tapering toward the ends.
    const flare = Math.sin(Math.min(1, 0.15 + t * 1.1) * Math.PI * 0.86)
    profile.push(new THREE.Vector2(width * 0.5 * (0.62 + 0.42 * flare), -drop * t))
  }
  const sheet = new THREE.Mesh(paintOpaque(new THREE.LatheGeometry(profile, 22, Math.PI * 0.52, Math.PI * 0.96)), material)
  sheet.rotation.y = FACE_FORWARD > 0 ? 0 : Math.PI
  sheet.scale.set(1, 1, depth / width)
  sheet.position.set(0, -size.y * 0.16, 0)
  sheet.castShadow = true
  sheet.receiveShadow = false
  group.add(sheet)
  return group
}

/**
 * Fits the CC0 MakeHuman strand mesh to this normalized actor's real head.
 *
 * The shell used to be scaled by a constant and hung at a fixed drop below the
 * crown. Neither survives contact with a second actor: the constant is applied
 * inside the model's own normalising scale, so the same number produced a
 * bigger wig on whichever file happened to be authored smaller, and the fixed
 * drop had nothing to do with where that actor's skull actually was. Straight
 * on it looked survivable. From three-quarters it was a grey slab hanging in
 * front of the face.
 *
 * So the skull is measured and the shell is fitted to it: scaled to the head's
 * own width, centred on the head's own depth, and capped just over the crown.
 * The chosen style then scales that fit and hangs whatever falls behind it.
 */
function addStudioHair(model: THREE.Group, head: THREE.Bone, source: THREE.Group, hairColor: string, hairGloss: number, hairStyle: HairStyle) {
  const plan = studioHairPlan(hairStyle)
  if (plan.margin <= 0) return
  // Hair loads asynchronously, often after the actor has already been placed
  // in the scene. Re-measure its live transform instead of using coordinates
  // captured before the actor's outer transform was applied.
  model.updateWorldMatrix(true, true)
  const box = new THREE.Box3().setFromObject(model)
  const headPosition = head.getWorldPosition(new THREE.Vector3())
  const texture = createStudioHairTexture()
  const material = new THREE.MeshPhysicalMaterial({
    map: texture,
    normalMap: hairNormalMap(),
    normalScale: new THREE.Vector2(0.4 * plan.frizz, 0.4 * plan.frizz),
    metalness: 0,
    anisotropyRotation: Math.PI / 2,
    transparent: false,
    depthWrite: true,
    envMapIntensity: 0.24,
    side: THREE.DoubleSide,
    vertexColors: true,
    alphaTest: 0.5,
  })
  material.name = STUDIO_HAIR_MATERIAL
  material.userData.lumenHairMatte = plan.matte
  applyStudioHairAppearance(material, hairColor, hairGloss)

  const hairstyle = new THREE.Group()
  hairstyle.name = 'studio-short04-hair'
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.material = material
    child.castShadow = true
    // A shadow map cannot resolve strands, so all it does on a shell this thin
    // is drop the whole lower half of the hair into its own umbra and crush it
    // to flat black below the jaw. The hair still casts onto the face and the
    // shoulders; it just does not receive.
    child.receiveShadow = false
    featherHairline(child.geometry)
  })

  const fit = measureSkull(model, headPosition.y, box.max.y)
  const skull = fit?.box
  const sourceBox = new THREE.Box3().setFromObject(source)
  const sourceSize = sourceBox.getSize(new THREE.Vector3())
  const sourceCenter = sourceBox.getCenter(new THREE.Vector3())
  // The shell is a child of the model, so its own scale is multiplied by the
  // model's normalising scale before it reaches the world. Divide that back
  // out or the fit lands wherever the exporter's units happened to be.
  const modelScale = model.scale.x || 1
  // Fitted to whichever way the skull is proportionally largest against the
  // shell. Scaled on width alone, a head deeper than the shell was authored
  // for pushed its brow and its crown straight through the hair — which is
  // exactly what the male actor did, his skull being the deeper of the two.
  const skullSize = fit ? fit.box.getSize(new THREE.Vector3()) : null
  const fitted = fit && skullSize && sourceSize.x > 1e-6 && sourceSize.z > 1e-6
    ? Math.max(
      (fit.width * plan.margin) / (sourceSize.x * modelScale),
      (skullSize.z * plan.margin) / (sourceSize.z * modelScale),
    )
    : STUDIO_HAIR_SOURCE_SCALE
  source.scale.setScalar(fitted)
  source.position.copy(sourceCenter).multiplyScalar(-fitted)

  const shellHeight = sourceSize.y * fitted * modelScale
  const anchor = studioHairAnchor(headPosition, box.max.y + plan.lift, skull ?? undefined, shellHeight)
  // Volume belongs behind and above the head, not over the face. Without this
  // the big styles grew forward as fast as they grew back and the afro closed
  // over the brows and cheeks.
  if (skull) {
    const depth = skull.getSize(new THREE.Vector3()).z
    anchor.z -= FACE_FORWARD * Math.max(0, plan.margin - STUDIO_HAIR_SKULL_MARGIN) * depth * 0.62
  }
  hairstyle.add(source)
  if (skull) {
    const mass = buildHairMass(plan.mass, skull, material)
    // The mass is positioned in skull space; the shell's origin is its own
    // centre, so shift it onto the skull centre before adding it.
    if (mass) {
      const centre = skull.getCenter(new THREE.Vector3())
      mass.position.set(
        (centre.x - anchor.x) / modelScale,
        (centre.y - anchor.y) / modelScale,
        (centre.z - anchor.z) / modelScale,
      )
      mass.scale.setScalar(1 / modelScale)
      hairstyle.add(mass)
    }
  }
  attachHeadDetail(model, head, hairstyle, anchor)
}

/*
 * Dressing the shipped actors.
 *
 * The two exports are not equally finished. The female bodies ship with a
 * normal map and a metallic-roughness map; the male body ships with a colour
 * map and nothing else, so his forehead, his forearm and his knuckles all had
 * one roughness — which is most of why he read as a mannequin standing next to
 * her. And both were being handed to MeshStandard, which has no sheen and no
 * clearcoat: no way to say "light goes a few millimetres into this and comes
 * back warm", which is the rest of what separates skin from painted plastic.
 *
 * Everything below is applied to whatever the file already carries rather than
 * over the top of it. A baked map an artist authored beats a procedural one; a
 * missing map is the only thing worth filling in.
 */

/** MakeHuman names the body material `Human.body`; everything else is worn. */
function isActorSkin(material: THREE.Material) {
  return /(^|[.\s_-])(body|skin)$/i.test(material.name)
}

/**
 * Re-hosts a baked glTF material on MeshPhysical, carrying its maps across.
 *
 * Constructed field by field rather than through copy(): MeshPhysicalMaterial's
 * copy reads clearcoat, sheen and the rest off the source, and a MeshStandard
 * source has none of them, so the result is a material full of undefined.
 */
function toActorPhysical(source: THREE.MeshStandardMaterial) {
  const material = new THREE.MeshPhysicalMaterial({
    color: source.color.clone(),
    map: source.map,
    normalMap: source.normalMap,
    normalScale: source.normalScale.clone(),
    roughnessMap: source.roughnessMap,
    metalnessMap: source.metalnessMap,
    aoMap: source.aoMap,
    aoMapIntensity: source.aoMapIntensity,
    emissiveMap: source.emissiveMap,
    displacementMap: source.displacementMap,
    roughness: source.roughness,
    metalness: 0,
    side: source.side,
    flatShading: source.flatShading,
    vertexColors: source.vertexColors,
  })
  material.name = source.name
  // The source marks every surface as alpha-blended even though the baked
  // textures are opaque. Opaque depth writing keeps hair, eyes, mouth and
  // jacket layers from sorting into black cut-outs.
  material.transparent = false
  material.opacity = 1
  material.alphaTest = 0
  material.depthWrite = true
  return material
}

/**
 * The colour light is when it comes back out of skin, whatever went in.
 *
 * Muted to suit actors that carry a baked skin colour. A pure haemoglobin red
 * applied directly to these textures turned them orange.
 */
const SUBSURFACE_COLOR = '#d99a86'

/**
 * The skin response shared by every shipped actor, so a control has the same
 * photographic meaning when physique or wardrobe selects a different GLB.
 */
function applyActorSkin(material: THREE.MeshPhysicalMaterial, appearance: FigureAppearance) {
  const response = studioSkinResponse(appearance.skinRoughness, appearance.skinOil, appearance.subsurface, appearance.physique.age)
  // Pores, on every actor. This started out filling in only the male body's
  // missing map — the difference between a broken highlight and one flat
  // specular blob across a whole cheek — and left the female bodies with the
  // one their file ships. That map is 1024 by 1024 pixels of pure black. A
  // black texel is not "no detail": decoded it is a tangent-space normal
  // pointing away from every light in the room, so her skin shaded dark and
  // mottled while his, with no map at all, came out clean. That is the whole
  // difference in finish between the two shipped subjects.
  material.normalMap = skinNormalMap()
  material.normalScale = new THREE.Vector2(0.3, 0.3)
  // Whose map is in play decides what the roughness number means. Ours is
  // authored against an absolute value; the file's is authored against the
  // glTF default factor of 1, so imposing an absolute number on it made the
  // female actors a stop glossier than their artist intended — wet-looking,
  // with hard specular streaks down the arms.
  // The MakeHuman packed roughness texture contains large UV islands with
  // very different values. Under a studio key that made one arm and the neck
  // look chrome while the face stayed matte. Use one restrained pore-scale
  // response across every exposed skin island instead.
  material.roughnessMap = skinRoughnessMap()
  material.userData.lumenSkinRoughness = true
  material.normalScale.setScalar(response.normalScale)
  material.metalness = 0
  material.metalnessMap = null
  material.roughness = response.roughness
  // Sebum, which is a coat over the skin rather than a property of it.
  material.clearcoat = response.clearcoat
  material.clearcoatMap = null
  material.clearcoatNormalMap = null
  material.clearcoatRoughness = response.clearcoatRoughness
  material.clearcoatRoughnessMap = null
  // Scatter, twice over: a warm sheen at grazing angles for the rim, and a
  // trace of emission so the shadow terminator stays warm instead of going
  // straight to black the way paint does. Both kept small — this is meant to
  // read as skin, not as a lit surface the meter never accounted for.
  material.sheen = response.sheen
  material.sheenColor = new THREE.Color(SUBSURFACE_COLOR)
  material.sheenRoughness = response.sheenRoughness
  material.emissive.set('#000000')
  material.emissiveIntensity = 0
  material.iridescence = 0
  material.iridescenceMap = null
  material.iridescenceThicknessMap = null
  material.transmission = 0
  material.transmissionMap = null
  material.thickness = 0
  material.thicknessMap = null
  material.ior = 1.4
  material.specularIntensity = response.specularIntensity
  material.specularIntensityMap = null
  material.envMapIntensity = response.envMapIntensity
  // A body is a closed surface. The file marks it double-sided anyway, which
  // costs a second pass through every shadow map and lets the inside of the
  // torso answer the key light — the source of the grey wash that used to sit
  // under the jaw and inside the elbows. Cloth keeps its own sidedness: a
  // dress hem really is one-sided geometry.
  material.side = THREE.FrontSide
  material.shadowSide = THREE.FrontSide
  material.needsUpdate = true
}

/** The worn response: weave, sheen and how wet the fabric reads. */
function applyActorGarment(material: THREE.MeshPhysicalMaterial, fabric: OutfitFabric) {
  const shiny = fabric === 'silk' || fabric === 'satin'
  // Only maps this code supplied get swapped when the fabric changes; a normal
  // map that came out of the file is the garment's own and stays.
  if (!material.normalMap || material.userData.lumenFabricMaps) {
    material.userData.lumenFabricMaps = true
    material.normalMap = fabricNormalMap(fabric)
    material.roughnessMap = fabricRoughnessMap(fabric)
  }
  material.normalScale = new THREE.Vector2(shiny ? 0.35 : 0.8, shiny ? 0.35 : 0.8)
  material.metalness = 0
  material.roughness = shiny ? 0.36 : fabric === 'leather' ? 0.44 : fabric === 'velvet' ? 0.86 : 0.82
  material.sheen = shiny ? 0.75 : fabric === 'velvet' ? 0.95 : fabric === 'cotton' ? 0.2 : 0.1
  material.sheenColor = material.color.clone().lerp(new THREE.Color('#ffffff'), fabric === 'velvet' ? 0.5 : 0.34)
  material.sheenRoughness = shiny ? 0.22 : 0.7
  material.clearcoat = fabric === 'leather' ? 0.48 : 0
  material.clearcoatRoughness = 0.32
  material.envMapIntensity = 0.7
  material.needsUpdate = true
}

/** Walks a loaded actor and re-applies everything the controls drive. */
function applyActorAppearance(model: THREE.Object3D, appearance: FigureAppearance) {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      if (!(material instanceof THREE.MeshPhysicalMaterial)) return
      if (material.name === ACTOR_EYE_MATERIAL) return
      if (material.name === STUDIO_HAIR_MATERIAL) applyStudioHairAppearance(material, appearance.hairColor, appearance.hairGloss)
      else if (material.name === ACTOR_IRIS_MATERIAL) retintIris(material, appearance.eyeColor)
      else if (isActorSkin(material)) applyActorSkin(material, appearance)
      else applyActorGarment(material, appearance.outfitFabric)
    })
  })
}

/**
 * Re-colours the iris when the control moves.
 *
 * The whole eyeball shares one material, so tinting `color` would multiply the
 * sclera by the iris colour too and turn the white of the eye the same muddy
 * brown as the ring — which is what made the eyes read as grey marbles. The
 * colour lives in the texture instead, so a change repaints it.
 */
function retintIris(material: THREE.MeshPhysicalMaterial, eyeColor: string) {
  if (material.userData.irisColor === eyeColor) return
  material.userData.irisColor = eyeColor
  material.map?.dispose()
  material.map = createEyeTexture(eyeColor)
  material.color.set('#ffffff')
  material.needsUpdate = true
}

/**
 * The eye surface on a closed face.
 *
 * These bodies have no eye sockets to drop an eyeball into: the only boundary
 * loop anywhere in the head is the neck opening, and the eyes are painted onto
 * closed geometry. So the eyeballs are prosthetics — they sit on the face, and
 * what matters is finding the face.
 *
 * Sampled in a band at eye height and out on the eyelid rather than on the
 * nose bridge, and taken from a high percentile of the forward direction
 * rather than the single frontmost vertex, so a stray point on the brow ridge
 * cannot throw it. The head bone is not consulted at all: the two shipped
 * actors carry theirs three centimetres apart in depth, so no offset from it
 * could ever place both.
 */
const FACE_SURFACE_PERCENTILE = 0.9

function measureFaceBand(model: THREE.Object3D, modelTop: number, belowCrown: number, halfHeight: number, sampleX: { min: number; max: number }) {
  const point = new THREE.Vector3()
  const depths: number[] = []
  model.updateMatrixWorld(true)
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const position = child.geometry.getAttribute('position')
    if (!position) return
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position as THREE.BufferAttribute, index).applyMatrix4(child.matrixWorld)
      if (Math.abs(modelTop - point.y - belowCrown) > halfHeight) continue
      const offset = Math.abs(point.x)
      if (offset < sampleX.min || offset > sampleX.max) continue
      depths.push(point.z * FACE_FORWARD)
    }
  })
  if (depths.length < 8) return null
  depths.sort((a, b) => a - b)
  return depths
}

function measureEyeSurface(model: THREE.Object3D, modelTop: number) {
  const depths = measureFaceBand(model, modelTop, EYE_DEPTH_BELOW_CROWN, EYE_BAND_HALF_HEIGHT, EYE_SAMPLE_X)
  if (!depths) return null
  return depths[Math.round((depths.length - 1) * FACE_SURFACE_PERCENTILE)] * FACE_FORWARD
}

/**
 * The front of the face at one point on it.
 *
 * A brow cannot be a rigid arc laid across a head: a face curves away toward
 * the temple, so a single depth buries the outer half of the arc and leaves a
 * hook poking out of the inner half. Each piece of the brow is placed on the
 * surface under it instead, and this is what finds that surface — the nearest
 * vertices in plan, front-most first.
 */
function sampleFaceZ(model: THREE.Object3D, x: number, y: number, radius: number) {
  const point = new THREE.Vector3()
  let front = Number.NEGATIVE_INFINITY
  const radiusSq = radius * radius
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const position = child.geometry.getAttribute('position')
    if (!position) return
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position as THREE.BufferAttribute, index).applyMatrix4(child.matrixWorld)
      const dx = point.x - x
      const dy = point.y - y
      if (dx * dx + dy * dy > radiusSq) continue
      const depth = point.z * FACE_FORWARD
      if (depth > front) front = depth
    }
  })
  return Number.isFinite(front) ? front * FACE_FORWARD : null
}

/**
 * Eyebrows.
 *
 * These faces ship without them — the base texture paints a socket and stops —
 * and a browless face is the loudest thing wrong with a portrait of one. A
 * brow carries most of what a viewer reads as age, mood and sex, so a head
 * missing both reads as a mannequin whatever else has been fixed.
 *
 * Built as a run of short segments rather than one arc, each one dropped onto
 * the face surface directly under it, so the brow follows the brow ridge round
 * toward the temple instead of sinking into it. Coloured off the hair, because
 * that is the control a user reaches for when they want a different one.
 */
function addStudioBrows(model: THREE.Group, head: THREE.Bone, eyeAnchor: THREE.Vector3, hairColor: string) {
  const brows = new THREE.Group()
  brows.name = 'studio-eyebrows'
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hairColor),
    roughness: 0.82,
    metalness: 0,
    sheen: 0.16,
    clearcoat: 0,
    envMapIntensity: 0.1,
  })
  material.name = ACTOR_BROW_MATERIAL
  const hair = new THREE.SphereGeometry(1, 8, 6)
  // Sizes are in metres on the finished actor, so they have to be divided back
  // through whatever scale normalised him to 1.82 m.
  const unit = 1 / (model.scale.x || 1)

  const browY = eyeAnchor.y + BROW_RISE_ABOVE_EYE
  for (const side of [-1, 1] as const) {
    for (let step = 0; step < BROW_SEGMENTS; step += 1) {
      // 0 at the inner end, 1 at the outer.
      const along = step / (BROW_SEGMENTS - 1)
      const x = side * (BROW_INNER_X + along * BROW_LENGTH)
      // A brow rises off the inner end, peaks two-thirds out and falls away.
      const arch = Math.sin(Math.min(1, along * 1.35) * Math.PI * 0.9)
      const y = browY + arch * BROW_ARCH - along * BROW_OUTER_DROP
      const surface = sampleFaceZ(model, x, y, BROW_SAMPLE_RADIUS)
      if (surface === null) continue
      const segment = new THREE.Mesh(hair, material)
      segment.castShadow = true
      // Thick in the middle, tapering at both ends, the way a brow does.
      const taper = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, along * 1.15))
      segment.scale.set(BROW_SEGMENT_LENGTH * unit, BROW_THICKNESS * taper * unit, BROW_THICKNESS * taper * unit)
      // Everything above is measured in world space; the group hangs off the
      // model, which carries the actor's normalising scale.
      segment.position.copy(model.worldToLocal(new THREE.Vector3(x, y, surface + FACE_FORWARD * BROW_PROUD_OF_FACE)))
      brows.add(segment)
    }
  }
  if (brows.children.length === 0) return

  model.add(brows)
  model.updateMatrixWorld(true)
  head.attach(brows)
}

/**
 * Paints the socket off the skin.
 *
 * The MakeHuman skin has a dark eye socket painted into it — that is how these
 * heads fake an eye without having one. It is wider than any opening that can
 * be cut for an eyeball, because the eyeball has to be wider than its hole and
 * the hole has to stay inside the eyeball's silhouette. So whatever is left of
 * that paint frames the eye in exactly the shade it was drawn to suggest, and
 * the subject arrives with dark circles.
 *
 * It is removed at the source instead: the triangles around the eye hand over
 * their UVs, and that patch of the texture is filled with the skin colour
 * sampled from just outside it, fading out at the edges so it blends. Almost
 * all of it ends up behind the eyeball anyway — this is only about what shows
 * around the rim.
 */
function paintOverSocket(model: THREE.Object3D, anchor: THREE.Vector3) {
  const point = new THREE.Vector3()
  const painted = new Set<THREE.Texture>()
  model.updateMatrixWorld(true)

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const skin = materials.find((material) => isActorSkin(material)) as THREE.MeshPhysicalMaterial | undefined
    const map = skin?.map
    const image = map?.image as (CanvasImageSource & { width: number; height: number }) | undefined
    if (!skin || !map || !image?.width || painted.has(map)) return
    const position = child.geometry.getAttribute('position')
    const uv = child.geometry.getAttribute('uv')
    const index = child.geometry.getIndex()
    if (!position || !uv || !index) return

    // Wider than the opening, because the paint is wider than the opening.
    const halfWidth = EYE_APERTURE_HALF_WIDTH * SOCKET_PAINT_SPREAD
    const halfHeight = EYE_APERTURE_HALF_HEIGHT * SOCKET_PAINT_SPREAD
    const boxes = new Map<number, { u0: number; v0: number; u1: number; v1: number }>()

    for (let i = 0; i < index.count; i += 1) {
      const vertex = index.getX(i)
      point.fromBufferAttribute(position as THREE.BufferAttribute, vertex).applyMatrix4(child.matrixWorld)
      if (point.z * FACE_FORWARD < anchor.z * FACE_FORWARD) continue
      for (const side of [-1, 1] as const) {
        const dx = (point.x - (anchor.x + side * EYE_HALF_SEPARATION)) / halfWidth
        const dy = (point.y - anchor.y) / halfHeight
        if (dx * dx + dy * dy > 1) continue
        const u = uv.getX(vertex)
        const v = uv.getY(vertex)
        const box = boxes.get(side)
        if (!box) boxes.set(side, { u0: u, v0: v, u1: u, v1: v })
        else {
          box.u0 = Math.min(box.u0, u); box.u1 = Math.max(box.u1, u)
          box.v0 = Math.min(box.v0, v); box.v1 = Math.max(box.v1, v)
        }
      }
    }
    if (boxes.size === 0) return

    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)

    for (const box of boxes.values()) {
      // glTF textures are not flipped, so v runs down the image.
      const x0 = box.u0 * canvas.width
      const x1 = box.u1 * canvas.width
      const y0 = box.v0 * canvas.height
      const y1 = box.v1 * canvas.height
      const cx = (x0 + x1) / 2
      const cy = (y0 + y1) / 2
      const rx = Math.max(2, (x1 - x0) / 2)
      const ry = Math.max(2, (y1 - y0) / 2)

      // The skin to fill with, read from a ring outside the patch.
      const margin = Math.max(3, Math.round(Math.max(rx, ry) * 0.45))
      const sx = Math.max(0, Math.round(cx - rx - margin))
      const sy = Math.max(0, Math.round(cy - ry - margin))
      const sw = Math.min(canvas.width - sx, Math.round((rx + margin) * 2))
      const sh = Math.min(canvas.height - sy, Math.round((ry + margin) * 2))
      const sample = context.getImageData(sx, sy, sw, sh).data
      let r = 0; let g = 0; let b = 0; let n = 0
      for (let y = 0; y < sh; y += 1) {
        for (let x = 0; x < sw; x += 1) {
          const insideX = Math.abs(sx + x - cx) < rx
          const insideY = Math.abs(sy + y - cy) < ry
          if (insideX && insideY) continue
          const at = (y * sw + x) * 4
          r += sample[at]; g += sample[at + 1]; b += sample[at + 2]; n += 1
        }
      }
      if (n === 0) continue
      const fill = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`

      const spread = Math.max(rx, ry) * 1.18
      const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, spread)
      gradient.addColorStop(0, fill)
      gradient.addColorStop(0.72, fill)
      gradient.addColorStop(1, fill.replace('rgb(', 'rgba(').replace(')', ',0)'))
      context.save()
      context.translate(cx, cy)
      context.scale(1, ry / rx)
      context.translate(-cx, -cy)
      context.fillStyle = gradient
      context.beginPath()
      context.arc(cx, cy, spread, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }

    const replacement = new THREE.CanvasTexture(canvas)
    replacement.colorSpace = map.colorSpace
    replacement.flipY = map.flipY
    replacement.wrapS = map.wrapS
    replacement.wrapT = map.wrapT
    replacement.anisotropy = map.anisotropy
    replacement.needsUpdate = true
    painted.add(map)
    materials.forEach((material) => {
      if (isActorSkin(material)) (material as THREE.MeshPhysicalMaterial).map = replacement
    })
  })
}

/**
 * Cuts an eye opening in a closed face.
 *
 * These heads have no sockets — the only boundary loop in the whole head is
 * the neck, and the eyes are painted onto solid geometry. That leaves nowhere
 * to put an eyeball: sunk to a believable depth it is inside the skull and
 * invisible, and raised until it shows it reads as a ball glued to a cheek.
 *
 * So an opening is made. Every triangle whose centre falls inside an almond at
 * the eye, on the front half of the head, is dropped from the index buffer.
 * The eyeball then sits behind the hole the way a real one sits behind a lid,
 * and the geometry left around the opening is the lid.
 */
/**
 * Subdivides the skin around the eyes before the aperture is cut.
 *
 * The cut drops whole triangles, so the hole it makes is only ever as precise
 * as the mesh it is cutting. On these faces the triangles around the eye are
 * about four millimetres across and the opening is twenty-two by nine, which
 * means the ellipse gets quantised into a blob nearly as tall as it is wide —
 * and a round hole in front of a round ball shows the whole white sphere. The
 * lids have to clip the ball into an almond, and they cannot do that until the
 * mesh can describe an almond.
 *
 * Midpoint subdivision, three levels, only on triangles touching the eye. A
 * midpoint sits exactly on its edge, so a refined triangle beside an unrefined
 * one leaves no crack — the extra vertex is simply unused by the neighbour.
 */
function refineEyeRegion(model: THREE.Object3D, anchor: THREE.Vector3, levels = 3) {
  const point = new THREE.Vector3()
  model.updateMatrixWorld(true)
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    if (!materials.some((material) => isActorSkin(material))) return
    const geometry = child.geometry
    const index = geometry.getIndex()
    const positionAttribute = geometry.getAttribute('position')
    if (!index || !(positionAttribute instanceof THREE.BufferAttribute)) return

    const names: string[] = []
    const sizes = new Map<string, number>()
    const arrays = new Map<string, number[]>()
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      if (!(attribute instanceof THREE.BufferAttribute)) return
      names.push(name)
      sizes.set(name, attribute.itemSize)
      arrays.set(name, Array.from(attribute.array as ArrayLike<number>))
    }
    const position = arrays.get('position')!

    // Wide enough that the boundary between refined and coarse skin falls
    // clear of the aperture and the socket paint, tight enough that the face
    // does not carry six times its triangles for a cut a centimetre across.
    const reach = 1.5
    const touchesEye = (vertex: number) => {
      point.set(position[vertex * 3], position[vertex * 3 + 1], position[vertex * 3 + 2]).applyMatrix4(child.matrixWorld)
      if (point.z * FACE_FORWARD < anchor.z * FACE_FORWARD - EYE_RADIUS) return false
      for (const side of [-1, 1] as const) {
        const dx = (point.x - (anchor.x + side * EYE_HALF_SEPARATION)) / (EYE_APERTURE_HALF_WIDTH * reach)
        const dy = (point.y - anchor.y) / (EYE_APERTURE_HALF_HEIGHT * reach)
        if (dx * dx + dy * dy <= 1) return true
      }
      return false
    }

    let count = positionAttribute.count
    const midpoints = new Map<string, number>()
    const midpoint = (from: number, to: number) => {
      const key = from < to ? `${from}:${to}` : `${to}:${from}`
      const known = midpoints.get(key)
      if (known !== undefined) return known
      const vertex = count
      count += 1
      for (const name of names) {
        const size = sizes.get(name)!
        const array = arrays.get(name)!
        for (let lane = 0; lane < size; lane += 1) {
          // Bone assignments are not numbers to average — but every vertex in
          // this region is bound to the head, so either end will do.
          array[vertex * size + lane] = name === 'skinIndex'
            ? array[from * size + lane]
            : (array[from * size + lane] + array[to * size + lane]) / 2
        }
      }
      const normal = arrays.get('normal')
      if (normal) {
        const length = Math.hypot(normal[vertex * 3], normal[vertex * 3 + 1], normal[vertex * 3 + 2]) || 1
        for (let lane = 0; lane < 3; lane += 1) normal[vertex * 3 + lane] /= length
      }
      const weight = arrays.get('skinWeight')
      if (weight) {
        const size = sizes.get('skinWeight')!
        let total = 0
        for (let lane = 0; lane < size; lane += 1) total += weight[vertex * size + lane]
        if (total > 1e-6) for (let lane = 0; lane < size; lane += 1) weight[vertex * size + lane] /= total
      }
      midpoints.set(key, vertex)
      return vertex
    }

    let triangles = Array.from(index.array as ArrayLike<number>)
    let split = 0
    for (let level = 0; level < levels; level += 1) {
      const next: number[] = []
      for (let i = 0; i < triangles.length; i += 3) {
        const [x, y, z] = [triangles[i], triangles[i + 1], triangles[i + 2]]
        if (!touchesEye(x) && !touchesEye(y) && !touchesEye(z)) { next.push(x, y, z); continue }
        const xy = midpoint(x, y)
        const yz = midpoint(y, z)
        const zx = midpoint(z, x)
        next.push(x, xy, zx, xy, y, yz, zx, yz, z, xy, yz, zx)
        split += 1
      }
      triangles = next
    }
    if (split === 0) return

    for (const name of names) {
      const attribute = geometry.getAttribute(name) as THREE.BufferAttribute
      const Typed = attribute.array.constructor as new (values: number[]) => THREE.TypedArray
      geometry.setAttribute(name, new THREE.BufferAttribute(new Typed(arrays.get(name)!), sizes.get(name)!, attribute.normalized))
    }
    geometry.setIndex(triangles)
    geometry.computeBoundingSphere()
  })
}

function cutEyeApertures(model: THREE.Object3D, anchor: THREE.Vector3) {
  const centre = new THREE.Vector3()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  let removed = 0
  model.updateMatrixWorld(true)
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    if (!materials.some((material) => isActorSkin(material))) return
    const position = child.geometry.getAttribute('position')
    const index = child.geometry.getIndex()
    if (!position || !index) return

    const inAperture = (point: THREE.Vector3) => {
      if (point.z * FACE_FORWARD < anchor.z * FACE_FORWARD) return false
      for (const side of [-1, 1] as const) {
        const dx = (point.x - (anchor.x + side * EYE_HALF_SEPARATION)) / EYE_APERTURE_HALF_WIDTH
        const dy = (point.y - anchor.y) / EYE_APERTURE_HALF_HEIGHT
        if (dx * dx + dy * dy <= 1) return true
      }
      return false
    }

    const kept: number[] = []
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position as THREE.BufferAttribute, index.getX(i)).applyMatrix4(child.matrixWorld)
      b.fromBufferAttribute(position as THREE.BufferAttribute, index.getX(i + 1)).applyMatrix4(child.matrixWorld)
      c.fromBufferAttribute(position as THREE.BufferAttribute, index.getX(i + 2)).applyMatrix4(child.matrixWorld)
      centre.copy(a).add(b).add(c).multiplyScalar(1 / 3)
      if (inAperture(centre)) { removed += 1; continue }
      kept.push(index.getX(i), index.getX(i + 1), index.getX(i + 2))
    }
    if (removed > 0) child.geometry.setIndex(kept)
  })
  return removed
}

/**
 * The eye, drawn rather than assembled.
 *
 * It used to be five primitives stacked a tenth of a millimetre apart — a
 * sclera ball, an iris disc, a limbus ring, a pupil and a glass cornea. At
 * portrait size that read as a black goggle around a white button: the ring
 * was a hard drawn circle, and the cornea's refraction washed the iris out to
 * grey whatever colour it was set to.
 *
 * One ball with one texture instead. A sphere's UVs run pole to rim, so a
 * texture drawn as horizontal bands wraps into concentric rings — pupil, iris,
 * limbus, sclera, in order, from the top of the canvas outward. Vertical
 * streaks in the same canvas become radial fibres in the iris, which is what
 * stops it reading as a flat disc of colour.
 */
/**
 * Bands down the eyeball, as a fraction of pole-to-pole: v * 180 is the polar
 * angle from the pupil, so the iris edge sits at sin(38 deg) * EYE_RADIUS.
 *
 * The ball is larger than life so that a nearly flush cornea still covers a
 * real-sized opening, so these angles are wound back to suit: 22.8 degrees on
 * a 16 mm sphere is a 12.4 mm iris, which is life size. Taller than the
 * opening, so the lids clip it top and bottom and leave white only at the
 * corners — which is what a real eye does.
 */
const EYE_BANDS = {
  pupil: 0.040,
  pupilEdge: 0.052,
  iris: 0.127,
  limbus: 0.140,
}

function createEyeTexture(irisColor: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')!
  const iris = new THREE.Color(irisColor).convertLinearToSRGB()
  const shade = (mix: number) => {
    const c = iris.clone()
    c.lerp(new THREE.Color(mix > 0 ? 1 : 0, mix > 0 ? 1 : 0, mix > 0 ? 1 : 0), Math.min(0.95, Math.abs(mix)))
    return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`
  }
  const row = (from: number, to: number, fill: string) => {
    context.fillStyle = fill
    context.fillRect(0, Math.round(from * 256), 256, Math.ceil((to - from) * 256) + 1)
  }

  row(0, 1, '#e9e4d9')
  // Veining and shadow toward the back of the ball, which never shows but
  // keeps the edge of the visible white from reading as flat paint.
  // Only the front third of the ball is ever outside the lid, so the shading
  // that turns the back of it away starts well past the visible sclera.
  const rim = context.createLinearGradient(0, 0.46 * 256, 0, 256)
  rim.addColorStop(0, 'rgba(150,138,126,0)')
  rim.addColorStop(1, 'rgba(96,84,74,0.7)')
  context.fillStyle = rim
  context.fillRect(0, Math.round(0.46 * 256), 256, 256)

  row(EYE_BANDS.iris, EYE_BANDS.limbus, shade(-0.4))
  row(EYE_BANDS.pupilEdge, EYE_BANDS.iris, shade(-0.04))
  for (let x = 0; x < 256; x += 2) {
    const mix = ((x * 2654435761) % 1000) / 1000
    context.strokeStyle = shade(mix > 0.5 ? 0.22 * (mix - 0.5) * 2 : -0.34 * (0.5 - mix) * 2)
    context.lineWidth = 1.6
    context.beginPath()
    context.moveTo(x, EYE_BANDS.pupilEdge * 256)
    context.lineTo(x + (mix - 0.5) * 5, EYE_BANDS.iris * 256)
    context.stroke()
  }
  const ring = context.createLinearGradient(0, (EYE_BANDS.iris - 0.022) * 256, 0, (EYE_BANDS.limbus + 0.012) * 256)
  ring.addColorStop(0, 'rgba(20,14,10,0)')
  ring.addColorStop(0.5, 'rgba(20,14,10,0.72)')
  ring.addColorStop(1, 'rgba(20,14,10,0)')
  context.fillStyle = ring
  context.fillRect(0, Math.round((EYE_BANDS.iris - 0.022) * 256), 256, Math.ceil(0.06 * 256))
  row(0, EYE_BANDS.pupil, '#08090a')
  const pupilEdge = context.createLinearGradient(0, EYE_BANDS.pupil * 256, 0, EYE_BANDS.pupilEdge * 256)
  pupilEdge.addColorStop(0, 'rgba(8,9,10,1)')
  pupilEdge.addColorStop(1, 'rgba(8,9,10,0)')
  context.fillStyle = pupilEdge
  context.fillRect(0, Math.round(EYE_BANDS.pupil * 256), 256, Math.ceil(0.02 * 256) + 1)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

function addStudioEyes(model: THREE.Group, head: THREE.Bone, box: THREE.Box3, headPosition: THREE.Vector3, eyeColor: string, hairColor: string) {
  const eyes = new THREE.Group()
  eyes.name = 'studio-eyeballs'
  const geometry = new THREE.SphereGeometry(EYE_RADIUS, 44, 32)
  const material = new THREE.MeshPhysicalMaterial({
    map: createEyeTexture(eyeColor),
    roughness: 0.14,
    metalness: 0,
    // A full-strength coat on a ball this small spreads the key's reflection
    // across the whole iris; half of it still reads wet and leaves the colour.
    clearcoat: 0.5,
    clearcoatRoughness: 0.05,
    // The cornea should return a small catchlight from the key, not a sheet of
    // sky. At 0.55 the environment reflected off a ball this smooth sat over
    // the whole iris and turned every eye colour the same grey.
    envMapIntensity: 0.18,
  })
  // Named so the appearance pass can re-tint the iris when the control moves.
  material.name = ACTOR_IRIS_MATERIAL
  material.userData.irisColor = eyeColor

  for (const side of [-1, 1] as const) {
    const eye = new THREE.Group()
    eye.position.x = side * EYE_HALF_SEPARATION
    const ball = new THREE.Mesh(geometry, material)
    // The texture's pole is the pupil; tip it to face the lens.
    ball.rotation.x = Math.PI / 2
    // Neither: a shadow cast onto a ball sitting in a hole lands as a dark
    // crescent along the lid, which is the bruise this is trying to avoid.
    ball.castShadow = false
    ball.receiveShadow = false
    eye.add(ball)
    eyes.add(eye)
  }

  // Every eye constant is in world metres, because the aperture is cut in world
  // space off the measured face. The group is built under the model, though,
  // which carries a normalising scale — 1.125 on the shipped pair — so without
  // this the balls come out an eighth oversized and three and a half
  // millimetres too far apart, each one sitting off-centre in its own hole.
  eyes.scale.setScalar(1 / (model.scale.x || 1))

  const surface = measureEyeSurface(model, box.max.y)
  const anchor = studioEyeAnchor(surface ?? headPosition.z - 0.12, box.max.y, headPosition.x, box.max.y - headPosition.y)
  // attachHeadDetail converts the anchor in place, so the brows get their own.
  // Placed before the eyes are attached, because attachHeadDetail converts
  // the anchor to model space in place.
  addStudioBrows(model, head, anchor.clone(), hairColor)
  refineEyeRegion(model, anchor)
  paintOverSocket(model, anchor)
  cutEyeApertures(model, anchor)
  attachHeadDetail(model, head, eyes, anchor)
}

/**
 * An imported GLB, driven by the same pose rig as the built-in figure.
 *
 * The skeleton is mapped once on load; after that a pose change writes straight
 * onto the bones. If the file has no recognisable humanoid skeleton the model
 * still renders — it just stands in its rest pose, and the inspector says so.
 */
function ImportedModel({ url, pose: poseOverride, lookAtCamera: lookAtCameraOverride, appearance: appearanceOverride, reportStatus = true, onRigReady }: {
  url: string
  pose?: ModelPose
  lookAtCamera?: boolean
  /** A standalone figure carries its own look; the main subject reads the store. */
  appearance?: FigureAppearance
  reportStatus?: boolean
  onRigReady?: (map: BoneMap | null) => void
}) {
  const [object, setObject] = useState<THREE.Group | null>(null)
  const setStatus = useStudio((state) => state.setModelImportStatus)
  const setRigStatus = useStudio((state) => state.setModelRigStatus)
  const mainPose = useStudio((state) => state.modelPose)
  const mainLookAtCamera = useStudio((state) => state.modelLookAtCamera)
  const eyesAtCamera = useStudio((state) => state.modelEyesAtCamera)
  const cameraPosition = useStudio((state) => state.cameraPosition)
  const modelPosition = useStudio((state) => state.modelPosition)
  const modelRotation = useStudio((state) => state.modelRotation)
  const mainSkinRoughness = useStudio((state) => state.skinRoughness)
  const mainSkinOil = useStudio((state) => state.skinOil)
  const mainSubsurface = useStudio((state) => state.skinSubsurface)
  const mainMakeup = useStudio((state) => state.makeupStyle)
  const mainEyeColor = useStudio((state) => state.eyeColor)
  const mainHairColor = useStudio((state) => state.hairColor)
  const mainHairGloss = useStudio((state) => state.hairGloss)
  const mainOutfitFabric = useStudio((state) => state.outfitFabric)
  const mainPhysique = useStudio((state) => state.physique)
  const mainHairStyle = useStudio((state) => state.hairStyle)
  const mainOutfitStyle = useStudio((state) => state.outfitStyle)
  const rig = useRef<{ map: BoneMap; rest: RestPose; restFootY: number; baseY: number } | null>(null)
  // The scalp shell as it came off disk, kept so a style change can rebuild it
  // without fetching the actor again.
  const hairSource = useRef<{ model: THREE.Group; head: THREE.Bone; source: THREE.Group } | null>(null)
  const pose = poseOverride ?? mainPose
  const lookAtCamera = lookAtCameraOverride ?? mainLookAtCamera

  // Every extra subject used to render with the main subject's hair colour,
  // because that was the only appearance value this component read.
  const appearance: FigureAppearance = useMemo(() => appearanceOverride ?? {
    skinRoughness: mainSkinRoughness,
    skinOil: mainSkinOil,
    subsurface: mainSubsurface,
    makeup: mainMakeup,
    eyeColor: mainEyeColor,
    hairColor: mainHairColor,
    hairGloss: mainHairGloss,
    outfitFabric: mainOutfitFabric,
    physique: mainPhysique,
    hairStyle: mainHairStyle,
    outfit: mainOutfitStyle,
  }, [appearanceOverride, mainEyeColor, mainHairColor, mainHairGloss, mainHairStyle, mainMakeup, mainOutfitFabric, mainOutfitStyle, mainPhysique, mainSkinOil, mainSkinRoughness, mainSubsurface])
  // The loader must not restart when a slider moves, so it reads the current
  // look through a ref and a separate effect keeps the live materials in step.
  const appearanceRef = useRef(appearance)
  appearanceRef.current = appearance

  useEffect(() => {
    let active = true
    let loadedObject: THREE.Group | null = null
    // A physique or wardrobe change may point at a different shipped actor.
    // Do not keep rendering the previous actor while that file loads. The
    // stage stays empty until the selected GLB is ready, so neither the old
    // procedural figure nor a previously selected actor flashes on screen.
    setObject(null)
    if (reportStatus) setStatus('loading')
    const loader = new GLTFLoader()
    loader.load(url, (gltf) => {
      if (!active) return
      const model = clone(gltf.scene) as THREE.Group
      const shippedHuman = url.includes('/models/lumen-human/')
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true
          child.receiveShadow = true
          // Skinned meshes are usually authored with a bounding box for the rest
          // pose only; without this they vanish the moment a limb moves out of it.
          if ((child as THREE.SkinnedMesh).isSkinnedMesh) child.frustumCulled = false
          if (shippedHuman) {
            // Skin and cloth are re-hosted on MeshPhysical and then treated
            // apart. One blanket pass over every material gave a cheek and a
            // shoe the same answer, and pinned skin to a single roughness.
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            const upgraded = materials.map((material) => {
              if (!(material instanceof THREE.MeshStandardMaterial)) return material
              const physical = material instanceof THREE.MeshPhysicalMaterial ? material : toActorPhysical(material)
              if (physical !== material) material.dispose()
              if (isActorSkin(physical)) applyActorSkin(physical, appearanceRef.current)
              else applyActorGarment(physical, appearanceRef.current.outfitFabric)
              return physical
            })
            child.material = upgraded.length === 1 ? upgraded[0] : upgraded
          }
        }
      })
      const initialBox = new THREE.Box3().setFromObject(model)
      const size = initialBox.getSize(new THREE.Vector3())
      if (!Number.isFinite(size.y) || size.y <= 0) {
        if (reportStatus) setStatus('error')
        return
      }
      const scale = 1.82 / size.y
      model.scale.setScalar(scale)
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      model.position.set(-center.x, -box.min.y, -center.z)
      model.updateMatrixWorld(true)

      const map = mapSkeleton(model)
      const quality = mappingQuality(map)

      // The licensed MakeHuman studio model intentionally ships without hair
      // or separate eyeball meshes. Add both as head-bone details.
      if (shippedHuman && map.head) {
        const normalizedBox = new THREE.Box3().setFromObject(model)
        const headPosition = map.head.getWorldPosition(new THREE.Vector3())
        addStudioEyes(model, map.head, normalizedBox, headPosition, appearanceRef.current.eyeColor, appearanceRef.current.hairColor)
        new OBJLoader().load(STUDIO_HAIR_SOURCE_URL, (hair) => {
          if (!active) {
            hair.traverse((child) => {
              if (!(child instanceof THREE.Mesh)) return
              child.geometry.dispose()
              const materials = Array.isArray(child.material) ? child.material : [child.material]
              materials.forEach((material) => material.dispose())
            })
            return
          }
          hairSource.current = { model, head: map.head!, source: hair }
          addStudioHair(model, map.head!, hair.clone(true), appearanceRef.current.hairColor, appearanceRef.current.hairGloss, appearanceRef.current.hairStyle)
        })
      }

      // This source is authored in a wide A-stance with straight arms and flat,
      // splayed hands — a modelling pose, not a standing one, and not the pose
      // the library measures from either. Every pose an actor is given is a
      // delta from whatever rest is captured next, so if that rest is not the
      // rig's own neutral stance, every delta lands somewhere else: a hand
      // aimed at a hip arrived at the sternum, and the further the pose asked
      // the arm to travel the further off it finished.
      //
      // So the arms are aimed rather than nudged. Forward kinematics says where
      // the rig's neutral puts this actor's elbow and wrist; each arm bone is
      // turned until it points that way, and the rest pose captured below is
      // then the neutral the deltas are written against, by construction.
      if (shippedHuman) {
        const neutral = forwardKinematics(NEUTRAL_POSE, appearanceRef.current.physique)
        const aim = (bone: THREE.Bone | undefined, from: THREE.Vector3, to: THREE.Vector3) => {
          if (!bone) return
          const direction = boneDirection(bone)
          if (!direction) return
          const wanted = to.clone().sub(from).normalize()
          if (wanted.lengthSq() < 1e-8) return
          const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
          const desiredWorld = bone.getWorldQuaternion(new THREE.Quaternion())
          desiredWorld.premultiply(new THREE.Quaternion().setFromUnitVectors(direction, wanted))
          bone.quaternion.copy(parentWorld.invert()).multiply(desiredWorld)
          model.updateMatrixWorld(true)
        }
        aim(map.leftUpperArm, neutral.leftShoulder, neutral.leftElbow)
        aim(map.leftLowerArm, neutral.leftElbow, neutral.leftWrist)
        aim(map.rightUpperArm, neutral.rightShoulder, neutral.rightElbow)
        aim(map.rightLowerArm, neutral.rightElbow, neutral.rightWrist)
        // Aiming fixes where a bone points, not how it is rolled about its own
        // length. A forearm still has to pronate or the palms face the lens.
        const roll = (bone: THREE.Bone | undefined, degrees: number) => {
          if (!bone) return
          const along = boneDirection(bone)
          if (!along) return
          const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
          const desiredWorld = bone.getWorldQuaternion(new THREE.Quaternion())
          desiredWorld.premultiply(new THREE.Quaternion().setFromAxisAngle(along, THREE.MathUtils.degToRad(degrees)))
          bone.quaternion.copy(parentWorld.invert()).multiply(desiredWorld)
          model.updateMatrixWorld(true)
        }
        roll(map.leftLowerArm, -REST_FOREARM_ROLL)
        roll(map.rightLowerArm, REST_FOREARM_ROLL)
      }

      const footY = (bone: THREE.Bone | undefined) => bone
        ? model.worldToLocal(bone.getWorldPosition(new THREE.Vector3())).y
        : Number.POSITIVE_INFINITY
      const restFootY = Math.min(footY(map.leftFoot), footY(map.rightFoot))
      rig.current = quality.usable ? {
        map,
        rest: captureRestPose(model, map),
        restFootY: Number.isFinite(restFootY) ? restFootY : 0,
        baseY: model.position.y,
      } : null
      onRigReady?.(quality.usable ? map : null)
      if (reportStatus) setRigStatus(quality.usable ? 'rigged' : 'unrigged')

      loadedObject = model
      setObject(model)
      if (reportStatus) setStatus('ready')
    }, undefined, () => {
      if (active) {
        if (reportStatus) { setStatus('error'); setRigStatus('none') }
      }
    })

    return () => {
      active = false
      rig.current = null
      hairSource.current = null
      onRigReady?.(null)
      if (reportStatus) setRigStatus('none')
      if (loadedObject) {
        loadedObject.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          child.geometry?.dispose()
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          materials.forEach((material) => material.dispose())
        })
      }
    }
  }, [onRigReady, reportStatus, setRigStatus, setStatus, url])

  // A hairstyle is geometry, not a material, so it cannot ride the appearance
  // pass — the shell has to be thrown away and refitted. Rebuilt from the copy
  // kept at load rather than by fetching the actor again, which is why the
  // control can now do something on a shipped subject at all: for nine styles
  // there is one mesh, and eight of them used to render the ninth.
  useEffect(() => {
    const held = hairSource.current
    if (!object || !held || held.model !== object) return
    const existing = object.getObjectByName('studio-short04-hair')
    if (existing) {
      existing.removeFromParent()
      existing.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        child.geometry.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((material) => material.dispose())
      })
    }
    addStudioHair(held.model, held.head, held.source.clone(true), appearance.hairColor, appearance.hairGloss, appearance.hairStyle)
  }, [appearance.hairColor, appearance.hairGloss, appearance.hairStyle, object])

  // Skin, cloth, hair and iris all update live, without reloading the actor or
  // rebuilding its rig. The hair arrives on its own schedule, so this runs
  // again once the object it is parented to changes.
  useEffect(() => {
    if (!object) return
    applyActorAppearance(object, appearance)
  }, [appearance, object])


  // The imported figure gets the same head-tracking behaviour as the built-in one.
  const cameraYaw = THREE.MathUtils.radToDeg(Math.atan2(cameraPosition[0] - modelPosition[0], cameraPosition[2] - modelPosition[2]) - modelRotation)
  const effectivePose = useMemo(
    () => lookAtCamera ? { ...pose, headYaw: THREE.MathUtils.clamp(cameraYaw, -72, 72) } : pose,
    [cameraYaw, lookAtCamera, pose],
  )

  // Eyes track the lens independently of the head — chin down, eyes up — the
  // same as the procedural figure. Until now the actor's eyeballs never moved,
  // and eyes that never move are most of what reads as "not a person".
  const gazeYaw = !poseOverride && eyesAtCamera
    ? THREE.MathUtils.clamp(cameraYaw - effectivePose.headYaw, -35, 35)
    : effectivePose.gazeYaw
  const gazePitch = !poseOverride && eyesAtCamera ? -effectivePose.headTilt : effectivePose.gazePitch

  useEffect(() => {
    const eyes = object?.getObjectByName('studio-eyeballs')
    if (!eyes) return
    // The eye looks down +Z, the same way the rig faces, so a positive turn
    // about Y swings the gaze toward +X — which is the sense the pose values
    // are authored in — and a positive turn about X drops it.
    eyes.children.forEach((eye) => {
      eye.rotation.set(THREE.MathUtils.degToRad(gazePitch), THREE.MathUtils.degToRad(gazeYaw), 0)
    })
  }, [gazePitch, gazeYaw, object])

  useEffect(() => {
    if (!object || !rig.current) return
    const stanceSplay = THREE.MathUtils.radToDeg(Math.atan2(effectivePose.stanceWidth / 2 - 0.083, 0.865))
    object.position.y = rig.current.baseY + effectivePose.rootLift
    applyPoseToSkeleton(object, rig.current.map, rig.current.rest, effectivePose, stanceSplay)
    applyExpressionToMorphs(object, effectivePose)
    object.updateMatrixWorld(true)
    if (!effectivePose.airborne && !isSeatedPose(effectivePose)) {
      const footY = (bone: THREE.Bone | undefined) => bone
        ? object.worldToLocal(bone.getWorldPosition(new THREE.Vector3())).y
        : Number.POSITIVE_INFINITY
      const posedFootY = Math.min(footY(rig.current.map.leftFoot), footY(rig.current.map.rightFoot))
      if (Number.isFinite(posedFootY)) object.position.y += (rig.current.restFootY - posedFootY) * object.scale.y
      object.updateMatrixWorld(true)
    }
  }, [effectivePose, object])

  if (object) return <primitive object={object} rotation={url.includes('/models/lumen-human/') ? [0, 0, 0] : undefined} />
  return null
}

function Mannequin() {
  const horizontalLayoutOnly = useContext(HorizontalLayoutContext)
  const canControl = useWorkflow((state) => canControlInWorkflow(state.stage, 'person'))
  const layoutOnly = useWorkflow((state) => workflowModeForStage(state.stage) === 'layout')
  const selectObject = useStudio((state) => state.selectObject)
  const position = useStudio((state) => state.modelPosition)
  const rotation = useStudio((state) => state.modelRotation)
  const selected = useStudio((state) => state.selected === 'model')
  const transformMode = useStudio((state) => state.transformMode)
  const view = useStudio((state) => state.view)
  const setModelTransform = useStudio((state) => state.setModelTransform)
  const modelAssetUrl = useStudio((state) => state.modelAssetUrl)
  const modelHeight = useStudio((state) => state.modelHeight)
  const modelPose = useStudio((state) => state.modelPose)
  const physique = useStudio((state) => state.physique)
  const outfitStyle = useStudio((state) => state.outfitStyle)
  const updateModelPose = useStudio((state) => state.updateModelPose)
  const poseHandles = useStudio((state) => state.poseHandles)
  const modelRigStatus = useStudio((state) => state.modelRigStatus)
  const activeModelUrl = modelAssetUrl ?? shippedHumanFor(physique, outfitStyle)
  const seatHeight = useSeatHeight(position)
  const seatedLift = isSeatedPose(modelPose) ? seatHeight ?? 0.46 : 0
  const group = useRef<THREE.Group>(null)
  const [boneMap, setBoneMap] = useState<BoneMap | null>(null)
  const transformControl = useRef<TransformControlsImpl>(null)
  // An imported model with no recognised skeleton cannot be posed, so it gets
  // no handles rather than handles that quietly do nothing.
  const effectiveTransformMode = layoutOnly ? 'translate' : transformMode
  const showHandles = !layoutOnly && canControl && poseHandles && selected && view !== 'camera' && modelRigStatus === 'rigged'
  // TransformControls owns the group while it is being dragged. Stable tuple
  // identities keep unrelated store renders from writing the old coordinates
  // back into the group between pointer events, which presented as shaking.
  const renderedPosition = useMemo<[number, number, number]>(
    () => [position[0], position[1] + seatedLift, position[2]],
    [position, seatedLift],
  )
  const renderedRotation = useMemo<[number, number, number]>(() => [0, rotation, 0], [rotation])

  const model = (
    <group ref={group} position={renderedPosition} rotation={renderedRotation} scale={modelHeight / 1.82} onClick={(event) => { event.stopPropagation(); if (canControl) selectObject('model') }}>
      <ImportedModel url={activeModelUrl} onRigReady={setBoneMap} />
      {showHandles && (
        <PoseRig
          pose={modelPose}
          physique={physique}
          seatHeight={seatHeight}
          groupRef={group}
          boneMap={boneMap}
          onChange={updateModelPose}
        />
      )}
    </group>
  )

  if (!canControl || !selected || view === 'camera') return model

  return (
    <>
      {model}
      <TransformControls
        ref={transformControl}
        object={group as RefObject<THREE.Object3D>}
        mode={effectiveTransformMode}
        size={0.72}
        translationSnap={0.05}
        rotationSnap={THREE.MathUtils.degToRad(5)}
        showY={!horizontalLayoutOnly}
        showX={effectiveTransformMode === 'translate'}
        showZ={!horizontalLayoutOnly && effectiveTransformMode === 'translate'}
        onMouseUp={() => {
          if (!group.current) return
          const nextPosition: [number, number, number] = [
            Number(group.current.position.x.toFixed(2)),
            Number(Math.min(3, Math.max(0, group.current.position.y - seatedLift)).toFixed(2)),
            Number(group.current.position.z.toFixed(2)),
          ]
          setModelTransform(nextPosition, group.current.rotation.y, effectiveTransformMode === 'translate' ? activeTransformAxis(transformControl.current) : undefined)
        }}
      />
    </>
  )
}

/** A standalone person, seated on whatever furniture it happens to be over. */
function StandaloneFigure({ object }: { object: StudioObject }) {
  const seatHeight = useSeatHeight(object.position)
  const seatedLift = isSeatedPose(object.subjectPose) ? seatHeight ?? 0.46 : 0
  const poseHandles = useStudio((state) => state.poseHandles)
  const selected = useStudio((state) => state.selected === object.id)
  const view = useStudio((state) => state.view)
  const updateStudioSubjectPose = useStudio((state) => state.updateStudioSubjectPose)
  const group = useRef<THREE.Group>(null)
  const [boneMap, setBoneMap] = useState<BoneMap | null>(null)
  return (
    <group ref={group} position={[0, seatedLift, 0]} scale={object.subjectHeight / 1.82}>
      {poseHandles && selected && view !== 'camera' && (
        <PoseRig
          pose={object.subjectPose}
          physique={object.subjectPhysique}
          seatHeight={seatHeight}
          groupRef={group}
          boneMap={boneMap}
          onChange={(patch) => updateStudioSubjectPose(object.id, patch)}
        />
      )}
      <ImportedModel
        url={shippedHumanFor(object.subjectPhysique, object.subjectOutfitStyle)}
        pose={object.subjectPose}
        lookAtCamera={false}
        appearance={{
          skinRoughness: object.subjectSkinRoughness,
          skinOil: object.subjectSkinOil,
          subsurface: object.subjectSubsurface,
          makeup: object.subjectMakeup,
          eyeColor: object.subjectEyeColor,
          hairColor: object.subjectHairColor,
          hairGloss: object.subjectHairGloss,
          outfitFabric: object.subjectOutfitFabric,
          physique: object.subjectPhysique,
          hairStyle: object.subjectHairStyle,
          outfit: object.subjectOutfitStyle,
        }}
        reportStatus={false}
        onRigReady={setBoneMap}
      />
    </group>
  )
}

/**
 * What a prop is actually made of.
 *
 * The finish control says matte, glossy or metal. It does not say whether the
 * thing is an oak table or a ceramic bottle, and running both through one flat
 * material is the cheapest tell in a render: every surface breaks its highlight
 * the same way, so nothing has a material — only a colour. So the type picks
 * the grain and the finish grades it.
 *
 * The maps come from the shared cache in textures.ts and are owned by it. They
 * are never disposed here and their repeat is never touched, because the
 * backdrop is holding the same instances.
 */
function createPropMaterial(type: SceneObjectType, color: string, finish: SceneObjectMaterial) {
  const metal = finish === 'metal'
  const glossy = finish === 'glossy'
  // How much of the type's grain survives the finish: a lacquered table still
  // has grain under the lacquer, a machined one does not.
  const grain = metal ? 0.35 : glossy ? 0.55 : 1
  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: metal ? 0.86 : 0.02,
    roughness: metal ? 0.24 : glossy ? 0.17 : 0.7,
    clearcoat: glossy ? 0.7 : 0.05,
    clearcoatRoughness: glossy ? 0.07 : 0.3,
    // See NEUTRAL_ENVIRONMENT_INTENSITY: the shine is bought here, per material,
    // rather than by turning the probe up on everything in the room.
    envMapIntensity: metal ? 3.4 : glossy ? 2 : 1,
  })

  if (type === 'chair' || type === 'table') {
    // Timber. The grain runs, so a raking light finds a direction on it.
    material.normalMap = woodNormalMap()
    material.normalScale = new THREE.Vector2(0.62 * grain, 0.62 * grain)
    if (!metal) material.roughness = glossy ? 0.2 : 0.6
    material.sheen = 0
  } else if (type === 'dog' || type === 'cat') {
    // A coat, which is velvet as far as a renderer is concerned: dense fine
    // normals plus a strong sheen, so a backlight rims it instead of skimming
    // straight past. Fur that does not rim is the reason a plastic-looking pet
    // stays plastic-looking however you light it.
    material.normalMap = fabricNormalMap('velvet')
    material.normalScale = new THREE.Vector2(0.55 * grain, 0.55 * grain)
    material.roughnessMap = fabricRoughnessMap('velvet')
    if (!metal) material.roughness = 0.92
    material.clearcoat = 0
    material.sheen = 0.75
    material.sheenRoughness = 0.55
    material.sheenColor = new THREE.Color(color).lerp(new THREE.Color('#fff2df'), 0.55)
  } else if (type === 'product') {
    // Glazed ceramic: the coat is the whole look, so it stays smooth under it.
    material.clearcoat = metal ? 0.2 : 1
    material.clearcoatRoughness = 0.05
    if (!metal) material.roughness = glossy ? 0.09 : 0.4
    material.ior = 1.5
    material.specularIntensity = 1
  } else if (type === 'plinth' || type === 'cube') {
    // Painted board. Flat colour on a large flat prop is the one place a
    // renderer shows its seams, so the paint varies in roughness, not in hue.
    material.normalMap = plasterNormalMap()
    material.normalScale = new THREE.Vector2(0.24 * grain, 0.24 * grain)
    material.roughnessMap = mottleMap()
  }
  // A sphere is left smooth on purpose: it is the scene's reference ball, and
  // a reference ball with a texture on it stops being a reference.

  return material
}

function StudioObjectMesh({ object }: { object: StudioObject }) {
  const material = useMemo(
    () => createPropMaterial(object.type, object.color, object.material),
    [object.color, object.material, object.type],
  )
  useEffect(() => () => material.dispose(), [material])
  if (object.type === 'subject') return <StandaloneFigure object={object} />
  if (object.type === 'dog') return <group>
    {/* Four legs, not two. A quadruped proxy is in the scene to cast a
        believable shadow and to give the key light something at floor level to
        wrap around; a two-legged one does neither. */}
    <mesh castShadow receiveShadow position={[0, 0.44, 0.04]} scale={[0.72, 0.6, 1.08]} material={material}><capsuleGeometry args={[0.24, 0.36, 10, 28]} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.42, -0.3]} scale={[0.7, 0.68, 0.66]} material={material}><sphereGeometry args={[0.26, 32, 22]} /></mesh>
    {/* Brisket. A dog's chest hangs below the ribcage and forward of the
        forelegs, and it is the mass a low key light actually finds first. */}
    <mesh castShadow receiveShadow position={[0, 0.37, 0.22]} scale={[0.62, 0.68, 0.72]} material={material}><sphereGeometry args={[0.23, 28, 20]} /></mesh>
    <mesh castShadow position={[0, 0.58, 0.28]} rotation={[-0.5, 0, 0]} scale={[0.85, 1, 0.85]} material={material}><capsuleGeometry args={[0.12, 0.16, 8, 20]} /></mesh>
    <mesh castShadow position={[0, 0.69, 0.4]} scale={[0.9, 0.88, 1]} material={material}><sphereGeometry args={[0.22, 32, 22]} /></mesh>
    <mesh castShadow position={[0, 0.625, 0.6]} scale={[0.72, 0.56, 1.05]} material={material}><sphereGeometry args={[0.155, 28, 20]} /></mesh>
    {/* Lower jaw, set back under the muzzle. */}
    <mesh castShadow position={[0, 0.575, 0.575]} scale={[0.6, 0.34, 0.86]} material={material}><sphereGeometry args={[0.145, 24, 16]} /></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh castShadow position={[side * 0.155, 0.83, 0.38]} rotation={[0.18, 0, side * 0.32]} material={material}><coneGeometry args={[0.1, 0.26, 18]} /></mesh>
      {/* Foreleg: upper, lower, paw. */}
      <mesh castShadow receiveShadow position={[side * 0.16, 0.3, 0.24]} material={material}><capsuleGeometry args={[0.056, 0.2, 8, 18]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.16, 0.12, 0.245]} material={material}><capsuleGeometry args={[0.042, 0.16, 8, 16]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.16, 0.038, 0.275]} scale={[1, 0.6, 1.25]} material={material}><sphereGeometry args={[0.06, 20, 14]} /></mesh>
      {/* Hind leg: the thigh is the heavier mass, which is what reads at a glance. */}
      <mesh castShadow receiveShadow position={[side * 0.17, 0.33, -0.24]} material={material}><capsuleGeometry args={[0.078, 0.16, 8, 20]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.17, 0.13, -0.245]} material={material}><capsuleGeometry args={[0.042, 0.15, 8, 16]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.17, 0.038, -0.215]} scale={[1, 0.6, 1.25]} material={material}><sphereGeometry args={[0.06, 20, 14]} /></mesh>
      <mesh position={[side * 0.09, 0.72, 0.575]}><sphereGeometry args={[0.026, 14, 10]} /><meshPhysicalMaterial color="#17130f" roughness={0.1} clearcoat={0.9} /></mesh>
    </group>)}
    <mesh position={[0, 0.62, 0.735]}><sphereGeometry args={[0.043, 16, 12]} /><meshPhysicalMaterial color="#17130f" roughness={0.18} clearcoat={0.65} /></mesh>
    {/* Tail. A torus of constant section reads as a hoop, so the tail is drawn
        as tapering segments along its arc — thick at the root, thin at the tip,
        which is the only part of it a rim light ever finds. */}
    {([
      [[0, 0.47, -0.46], [0.03, 0.61, -0.6], 0.05, 1.15],
      [[0.03, 0.61, -0.6], [0.06, 0.75, -0.63], 0.036, 1.2],
      [[0.06, 0.75, -0.63], [0.09, 0.86, -0.56], 0.024, 1.25],
    ] as const).map(([from, to, radius, taper], index) => (
      <Strut key={index} from={[...from]} to={[...to]} radius={radius} taper={taper} material={material} segments={14} />
    ))}
    <mesh castShadow position={[0.09, 0.87, -0.55]} scale={[1, 1.2, 1]} material={material}><sphereGeometry args={[0.024, 16, 12]} /></mesh>
    <mesh position={[0, 0.55, 0.24]} rotation={[1.2, 0, 0]}><torusGeometry args={[0.14, 0.018, 10, 28]} /><meshStandardMaterial color="#8c3b34" roughness={0.72} /></mesh>
  </group>
  if (object.type === 'cat') return <group>
    <mesh castShadow receiveShadow position={[0, 0.34, -0.06]} scale={[0.62, 0.78, 0.86]} material={material}><sphereGeometry args={[0.27, 32, 22]} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.4, 0.14]} scale={[0.56, 0.62, 0.6]} material={material}><sphereGeometry args={[0.24, 30, 20]} /></mesh>
    {/* The ruff, which is where a cat's head stops and its shoulders start. */}
    <mesh castShadow position={[0, 0.53, 0.14]} scale={[0.72, 0.42, 0.7]} material={material}><sphereGeometry args={[0.2, 26, 18]} /></mesh>
    <mesh castShadow position={[0, 0.62, 0.14]} scale={[0.95, 0.88, 0.9]} material={material}><sphereGeometry args={[0.21, 32, 22]} /></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh castShadow position={[side * 0.125, 0.8, 0.12]} rotation={[0, 0, side * -0.14]} material={material}><coneGeometry args={[0.1, 0.23, 16]} /></mesh>
      <mesh position={[side * 0.075, 0.655, 0.32]} rotation={[0, side * 0.12, 0]} scale={[1.3, 0.72, 0.5]}><sphereGeometry args={[0.033, 14, 10]} /><meshPhysicalMaterial color="#a9d06e" roughness={0.1} clearcoat={0.9} /></mesh>
      {/* Foreleg. */}
      <mesh castShadow receiveShadow position={[side * 0.105, 0.24, 0.15]} material={material}><capsuleGeometry args={[0.04, 0.12, 8, 16]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.105, 0.09, 0.155]} material={material}><capsuleGeometry args={[0.031, 0.1, 8, 14]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.105, 0.028, 0.175]} scale={[1, 0.6, 1.2]} material={material}><sphereGeometry args={[0.045, 18, 12]} /></mesh>
      {/* Hind leg. */}
      <mesh castShadow receiveShadow position={[side * 0.115, 0.26, -0.18]} material={material}><capsuleGeometry args={[0.06, 0.1, 8, 18]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.115, 0.09, -0.185]} material={material}><capsuleGeometry args={[0.031, 0.1, 8, 14]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.115, 0.028, -0.16]} scale={[1, 0.6, 1.2]} material={material}><sphereGeometry args={[0.045, 18, 12]} /></mesh>
    </group>)}
    <mesh position={[0, 0.575, 0.325]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.025, 0.038, 3]} /><meshStandardMaterial color="#a66f72" roughness={0.6} /></mesh>
    <mesh castShadow receiveShadow position={[0.11, 0.38, -0.3]} rotation={[0.15, 0.15, -0.42]} material={material}><torusGeometry args={[0.3, 0.026, 16, 48, Math.PI * 1.45]} /></mesh>
  </group>
  if (object.type === 'product') return <group>
    <RoundedBox castShadow receiveShadow args={[0.38, 0.12, 0.38]} radius={0.035} smoothness={3} position={[0, 0.06, 0]} material={material} />
    {/* Bottle, built as body then shoulder then neck then cap. A straight
        cylinder gives a key light no shoulder to run down, and the shoulder is
        the shot. */}
    <mesh castShadow receiveShadow position={[0, 0.31, 0]} material={material}><cylinderGeometry args={[0.148, 0.16, 0.38, 48]} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.545, 0]} material={material}><cylinderGeometry args={[0.074, 0.148, 0.09, 48]} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.625, 0]} material={material}><cylinderGeometry args={[0.07, 0.074, 0.07, 32]} /></mesh>
    {/* Cap: a machined collar with a knurl, and a shoulder ring under it. The
        cap is the one hard specular on the whole prop, so it is the thing a
        product light is aimed to place. */}
    <mesh castShadow receiveShadow position={[0, 0.705, 0]}><cylinderGeometry args={[0.086, 0.086, 0.09, 64]} /><meshStandardMaterial color="#4a4f47" metalness={0.86} roughness={0.19} envMapIntensity={1.4} /></mesh>
    <mesh castShadow position={[0, 0.752, 0]}><cylinderGeometry args={[0.082, 0.086, 0.012, 64]} /><meshStandardMaterial color="#565c53" metalness={0.9} roughness={0.13} envMapIntensity={1.5} /></mesh>
    {([0.682, 0.705, 0.728] as const).map((y) => (
      <mesh key={y} position={[0, y, 0]}><torusGeometry args={[0.0862, 0.0035, 10, 64]} /><meshStandardMaterial color="#2f342e" metalness={0.7} roughness={0.36} /></mesh>
    ))}
    <mesh position={[0, 0.596, 0]}><torusGeometry args={[0.0755, 0.0055, 10, 56]} /><meshStandardMaterial color="#4a4f47" metalness={0.82} roughness={0.24} /></mesh>
    {/* The label wraps the bottle, so it curves through the highlight — and it
        is paper, which is the whole reason it does not mirror the key back. */}
    <mesh receiveShadow position={[0, 0.31, 0]}>
      <cylinderGeometry args={[0.1535, 0.1595, 0.19, 64, 1, true]} />
      <meshPhysicalMaterial
        color="#f3efe5"
        roughness={0.78}
        normalMap={paperNormalMap()}
        normalScale={new THREE.Vector2(0.35, 0.35)}
        sheen={0.25}
        sheenRoughness={0.8}
        side={THREE.DoubleSide}
      />
    </mesh>
    <mesh position={[0, 0.352, 0]}>
      <cylinderGeometry args={[0.1547, 0.1553, 0.016, 64, 1, true]} />
      <meshStandardMaterial color="#3f433e" roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
    {/* A foil rule under the wordmark. Small, but it is the only thing on the
        bottle that throws a moving highlight as the key swings. */}
    <mesh position={[0, 0.268, 0]}>
      <cylinderGeometry args={[0.1547, 0.1553, 0.006, 64, 1, true]} />
      <meshStandardMaterial color="#b79a5c" metalness={0.88} roughness={0.18} envMapIntensity={1.5} side={THREE.DoubleSide} />
    </mesh>
  </group>
  // Seat and table tops land exactly on the heights in layout.ts, so a figure
  // placed on one sits on the surface instead of a centimetre inside it.
  if (object.type === 'chair') return <>
    <RoundedBox castShadow receiveShadow args={[0.7, 0.1, 0.64]} radius={0.03} smoothness={5} position={[0, 0.49, 0]} material={material} />
    <RoundedBox castShadow receiveShadow args={[0.72, 0.055, 0.66]} radius={0.018} smoothness={4} position={[0, 0.418, 0]} material={material} />
    {/* The back starts above the seat, not on it. The gap is what your eye
        reads as a chair rather than as a block with a slab behind it. */}
    <RoundedBox castShadow receiveShadow args={[0.62, 0.48, 0.075]} radius={0.035} smoothness={5} position={[0, 0.91, 0.302]} rotation={[-0.11, 0, 0]} material={material} />
    <RoundedBox castShadow receiveShadow args={[0.66, 0.07, 0.085]} radius={0.033} smoothness={5} position={[0, 1.166, 0.332]} rotation={[-0.11, 0, 0]} material={material} />
    {/* Legs splay. Drawn between two known ends so the feet stay on the floor
        whatever the splay, which is exactly what four independently placed
        cylinders could not promise. */}
    {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sz], index) => (
      <group key={index}>
        <Strut
          from={[sx * 0.247, 0.4, sz * 0.221]}
          to={[sx * 0.302, 0, sz * 0.27]}
          radius={0.021}
          taper={1.6}
          material={material}
          segments={16}
        />
        <mesh castShadow position={[sx * 0.302, 0.006, sz * 0.27]}>
          <cylinderGeometry args={[0.026, 0.028, 0.012, 14]} />
          <meshStandardMaterial color="#1a1c1a" roughness={0.9} />
        </mesh>
      </group>
    ))}
    {/* Stretchers — the bars that stop a chair racking, and the detail that
        separates a chair from four sticks under a slab. They meet the legs on
        the splay, so they land on the taper rather than floating beside it. */}
    {([-1, 1] as const).map((sx) => (
      <Strut key={sx} from={[sx * 0.281, 0.15, -0.252]} to={[sx * 0.281, 0.15, 0.252]} radius={0.015} material={material} />
    ))}
    <Strut from={[-0.281, 0.15, 0]} to={[0.281, 0.15, 0]} radius={0.015} material={material} />
    {/* Back uprights, carrying the panel down to the seat frame. */}
    {([-0.28, 0.28] as const).map((x) => (
      <Strut key={x} from={[x, 0.42, 0.268]} to={[x * 0.98, 1.19, 0.345]} radius={0.019} material={material} segments={14} />
    ))}
  </>
  if (object.type === 'table') return <>
    <RoundedBox castShadow receiveShadow args={[1.38, 0.06, 0.78]} radius={0.018} smoothness={5} position={[0, 0.85, 0]} material={material} />
    <RoundedBox castShadow receiveShadow args={[1.33, 0.035, 0.73]} radius={0.012} smoothness={4} position={[0, 0.807, 0]} material={material} />
    {/* Apron on both axes. One rail across the middle was holding nothing. */}
    {([-0.32, 0.32] as const).map((z) => (
      <mesh key={z} castShadow receiveShadow position={[0, 0.755, z]} material={material}><boxGeometry args={[1.16, 0.09, 0.036]} /></mesh>
    ))}
    {([-0.6, 0.6] as const).map((x) => (
      <mesh key={x} castShadow receiveShadow position={[x, 0.755, 0]} material={material}><boxGeometry args={[0.036, 0.09, 0.6]} /></mesh>
    ))}
    {([[-0.6, -0.32], [0.6, -0.32], [-0.6, 0.32], [0.6, 0.32]] as const).map(([x, z], index) => (
      <group key={index}>
        {/* Thick at the rail, thin at the floor. It was turned upside down. */}
        <mesh castShadow receiveShadow position={[x, 0.385, z]} material={material}><cylinderGeometry args={[0.047, 0.03, 0.77, 20]} /></mesh>
        <mesh castShadow position={[x, 0.008, z]}><cylinderGeometry args={[0.05, 0.052, 0.016, 16]} /><meshStandardMaterial color="#1a1c1a" roughness={0.9} /></mesh>
      </group>
    ))}
  </>
  if (object.type === 'plinth') return <group>
    <mesh castShadow receiveShadow position={[0, 0.028, 0]} material={material}><cylinderGeometry args={[0.5, 0.52, 0.055, 56]} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.55, 0]} material={material}><cylinderGeometry args={[0.42, 0.46, 0.995, 56]} /></mesh>
    <mesh castShadow receiveShadow position={[0, 1.074, 0]} material={material}><cylinderGeometry args={[0.46, 0.42, 0.052, 56]} /></mesh>
    <mesh position={[0, 1.1, 0]} material={material}><torusGeometry args={[0.448, 0.014, 10, 56]} /></mesh>
  </group>
  // The reference ball, and the reference block. Both get read for the shape of
  // a highlight, so both get enough segments to hold one without stepping.
  if (object.type === 'sphere') return <mesh castShadow receiveShadow material={material}><sphereGeometry args={[0.5, 72, 48]} /></mesh>
  return <RoundedBox castShadow receiveShadow args={[0.82, 0.82, 0.82]} radius={0.05} smoothness={6} material={material} />
}

function MovableStudioObject({ object }: { object: StudioObject }) {
  const horizontalLayoutOnly = useContext(HorizontalLayoutContext)
  const canControl = useWorkflow((state) => canControlInWorkflow(state.stage, object.type === 'subject' ? 'person' : 'set'))
  const layoutOnly = useWorkflow((state) => workflowModeForStage(state.stage) === 'layout')
  const selected = useStudio((state) => state.selected === object.id)
  const selectObject = useStudio((state) => state.selectObject)
  const view = useStudio((state) => state.view)
  const transformMode = useStudio((state) => state.transformMode)
  const setTransform = useStudio((state) => state.setStudioObjectTransform)
  const group = useRef<THREE.Group>(null)
  const transformControl = useRef<TransformControlsImpl>(null)
  const outlineSize: [number, number, number] = object.type === 'subject' ? [0.95, object.subjectHeight + 0.12, 0.65] : object.type === 'dog' ? [0.85, 1, 1.15] : object.type === 'cat' ? [0.65, 0.95, 0.75] : object.type === 'product' ? [0.55, 0.8, 0.55] : object.type === 'table' ? [1.5, 1, 0.9] : object.type === 'chair' ? [0.85, 1.4, 0.8] : object.type === 'plinth' ? [1, 1.25, 1] : [1, 1, 1]
  const yOffset = object.type === 'subject' ? object.subjectHeight / 2 : object.type === 'dog' ? 0.45 : object.type === 'cat' ? 0.42 : object.type === 'product' ? 0.35 : object.type === 'table' ? 0.45 : object.type === 'chair' ? 0.65 : object.type === 'plinth' ? 0.55 : 0
  const content = <group ref={group} position={object.position} rotation={[0, object.rotationY, 0]} scale={object.type === 'subject' ? 1 : object.scale} onClick={(event) => { event.stopPropagation(); if (canControl) selectObject(object.id) }}>
    <StudioObjectMesh object={object} />
    {canControl && selected && view !== 'camera' && <mesh position={[0, yOffset, 0]}><boxGeometry args={outlineSize} /><meshBasicMaterial color={object.locked ? '#ff8b62' : '#d8ff3e'} wireframe transparent opacity={0.48} /></mesh>}
  </group>
  const effectiveTransformMode = layoutOnly ? 'translate' : transformMode
  return <>{content}{canControl && selected && view !== 'camera' && !object.locked && <TransformControls ref={transformControl} object={group as RefObject<THREE.Object3D>} mode={effectiveTransformMode} size={0.7} translationSnap={0.05} rotationSnap={THREE.MathUtils.degToRad(5)} showX={effectiveTransformMode === 'translate'} showY={!horizontalLayoutOnly} showZ={!horizontalLayoutOnly && effectiveTransformMode === 'translate'} onMouseUp={() => {
    if (!group.current) return
    setTransform(object.id, [Number(group.current.position.x.toFixed(2)), Number(Math.max(0, group.current.position.y).toFixed(2)), Number(group.current.position.z.toFixed(2))], Number(group.current.rotation.y.toFixed(3)), effectiveTransformMode === 'translate' ? activeTransformAxis(transformControl.current) : undefined)
  }} />}</>
}

/**
 * The gear palette.
 *
 * Studio hardware is genuinely black, and rendered literally it disappears: a
 * stand in an unlit corner becomes a silhouette with no shape in it. Real gear
 * still reads, because anodised aluminium and textured paint catch a specular
 * off whatever source is running. So the housings sit at a graphite value with
 * enough metalness to pick up a highlight, and the hardware around them —
 * speed rings, fins, mounts, risers — is left bright aluminium.
 */
const GEAR = {
  /** Painted housing: dark, but with a value you can see a form change in. */
  housing: { color: '#5d655e', metalness: 0.34, roughness: 0.52, envMapIntensity: 1.15, lift: 0.5 },
  /** Fabric-covered shells — flatter, one stop below the housings. */
  fabric: { color: '#4a514c', metalness: 0.12, roughness: 0.8, envMapIntensity: 0.9, lift: 0.42 },
  /** Bare aluminium: speed rings, stand sections, lens mounts. */
  aluminium: { color: '#9aa199', metalness: 0.86, roughness: 0.28, envMapIntensity: 1.35, lift: 0.58 },
  /** Machined bright work: knobs, collars, shoes. */
  chrome: { color: '#b9c0b7', metalness: 0.92, roughness: 0.17, envMapIntensity: 1.5, lift: 0.62 },
  /** Rubber and textured grip — the one place that is meant to stay dark. */
  rubber: { color: '#3a3e3f', metalness: 0.04, roughness: 0.92, envMapIntensity: 0.5, lift: 0.3 },
} as const

type GearSurface = (typeof GEAR)[keyof typeof GEAR]

/**
 * Whether gear should be lit for the eye or for the sensor.
 *
 * In the working views the studio is a viewport: you are placing hardware, and
 * hardware you cannot see is hardware you cannot place — a stand whose only
 * light comes from a key aimed the other way is a correct black silhouette and
 * a useless one. Through the taking lens, and in a path-traced frame, it is a
 * photograph again, so the lift goes to zero and the gear falls back to
 * whatever the lights actually put on it.
 */
function useGearLift() {
  const view = useStudio((state) => state.view)
  const renderMode = useStudio((state) => state.renderMode)
  return view === 'camera' || renderMode === 'path' ? 0 : 1
}

/** Material props for a gear surface at the current viewport lift. */
function gearMaterial(surface: GearSurface, lift: number) {
  const { lift: base, ...rest } = surface
  return { ...rest, emissive: rest.color, emissiveIntensity: base * lift }
}

/**
 * A cylinder laid between two points.
 *
 * Rigging is mostly tubes between two known ends — a stand arm, a leg, a
 * spreader — and writing each one as a position plus a pair of Euler angles is
 * how they end up subtly detached from the thing they are supposed to hold.
 */
function Strut({ from, to, radius, surface = GEAR.aluminium, color, material, taper = 1, cast = true, gear = true, segments = 12 }: {
  from: [number, number, number]
  to: [number, number, number]
  radius: number
  surface?: GearSurface
  /** Overrides the surface colour for set dressing that is not studio hardware. */
  color?: string
  /** Set dressing shares the prop's own material rather than a gear finish. */
  material?: THREE.Material
  taper?: number
  cast?: boolean
  gear?: boolean
  segments?: number
}) {
  const lift = useGearLift()
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...from)
    const end = new THREE.Vector3(...to)
    const direction = end.clone().sub(start)
    const span = Math.max(0.001, direction.length())
    return {
      position: start.clone().addScaledVector(direction, 0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
      length: span,
    }
    // Deps are the endpoints' numbers, not the array literals the caller inlines.
  }, [from[0], from[1], from[2], to[0], to[1], to[2]])
  return (
    <mesh castShadow={cast} receiveShadow position={position} quaternion={quaternion} material={material}>
      <cylinderGeometry args={[radius * taper, radius, length, segments]} />
      {!material && <meshStandardMaterial {...gearMaterial(surface, gear ? lift : 0)} {...(color ? { color, emissive: color } : {})} />}
    </mesh>
  )
}

/**
 * A three-section light stand.
 *
 * The riser telescopes and the legs hinge off the bottom section, which is what
 * makes a stand read as a stand rather than as a pole: the silhouette a stand
 * throws on a backdrop is legs first, column second.
 */
function LightStand({ height, footprint = 0.4 }: { height: number; footprint?: number }) {
  const lift = useGearLift()
  const columnTop = Math.max(0.35, height)
  const hinge = Math.min(0.58, columnTop * 0.6)
  const foot = 0.018
  const spread = footprint
  const legTilt = Math.atan2(spread, foot - hinge)
  const legLength = Math.hypot(spread, hinge - foot)
  const sections: Array<[number, number, number]> = [
    [0.02, columnTop * 0.44, 0.031],
    [columnTop * 0.40, columnTop * 0.76, 0.024],
    [columnTop * 0.72, columnTop, 0.018],
  ]
  return (
    <group>
      {sections.map(([bottom, top, radius], index) => (
        <group key={index}>
          <mesh castShadow receiveShadow position={[0, (bottom + top) / 2, 0]}>
            <cylinderGeometry args={[radius, radius, top - bottom, 14]} />
            <meshStandardMaterial {...gearMaterial(GEAR.aluminium, lift)} />
          </mesh>
          {/* The collar that clamps the section above it. */}
          {index < sections.length - 1 && (
            <mesh castShadow position={[0, top - 0.012, 0]}>
              <cylinderGeometry args={[radius * 1.5, radius * 1.5, 0.045, 16]} />
              <meshStandardMaterial {...gearMaterial(GEAR.housing, lift)} />
            </mesh>
          )}
        </group>
      ))}
      {/* Leg hub. */}
      <mesh castShadow position={[0, hinge, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.075, 16]} />
        <meshStandardMaterial {...gearMaterial(GEAR.housing, lift)} />
      </mesh>
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((azimuth) => (
        <group key={azimuth} rotation={[0, azimuth, 0]}>
          <mesh castShadow receiveShadow position={[0, (hinge + foot) / 2, spread / 2]} rotation={[legTilt, 0, 0]}>
            <cylinderGeometry args={[0.011, 0.016, legLength, 10]} />
            <meshStandardMaterial {...gearMaterial(GEAR.aluminium, lift)} />
          </mesh>
          {/* A rubber foot, which is the part that actually touches the floor. */}
          <mesh castShadow position={[0, foot, spread]}>
            <cylinderGeometry args={[0.026, 0.03, 0.03, 12]} />
            <meshStandardMaterial {...gearMaterial(GEAR.rubber, lift)} />
          </mesh>
        </group>
      ))}
      {/* Spigot and tilt knuckle at the top. */}
      <mesh castShadow position={[0, columnTop + 0.03, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.07, 12]} />
        <meshStandardMaterial {...gearMaterial(GEAR.chrome, lift)} />
      </mesh>
    </group>
  )
}

function Softbox({ light }: { light: StudioLight }) {
  const horizontalLayoutOnly = useContext(HorizontalLayoutContext)
  const canControl = useWorkflow((state) => canControlInWorkflow(state.stage, 'light'))
  const layoutOnly = useWorkflow((state) => workflowModeForStage(state.stage) === 'layout')
  const lift = useGearLift()
  const { id: lightId, position, temperature, shape, grid: gridEnabled, colorMode, rgb, enabled } = light
  const gel = getGel(light.gelId)
  const softboxEnabled = light.optic === 'softbox'
  const areaModifier = ['softbox', 'umbrella-shoot', 'umbrella-reflect', 'beauty-dish', 'deep-parabolic', 'lantern'].includes(light.optic)
  // Shadow resolution follows the quality preset. A soft source needs the extra
  // texels less than a hard one, but a hard one is where acne shows first.
  const shadowQuality = useStudio((state) => state.qualityPreset)
  const shadowMapSize = shadowQuality === 'performance' ? 512 : shadowQuality === 'ultra' ? 2048 : 1024
  const selectObject = useStudio((state) => state.selectObject)
  const selected = useStudio((state) => state.selectedIds.includes(lightId))
  const primary = useStudio((state) => state.selected === lightId)
  const view = useStudio((state) => state.view)
  const renderMode = useStudio((state) => state.renderMode)
  const soloLightId = useStudio((state) => state.soloLightId)
  const setLightPosition = useStudio((state) => state.setLightPosition)
  const setLightTarget = useStudio((state) => state.setLightTarget)
  const aimMode = useStudio((state) => state.lightAimMode)
  const transformMode = useStudio((state) => state.transformMode)
  const shutter = useStudio((state) => state.shutter)
  const syncSpeed = useStudio((state) => state.syncSpeed)
  const iesUrl = useStudio((state) => state.iesUrl)
  const target = useMemo(() => new THREE.Object3D(), [])
  const aimPivot = useMemo(() => new THREE.Object3D(), [])
  const visual = useRef<THREE.Group>(null)
  const rig = useRef<THREE.Group>(null)
  const transformControl = useRef<TransformControlsImpl>(null)
  const spot = useRef<(THREE.SpotLight & { radius?: number; iesMap?: THREE.Texture | null })>(null)
  const [iesTexture, setIesTexture] = useState<THREE.Texture | null>(null)
  /** Source colour after the gel: correction gels shift the temperature, effect gels tint what is left. */
  const color = useMemo(() => {
    const base = colorMode === 'rgb' ? new THREE.Color(rgb) : kelvinColor(geledTemperature(temperature, gel))
    const [r, g, b] = applyGelTint([base.r, base.g, base.b], gel)
    return new THREE.Color(r, g, b)
  }, [colorMode, gel, rgb, temperature])
  const goboTexture = useMemo(() => createGoboTexture(light.optic === 'projection' ? light.goboPattern : 'none', light.goboRotation, light.goboScale), [light.goboPattern, light.goboRotation, light.goboScale, light.optic])
  const outputLumens = captureLightOutput(light, shutter, syncSpeed)
  const fixtureScale = useMemo<[number, number, number]>(() => {
    const modifierScale = areaModifier ? 1 : light.headType === 'panel' ? 0.62 : 0.36
    return [light.modifierWidth / 1.12 * modifierScale, light.modifierHeight / 1.12 * modifierScale, 1]
  }, [areaModifier, light.headType, light.modifierHeight, light.modifierWidth])
  // Cross-section radii for the fixture shell. A four-sided cylinder is a
  // truncated pyramid, so the square boxes and the round ones share one taper.
  const fixtureDepth = light.headType === 'panel' ? 0.16 : light.headType === 'strobe' ? 0.46 : 0.58
  const frontRadius = shape === 'round' ? 0.64 : 0.884
  const backRadius = light.headType === 'panel' ? frontRadius * 0.94 : frontRadius * 0.3
  const sourceRadius = areaModifier
    ? Math.max(light.modifierWidth, light.modifierHeight) * (shape === 'strip' ? 0.28 : 0.44)
    : light.headType === 'panel' ? Math.max(light.modifierWidth, light.modifierHeight) * 0.22 : 0.025
  const beamAngle = THREE.MathUtils.degToRad(light.beamAngle / 2)
  const penumbra = THREE.MathUtils.clamp((light.feather / 100) * (gridEnabled ? 0.55 : areaModifier ? 1 : 0.45), 0, 1)
  const effectiveEnabled = enabled && (!soloLightId || soloLightId === lightId)
  const effectiveAimMode = !layoutOnly && aimMode
  const effectiveTransformMode = layoutOnly ? 'translate' : transformMode
  const showLayoutGuide = layoutOnly && enabled && view !== 'camera'
  const guideColor = primary ? '#d8ff3e' : '#67d8ff'
  /**
   * The shadow camera, fitted to what this head can actually reach.
   *
   * A fixed 12 m frustum spends most of its depth precision on empty room and
   * still clips the backdrop shadow when a light is set far back, so near and
   * far are cut to the throw. The distance cutoff is dropped entirely: the
   * meter models pure inverse-square falloff, and a render that stops the light
   * dead at 12 m disagrees with the reading the tool just gave you.
   */
  const throwDistance = Math.max(
    0.8,
    Math.hypot(position[0] - light.target[0], position[1] - light.target[1], position[2] - light.target[2]),
  )
  const shadowNear = THREE.MathUtils.clamp(throwDistance * 0.16, 0.15, 1.2)
  const shadowFar = THREE.MathUtils.clamp(throwDistance * 2.6, 7, 30)
  const standOffset = useMemo<[number, number]>(() => {
    const awayX = position[0] - light.target[0]
    const awayZ = position[2] - light.target[2]
    const length = Math.max(0.001, Math.hypot(awayX, awayZ))
    const clearance = Math.max(0.32, Math.min(0.58, Math.max(light.modifierWidth, light.modifierHeight) * 0.42))
    return [awayX / length * clearance, awayZ / length * clearance]
  }, [light.modifierHeight, light.modifierWidth, light.target, position])

  useEffect(() => {
    target.position.set(...light.target)
    aimPivot.position.set(...position)
    aimPivot.lookAt(...light.target)
    if (spot.current) spot.current.radius = sourceRadius
  }, [aimPivot, light.target, position, sourceRadius, target])

  useEffect(() => () => goboTexture?.dispose(), [goboTexture])
  useEffect(() => {
    if (!iesUrl) { setIesTexture(null); return }
    let active = true
    let loadedTexture: THREE.Texture | null = null
    new IESLoader().load(iesUrl, (texture) => { if (active) { loadedTexture = texture; setIesTexture(texture) } else texture.dispose() })
    return () => { active = false; loadedTexture?.dispose() }
  }, [iesUrl])
  useEffect(() => { if (spot.current) spot.current.iesMap = iesTexture }, [iesTexture])

  useEffect(() => {
    visual.current?.lookAt(...light.target)
  }, [light.target, position])

  const softbox = (
    <group ref={rig} position={position} onClick={(event) => { event.stopPropagation(); if (canControl) selectObject(lightId, Boolean((event.nativeEvent as PointerEvent).shiftKey)) }}>
      <spotLight
        ref={spot}
        position={[0, 0, 0]} target={target} color={color} intensity={effectiveEnabled ? outputLumens / (renderMode === 'path' ? PATHTRACE_CANDELA_SCALE : PREVIEW_CANDELA_SCALE) : 0}
        map={goboTexture ?? undefined}
        angle={beamAngle} penumbra={penumbra} decay={2} distance={0} castShadow
        shadow-mapSize-width={shadowMapSize} shadow-mapSize-height={shadowMapSize}
        shadow-bias={-0.00012}
        shadow-normalBias={0.035}
        shadow-camera-near={shadowNear}
        shadow-camera-far={shadowFar}
        shadow-radius={areaModifier ? THREE.MathUtils.clamp(Math.max(light.modifierWidth, light.modifierHeight) * 2.4, 1.2, 4) : 0.7}
      />
      <group ref={visual} scale={fixtureScale}>
        {/*
          The box tapers.

          A softbox is a truncated pyramid pulled over a speed ring, not a slab:
          the taper is why a light three-quarters behind a subject shows an edge
          rather than a rectangle, and it is the whole silhouette on a plan view.
          Panels stay shallow and flat, because that is what a panel is.
        */}
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh castShadow receiveShadow position={[0, -fixtureDepth / 2, 0]} rotation={[0, shape === 'round' ? 0 : Math.PI / 4, 0]}>
            <cylinderGeometry args={[frontRadius, backRadius, fixtureDepth, shape === 'round' ? 48 : 4, 1, true]} />
            <meshStandardMaterial {...gearMaterial(GEAR.fabric, lift)} side={THREE.DoubleSide} />
          </mesh>
          {/* Piping around the front edge. On real gear it is the reflective
              trim that catches the room and draws the box's outline. */}
          <mesh position={[0, 0.004, 0]} rotation={[0, shape === 'round' ? 0 : Math.PI / 4, 0]}>
            <cylinderGeometry args={[frontRadius * 1.012, frontRadius, 0.05, shape === 'round' ? 48 : 4, 1, true]} />
            <meshStandardMaterial {...gearMaterial(GEAR.aluminium, lift)} side={THREE.DoubleSide} />
          </mesh>
          {/* Speed ring: the collar the fabric pulls onto. */}
          <mesh castShadow position={[0, -fixtureDepth - 0.01, 0]}>
            <cylinderGeometry args={[backRadius * 1.06, backRadius * 1.06, 0.055, 28]} />
            <meshStandardMaterial {...gearMaterial(GEAR.aluminium, lift)} />
          </mesh>
          {/* Lamp head behind the ring — barrel along the throw, not upright. */}
          <mesh castShadow receiveShadow position={[0, -fixtureDepth - 0.19, 0]}>
            <cylinderGeometry args={[0.16, 0.2, 0.34, 24]} />
            <meshStandardMaterial {...gearMaterial(GEAR.housing, lift)} />
          </mesh>
          {/* Pilot lamp: green when the head is live, dark when it is not. */}
          <mesh position={[0.145, -fixtureDepth - 0.12, 0.115]}>
            <sphereGeometry args={[0.017, 12, 10]} />
            <meshStandardMaterial
              color={effectiveEnabled ? '#8ef2a4' : '#2c322d'}
              emissive={effectiveEnabled ? '#4fe07a' : '#000000'}
              emissiveIntensity={effectiveEnabled ? 2.4 : 0}
              toneMapped={false}
            />
          </mesh>
          {/* Cooling fins, so the back of the head is not a blank cylinder. */}
          {[0.06, 0.12, 0.18].map((offset) => (
            <mesh key={offset} castShadow position={[0, -fixtureDepth - 0.19 - offset, 0]}>
              <cylinderGeometry args={[0.205, 0.205, 0.012, 24]} />
              <meshStandardMaterial {...gearMaterial(GEAR.aluminium, lift)} />
            </mesh>
          ))}
        </group>
        <mesh position={[0, 0, 0.001]}>
          {shape === 'round' ? <circleGeometry args={[0.57, 48]} /> : <planeGeometry args={[1.12, 1.12]} />}
          <meshStandardMaterial color={effectiveEnabled ? color : '#31342f'} emissive={color} emissiveIntensity={effectiveEnabled ? (softboxEnabled ? 1.5 : 2.8) : 0} roughness={softboxEnabled ? 0.82 : 0.35} side={THREE.DoubleSide} />
        </mesh>
        {gridEnabled && <group position={[0, 0, 0.016]}>
          {[-0.42, -0.21, 0, 0.21, 0.42].map((offset) => <mesh key={`v-${offset}`} position={[offset, 0, 0]}><planeGeometry args={[0.018, 1.02]} /><meshStandardMaterial color="#3a403b" roughness={0.9} side={THREE.DoubleSide} /></mesh>)}
          {[-0.42, -0.21, 0, 0.21, 0.42].map((offset) => <mesh key={`h-${offset}`} position={[0, offset, 0]}><planeGeometry args={[1.02, 0.018]} /><meshStandardMaterial color="#3a403b" roughness={0.9} side={THREE.DoubleSide} /></mesh>)}
        </group>}
        {light.optic === 'umbrella-shoot' && <group position={[0, 0, 0.12]}><mesh rotation={[Math.PI / 2, 0, 0]}><sphereGeometry args={[0.7, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshPhysicalMaterial color="#f5f3e8" transmission={0.42} transparent opacity={0.72} roughness={0.88} side={THREE.DoubleSide} /></mesh><mesh position={[0, 0, -0.28]}><cylinderGeometry args={[0.012, 0.012, 1.05, 10]} /><meshStandardMaterial color="#454b45" metalness={0.75} /></mesh></group>}
        {light.optic === 'umbrella-reflect' && <group position={[0, 0, 0.12]}><mesh rotation={[Math.PI / 2, 0, 0]}><sphereGeometry args={[0.7, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#d9ddd8" metalness={0.82} roughness={0.24} side={THREE.DoubleSide} /></mesh><mesh position={[0, 0, -0.28]}><cylinderGeometry args={[0.012, 0.012, 1.05, 10]} /><meshStandardMaterial color="#454b45" metalness={0.75} /></mesh></group>}
        {light.optic === 'beauty-dish' && <group position={[0, 0, 0.16]}><mesh rotation={[Math.PI / 2, 0, 0]}><sphereGeometry args={[0.58, 48, 12, 0, Math.PI * 2, 0, Math.PI / 3]} /><meshStandardMaterial color="#c9cec7" metalness={0.55} roughness={0.34} side={THREE.DoubleSide} /></mesh><mesh position={[0, 0, 0.23]}><cylinderGeometry args={[0.13, 0.16, 0.055, 32]} /><meshStandardMaterial color="#d6dad3" metalness={0.52} roughness={0.3} /></mesh></group>}
        {light.optic === 'deep-parabolic' && <mesh position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.64, 0.22, 0.72, 48, 1, true]} /><meshStandardMaterial color="#babfb8" metalness={0.62} roughness={0.28} side={THREE.DoubleSide} /></mesh>}
        {light.optic === 'lantern' && <mesh position={[0, 0, 0.18]} scale={[0.9, 0.9, 0.72]}><sphereGeometry args={[0.62, 40, 28]} /><meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={effectiveEnabled ? 0.9 : 0} transmission={0.18} transparent opacity={0.8} roughness={0.9} side={THREE.DoubleSide} /></mesh>}
        {light.optic === 'standard' && <mesh castShadow position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.48, 0.3, 0.36, 32, 1, true]} /><meshStandardMaterial color="#8f958d" metalness={0.8} roughness={0.3} side={THREE.DoubleSide} /></mesh>}
        {light.optic === 'fresnel' && <group position={[0, 0, 0.08]}>{[0.18, 0.3, 0.42].map((radius) => <mesh key={radius}><torusGeometry args={[radius, 0.016, 8, 40]} /><meshStandardMaterial color="#555d54" metalness={0.5} roughness={0.3} /></mesh>)}</group>}
        {light.optic === 'snoot' && <mesh castShadow position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.17, 0.32, 0.65, 32, 1, true]} /><meshStandardMaterial {...gearMaterial(GEAR.housing, lift)} side={THREE.DoubleSide} /></mesh>}
        {light.optic === 'projection' && <group><mesh castShadow position={[0, 0, 0.34]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.18, 0.27, 0.72, 32]} /><meshStandardMaterial {...gearMaterial(GEAR.housing, lift)} /></mesh><mesh position={[0, 0, 0.72]}><circleGeometry args={[0.15, 36]} /><meshStandardMaterial color="#303730" emissive={color} emissiveIntensity={effectiveEnabled ? 0.5 : 0} /></mesh></group>}
        {light.optic === 'projection' && light.goboPattern !== 'none' && <group position={[0, 0, 0.79]} rotation={[0, 0, THREE.MathUtils.degToRad(light.goboRotation)]} scale={light.goboScale}>
          {light.goboPattern === 'window' && <><mesh castShadow><planeGeometry args={[0.07, 0.64]} /><meshBasicMaterial color="#050605" side={THREE.DoubleSide} /></mesh><mesh castShadow><planeGeometry args={[0.64, 0.07]} /><meshBasicMaterial color="#050605" side={THREE.DoubleSide} /></mesh></>}
          {light.goboPattern === 'blinds' && [-0.24, -0.12, 0, 0.12, 0.24].map((offset) => <mesh key={offset} castShadow position={[0, offset, 0]}><planeGeometry args={[0.68, 0.055]} /><meshBasicMaterial color="#050605" side={THREE.DoubleSide} /></mesh>)}
          {light.goboPattern === 'foliage' && [[-0.2,0.17,0.16,0.09],[0.18,0.2,0.2,0.1],[-0.12,-0.13,0.19,0.11],[0.23,-0.17,0.13,0.08],[0.03,0.02,0.1,0.06]].map(([x,y,w,h], index) => <mesh key={index} castShadow position={[x,y,0]} rotation={[0,0,index * 0.72]} scale={[w,h,1]}><circleGeometry args={[1,18]} /><meshBasicMaterial color="#050605" side={THREE.DoubleSide} /></mesh>)}
          {light.goboPattern === 'breakup' && [[-0.22,0.2,0.28],[0.18,0.18,-0.45],[-0.12,-0.08,0.7],[0.2,-0.19,-0.2],[0.02,0.02,1.1]].map(([x,y,r], index) => <mesh key={index} castShadow position={[x,y,0]} rotation={[0,0,r]}><planeGeometry args={[0.32,0.055]} /><meshBasicMaterial color="#050605" side={THREE.DoubleSide} /></mesh>)}
        </group>}
        {light.optic === 'barn-doors' && <group position={[0, 0, 0.12]}>
          {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((rotation) => <group key={rotation} rotation={[0, 0, rotation]}><mesh castShadow position={[0, 0.48, 0.1]} rotation={[THREE.MathUtils.degToRad(light.barnDoorAngle), 0, 0]}><planeGeometry args={[0.72, 0.48]} /><meshStandardMaterial color="#4a514a" metalness={0.5} roughness={0.44} side={THREE.DoubleSide} /></mesh></group>)}
        </group>}
        {canControl && selected && view !== 'camera' && <RoundedBox args={[1.34, 1.34, fixtureDepth + 0.62]} radius={0.025} smoothness={2} position={[0, 0, -(fixtureDepth + 0.62) / 2 + 0.06]}><meshBasicMaterial color={light.locked ? '#ff8b62' : '#d8ff3e'} wireframe transparent opacity={primary ? 0.58 : 0.28} /></RoundedBox>}
      </group>
      {/* Yoke arm from the tilt knuckle to the back of the head — a real tube,
          not a screen-space line that vanishes at a grazing angle. */}
      <Strut from={[standOffset[0], -0.09, standOffset[1]]} to={[0, -0.02, 0]} radius={0.019} />
      <mesh castShadow position={[standOffset[0], -0.09, standOffset[1]]}>
        <sphereGeometry args={[0.052, 18, 14]} />
        <meshStandardMaterial {...gearMaterial(GEAR.housing, lift)} />
      </mesh>
      {/* The tilt knob you would actually reach for. */}
      <mesh castShadow position={[standOffset[0], -0.09, standOffset[1] + 0.055]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.026, 0.026, 0.03, 14]} />
        <meshStandardMaterial {...gearMaterial(GEAR.chrome, lift)} />
      </mesh>
      <group position={[standOffset[0], -position[1], standOffset[1]]}>
        <LightStand height={Math.max(0.35, position[1] - 0.09)} footprint={FOOTPRINT.lightStand} />
      </group>
    </group>
  )

  return (
    <>
      <primitive object={target} />
      <primitive object={aimPivot} />
      {softbox}
      {canControl && (primary || showLayoutGuide) && view !== 'camera' && <>
        <Line points={[position, light.target]} color={guideColor} lineWidth={showLayoutGuide ? 1 : 0.75} dashed dashSize={0.12} gapSize={0.08} transparent opacity={primary ? 0.68 : 0.38} />
        <group position={light.target} visible={effectiveAimMode || showLayoutGuide}>
          <mesh><sphereGeometry args={[0.065, 20, 20]} /><meshBasicMaterial color={guideColor} /></mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={Math.max(0.45, new THREE.Vector3(...position).distanceTo(new THREE.Vector3(...light.target)) * Math.tan(beamAngle))}>
            <ringGeometry args={[0.16, 0.185, 40]} /><meshBasicMaterial color={guideColor} transparent opacity={primary ? 0.72 : 0.42} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </>}
      {canControl && primary && view !== 'camera' && (effectiveAimMode || !light.locked) && (
        <TransformControls
          ref={transformControl}
          object={effectiveAimMode ? target : effectiveTransformMode === 'rotate' ? aimPivot : rig as RefObject<THREE.Object3D>}
          mode={effectiveAimMode ? 'translate' : effectiveTransformMode}
          size={0.7}
          translationSnap={0.05}
          rotationSnap={THREE.MathUtils.degToRad(5)}
          showX
          showY={!horizontalLayoutOnly}
          showZ={!horizontalLayoutOnly && (effectiveAimMode || effectiveTransformMode === 'translate')}
          onMouseUp={() => {
            if (effectiveAimMode) {
              setLightTarget(lightId, [Number(target.position.x.toFixed(2)), Number(Math.max(0.1, target.position.y).toFixed(2)), Number(target.position.z.toFixed(2))], activeTransformAxis(transformControl.current))
            } else if (effectiveTransformMode === 'rotate') {
              const distance = Math.max(0.1, new THREE.Vector3(...position).distanceTo(new THREE.Vector3(...light.target)))
              const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(aimPivot.quaternion).normalize()
              const nextTarget = new THREE.Vector3(...position).addScaledVector(direction, distance)
              setLightTarget(lightId, [Number(nextTarget.x.toFixed(2)), Number(Math.max(0.1, nextTarget.y).toFixed(2)), Number(nextTarget.z.toFixed(2))])
            } else if (rig.current) {
              setLightPosition(lightId, [Number(rig.current.position.x.toFixed(2)), Number(Math.max(0.8, rig.current.position.y).toFixed(2)), Number(rig.current.position.z.toFixed(2))], activeTransformAxis(transformControl.current))
            }
          }}
        />
      )}
    </>
  )
}

const MODIFIER_MATERIALS = {
  white: { color: '#dedbd0', metalness: 0.02, roughness: 0.82 },
  silver: { color: '#aeb4b2', metalness: 0.82, roughness: 0.24 },
  gold: { color: '#c39a48', metalness: 0.62, roughness: 0.32 },
  black: { color: '#111311', metalness: 0.02, roughness: 0.97 },
} as const

function GripModifier({ modifier }: { modifier: StudioModifier }) {
  const horizontalLayoutOnly = useContext(HorizontalLayoutContext)
  const lift = useGearLift()
  const canControl = useWorkflow((state) => canControlInWorkflow(state.stage, 'grip'))
  const layoutOnly = useWorkflow((state) => workflowModeForStage(state.stage) === 'layout')
  const selected = useStudio((state) => state.selected === modifier.id)
  const selectObject = useStudio((state) => state.selectObject)
  const transformMode = useStudio((state) => state.transformMode)
  const view = useStudio((state) => state.view)
  const setModifierTransform = useStudio((state) => state.setModifierTransform)
  const renderMode = useStudio((state) => state.renderMode)
  const lights = useStudio((state) => state.lights)
  const soloLightId = useStudio((state) => state.soloLightId)
  const shutter = useStudio((state) => state.shutter)
  const syncSpeed = useStudio((state) => state.syncSpeed)
  const modelPosition = useStudio((state) => state.modelPosition)
  const modelHeight = useStudio((state) => state.modelHeight)
  const group = useRef<THREE.Group>(null)
  const transformControl = useRef<TransformControlsImpl>(null)
  const bounceLight = useRef<THREE.RectAreaLight>(null)
  const material = MODIFIER_MATERIALS[modifier.surface]
  const panelWidth = modifier.type === 'vflat' ? modifier.width / 2 : modifier.width
  // How much column there is between the floor and the frame's bottom rail.
  const standDrop = Math.max(0.3, modifier.position[1] - modifier.height / 2 - 0.17)
  const bounce = useMemo(() => {
    if (modifier.surface === 'black') return { intensity: 0, color: new THREE.Color('#ffffff') }
    const normal = new THREE.Vector3(Math.sin(modifier.rotationY), 0, Math.cos(modifier.rotationY)).normalize()
    const panelPosition = new THREE.Vector3(...modifier.position)
    const subjectPoint = new THREE.Vector3(modelPosition[0], modelPosition[1] + modelHeight * 0.62, modelPosition[2])
    const outgoing = Math.max(0.18, Math.abs(normal.dot(subjectPoint.clone().sub(panelPosition).normalize())))
    const enabledLights = lights.filter((light) => light.enabled && (!soloLightId || soloLightId === light.id))
    let reflected = 0
    let dominant: StudioLight | undefined
    let dominantOutput = -1
    enabledLights.forEach((light) => {
      const source = new THREE.Vector3(...light.position)
      const direction = source.sub(panelPosition)
      const distanceSquared = Math.max(0.35, direction.lengthSq())
      const incoming = Math.max(0.12, Math.abs(normal.dot(direction.normalize())))
      // captureLightOutput already includes modifier and grid transmission.
      const output = captureLightOutput(light, shutter, syncSpeed)
      reflected += output * incoming / distanceSquared
      if (output > dominantOutput) { dominant = light; dominantOutput = output }
    })
    const reflectance = modifier.surface === 'silver' ? 0.78 : modifier.surface === 'gold' ? 0.58 : 0.42
    const dominantGel = dominant ? getGel(dominant.gelId) : null
    const color = dominant && dominantGel
      ? (() => {
          const base = dominant.colorMode === 'rgb' ? new THREE.Color(dominant.rgb) : kelvinColor(geledTemperature(dominant.temperature, dominantGel))
          const [r, g, b] = applyGelTint([base.r, base.g, base.b], dominantGel)
          return new THREE.Color(r, g, b)
        })()
      : new THREE.Color('#fff5df')
    if (modifier.surface === 'gold') color.lerp(new THREE.Color('#ffc56f'), 0.42)
    if (modifier.surface === 'silver') color.lerp(new THREE.Color('#eaf6ff'), 0.12)
    return { intensity: reflected * outgoing * reflectance / 115, color }
  }, [lights, modelHeight, modelPosition, modifier.position, modifier.rotationY, modifier.surface, shutter, soloLightId, syncSpeed])

  useEffect(() => {
    bounceLight.current?.lookAt(modelPosition[0], modelPosition[1] + modelHeight * 0.62, modelPosition[2])
  }, [modelHeight, modelPosition, modifier.position])

  // Fabric stretched on a tubular frame. The frame used to be a wireframe box,
  // which reads as a debug helper rather than as the aluminium it stands for —
  // and a wireframe throws no shadow, so the panel floated free of its rig.
  const halfPanel = panelWidth / 2
  const halfHeight = modifier.height / 2
  const panel = (x = 0, rotationY = 0) => (
    <group position={[x, 0, 0]} rotation={[0, rotationY, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[panelWidth, modifier.height, 0.035]} />
        <meshStandardMaterial {...material} side={THREE.DoubleSide} />
      </mesh>
      <Strut from={[-halfPanel, halfHeight, -0.03]} to={[halfPanel, halfHeight, -0.03]} radius={0.014} />
      <Strut from={[-halfPanel, -halfHeight, -0.03]} to={[halfPanel, -halfHeight, -0.03]} radius={0.014} />
      <Strut from={[-halfPanel, -halfHeight, -0.03]} to={[-halfPanel, halfHeight, -0.03]} radius={0.014} />
      <Strut from={[halfPanel, -halfHeight, -0.03]} to={[halfPanel, halfHeight, -0.03]} radius={0.014} />
      {/* Corner blocks, where the tubes actually join. */}
      {([[-halfPanel, halfHeight], [halfPanel, halfHeight], [-halfPanel, -halfHeight], [halfPanel, -halfHeight]] as const).map(([cx, cy]) => (
        <mesh key={`${cx}-${cy}`} castShadow position={[cx, cy, -0.03]}>
          <sphereGeometry args={[0.022, 12, 10]} />
          <meshStandardMaterial {...gearMaterial(GEAR.housing, lift)} />
        </mesh>
      ))}
    </group>
  )

  const object = (
    <group
      ref={group}
      position={modifier.position}
      rotation={[0, modifier.rotationY, 0]}
      onClick={(event) => { event.stopPropagation(); if (canControl) selectObject(modifier.id) }}
    >
      {modifier.type === 'vflat' ? <>
        {panel(-panelWidth * 0.24, 0.34)}
        {panel(panelWidth * 0.24, -0.34)}
      </> : panel()}
      {modifier.type !== 'vflat' && <>
        {/* A grip stand that reaches the floor. The old stub ended in mid-air
            below tall panels and punched through the floor under short ones. */}
        <Strut from={[0, -halfHeight, 0]} to={[0, -halfHeight - 0.16, 0]} radius={0.016} />
        <mesh castShadow position={[0, -halfHeight - 0.17, 0]}>
          <sphereGeometry args={[0.042, 16, 12]} />
          <meshStandardMaterial {...gearMaterial(GEAR.housing, lift)} />
        </mesh>
        <mesh castShadow position={[0.05, -halfHeight - 0.17, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.022, 0.022, 0.028, 14]} />
          <meshStandardMaterial {...gearMaterial(GEAR.chrome, lift)} />
        </mesh>
        <group position={[0, -modifier.position[1], 0]}>
          <LightStand height={standDrop} footprint={FOOTPRINT.gripStand} />
        </group>
      </>}
      {canControl && selected && view !== 'camera' && <mesh>
        <boxGeometry args={[modifier.width + 0.1, modifier.height + 0.1, modifier.type === 'vflat' ? 0.5 : 0.1]} />
        <meshBasicMaterial color={modifier.locked ? '#ff8b62' : '#d8ff3e'} wireframe transparent opacity={0.48} />
      </mesh>}
    </group>
  )

  return <>
    {object}
    {modifier.surface !== 'black' && <rectAreaLight ref={bounceLight} position={modifier.position} color={bounce.color} intensity={renderMode === 'path' ? 0 : bounce.intensity} width={modifier.width} height={modifier.height} />}
    {canControl && selected && view !== 'camera' && !modifier.locked && <TransformControls
      ref={transformControl}
      object={group as RefObject<THREE.Object3D>}
      mode={layoutOnly ? 'translate' : transformMode}
      size={0.7}
      translationSnap={0.05}
      rotationSnap={THREE.MathUtils.degToRad(5)}
      showX={layoutOnly || transformMode === 'translate'}
      showY={!horizontalLayoutOnly}
      showZ={!horizontalLayoutOnly && (layoutOnly || transformMode === 'translate')}
      onMouseUp={() => {
        if (!group.current) return
        setModifierTransform(modifier.id,
          [Number(group.current.position.x.toFixed(2)), Number(Math.max(0.3, group.current.position.y).toFixed(2)), Number(group.current.position.z.toFixed(2))],
          Number(group.current.rotation.y.toFixed(3)),
          layoutOnly || transformMode === 'translate' ? activeTransformAxis(transformControl.current) : undefined,
        )
      }}
    />}
  </>
}

function CameraProp() {
  const horizontalLayoutOnly = useContext(HorizontalLayoutContext)
  const lift = useGearLift()
  const canControl = useWorkflow((state) => canControlInWorkflow(state.stage, 'camera'))
  const selectObject = useStudio((state) => state.selectObject)
  const selected = useStudio((state) => state.selected === 'camera')
  const view = useStudio((state) => state.view)
  const position = useStudio((state) => state.cameraPosition)
  const target = useStudio((state) => state.cameraTarget)
  const setCameraPosition = useStudio((state) => state.setCameraPosition)
  const group = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const transformControl = useRef<TransformControlsImpl>(null)
  const columnHeight = Math.max(0.3, position[1] - 0.22)

  // Only the head aims. Aiming the whole prop tipped the tripod over with it,
  // so a camera looking down at a seated subject stood on slanted legs.
  useEffect(() => {
    head.current?.lookAt(...target)
  }, [position, target])

  /*
   * Which way the body faces.
   *
   * Object3D.lookAt turns a plain group so that its *+Z* faces the target —
   * the opposite of a Camera or a Light, which face along -Z. The body below is
   * authored the natural way round, lens on -Z and screen on +Z, so without
   * this half turn the prop aims its viewfinder at the subject and its lens at
   * the room. It only became obvious once the front and back stopped looking
   * alike.
   */

  const camera = (
    <group ref={group} position={position} onClick={(event) => { event.stopPropagation(); if (canControl) selectObject('camera') }}>
      <group position={[0, -columnHeight - 0.22, 0]}>
        <LightStand height={columnHeight} footprint={0.46} />
      </group>
      {/* Fluid head: bowl, tilt plate and the pan bar. */}
      <mesh castShadow position={[0, -0.185, 0]}>
        <cylinderGeometry args={[0.062, 0.082, 0.09, 20]} />
        <meshStandardMaterial {...gearMaterial(GEAR.housing, lift)} />
      </mesh>
      <group ref={head}>
        <group rotation={[0, Math.PI, 0]}>
        {/* Body, with the shoulders a mirrorless body actually has. */}
        <RoundedBox castShadow receiveShadow args={[0.36, 0.26, 0.19]} radius={0.028} smoothness={4} position={[0, 0, 0.02]}>
          <meshStandardMaterial {...gearMaterial(GEAR.housing, lift)} />
        </RoundedBox>
        {/* Silver top plate. A body that is one flat black block has no line
            along the shoulders, which is the shape you recognise a camera by. */}
        <RoundedBox castShadow args={[0.365, 0.05, 0.195]} radius={0.02} smoothness={3} position={[0, 0.115, 0.02]}>
          <meshStandardMaterial {...gearMaterial(GEAR.aluminium, lift)} />
        </RoundedBox>
        {/* Hand grip. */}
        <RoundedBox castShadow args={[0.11, 0.25, 0.2]} radius={0.045} smoothness={4} position={[0.2, -0.012, 0.025]}>
          <meshStandardMaterial {...gearMaterial(GEAR.rubber, lift)} />
        </RoundedBox>
        {/* Viewfinder hump and hot shoe. */}
        <RoundedBox castShadow args={[0.12, 0.085, 0.135]} radius={0.02} smoothness={3} position={[-0.005, 0.16, 0.025]}>
          <meshStandardMaterial {...gearMaterial(GEAR.aluminium, lift)} />
        </RoundedBox>
        <mesh castShadow position={[-0.005, 0.208, 0.03]}>
          <boxGeometry args={[0.062, 0.014, 0.052]} />
          <meshStandardMaterial {...gearMaterial(GEAR.chrome, lift)} />
        </mesh>
        {/* Eyepiece, at the back where a face would go. */}
        <mesh position={[-0.005, 0.155, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.032, 0.038, 0.03, 20]} />
          <meshStandardMaterial {...gearMaterial(GEAR.rubber, lift)} />
        </mesh>
        {/* Shutter release and mode dial. */}
        <mesh position={[0.2, 0.118, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.017, 0.017, 0.014, 16]} />
          <meshStandardMaterial {...gearMaterial(GEAR.chrome, lift)} />
        </mesh>
        <mesh position={[-0.13, 0.135, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.037, 0.037, 0.026, 20]} />
          <meshStandardMaterial {...gearMaterial(GEAR.aluminium, lift)} />
        </mesh>
        {/* Rear screen. */}
        <mesh position={[0, -0.01, 0.117]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshPhysicalMaterial color="#0b0d0c" roughness={0.12} clearcoat={0.8} clearcoatRoughness={0.06} />
        </mesh>
        {/* Lens: mount, barrel, focus and zoom rings, hood, front element. */}
        <mesh castShadow position={[0, 0, -0.09]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.088, 0.088, 0.03, 32]} />
          <meshStandardMaterial {...gearMaterial(GEAR.chrome, lift)} />
        </mesh>
        <mesh castShadow position={[0, 0, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.079, 0.084, 0.21, 36]} />
          <meshStandardMaterial {...gearMaterial(GEAR.housing, lift)} />
        </mesh>
        {/* Accent band. One warm ring is all it takes for the lens to stop
            reading as a hole in the middle of the frame. */}
        <mesh position={[0, 0, -0.3]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0895, 0.0895, 0.012, 40]} />
          <meshStandardMaterial color="#c9722f" metalness={0.35} roughness={0.4} />
        </mesh>
        {([-0.17, -0.26] as const).map((z) => (
          <mesh key={z} castShadow position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.05, 40]} />
            <meshStandardMaterial {...gearMaterial(GEAR.rubber, lift)} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 0, -0.36]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.108, 0.086, 0.11, 36, 1, true]} />
          <meshStandardMaterial color="#3c423c" metalness={0.32} roughness={0.66} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, -0.305]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.074, 0.074, 0.004, 32]} />
          <meshPhysicalMaterial color="#0a1418" roughness={0.05} metalness={0.1} clearcoat={1} iridescence={0.6} iridescenceIOR={1.6} />
        </mesh>
        {/* Pan bar — it tilts with the head, which is the point of it. */}
        <Strut from={[-0.085, -0.14, 0.05]} to={[-0.16, -0.24, 0.36]} radius={0.011} />
        <mesh castShadow position={[-0.17, -0.255, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.019, 0.019, 0.11, 14]} />
          <meshStandardMaterial {...gearMaterial(GEAR.rubber, lift)} />
        </mesh>
        {canControl && selected && view !== 'camera' && <RoundedBox args={[0.56, 0.4, 0.62]} radius={0.03} smoothness={2} position={[0.02, 0, -0.1]}><meshBasicMaterial color="#d8ff3e" wireframe transparent opacity={0.58} /></RoundedBox>}
        </group>
      </group>
    </group>
  )

  return <>
    {camera}
    {canControl && selected && view !== 'camera' && <>
      <TransformControls
        ref={transformControl}
        object={group as RefObject<THREE.Object3D>}
        mode="translate"
        size={0.72}
        translationSnap={0.05}
        showX
        showY={!horizontalLayoutOnly}
        showZ={!horizontalLayoutOnly}
        onMouseUp={() => {
          if (!group.current) return
          setCameraPosition([Number(group.current.position.x.toFixed(2)), Number(Math.max(0.35, group.current.position.y).toFixed(2)), Number(group.current.position.z.toFixed(2))], activeTransformAxis(transformControl.current))
        }}
      />
      <group position={target}>
        <mesh><sphereGeometry args={[0.055, 18, 18]} /><meshBasicMaterial color="#d8ff3e" /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[0.1, 0.112, 32]} /><meshBasicMaterial color="#d8ff3e" side={THREE.DoubleSide} /></mesh>
      </group>
    </>}
  </>
}

function CameraImaging() {
  const view = useStudio((state) => state.view)
  const renderMode = useStudio((state) => state.renderMode)
  const enabled = useStudio((state) => state.dofEnabled)
  const focusDistance = useStudio((state) => state.focusDistance)
  const focalLength = useStudio((state) => state.focalLength)
  const aperture = useStudio((state) => state.aperture)
  const iso = useStudio((state) => state.iso)
  const shutter = useStudio((state) => state.shutter)
  const sensorFormat = useStudio((state) => state.sensorFormat)
  const lights = useStudio((state) => state.lights)
  const lensOpticsEnabled = useStudio((state) => state.lensOpticsEnabled)
  const lensVignette = useStudio((state) => state.lensVignette)
  const lensDistortion = useStudio((state) => state.lensDistortion)
  const lensChromaticAberration = useStudio((state) => state.lensChromaticAberration)
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
  const cameraMode = useStudio((state) => state.cameraMode)
  const frameRate = useStudio((state) => state.frameRate)
  const shutterAngle = useStudio((state) => state.shutterAngle)
  const tStop = useStudio((state) => state.tStop)
  const ndStops = useStudio((state) => state.ndStops)
  const cameraBody = CAMERA_BODIES[cameraBodyId]
  const effectiveAperture = cameraMode === 'cinema' ? tStop : aperture
  const effectiveShutter = cameraMode === 'cinema' ? frameRate * 360 / shutterAngle : shutter
  const depth = useMemo(
    () => calculateDepthOfField(focalLength, effectiveAperture, focusDistance, SENSOR_COC[sensorFormat]),
    [effectiveAperture, focalLength, focusDistance, sensorFormat],
  )

  if (view !== 'camera' || renderMode === 'path') return null

  const enabledLights = lights.filter((light) => light.enabled)
  const flashShare = enabledLights.length ? enabledLights.filter((light) => light.operationMode === 'flash').length / enabledLights.length : 0
  const shutterFactor = flashShare + (1 - flashShare) * (125 / effectiveShutter)
  const exposureGain = (iso / 100) * shutterFactor * (16 / (effectiveAperture * effectiveAperture)) * Math.pow(2, -ndStops)
  const brightness = THREE.MathUtils.clamp(Math.log2(exposureGain) * 0.105, -0.38, 0.48)
  const bokehScale = THREE.MathUtils.clamp((focalLength / 50) * (5.6 / effectiveAperture), 0.28, 4.5)
  const focusRange = THREE.MathUtils.clamp(depth.range, 0.1, 6)

  return (
    <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
      {enabled && <DepthOfField
        focusDistance={focusDistance}
        focusRange={focusRange}
        bokehScale={bokehScale}
        resolutionScale={0.65}
      />}
      {lensOpticsEnabled && (lensDistortion !== 0 || lensChromaticAberration > 0) && <LensCharacterPass distortion={lensDistortion} chromaticAberration={lensChromaticAberration} />}
      {lensOpticsEnabled && lensVignette > 0 && <Vignette offset={0.32} darkness={lensVignette * 0.0065} />}
      <ColorSciencePass imageFormat={imageFormat} temperature={whiteBalance} tint={whiteBalanceTint} profileId={colorProfileId} rolloff={highlightRolloff} toneCurve={toneCurve} lutIntensity={lutIntensity} />
      {sensorSimulationEnabled && <SensorPass iso={iso} nativeIso={cameraBody.nativeIso} noiseFactor={cameraBody.noiseFactor} dynamicRange={sensorDynamicRange} noiseReduction={noiseReduction} colorNoise={colorNoise} shutter={shutter} shutterMode={shutterMode} motionBlur={motionBlur} rollingShutter={rollingShutter} readoutMs={cameraBody.readoutMs} raw={imageFormat === 'raw'} />}
      <BrightnessContrast brightness={brightness} contrast={0.02} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

function ExposureProbe() {
  const { gl } = useThree()
  const open = useStudio((state) => state.analysisOpen)
  const overlay = useStudio((state) => state.exposureOverlay)
  const lastCapture = useRef(0)
  const captureScheduled = useRef(false)

  useFrame(({ clock }) => {
    if ((!open && overlay === 'none') || captureScheduled.current || clock.elapsedTime - lastCapture.current < 0.5) return
    lastCapture.current = clock.elapsedTime
    captureScheduled.current = true
    window.setTimeout(() => {
      captureScheduled.current = false
      try {
        const context = gl.getContext()
        const sourceWidth = gl.domElement.width
        const sourceHeight = gl.domElement.height
        if (!sourceWidth || !sourceHeight) return
        const source = new Uint8Array(sourceWidth * sourceHeight * 4)
        context.readPixels(0, 0, sourceWidth, sourceHeight, context.RGBA, context.UNSIGNED_BYTE, source)

        const width = 256
        const height = 144
        const pixels = new Uint8ClampedArray(width * height * 4)
        for (let y = 0; y < height; y += 1) {
          const sourceY = Math.min(sourceHeight - 1, Math.floor(((height - 1 - y) / height) * sourceHeight))
          for (let x = 0; x < width; x += 1) {
            const sourceX = Math.min(sourceWidth - 1, Math.floor((x / width) * sourceWidth))
            const sourceIndex = (sourceY * sourceWidth + sourceX) * 4
            const targetIndex = (y * width + x) * 4
            pixels[targetIndex] = source[sourceIndex]
            pixels[targetIndex + 1] = source[sourceIndex + 1]
            pixels[targetIndex + 2] = source[sourceIndex + 2]
            pixels[targetIndex + 3] = 255
          }
        }
        useStudio.setState({ exposureSample: { width, height, pixels } })
      } catch {
        useStudio.setState({ exposureSample: null })
      }
    }, 0)
  })

  return null
}

export function StudioScene({ horizontalLayoutOnly = false }: { horizontalLayoutOnly?: boolean }) {
  const { gl, scene } = useThree()
  const aperture = useStudio((state) => state.aperture)
  const iso = useStudio((state) => state.iso)
  const shutter = useStudio((state) => state.shutter)
  const renderMode = useStudio((state) => state.renderMode)
  const lights = useStudio((state) => state.lights)
  const modifiers = useStudio((state) => state.modifiers)
  const studioObjects = useStudio((state) => state.studioObjects)
  const soloLightId = useStudio((state) => state.soloLightId)
  const ambientLevel = useStudio((state) => state.ambientLevel)
  const ambientTemperature = useStudio((state) => state.ambientTemperature)
  const qualityPreset = useStudio((state) => state.qualityPreset)
  const cameraMode = useStudio((state) => state.cameraMode)
  const frameRate = useStudio((state) => state.frameRate)
  const shutterAngle = useStudio((state) => state.shutterAngle)
  const tStop = useStudio((state) => state.tStop)
  const ndStops = useStudio((state) => state.ndStops)
  const layoutOnly = useWorkflow((state) => workflowModeForStage(state.stage) === 'layout')
  const view = useStudio((state) => state.view)
  const ambientColor = useMemo(() => kelvinColor(ambientTemperature), [ambientTemperature])

  useEffect(() => {
    gl.shadowMap.enabled = true
    gl.shadowMap.type = THREE.PCFShadowMap
    gl.toneMapping = THREE.ACESFilmicToneMapping
    scene.background = new THREE.Color(layoutOnly ? '#343a37' : '#292b29')
  }, [gl, layoutOnly, scene])

  useEffect(() => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio, qualityPreset === 'performance' ? 1 : qualityPreset === 'ultra' ? 2 : 1.5))
    gl.shadowMap.type = qualityPreset === 'performance' ? THREE.BasicShadowMap : qualityPreset === 'ultra' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    gl.shadowMap.needsUpdate = true
  }, [gl, qualityPreset])

  useEffect(() => {
    const enabledLights = lights.filter((light) => light.enabled)
    const flashShare = enabledLights.length ? enabledLights.filter((light) => light.operationMode === 'flash').length / enabledLights.length : 0
    const effectiveAperture = cameraMode === 'cinema' ? tStop : aperture
    const effectiveShutter = cameraMode === 'cinema' ? frameRate * 360 / shutterAngle : shutter
    const shutterFactor = flashShare + (1 - flashShare) * (125 / effectiveShutter)
    const exposureGain = (iso / 100) * shutterFactor * (16 / (effectiveAperture * effectiveAperture)) * Math.pow(2, -ndStops)
    gl.toneMappingExposure = THREE.MathUtils.clamp(0.72 * exposureGain, 0.25, 2.5)
  }, [aperture, cameraMode, frameRate, gl, iso, lights, ndStops, shutter, shutterAngle, tStop])

  return (
    <HorizontalLayoutContext.Provider value={horizontalLayoutOnly}>
      <CameraRig />
      <TimelinePlayback />
      <ambientLight intensity={layoutOnly ? Math.max(0.72, ambientLevel / 48) : soloLightId ? 0.015 : ambientLevel / 75} color={ambientColor} />
      <EnvironmentLighting />
      <Backdrop />
      <Mannequin />
      {lights.map((light) => <Softbox key={light.id} light={light} />)}
      {modifiers.map((modifier) => <GripModifier key={modifier.id} modifier={modifier} />)}
      {studioObjects.map((object) => <MovableStudioObject key={object.id} object={object} />)}
      {/* Not through its own lens. The prop sits exactly at the viewpoint, so
          with a real lens barrel on it the body now filled its own frame. */}
      {renderMode !== 'path' && view !== 'camera' && <CameraProp />}
      {renderMode !== 'path' && <Grid position={[0, 0.006, 1.5]} args={[10, 10]} cellSize={0.5} cellThickness={0.4} cellColor="#747872" sectionSize={2} sectionThickness={0.75} sectionColor="#9ba197" fadeDistance={12} fadeStrength={1.8} infiniteGrid />}
      {renderMode !== 'path' && <MeasureTool />}
      <CameraImaging />
      <ExposureProbe />
      {renderMode === 'path' && <Suspense fallback={null}><PathTracingRenderer /></Suspense>}
    </HorizontalLayoutContext.Provider>
  )
}
