import { Grid, Line, OrbitControls, RoundedBox, TransformControls } from '@react-three/drei'
import { BrightnessContrast, DepthOfField, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame, useThree } from '@react-three/fiber'
import { Effect, ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { PhysicalCamera, WebGLPathTracer } from 'three-gpu-pathtracer'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { IESLoader } from 'three/addons/loaders/IESLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { breathingAdjustedFocalLength, calculateDepthOfField } from '../optics'
import { useStudio, type MakeupStyle, type OutfitFabric, type StudioLight, type StudioModifier, type StudioObject } from '../store'
import { captureLightOutput, opticTransmission, PATHTRACE_CANDELA_SCALE, PREVIEW_CANDELA_SCALE } from '../lightProfiles'
import { CAMERA_BODIES, LENS_PROFILES } from '../cameraProfiles'
import { COLOR_PROFILES, whiteBalanceGains } from '../colorScience'

const SENSOR_WIDTH = { 'full-frame': 36, 'aps-c': 23.5, mft: 17.3 } as const
const SENSOR_COC = { 'full-frame': 0.03, 'aps-c': 0.019, mft: 0.015 } as const

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
      perspective.position.set(6.8, 4.8, 7.2)
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

  return <OrbitControls enabled={view === 'studio'} makeDefault target={[0, 1.15, 0]} minDistance={3.5} maxDistance={13} maxPolarAngle={Math.PI / 2.02} />
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

function Backdrop() {
  const roomWidth = useStudio((state) => state.roomWidth)
  const roomDepth = useStudio((state) => state.roomDepth)
  const roomHeight = useStudio((state) => state.roomHeight)
  const wallColor = useStudio((state) => state.wallColor)
  const floorColor = useStudio((state) => state.floorColor)
  const halfWidth = roomWidth / 2
  return (
    <group>
      <mesh receiveShadow position={[0, roomHeight / 2, -roomDepth * 0.25]}>
        <planeGeometry args={[roomWidth, roomHeight]} />
        <meshStandardMaterial color={wallColor} roughness={0.96} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, roomDepth * 0.25]}>
        <planeGeometry args={[roomWidth, roomDepth]} />
        <meshStandardMaterial color={floorColor} roughness={0.94} />
      </mesh>
      <mesh receiveShadow rotation={[0, Math.PI / 2, 0]} position={[-halfWidth, roomHeight / 2, roomDepth * 0.25]}><planeGeometry args={[roomDepth, roomHeight]} /><meshStandardMaterial color={wallColor} roughness={0.95} /></mesh>
      <mesh receiveShadow rotation={[0, -Math.PI / 2, 0]} position={[halfWidth, roomHeight / 2, roomDepth * 0.25]}><planeGeometry args={[roomDepth, roomHeight]} /><meshStandardMaterial color={wallColor} roughness={0.95} /></mesh>
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
    {sunEnabled && <directionalLight position={sunPosition} intensity={sunIntensity / 18} color="#fff1d4" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />}
    {windowEnabled && <group position={[-roomWidth / 2 + 0.03, 2.15, 0.25]} rotation={[0, Math.PI / 2, 0]}>
      <rectAreaLight width={1.8} height={2.2} intensity={sunIntensity / 22 + 1.2} color="#dceaff" />
      <mesh><planeGeometry args={[1.8, 2.2]} /><meshBasicMaterial color="#b9d4de" transparent opacity={0.2} side={THREE.DoubleSide} /></mesh>
      {[-0.45, 0.45].map((x) => <mesh key={x} position={[x, 0, 0.01]}><planeGeometry args={[0.035, 2.2]} /><meshBasicMaterial color="#303630" /></mesh>)}
      <mesh position={[0, 0, 0.01]}><planeGeometry args={[1.8, 0.035]} /><meshBasicMaterial color="#303630" /></mesh>
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

type SubjectAppearance = {
  skinRoughness: number
  skinOil: number
  subsurface: number
  makeup: MakeupStyle
  eyeColor: string
  hairColor: string
  hairGloss: number
  outfitFabric: OutfitFabric
}

function DefaultMannequin({ pose: poseOverride, skinColor: skinOverride, outfitColor: outfitOverride, appearance: appearanceOverride }: { pose?: StudioObject['subjectPose']; skinColor?: string; outfitColor?: string; appearance?: SubjectAppearance } = {}) {
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
  const lookAtCamera = useStudio((state) => state.modelLookAtCamera)
  const eyesAtCamera = useStudio((state) => state.modelEyesAtCamera)
  const cameraPosition = useStudio((state) => state.cameraPosition)
  const modelPosition = useStudio((state) => state.modelPosition)
  const modelRotation = useStudio((state) => state.modelRotation)
  const basePose = poseOverride ?? mainPose
  const cameraYaw = THREE.MathUtils.radToDeg(Math.atan2(cameraPosition[0] - modelPosition[0], cameraPosition[2] - modelPosition[2]) - modelRotation)
  const pose = !poseOverride && lookAtCamera ? { ...basePose, headYaw: THREE.MathUtils.clamp(cameraYaw, -72, 72) } : basePose
  const eyeAim = !poseOverride && eyesAtCamera ? THREE.MathUtils.clamp(cameraYaw / 72, -1, 1) * 0.0035 : 0
  const skinColor = skinOverride ?? mainSkinColor
  const outfitColor = outfitOverride ?? mainOutfitColor
  const appearance = appearanceOverride ?? { skinRoughness: mainSkinRoughness, skinOil: mainSkinOil, subsurface: mainSubsurface, makeup: mainMakeup, eyeColor: mainEyeColor, hairColor: mainHairColor, hairGloss: mainHairGloss, outfitFabric: mainOutfitFabric }
  const skin = useMemo(() => {
    const base = new THREE.Color(skinColor)
    return new THREE.MeshPhysicalMaterial({
      color: base,
      roughness: THREE.MathUtils.lerp(0.24, 0.9, appearance.skinRoughness / 100),
      metalness: 0,
      clearcoat: appearance.skinOil / 100 * 0.48,
      clearcoatRoughness: THREE.MathUtils.lerp(0.12, 0.42, appearance.skinRoughness / 100),
      sheen: appearance.subsurface / 100 * 0.72,
      sheenColor: base.clone().lerp(new THREE.Color('#ff8a76'), 0.38),
      sheenRoughness: 0.78,
      emissive: base.clone().multiplyScalar(0.12),
      emissiveIntensity: appearance.subsurface / 100 * 0.08,
    })
  }, [appearance.skinOil, appearance.skinRoughness, appearance.subsurface, skinColor])
  const outfit = useMemo(() => {
    const fabric = appearance.outfitFabric
    return new THREE.MeshPhysicalMaterial({
      color: outfitColor,
      metalness: 0,
      roughness: fabric === 'cotton' ? 0.88 : fabric === 'silk' ? 0.38 : 0.42,
      sheen: fabric === 'silk' ? 0.72 : fabric === 'cotton' ? 0.14 : 0.05,
      sheenColor: new THREE.Color(outfitColor).lerp(new THREE.Color('#ffffff'), 0.35),
      sheenRoughness: fabric === 'silk' ? 0.22 : 0.72,
      clearcoat: fabric === 'leather' ? 0.42 : 0,
      clearcoatRoughness: 0.34,
    })
  }, [appearance.outfitFabric, outfitColor])
  const hair = useMemo(() => new THREE.MeshPhysicalMaterial({ color: appearance.hairColor, roughness: THREE.MathUtils.lerp(0.72, 0.18, appearance.hairGloss / 100), sheen: appearance.hairGloss / 100, sheenColor: new THREE.Color(appearance.hairColor).lerp(new THREE.Color('#ffffff'), 0.28), sheenRoughness: 0.25 }), [appearance.hairColor, appearance.hairGloss])
  useEffect(() => () => { skin.dispose(); outfit.dispose(); hair.dispose() }, [hair, outfit, skin])
  const rad = THREE.MathUtils.degToRad

  const arm = (side: 'left' | 'right') => {
    const direction = side === 'left' ? -1 : 1
    const shoulder = side === 'left' ? pose.leftArm : pose.rightArm
    const elbow = side === 'left' ? pose.leftElbow : pose.rightElbow
    return <group position={[direction * 0.37, 1.3, 0]} rotation={[0, 0, rad(shoulder)]}>
      <mesh castShadow position={[0, -0.19, 0]} material={outfit}><capsuleGeometry args={[0.092, 0.25, 8, 20]} /></mesh>
      <group position={[0, -0.42, 0]} rotation={[0, 0, rad(elbow)]}>
        <mesh castShadow position={[0, -0.18, 0]} material={skin}><capsuleGeometry args={[0.067, 0.25, 8, 20]} /></mesh>
        <mesh castShadow position={[0, -0.39, 0.012]} scale={[0.72, 1.08, 0.56]} material={skin}><sphereGeometry args={[0.085, 24, 20]} /></mesh>
      </group>
    </group>
  }

  return <>
    <group position={[pose.hipShift, 0, 0]} rotation={[0, rad(pose.torsoYaw), 0]}>
      <mesh castShadow position={[0, 1.02, 0]} scale={[1.1, 0.82, 0.68]} material={outfit}><capsuleGeometry args={[0.32, 0.42, 10, 28]} /></mesh>
      <mesh castShadow position={[0, 1.5, 0]} scale={[0.88, 1, 0.82]} material={skin}><cylinderGeometry args={[0.088, 0.115, 0.24, 32]} /></mesh>
      <mesh castShadow position={[0, 1.405, 0.035]} rotation={[Math.PI / 2, 0, 0]} material={outfit}><torusGeometry args={[0.13, 0.022, 12, 36, Math.PI]} /></mesh>
      <group position={[0, 1.73, 0]} rotation={[rad(pose.headTilt), rad(pose.headYaw), 0]}>
        <mesh castShadow scale={[0.78, 1, 0.84]} material={skin}><sphereGeometry args={[0.225, 56, 48]} /></mesh>
        <mesh castShadow position={[0, -0.095, 0.008]} scale={[0.7, 0.6, 0.75]} material={skin}><sphereGeometry args={[0.19, 44, 36]} /></mesh>
        <mesh castShadow position={[0, 0.028, -0.008]} scale={[0.81, 1.025, 0.87]} material={hair}><sphereGeometry args={[0.226, 56, 36, 0, Math.PI * 2, 0, Math.PI * 0.48]} /></mesh>
        <mesh castShadow position={[0, 0.02, -0.132]} scale={[0.73, 0.92, 0.32]} material={hair}><sphereGeometry args={[0.22, 40, 32]} /></mesh>
        {([-1, 1] as const).map((side) => <mesh key={`ear-${side}`} castShadow position={[side * 0.177, -0.006, -0.004]} scale={[0.3, 0.56, 0.24]} material={skin}><sphereGeometry args={[0.062, 22, 18]} /></mesh>)}
        {([-1, 1] as const).map((side) => <group key={side} position={[side * 0.063, 0.025, 0.187]}>
          <mesh scale={[1, 0.38, 0.24]}><sphereGeometry args={[0.023, 28, 20]} /><meshPhysicalMaterial color="#f5f1e9" roughness={0.22} clearcoat={0.62} /></mesh>
          <mesh position={[eyeAim, 0, 0.007]}><circleGeometry args={[0.0075, 24]} /><meshPhysicalMaterial color={appearance.eyeColor} roughness={0.18} clearcoat={0.9} /></mesh>
          <mesh position={[eyeAim + side * -0.002, 0.0025, 0.009]}><circleGeometry args={[0.0022, 16]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
          <mesh position={[0, 0.034, -0.004]} rotation={[0, 0, side * -0.09]} scale={[1.28, 0.12, 0.12]} material={hair}><sphereGeometry args={[0.025, 18, 12]} /></mesh>
        </group>)}
        <mesh position={[0, -0.012, 0.202]} scale={[0.42, 1, 0.42]} material={skin}><sphereGeometry args={[0.031, 24, 20]} /></mesh>
        <RoundedBox args={[0.052, 0.007, 0.004]} radius={0.003} smoothness={3} position={[0, -0.081, 0.184]}><meshPhysicalMaterial color={appearance.makeup === 'editorial' ? '#7e263c' : '#814e4c'} roughness={0.52} /></RoundedBox>
        {appearance.makeup !== 'none' && ([-1, 1] as const).map((side) => <mesh key={`cheek-${side}`} position={[side * 0.1, -0.043, 0.167]}><circleGeometry args={[0.018, 24]} /><meshBasicMaterial color={appearance.makeup === 'editorial' ? '#b93f69' : '#c87876'} transparent opacity={appearance.makeup === 'editorial' ? 0.17 : 0.07} depthWrite={false} /></mesh>)}
        {appearance.makeup === 'editorial' && ([-1, 1] as const).map((side) => <mesh key={`shadow-${side}`} position={[side * 0.063, 0.042, 0.181]} scale={[1.25, 0.25, 1]}><circleGeometry args={[0.021, 24]} /><meshBasicMaterial color="#60305e" transparent opacity={0.2} depthWrite={false} /></mesh>)}
      </group>
      {arm('left')}{arm('right')}
    </group>
    <mesh castShadow position={[0, 0.76, 0]} scale={[1.05, 0.72, 0.68]} material={outfit}><sphereGeometry args={[0.29, 32, 24]} /></mesh>
    {([-1, 1] as const).map((side) => <group key={`leg-${side}`}>
      <mesh castShadow position={[side * 0.145, 0.41, 0]} rotation={[0, 0, rad(side * 1.8)]} material={outfit}><capsuleGeometry args={[0.105, 0.65, 8, 24]} /></mesh>
      <mesh castShadow position={[side * 0.145, 0.075, 0.055]} scale={[0.92, 0.5, 1.55]}><sphereGeometry args={[0.12, 26, 20]} /><meshStandardMaterial color="#151716" roughness={0.5} /></mesh>
    </group>)}
  </>
}

function ImportedModel({ url }: { url: string }) {
  const [object, setObject] = useState<THREE.Group | null>(null)
  const setStatus = useStudio((state) => state.setModelImportStatus)

  useEffect(() => {
    let active = true
    let loadedObject: THREE.Group | null = null
    setStatus('loading')
    const loader = new GLTFLoader()
    loader.load(url, (gltf) => {
      if (!active) return
      const model = clone(gltf.scene) as THREE.Group
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })
      const initialBox = new THREE.Box3().setFromObject(model)
      const size = initialBox.getSize(new THREE.Vector3())
      if (!Number.isFinite(size.y) || size.y <= 0) {
        setStatus('error')
        return
      }
      const scale = 1.82 / size.y
      model.scale.setScalar(scale)
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      model.position.set(-center.x, -box.min.y, -center.z)
      loadedObject = model
      setObject(model)
      setStatus('ready')
    }, undefined, () => {
      if (active) setStatus('error')
    })

    return () => {
      active = false
      if (loadedObject) {
        loadedObject.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          child.geometry?.dispose()
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          materials.forEach((material) => material.dispose())
        })
      }
    }
  }, [url, setStatus])

  return object ? <primitive object={object} /> : <DefaultMannequin />
}

