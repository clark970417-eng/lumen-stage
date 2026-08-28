import type { StudioLight, StudioModifier } from './store'
import { fittedOptics, getHead, getModifier, headFlux, powerFraction } from './gear'
import {
  apertureForFlash, apparentSourceAngle, emitterSize, falloffExponent, illuminanceAt,
  INCIDENT_CONSTANT_CONTINUOUS, INCIDENT_CONSTANT_FLASH, nearestAperture, penumbraWidth,
  shadowCharacter, stopsBetween, syncTransmission, type ShadowCharacter,
} from './photometry'

type Vec3 = [number, number, number]

export type LightMeterReading = {
  lightId: string
  name: string
  /** lux for continuous heads, lux-seconds for flash. */
  directLux: number
  bouncedLux: number
  totalLux: number
  blocked: boolean
  flash: boolean
  /** Metres from the head to the metered point. */
  distance: number
  /** Degrees off the head's aim axis. */
  offAxisDegrees: number
  /** Angular size of the emitting face seen from the metered point. */
  apparentDegrees: number
  character: ShadowCharacter
  /** Penumbra cast on a surface 1 m behind the subject, in centimetres. */
  penumbraCm: number
  /** Local inverse-square exponent — 2.00 is a point source. */
  falloff: number
  /** Stops below the strongest light in the scene. */
  stopsUnderKey: number
  headLabel: string
  modifierLabel: string
}

