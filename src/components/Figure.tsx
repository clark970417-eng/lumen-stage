/**
 * The figure.
 *
 * A photographer judges a lighting simulator on one thing: does the light land
 * on the face the way it would in the room. That needs a body with the right
 * joints in the right places and a head whose cheekbone, jaw and brow are
 * separate surfaces — so this is a real rig, not a stack of capsules.
 *
 * Rig convention, inherited from the original scene so old saves still read:
 * the figure faces +Z, and the joint named "left" is the one on −X, which is
 * the viewer's left. Every angle is degrees.
 */

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import {
  DEFAULT_PHYSIQUE, faceShapeFor, faceVariation, footRings, forearmRings, HEAD, headRings, loft, neckRings,
  palmRings, resolvePhysique, SEGMENT, shinRings, sliceRings, thighRings, torsoRings,
  hairShell, sculptedHead, upperArmRings, type FaceVariation, type Physique,
} from '../anatomy'
import { faceColorMap, faceRoughnessMap, fabricNormalMap, fabricRoughnessMap, hairNormalMap, skinColorMap, skinNormalMap, skinRoughnessMap } from '../textures'
import { isSeatedPose, type HandPose, type ModelPose } from '../pose'
import { studioHairResponse, studioSkinResponse } from '../studioHumanDetails'
import type { FabricKind, HairStyle, OutfitStyle } from '../wardrobe'

export type MakeupStyle = 'none' | 'natural' | 'editorial'

export type FigureAppearance = {
  skinRoughness: number
  skinOil: number
  subsurface: number
  makeup: MakeupStyle
  eyeColor: string
  hairColor: string
  hairGloss: number
  outfitFabric: FabricKind
  physique: Physique
  hairStyle: HairStyle
  outfit: OutfitStyle
}

const rad = THREE.MathUtils.degToRad
const clamp = THREE.MathUtils.clamp
const lerp = THREE.MathUtils.lerp

/** How far each finger curls, by hand pose. Index is called out for pointing. */
const HAND_CURL: Record<HandPose, { fingers: number; index: number; thumb: number }> = {
  relaxed: { fingers: 38, index: 32, thumb: 22 },
  open: { fingers: 6, index: 4, thumb: 10 },
  fist: { fingers: 96, index: 96, thumb: 62 },
  point: { fingers: 98, index: 5, thumb: 44 },
  pocket: { fingers: 62, index: 58, thumb: 40 },
  grip: { fingers: 78, index: 74, thumb: 58 },
}

/** Which body parts the outfit covers. Bare skin is the point of the list. */
const OUTFIT_COVER: Record<OutfitStyle, { upperArm: boolean; forearm: boolean; legs: 'trouser' | 'skirt' | 'long-skirt' | 'legging' | 'bare'; neckline: number; jacket: boolean }> = {
  tshirt: { upperArm: true, forearm: false, legs: 'trouser', neckline: 0.955, jacket: false },
  shirt: { upperArm: true, forearm: true, legs: 'trouser', neckline: 0.970, jacket: false },
  suit: { upperArm: true, forearm: true, legs: 'trouser', neckline: 0.970, jacket: true },
  coat: { upperArm: true, forearm: true, legs: 'trouser', neckline: 0.960, jacket: true },
  dress: { upperArm: false, forearm: false, legs: 'skirt', neckline: 0.885, jacket: false },
  gown: { upperArm: false, forearm: false, legs: 'long-skirt', neckline: 0.865, jacket: false },
  tank: { upperArm: false, forearm: false, legs: 'trouser', neckline: 0.905, jacket: false },
  activewear: { upperArm: false, forearm: false, legs: 'legging', neckline: 0.925, jacket: false },
}

/** Clothing sits off the skin. Too little reads as body paint, too much as armour. */
const CLOTH_OFFSET = 1.045