function Mannequin() {
  const selectObject = useStudio((state) => state.selectObject)
  const position = useStudio((state) => state.modelPosition)
  const rotation = useStudio((state) => state.modelRotation)
  const selected = useStudio((state) => state.selected === 'model')
  const transformMode = useStudio((state) => state.transformMode)
  const view = useStudio((state) => state.view)
  const setModelTransform = useStudio((state) => state.setModelTransform)
  const modelAssetUrl = useStudio((state) => state.modelAssetUrl)
  const modelHeight = useStudio((state) => state.modelHeight)
  const group = useRef<THREE.Group>(null)

  const model = (
    <group ref={group} position={position} rotation={[0, rotation, 0]} scale={modelHeight / 1.82} onClick={(event) => { event.stopPropagation(); selectObject('model') }}>
      {modelAssetUrl ? <ImportedModel url={modelAssetUrl} /> : <DefaultMannequin />}
    </group>
  )

  if (!selected || view === 'camera') return model

  return (
    <>
      {model}
      <TransformControls
        object={group as RefObject<THREE.Object3D>}
        mode={transformMode}
        size={0.72}
        translationSnap={0.05}
        rotationSnap={THREE.MathUtils.degToRad(5)}
        showY={transformMode === 'rotate'}
        showX={transformMode === 'translate'}
        showZ={transformMode === 'translate'}
        onObjectChange={() => {
          if (!group.current) return
          const nextPosition: [number, number, number] = [group.current.position.x, 0, group.current.position.z]
          setModelTransform(nextPosition, group.current.rotation.y)
        }}
      />
    </>
  )
}

