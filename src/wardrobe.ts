/**
 * Wardrobe and grooming catalogue.
 *
 * A lighting tool needs clothes for one reason: fabric decides how much of the
 * key comes back. Satin returns a specular streak, velvet returns almost
 * nothing, and a white cotton shirt bounces enough to fill the underside of the
 * jaw. So the list below is organised by how each option behaves under light,
 * not by how it looks on a rail.
 */

export type FabricKind = 'cotton' | 'silk' | 'leather' | 'wool' | 'denim' | 'linen' | 'satin' | 'velvet'
export type HairStyle = 'short' | 'buzz' | 'bob' | 'long' | 'ponytail' | 'bun' | 'curly' | 'afro' | 'bald'
export type OutfitStyle = 'tshirt' | 'shirt' | 'suit' | 'dress' | 'gown' | 'tank' | 'activewear' | 'coat'

export const FABRICS: { id: FabricKind; label: string; note: string }[] = [
  { id: 'cotton', label: 'Cotton', note: 'Matte, even. The neutral reference.' },
  { id: 'linen', label: 'Linen', note: 'Matte with slub — texture shows in raking light.' },
  { id: 'wool', label: 'Wool', note: 'Deepest matte. Swallows fill.' },
  { id: 'denim', label: 'Denim', note: 'Twill diagonal catches a hard key.' },
  { id: 'silk', label: 'Silk', note: 'Broad soft specular; blows out under a bare head.' },
  { id: 'satin', label: 'Satin', note: 'Hard specular streak. Needs a big source.' },
  { id: 'leather', label: 'Leather', note: 'Clearcoat highlight; shows every light in the room.' },
  { id: 'velvet', label: 'Velvet', note: 'Retroreflective sheen at the edges, black in the middle.' },
]

export const HAIR_STYLES: { id: HairStyle; label: string; note: string }[] = [
  { id: 'short', label: 'Short', note: 'Reads the hair light as a defined band.' },
  { id: 'buzz', label: 'Buzzed', note: 'Scalp specular — beware a hot top light.' },
  { id: 'bob', label: 'Bob', note: 'Frames the jaw; can shadow the near cheek.' },
  { id: 'long', label: 'Long', note: 'Falls over the shoulders and eats a rim.' },
  { id: 'ponytail', label: 'Ponytail', note: 'Clears the neck for a full rim light.' },
  { id: 'bun', label: 'Bun', note: 'Clean silhouette; nothing catches the kicker.' },
  { id: 'curly', label: 'Curly', note: 'Breaks a backlight into a halo.' },
  { id: 'afro', label: 'Afro', note: 'Large translucent volume — backlight it.' },
  { id: 'bald', label: 'Bald', note: 'One large specular. Kill the top light.' },
]

export const OUTFITS: { id: OutfitStyle; label: string; note: string }[] = [
  { id: 'tshirt', label: 'T-shirt', note: 'Bare forearms; skin below the elbow.' },
  { id: 'tank', label: 'Tank top', note: 'Shoulders and arms bare — deltoid modelling shows.' },
  { id: 'shirt', label: 'Shirt', note: 'Covered arms; a collar shadow under the jaw.' },
  { id: 'suit', label: 'Suit', note: 'Open jacket over a shirt. Lapels catch an edge light.' },
  { id: 'coat', label: 'Long coat', note: 'Bulk at the shoulders widens the silhouette.' },
  { id: 'dress', label: 'Dress', note: 'Knee-length; bare arms and lower legs.' },
  { id: 'gown', label: 'Gown', note: 'Floor length — needs a full-height source.' },
  { id: 'activewear', label: 'Activewear', note: 'Close-fitting; shows the whole figure line.' },
]

export const DEFAULT_HAIR_STYLE: HairStyle = 'long'
export const DEFAULT_OUTFIT: OutfitStyle = 'tshirt'
export const DEFAULT_FABRIC: FabricKind = 'cotton'

const HAIR_IDS = HAIR_STYLES.map((item) => item.id)
const OUTFIT_IDS = OUTFITS.map((item) => item.id)
const FABRIC_IDS = FABRICS.map((item) => item.id)

export const asHairStyle = (value: unknown): HairStyle => HAIR_IDS.includes(value as HairStyle) ? value as HairStyle : DEFAULT_HAIR_STYLE
export const asOutfit = (value: unknown): OutfitStyle => OUTFIT_IDS.includes(value as OutfitStyle) ? value as OutfitStyle : DEFAULT_OUTFIT
export const asFabric = (value: unknown): FabricKind => FABRIC_IDS.includes(value as FabricKind) ? value as FabricKind : DEFAULT_FABRIC