function useFigureMaterials(skinColor: string, outfitColor: string, appearance: FigureAppearance) {
  const skin = useMemo(() => {
    const base = new THREE.Color(skinColor)
    const response = studioSkinResponse(appearance.skinRoughness, appearance.skinOil, appearance.subsurface, appearance.physique.age)
    return new THREE.MeshPhysicalMaterial({
      color: base,
      map: skinColorMap(),
      roughness: response.roughness,
      roughnessMap: skinRoughnessMap(),
      normalMap: skinNormalMap(),
      normalScale: new THREE.Vector2(response.normalScale, response.normalScale),
      metalness: 0,
      clearcoat: response.clearcoat,
      clearcoatRoughness: response.clearcoatRoughness,
      sheen: response.sheen,
      sheenColor: base.clone().lerp(new THREE.Color('#ff8a76'), 0.4),
      sheenRoughness: response.sheenRoughness,
      emissive: '#000000',
      emissiveIntensity: 0,
      transmission: 0,
      iridescence: 0,
      specularIntensity: response.specularIntensity,
      envMapIntensity: response.envMapIntensity,
    })
  }, [appearance.physique.age, appearance.skinOil, appearance.skinRoughness, appearance.subsurface, skinColor])

  const outfit = useMemo(() => {
    const fabric = appearance.outfitFabric
    const shiny = fabric === 'silk' || fabric === 'satin'
    return new THREE.MeshPhysicalMaterial({
      color: outfitColor,
      metalness: 0,
      roughness: shiny ? 0.34 : fabric === 'leather' ? 0.42 : fabric === 'velvet' ? 0.86 : 0.84,
      roughnessMap: fabricRoughnessMap(fabric),
      normalMap: fabricNormalMap(fabric),
      normalScale: new THREE.Vector2(shiny ? 0.35 : 0.85, shiny ? 0.35 : 0.85),
      sheen: shiny ? 0.78 : fabric === 'velvet' ? 0.95 : fabric === 'cotton' ? 0.18 : 0.08,
      sheenColor: new THREE.Color(outfitColor).lerp(new THREE.Color('#ffffff'), fabric === 'velvet' ? 0.5 : 0.34),
      sheenRoughness: shiny ? 0.2 : 0.7,
      clearcoat: fabric === 'leather' ? 0.5 : 0,
      clearcoatRoughness: 0.32,
    })
  }, [appearance.outfitFabric, outfitColor])

  const faceSkin = useMemo(() => {
    const material = skin.clone()
    material.map = faceColorMap()
    material.roughnessMap = faceRoughnessMap()
    material.normalScale = new THREE.Vector2(0.26, 0.26)
    material.needsUpdate = true
    return material
  }, [skin])

  const hair = useMemo(() => {
    const response = studioHairResponse(appearance.hairGloss)
    return new THREE.MeshPhysicalMaterial({
      color: appearance.hairColor,
      metalness: 0,
      roughness: response.roughness,
      normalMap: hairNormalMap(),
      normalScale: new THREE.Vector2(0.45, 0.45),
      sheen: response.sheen,
      sheenColor: new THREE.Color(appearance.hairColor).lerp(new THREE.Color('#d8c7b8'), 0.12),
      sheenRoughness: response.sheenRoughness,
      anisotropy: response.anisotropy,
      anisotropyRotation: Math.PI / 2,
      clearcoat: 0,
      specularIntensity: response.specularIntensity,
      envMapIntensity: response.envMapIntensity,
      // The shell is an open surface bounded by the hairline, so the inside of
      // the far side is visible through the gap around the face.
      side: THREE.DoubleSide,
    })
  }, [appearance.hairColor, appearance.hairGloss])

  const nail = useMemo(() => {
    const tone = new THREE.Color(skinColor).lerp(new THREE.Color('#f4d4cb'), 0.28)
    return new THREE.MeshPhysicalMaterial({
      color: tone,
      roughness: 0.34,
      clearcoat: 0.42,
      clearcoatRoughness: 0.18,
    })
  }, [skinColor])

  useEffect(() => () => { skin.dispose(); faceSkin.dispose(); outfit.dispose(); hair.dispose(); nail.dispose() }, [faceSkin, hair, nail, outfit, skin])
  return { skin, faceSkin, outfit, hair, nail }
}

function useFigureGeometry(physique: Physique, jawSet: number, neckline: number, jacket: boolean) {
  const geometry = useMemo(() => {
    const p = resolvePhysique(physique)
    const body = torsoRings(p)
    return {
      resolved: p,
      torso: loft(body, { segments: 32, up: true }),
      // The garment is a truncated copy of the body, so the neckline is a real
      // edge with skin above it rather than a painted-on line.
      garment: loft(sliceRings(body, 0, neckline), { segments: 32, up: true }),
      // An open jacket: swept everywhere except the 70° at the front.
      jacket: jacket
        ? loft(sliceRings(body, 0.06, 0.94), { segments: 30, up: true, startAngle: Math.PI * 0.61, endAngle: Math.PI * 2.39 })
        : null,
      neck: loft(neckRings(p), { segments: 20, up: true }),
      head: sculptedHead(faceShapeFor(physique.face ?? 0), physique.sex, jawSet),
      upperArm: loft(upperArmRings(p), { segments: 20 }),
      forearm: loft(forearmRings(p), { segments: 20 }),
      thigh: loft(thighRings(p), { segments: 24 }),
      shin: loft(shinRings(p), { segments: 24 }),
      skirt: loft([
        { t: 0, rx: p.hipHalf * 0.98, rz: p.hipDepth * 1.02, cz: -0.004 },
        { t: 0.10, rx: p.hipHalf * 1.02, rz: p.hipDepth * 1.00 },
        { t: 0.30, rx: p.hipHalf * 1.12, rz: p.hipDepth * 0.98, cz: 0.004 },
        { t: 0.56, rx: p.hipHalf * 1.26, rz: p.hipDepth * 0.94, cz: 0.010 },
      ], { segments: 40 }),
      longSkirt: loft([
        { t: 0, rx: p.hipHalf * 0.98, rz: p.hipDepth * 1.02, cz: -0.004 },
        { t: 0.16, rx: p.hipHalf * 1.04, rz: p.hipDepth },
        { t: 0.52, rx: p.hipHalf * 1.28, rz: p.hipDepth * 0.96, cz: 0.008 },
        { t: 0.98, rx: p.hipHalf * 1.72, rz: p.hipDepth * 1.02, cz: 0.018 },
      ], { segments: 44 }),
      foot: loft(footRings(0.048), { segments: 16, up: true }),
      palm: loft(palmRings(1), { segments: 14 }),
      finger: new THREE.CapsuleGeometry(0.0075, 0.02, 4, 8),
    }
  }, [jacket, jawSet, neckline, physique])

  useEffect(() => () => {
    Object.values(geometry).forEach((value) => {
      if (value instanceof THREE.BufferGeometry) value.dispose()
    })
  }, [geometry])
  return geometry
}

