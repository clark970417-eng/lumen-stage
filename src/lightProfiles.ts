/**
 * Bridge between the gear catalogue and the render layer.
 *
 * The scene needs one number per light — a three.js spotlight intensity. That
 * number is now derived from real flux instead of a slider, so swapping a
 * 3×3′ softbox for a Para 133 changes the render the way it changes the shot.
 */

import { wattsToPercent, minimumWatts } from './lightPower'
import { flashEquivalentOutput } from './exposure'
import type { LightProfileId, StudioLight } from './store'
import { getGel } from './gels'
import { fittedOptics, getHead, getModifier, headFlux, LIGHT_HEADS, powerFraction } from './gear'
import { onAxisIntensity, syncTransmission } from './photometry'

export type LightProfile = {
  id: string
  maker: string
  model: string
  headType: 'cob' | 'strobe' | 'panel'
  maxLumens: number
  ratedPower: string
  nativeCct: string
}

/** Legacy-shaped view of the catalogue, kept for the scene list and inspector. */
export const LIGHT_PROFILES: Record<string, LightProfile> = Object.fromEntries(
  Object.values(LIGHT_HEADS).map((head) => [head.id, {
    id: head.id,
    maker: head.maker,
    model: head.model,
    headType: head.technology === 'strobe' ? 'strobe' as const : head.technology === 'led-panel' ? 'panel' as const : 'cob' as const,
    maxLumens: Math.round(headFlux(head)),
    ratedPower: head.powerLabel,
    nativeCct: head.cct,
  }]),
)

/**
 * Divisors that map physical candela onto three.js intensity.
 * Both renderers receive the same SI intensity; camera exposure is applied
 * separately, rather than compensating with renderer-specific light power.
 */
export const PREVIEW_CANDELA_SCALE = 1
export const PATHTRACE_CANDELA_SCALE = 1

export function profileLookup(profileId: LightProfileId): LightProfile {
  return LIGHT_PROFILES[profileId] ?? LIGHT_PROFILES['generic-led']
}

export { powerFraction }

/** User-facing output control. The catalogue stays internal for photometry. */
export function lightWattage(light: Pick<StudioLight, 'profileId' | 'powerPercent'>) {
  return Math.max(1, Math.round(getHead(light.profileId).power * powerFraction(light)))
}

export function wattageLimit(light: Pick<StudioLight, 'profileId'>) {
  return getHead(light.profileId).power
}

export function percentForWattage(light: Pick<StudioLight, 'profileId'>, watts: number) {
  return wattsToPercent(watts, wattageLimit(light))
}

/** Fraction of light surviving the fitted gel. */
export function gelTransmission(light: Pick<StudioLight, 'gelId'>) {
  return getGel(light.gelId).transmission
}

/** Flux leaving the head before the modifier: lumens, or lumen-seconds for flash. */
export function effectiveLightOutput(light: Pick<StudioLight, 'profileId' | 'powerPercent'>) {
  return headFlux(getHead(light.profileId)) * powerFraction(light)
}

/** Fraction of head flux that survives the fitted modifier and any grid. */
export function opticTransmission(light: Pick<StudioLight, 'modifierId' | 'gridDegrees' | 'optic' | 'grid'>) {
  const modifier = getModifier(light.modifierId)
  return fittedOptics(modifier, light.gridDegrees ?? null).transmission
}

export function flashSyncFactor(light: Pick<StudioLight, 'operationMode' | 'hssEnabled'>, shutter: number, syncSpeed: number) {
  if (light.operationMode === 'continuous') return 1
  return syncTransmission(1 / Math.max(1, shutter), 1 / Math.max(1, syncSpeed), light.hssEnabled)
}

/**
 * On-axis intensity in candela for the render.
 * Flash heads are converted to an equivalent continuous intensity using their
 * exposure duration. Integrating it over that exposure recovers flash energy.
 */
export function captureLightOutput(light: StudioLight, shutter: number, syncSpeed: number) {
  const head = getHead(light.profileId)
  const modifier = getModifier(light.modifierId)
  const optics = fittedOptics(modifier, light.gridDegrees ?? null, light.modifierWidth, light.modifierHeight)
  let flux = headFlux(head) * powerFraction(light) * optics.transmission * getGel(light.gelId).transmission

  if (light.operationMode === 'flash' && head.guideNumber !== undefined) {
    flux = flashEquivalentOutput(flux, shutter, flashSyncFactor(light, shutter, syncSpeed))
  }

  return onAxisIntensity(flux, optics)
}

export function profileLabel(profileId: LightProfileId) {
  const profile = profileLookup(profileId)
  return `${profile.maker} ${profile.model}`
}

/** Human label for the fitted modifier, used in lists and on the setup sheet. */
export function modifierLabel(light: Pick<StudioLight, 'modifierId'>) {
  const modifier = getModifier(light.modifierId)
  return `${modifier.maker} ${modifier.model}`
}

export function wattageMinimum(light: Pick<StudioLight, 'profileId'>) {
  return minimumWatts(wattageLimit(light))
}
