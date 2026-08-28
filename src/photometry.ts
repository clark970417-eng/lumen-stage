/**
 * Physically-grounded photometry.
 *
 * Everything here works in real SI units and real photographic constants, so a
 * reading in LUMEN STAGE is meant to agree with a Sekonic standing in the same
 * place in a real studio.
 *
 * The chain is always the same:
 *   published head spec  ->  on-axis intensity with a reference reflector
 *                        ->  total luminous flux (conserved)
 *                        ->  redistributed through whatever modifier is fitted
 *                        ->  illuminance at a point (near-field exact)
 *                        ->  ISO 2720 exposure equation  ->  f-stop / EV
 */

/** ISO 2720 incident-meter calibration constant for a dome, continuous light (lux). */
export const INCIDENT_CONSTANT_CONTINUOUS = 250
/** Incident calibration constant for flash, working in lux-seconds. */
export const INCIDENT_CONSTANT_FLASH = 128
/** Reflected-light (spot/matrix) calibration constant. */
export const REFLECTED_CONSTANT = 12.5
/** Beam angle of the bare "standard reflector" every head is published against. */
export const REFERENCE_REFLECTOR_DEGREES = 50

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Solid angle (sr) of a right cone of the given full beam angle. */
export function coneSolidAngle(beamDegrees: number) {
  const half = clamp(beamDegrees, 1, 179) * Math.PI / 360
  return 2 * Math.PI * (1 - Math.cos(half))
}

/** Solid angle of the reference reflector every published spec assumes. */
export const REFERENCE_SOLID_ANGLE = coneSolidAngle(REFERENCE_REFLECTOR_DEGREES)

/**
 * Cosine-power exponent that puts the half-power point exactly at the edge of
 * the quoted beam angle — the same convention lighting manufacturers publish.
 */
export function lobeExponent(beamDegrees: number) {
  const half = clamp(beamDegrees, 2, 178) * Math.PI / 360
  const cosine = Math.max(1e-4, Math.cos(half))
  return clamp(Math.log(0.5) / Math.log(cosine), 0.05, 400)
}

/**
 * Exact on-axis illuminance from a uniform rectangular Lambertian emitter.
 *
 * This is the part that separates a real soft-source model from a point light:
 * a 120 cm octa one metre from a face does NOT fall off as 1/d². The closed
 * form below is the standard configuration-factor result, and it degenerates
 * to inverse square automatically once the distance is large next to the box.
 *
 * @param luminance cd/m² of the diffusion panel
 * @param width     panel width in metres
 * @param height    panel height in metres
 * @param distance  on-axis distance in metres
 */
export function rectangularPanelIlluminance(luminance: number, width: number, height: number, distance: number) {
  const a = Math.max(0.01, width) / 2
  const b = Math.max(0.01, height) / 2
  const d = Math.max(0.02, distance)
  const ra = Math.sqrt(a * a + d * d)
  const rb = Math.sqrt(b * b + d * d)
  // E = π·L·F, where F is the configuration factor to the centred rectangle
  // (four times the standard corner factor). The leading 2 is what makes this
  // collapse to the textbook L·A/d² once d is large next to the panel — worth
  // checking against, because a wrong constant here hides as a plausible f-stop.
  return 2 * luminance * ((a / ra) * Math.atan(b / ra) + (b / rb) * Math.atan(a / rb))
}

/** Luminance (cd/m²) of a Lambertian panel emitting `flux` lumens from `area` m². */
export function panelLuminance(flux: number, area: number) {
  return flux / (Math.PI * Math.max(1e-4, area))
}

/**
 * How far a source departs from the inverse-square law at this distance.
 * 1.0 = behaves as a point source; 2.0 = falls off half as fast as 1/d².
 * Real, computed, and something no other studio simulator puts on screen.
 */
export function nearFieldFactor(width: number, height: number, distance: number) {
  const luminance = panelLuminance(1, Math.max(0.01, width) * Math.max(0.01, height))
  const exact = rectangularPanelIlluminance(luminance, width, height, distance)
  const point = 1 / (Math.PI * Math.max(0.02, distance) * Math.max(0.02, distance))
  return point <= 0 ? 1 : exact / point
}