export type MeteringResult = {
  readings: LightMeterReading[]
  totalLux: number
  directLux: number
  bouncedLux: number
  ambientLux: number
  /** Flash contribution in lux-seconds, metered separately from continuous. */
  flashLuxSeconds: number
  continuousLux: number
  ev100: number
  exposureDelta: number
  keyFillRatio: number
  /** Aperture an incident meter would call for at the current ISO and shutter. */
  recommendedAperture: number
  recommendedApertureLabel: string
  /** Dominant light, for the ratio and setup-sheet headline. */
  keyLightId: string | null
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const length = (value: Vec3) => Math.max(0.001, Math.hypot(...value))
const normalize = (value: Vec3): Vec3 => { const size = length(value); return [value[0] / size, value[1] / size, value[2] / size] }
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export { powerFraction }

/** Everything the photometry layer needs about one light, resolved from the catalogue. */
export function resolveLight(light: StudioLight) {
  const head = getHead(light.profileId)
  const modifier = getModifier(light.modifierId)
  const optics = fittedOptics(modifier, light.gridDegrees, light.modifierWidth, light.modifierHeight)
  const flash = light.operationMode === 'flash' && head.guideNumber !== undefined
  return {
    head,
    modifier,
    optics,
    flash,
    /** lumens, or lumen-seconds for flash. */
    flux: headFlux(head) * powerFraction(light) * optics.transmission,
    sourceSize: emitterSize(optics),
  }
}

/** Illuminance this light delivers to a point, ignoring occlusion. */
function lightAtPoint(light: StudioLight, point: Vec3, shutter: number, syncSpeed: number) {
  if (!light.enabled) return { lux: 0, distance: 0, offAxis: 0 }
  const resolved = resolveLight(light)
  const ray = sub(point, light.position)
  const distance = length(ray)
  const aim = normalize(sub(light.target, light.position))
  const offAxis = Math.acos(clamp(dot(aim, normalize(ray)), -1, 1))

  let flux = resolved.flux
  if (resolved.flash) flux *= syncTransmission(1 / Math.max(1, shutter), 1 / Math.max(1, syncSpeed), light.hssEnabled)

  return { lux: illuminanceAt(flux, resolved.optics, distance, offAxis), distance, offAxis }
}

function panelNormal(modifier: StudioModifier): Vec3 {
  return [Math.sin(modifier.rotationY), 0, Math.cos(modifier.rotationY)]
}

function blockedByModifier(from: Vec3, to: Vec3, modifier: StudioModifier) {
  if (modifier.surface !== 'black') return false
  const direction = sub(to, from)
  const normal = panelNormal(modifier)
  const denominator = dot(normal, direction)
  if (Math.abs(denominator) < 0.0001) return false
  const t = dot(normal, sub(modifier.position, from)) / denominator
  if (t <= 0.02 || t >= 0.98) return false
  const hit: Vec3 = [from[0] + direction[0] * t, from[1] + direction[1] * t, from[2] + direction[2] * t]
  const local = sub(hit, modifier.position)
  const tangent: Vec3 = [Math.cos(modifier.rotationY), 0, -Math.sin(modifier.rotationY)]
  const halfWidth = modifier.type === 'vflat' ? modifier.width * 0.62 : modifier.width / 2
  return Math.abs(dot(local, tangent)) <= halfWidth && Math.abs(local[1]) <= modifier.height / 2
}

/**
 * Light picked up off a reflector or V-flat. The panel is treated as a
 * secondary Lambertian emitter, so a big white V-flat close in behaves like a
 * big soft source rather than a fill slider.
 */
function reflectedLux(light: StudioLight, point: Vec3, modifier: StudioModifier, shutter: number, syncSpeed: number) {
  if (modifier.surface === 'black' || modifier.type === 'flag') return 0
  const incident = lightAtPoint(light, modifier.position, shutter, syncSpeed).lux
  if (incident <= 0) return 0
  const normal = panelNormal(modifier)
  const toLight = normalize(sub(light.position, modifier.position))
  const toMeter = normalize(sub(point, modifier.position))
  const facingLight = Math.abs(dot(normal, toLight))
  const facingMeter = Math.abs(dot(normal, toMeter))
  const distance = length(sub(point, modifier.position))
  // Measured diffuse reflectance of real grip surfaces.
  const reflectance = modifier.surface === 'silver' ? 0.85 : modifier.surface === 'gold' ? 0.68 : 0.82
  const width = modifier.type === 'vflat' ? modifier.width * 1.24 : modifier.width
  const area = width * modifier.height
  // Lambertian re-emission: L = E·ρ/π, then the panel integral back to the point.
  const luminance = incident * facingLight * reflectance / Math.PI
  const a = width / 2
  const b = modifier.height / 2
  const d = Math.max(0.15, distance)
  const ra = Math.sqrt(a * a + d * d)
  const rb = Math.sqrt(b * b + d * d)
  const configuration = (a / ra) * Math.atan(b / ra) + (b / rb) * Math.atan(a / rb)
  return luminance * configuration * facingMeter * (area > 0 ? 1 : 0)
}

export function calculateMetering(
  lights: StudioLight[],
  modifiers: StudioModifier[],
  point: Vec3,
  aperture: number,
  shutter: number,
  iso: number,
  syncSpeed: number,
  ambientLevel: number,
): MeteringResult {
  const shutterSeconds = 1 / Math.max(1, shutter)

  const raw = lights.map((light) => {
    const resolved = resolveLight(light)
    const blocked = modifiers.some((modifier) => blockedByModifier(light.position, point, modifier))
    const sample = lightAtPoint(light, point, shutter, syncSpeed)
    const directLux = blocked ? 0 : sample.lux
    const bouncedLux = modifiers.reduce((total, modifier) => total + reflectedLux(light, point, modifier, shutter, syncSpeed), 0)
    const distance = sample.distance || length(sub(point, light.position))
    const apparentDegrees = apparentSourceAngle(resolved.sourceSize, distance)
    return {
      lightId: light.id,
      name: light.name,
      directLux,
      bouncedLux,
      totalLux: directLux + bouncedLux,
      blocked,
      flash: resolved.flash,
      distance,
      offAxisDegrees: sample.offAxis * 180 / Math.PI,
      apparentDegrees,
      character: shadowCharacter(apparentDegrees),
      penumbraCm: penumbraWidth(resolved.sourceSize, distance, 1) * 100,
      falloff: resolved.optics.area ? falloffExponent(resolved.optics.width, resolved.optics.height, distance) : 2,
      stopsUnderKey: 0,
      headLabel: `${resolved.head.maker} ${resolved.head.model}`,
      modifierLabel: `${resolved.modifier.maker} ${resolved.modifier.model}`,
    }
  })

  const strongest = raw.reduce<LightMeterReading | null>((best, reading) => !best || reading.totalLux > best.totalLux ? reading : best, null)
  const readings = raw.map((reading) => ({
    ...reading,
    stopsUnderKey: strongest && strongest.totalLux > 0 && reading.totalLux > 0 ? stopsBetween(strongest.totalLux, reading.totalLux) : 0,
  }))

  const continuousLux = readings.filter((reading) => !reading.flash).reduce((total, reading) => total + reading.totalLux, 0)
  const flashLuxSeconds = readings.filter((reading) => reading.flash).reduce((total, reading) => total + reading.totalLux, 0)
  const directLux = readings.reduce((total, reading) => total + reading.directLux, 0)
  const bouncedLux = readings.reduce((total, reading) => total + reading.bouncedLux, 0)
  // Ambient slider is a room-brightness percentage; 100 % is a bright white cyc at ~600 lux.
  const ambientLux = Math.pow(clamp(ambientLevel, 0, 100) / 100, 2) * 600
  const totalLux = continuousLux + ambientLux

  // Continuous and flash sit on different calibration constants, so they cannot
  // be summed as illuminance. They CAN be summed once each is expressed as the
  // N² it demands — that is the only quantity the two share.
  //
  //   continuous:  N² = E·S·t / 250        (shutter matters)
  //   flash:       N² = H·S / 128          (shutter does not)
  //
  // Everything below is derived from that sum, which keeps the recommended
  // aperture and the exposure error from ever disagreeing with each other.
  const continuousExposure = totalLux * shutterSeconds / INCIDENT_CONSTANT_CONTINUOUS
  const flashExposure = flashLuxSeconds / INCIDENT_CONSTANT_FLASH
  const combined = continuousExposure + flashExposure

  const recommendedAperture = Math.sqrt(Math.max(1e-12, combined) * iso)
  // Scene EV referred to ISO 100, i.e. the EV the recommended settings represent.
  const ev100 = Math.log2(recommendedAperture * recommendedAperture / shutterSeconds) - Math.log2(iso / 100)
  // Error in stops. Doubling is because a stop of aperture is √2 of f-number.
  const exposureDelta = 2 * Math.log2(recommendedAperture / Math.max(0.35, aperture))

  const active = readings.filter((reading) => reading.totalLux > 0.001).sort((a, b) => b.totalLux - a.totalLux)
  const keyFillRatio = active.length > 1 ? active[0].totalLux / active[1].totalLux : active.length ? 99 : 0
  const nearest = nearestAperture(Math.max(0.7, recommendedAperture))

  return {
    readings,
    totalLux,
    directLux,
    bouncedLux,
    ambientLux,
    flashLuxSeconds,
    continuousLux,
    ev100,
    exposureDelta,
    keyFillRatio,
    recommendedAperture,
    recommendedApertureLabel: nearest.label,
    keyLightId: active.length ? active[0].lightId : null,
  }
}

/** Exposed for the setup sheet so it reports the same numbers the meter does. */
export { apertureForFlash, nearestAperture }
