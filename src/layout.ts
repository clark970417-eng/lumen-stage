/**
 * Placement constraints.
 *
 * Two things go wrong when a scene is dragged around by hand: stands end up
 * inside people, and lights end up at angles nobody would actually set. Both
 * are fixed here rather than in the drag handlers, so every route into a
 * position — the gizmo, the sliders, an applied setup — gets the same treatment.
 *
 * Everything works on the floor plane. Height is never constrained, because a
 * boom arm genuinely does go over a subject's head.
 */

export type Vec3 = [number, number, number]

/** Footprint radius on the floor, in metres. */
export type Occupant = {
  id: string
  position: Vec3
  radius: number
  /** A stand can be pushed; a person the scene is built around should not be. */
  movable: boolean
  /** People sit on and stand behind furniture, so those pairs never collide. */
  kind: 'subject' | 'furniture' | 'stand'
}

/** Radii are the real footprint of the gear, not the visual proxy. */
/**
 * Seat height, in metres from the floor.
 *
 * A person put over one of these sits on it rather than through it — which is
 * the whole reason a chair is in a lighting tool: it changes the eye line, and
 * the eye line is what the key light is set to.
 */
/**
 * Seat height for a figure asked to sit with nothing under it.
 *
 * A chair, near enough. A seated pose with no prop still has to put the pelvis
 * somewhere, and the alternative — treating it as standing — reads as a person
 * squatting in mid-air.
 */
export const DEFAULT_SEAT_HEIGHT = 0.46

/**
 * Where an actor's model belongs inside its own group so the pelvis lands on
 * the seat.
 *
 * A standing actor is placed by the feet; a seated one has to be placed by the
 * pelvis, because the feet no longer touch anything. The group used to be
 * raised by the seat height instead, which left the actor's pelvis exactly
 * where standing had put it and floated the whole figure a chair's height
 * above the chair.
 *
 * `hipLocalY` is measured in the model's own units, before its normalising
 * scale; `groupScale` is the height control, which the seat has to be divided
 * back out of, or a short actor would sit above a chair a tall one sits below.
 */
export function seatedModelY(seat: number, hipLocalY: number, modelScale: number, groupScale: number, rootLift = 0) {
  return seat / (groupScale || 1) - hipLocalY * modelScale + rootLift
}

/**
 * The chair's seat surface — both the thing you see and the thing a sitter is
 * placed on, so the two cannot drift apart. The seating code reads it from
 * SEAT_HEIGHT below and the mesh builds the slab around it.
 */
export const CHAIR_SEAT_TOP = 0.54
export const CHAIR_SEAT_THICKNESS = 0.1

/**
 * How far a sitter's hip joint rides above the surface they are sitting on.
 *
 * The joint is not on the seat: the femoral head and the flesh of the buttock
 * are between them. Placed level with the surface, the thigh — which is about
 * this thick — spends its lower half inside the seat, and the hands come down
 * within a couple of centimetres of it. That is what reads as the actor
 * passing through the chair.
 */
export const SEAT_TO_HIP = 0.07

/** Where a seated figure's pelvis belongs, given what is under it. */
export function seatedHipHeight(seat: number | null) {
  return (seat ?? DEFAULT_SEAT_HEIGHT) + SEAT_TO_HIP
}

export const SEAT_HEIGHT: Partial<Record<string, number>> = {
  chair: CHAIR_SEAT_TOP,
  table: 0.88,
  plinth: 1.10,
  cube: 0.82,
}

/** Furniture a figure can be placed on. */
export function isSittable(type: string) {
  return SEAT_HEIGHT[type] !== undefined
}

/** Seat height for an object, taking its own scale into account. */
export function seatHeightOf(type: string, scale = 1) {
  const base = SEAT_HEIGHT[type]
  return base === undefined ? null : base * scale
}

