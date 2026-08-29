/**
 * Bridge between the gear catalogue and the render layer.
 *
 * The scene needs one number per light — a three.js spotlight intensity. That
 * number is now derived from real flux instead of a slider, so swapping a
 * 3×3′ softbox for a Para 133 changes the render the way it changes the shot.
 */

import type { LightProfileId, StudioLight } from './store'
import { getGel } from './gels'
import { fittedOptics, getHead, getModifier, headFlux, LIGHT_HEADS, powerFraction } from './gear'
import { coneSolidAngle, syncTransmission } from './photometry'

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
 * Chosen once so the shipped default scene sits at a correct exposure; every
 * other light then scales from it physically rather than by taste.
 */
export const PREVIEW_CANDELA_SCALE = 10
export const PATHTRACE_CANDELA_SCALE = 1.6

export function profileLookup(profileId: LightProfileId): LightProfile {
  return LIGHT_PROFILES[profileId] ?? LIGHT_PROFILES['generic-led']
}

export { powerFraction }

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
 * t0.5 duration, so a strobe and an LED that meter the same look the same.
 */
export function captureLightOutput(light: StudioLight, shutter: number, syncSpeed: number) {
  const head = getHead(light.profileId)
  const modifier = getModifier(light.modifierId)
  const optics = fittedOptics(modifier, light.gridDegrees ?? null, light.modifierWidth, light.modifierHeight)
  let flux = headFlux(head) * powerFraction(light) * optics.transmission * getGel(light.gelId).transmission

  if (light.operationMode === 'flash' && head.guideNumber !== undefined) {
    flux *= flashSyncFactor(light, shutter, syncSpeed)
    // lumen-seconds -> equivalent lumens for a continuous render of the same exposure.
    flux /= Math.max(1e-4, head.flashDurationT05 ?? 1 / 800)
    flux *= 1 / Math.max(1, shutter)
  }

  return flux / Math.max(0.01, coneSolidAngle(optics.beamDegrees))
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
