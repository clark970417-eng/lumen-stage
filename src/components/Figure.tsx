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
  DEFAULT_PHYSIQUE, faceShapeFor, faceVariation, footRings, forearmRings, HEAD, headRings, jointBall, loft, neckRings,
  palmRings, resolvePhysique, SEGMENT, shinRings, sliceRings, thighRings, torsoRings,
  hairShell, sculptedHead, upperArmRings, type FaceVariation, type Physique,
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
    // The shell is an open surface bounded by the hairline, so the inside of
    // the far side is visible through the gap around the face.
    side: THREE.DoubleSide,
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
      head: sculptedHead(faceShapeFor(physique.face ?? 0), physique.sex, jawSet),
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
      <mesh scale={[1, 0.94, 0.92]}><sphereGeometry args={[0.0118, 24, 18]} /><meshPhysicalMaterial color="#f0ece3" roughness={0.12} clearcoat={0.9} clearcoatRoughness={0.04} /></mesh>
      <mesh position={[irisX, irisY, 0.0102]}><circleGeometry args={[0.0058, 24]} /><meshPhysicalMaterial color={appearance.eyeColor} roughness={0.12} clearcoat={0.95} /></mesh>
      <mesh position={[irisX, irisY, 0.0107]}><circleGeometry args={[0.0026, 20]} /><meshBasicMaterial color="#07090a" /></mesh>
      {/* Lash line. A dark edge is what separates an eye from a bead. */}
      <mesh position={[0, 0.0088 - (1 - open) * 0.0088, 0.0060]} rotation={[rad(-14), 0, 0]} scale={[1.16, 0.10, 0.5]}>
        <sphereGeometry args={[0.0126, 18, 10]} />
        <meshStandardMaterial color={appearance.makeup === 'none' ? '#3a2c26' : '#241a18'} roughness={0.5} />
      </mesh>
      {/* Lids. Dropping the upper one is the only honest way to show a squint. */}
      <mesh castShadow position={[0, 0.0122 - (1 - open) * 0.0112, -0.0016]} rotation={[rad(-12), 0, 0]} scale={[1.24, 0.40 + (1 - open) * 0.58, 1.10]} material={skin}>
        <sphereGeometry args={[0.0126, 20, 14]} />
      </mesh>
      <mesh castShadow position={[0, -0.0112 + (1 - open) * 0.0024, -0.0018]} scale={[1.20, 0.26, 1.06]} material={skin}>
        <sphereGeometry args={[0.0124, 18, 12]} />
      </mesh>
    </group>
  )

  return (
    <>
      {/* The brow itself: thin, and sitting on the ridge rather than floating. */}
      {([-1, 1] as const).map((side) => (
        <mesh key={`brow-${side}`} position={[side * (HEAD.eyeX + face.eyeSpacing), HEAD.browY + face.browHeight + brow * 0.005 + (side < 0 ? face.asymmetry * 1.4 : 0), HEAD.eyeZ + 0.016]}
          rotation={[0, 0, rad(side * (-9 + brow * -6))]} scale={[1.75, 0.115, 0.16]} material={hair}>
          <sphereGeometry args={[0.0142, 18, 12]} />
        </mesh>
      ))}
      {([-1, 1] as const).map((side) => (
        <mesh key={`ear-${side}`} castShadow position={[side * (HEAD.earX - 0.004), HEAD.earY, -0.020]} rotation={[rad(-6), rad(side * -22), 0]} scale={[0.16, 0.54, 0.30]} material={skin}>
          <sphereGeometry args={[0.030, 18, 14]} />
        </mesh>
      ))}
      {([-1, 1] as const).map((side) => eye(side))}

      {/*
        Lips. The shape is sculpted into the skull; this is only the colour,
        laid on as a thin shell that follows it.
      */}
      <group position={[face.asymmetry * 0.6, HEAD.mouthY - mouthOpen * 0.013, HEAD.mouthZ]} scale={[1 + face.mouthWidth, 1, 1]}>
        {(mouthOpen > 0.04 || lipPart > 0.1) && (
          <mesh position={[0, 0, -0.008]} scale={[1, 0.4 + mouthOpen * 1.7 + lipPart * 0.3, 0.8]}>
            <sphereGeometry args={[0.019, 18, 12]} />
            <meshStandardMaterial color="#2a1113" roughness={0.5} />
          </mesh>
        )}
        <mesh position={[0, 0.0058 + smile * 0.0018, 0.0008]} scale={[1.02, 0.20, 0.16]}>
          <sphereGeometry args={[0.0235, 24, 14]} />
          <meshPhysicalMaterial color={lipColor} roughness={appearance.makeup === 'editorial' ? 0.24 : 0.55} clearcoat={appearance.makeup === 'editorial' ? 0.6 : 0.16} />
        </mesh>
        <mesh position={[0, -0.0064 - mouthOpen * 0.011, 0.0010]} scale={[0.96, 0.24, 0.18]}>
          <sphereGeometry args={[0.0235, 24, 14]} />
          <meshPhysicalMaterial color={lipColor} roughness={appearance.makeup === 'editorial' ? 0.24 : 0.55} clearcoat={appearance.makeup === 'editorial' ? 0.6 : 0.16} />
        </mesh>
      </group>

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
            <mesh castShadow geometry={geo.foot} material={skin} rotation={[rad(90), 0, 0]} position={[0, -SEGMENT.ankleY, -0.058]} />
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

          <group position={[0, SEGMENT.torso + 0.040, 0]}>
            <mesh castShadow geometry={geo.neck} material={skin} />
            <group
              position={[0, SEGMENT.neckLength + 0.004, pose.neckExtend * 0.0007]}
              rotation={[rad(pose.headTilt), rad(pose.headYaw), rad(-pose.headRoll)]}
            >
              <mesh castShadow geometry={geo.head} material={skin} />
              <Face pose={pose} skin={skin} hair={hair} appearance={appearance} gaze={gazeResolved} face={face} />
              <Hair style={appearance.hairStyle} material={hair} physique={physique} jawSet={pose.jawSet} />
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