type Geo = ReturnType<typeof useFigureGeometry>

/** Five fingers, curled by pose. Small, but it is what stops a hand reading as a mitten. */
function Hand({ side, pose, geo, material, nail, scale }: { side: -1 | 1; pose: HandPose; geo: Geo; material: THREE.Material; nail: THREE.Material; scale: number }) {
  const curl = HAND_CURL[pose]
  const fingers = [
    { x: -0.024, length: 1.00, curl: curl.index },
    { x: -0.008, length: 1.06, curl: curl.fingers },
    { x: 0.008, length: 1.00, curl: curl.fingers },
    { x: 0.023, length: 0.86, curl: curl.fingers * 1.05 },
  ]
  return (
    <group scale={scale}>
      <mesh castShadow geometry={geo.palm} material={material} />
      {fingers.map((finger, index) => (
        <group key={index} position={[finger.x * side, -SEGMENT.hand * 0.52, 0]} rotation={[rad(finger.curl), 0, 0]}>
          <mesh castShadow geometry={geo.finger} material={material} position={[0, -0.017, 0]} scale={[1, finger.length, 1]} />
          <group position={[0, -0.034 * finger.length, 0]} rotation={[rad(finger.curl * 1.1), 0, 0]}>
            <mesh castShadow geometry={geo.finger} material={material} position={[0, -0.014, 0]} scale={[0.86, finger.length * 0.78, 0.86]} />
            <mesh material={nail} position={[0, -0.017, 0.0071]} scale={[0.72, 1.05, 1]}>
              <circleGeometry args={[0.0046, 12]} />
            </mesh>
          </group>
        </group>
      ))}
      <group position={[0.031 * side, -SEGMENT.hand * 0.3, 0.012]} rotation={[rad(curl.thumb * 0.5), 0, rad(-38 * side)]}>
        <mesh castShadow geometry={geo.finger} material={material} position={[0, -0.019, 0]} scale={[1.15, 1.1, 1.15]} />
        <group position={[0, -0.038, 0]} rotation={[rad(curl.thumb), 0, 0]}>
          <mesh castShadow geometry={geo.finger} material={material} position={[0, -0.014, 0]} scale={[1.05, 0.85, 1.05]} />
          <mesh material={nail} position={[0, -0.017, 0.008]} scale={[0.82, 1.05, 1]}><circleGeometry args={[0.0048, 12]} /></mesh>
        </group>
      </group>
    </group>
  )
}

function makeUpperLipShape() {
  const shape = new THREE.Shape()
  shape.moveTo(-0.023, 0)
  shape.bezierCurveTo(-0.017, 0.001, -0.012, 0.0072, -0.006, 0.0075)
  shape.bezierCurveTo(-0.003, 0.0074, -0.0015, 0.0044, 0, 0.0040)
  shape.bezierCurveTo(0.0015, 0.0044, 0.003, 0.0074, 0.006, 0.0075)
  shape.bezierCurveTo(0.012, 0.0072, 0.017, 0.001, 0.023, 0)
  shape.bezierCurveTo(0.014, -0.0012, 0.006, -0.0018, 0, -0.0014)
  shape.bezierCurveTo(-0.006, -0.0018, -0.014, -0.0012, -0.023, 0)
  return shape
}

function makeLowerLipShape() {
  const shape = new THREE.Shape()
  shape.moveTo(-0.022, 0)
  shape.bezierCurveTo(-0.014, 0.0015, -0.006, 0.0022, 0, 0.0020)
  shape.bezierCurveTo(0.006, 0.0022, 0.014, 0.0015, 0.022, 0)
  shape.bezierCurveTo(0.015, -0.0048, 0.008, -0.0082, 0, -0.0085)
  shape.bezierCurveTo(-0.008, -0.0082, -0.015, -0.0048, -0.022, 0)
  return shape
}

