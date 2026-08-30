import { Grid, Html, Line, OrbitControls, RoundedBox, TransformControls } from '@react-three/drei'
import { BrightnessContrast, DepthOfField, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame, useThree } from '@react-three/fiber'
import { Effect, ToneMappingMode } from 'postprocessing'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { IESLoader } from 'three/addons/loaders/IESLoader.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { breathingAdjustedFocalLength, calculateDepthOfField } from '../optics'
import { useStudio, type OutfitFabric, type StudioLight, type StudioModifier, type StudioObject, type TransformAxis } from '../store'
import { Figure, type FigureAppearance } from './Figure'
import type { ModelPose } from '../pose'
import { applyExpressionToMorphs, applyPoseToSkeleton, captureRestPose, mappingQuality, mapSkeleton, type BoneMap, type RestPose } from '../retarget'
import { STUDIO_HAIR_SOURCE_SCALE, STUDIO_HAIR_SOURCE_URL, studioEyeAnchor, studioHairAnchor } from '../studioHumanDetails'
import { captureLightOutput, PATHTRACE_CANDELA_SCALE, PREVIEW_CANDELA_SCALE } from '../lightProfiles'
import { CAMERA_BODIES, LENS_PROFILES } from '../cameraProfiles'
import { COLOR_PROFILES, whiteBalanceGains } from '../colorScience'
import { getBackdrop, type BackdropProfile } from '../backdrops'
import { FOOTPRINT, seatHeightOf } from '../layout'
import { PoseRig } from './PoseRig'
import { applyGelTint, geledTemperature, getGel } from '../gels'
import { brickNormalMap, canvasNormalMap, concreteNormalMap, mottleMap, paperNormalMap, plasterNormalMap, woodNormalMap } from '../textures'
import { shippedHumanFor } from '../characterAssets'
import { useWorkflow } from '../workflow'
import { canControlInWorkflow, workflowModeForStage } from '../workflowControl'

// A RectAreaLight is dark until the LTC lookup tables are uploaded. Every bounce
// panel and the window are rect-area sources, so this has to run before the
// first frame or half the scene's light silently contributes nothing.
RectAreaLightUniformsLib.init()

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

  return <OrbitControls enabled={view === 'studio' && !layoutOnly} enableRotate={!layoutOnly} makeDefault target={[0, 1.15, 0]} minDistance={3.5} maxDistance={13} maxPolarAngle={Math.PI / 2.02} />
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

