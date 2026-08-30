import type { OutfitStyle } from './wardrobe'
import type { Physique } from './physique'

/**
 * Shipped, redistributable people used by the studio.
 *
 * These are MakeHuman / MPFB 2 exports with a 53-bone humanoid rig and baked
 * CC0 textures. Keeping their URLs in one place makes the procedural figure a
 * deliberate failure fallback instead of the product's default appearance.
 */
export const DEFAULT_HUMAN_URL = '/models/lumen-human/human-suited-runtime.glb'
export const SUITED_HUMAN_URL = '/models/lumen-human/human-suited-runtime.glb'
export const FEMALE_CASUAL_URL = '/models/lumen-human/human-female-casual.glb'
export const FEMALE_ACTIVEWEAR_URL = '/models/lumen-human/human-female-activewear.glb'
export const FEMALE_DRESS_URL = '/models/lumen-human/human-female-dress.glb'
export const FEMALE_GOWN_URL = '/models/lumen-human/human-female-gown.glb'

export const DEFAULT_HUMAN_NAME = 'Everyday Adult'

export function shippedHumanFor(physique: Physique, outfit: OutfitStyle) {
  if (physique.sex === 'feminine') {
    if (outfit === 'dress') return FEMALE_DRESS_URL
    if (outfit === 'gown') return FEMALE_GOWN_URL
    if (outfit === 'activewear' || outfit === 'tank') return FEMALE_ACTIVEWEAR_URL
    return FEMALE_CASUAL_URL
  }
  return SUITED_HUMAN_URL
}
