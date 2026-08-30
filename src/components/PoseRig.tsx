/**
 * Drag-to-pose handles.
 *
 * Sliders are precise but slow, and on a phone they are worse than slow. What a
 * photographer wants is to reach into the frame and put the hand where the hand
 * should go, so each handle is a joint you drag and the rig solves backwards
 * from it.
 *
 * Dragging happens on a plane that faces the camera and passes through the
 * handle. That keeps the motion matched to the pointer at any orbit angle, and
 * it means depth changes when you orbit and drag again rather than needing a
 * separate gizmo axis.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Physique } from '../physique'
import {
  armPatch, forwardKinematics, legPatch, solveArm, solveHeadAim, solveLeg,
  solveSpineAim, solveThigh, solveUpperArm, type Side,
} from '../ik'
import type { ModelPose } from '../pose'
import type { BoneMap } from '../retarget'
import { rigOverlayPoints } from '../rigOverlay'

type HandleId =
  | 'head' | 'chest' | 'hips'
  | 'leftShoulder' | 'rightShoulder'
  | 'leftElbow' | 'rightElbow' | 'leftWrist' | 'rightWrist'
  | 'leftHip' | 'rightHip'
  | 'leftKnee' | 'rightKnee' | 'leftAnkle' | 'rightAnkle'

const HANDLE_COLOR = '#d8ff3e'
const HANDLE_ACTIVE = '#ffffff'

/**
 * One draggable joint.
 *
 * The invisible drag plane only exists while a drag is live, so it never
 * intercepts a click meant for the light or the subject underneath.
 */