function StudioObjectMaterial({ object }: { object: StudioObject }) {
  return <meshStandardMaterial color={object.color} roughness={object.material === 'matte' ? 0.82 : object.material === 'glossy' ? 0.22 : 0.28} metalness={object.material === 'metal' ? 0.82 : 0.03} />
}

function StudioObjectMesh({ object }: { object: StudioObject }) {
  if (object.type === 'subject') return <group scale={object.subjectHeight / 1.82}><DefaultMannequin pose={object.subjectPose} skinColor={object.subjectSkinColor} outfitColor={object.subjectOutfitColor} appearance={{ skinRoughness: object.subjectSkinRoughness, skinOil: object.subjectSkinOil, subsurface: object.subjectSubsurface, makeup: object.subjectMakeup, eyeColor: object.subjectEyeColor, hairColor: object.subjectHairColor, hairGloss: object.subjectHairGloss, outfitFabric: object.subjectOutfitFabric }} /></group>
  if (object.type === 'chair') return <>
    <mesh castShadow receiveShadow position={[0, 0.48, 0]}><boxGeometry args={[0.68, 0.12, 0.66]} /><StudioObjectMaterial object={object} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.91, 0.28]} rotation={[-0.08, 0, 0]}><boxGeometry args={[0.68, 0.76, 0.1]} /><StudioObjectMaterial object={object} /></mesh>
    {[[-0.26,-0.25],[0.26,-0.25],[-0.26,0.25],[0.26,0.25]].map(([x,z], index) => <mesh key={index} castShadow position={[x,0.22,z]}><boxGeometry args={[0.07,0.46,0.07]} /><StudioObjectMaterial object={object} /></mesh>)}
  </>
  if (object.type === 'table') return <>
    <mesh castShadow receiveShadow position={[0, 0.82, 0]}><boxGeometry args={[1.35, 0.12, 0.75]} /><StudioObjectMaterial object={object} /></mesh>
    {[[-0.55,-0.25],[0.55,-0.25],[-0.55,0.25],[0.55,0.25]].map(([x,z], index) => <mesh key={index} castShadow position={[x,0.39,z]}><boxGeometry args={[0.08,0.78,0.08]} /><StudioObjectMaterial object={object} /></mesh>)}
  </>
  if (object.type === 'plinth') return <mesh castShadow receiveShadow position={[0, 0.55, 0]}><cylinderGeometry args={[0.42, 0.46, 1.1, 48]} /><StudioObjectMaterial object={object} /></mesh>
  if (object.type === 'sphere') return <mesh castShadow receiveShadow><sphereGeometry args={[0.5, 48, 48]} /><StudioObjectMaterial object={object} /></mesh>
  return <mesh castShadow receiveShadow><boxGeometry args={[0.82, 0.82, 0.82]} /><StudioObjectMaterial object={object} /></mesh>
}