function EnvironmentLighting() {
  const { scene } = useThree()
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

  useEffect(() => {
    if (!hdriUrl) { scene.environment = null; return }
    let active = true
    let texture: THREE.DataTexture | null = null
    new RGBELoader().load(hdriUrl, (loaded) => {
      if (!active) { loaded.dispose(); return }
      texture = loaded
      loaded.mapping = THREE.EquirectangularReflectionMapping
      scene.environment = loaded
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

function DefaultMannequin({ pose: poseOverride, skinColor: skinOverride, outfitColor: outfitOverride, appearance: appearanceOverride, seatHeight }: {
  pose?: ModelPose
  skinColor?: string
  outfitColor?: string
  appearance?: FigureAppearance
  seatHeight?: number | null
} = {}) {
  const mainPose = useStudio((state) => state.modelPose)
  const mainSkinColor = useStudio((state) => state.skinColor)
  const mainOutfitColor = useStudio((state) => state.outfitColor)
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
  const lookAtCamera = useStudio((state) => state.modelLookAtCamera)
  const eyesAtCamera = useStudio((state) => state.modelEyesAtCamera)
  const cameraPosition = useStudio((state) => state.cameraPosition)
  const modelPosition = useStudio((state) => state.modelPosition)
  const modelRotation = useStudio((state) => state.modelRotation)
  const mainSeatHeight = useSeatHeight(modelPosition)

  const basePose = poseOverride ?? mainPose
  const cameraYaw = THREE.MathUtils.radToDeg(Math.atan2(cameraPosition[0] - modelPosition[0], cameraPosition[2] - modelPosition[2]) - modelRotation)
  const pose = !poseOverride && lookAtCamera ? { ...basePose, headYaw: THREE.MathUtils.clamp(cameraYaw, -72, 72) } : basePose
  // Eyes track the lens independently of the head: chin down, eyes up.
  const gaze = !poseOverride && eyesAtCamera
    ? { yaw: THREE.MathUtils.clamp(cameraYaw - pose.headYaw, -35, 35), pitch: -pose.headTilt }
    : { yaw: basePose.gazeYaw, pitch: basePose.gazePitch }

  const appearance: FigureAppearance = appearanceOverride ?? {
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
  }

  return <Figure pose={pose} skinColor={skinOverride ?? mainSkinColor} outfitColor={outfitOverride ?? mainOutfitColor} appearance={appearance} gaze={gaze} seatHeight={seatHeight ?? mainSeatHeight} />
}

function attachHeadDetail(model: THREE.Group, head: THREE.Bone, detail: THREE.Group, worldPosition: THREE.Vector3) {
  model.add(detail)
  detail.position.copy(model.worldToLocal(worldPosition))
  model.updateMatrixWorld(true)
  head.attach(detail)
}

/** Maps the appearance controls to a physically plausible hair response. */
function applyStudioHairAppearance(material: THREE.MeshPhysicalMaterial, hairColor: string, hairGloss: number) {
  const gloss = THREE.MathUtils.clamp(hairGloss / 100, 0, 1)
  const color = new THREE.Color(hairColor)
  material.color.copy(color)
  material.roughness = THREE.MathUtils.lerp(0.72, 0.22, gloss)
  material.sheen = THREE.MathUtils.lerp(0.28, 0.92, gloss)
  material.sheenColor.copy(color).lerp(new THREE.Color('#fff4e8'), 0.22 + gloss * 0.18)
  material.sheenRoughness = THREE.MathUtils.lerp(0.58, 0.20, gloss)
  material.anisotropy = THREE.MathUtils.lerp(0.22, 0.84, gloss)
  material.clearcoat = gloss * 0.18
  material.clearcoatRoughness = THREE.MathUtils.lerp(0.48, 0.20, gloss)
  material.needsUpdate = true
}

/** Gives the source hairstyle fine, directional fibres without baking in one hair colour. */
function createStudioHairTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')!
  const base = context.createLinearGradient(0, 0, 0, 512)
  base.addColorStop(0, '#707070')
  base.addColorStop(0.22, '#aaaaaa')
  base.addColorStop(1, '#868686')
  context.fillStyle = base
  context.fillRect(0, 0, 512, 512)
  let seed = 117
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  context.lineCap = 'round'
  for (let index = 0; index < 1350; index += 1) {
    const x = random() * 512
    const y = random() * 512
    const length = 24 + random() * 68
    context.strokeStyle = random() > 0.58 ? 'rgba(255,255,255,.20)' : 'rgba(18,18,18,.24)'
    context.lineWidth = 0.35 + random() * 0.85
    context.beginPath()
    context.moveTo(x, y)
    context.bezierCurveTo(
      x + length * 0.10,
      y - length * 0.30,
      x - length * 0.08,
      y - length * 0.72,
      x + length * 0.03,
      y - length,
    )
    context.stroke()
  }
  // A soft root shadow keeps the scalp from reading as a uniformly coloured cap.
  const rootShade = context.createLinearGradient(0, 0, 0, 150)
  rootShade.addColorStop(0, 'rgba(20,20,20,.34)')
  rootShade.addColorStop(1, 'rgba(20,20,20,0)')
  context.fillStyle = rootShade
  context.fillRect(0, 0, 512, 150)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2.4, 1.7)
  texture.anisotropy = 8
  return texture
}

/** Fits the CC0 MakeHuman short04 mesh to this normalized actor's real head. */
function addStudioHair(model: THREE.Group, head: THREE.Bone, box: THREE.Box3, headPosition: THREE.Vector3, source: THREE.Group, hairColor: string, hairGloss: number) {
  const texture = createStudioHairTexture()
  const material = new THREE.MeshPhysicalMaterial({
    map: texture,
    metalness: 0,
    anisotropyRotation: Math.PI / 2,
    envMapIntensity: 0.68,
    side: THREE.DoubleSide,
  })
  material.name = 'studio-hair-material'
  applyStudioHairAppearance(material, hairColor, hairGloss)

  const hairstyle = new THREE.Group()
  hairstyle.name = 'studio-short04-hair'
  const sourceBox = new THREE.Box3().setFromObject(source)
  const sourceCenter = sourceBox.getCenter(new THREE.Vector3())
  source.scale.setScalar(STUDIO_HAIR_SOURCE_SCALE)
  source.position.copy(sourceCenter).multiplyScalar(-STUDIO_HAIR_SOURCE_SCALE)
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.material = material
    child.castShadow = true
    child.receiveShadow = true
  })
  hairstyle.add(source)
  attachHeadDetail(model, head, hairstyle, studioHairAnchor(headPosition, box.max.y))
}

/** Adds real sclera, iris, pupil and catchlight geometry to the shipped human. */
function addStudioEyes(model: THREE.Group, head: THREE.Bone, box: THREE.Box3, headPosition: THREE.Vector3) {
  const eyes = new THREE.Group()
  eyes.name = 'studio-eyeballs'
  const scleraGeometry = new THREE.SphereGeometry(0.0124, 28, 18)
  const irisGeometry = new THREE.CircleGeometry(0.0054, 28)
  const pupilGeometry = new THREE.CircleGeometry(0.00245, 24)
  const catchlightGeometry = new THREE.CircleGeometry(0.00105, 12)
  const sclera = new THREE.MeshPhysicalMaterial({ color: '#e6e2d8', roughness: 0.30, clearcoat: 0.48, clearcoatRoughness: 0.12 })
  const iris = new THREE.MeshPhysicalMaterial({ color: '#5b4934', roughness: 0.24, clearcoat: 0.62 })
  const pupil = new THREE.MeshBasicMaterial({ color: '#08090a' })
  const catchlight = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })

  for (const side of [-1, 1] as const) {
    const eye = new THREE.Group()
    eye.position.x = side * 0.0335
    const white = new THREE.Mesh(scleraGeometry, sclera)
    white.scale.set(1.12, 0.72, 0.84)
    white.castShadow = true
    eye.add(white)
    const irisMesh = new THREE.Mesh(irisGeometry, iris)
    irisMesh.position.z = -0.0108
    irisMesh.rotation.y = Math.PI
    eye.add(irisMesh)
    const pupilMesh = new THREE.Mesh(pupilGeometry, pupil)
    pupilMesh.position.z = -0.01115
    pupilMesh.rotation.y = Math.PI
    eye.add(pupilMesh)
    const glint = new THREE.Mesh(catchlightGeometry, catchlight)
    glint.position.set(-0.0018, 0.0020, -0.0115)
    glint.rotation.y = Math.PI
    eye.add(glint)
    eyes.add(eye)
  }

  // The shipped human faces -Z. Keep the sphere centres inside the sockets;
  // only the iris/pupil surfaces sit just ahead of the face.
  attachHeadDetail(model, head, eyes, studioEyeAnchor(headPosition, box.max.y))
}

