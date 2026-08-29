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
  DEFAULT_PHYSIQUE, faceVariation, footRings, forearmRings, HEAD, headRings, jointBall, loft, neckRings,
  palmRings, resolvePhysique, SEGMENT, shinRings, sliceRings, thighRings, torsoRings,
  upperArmRings, type FaceVariation, type Physique,
} from '../anatomy'
import { fabricNormalMap, fabricRoughnessMap, hairNormalMap, skinNormalMap, skinRoughnessMap } from '../textures'
import type { HandPose, ModelPose } from '../pose'
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
    return new THREE.MeshPhysicalMaterial({
      color: base,
      roughness: lerp(0.28, 0.86, appearance.skinRoughness / 100),
      roughnessMap: skinRoughnessMap(),
      normalMap: skinNormalMap(),
      normalScale: new THREE.Vector2(0.42, 0.42),
      metalness: 0,
      clearcoat: (appearance.skinOil / 100) * 0.5,
      clearcoatRoughness: lerp(0.10, 0.44, appearance.skinRoughness / 100),
      sheen: (appearance.subsurface / 100) * 0.7,
      sheenColor: base.clone().lerp(new THREE.Color('#ff8a76'), 0.4),
      sheenRoughness: 0.8,
      // Stand-in for subsurface transport: a touch of the skin's own colour
      // leaking back out, which is what keeps a shadow terminator warm.
      emissive: base.clone().multiplyScalar(0.14),
      emissiveIntensity: (appearance.subsurface / 100) * 0.09,
    })
  }, [appearance.skinOil, appearance.skinRoughness, appearance.subsurface, skinColor])

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

  const hair = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: appearance.hairColor,
    roughness: lerp(0.74, 0.16, appearance.hairGloss / 100),
    normalMap: hairNormalMap(),
    normalScale: new THREE.Vector2(0.9, 0.9),
    sheen: appearance.hairGloss / 100,
    sheenColor: new THREE.Color(appearance.hairColor).lerp(new THREE.Color('#ffffff'), 0.3),
    sheenRoughness: 0.22,
    clearcoat: (appearance.hairGloss / 100) * 0.35,
  }), [appearance.hairColor, appearance.hairGloss])

  useEffect(() => () => { skin.dispose(); outfit.dispose(); hair.dispose() }, [hair, outfit, skin])
  return { skin, outfit, hair }
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
      head: loft(headRings(jawSet), { segments: 32, up: true }),
      upperArm: loft(upperArmRings(p), { segments: 20 }),
      forearm: loft(forearmRings(p), { segments: 20 }),
      thigh: loft(thighRings(p), { segments: 24 }),
      shin: loft(shinRings(p), { segments: 24 }),
      foot: loft(footRings(0.048), { segments: 16, up: true }),
      palm: loft(palmRings(1), { segments: 14 }),
      shoulderBall: jointBall(p.armUpper * 1.2, 1, 1),
      elbowBall: jointBall(p.armUpper * 0.84, 1, 1),
      kneeBall: jointBall(p.calf * 1.06, 1, 1),
      hipBall: jointBall(p.thigh * 1.02, 1, 1),
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
function Hand({ side, pose, geo, material, scale }: { side: -1 | 1; pose: HandPose; geo: Geo; material: THREE.Material; scale: number }) {
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
          </group>
        </group>
      ))}
      <group position={[0.031 * side, -SEGMENT.hand * 0.3, 0.012]} rotation={[rad(curl.thumb * 0.5), 0, rad(-38 * side)]}>
        <mesh castShadow geometry={geo.finger} material={material} position={[0, -0.019, 0]} scale={[1.15, 1.1, 1.15]} />
        <group position={[0, -0.038, 0]} rotation={[rad(curl.thumb), 0, 0]}>
          <mesh castShadow geometry={geo.finger} material={material} position={[0, -0.014, 0]} scale={[1.05, 0.85, 1.05]} />
        </group>
      </group>
    </group>
  )
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

  const eye = (side: -1 | 1) => (
    <group key={`eye-${side}`} position={[side * (HEAD.eyeX + face.eyeSpacing), HEAD.eyeY + face.eyeHeight + (side < 0 ? face.asymmetry : 0), HEAD.eyeZ]}>
      <mesh scale={[1, 0.86, 0.9]}><sphereGeometry args={[0.0122, 24, 18]} /><meshPhysicalMaterial color="#f2eee6" roughness={0.14} clearcoat={0.85} clearcoatRoughness={0.05} /></mesh>
      <mesh position={[irisX, irisY, 0.0105]}><circleGeometry args={[0.0057, 24]} /><meshPhysicalMaterial color={appearance.eyeColor} roughness={0.13} clearcoat={0.95} /></mesh>
      <mesh position={[irisX, irisY, 0.0111]}><circleGeometry args={[0.0025, 20]} /><meshBasicMaterial color="#07090a" /></mesh>
      {/* Lids. Dropping the upper one is the only honest way to show a squint. */}
      <mesh castShadow position={[0, 0.0092 - (1 - open) * 0.0092, -0.0010]} rotation={[rad(-10), 0, 0]} scale={[1.14, 0.34 + (1 - open) * 0.60, 1.02]} material={skin}>
        <sphereGeometry args={[0.0126, 20, 14]} />
      </mesh>
      <mesh castShadow position={[0, -0.0098 + (1 - open) * 0.0022, -0.0012]} scale={[1.12, 0.24, 1.00]} material={skin}>
        <sphereGeometry args={[0.0124, 18, 12]} />
      </mesh>
    </group>
  )

  return (
    <>
      {/* Brow ridge — the surface that makes or breaks a top-heavy key. */}
      {([-1, 1] as const).map((side) => (
        <mesh key={`brow-${side}`} position={[side * (HEAD.eyeX + face.eyeSpacing), HEAD.browY + face.browHeight + brow * 0.006 + (side < 0 ? face.asymmetry * 1.4 : 0), HEAD.eyeZ + 0.008]}
          rotation={[0, 0, rad(side * (-8 + brow * -7))]} scale={[1.6, 0.20, 0.30]} material={hair}>
          <sphereGeometry args={[0.0148, 18, 12]} />
        </mesh>
      ))}
      {/* Cheekbones — what a portrait key is really aimed at. */}
      {([-1, 1] as const).map((side) => (
        <mesh key={`cheek-${side}`} castShadow position={[side * (HEAD.cheekX + face.jawWidth * 0.04), HEAD.cheekY + face.cheekHeight, HEAD.cheekZ]} scale={[0.9 + face.jawWidth, 0.72, 0.6]} material={skin}>
          <sphereGeometry args={[0.032, 20, 16]} />
        </mesh>
      ))}
      {([-1, 1] as const).map((side) => (
        <mesh key={`ear-${side}`} castShadow position={[side * HEAD.earX, HEAD.earY, -0.006]} rotation={[0, rad(side * -16), 0]} scale={[0.22, 0.64, 0.36]} material={skin}>
          <sphereGeometry args={[0.032, 18, 14]} />
        </mesh>
      ))}
      {([-1, 1] as const).map((side) => eye(side))}

      {/* Nose: bridge, tip, nostril wings. */}
      <mesh castShadow position={[0, HEAD.noseBridgeY + face.noseLength * 0.5, HEAD.eyeZ + 0.020]} rotation={[rad(14), 0, 0]} scale={[0.30 + face.noseWidth * 0.12, 1.7, 0.55]} material={skin}><sphereGeometry args={[0.020, 18, 14]} /></mesh>
      <mesh castShadow position={[0, HEAD.noseTipY + face.noseLength, HEAD.noseTipZ]} scale={[0.62 + face.noseWidth * 0.3, 0.58, 0.68]} material={skin}><sphereGeometry args={[0.022, 20, 16]} /></mesh>
      {([-1, 1] as const).map((side) => (
        <mesh key={`nostril-${side}`} castShadow position={[side * 0.0115, HEAD.noseTipY - 0.004, HEAD.noseTipZ - 0.008]} scale={[0.52, 0.48, 0.5]} material={skin}><sphereGeometry args={[0.018, 14, 10]} /></mesh>
      ))}

      {/* Mouth. The dark interior only shows once the jaw actually opens. */}
      <group position={[face.asymmetry * 0.6, HEAD.mouthY - mouthOpen * 0.013, HEAD.mouthZ]} scale={[1 + face.mouthWidth, 1, 1]}>
        {(mouthOpen > 0.04 || lipPart > 0.1) && (
          <mesh position={[0, 0, -0.006]} scale={[1, 0.4 + mouthOpen * 1.7 + lipPart * 0.3, 0.8]}>
            <sphereGeometry args={[0.019, 18, 12]} />
            <meshStandardMaterial color="#2a1113" roughness={0.5} />
          </mesh>
        )}
        <mesh castShadow position={[0, 0.0064 + smile * 0.0018, 0]} scale={[1, 0.30, 0.36]}>
          <sphereGeometry args={[0.0235, 22, 14]} />
          <meshPhysicalMaterial color={lipColor} roughness={appearance.makeup === 'editorial' ? 0.24 : 0.52} clearcoat={appearance.makeup === 'editorial' ? 0.6 : 0.18} />
        </mesh>
        <mesh castShadow position={[0, -0.0064 - mouthOpen * 0.011, 0.0004]} scale={[0.94, 0.38, 0.40]}>
          <sphereGeometry args={[0.0235, 22, 14]} />
          <meshPhysicalMaterial color={lipColor} roughness={appearance.makeup === 'editorial' ? 0.24 : 0.52} clearcoat={appearance.makeup === 'editorial' ? 0.6 : 0.18} />
        </mesh>
        {([-1, 1] as const).map((side) => (
          <mesh key={`corner-${side}`} position={[side * 0.0222, smile * 0.0062, -0.0022]} scale={[0.3, 0.3, 0.3]} material={skin}>
            <sphereGeometry args={[0.012, 12, 10]} />
          </mesh>
        ))}
      </group>

      <mesh castShadow position={[0, HEAD.chinY + 0.010, HEAD.chinZ]} scale={[0.68 + face.jawWidth * 0.5, 0.60, 0.62]} material={skin}><sphereGeometry args={[0.032, 20, 16]} /></mesh>

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
    </>
  )
}