function Face({ pose, skin, hair, appearance, gaze, face }: { pose: ModelPose; skin: THREE.Material; hair: THREE.Material; appearance: FigureAppearance; gaze: { yaw: number; pitch: number }; face: FaceVariation }) {
  const open = clamp(pose.eyeOpen / 100, 0, 1) * (1 - clamp(pose.squint / 100, 0, 0.75))
  const smile = clamp(pose.smile / 100, -0.4, 1)
  const mouthOpen = clamp(pose.mouthOpen / 100, 0, 1)
  const lipPart = clamp(pose.lipPart / 100, 0, 1)
  const brow = clamp(pose.browRaise / 100, -1, 1)
  const irisX = Math.sin(rad(clamp(gaze.yaw, -35, 35))) * 0.011
  const irisY = -Math.sin(rad(clamp(gaze.pitch, -30, 30))) * 0.009
  const lipColor = appearance.makeup === 'editorial' ? '#8c2338' : appearance.makeup === 'natural' ? '#a35d58' : '#93615c'
  const age = clamp(((appearance.physique.age ?? 28) - 18) / 62, 0, 1)
  const wrinkleOpacity = Math.max(0, (age - 0.28) * 0.32)
  const lipShapes = useMemo(() => ({ upper: makeUpperLipShape(), lower: makeLowerLipShape() }), [])

  const eye = (side: -1 | 1) => (
    <group key={`eye-${side}`} position={[side * (HEAD.eyeX + face.eyeSpacing), HEAD.eyeY + face.eyeHeight + (side < 0 ? face.asymmetry : 0), HEAD.eyeZ]}>
      <mesh scale={[1.04, 0.67, 0.92]}><sphereGeometry args={[0.0101, 32, 20]} /><meshPhysicalMaterial color="#ded8cd" roughness={0.28} clearcoat={0.56} clearcoatRoughness={0.12} /></mesh>
      <mesh position={[irisX, irisY, 0.00865]}><circleGeometry args={[0.0052, 32]} /><meshBasicMaterial color="#1a1815" /></mesh>
      <mesh position={[irisX, irisY, 0.00882]}><circleGeometry args={[0.00465, 32]} /><meshPhysicalMaterial color={appearance.eyeColor} roughness={0.2} clearcoat={0.72} /></mesh>
      <mesh position={[irisX, irisY, 0.00894]}><ringGeometry args={[0.00245, 0.00385, 32]} /><meshBasicMaterial color="#d9c58f" transparent opacity={0.20} /></mesh>
      <mesh position={[irisX, irisY, 0.00912]}><circleGeometry args={[0.0021, 20]} /><meshBasicMaterial color="#07090a" /></mesh>
      <mesh position={[irisX - 0.0016, irisY + 0.0019, 0.0104]}><circleGeometry args={[0.00095, 12]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
      <mesh position={[-side * 0.0102, -0.002, 0.0074]} scale={[1.1, 0.55, 0.6]}><sphereGeometry args={[0.0032, 14, 10]} /><meshPhysicalMaterial color="#b55b58" roughness={0.42} /></mesh>
      <mesh position={[0, -0.0069, 0.0084]} scale={[1.15, 0.075, 0.22]}><sphereGeometry args={[0.0118, 18, 10]} /><meshPhysicalMaterial color="#e8b7ae" roughness={0.24} clearcoat={0.4} /></mesh>
      {/* Lash line. A dark edge is what separates an eye from a bead. */}
      <mesh position={[0, 0.0063 - (1 - open) * 0.0082, 0.0056]} rotation={[rad(-14), 0, 0]} scale={[1.12, 0.085, 0.46]}>
        <sphereGeometry args={[0.0126, 18, 10]} />
        <meshStandardMaterial color={appearance.makeup === 'none' ? '#3a2c26' : '#241a18'} roughness={0.5} />
      </mesh>
      {/* Lids. Dropping the upper one is the only honest way to show a squint. */}
      <mesh castShadow position={[0, 0.0074 - (1 - open) * 0.0102, -0.0016]} rotation={[rad(-12), 0, 0]} scale={[1.22, 0.32 + (1 - open) * 0.58, 1.08]} material={skin}>
        <sphereGeometry args={[0.0126, 20, 14]} />
      </mesh>
      <mesh castShadow position={[0, -0.0066 + (1 - open) * 0.0024, -0.0018]} scale={[1.18, 0.22, 1.04]} material={skin}>
        <sphereGeometry args={[0.0124, 18, 12]} />
      </mesh>
    </group>
  )

  return (
    <>
      {/* The brow itself: thin, and sitting on the ridge rather than floating. */}
      {([-1, 1] as const).map((side) => (
        <mesh key={`brow-${side}`} position={[side * (HEAD.eyeX + face.eyeSpacing), HEAD.browY + face.browHeight + brow * 0.005 + (side < 0 ? face.asymmetry * 1.4 : 0), HEAD.eyeZ + 0.016]}
          rotation={[0, 0, rad(side * (-9 + brow * -6))]} scale={[1.18, 0.085, 0.14]} material={hair}>
          <sphereGeometry args={[0.0132, 18, 12]} />
        </mesh>
      ))}
      {([-1, 1] as const).map((side) => (
        <group key={`ear-${side}`} position={[side * (HEAD.earX - 0.004), HEAD.earY, -0.020]} rotation={[rad(-6), rad(side * -22), 0]}>
          <mesh castShadow scale={[0.16, 0.54, 0.30]} material={skin}><sphereGeometry args={[0.030, 24, 18]} /></mesh>
          <mesh position={[side * 0.0008, 0.001, 0.008]} scale={[0.085, 0.30, 0.12]}><sphereGeometry args={[0.030, 18, 14]} /><meshStandardMaterial color="#5c302d" roughness={0.92} /></mesh>
          <mesh position={[side * 0.0012, 0.005, 0.011]} scale={[0.045, 0.22, 0.055]} material={skin}><torusGeometry args={[0.026, 0.007, 8, 24, Math.PI * 1.55]} /></mesh>
        </group>
      ))}
      {([-1, 1] as const).map((side) => eye(side))}

      {/* Nose alae, nostril shadows and the small septum break are separate cues at portrait distance. */}
      {([-1, 1] as const).map((side) => (
        <group key={`nostril-${side}`} position={[side * 0.0085 * (1 + face.noseWidth), HEAD.noseTipY - 0.005, HEAD.noseTipZ + face.noseLength - 0.001]} rotation={[rad(78), 0, rad(side * 7)]}>
          <mesh scale={[1.35, 0.62, 0.5]}><circleGeometry args={[0.0036, 18]} /><meshStandardMaterial color="#321b1a" roughness={0.9} /></mesh>
          <mesh position={[side * 0.004, 0.0005, -0.002]} scale={[0.8, 1.25, 0.55]} material={skin}><sphereGeometry args={[0.0045, 16, 12]} /></mesh>
        </group>
      ))}
      <mesh position={[0, HEAD.noseTipY - 0.007, HEAD.noseTipZ + face.noseLength + 0.001]} scale={[0.36, 0.8, 0.32]} material={skin}><sphereGeometry args={[0.006, 16, 12]} /></mesh>

      {/*
        Lips. The shape is sculpted into the skull; this is only the colour,
        laid on as a thin shell that follows it.
      */}
      <group position={[face.asymmetry * 0.6, HEAD.mouthY - mouthOpen * 0.013, HEAD.mouthZ]} scale={[1 + face.mouthWidth, 0.84, 1]}>
        {(mouthOpen > 0.04 || lipPart > 0.1) && (
          <group>
            <mesh position={[0, 0, -0.008]} scale={[1, 0.4 + mouthOpen * 1.7 + lipPart * 0.3, 0.8]}>
              <sphereGeometry args={[0.019, 18, 12]} />
              <meshStandardMaterial color="#2a1113" roughness={0.5} />
            </mesh>
            {mouthOpen > 0.2 && <mesh position={[0, 0.004, 0.008]} scale={[1, 0.23, 0.12]}><sphereGeometry args={[0.0155, 18, 10]} /><meshStandardMaterial color="#e9e2d5" roughness={0.42} /></mesh>}
          </group>
        )}
        <mesh position={[0, 0.0018 + smile * 0.0018, 0.0014]} scale={[1.02, 1, 1]}>
          <shapeGeometry args={[lipShapes.upper, 28]} />
          <meshPhysicalMaterial color={lipColor} roughness={appearance.makeup === 'editorial' ? 0.24 : 0.55} clearcoat={appearance.makeup === 'editorial' ? 0.6 : 0.16} />
        </mesh>
        <mesh position={[0, -0.0026 - mouthOpen * 0.011, 0.0012]} scale={[0.98, 1, 1]}>
          <shapeGeometry args={[lipShapes.lower, 28]} />
          <meshPhysicalMaterial color={lipColor} roughness={appearance.makeup === 'editorial' ? 0.24 : 0.55} clearcoat={appearance.makeup === 'editorial' ? 0.6 : 0.16} />
        </mesh>
        {([-1, 1] as const).map((side) => <mesh key={`mouth-corner-${side}`} position={[side * 0.0215, -0.0005, 0.0004]} scale={[0.9, 0.35, 0.25]}><sphereGeometry args={[0.003, 12, 8]} /><meshStandardMaterial color="#4a2425" roughness={0.72} /></mesh>)}
      </group>

      {/* Philtrum columns and a faint under-lip hollow keep the mouth attached to the face. */}
      {([-1, 1] as const).map((side) => <mesh key={`philtrum-${side}`} position={[side * 0.0035, HEAD.mouthY + 0.015, HEAD.mouthZ + 0.004]} rotation={[0, 0, rad(side * -8)]} scale={[0.12, 0.72, 0.12]} material={skin}><sphereGeometry args={[0.008, 14, 10]} /></mesh>)}
      <mesh position={[0, HEAD.mouthY - 0.016 - mouthOpen * 0.010, HEAD.mouthZ + 0.003]} scale={[1.4, 0.10, 0.08]}><sphereGeometry args={[0.014, 16, 8]} /><meshBasicMaterial color="#623b38" transparent opacity={0.16} depthWrite={false} /></mesh>

      {appearance.makeup !== 'none' && ([-1, 1] as const).map((side) => (
        <mesh key={`blush-${side}`} position={[side * (HEAD.cheekX + 0.004), HEAD.cheekY - 0.004, HEAD.cheekZ + 0.028]} rotation={[0, rad(side * 26), 0]}>
          <circleGeometry args={[0.021, 24]} />
          <meshBasicMaterial color={appearance.makeup === 'editorial' ? '#bb3f68' : '#c87a76'} transparent opacity={appearance.makeup === 'editorial' ? 0.20 : 0.09} depthWrite={false} />
        </mesh>
      ))}
      {appearance.makeup === 'editorial' && ([-1, 1] as const).map((side) => (
        <mesh key={`shadow-${side}`} position={[side * HEAD.eyeX, HEAD.eyeY + 0.010, HEAD.eyeZ + 0.011]} scale={[1.4, 0.45, 1]}>
          <circleGeometry args={[0.015, 20]} />
          <meshBasicMaterial color="#57305e" transparent opacity={0.26} depthWrite={false} />
        </mesh>
      ))}
      {wrinkleOpacity > 0 && <group>
        {([-0.010, 0, 0.010] as const).map((offset, index) => <mesh key={`forehead-${offset}`} position={[0, HEAD.browY + 0.038 + offset, HEAD.eyeZ + 0.018]} scale={[2.2 - index * 0.12, 0.055, 0.08]}><sphereGeometry args={[0.019, 18, 8]} /><meshBasicMaterial color="#5f4038" transparent opacity={wrinkleOpacity} depthWrite={false} /></mesh>)}
        {([-1, 1] as const).map((side) => <group key={`crow-${side}`} position={[side * (HEAD.eyeX + 0.022), HEAD.eyeY + 0.002, HEAD.eyeZ + 0.018]} rotation={[0, 0, rad(side * -12)]}>
          {[0, 1].map((line) => <mesh key={line} position={[side * line * 0.002, line * -0.004, 0]} rotation={[0, 0, rad(side * (18 + line * 10))]} scale={[0.75, 0.055, 0.07]}><sphereGeometry args={[0.012, 14, 8]} /><meshBasicMaterial color="#5f4038" transparent opacity={wrinkleOpacity * 0.9} depthWrite={false} /></mesh>)}
        </group>)}
      </group>}
    </>
  )
}

/** Style parameters for the hair shell, plus whatever each style adds on top. */
const HAIR_SHELL: Record<HairStyle, { thickness: number; fall: number; spread: number }> = {
  bald: { thickness: 0, fall: 0, spread: 0 },
  buzz: { thickness: 0.003, fall: 0, spread: 0 },
  short: { thickness: 0.011, fall: 0.02, spread: 0.05 },
  bob: { thickness: 0.013, fall: 0.10, spread: 0.16 },
  long: { thickness: 0.013, fall: 0.30, spread: 0.30 },
  ponytail: { thickness: 0.010, fall: 0.015, spread: 0.04 },
  bun: { thickness: 0.010, fall: 0.012, spread: 0.03 },
  curly: { thickness: 0.020, fall: 0.06, spread: 0.20 },
  afro: { thickness: 0.038, fall: 0.02, spread: 0.10 },
}

function Hair({ style, material, physique, jawSet }: { style: HairStyle; material: THREE.Material; physique: Physique; jawSet: number }) {
  const spec = HAIR_SHELL[style] ?? HAIR_SHELL.short
  const shell = useMemo(
    () => style === 'bald' ? null : hairShell({ ...spec, jawSet }),
    [jawSet, spec, style],
  )
  useEffect(() => () => { shell?.dispose() }, [shell])
  if (!shell) return null

  const R = HEAD.halfDepth
  const crown = HEAD.eyeY + 0.030
  const feminine = physique.sex === 'feminine'

  return (
    <group>
      <mesh castShadow receiveShadow geometry={shell} material={material} />
      {style === 'ponytail' && (
        <mesh castShadow position={[0, crown - 0.045, -R * 1.05]} rotation={[rad(28), 0, 0]} scale={[0.55, 1, 0.55]} material={material}>
          <capsuleGeometry args={[R * 0.40, 0.22, 8, 20]} />
        </mesh>
      )}
      {style === 'bun' && (
        <mesh castShadow position={[0, crown + 0.022, -R * 0.88]} scale={[1, 0.92, 0.92]} material={material}>
          <sphereGeometry args={[R * 0.50, 26, 20]} />
        </mesh>
      )}
      {(style === 'curly' || style === 'afro') && (
        // Curl clusters over the shell: a fixed lattice, so the same head
        // renders identically every frame.
        <group>
          {Array.from({ length: style === 'afro' ? 30 : 20 }, (_, index) => {
            const count = style === 'afro' ? 30 : 20
            const phi = (index / count) * Math.PI * 2 * 1.618
            const theta = Math.acos(1 - 1.25 * ((index + 0.5) / count))
            const radius = style === 'afro' ? R * 1.30 : R * 1.12
            return (
              <mesh key={index} castShadow material={material}
                position={[
                  Math.sin(theta) * Math.cos(phi) * radius * 0.80,
                  crown - 0.012 + Math.cos(theta) * radius * 0.92,
                  Math.sin(theta) * Math.sin(phi) * radius - 0.010,
                ]}>
                <sphereGeometry args={[style === 'afro' ? R * 0.38 : R * 0.30, 14, 10]} />
              </mesh>
            )
          })}
        </group>
      )}
      {/* A soft fringe, sitting on the forehead rather than across the brow. */}
      {style !== 'buzz' && style !== 'afro' && style !== 'curly' && (
        <mesh castShadow position={[0, crown + (feminine ? 0.028 : 0.034), R * 0.30]} rotation={[rad(-10), 0, 0]} scale={[0.86, 0.14, 0.36]} material={material}>
          <sphereGeometry args={[R * 0.94, 30, 18]} />
        </mesh>
      )}
    </group>
  )
}

export function Figure({ pose, skinColor, outfitColor, appearance, gaze, seatHeight }: {
  pose: ModelPose
  skinColor: string
  outfitColor: string
  appearance: FigureAppearance
  gaze?: { yaw: number; pitch: number }
  /** Height of whatever the figure is sitting on, in metres. Null when standing. */
  seatHeight?: number | null
}) {
  const physique = appearance.physique ?? DEFAULT_PHYSIQUE
  const cover = OUTFIT_COVER[appearance.outfit] ?? OUTFIT_COVER.tshirt
  const { skin, faceSkin, outfit, hair, nail } = useFigureMaterials(skinColor, outfitColor, appearance)
  const geo = useFigureGeometry(physique, pose.jawSet, cover.neckline, cover.jacket)
  const p = geo.resolved
  const face = useMemo(() => faceVariation(physique.face ?? 0), [physique.face])

  /**
   * Ground contact.
   *
   * Pelvis height is solved from the leg angles rather than pinned, so a bent
   * knee actually lowers the figure — and therefore lowers the face relative to
   * a light stand, which is the whole reason to get it right.
   */
  const pelvisY = useMemo(() => {
    const seated = isSeatedPose(pose)
    // Sit on the actual furniture when there is some; otherwise assume a
    // standard chair, so a seated pose is never left floating in mid-air.
    if (seated) return seatHeight ?? 0.46
    const drop = (hip: number, knee: number, ankle: number) => {
      const thighEnd = new THREE.Vector3(0, -SEGMENT.thigh, 0).applyEuler(new THREE.Euler(rad(-hip), 0, 0))
      const shinEnd = new THREE.Vector3(0, -SEGMENT.shin, 0).applyEuler(new THREE.Euler(rad(-hip + knee), 0, 0))
      return -(thighEnd.y + shinEnd.y) + SEGMENT.ankleY * Math.cos(rad(ankle))
    }
    return Math.max(drop(pose.leftLeg, pose.leftKnee, pose.leftAnkle), drop(pose.rightLeg, pose.rightKnee, pose.rightAnkle))
  }, [pose.leftAnkle, pose.leftKnee, pose.leftLeg, pose.rightAnkle, pose.rightKnee, pose.rightLeg, seatHeight])

  /**
   * Stance width is a foot placement, not a hip placement. Turning it into a
   * splay angle at the hip is what keeps the legs attached to the pelvis
   * instead of floating outboard of it.
   */
  const stanceSplay = THREE.MathUtils.radToDeg(Math.atan2(pose.stanceWidth / 2 - p.hipJoint, SEGMENT.thigh + SEGMENT.shin))

  const leg = (side: -1 | 1) => {
    const isLeft = side === -1
    const hip = isLeft ? pose.leftLeg : pose.rightLeg
    const splay = (isLeft ? pose.leftLegSplay : pose.rightLegSplay) + side * stanceSplay
    const knee = isLeft ? pose.leftKnee : pose.rightKnee
    const ankle = isLeft ? pose.leftAnkle : pose.rightAnkle
    const turn = isLeft ? pose.leftFootTurn : pose.rightFootTurn
    const trousered = cover.legs === 'trouser' || cover.legs === 'legging'
    const legMaterial = trousered ? outfit : skin
    const k = cover.legs === 'legging' ? 1.02 : CLOTH_OFFSET
    const legScale: [number, number, number] | 1 = trousered ? [k, 1, k] : 1

    return (
      <group key={`leg-${side}`} position={[side * p.hipJoint, 0, 0]} rotation={[rad(-hip), 0, rad(splay)]}>
        <mesh castShadow geometry={geo.thigh} material={legMaterial} scale={legScale} />
        <group position={[0, -SEGMENT.thigh, 0]} rotation={[rad(knee), 0, 0]}>
          <mesh castShadow geometry={geo.shin} material={legMaterial} scale={legScale} />
          <group position={[0, -SEGMENT.shin, 0]} rotation={[rad(ankle), rad(side * turn), rad(-splay)]}>
            <mesh castShadow geometry={geo.foot} material={outfit} scale={[1.08, 1.04, 1.12]} rotation={[rad(90), 0, 0]} position={[0, -SEGMENT.ankleY, -0.058]} />
          </group>
        </group>
      </group>
    )
  }

  const arm = (side: -1 | 1) => {
    const isLeft = side === -1
    const shoulderLift = isLeft ? pose.leftShoulder : pose.rightShoulder
    const abduct = isLeft ? pose.leftArm : pose.rightArm
    const forward = isLeft ? pose.leftArmForward : pose.rightArmForward
    const twist = isLeft ? pose.leftArmTwist : pose.rightArmTwist
    const elbow = isLeft ? pose.leftElbow : pose.rightElbow
    const forearmTwist = isLeft ? pose.leftForearmTwist : pose.rightForearmTwist
    const wrist = isLeft ? pose.leftWrist : pose.rightWrist
    const handPose = isLeft ? pose.leftHand : pose.rightHand
    const sleeve: [number, number, number] = [CLOTH_OFFSET, 1, CLOTH_OFFSET]

    return (
      <group key={`arm-${side}`} position={[side * p.shoulderJoint, SEGMENT.torso - 0.045 + shoulderLift * 0.0009, -0.006]} rotation={[rad(-forward), rad(twist), rad(abduct)]}>
        <mesh castShadow geometry={geo.upperArm} material={cover.upperArm ? outfit : skin} scale={cover.upperArm ? sleeve : 1} />
        {cover.upperArm && !cover.forearm && <mesh material={outfit} position={[0, -SEGMENT.upperArm * 0.965, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[p.armUpper * 0.72, 0.0035, 8, 24]} />
        </mesh>}
        <group position={[0, -SEGMENT.upperArm, 0]} rotation={[0, 0, rad(elbow)]}>
          <group rotation={[0, rad(forearmTwist), 0]}>
            <mesh castShadow geometry={geo.forearm} material={cover.forearm ? outfit : skin} scale={cover.forearm ? sleeve : 1} />
            <group position={[0, -SEGMENT.forearm, 0]} rotation={[rad(wrist), 0, 0]}>
              <Hand side={side} pose={handPose} geo={geo} material={skin} nail={nail} scale={1} />
            </group>
          </group>
        </group>
      </group>
    )
  }

  const gazeResolved = gaze ?? { yaw: pose.gazeYaw, pitch: pose.gazePitch }
  const cloth: [number, number, number] = [CLOTH_OFFSET, 1, CLOTH_OFFSET]

  return (
    <group position={[pose.hipShift, pelvisY + pose.rootLift, 0]}>
      <group rotation={[0, rad(pose.hipYaw), rad(-pose.hipTilt + pose.weightShift * 2.5)]}>
        {/* The spine turns above the pelvis; the legs stay with the pelvis. */}
        <group rotation={[rad(pose.spineBend), rad(pose.torsoYaw - pose.hipYaw), rad(-pose.spineSide)]}>
          <group position={[0, -SEGMENT.pelvisDrop, 0]}>
            <mesh castShadow receiveShadow geometry={geo.torso} material={skin} />
            {/* The garment stops at the neckline; skin above it catches the key. */}
            <mesh castShadow receiveShadow geometry={geo.garment} material={outfit} scale={cloth} />
            {(appearance.outfit === 'tshirt' || appearance.outfit === 'shirt' || appearance.outfit === 'activewear') && <mesh material={outfit}
              position={[0, cover.neckline * (SEGMENT.torso + SEGMENT.pelvisDrop) + 0.002, 0.006]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[1.26, 1, 1]}>
              <torusGeometry args={[p.neck * 1.42, 0.0055, 8, 36]} />
            </mesh>}
            {geo.jacket && <mesh castShadow receiveShadow geometry={geo.jacket} material={outfit} scale={[CLOTH_OFFSET * 1.10, 1, CLOTH_OFFSET * 1.14]} />}
            {(appearance.outfit === 'shirt' || appearance.outfit === 'suit' || appearance.outfit === 'coat') && <group position={[0, SEGMENT.torso * 0.46, p.chestDepth * 1.075]}>
              {[-0.12, -0.04, 0.04, 0.12].map((y) => <mesh key={y} position={[0, y, 0]}><sphereGeometry args={[0.006, 12, 8]} /><meshPhysicalMaterial color="#242724" roughness={0.38} clearcoat={0.3} /></mesh>)}
            </group>}
          </group>

          <group position={[0, SEGMENT.torso + 0.040, 0]}>
            <mesh castShadow geometry={geo.neck} material={skin} />
            {([-1, 1] as const).map((side) => (
              <mesh key={`sternomastoid-${side}`} castShadow material={skin}
                position={[side * 0.025, SEGMENT.neckLength * 0.42, 0.047]}
                rotation={[rad(-5), 0, rad(side * 16)]}
                scale={[0.72, 1, 0.48]}>
                <capsuleGeometry args={[0.009, 0.052, 6, 14]} />
              </mesh>
            ))}
            <mesh castShadow material={skin} position={[0, SEGMENT.neckLength * 0.50, 0.056]} scale={[0.72, 1.2, 0.55]}>
              <sphereGeometry args={[0.008, 14, 10]} />
            </mesh>
            <group
              position={[0, SEGMENT.neckLength + 0.004, pose.neckExtend * 0.0007]}
              rotation={[rad(pose.headTilt), rad(pose.headYaw), rad(-pose.headRoll)]}
            >
              <mesh castShadow geometry={geo.head} material={faceSkin} />
              <Face pose={pose} skin={faceSkin} hair={hair} appearance={appearance} gaze={gazeResolved} face={face} />
              <Hair style={appearance.hairStyle} material={hair} physique={physique} jawSet={pose.jawSet} />
            </group>
          </group>

          {arm(-1)}{arm(1)}
        </group>

        {cover.legs === 'skirt' && <mesh castShadow receiveShadow material={outfit} geometry={geo.skirt} position={[0, 0.035, 0]} scale={[CLOTH_OFFSET, 1, CLOTH_OFFSET]} />}
        {cover.legs === 'long-skirt' && <mesh castShadow receiveShadow material={outfit} geometry={geo.longSkirt} position={[0, 0.035, 0]} scale={[CLOTH_OFFSET, 1, CLOTH_OFFSET]} />}
        {leg(-1)}{leg(1)}
      </group>
    </group>
  )
}
