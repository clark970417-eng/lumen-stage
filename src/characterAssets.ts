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

export const DEFAULT_HUMAN_NAME = 'Everyday Adult'

export function shippedHumanFor(physique: Physique, outfit: OutfitStyle) {
  return physique.sex === 'masculine' || outfit === 'suit' || outfit === 'coat'
    ? SUITED_HUMAN_URL
    : DEFAULT_HUMAN_URL
}