/**
 * Local inverse-square exponent of a finite panel at this distance.
 * A point source returns 2.00; a big box close in drops toward 1.
 */
export function falloffExponent(width: number, height: number, distance: number) {
  const d = Math.max(0.05, distance)
  const step = d * 0.05
  const luminance = panelLuminance(1, Math.max(0.01, width) * Math.max(0.01, height))
  const near = rectangularPanelIlluminance(luminance, width, height, d - step)
  const far = rectangularPanelIlluminance(luminance, width, height, d + step)
  if (near <= 0 || far <= 0) return 2
  return clamp(-(Math.log(far) - Math.log(near)) / (Math.log(d + step) - Math.log(d - step)), 0.2, 2.05)
}

/**
 * Penumbra width in metres cast on a surface behind the subject.
 * This is the number people actually mean by "how hard is this light".
 */
export function penumbraWidth(sourceSize: number, lightToSubject: number, subjectToSurface: number) {
  if (lightToSubject <= 0.01) return sourceSize
  return sourceSize * (subjectToSurface / lightToSubject)
}

/** Angular diameter of the source as seen from the subject, in degrees. */
export function apparentSourceAngle(sourceSize: number, distance: number) {
  return 2 * Math.atan(Math.max(0.001, sourceSize) / 2 / Math.max(0.02, distance)) * 180 / Math.PI
}

export type ShadowCharacter = 'specular' | 'hard' | 'crisp' | 'soft' | 'very-soft' | 'wrapping'

/** Maps apparent source angle onto the vocabulary photographers actually use. */
export function shadowCharacter(apparentDegrees: number): ShadowCharacter {
  if (apparentDegrees < 2) return 'specular'
  if (apparentDegrees < 8) return 'hard'
  if (apparentDegrees < 18) return 'crisp'
  if (apparentDegrees < 34) return 'soft'
  if (apparentDegrees < 58) return 'very-soft'
  return 'wrapping'
}

// ---------------------------------------------------------------------------
// Exposure equations (ISO 2720)
// ---------------------------------------------------------------------------

/** EV at ISO 100 for a continuous incident reading in lux. */
export function ev100FromLux(lux: number) {
  return Math.log2(Math.max(1e-4, lux) * 100 / INCIDENT_CONSTANT_CONTINUOUS)
}

/** Inverse of {@link ev100FromLux}. */
export function luxFromEv100(ev100: number) {
  return Math.pow(2, ev100) * INCIDENT_CONSTANT_CONTINUOUS / 100
}

/** EV at ISO 100 for a flash incident reading in lux-seconds. */
export function ev100FromLuxSeconds(luxSeconds: number) {
  return Math.log2(Math.max(1e-6, luxSeconds) * 100 / INCIDENT_CONSTANT_FLASH)
}

/** The aperture an incident meter would call for. Continuous light. */
export function apertureForContinuous(lux: number, iso: number, shutterSeconds: number) {
  return Math.sqrt(Math.max(1e-6, lux) * iso * shutterSeconds / INCIDENT_CONSTANT_CONTINUOUS)
}

/** The aperture an incident meter would call for. Flash — shutter is irrelevant. */
export function apertureForFlash(luxSeconds: number, iso: number) {
  return Math.sqrt(Math.max(1e-9, luxSeconds) * iso / INCIDENT_CONSTANT_FLASH)
}

/** Camera-side EV at ISO 100, for comparing against the metered scene EV. */
export function cameraEv100(aperture: number, shutterSeconds: number, iso: number) {
  return Math.log2(aperture * aperture / Math.max(1e-6, shutterSeconds)) - Math.log2(iso / 100)
}

const FULL_STOPS = [1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32, 45, 64]
const THIRD_STOPS = [
  1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11,
  13, 14, 16, 18, 20, 22, 25, 29, 32, 36, 40, 45, 51, 57, 64,
]