function MovableStudioObject({ object }: { object: StudioObject }) {
  const selected = useStudio((state) => state.selected === object.id)
  const selectObject = useStudio((state) => state.selectObject)
  const view = useStudio((state) => state.view)
  const transformMode = useStudio((state) => state.transformMode)
  const setTransform = useStudio((state) => state.setStudioObjectTransform)
  const group = useRef<THREE.Group>(null)
  const outlineSize: [number, number, number] = object.type === 'subject' ? [0.95, object.subjectHeight + 0.12, 0.65] : object.type === 'table' ? [1.5, 1, 0.9] : object.type === 'chair' ? [0.85, 1.4, 0.8] : object.type === 'plinth' ? [1, 1.25, 1] : [1, 1, 1]
  const yOffset = object.type === 'subject' ? object.subjectHeight / 2 : object.type === 'table' ? 0.45 : object.type === 'chair' ? 0.65 : object.type === 'plinth' ? 0.55 : 0
  const content = <group ref={group} position={object.position} rotation={[0, object.rotationY, 0]} scale={object.type === 'subject' ? 1 : object.scale} onClick={(event) => { event.stopPropagation(); selectObject(object.id) }}>
    <StudioObjectMesh object={object} />
    {selected && view !== 'camera' && <mesh position={[0, yOffset, 0]}><boxGeometry args={outlineSize} /><meshBasicMaterial color={object.locked ? '#ff8b62' : '#d8ff3e'} wireframe transparent opacity={0.48} /></mesh>}
  </group>
  return <>{content}{selected && view !== 'camera' && !object.locked && <TransformControls object={group as RefObject<THREE.Object3D>} mode={transformMode} size={0.7} translationSnap={0.05} rotationSnap={THREE.MathUtils.degToRad(5)} showX={transformMode === 'translate'} showY showZ={transformMode === 'translate'} onObjectChange={() => {
    if (!group.current) return
    setTransform(object.id, [Number(group.current.position.x.toFixed(2)), Number(Math.max(0, group.current.position.y).toFixed(2)), Number(group.current.position.z.toFixed(2))], Number(group.current.rotation.y.toFixed(3)))
  }} />}</>
}

