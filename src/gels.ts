/**
 * Gel catalogue.
 *
 * A gel is not a colour picker. It is a filter with a published transmission
 * and, for correction gels, a published mired shift — and the transmission is
 * the part people forget: full CTB costs about 1⅔ stops, which is the
 * difference between a working exposure and an underexposed frame.
 *
 * Figures follow the Rosco and Lee published data. Transmission is the fraction
 * of light that gets through; the stop loss printed in the UI is derived from
 * it, so the two can never disagree.
 */

export type GelCategory = 'correction' | 'minus-green' | 'diffusion' | 'nd' | 'effect'

export type GelProfile = {
  id: string
  maker: 'Rosco' | 'Lee' | '—'
  code: string
  name: string
  category: GelCategory
  /** Fraction of incident light transmitted, 0–1. */
  transmission: number
  /**
   * Mired shift. Negative cools the source (CTB), positive warms it (CTO).
   * Zero for gels that only change tint or level.
   */
  miredShift: number
  /** Residual tint applied on top of the temperature shift, as a hex colour. */
  tint: string
  note: string
}

export const NO_GEL: GelProfile = {
  id: 'none', maker: '—', code: '—', name: 'No gel', category: 'correction',
  transmission: 1, miredShift: 0, tint: '#ffffff', note: 'Bare head.',
}

export const GELS: GelProfile[] = [
  NO_GEL,

  // --- Colour temperature correction --------------------------------------
  { id: 'cto-full', maker: 'Rosco', code: 'R3407', name: 'Full CTO', category: 'correction', transmission: 0.52, miredShift: 167, tint: '#ffffff', note: '5500 K → 3200 K. Costs about one stop.' },
  { id: 'cto-half', maker: 'Rosco', code: 'R3408', name: '½ CTO', category: 'correction', transmission: 0.66, miredShift: 81, tint: '#ffffff', note: 'The everyday warm-up for mixing with tungsten.' },
  { id: 'cto-quarter', maker: 'Rosco', code: 'R3409', name: '¼ CTO', category: 'correction', transmission: 0.81, miredShift: 42, tint: '#ffffff', note: 'A hint of warmth on skin. Almost free.' },
  { id: 'cto-eighth', maker: 'Rosco', code: 'R3410', name: '⅛ CTO', category: 'correction', transmission: 0.92, miredShift: 20, tint: '#ffffff', note: 'The smallest shift the eye reads as warmer.' },
  { id: 'ctb-full', maker: 'Rosco', code: 'R3202', name: 'Full CTB', category: 'correction', transmission: 0.36, miredShift: -131, tint: '#ffffff', note: '3200 K → 5500 K. The expensive one: 1½ stops.' },
  { id: 'ctb-half', maker: 'Rosco', code: 'R3204', name: '½ CTB', category: 'correction', transmission: 0.52, miredShift: -68, tint: '#ffffff', note: 'Cools a tungsten head toward daylight.' },
  { id: 'ctb-quarter', maker: 'Rosco', code: 'R3208', name: '¼ CTB', category: 'correction', transmission: 0.74, miredShift: -30, tint: '#ffffff', note: 'A cool bias without going blue.' },
  { id: 'ctb-eighth', maker: 'Rosco', code: 'R3216', name: '⅛ CTB', category: 'correction', transmission: 0.86, miredShift: -12, tint: '#ffffff', note: 'Barely there. Use to match two heads.' },

  // --- Green / magenta correction -----------------------------------------
  { id: 'plusgreen-full', maker: 'Rosco', code: 'R3304', name: 'Full Plusgreen', category: 'minus-green', transmission: 0.70, miredShift: 0, tint: '#c9f0a8', note: 'Matches a head to fluorescent practicals.' },
  { id: 'minusgreen-full', maker: 'Rosco', code: 'R3308', name: 'Full Minusgreen', category: 'minus-green', transmission: 0.61, miredShift: 0, tint: '#f2c8ef', note: 'Pulls the green out of a fluorescent source.' },
  { id: 'minusgreen-half', maker: 'Rosco', code: 'R3313', name: '½ Minusgreen', category: 'minus-green', transmission: 0.77, miredShift: 0, tint: '#f6dcf4', note: 'Half correction, half the loss.' },

  // --- Diffusion -----------------------------------------------------------
  { id: 'opal', maker: 'Lee', code: '410', name: 'Opal Frost', category: 'diffusion', transmission: 0.79, miredShift: 0, tint: '#ffffff', note: 'Light frost. Softens the edge without killing the shape.' },
  { id: 'hampshire', maker: 'Lee', code: '216', name: 'White Diffusion', category: 'diffusion', transmission: 0.36, miredShift: 0, tint: '#ffffff', note: 'Full tough spun. Turns a hard head into a source.' },
  { id: 'grid-cloth', maker: 'Rosco', code: '3030', name: 'Light Grid Cloth', category: 'diffusion', transmission: 0.52, miredShift: 0, tint: '#ffffff', note: 'The standard cine diffusion on a frame.' },
  { id: 'hilite', maker: 'Rosco', code: '3026', name: 'Hilite', category: 'diffusion', transmission: 0.20, miredShift: 0, tint: '#ffffff', note: 'Very heavy. Used to build a white-void background.' },

  // --- Neutral density -----------------------------------------------------
  { id: 'nd3', maker: 'Lee', code: '298', name: 'ND 0.3', category: 'nd', transmission: 0.50, miredShift: 0, tint: '#ffffff', note: 'One stop down without touching the colour.' },
  { id: 'nd6', maker: 'Lee', code: '209', name: 'ND 0.6', category: 'nd', transmission: 0.25, miredShift: 0, tint: '#ffffff', note: 'Two stops. Use when the head is already at minimum.' },
  { id: 'nd9', maker: 'Lee', code: '210', name: 'ND 0.9', category: 'nd', transmission: 0.125, miredShift: 0, tint: '#ffffff', note: 'Three stops. Lets you shoot wide open under a strobe.' },

  // --- Colour effect -------------------------------------------------------
  { id: 'bastard-amber', maker: 'Rosco', code: 'R02', name: 'Bastard Amber', category: 'effect', transmission: 0.82, miredShift: 30, tint: '#ffe0c2', note: 'The kindest gel on skin. Warmth without colour.' },
  { id: 'flame', maker: 'Rosco', code: 'R21', name: 'Golden Amber', category: 'effect', transmission: 0.42, miredShift: 0, tint: '#ffa63c', note: 'Firelight. Put it on the fill, not the key.' },
  { id: 'surprise-pink', maker: 'Rosco', code: 'R337', name: 'True Pink', category: 'effect', transmission: 0.34, miredShift: 0, tint: '#ff6fa8', note: 'Background staple. Saturates fast on white paper.' },
  { id: 'magenta', maker: 'Rosco', code: 'R46', name: 'Magenta', category: 'effect', transmission: 0.16, miredShift: 0, tint: '#e0359a', note: 'Deep. Needs most of a head to itself.' },
  { id: 'primary-red', maker: 'Rosco', code: 'R27', name: 'Medium Red', category: 'effect', transmission: 0.08, miredShift: 0, tint: '#e02222', note: 'Costs 3½ stops. Budget for it.' },
  { id: 'congo-blue', maker: 'Rosco', code: 'R382', name: 'Congo Blue', category: 'effect', transmission: 0.03, miredShift: 0, tint: '#2a1fd8', note: 'The darkest gel in common use. Nearly 5 stops.' },
  { id: 'steel-blue', maker: 'Rosco', code: 'R68', name: 'Sky Blue', category: 'effect', transmission: 0.22, miredShift: 0, tint: '#3d8ce0', note: 'Moonlight convention. Pairs with a warm key.' },
  { id: 'teal', maker: 'Lee', code: '116', name: 'Medium Blue-Green', category: 'effect', transmission: 0.26, miredShift: 0, tint: '#2fb8ac', note: 'The cool half of a teal-and-orange scheme.' },
  { id: 'moss-green', maker: 'Rosco', code: 'R89', name: 'Moss Green', category: 'effect', transmission: 0.18, miredShift: 0, tint: '#4fae4a', note: 'Reads as sickly on skin — keep it behind the subject.' },
  { id: 'lavender', maker: 'Rosco', code: 'R52', name: 'Light Lavender', category: 'effect', transmission: 0.56, miredShift: 0, tint: '#c9b6e8', note: 'A cool wash that still flatters skin.' },
  { id: 'straw', maker: 'Rosco', code: 'R09', name: 'Pale Amber Gold', category: 'effect', transmission: 0.72, miredShift: 48, tint: '#ffd79a', note: 'Sunlight warmth on a hair light.' },
]