/** Nearest marked aperture, plus the residual in tenths of a stop — what a meter shows. */
export function nearestAperture(aperture: number, scale: 'full' | 'third' = 'third') {
  const marks = scale === 'full' ? FULL_STOPS : THIRD_STOPS
  let best = marks[0]
  for (const mark of marks) if (Math.abs(Math.log2(mark) - Math.log2(aperture)) < Math.abs(Math.log2(best) - Math.log2(aperture))) best = mark
  const tenths = Math.round(Math.log2(aperture / best) * 10)
  const mark = best < 10 ? best.toFixed(1).replace(/\.0$/, '') : String(Math.round(best))
  const residual = tenths === 0 ? '' : ` ${tenths > 0 ? '+' : '−'}${Math.abs(tenths) / 10}`
  return { aperture: best, tenths, mark, residual, label: `f/${mark}${residual}` }
}

/** Difference between two illuminances expressed in stops. */
export function stopsBetween(a: number, b: number) {
  if (a <= 0 || b <= 0) return 0
  return Math.log2(a / b)
}

/** Lighting ratio (key:fill) rendered the way photographers quote it. */
export function ratioLabel(key: number, fill: number) {
  if (fill <= 0.0001) return '∞:1'
  const ratio = key / fill
  return `${ratio.toFixed(ratio < 10 ? 1 : 0)}:1`
}

// ---------------------------------------------------------------------------
// Head output -> conserved flux
// ---------------------------------------------------------------------------

export type HeadOutputSpec =
  /** Strobe published as a guide number (metres, ISO 100, standard reflector). */
  | { kind: 'flash'; guideNumber: number; flashDurationT05: number }
  /** Continuous head published as total luminous flux. */
  | { kind: 'continuous'; lumens: number }
  /** Continuous head published as illuminance at a distance with the standard reflector. */
  | { kind: 'continuous-lux'; luxAtDistance: number; distance: number }

/**
 * Total luminous flux (lm) leaving the bare head, derived from its published
 * figure. Flux is conserved when you change modifiers — only the distribution
 * and the transmission loss change — which is what makes swapping a standard
 * reflector for a 120 cm octa behave correctly instead of by a fudge factor.
 */
export function bareHeadFlux(spec: HeadOutputSpec) {
  if (spec.kind === 'continuous') return spec.lumens
  if (spec.kind === 'continuous-lux') {
    const intensity = spec.luxAtDistance * spec.distance * spec.distance // cd
    return intensity * REFERENCE_SOLID_ANGLE
  }
  // N = GN/d and N² = H·S/C  =>  H·d² = C·GN²/S  =>  I·t = 1.28·GN² (cd·s at ISO 100)
  const intensitySeconds = INCIDENT_CONSTANT_FLASH / 100 * spec.guideNumber * spec.guideNumber
  const intensity = intensitySeconds / Math.max(1e-4, spec.flashDurationT05)
  return intensity * REFERENCE_SOLID_ANGLE
}

/** Peak flux of a strobe, in lumen-seconds — the quantity that sets flash exposure. */
export function flashFluxSeconds(guideNumber: number) {
  return (INCIDENT_CONSTANT_FLASH / 100) * guideNumber * guideNumber * REFERENCE_SOLID_ANGLE
}

export type EmitterGeometry = {
  /** true for softboxes, octas, umbrellas, dishes — anything with a real emitting face. */
  area: boolean
  width: number
  height: number
  /** Full beam angle in degrees after the modifier and any grid. Drives off-axis falloff. */
  beamDegrees: number
  /**
   * On-axis intensity gain against the reference reflector at equal flux.
   *
   * This is the difference between an optic that REDIRECTS light (a Magnum, a
   * Fresnel, an optical spot — genuinely more candela on axis) and one that
   * merely CLIPS it (a snoot, barn doors, an egg-crate grid — same on-axis
   * intensity, less spill, less total flux). Getting these mixed up is why a
   * naive model reports a snoot as brighter than a bare head.
   */
  concentration: number
}