/**
 * An imported GLB, driven by the same pose rig as the built-in figure.
 *
 * The skeleton is mapped once on load; after that a pose change writes straight
 * onto the bones. If the file has no recognisable humanoid skeleton the model
 * still renders — it just stands in its rest pose, and the inspector says so.
 */
function ImportedModel({ url, pose: poseOverride, lookAtCamera: lookAtCameraOverride, reportStatus = true, onRigReady }: {
  url: string
  pose?: ModelPose
  lookAtCamera?: boolean
  reportStatus?: boolean
  onRigReady?: (map: BoneMap | null) => void
}) {
  const [object, setObject] = useState<THREE.Group | null>(null)
  const [loadError, setLoadError] = useState(false)
  const setStatus = useStudio((state) => state.setModelImportStatus)
  const setRigStatus = useStudio((state) => state.setModelRigStatus)
  const mainPose = useStudio((state) => state.modelPose)
  const mainLookAtCamera = useStudio((state) => state.modelLookAtCamera)
  const cameraPosition = useStudio((state) => state.cameraPosition)
  const modelPosition = useStudio((state) => state.modelPosition)
  const modelRotation = useStudio((state) => state.modelRotation)
  const hairColor = useStudio((state) => state.hairColor)
  const hairGloss = useStudio((state) => state.hairGloss)
  const rig = useRef<{ map: BoneMap; rest: RestPose } | null>(null)
  const pose = poseOverride ?? mainPose
  const lookAtCamera = lookAtCameraOverride ?? mainLookAtCamera

  useEffect(() => {
    let active = true
    let loadedObject: THREE.Group | null = null
    setLoadError(false)
    if (reportStatus) setStatus('loading')
    const loader = new GLTFLoader()
    loader.load(url, (gltf) => {
      if (!active) return
      const model = clone(gltf.scene) as THREE.Group
      const shippedHuman = url.startsWith('/models/lumen-human/')
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true
          child.receiveShadow = true
          // Skinned meshes are usually authored with a bounding box for the rest
          // pose only; without this they vanish the moment a limb moves out of it.
          if ((child as THREE.SkinnedMesh).isSkinnedMesh) child.frustumCulled = false
          if (shippedHuman) {
            const materials = Array.isArray(child.material) ? child.material : [child.material]
            materials.forEach((material) => {
              if (!(material instanceof THREE.MeshStandardMaterial)) return
              material.metalness = 0
              material.roughness = Math.max(0.48, material.roughness)
              material.envMapIntensity = 0.72
              // The source marks every surface as alpha-blended even though the
              // baked textures are opaque. Opaque depth writing prevents hair,
              // eyes, mouth and jacket layers from sorting into black cut-outs.
              material.transparent = false
              material.opacity = 1
              material.alphaTest = 0
              material.depthWrite = true
              material.needsUpdate = true
            })
          }
        }
      })
      const initialBox = new THREE.Box3().setFromObject(model)
      const size = initialBox.getSize(new THREE.Vector3())
      if (!Number.isFinite(size.y) || size.y <= 0) {
        setLoadError(true)
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
        addStudioEyes(model, map.head, normalizedBox, headPosition)
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
          const currentAppearance = useStudio.getState()
          addStudioHair(model, map.head!, normalizedBox, headPosition, hair, currentAppearance.hairColor, currentAppearance.hairGloss)
        })
      }

      // This source is authored in a wide A-stance. Lower only its upper arms
      // before capturing the neutral rest pose, keeping elbows and hands fully
      // visible beside the body instead of forcing them behind the torso.
      if (shippedHuman && map.leftUpperArm && map.rightUpperArm) {
        const lowerArmInWorld = (bone: THREE.Bone, degrees: number) => {
          const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion()
          const desiredWorld = bone.getWorldQuaternion(new THREE.Quaternion())
          desiredWorld.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(degrees)))
          bone.quaternion.copy(parentWorld.invert()).multiply(desiredWorld)
        }
        lowerArmInWorld(map.leftUpperArm, -28)
        lowerArmInWorld(map.rightUpperArm, 28)
        model.updateMatrixWorld(true)
      }

      rig.current = quality.usable ? { map, rest: captureRestPose(model, map) } : null
      onRigReady?.(quality.usable ? map : null)
      if (reportStatus) setRigStatus(quality.usable ? 'rigged' : 'unrigged')

      loadedObject = model
      setObject(model)
      if (reportStatus) setStatus('ready')
    }, undefined, () => {
      if (active) {
        setLoadError(true)
        if (reportStatus) { setStatus('error'); setRigStatus('none') }
      }
    })

    return () => {
      active = false
      rig.current = null
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

  // Colour and gloss update live without reloading the actor or rebuilding its rig.
  useEffect(() => {
    const hairstyle = object?.getObjectByName('studio-short04-hair')
    if (!hairstyle) return
    hairstyle.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => {
        if (material instanceof THREE.MeshPhysicalMaterial && material.name === 'studio-hair-material') {
          applyStudioHairAppearance(material, hairColor, hairGloss)
        }
      })
    })
  }, [hairColor, hairGloss, object])

  // The imported figure gets the same head-tracking behaviour as the built-in one.
  const cameraYaw = THREE.MathUtils.radToDeg(Math.atan2(cameraPosition[0] - modelPosition[0], cameraPosition[2] - modelPosition[2]) - modelRotation)
  const effectivePose = useMemo(
    () => lookAtCamera ? { ...pose, headYaw: THREE.MathUtils.clamp(cameraYaw, -72, 72) } : pose,
    [cameraYaw, lookAtCamera, pose],
  )

  useEffect(() => {
    if (!object || !rig.current) return
    const stanceSplay = THREE.MathUtils.radToDeg(Math.atan2(effectivePose.stanceWidth / 2 - 0.083, 0.865))
    applyPoseToSkeleton(object, rig.current.map, rig.current.rest, effectivePose, stanceSplay)
    applyExpressionToMorphs(object, effectivePose)
  }, [effectivePose, object])

  if (object) return <primitive object={object} rotation={url.startsWith('/models/lumen-human/') ? [0, 0, 0] : undefined} />
  return loadError ? <DefaultMannequin pose={poseOverride} /> : null
}

