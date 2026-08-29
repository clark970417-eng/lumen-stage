/**
 * Backdrop catalogue.
 *
 * The background is a lighting decision, not decoration: a mid grey sits about
 * two stops under a correctly exposed face, which is exactly what separates the
 * subject from the wall. Every entry below carries the reflectance the surface
 * actually has, so the metering panel can tell you how far under the key it
 * will land.
 *
 * Colours are the real paper-roll references photographers order by name.
 */

export type BackdropFamily = 'paper' | 'canvas' | 'vinyl' | 'wall' | 'none'

export type BackdropProfile = {
  id: string
  family: BackdropFamily
  maker: string
  label: string
  /** Base colour, sRGB. */
  color: string
  /** Diffuse reflectance, 0–1. Used for the background-fall calculation. */
  reflectance: number
  roughness: number
  /** Roll widths, in metres. The first is the default. */
  widths: number[]
  /** Papers sweep onto the floor; a painted wall does not. */
  sweep: boolean
  /** Painted canvas has a dye mottle; plain paper does not. */
  mottled?: boolean
  surface: 'paper' | 'canvas' | 'vinyl' | 'plaster' | 'brick' | 'concrete' | 'wood'
  note: string
}

/**
 * Reflectance figures come from the paper's published L*: an 18 % grey card is
 * L*≈50, a white seamless L*≈95 (about 88 % reflectance), and black seamless
 * is nearer 4 % than the 0 % people assume — which is why it still picks up a
 * spill you did not flag.
 */