function Softbox({ light }: { light: StudioLight }) {
  const { id: lightId, position, temperature, shape, grid: gridEnabled, colorMode, rgb, enabled } = light
  const softboxEnabled = light.optic === 'softbox'
  const areaModifier = ['softbox', 'umbrella-shoot', 'umbrella-reflect', 'beauty-dish', 'deep-parabolic', 'lantern'].includes(light.optic)
  const selectObject = useStudio((state) => state.selectObject)
  const selected = useStudio((state) => state.selectedIds.includes(lightId))
  const primary = useStudio((state) => state.selected === lightId)
  const view = useStudio((state) => state.view)
  const renderMode = useStudio((state) => state.renderMode)
  const soloLightId = useStudio((state) => state.soloLightId)
  const setLightPosition = useStudio((state) => state.setLightPosition)
  const setLightTarget = useStudio((state) => state.setLightTarget)
  const aimMode = useStudio((state) => state.lightAimMode)
  const shutter = useStudio((state) => state.shutter)
  const syncSpeed = useStudio((state) => state.syncSpeed)
  const iesUrl = useStudio((state) => state.iesUrl)
  const target = useMemo(() => new THREE.Object3D(), [])
  const visual = useRef<THREE.Group>(null)
  const rig = useRef<THREE.Group>(null)
  const spot = useRef<(THREE.SpotLight & { radius?: number; iesMap?: THREE.Texture | null })>(null)
  const [iesTexture, setIesTexture] = useState<THREE.Texture | null>(null)
  const color = useMemo(() => colorMode === 'rgb' ? new THREE.Color(rgb) : kelvinColor(temperature), [colorMode, rgb, temperature])
  const goboTexture = useMemo(() => createGoboTexture(light.optic === 'projection' ? light.goboPattern : 'none', light.goboRotation, light.goboScale), [light.goboPattern, light.goboRotation, light.goboScale, light.optic])
  const outputLumens = captureLightOutput(light, shutter, syncSpeed)
  const fixtureScale = useMemo<[number, number, number]>(() => {
    const modifierScale = areaModifier ? 1 : light.headType === 'panel' ? 0.62 : 0.36
    return [light.modifierWidth / 1.12 * modifierScale, light.modifierHeight / 1.12 * modifierScale, 1]
  }, [areaModifier, light.headType, light.modifierHeight, light.modifierWidth])
  const sourceRadius = areaModifier
    ? Math.max(light.modifierWidth, light.modifierHeight) * (shape === 'strip' ? 0.28 : 0.44)
    : light.headType === 'panel' ? Math.max(light.modifierWidth, light.modifierHeight) * 0.22 : 0.025
  const beamAngle = THREE.MathUtils.degToRad(light.beamAngle / 2)
  const penumbra = THREE.MathUtils.clamp((light.feather / 100) * (gridEnabled ? 0.55 : areaModifier ? 1 : 0.45), 0, 1)
  const modifierOutput = opticTransmission(light)
  const effectiveEnabled = enabled && (!soloLightId || soloLightId === lightId)
  const standOffset = useMemo<[number, number]>(() => {
    const awayX = position[0] - light.target[0]
    const awayZ = position[2] - light.target[2]
    const length = Math.max(0.001, Math.hypot(awayX, awayZ))
    const clearance = Math.max(0.32, Math.min(0.58, Math.max(light.modifierWidth, light.modifierHeight) * 0.42))
    return [awayX / length * clearance, awayZ / length * clearance]
  }, [light.modifierHeight, light.modifierWidth, light.target, position])

  useEffect(() => {
    target.position.set(...light.target)
    if (spot.current) spot.current.radius = sourceRadius
  }, [light.target, sourceRadius, target])

  useEffect(() => () => goboTexture?.dispose(), [goboTexture])
  useEffect(() => {
    if (!iesUrl) { setIesTexture(null); return }
    let active = true
    let loadedTexture: THREE.Texture | null = null
    new IESLoader().load(iesUrl, (texture) => { if (active) { loadedTexture = texture; setIesTexture(texture) } else texture.dispose() })
    return () => { active = false; loadedTexture?.dispose() }
  }, [iesUrl])
  useEffect(() => { if (spot.current) spot.current.iesMap = iesTexture }, [iesTexture])

  useFrame(() => {
    visual.current?.lookAt(...light.target)
  })

  const softbox = (
    <group ref={rig} position={position} onClick={(event) => { event.stopPropagation(); selectObject(lightId, Boolean((event.nativeEvent as PointerEvent).shiftKey)) }}>
      <spotLight
        ref={spot}
        position={[0, 0, 0]} target={target} color={color} intensity={effectiveEnabled ? outputLumens / (renderMode === 'path' ? PATHTRACE_CANDELA_SCALE : PREVIEW_CANDELA_SCALE) : 0}
        map={goboTexture ?? undefined}
        angle={beamAngle} penumbra={penumbra} decay={2} distance={10} castShadow
        shadow-mapSize-width={lightId === 'key' ? 1024 : 512} shadow-mapSize-height={lightId === 'key' ? 1024 : 512} shadow-bias={-0.0004}
        shadow-radius={areaModifier ? THREE.MathUtils.clamp(Math.max(light.modifierWidth, light.modifierHeight) * 3.2, 1.5, 7) : 0.7}
      />
      <group ref={visual} scale={fixtureScale}>
        {shape === 'round' ? (
          <mesh position={[0, 0, -0.2]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.64, 0.64, light.headType === 'panel' ? 0.16 : 0.4, 48]} /><meshStandardMaterial color="#151816" roughness={0.72} /></mesh>
        ) : (
          <mesh position={[0, 0, -0.23]}><boxGeometry args={[1.25, 1.25, light.headType === 'panel' ? 0.14 : light.headType === 'strobe' ? 0.3 : 0.4]} /><meshStandardMaterial color="#151816" roughness={0.72} /></mesh>
        )}
        <mesh position={[0, 0, -0.45]}><cylinderGeometry args={[0.15, 0.22, 0.3, 24]} /><meshStandardMaterial color="#202321" metalness={0.65} roughness={0.3} /></mesh>
        <mesh position={[0, 0, 0.001]}>
          {shape === 'round' ? <circleGeometry args={[0.57, 48]} /> : <planeGeometry args={[1.12, 1.12]} />}
          <meshStandardMaterial color={effectiveEnabled ? color : '#31342f'} emissive={color} emissiveIntensity={effectiveEnabled ? (softboxEnabled ? 1.5 : 2.8) : 0} roughness={softboxEnabled ? 0.82 : 0.35} side={THREE.DoubleSide} />
        </mesh>
        {gridEnabled && <group position={[0, 0, 0.016]}>
          {[-0.42, -0.21, 0, 0.21, 0.42].map((offset) => <mesh key={`v-${offset}`} position={[offset, 0, 0]}><planeGeometry args={[0.018, 1.02]} /><meshBasicMaterial color="#151815" side={THREE.DoubleSide} /></mesh>)}
          {[-0.42, -0.21, 0, 0.21, 0.42].map((offset) => <mesh key={`h-${offset}`} position={[0, offset, 0]}><planeGeometry args={[1.02, 0.018]} /><meshBasicMaterial color="#151815" side={THREE.DoubleSide} /></mesh>)}
        </group>}
        {light.optic === 'umbrella-shoot' && <group position={[0, 0, 0.12]}><mesh rotation={[Math.PI / 2, 0, 0]}><sphereGeometry args={[0.7, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshPhysicalMaterial color="#f5f3e8" transmission={0.42} transparent opacity={0.72} roughness={0.88} side={THREE.DoubleSide} /></mesh><mesh position={[0, 0, -0.28]}><cylinderGeometry args={[0.012, 0.012, 1.05, 10]} /><meshStandardMaterial color="#454b45" metalness={0.75} /></mesh></group>}
        {light.optic === 'umbrella-reflect' && <group position={[0, 0, 0.12]}><mesh rotation={[Math.PI / 2, 0, 0]}><sphereGeometry args={[0.7, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#d9ddd8" metalness={0.82} roughness={0.24} side={THREE.DoubleSide} /></mesh><mesh position={[0, 0, -0.28]}><cylinderGeometry args={[0.012, 0.012, 1.05, 10]} /><meshStandardMaterial color="#454b45" metalness={0.75} /></mesh></group>}
        {light.optic === 'beauty-dish' && <group position={[0, 0, 0.16]}><mesh rotation={[Math.PI / 2, 0, 0]}><sphereGeometry args={[0.58, 48, 12, 0, Math.PI * 2, 0, Math.PI / 3]} /><meshStandardMaterial color="#c9cec7" metalness={0.55} roughness={0.34} side={THREE.DoubleSide} /></mesh><mesh position={[0, 0, 0.23]}><cylinderGeometry args={[0.13, 0.16, 0.055, 32]} /><meshStandardMaterial color="#d6dad3" metalness={0.52} roughness={0.3} /></mesh></group>}
        {light.optic === 'deep-parabolic' && <mesh position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.64, 0.22, 0.72, 48, 1, true]} /><meshStandardMaterial color="#babfb8" metalness={0.62} roughness={0.28} side={THREE.DoubleSide} /></mesh>}
        {light.optic === 'lantern' && <mesh position={[0, 0, 0.18]} scale={[0.9, 0.9, 0.72]}><sphereGeometry args={[0.62, 40, 28]} /><meshPhysicalMaterial color={color} emissive={color} emissiveIntensity={effectiveEnabled ? 0.9 : 0} transmission={0.18} transparent opacity={0.8} roughness={0.9} side={THREE.DoubleSide} /></mesh>}
        {light.optic === 'standard' && <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.48, 0.3, 0.36, 32, 1, true]} /><meshStandardMaterial color="#1b1f1b" metalness={0.55} roughness={0.38} side={THREE.DoubleSide} /></mesh>}
        {light.optic === 'fresnel' && <group position={[0, 0, 0.08]}>{[0.18, 0.3, 0.42].map((radius) => <mesh key={radius}><torusGeometry args={[radius, 0.016, 8, 40]} /><meshStandardMaterial color="#555d54" metalness={0.5} roughness={0.3} /></mesh>)}</group>}
        {light.optic === 'snoot' && <mesh position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.17, 0.32, 0.65, 32, 1, true]} /><meshStandardMaterial color="#111411" metalness={0.68} roughness={0.25} side={THREE.DoubleSide} /></mesh>}
        {light.optic === 'projection' && <group><mesh position={[0, 0, 0.34]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.18, 0.27, 0.72, 32]} /><meshStandardMaterial color="#121512" metalness={0.72} roughness={0.22} /></mesh><mesh position={[0, 0, 0.72]}><circleGeometry args={[0.15, 36]} /><meshStandardMaterial color="#303730" emissive={color} emissiveIntensity={effectiveEnabled ? 0.5 : 0} /></mesh></group>}
        {light.optic === 'projection' && light.goboPattern !== 'none' && <group position={[0, 0, 0.79]} rotation={[0, 0, THREE.MathUtils.degToRad(light.goboRotation)]} scale={light.goboScale}>
          {light.goboPattern === 'window' && <><mesh castShadow><planeGeometry args={[0.07, 0.64]} /><meshBasicMaterial color="#050605" side={THREE.DoubleSide} /></mesh><mesh castShadow><planeGeometry args={[0.64, 0.07]} /><meshBasicMaterial color="#050605" side={THREE.DoubleSide} /></mesh></>}
          {light.goboPattern === 'blinds' && [-0.24, -0.12, 0, 0.12, 0.24].map((offset) => <mesh key={offset} castShadow position={[0, offset, 0]}><planeGeometry args={[0.68, 0.055]} /><meshBasicMaterial color="#050605" side={THREE.DoubleSide} /></mesh>)}
          {light.goboPattern === 'foliage' && [[-0.2,0.17,0.16,0.09],[0.18,0.2,0.2,0.1],[-0.12,-0.13,0.19,0.11],[0.23,-0.17,0.13,0.08],[0.03,0.02,0.1,0.06]].map(([x,y,w,h], index) => <mesh key={index} castShadow position={[x,y,0]} rotation={[0,0,index * 0.72]} scale={[w,h,1]}><circleGeometry args={[1,18]} /><meshBasicMaterial color="#050605" side={THREE.DoubleSide} /></mesh>)}
          {light.goboPattern === 'breakup' && [[-0.22,0.2,0.28],[0.18,0.18,-0.45],[-0.12,-0.08,0.7],[0.2,-0.19,-0.2],[0.02,0.02,1.1]].map(([x,y,r], index) => <mesh key={index} castShadow position={[x,y,0]} rotation={[0,0,r]}><planeGeometry args={[0.32,0.055]} /><meshBasicMaterial color="#050605" side={THREE.DoubleSide} /></mesh>)}
        </group>}
        {light.optic === 'barn-doors' && <group position={[0, 0, 0.12]}>
          {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((rotation) => <group key={rotation} rotation={[0, 0, rotation]}><mesh position={[0, 0.48, 0.1]} rotation={[THREE.MathUtils.degToRad(light.barnDoorAngle), 0, 0]}><planeGeometry args={[0.72, 0.48]} /><meshStandardMaterial color="#101310" metalness={0.65} roughness={0.28} side={THREE.DoubleSide} /></mesh></group>)}
        </group>}
        {selected && view !== 'camera' && <RoundedBox args={[1.34, 1.34, 0.46]} radius={0.025} smoothness={2}><meshBasicMaterial color={light.locked ? '#ff8b62' : '#d8ff3e'} wireframe transparent opacity={primary ? 0.58 : 0.28} /></RoundedBox>}
      </group>
      <Line points={[[standOffset[0], -0.09, standOffset[1]], [0, -0.09, 0]]} color="#343936" lineWidth={4} />
      <mesh castShadow position={[standOffset[0], -0.09, standOffset[1]]}><sphereGeometry args={[0.052, 16, 12]} /><meshStandardMaterial color="#272a28" metalness={0.78} roughness={0.25} /></mesh>
      <group position={[standOffset[0], -position[1], standOffset[1]]}>
        <mesh castShadow position={[0, position[1] / 2, 0]}><cylinderGeometry args={[0.025, 0.035, position[1], 12]} /><meshStandardMaterial color="#272a28" metalness={0.78} roughness={0.25} /></mesh>
        {[0, 2.09, 4.18].map((rotation) => <mesh key={rotation} rotation={[0, rotation, -1.2]} position={[0, 0.08, 0]}><cylinderGeometry args={[0.018, 0.018, 0.62, 10]} /><meshStandardMaterial color="#252825" metalness={0.72} /></mesh>)}
      </group>
    </group>
  )

  return (
    <>
      <primitive object={target} />
      {softbox}
      {primary && view !== 'camera' && <>
        <Line points={[position, light.target]} color="#d8ff3e" lineWidth={0.75} dashed dashSize={0.12} gapSize={0.08} transparent opacity={0.52} />
        <group position={light.target} visible={aimMode}>
          <mesh><sphereGeometry args={[0.065, 20, 20]} /><meshBasicMaterial color="#d8ff3e" /></mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={Math.max(0.45, new THREE.Vector3(...position).distanceTo(new THREE.Vector3(...light.target)) * Math.tan(beamAngle))}>
            <ringGeometry args={[0.16, 0.175, 40]} /><meshBasicMaterial color="#d8ff3e" transparent opacity={0.58} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </>}
      {primary && view !== 'camera' && (aimMode || !light.locked) && (
        <TransformControls
          object={aimMode ? target : rig as RefObject<THREE.Object3D>}
          mode="translate"
          size={0.7}
          translationSnap={0.05}
          onObjectChange={() => {
            if (aimMode) {
              setLightTarget(lightId, [Number(target.position.x.toFixed(2)), Number(Math.max(0.1, target.position.y).toFixed(2)), Number(target.position.z.toFixed(2))])
            } else if (rig.current) {
              setLightPosition(lightId, [Number(rig.current.position.x.toFixed(2)), Number(Math.max(0.8, rig.current.position.y).toFixed(2)), Number(rig.current.position.z.toFixed(2))])
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
  const bounceLight = useRef<THREE.RectAreaLight>(null)
  const material = MODIFIER_MATERIALS[modifier.surface]
  const panelWidth = modifier.type === 'vflat' ? modifier.width / 2 : modifier.width
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
      const output = captureLightOutput(light, shutter, syncSpeed) * opticTransmission(light)
      reflected += output * incoming / distanceSquared
      if (output > dominantOutput) { dominant = light; dominantOutput = output }
    })
    const reflectance = modifier.surface === 'silver' ? 0.78 : modifier.surface === 'gold' ? 0.58 : 0.42
    const color = dominant ? (dominant.colorMode === 'rgb' ? new THREE.Color(dominant.rgb) : kelvinColor(dominant.temperature)) : new THREE.Color('#fff5df')
    if (modifier.surface === 'gold') color.lerp(new THREE.Color('#ffc56f'), 0.42)
    if (modifier.surface === 'silver') color.lerp(new THREE.Color('#eaf6ff'), 0.12)
    return { intensity: reflected * outgoing * reflectance / 115, color }
  }, [lights, modelHeight, modelPosition, modifier.position, modifier.rotationY, modifier.surface, shutter, soloLightId, syncSpeed])

  useFrame(() => bounceLight.current?.lookAt(modelPosition[0], modelPosition[1] + modelHeight * 0.62, modelPosition[2]))

  const panel = (x = 0, rotationY = 0) => (
    <group position={[x, 0, 0]} rotation={[0, rotationY, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[panelWidth, modifier.height, 0.035]} />
        <meshStandardMaterial {...material} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, -0.021]}>
        <boxGeometry args={[panelWidth + 0.035, modifier.height + 0.035, 0.018]} />
        <meshBasicMaterial color="#343833" wireframe transparent opacity={0.52} />
      </mesh>
    </group>
  )

  const object = (
    <group
      ref={group}
      position={modifier.position}
      rotation={[0, modifier.rotationY, 0]}
      onClick={(event) => { event.stopPropagation(); selectObject(modifier.id) }}
    >
      {modifier.type === 'vflat' ? <>
        {panel(-panelWidth * 0.24, 0.34)}
        {panel(panelWidth * 0.24, -0.34)}
      </> : panel()}
      {modifier.type !== 'vflat' && <>
        <mesh position={[0, -modifier.height / 2 - 0.34, 0]} castShadow><cylinderGeometry args={[0.018, 0.025, 0.68, 10]} /><meshStandardMaterial color="#242824" metalness={0.7} roughness={0.28} /></mesh>
        <mesh position={[0, -modifier.height / 2 - 0.67, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.018, 0.018, 0.48, 10]} /><meshStandardMaterial color="#242824" metalness={0.7} /></mesh>
      </>}
      {selected && view !== 'camera' && <mesh>
        <boxGeometry args={[modifier.width + 0.1, modifier.height + 0.1, modifier.type === 'vflat' ? 0.5 : 0.1]} />
        <meshBasicMaterial color={modifier.locked ? '#ff8b62' : '#d8ff3e'} wireframe transparent opacity={0.48} />
      </mesh>}
    </group>
  )

  return <>
    {object}
    {modifier.surface !== 'black' && <rectAreaLight ref={bounceLight} position={modifier.position} color={bounce.color} intensity={renderMode === 'path' ? 0 : bounce.intensity} width={modifier.width} height={modifier.height} />}
    {selected && view !== 'camera' && !modifier.locked && <TransformControls
      object={group as RefObject<THREE.Object3D>}
      mode={transformMode}
      size={0.7}
      translationSnap={0.05}
      rotationSnap={THREE.MathUtils.degToRad(5)}
      showX={transformMode === 'translate'}
      showY
      showZ={transformMode === 'translate'}
      onObjectChange={() => {
        if (!group.current) return
        setModifierTransform(modifier.id,
          [Number(group.current.position.x.toFixed(2)), Number(Math.max(0.3, group.current.position.y).toFixed(2)), Number(group.current.position.z.toFixed(2))],
          Number(group.current.rotation.y.toFixed(3)),
        )
      }}
    />}
  </>
}