export const GEL_CATEGORIES: GelCategory[] = ['correction', 'minus-green', 'diffusion', 'nd', 'effect']

export function getGel(id: string | undefined): GelProfile {
  if (!id || id === 'none') return NO_GEL
  return GELS.find((gel) => gel.id === id) ?? NO_GEL
}

/** Stops of light the gel costs. This is the number that surprises people. */
export function gelStopLoss(gel: GelProfile) {
  return -Math.log2(Math.max(0.001, gel.transmission))
}

/**
 * The source temperature after the gel.
 *
 * Correction gels are specified in mireds precisely because the shift is
 * constant there and not in kelvin: the same gel that takes 3200 K to 3450 K
 * takes 5500 K all the way to 8000 K.
 */
export function geledTemperature(kelvin: number, gel: GelProfile) {
  if (!gel.miredShift) return kelvin
  const mired = 1e6 / Math.max(1000, kelvin) + gel.miredShift
  return Math.round(Math.min(20000, Math.max(1500, 1e6 / Math.max(20, mired))))
}

/** Multiplies a light's colour by the gel's residual tint. */
export function applyGelTint(rgb: [number, number, number], gel: GelProfile): [number, number, number] {
  if (gel.tint === '#ffffff') return rgb
  const hex = gel.tint.replace('#', '')
  const tint: [number, number, number] = [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ]
  // Normalized so the tint changes hue without double-counting the loss the
  // transmission figure already accounts for.
  const peak = Math.max(tint[0], tint[1], tint[2], 0.001)
  return [rgb[0] * tint[0] / peak, rgb[1] * tint[1] / peak, rgb[2] * tint[2] / peak]
}