/**
 * Illuminance at a point, given conserved flux and the fitted modifier.
 * Area modifiers use the exact panel integral; hard optics use the cone model.
 *
 * @param flux      lumens (continuous) or lumen-seconds (flash) reaching the modifier face
 * @param distance  metres from source to the metered point
 * @param offAxis   angle in radians between the source's aim and the metered point
 */
export function illuminanceAt(flux: number, geometry: EmitterGeometry, distance: number, offAxis: number) {
  const beam = clamp(geometry.beamDegrees, 2, 178)
  const halfBeam = beam * Math.PI / 360
  if (offAxis >= halfBeam * 1.35) return 0

  const lobe = Math.pow(Math.max(0, Math.cos(Math.min(offAxis, Math.PI / 2))), lobeExponent(beam))

  if (geometry.area) {
    // A diffusion face is a Lambertian panel: flux and area alone fix its
    // luminance. Narrowing the lobe with a grid costs transmission and cuts
    // spill — it does not make the face brighter.
    const area = Math.max(0.01, geometry.width) * Math.max(0.01, geometry.height)
    const luminance = panelLuminance(flux * geometry.concentration, area)
    return rectangularPanelIlluminance(luminance, geometry.width, geometry.height, distance) * lobe
  }

  // Hard optics are referenced to the standard reflector, then scaled by how
  // much they genuinely redirect rather than by how tight their beam looks.
  const intensity = flux / REFERENCE_SOLID_ANGLE * geometry.concentration
  return intensity / Math.max(0.0025, distance * distance) * lobe
}

/**
 * Effective emitting size of a fitted modifier, used for penumbra and for the
 * apparent-angle readout. Round faces are treated by their diameter.
 */
export function emitterSize(geometry: EmitterGeometry) {
  return geometry.area ? Math.sqrt(geometry.width * geometry.height) : Math.min(geometry.width, geometry.height, 0.2)
}

// ---------------------------------------------------------------------------
// Flash / shutter interaction
// ---------------------------------------------------------------------------

/**
 * Fraction of a flash pulse the shutter actually records.
 * Below sync everything lands; above sync a focal-plane slit clips it, and HSS
 * trades the pulse for a long low burn that costs roughly 1.5-2 stops.
 */
export function syncTransmission(shutterSeconds: number, syncSeconds: number, hss: boolean) {
  if (shutterSeconds >= syncSeconds) return 1
  if (!hss) return clamp(shutterSeconds / syncSeconds, 0, 1)
  return clamp(shutterSeconds / syncSeconds, 0, 1) * 0.34 + 0.3
}

/** Portion of the frame left dark by the second curtain when you outrun sync. */
export function syncCurtainCoverage(shutterSeconds: number, syncSeconds: number) {
  if (shutterSeconds >= syncSeconds) return 0
  return clamp(1 - shutterSeconds / syncSeconds, 0, 1)
}

/** Motion-freezing power of a flash pulse, expressed as an equivalent shutter speed. */
export function effectiveFreezeSpeed(flashDurationT05: number) {
  return 1 / Math.max(1e-5, flashDurationT05)
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/** Mired shift between two colour temperatures — how gel correction is actually counted. */
export function miredShift(fromKelvin: number, toKelvin: number) {
  return 1e6 / Math.max(1000, toKelvin) - 1e6 / Math.max(1000, fromKelvin)
}

/** Approximate CTO/CTB gel strength needed to take `fromKelvin` to `toKelvin`. */
export function gelForShift(fromKelvin: number, toKelvin: number) {
  const shift = miredShift(fromKelvin, toKelvin)
  const magnitude = Math.abs(shift)
  const strength = magnitude < 20 ? '1/8' : magnitude < 45 ? '1/4' : magnitude < 90 ? '1/2' : 'full'
  if (magnitude < 6) return { gel: 'none', strength: '', mired: shift }
  return { gel: shift > 0 ? 'CTO' : 'CTB', strength, mired: shift }
}