function LightMeterProbe() {
  const open = useStudio((state) => state.analysisOpen)
  const selected = useStudio((state) => state.selected === 'meter')
  const position = useStudio((state) => state.meterPosition)
  const view = useStudio((state) => state.view)
  const renderMode = useStudio((state) => state.renderMode)
  const selectObject = useStudio((state) => state.selectObject)
  const setMeterPosition = useStudio((state) => state.setMeterPosition)
  const group = useRef<THREE.Group>(null)
  if (!open || view === 'camera' || renderMode === 'path') return null

  const probe = <group ref={group} position={position} onClick={(event) => { event.stopPropagation(); selectObject('meter') }}>
    <mesh castShadow rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.095, 0.095, 0.035, 28]} /><meshStandardMaterial color="#252a25" metalness={0.55} roughness={0.3} /></mesh>
    <mesh position={[0, 0.038, 0]}><sphereGeometry args={[0.061, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#f2f0e7" roughness={0.95} /></mesh>
    <mesh position={[0, -0.21, 0]}><cylinderGeometry args={[0.013, 0.018, 0.38, 10]} /><meshStandardMaterial color="#222622" metalness={0.65} /></mesh>
    <mesh position={[0, -0.41, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.11, 0.012, 8, 24]} /><meshStandardMaterial color="#232723" metalness={0.7} /></mesh>
    {selected && <mesh><sphereGeometry args={[0.13, 18, 18]} /><meshBasicMaterial color="#d8ff3e" wireframe transparent opacity={0.5} /></mesh>}
  </group>

  return <>
    {probe}
    {selected && <TransformControls object={group as RefObject<THREE.Object3D>} mode="translate" size={0.65} translationSnap={0.05} onObjectChange={() => {
      if (!group.current) return
      setMeterPosition([Number(group.current.position.x.toFixed(2)), Number(Math.max(0.15, group.current.position.y).toFixed(2)), Number(group.current.position.z.toFixed(2))])
    }} />}
  </>
}

function CameraProp() {
  const selectObject = useStudio((state) => state.selectObject)
  const selected = useStudio((state) => state.selected === 'camera')
  const view = useStudio((state) => state.view)
  const position = useStudio((state) => state.cameraPosition)
  const target = useStudio((state) => state.cameraTarget)
  const setCameraPosition = useStudio((state) => state.setCameraPosition)
  const group = useRef<THREE.Group>(null)

  useFrame(() => group.current?.lookAt(...target))

  const camera = (
    <group ref={group} position={position} onClick={(event) => { event.stopPropagation(); selectObject('camera') }}>
      <RoundedBox args={[0.48, 0.32, 0.25]} radius={0.04} smoothness={4}><meshStandardMaterial color="#1d201e" metalness={0.55} roughness={0.36} /></RoundedBox>
      <mesh position={[0, 0, -0.23]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.15, 0.12, 0.3, 32]} /><meshStandardMaterial color="#111312" metalness={0.72} roughness={0.28} /></mesh>
      <mesh position={[0, -0.8, 0.08]}><cylinderGeometry args={[0.025, 0.035, 1.45, 12]} /><meshStandardMaterial color="#2b2e2b" metalness={0.8} /></mesh>
      {selected && view !== 'camera' && <RoundedBox args={[0.54, 0.38, 0.32]} radius={0.03} smoothness={2}><meshBasicMaterial color="#d8ff3e" wireframe transparent opacity={0.58} /></RoundedBox>}
    </group>
  )

  return <>
    {camera}
    {selected && view !== 'camera' && <>
      <TransformControls
        object={group as RefObject<THREE.Object3D>}
        mode="translate"
        size={0.72}
        translationSnap={0.05}
        onObjectChange={() => {
          if (!group.current) return
          setCameraPosition([Number(group.current.position.x.toFixed(2)), Number(Math.max(0.35, group.current.position.y).toFixed(2)), Number(group.current.position.z.toFixed(2))])
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

function PathTracingRenderer() {
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
  const ambientColor = useMemo(() => kelvinColor(ambientTemperature), [ambientTemperature])

  useEffect(() => {
    gl.shadowMap.enabled = true
    gl.shadowMap.type = THREE.PCFShadowMap
    gl.toneMapping = THREE.ACESFilmicToneMapping
    scene.background = new THREE.Color('#292b29')
  }, [gl, scene])

  useEffect(() => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio, qualityPreset === 'performance' ? 1 : qualityPreset === 'ultra' ? 2 : 1.5))
    gl.shadowMap.type = qualityPreset === 'performance' ? THREE.BasicShadowMap : qualityPreset === 'ultra' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    gl.shadowMap.needsUpdate = true
  }, [gl, qualityPreset])

  useFrame(() => {
    const enabledLights = lights.filter((light) => light.enabled)
    const flashShare = enabledLights.length ? enabledLights.filter((light) => light.operationMode === 'flash').length / enabledLights.length : 0
    const effectiveAperture = cameraMode === 'cinema' ? tStop : aperture
    const effectiveShutter = cameraMode === 'cinema' ? frameRate * 360 / shutterAngle : shutter
    const shutterFactor = flashShare + (1 - flashShare) * (125 / effectiveShutter)
    const exposureGain = (iso / 100) * shutterFactor * (16 / (effectiveAperture * effectiveAperture)) * Math.pow(2, -ndStops)
    gl.toneMappingExposure = THREE.MathUtils.clamp(0.72 * exposureGain, 0.25, 2.5)
  })

  return (
    <>
      <CameraRig />
      <TimelinePlayback />
      <ambientLight intensity={soloLightId ? 0.015 : ambientLevel / 75} color={ambientColor} />
      <EnvironmentLighting />
      <Backdrop />
      <Mannequin />
      {lights.map((light) => <Softbox key={light.id} light={light} />)}
      {modifiers.map((modifier) => <GripModifier key={modifier.id} modifier={modifier} />)}
      {studioObjects.map((object) => <MovableStudioObject key={object.id} object={object} />)}
      <LightMeterProbe />
      {renderMode !== 'path' && <CameraProp />}
      {renderMode !== 'path' && <Grid position={[0, 0.006, 1.5]} args={[10, 10]} cellSize={0.5} cellThickness={0.4} cellColor="#747872" sectionSize={2} sectionThickness={0.75} sectionColor="#9ba197" fadeDistance={12} fadeStrength={1.8} infiniteGrid />}
      <CameraImaging />
      <ExposureProbe />
      {renderMode === 'path' && <PathTracingRenderer />}
    </>
  )
}