function Hair({ style, material, physique }: { style: HairStyle; material: THREE.Material; physique: Physique }) {
  if (style === 'bald') return null
  const R = HEAD.halfDepth
  const crown = HEAD.eyeY + 0.030
  const feminine = physique.sex === 'feminine'
  const cap = (scale: [number, number, number], y: number, z: number, radius: number, sweep = 0.52) => (
    <mesh castShadow position={[0, y, z]} scale={scale} material={material}>
      <sphereGeometry args={[radius, 40, 28, 0, Math.PI * 2, 0, Math.PI * sweep]} />
    </mesh>
  )
  return (
    <group>
      {style === 'buzz' && cap([0.78, 0.98, 1.0], crown - 0.002, -0.006, R * 1.005, 0.50)}
      {style !== 'buzz' && cap([0.82, 1.02, 1.04], crown + 0.002, -0.012, R * 1.02, 0.54)}
      {/* Occiput: hair has volume behind the skull, and it catches the rim. */}
      {style !== 'buzz' && (
        <mesh castShadow position={[0, crown - 0.030, -R * 0.44]} scale={[0.74, 0.86, 0.58]} material={material}><sphereGeometry args={[R * 1.0, 28, 20]} /></mesh>
      )}
      {style === 'bob' && (
        <>
          {([-1, 1] as const).map((side) => (
            <mesh key={side} castShadow position={[side * HEAD.halfWidth * 1.02, crown - 0.082, -0.016]} scale={[0.30, 1.15, 0.90]} material={material}><sphereGeometry args={[R * 0.72, 24, 18]} /></mesh>
          ))}
          <mesh castShadow position={[0, crown - 0.108, -R * 0.36]} scale={[0.80, 0.5, 0.72]} material={material}><sphereGeometry args={[R * 0.98, 28, 18]} /></mesh>
        </>
      )}
      {style === 'long' && (
        <>
          <mesh castShadow position={[0, crown - 0.20, -R * 0.42]} scale={[0.78, 1, 0.52]} material={material}><capsuleGeometry args={[R * 0.86, 0.26, 8, 24]} /></mesh>
          {([-1, 1] as const).map((side) => (
            <mesh key={side} castShadow position={[side * HEAD.halfWidth * 1.04, crown - 0.125, -0.014]} scale={[0.30, 1, 0.58]} material={material}><capsuleGeometry args={[R * 0.6, 0.17, 6, 16]} /></mesh>
          ))}
        </>
      )}
      {style === 'ponytail' && (
        <mesh castShadow position={[0, crown - 0.055, -R * 1.02]} rotation={[rad(26), 0, 0]} scale={[0.55, 1, 0.55]} material={material}><capsuleGeometry args={[R * 0.42, 0.22, 6, 18]} /></mesh>
      )}
      {style === 'bun' && (
        <mesh castShadow position={[0, crown + 0.020, -R * 0.86]} scale={[1, 0.9, 0.9]} material={material}><sphereGeometry args={[R * 0.52, 24, 18]} /></mesh>
      )}
      {(style === 'curly' || style === 'afro') && (
        <group>
          {Array.from({ length: style === 'afro' ? 26 : 18 }, (_, index) => {
            // A fixed lattice, not random, so the same hair renders every frame.
            const count = style === 'afro' ? 26 : 18
            const phi = (index / count) * Math.PI * 2 * 1.618
            const theta = Math.acos(1 - 1.3 * ((index + 0.5) / count))
            const radius = style === 'afro' ? R * 1.24 : R * 1.06
            return (
              <mesh key={index} castShadow material={material}
                position={[Math.sin(theta) * Math.cos(phi) * radius * 0.82, crown - 0.010 + Math.cos(theta) * radius * 0.9, Math.sin(theta) * Math.sin(phi) * radius - 0.008]}>
                <sphereGeometry args={[style === 'afro' ? R * 0.42 : R * 0.34, 14, 10]} />
              </mesh>
            )
          })}
        </group>
      )}
      {/* A hairline. Without one the forehead runs straight into the cap. */}
      {style !== 'buzz' && style !== 'afro' && style !== 'curly' && (
        <mesh castShadow position={[0, crown + (feminine ? 0.026 : 0.032), R * 0.26]} rotation={[rad(-8), 0, 0]} scale={[0.82, 0.16, 0.34]} material={material}><sphereGeometry args={[R * 0.92, 28, 18]} /></mesh>
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
  const { skin, outfit, hair } = useFigureMaterials(skinColor, outfitColor, appearance)
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
    const seated = Math.min(pose.leftLeg, pose.rightLeg) > 60
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
        <mesh castShadow geometry={geo.hipBall} material={legMaterial} scale={legScale} />
        <mesh castShadow geometry={geo.thigh} material={legMaterial} scale={legScale} />
        <group position={[0, -SEGMENT.thigh, 0]} rotation={[rad(knee), 0, 0]}>
          <mesh castShadow geometry={geo.kneeBall} material={legMaterial} scale={legScale} />
          <mesh castShadow geometry={geo.shin} material={legMaterial} scale={legScale} />
          <group position={[0, -SEGMENT.shin, 0]} rotation={[rad(ankle), rad(side * turn), rad(-splay)]}>
            <mesh castShadow geometry={geo.foot} material={skin} rotation={[rad(-90), 0, 0]} position={[0, -SEGMENT.ankleY, 0.012]} />
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
        <mesh castShadow geometry={geo.shoulderBall} material={cover.upperArm ? outfit : skin} scale={cover.upperArm ? sleeve : 1} />
        <mesh castShadow geometry={geo.upperArm} material={cover.upperArm ? outfit : skin} scale={cover.upperArm ? sleeve : 1} />
        <group position={[0, -SEGMENT.upperArm, 0]} rotation={[0, 0, rad(elbow)]}>
          <mesh castShadow geometry={geo.elbowBall} material={cover.forearm ? outfit : skin} scale={cover.forearm ? sleeve : 1} />
          <group rotation={[0, rad(forearmTwist), 0]}>
            <mesh castShadow geometry={geo.forearm} material={cover.forearm ? outfit : skin} scale={cover.forearm ? sleeve : 1} />
            <group position={[0, -SEGMENT.forearm, 0]} rotation={[rad(wrist), 0, 0]}>
              <Hand side={side} pose={handPose} geo={geo} material={skin} scale={1} />
            </group>
          </group>
        </group>
      </group>
    )
  }

  const gazeResolved = gaze ?? { yaw: pose.gazeYaw, pitch: pose.gazePitch }
  const cloth: [number, number, number] = [CLOTH_OFFSET, 1, CLOTH_OFFSET]

  return (
    <group position={[pose.hipShift, pelvisY, 0]}>
      <group rotation={[0, rad(pose.hipYaw), rad(-pose.hipTilt + pose.weightShift * 2.5)]}>
        {/* The spine turns above the pelvis; the legs stay with the pelvis. */}
        <group rotation={[rad(pose.spineBend), rad(pose.torsoYaw - pose.hipYaw), rad(-pose.spineSide)]}>
          <group position={[0, -SEGMENT.pelvisDrop, 0]}>
            <mesh castShadow receiveShadow geometry={geo.torso} material={skin} />
            {/* The garment stops at the neckline; skin above it catches the key. */}
            <mesh castShadow receiveShadow geometry={geo.garment} material={outfit} scale={cloth} />
            {geo.jacket && <mesh castShadow receiveShadow geometry={geo.jacket} material={outfit} scale={[CLOTH_OFFSET * 1.10, 1, CLOTH_OFFSET * 1.14]} />}
          </group>

          <group position={[0, SEGMENT.torso - 0.012, 0]}>
            <mesh castShadow geometry={geo.neck} material={skin} />
            <group
              position={[0, SEGMENT.neckLength + 0.004, pose.neckExtend * 0.0007]}
              rotation={[rad(pose.headTilt), rad(pose.headYaw), rad(-pose.headRoll)]}
            >
              <mesh castShadow geometry={geo.head} material={skin} />
              <Face pose={pose} skin={skin} hair={hair} appearance={appearance} gaze={gazeResolved} face={face} />
              <Hair style={appearance.hairStyle} material={hair} physique={physique} />
            </group>
          </group>

          {arm(-1)}{arm(1)}
        </group>

        {(cover.legs === 'skirt' || cover.legs === 'long-skirt') && (
          <mesh castShadow receiveShadow material={outfit} position={[0, -(cover.legs === 'skirt' ? 0.24 : 0.46), 0]}>
            <cylinderGeometry args={[p.hipHalf * 1.06, p.hipHalf * (cover.legs === 'skirt' ? 1.4 : 1.9), cover.legs === 'skirt' ? 0.56 : 1.00, 40, 1, true]} />
          </mesh>
        )}
        {leg(-1)}{leg(1)}
      </group>
    </group>
  )
}
