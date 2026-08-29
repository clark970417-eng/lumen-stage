export type Point3 = [number, number, number]

const toDegrees = (radians: number) => radians * 180 / Math.PI
const toRadians = (degrees: number) => degrees * Math.PI / 180

/**
 * Human-readable lamp-head angles. Pan is measured around world Y with 0°
 * toward +Z. Tilt is positive when the head points down and negative upward.
 */
export function lightAimAngles(position: Point3, target: Point3) {
  const dx = target[0] - position[0]
  const dy = target[1] - position[1]
  const dz = target[2] - position[2]
  const horizontal = Math.hypot(dx, dz)
  return {
    pan: toDegrees(Math.atan2(dx, dz)),
    tilt: toDegrees(Math.atan2(-dy, horizontal)),
    distance: Math.max(0.1, Math.hypot(dx, dy, dz)),
  }
}

/** Rebuilds the aim point from lamp-head angles while preserving throw length. */
export function targetFromLightAim(position: Point3, distance: number, pan: number, tilt: number): Point3 {
  const panRadians = toRadians(pan)
  const tiltRadians = toRadians(tilt)
  const horizontal = Math.cos(tiltRadians) * distance
  return [
    Number((position[0] + Math.sin(panRadians) * horizontal).toFixed(3)),
    Number(Math.max(0.1, position[1] - Math.sin(tiltRadians) * distance).toFixed(3)),
    Number((position[2] + Math.cos(panRadians) * horizontal).toFixed(3)),
  ]
}