function Mannequin() {
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
  const seatedLift = Math.min(modelPose.leftLeg, modelPose.rightLeg) > 60 ? seatHeight ?? 0.46 : 0
  const group = useRef<THREE.Group>(null)
  const [boneMap, setBoneMap] = useState<BoneMap | null>(null)
  const transformControl = useRef<TransformControlsImpl>(null)
  // An imported model with no recognised skeleton cannot be posed, so it gets
  // no handles rather than handles that quietly do nothing.
  const effectiveTransformMode = layoutOnly ? 'translate' : transformMode
  const showHandles = !layoutOnly && canControl && poseHandles && selected && view !== 'camera' && modelRigStatus === 'rigged'

  const model = (
    <group ref={group} position={[position[0], position[1] + seatedLift, position[2]]} rotation={[0, rotation, 0]} scale={modelHeight / 1.82} onClick={(event) => { event.stopPropagation(); if (canControl) selectObject('model') }}>
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
        showY
        showX={effectiveTransformMode === 'translate'}
        showZ={effectiveTransformMode === 'translate'}
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
  const seatedLift = Math.min(object.subjectPose.leftLeg, object.subjectPose.rightLeg) > 60 ? seatHeight ?? 0.46 : 0
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
        reportStatus={false}
        onRigReady={setBoneMap}
      />
    </group>
  )
}