export const BACKDROPS: BackdropProfile[] = [
  // --- Seamless paper ------------------------------------------------------
  { id: 'super-white', family: 'paper', maker: 'Savage', label: 'Super White', color: '#f2f1ee', reflectance: 0.88, roughness: 0.92, widths: [2.72, 1.35, 3.55], sweep: true, surface: 'paper', note: 'Blows to pure white about 2⅓ stops over the key.' },
  { id: 'fashion-grey', family: 'paper', maker: 'Savage', label: 'Fashion Grey', color: '#a8a6a1', reflectance: 0.46, roughness: 0.93, widths: [2.72, 1.35], sweep: true, surface: 'paper', note: 'Light neutral. Separates a dark subject without going white.' },
  { id: 'studio-grey', family: 'paper', maker: 'Savage', label: 'Studio Grey', color: '#87857f', reflectance: 0.32, roughness: 0.93, widths: [2.72, 1.35, 3.55], sweep: true, surface: 'paper', note: 'The default. Reads as mid grey at key exposure.' },
  { id: 'thunder-grey', family: 'paper', maker: 'Savage', label: 'Thunder Grey', color: '#5d5c58', reflectance: 0.18, roughness: 0.93, widths: [2.72, 1.35], sweep: true, surface: 'paper', note: 'A true 18 % card. Meter off it and you are calibrated.' },
  { id: 'charcoal', family: 'paper', maker: 'Savage', label: 'Charcoal', color: '#3b3b39', reflectance: 0.09, roughness: 0.92, widths: [2.72, 1.35], sweep: true, surface: 'paper', note: 'Dark but not dead. Holds a gradient from a gridded head.' },
  { id: 'black-paper', family: 'paper', maker: 'Savage', label: 'Black', color: '#1c1c1b', reflectance: 0.04, roughness: 0.90, widths: [2.72, 1.35], sweep: true, surface: 'paper', note: 'Never truly black — flag the key or it greys up.' },
  { id: 'bone', family: 'paper', maker: 'Savage', label: 'Bone', color: '#ded4c2', reflectance: 0.70, roughness: 0.93, widths: [2.72, 1.35], sweep: true, surface: 'paper', note: 'Warm off-white; flatters most skin tones.' },
  { id: 'sand', family: 'paper', maker: 'Savage', label: 'Sand', color: '#c9ad84', reflectance: 0.48, roughness: 0.93, widths: [2.72], sweep: true, surface: 'paper', note: 'Warm mid. Bounces a warm fill onto the near side.' },
  { id: 'blush', family: 'paper', maker: 'Savage', label: 'Coral', color: '#d9998f', reflectance: 0.42, roughness: 0.93, widths: [2.72], sweep: true, surface: 'paper', note: 'Beauty standby. Watch the colour cast on white clothing.' },
  { id: 'crimson', family: 'paper', maker: 'Savage', label: 'Crimson', color: '#8e2230', reflectance: 0.12, roughness: 0.92, widths: [2.72], sweep: true, surface: 'paper', note: 'Saturated. Needs its own light to stay clean.' },
  { id: 'cobalt', family: 'paper', maker: 'Savage', label: 'Cobalt', color: '#26456f', reflectance: 0.10, roughness: 0.92, widths: [2.72], sweep: true, surface: 'paper', note: 'Deep blue; a gelled background light lifts it.' },
  { id: 'forest', family: 'paper', maker: 'Savage', label: 'Tech Green', color: '#2c6236', reflectance: 0.14, roughness: 0.92, widths: [2.72], sweep: true, surface: 'paper', note: 'Muted green. Not a keying green.' },
  { id: 'chroma-green', family: 'paper', maker: 'Savage', label: 'Chroma Green', color: '#3fa93c', reflectance: 0.35, roughness: 0.94, widths: [2.72, 3.55], sweep: true, surface: 'paper', note: 'Keying green. Needs even light and 1.5 m of separation.' },
  { id: 'chroma-blue', family: 'paper', maker: 'Savage', label: 'Chroma Blue', color: '#2f5ba8', reflectance: 0.24, roughness: 0.94, widths: [2.72], sweep: true, surface: 'paper', note: 'Keying blue. Cleaner than green on blonde hair.' },

  // --- Painted canvas ------------------------------------------------------
  { id: 'canvas-grey', family: 'canvas', maker: 'Oliphant', label: 'Mottled Grey', color: '#7c7a74', reflectance: 0.28, roughness: 0.95, widths: [3.0, 4.5], sweep: false, mottled: true, surface: 'canvas', note: 'Hand-painted mottle. Reads as depth even when lit flat.' },
  { id: 'canvas-umber', family: 'canvas', maker: 'Oliphant', label: 'Mottled Umber', color: '#6b5645', reflectance: 0.20, roughness: 0.95, widths: [3.0, 4.5], sweep: false, mottled: true, surface: 'canvas', note: 'Old-master warm. Pairs with a single hard key.' },
  { id: 'canvas-slate', family: 'canvas', maker: 'Oliphant', label: 'Mottled Slate', color: '#4c545c', reflectance: 0.14, roughness: 0.95, widths: [3.0], sweep: false, mottled: true, surface: 'canvas', note: 'Cool and moody. Almost black at two stops down.' },

  // --- Vinyl ---------------------------------------------------------------
  { id: 'vinyl-white', family: 'vinyl', maker: 'Superior', label: 'White Vinyl', color: '#eeeeec', reflectance: 0.85, roughness: 0.42, widths: [2.4], sweep: true, surface: 'vinyl', note: 'Semi-gloss: gives a reflection under the feet.' },
  { id: 'vinyl-black', family: 'vinyl', maker: 'Superior', label: 'Black Vinyl', color: '#171718', reflectance: 0.05, roughness: 0.30, widths: [2.4], sweep: true, surface: 'vinyl', note: 'Mirror-black floor. The classic product reflection.' },

  // --- Built walls ---------------------------------------------------------
  { id: 'cyc-white', family: 'wall', maker: 'Stage', label: 'White cyclorama', color: '#e8e7e3', reflectance: 0.82, roughness: 0.96, widths: [6.0], sweep: true, surface: 'plaster', note: 'Coved wall-to-floor. No corner shadow anywhere.' },
  { id: 'plaster-grey', family: 'wall', maker: 'Stage', label: 'Grey plaster', color: '#8d8b85', reflectance: 0.34, roughness: 0.97, widths: [6.0], sweep: false, surface: 'plaster', note: 'Painted studio wall. Texture shows in raking light.' },
  { id: 'concrete', family: 'wall', maker: 'Location', label: 'Concrete', color: '#77756f', reflectance: 0.26, roughness: 0.97, widths: [6.0], sweep: false, surface: 'concrete', note: 'Coarse. A hard light carves it; a soft one flattens it.' },
  { id: 'brick', family: 'wall', maker: 'Location', label: 'Brick', color: '#8a5541', reflectance: 0.18, roughness: 0.96, widths: [6.0], sweep: false, surface: 'brick', note: 'Needs a raking light or it reads as flat orange.' },
  { id: 'wood-panel', family: 'wall', maker: 'Location', label: 'Wood panel', color: '#7c5b3c', reflectance: 0.22, roughness: 0.70, widths: [6.0], sweep: false, surface: 'wood', note: 'Semi-gloss grain; picks up a specular sheen.' },

  { id: 'none', family: 'none', maker: '—', label: 'No backdrop', color: '#000000', reflectance: 0, roughness: 1, widths: [0], sweep: false, surface: 'paper', note: 'Room walls only. Use for a full-set build.' },
]

export const DEFAULT_BACKDROP_ID = 'studio-grey'

export function getBackdrop(id: string): BackdropProfile {
  return BACKDROPS.find((item) => item.id === id) ?? BACKDROPS.find((item) => item.id === DEFAULT_BACKDROP_ID)!
}

export const BACKDROP_FAMILIES: BackdropFamily[] = ['paper', 'canvas', 'vinyl', 'wall', 'none']

/**
 * How far the background falls below the subject, in stops.
 *
 * Two things drive it: how much less light reaches the paper (inverse square
 * over the extra distance) and how much of it comes back (reflectance against
 * a Caucasian mid-tone reference of 0.36). This is the number people guess at
 * on set and get wrong.
 */
export function backgroundFallStops(profile: BackdropProfile, subjectToLight: number, backdropToLight: number) {
  const distanceStops = Math.log2(Math.max(0.05, backdropToLight) ** 2 / Math.max(0.05, subjectToLight) ** 2)
  const reflectanceStops = Math.log2(0.36 / Math.max(0.01, profile.reflectance))
  return distanceStops + reflectanceStops
}
