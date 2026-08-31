import type { OutfitStyle } from './wardrobe'
import type { Physique } from './physique'

const assetBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
const assetHref = (path: string) => `${assetBase}${path.replace(/^\/+/, '')}`

/**
 * Shipped, redistributable people used by the studio.
 *
 * These are MakeHuman / MPFB 2 exports with a 53-bone humanoid rig and baked
 * CC0 textures. Keeping their URLs in one place makes the selected GLB the
 * only product appearance and keeps loading transitions deterministic.
 */
/**
 * The Rocketbox pair, which carry their own eyes.
 *
 * The MakeHuman exports have no eye geometry at all — no eyeballs, no lids, no
 * brows — so the studio had to cut a hole in each face and park a sphere
 * behind it, and that prosthetic never seated the same way on two different
 * face profiles. These ship real eyeballs on their own bones, real lids that
 * blink, and real brows. MIT licensed.
 */
export const ROCKETBOX_MALE_URL = assetHref('models/lumen-human/rocketbox-male.glb')
export const ROCKETBOX_FEMALE_URL = assetHref('models/lumen-human/rocketbox-female.glb')

export const DEFAULT_HUMAN_URL = assetHref('models/lumen-human/rocketbox-male.glb')
export const SUITED_HUMAN_URL = assetHref('models/lumen-human/human-suited-runtime.glb')
export const FEMALE_CASUAL_URL = assetHref('models/lumen-human/human-female-casual.glb')
export const FEMALE_ACTIVEWEAR_URL = assetHref('models/lumen-human/human-female-activewear.glb')
export const FEMALE_DRESS_URL = assetHref('models/lumen-human/human-female-dress.glb')
export const FEMALE_GOWN_URL = assetHref('models/lumen-human/human-female-gown.glb')

export const DEFAULT_HUMAN_NAME = 'Everyday Adult'

/**
 * Whether this actor wears its look rather than being given one.
 *
 * The Rocketbox pair are photographed: skin, clothing and hair arrive in one
 * baked map with no seam a control could act on. Tinting the body material
 * takes the shirt with it, there is no hair mesh to restyle, and the wardrobe
 * has no second file to switch to. The controls that need one of those are
 * shown as unavailable rather than left to do nothing — how the surface
 * answers the light is still ours to set, and those controls stay live.
 */
export function appearanceIsBaked(url: string | null) {
  return url === ROCKETBOX_MALE_URL || url === ROCKETBOX_FEMALE_URL
}

export function shippedHumanFor(physique: Physique, _outfit: OutfitStyle) {
  // The Rocketbox pair dress themselves — their clothing is baked into the
  // body texture — so the outfit control has nothing to switch between yet.
  // Kept in the signature because the wardrobe still drives fabric response.
  return physique.sex === 'feminine' ? ROCKETBOX_FEMALE_URL : ROCKETBOX_MALE_URL
}