function StudioObjectMesh({ object }: { object: StudioObject }) {
  const material = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: object.color,
    roughness: object.material === 'matte' ? 0.78 : object.material === 'glossy' ? 0.18 : 0.26,
    metalness: object.material === 'metal' ? 0.82 : 0.02,
    clearcoat: object.material === 'glossy' ? 0.65 : 0.08,
    clearcoatRoughness: 0.24,
  }), [object.color, object.material])
  useEffect(() => () => material.dispose(), [material])
  if (object.type === 'subject') return <StandaloneFigure object={object} />
  if (object.type === 'dog') return <group>
    {/* Four legs, not two. A quadruped proxy is in the scene to cast a
        believable shadow and to give the key light something at floor level to
        wrap around; a two-legged one does neither. */}
    <mesh castShadow receiveShadow position={[0, 0.44, 0.04]} scale={[0.72, 0.6, 1.08]} material={material}><capsuleGeometry args={[0.24, 0.36, 8, 20]} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.42, -0.3]} scale={[0.7, 0.68, 0.66]} material={material}><sphereGeometry args={[0.26, 24, 18]} /></mesh>
    <mesh castShadow position={[0, 0.58, 0.28]} rotation={[-0.5, 0, 0]} scale={[0.85, 1, 0.85]} material={material}><capsuleGeometry args={[0.12, 0.16, 6, 16]} /></mesh>
    <mesh castShadow position={[0, 0.69, 0.4]} scale={[0.9, 0.88, 1]} material={material}><sphereGeometry args={[0.22, 24, 18]} /></mesh>
    <mesh castShadow position={[0, 0.625, 0.6]} scale={[0.72, 0.56, 1.05]} material={material}><sphereGeometry args={[0.155, 22, 16]} /></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh castShadow position={[side * 0.155, 0.83, 0.38]} rotation={[0.18, 0, side * 0.32]} material={material}><coneGeometry args={[0.1, 0.26, 18]} /></mesh>
      {/* Foreleg: upper, lower, paw. */}
      <mesh castShadow receiveShadow position={[side * 0.16, 0.3, 0.24]} material={material}><capsuleGeometry args={[0.056, 0.2, 6, 12]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.16, 0.12, 0.245]} material={material}><capsuleGeometry args={[0.042, 0.16, 6, 12]} /></mesh>
      <mesh castShadow position={[side * 0.16, 0.038, 0.275]} scale={[1, 0.6, 1.25]} material={material}><sphereGeometry args={[0.06, 16, 12]} /></mesh>
      {/* Hind leg: the thigh is the heavier mass, which is what reads at a glance. */}
      <mesh castShadow receiveShadow position={[side * 0.17, 0.33, -0.24]} material={material}><capsuleGeometry args={[0.078, 0.16, 6, 14]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.17, 0.13, -0.245]} material={material}><capsuleGeometry args={[0.042, 0.15, 6, 12]} /></mesh>
      <mesh castShadow position={[side * 0.17, 0.038, -0.215]} scale={[1, 0.6, 1.25]} material={material}><sphereGeometry args={[0.06, 16, 12]} /></mesh>
      <mesh position={[side * 0.09, 0.72, 0.575]}><sphereGeometry args={[0.026, 14, 10]} /><meshPhysicalMaterial color="#17130f" roughness={0.1} clearcoat={0.9} /></mesh>
    </group>)}
    <mesh position={[0, 0.62, 0.735]}><sphereGeometry args={[0.043, 16, 12]} /><meshPhysicalMaterial color="#17130f" roughness={0.18} clearcoat={0.65} /></mesh>
    <mesh castShadow position={[0, 0.5, -0.5]} rotation={[0.2, 0, -0.75]} material={material}><torusGeometry args={[0.24, 0.035, 10, 28, Math.PI * 1.15]} /></mesh>
    <mesh position={[0, 0.55, 0.24]} rotation={[1.2, 0, 0]}><torusGeometry args={[0.14, 0.018, 10, 28]} /><meshStandardMaterial color="#8c3b34" roughness={0.72} /></mesh>
  </group>
  if (object.type === 'cat') return <group>
    <mesh castShadow receiveShadow position={[0, 0.34, -0.06]} scale={[0.62, 0.78, 0.86]} material={material}><sphereGeometry args={[0.27, 24, 18]} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.4, 0.14]} scale={[0.56, 0.62, 0.6]} material={material}><sphereGeometry args={[0.24, 22, 16]} /></mesh>
    <mesh castShadow position={[0, 0.62, 0.14]} scale={[0.95, 0.88, 0.9]} material={material}><sphereGeometry args={[0.21, 24, 18]} /></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh castShadow position={[side * 0.125, 0.8, 0.12]} rotation={[0, 0, side * -0.14]} material={material}><coneGeometry args={[0.1, 0.23, 16]} /></mesh>
      <mesh position={[side * 0.075, 0.655, 0.32]} rotation={[0, side * 0.12, 0]} scale={[1.3, 0.72, 0.5]}><sphereGeometry args={[0.033, 14, 10]} /><meshPhysicalMaterial color="#a9d06e" roughness={0.1} clearcoat={0.9} /></mesh>
      {/* Foreleg. */}
      <mesh castShadow receiveShadow position={[side * 0.105, 0.24, 0.15]} material={material}><capsuleGeometry args={[0.04, 0.12, 6, 12]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.105, 0.09, 0.155]} material={material}><capsuleGeometry args={[0.031, 0.1, 6, 10]} /></mesh>
      <mesh castShadow position={[side * 0.105, 0.028, 0.175]} scale={[1, 0.6, 1.2]} material={material}><sphereGeometry args={[0.045, 14, 10]} /></mesh>
      {/* Hind leg. */}
      <mesh castShadow receiveShadow position={[side * 0.115, 0.26, -0.18]} material={material}><capsuleGeometry args={[0.06, 0.1, 6, 12]} /></mesh>
      <mesh castShadow receiveShadow position={[side * 0.115, 0.09, -0.185]} material={material}><capsuleGeometry args={[0.031, 0.1, 6, 10]} /></mesh>
      <mesh castShadow position={[side * 0.115, 0.028, -0.16]} scale={[1, 0.6, 1.2]} material={material}><sphereGeometry args={[0.045, 14, 10]} /></mesh>
    </group>)}
    <mesh position={[0, 0.575, 0.325]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.025, 0.038, 3]} /><meshStandardMaterial color="#a66f72" roughness={0.6} /></mesh>
    <mesh castShadow position={[0.11, 0.38, -0.3]} rotation={[0.15, 0.15, -0.42]} material={material}><torusGeometry args={[0.3, 0.026, 9, 30, Math.PI * 1.45]} /></mesh>
  </group>
  if (object.type === 'product') return <group>
    <RoundedBox castShadow receiveShadow args={[0.38, 0.12, 0.38]} radius={0.035} smoothness={3} position={[0, 0.06, 0]} material={material} />
    {/* Bottle, built as body then shoulder then neck then cap. A straight
        cylinder gives a key light no shoulder to run down, and the shoulder is
        the shot. */}
    <mesh castShadow receiveShadow position={[0, 0.31, 0]} material={material}><cylinderGeometry args={[0.148, 0.16, 0.38, 48]} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.545, 0]} material={material}><cylinderGeometry args={[0.074, 0.148, 0.09, 48]} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.625, 0]} material={material}><cylinderGeometry args={[0.07, 0.074, 0.07, 32]} /></mesh>
    <mesh castShadow position={[0, 0.705, 0]}><cylinderGeometry args={[0.086, 0.086, 0.09, 40]} /><meshStandardMaterial color="#202320" metalness={0.72} roughness={0.22} /></mesh>
    <mesh position={[0, 0.705, 0]}><torusGeometry args={[0.0865, 0.006, 8, 40]} /><meshStandardMaterial color="#14170f" metalness={0.6} roughness={0.4} /></mesh>
    {/* The label wraps the bottle, so it curves through the highlight. */}
    <mesh position={[0, 0.31, 0]}>
      <cylinderGeometry args={[0.1535, 0.1595, 0.19, 48, 1, true]} />
      <meshPhysicalMaterial color="#f3efe5" roughness={0.74} side={THREE.DoubleSide} />
    </mesh>
    <mesh position={[0, 0.345, 0]}>
      <cylinderGeometry args={[0.1545, 0.1555, 0.014, 48, 1, true]} />
      <meshStandardMaterial color="#3f433e" roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
  </group>
  // Seat and table tops land exactly on the heights in layout.ts, so a figure
  // placed on one sits on the surface instead of a centimetre inside it.
  if (object.type === 'chair') return <>
    <RoundedBox castShadow receiveShadow args={[0.7, 0.1, 0.64]} radius={0.03} smoothness={4} position={[0, 0.49, 0]} material={material} />
    <RoundedBox castShadow receiveShadow args={[0.72, 0.055, 0.66]} radius={0.018} smoothness={3} position={[0, 0.418, 0]} material={material} />
    <RoundedBox castShadow receiveShadow args={[0.66, 0.6, 0.09]} radius={0.04} smoothness={4} position={[0, 0.85, 0.28]} rotation={[-0.11, 0, 0]} material={material} />
    {([[-0.29, -0.26], [0.29, -0.26], [-0.29, 0.26], [0.29, 0.26]] as const).map(([x, z], index) => (
      <mesh key={index} castShadow receiveShadow position={[x, 0.195, z]}>
        <cylinderGeometry args={[0.023, 0.033, 0.39, 14]} />
        <meshStandardMaterial color="#2c302d" metalness={0.72} roughness={0.28} />
      </mesh>
    ))}
    {/* Stretchers — the bars that stop a chair racking, and the detail that
        separates a chair from four sticks under a slab. */}
    {([-0.29, 0.29] as const).map((x) => (
      <Strut key={x} from={[x, 0.15, -0.26]} to={[x, 0.15, 0.26]} radius={0.015} color="#2c302d" gear={false} />
    ))}
    <Strut from={[-0.29, 0.15, 0]} to={[0.29, 0.15, 0]} radius={0.015} color="#2c302d" gear={false} />
    {/* Back uprights, carrying the panel down to the seat frame. */}
    {([-0.28, 0.28] as const).map((x) => (
      <Strut key={x} from={[x, 0.44, 0.27]} to={[x * 0.98, 1.13, 0.35]} radius={0.019} color="#2c302d" gear={false} />
    ))}
  </>
  if (object.type === 'table') return <>
    <RoundedBox castShadow receiveShadow args={[1.38, 0.06, 0.78]} radius={0.018} smoothness={3} position={[0, 0.85, 0]} material={material} />
    <RoundedBox castShadow receiveShadow args={[1.33, 0.035, 0.73]} radius={0.012} smoothness={2} position={[0, 0.807, 0]} material={material} />
    {/* Apron on both axes. One rail across the middle was holding nothing. */}
    {([-0.32, 0.32] as const).map((z) => (
      <mesh key={z} castShadow receiveShadow position={[0, 0.755, z]} material={material}><boxGeometry args={[1.16, 0.09, 0.036]} /></mesh>
    ))}
    {([-0.6, 0.6] as const).map((x) => (
      <mesh key={x} castShadow receiveShadow position={[x, 0.755, 0]} material={material}><boxGeometry args={[0.036, 0.09, 0.6]} /></mesh>
    ))}
    {([[-0.6, -0.32], [0.6, -0.32], [-0.6, 0.32], [0.6, 0.32]] as const).map(([x, z], index) => (
      <group key={index}>
        <mesh castShadow receiveShadow position={[x, 0.385, z]} material={material}><cylinderGeometry args={[0.032, 0.046, 0.77, 16]} /></mesh>
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
  if (object.type === 'sphere') return <mesh castShadow receiveShadow material={material}><sphereGeometry args={[0.5, 40, 28]} /></mesh>
  return <RoundedBox castShadow receiveShadow args={[0.82, 0.82, 0.82]} radius={0.045} smoothness={3} material={material} />
}

function MovableStudioObject({ object }: { object: StudioObject }) {
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
  return <>{content}{canControl && selected && view !== 'camera' && !object.locked && <TransformControls ref={transformControl} object={group as RefObject<THREE.Object3D>} mode={effectiveTransformMode} size={0.7} translationSnap={0.05} rotationSnap={THREE.MathUtils.degToRad(5)} showX={effectiveTransformMode === 'translate'} showY showZ={effectiveTransformMode === 'translate'} onMouseUp={() => {
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
function Strut({ from, to, radius, surface = GEAR.aluminium, color, taper = 1, cast = true, gear = true }: {
  from: [number, number, number]
  to: [number, number, number]
  radius: number
  surface?: GearSurface
  /** Overrides the surface colour for set dressing that is not studio hardware. */
  color?: string
  taper?: number
  cast?: boolean
  gear?: boolean
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
    <mesh castShadow={cast} position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius * taper, radius, length, 12]} />
      <meshStandardMaterial {...gearMaterial(surface, gear ? lift : 0)} {...(color ? { color, emissive: color } : {})} />
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
          showZ={effectiveAimMode || effectiveTransformMode === 'translate'}
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
      showY
      showZ={layoutOnly || transformMode === 'translate'}
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

export function StudioScene() {
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
    <>
      <CameraRig />
      <TimelinePlayback />
      <ambientLight intensity={layoutOnly ? Math.max(0.72, ambientLevel / 48) : soloLightId ? 0.015 : ambientLevel / 75} color={ambientColor} />
      <EnvironmentLighting />
      <Backdrop />
      <Mannequin />
      {lights.map((light) => <Softbox key={light.id} light={light} />)}
      {modifiers.map((modifier) => <GripModifier key={modifier.id} modifier={modifier} />)}
      {studioObjects.map((object) => <MovableStudioObject key={object.id} object={object} />)}
      {renderMode !== 'path' && <CameraProp />}
      {renderMode !== 'path' && <Grid position={[0, 0.006, 1.5]} args={[10, 10]} cellSize={0.5} cellThickness={0.4} cellColor="#747872" sectionSize={2} sectionThickness={0.75} sectionColor="#9ba197" fadeDistance={12} fadeStrength={1.8} infiniteGrid />}
      {renderMode !== 'path' && <MeasureTool />}
      <CameraImaging />
      <ExposureProbe />
      {renderMode === 'path' && <Suspense fallback={null}><PathTracingRenderer /></Suspense>}
    </>
  )
}