export const FOOTPRINT = {
  /** A light stand's tripod, splayed. */
  lightStand: 0.42,
  /** A person, shoulder to shoulder plus clearance. */
  subject: 0.34,
  dog: 0.42,
  cat: 0.25,
  product: 0.18,
  /** A C-stand holding a flag or reflector. */
  gripStand: 0.38,
  chair: 0.36,
  table: 0.72,
  plinth: 0.44,
  cube: 0.42,
  sphere: 0.36,
}

const distanceXZ = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2])

/**
 * Pushes a position out of anything it overlaps.
 *
 * The moving object yields, not the scene — otherwise dragging one light would
 * shuffle the whole set. If two things land exactly on top of each other the
 * push direction is taken from the scene's centre, which is arbitrary but
 * stable, so the result does not jitter between frames.
 */
export function resolveCollisions(position: Vec3, radius: number, occupants: Occupant[], selfId?: string, kind: Occupant['kind'] = 'stand'): Vec3 {
  let [x, y, z] = position
  // Two passes: one push can move something into a second obstacle.
  for (let pass = 0; pass < 2; pass++) {
    let moved = false
    for (const other of occupants) {
      if (other.id === selfId) continue
      // A person and a piece of furniture occupy the same floor on purpose.
      if ((kind === 'subject' && other.kind === 'furniture') || (kind === 'furniture' && other.kind === 'subject')) continue
      const minimum = radius + other.radius
      const current: Vec3 = [x, y, z]
      const gap = distanceXZ(current, other.position)
      if (gap >= minimum) continue
      let dx = x - other.position[0]
      let dz = z - other.position[2]
      if (gap < 1e-4) { dx = x || 0.001; dz = z || 0.001 }
      const length = Math.hypot(dx, dz) || 1
      x = other.position[0] + (dx / length) * minimum
      z = other.position[2] + (dz / length) * minimum
      moved = true
    }
    if (!moved) break
  }
  return [Number(x.toFixed(3)), y, Number(z.toFixed(3))]
}

/** Keeps a position inside the room, allowing for the object's own footprint. */
export function clampToRoom(position: Vec3, radius: number, roomWidth: number, roomDepth: number): Vec3 {
  const halfWidth = roomWidth / 2 - radius
  // The room is drawn from -depth*0.75 to +depth*0.75 about the origin.
  const back = -roomDepth * 0.75 + radius
  const front = roomDepth * 0.75 - radius
  return [
    Number(Math.min(halfWidth, Math.max(-halfWidth, position[0])).toFixed(3)),
    position[1],
    Number(Math.min(front, Math.max(back, position[2])).toFixed(3)),
  ]
}

/**
 * Snaps a light to a round position relative to the subject it lights.
 *
 * Photographers work in angles and distances from the subject — "45 degrees
 * round, two metres out" — not in Cartesian coordinates, so that is what gets
 * snapped. Holding the modifier key during a drag skips this entirely.
 */
export function snapAroundSubject(position: Vec3, subject: Vec3, angleStep = 15, distanceStep = 0.25): Vec3 {
  const dx = position[0] - subject[0]
  const dz = position[2] - subject[2]
  const distance = Math.hypot(dx, dz)
  if (distance < 0.2) return position
  const angle = Math.atan2(dx, dz)
  const step = (angleStep * Math.PI) / 180
  const snappedAngle = Math.round(angle / step) * step
  const snappedDistance = Math.max(distanceStep, Math.round(distance / distanceStep) * distanceStep)
  return [
    Number((subject[0] + Math.sin(snappedAngle) * snappedDistance).toFixed(3)),
    position[1],
    Number((subject[2] + Math.cos(snappedAngle) * snappedDistance).toFixed(3)),
  ]
}

/** The azimuth and distance a snapped light actually landed on, for the readout. */
export function polarFromSubject(position: Vec3, subject: Vec3) {
  const dx = position[0] - subject[0]
  const dz = position[2] - subject[2]
  return {
    distance: Math.hypot(dx, dz),
    azimuth: (Math.atan2(dx, dz) * 180) / Math.PI,
  }
}