function Handle({ position, radius, active, onStart, onDrag, onEnd }: {
  position: THREE.Vector3
  radius: number
  active: boolean
  onStart: () => void
  onDrag: (point: THREE.Vector3) => void
  onEnd: () => void
}) {
  // The visible sphere is sized for the body; the pick sphere is sized for a
  // fingertip. Separating them is what makes this usable on a phone.
  const pickRadius = radius * 5.2
  const { camera } = useThree()
  const plane = useRef<THREE.Mesh>(null)
  const anchor = useRef(new THREE.Vector3())
  const [hovered, setHovered] = useState(false)

  useFrame(() => {
    if (plane.current) plane.current.quaternion.copy(camera.quaternion)
  })

  // The plane is pinned where the drag started. Letting it ride the handle
  // means an out-of-reach target drags the plane along with the pointer, and
  // the joint stalls while the cursor runs away from it.
  useEffect(() => {
    if (active) anchor.current.copy(position)
  }, [active, position])

  // A pointer released outside the plane still has to end the drag, so the
  // release is caught on the window rather than on any mesh.
  useEffect(() => {
    if (!active) return
    const stop = () => onEnd()
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [active, onEnd])

  return (
    <group position={position}>
      <mesh
        onPointerDown={(event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onStart() }}
        onPointerOver={(event) => { event.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[pickRadius, 12, 10]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh raycast={() => null}>
        <sphereGeometry args={[radius, 20, 16]} />
        <meshBasicMaterial
          color={active ? HANDLE_ACTIVE : HANDLE_COLOR}
          transparent
          opacity={active ? 1 : hovered ? 0.95 : 0.72}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      {/* A faint ring makes the handle findable against a bright backdrop. */}
      <mesh renderOrder={2}>
        <ringGeometry args={[radius * 1.5, radius * 1.85, 24]} />
        <meshBasicMaterial color={active ? HANDLE_ACTIVE : HANDLE_COLOR} transparent opacity={active ? 0.8 : 0.3} depthTest={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {active && (
        <mesh
          ref={plane}
          position={anchor.current.clone().sub(position)}
          onPointerMove={(event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onDrag(event.point) }}
        >
          <planeGeometry args={[40, 40]} />
          <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

/**
 * The handle set for one figure.
 *
 * Rendered inside the figure's own group, so the forward-kinematics positions
 * can be used directly and a dragged world point converts back with the group's
 * own inverse transform — no duplicated position, rotation or height maths.
 */
export function PoseRig({ pose, physique, seatHeight, groupRef, boneMap, onChange }: {
  pose: ModelPose
  physique: Physique
  seatHeight: number | null
  /** The group the figure is rendered in, used to convert world to local. */
  groupRef: React.RefObject<THREE.Group | null>
  /** Actual imported skeleton, when this overlay drives a GLB rather than Figure. */
  boneMap?: BoneMap | null
  onChange: (patch: Partial<ModelPose>) => void
}) {
  const [dragging, setDragging] = useState<HandleId | null>(null)
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null

  const beginDrag = useCallback((id: HandleId) => {
    if (controls) controls.enabled = false
    setDragging(id)
  }, [controls])

  const endDrag = useCallback(() => {
    if (controls) controls.enabled = true
    setDragging(null)
  }, [controls])

  const solverPoints = useMemo(() => forwardKinematics(pose, physique, seatHeight), [physique, pose, seatHeight])
  const [points, setPoints] = useState(solverPoints)

  useEffect(() => {
    if (!boneMap || !groupRef.current) {
      setPoints(solverPoints)
      return
    }
    // ImportedModel applies the new pose in an effect. Read the bones on the
    // next frame so the overlay never displays the previous pose for one beat.
    const frame = window.requestAnimationFrame(() => {
      if (groupRef.current) setPoints(rigOverlayPoints(boneMap, groupRef.current, solverPoints))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [boneMap, groupRef, solverPoints])

  // Leaving pose mode mid-drag must not leave the camera locked.
  useEffect(() => () => { if (controls) controls.enabled = true }, [controls])

  const toLocal = useCallback((world: THREE.Vector3) => {
    const group = groupRef.current
    if (!group) return world.clone()
    return group.worldToLocal(world.clone())
  }, [groupRef])

  const drag = useCallback((id: HandleId, world: THREE.Vector3) => {
    const local = toLocal(world)
    const visualPoint = points[id]
    const solverPoint = solverPoints[id]
    const solverLocal = boneMap && visualPoint && solverPoint
      ? local.clone().sub(visualPoint).add(solverPoint)
      : local
    if (id === 'head') { onChange(solveHeadAim(solverLocal, pose, physique, seatHeight)); return }
    if (id === 'chest') { onChange(solveSpineAim(solverLocal, pose, physique, seatHeight)); return }
    if (id === 'hips') {
      onChange({ hipShift: THREE.MathUtils.clamp(pose.hipShift + local.x - points.hips.x, -0.16, 0.16) })
      return
    }
    const side: Side = id.startsWith('left') ? -1 : 1
    if (id === 'leftShoulder' || id === 'rightShoulder') {
      const current = side === -1 ? solverPoints.leftShoulder : solverPoints.rightShoulder
      const key = side === -1 ? 'leftShoulder' : 'rightShoulder'
      onChange({ [key]: THREE.MathUtils.clamp(pose[key] + (solverLocal.y - current.y) / 0.0009, -25, 45) })
      return
    }
    if (id === 'leftElbow' || id === 'rightElbow') {
      onChange(solveUpperArm(side, solverLocal, pose, physique, seatHeight))
      return
    }
    if (id === 'leftWrist' || id === 'rightWrist') {
      onChange(armPatch(side, solveArm(side, solverLocal, pose, physique, seatHeight)))
      return
    }
    if (id === 'leftHip' || id === 'rightHip') {
      const current = side === -1 ? solverPoints.leftHip : solverPoints.rightHip
      const hipRadius = Math.max(0.04, Math.abs(current.x - solverPoints.hips.x))
      const tiltDelta = (solverLocal.y - current.y) / (hipRadius * THREE.MathUtils.DEG2RAD) * -side
      onChange({
        hipShift: THREE.MathUtils.clamp(pose.hipShift + solverLocal.x - current.x, -0.16, 0.16),
        hipTilt: THREE.MathUtils.clamp(pose.hipTilt + tiltDelta, -18, 18),
      })
      return
    }
    if (id === 'leftKnee' || id === 'rightKnee') {
      onChange(solveThigh(side, solverLocal, pose, physique, seatHeight))
      return
    }
    onChange(legPatch(side, solveLeg(side, solverLocal, pose, physique, seatHeight)))
  }, [boneMap, onChange, physique, points, pose, seatHeight, solverPoints, toLocal])

  const handles: { id: HandleId; point: THREE.Vector3; radius: number }[] = [
    { id: 'head', point: points.head, radius: 0.016 },
    { id: 'chest', point: points.chest, radius: 0.014 },
    { id: 'hips', point: points.hips, radius: 0.014 },
    { id: 'leftShoulder', point: points.leftShoulder, radius: 0.011 },
    { id: 'rightShoulder', point: points.rightShoulder, radius: 0.011 },
    { id: 'leftElbow', point: points.leftElbow, radius: 0.012 },
    { id: 'rightElbow', point: points.rightElbow, radius: 0.012 },
    { id: 'leftWrist', point: points.leftWrist, radius: 0.011 },
    { id: 'rightWrist', point: points.rightWrist, radius: 0.011 },
    { id: 'leftHip', point: points.leftHip, radius: 0.011 },
    { id: 'rightHip', point: points.rightHip, radius: 0.011 },
    { id: 'leftKnee', point: points.leftKnee, radius: 0.012 },
    { id: 'rightKnee', point: points.rightKnee, radius: 0.012 },
    { id: 'leftAnkle', point: points.leftAnkle, radius: 0.011 },
    { id: 'rightAnkle', point: points.rightAnkle, radius: 0.011 },
  ]

  return (
    <group>
      {/* Bone lines: they show which joint a handle belongs to at a glance. */}
      <PoseSkeleton points={points} />
      {handles.map((handle) => (
        <Handle
          key={handle.id}
          position={handle.point}
          radius={handle.radius}
          active={dragging === handle.id}
          onStart={() => beginDrag(handle.id)}
          onDrag={(world) => drag(handle.id, world)}
          onEnd={endDrag}
        />
      ))}
    </group>
  )
}

/** A wireframe of the chains being driven, drawn over the figure. */
function PoseSkeleton({ points }: { points: ReturnType<typeof forwardKinematics> }) {
  const geometry = useMemo(() => {
    const vertices: number[] = []
    const segment = (a: THREE.Vector3, b: THREE.Vector3) => vertices.push(a.x, a.y, a.z, b.x, b.y, b.z)
    segment(points.hips, points.chest)
    segment(points.chest, points.neck)
    segment(points.neck, points.head)
    segment(points.chest, points.leftShoulder)
    segment(points.chest, points.rightShoulder)
    segment(points.leftShoulder, points.leftElbow)
    segment(points.rightShoulder, points.rightElbow)
    segment(points.leftElbow, points.leftWrist)
    segment(points.rightElbow, points.rightWrist)
    segment(points.hips, points.leftHip)
    segment(points.hips, points.rightHip)
    segment(points.leftHip, points.leftKnee)
    segment(points.rightHip, points.rightKnee)
    segment(points.leftKnee, points.leftAnkle)
    segment(points.rightKnee, points.rightAnkle)
    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    return buffer
  }, [points])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <lineSegments geometry={geometry} renderOrder={1}>
      <lineBasicMaterial color={HANDLE_COLOR} transparent opacity={0.28} depthTest={false} toneMapped={false} />
    </lineSegments>
  )
}
