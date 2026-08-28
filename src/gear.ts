/**
 * Gear catalogue.
 *
 * Heads are specced the way their makers publish them — guide number in metres
 * at ISO 100 for strobes, total luminous flux for continuous heads — so the
 * photometry module can conserve flux across modifier changes instead of
 * applying a fudge factor.
 *
 * Figures are nominal manufacturer-class values for simulation. They put you in
 * the right place on the dial; they are not a substitute for metering the real
 * head on the day.
 */

import { bareHeadFlux, coneSolidAngle, flashFluxSeconds, lobeExponent, type HeadOutputSpec } from './photometry'

export type HeadTechnology = 'strobe' | 'led-cob' | 'led-panel' | 'hmi' | 'tungsten'

export type LightHead = {
  id: string
  maker: string
  model: string
  technology: HeadTechnology
  /** Ws for strobes, electrical watts for continuous. */
  power: number
  powerLabel: string
  /** Guide number in metres at ISO 100 with the reference reflector. Strobes only. */
  guideNumber?: number
  /** Total luminous flux in lumens. Continuous heads only. */
  lumens?: number
  /** t0.5 flash duration in seconds at full power. Strobes only. */
  flashDurationT05?: number
  /** Fastest t0.5 the head reaches, at low power. */
  minFlashDurationT05?: number
  cct: string
  bicolor: boolean
  cri: number
  /** Stops of power adjustment on the head. */
  powerRange: number
  hss: boolean
  recycleSeconds?: number
  mountBrand: string
  street: string
}

export const LIGHT_HEADS: Record<string, LightHead> = {
  // --- Studio strobe -------------------------------------------------------
  'profoto-pro11-2400': { id: 'profoto-pro11-2400', maker: 'Profoto', model: 'Pro-11 2400', technology: 'strobe', power: 2400, powerLabel: '2400 Ws', guideNumber: 128, flashDurationT05: 1 / 1200, minFlashDurationT05: 1 / 80000, cct: '5500 K', bicolor: false, cri: 96, powerRange: 11, hss: true, recycleSeconds: 0.7, mountBrand: 'Profoto', street: 'Pack + head' },
  'profoto-d2-1000': { id: 'profoto-d2-1000', maker: 'Profoto', model: 'D2 1000 Air TTL', technology: 'strobe', power: 1000, powerLabel: '1000 Ws', guideNumber: 91, flashDurationT05: 1 / 1000, minFlashDurationT05: 1 / 63000, cct: '5500 K', bicolor: false, cri: 96, powerRange: 10, hss: true, recycleSeconds: 0.9, mountBrand: 'Profoto', street: 'Monolight' },
  'profoto-d2-500': { id: 'profoto-d2-500', maker: 'Profoto', model: 'D2 500 Air TTL', technology: 'strobe', power: 500, powerLabel: '500 Ws', guideNumber: 65, flashDurationT05: 1 / 1200, minFlashDurationT05: 1 / 63000, cct: '5500 K', bicolor: false, cri: 96, powerRange: 10, hss: true, recycleSeconds: 0.6, mountBrand: 'Profoto', street: 'Monolight' },
  'profoto-b10x-plus': { id: 'profoto-b10x-plus', maker: 'Profoto', model: 'B10X Plus', technology: 'strobe', power: 500, powerLabel: '500 Ws', guideNumber: 64, flashDurationT05: 1 / 1000, minFlashDurationT05: 1 / 25000, cct: '5600 K', bicolor: false, cri: 96, powerRange: 9, hss: true, recycleSeconds: 2, mountBrand: 'Profoto', street: 'Battery monolight' },
  'broncolor-siros-800l': { id: 'broncolor-siros-800l', maker: 'Broncolor', model: 'Siros 800 L', technology: 'strobe', power: 800, powerLabel: '800 Ws', guideNumber: 92, flashDurationT05: 1 / 1100, minFlashDurationT05: 1 / 20000, cct: '5500 K', bicolor: false, cri: 96, powerRange: 9, hss: true, recycleSeconds: 1.9, mountBrand: 'Broncolor', street: 'Battery monolight' },
  'broncolor-scoro-3200': { id: 'broncolor-scoro-3200', maker: 'Broncolor', model: 'Scoro 3200 S', technology: 'strobe', power: 3200, powerLabel: '3200 Ws', guideNumber: 143, flashDurationT05: 1 / 800, minFlashDurationT05: 1 / 12000, cct: '5500 K', bicolor: false, cri: 97, powerRange: 10, hss: false, recycleSeconds: 1.4, mountBrand: 'Broncolor', street: 'Pack + head' },
  'elinchrom-elb500': { id: 'elinchrom-elb500', maker: 'Elinchrom', model: 'ELB 500 TTL', technology: 'strobe', power: 500, powerLabel: '500 Ws', guideNumber: 76, flashDurationT05: 1 / 1100, minFlashDurationT05: 1 / 20000, cct: '5500 K', bicolor: false, cri: 95, powerRange: 7, hss: true, recycleSeconds: 2, mountBrand: 'Elinchrom', street: 'Battery pack' },
  'elinchrom-three': { id: 'elinchrom-three', maker: 'Elinchrom', model: 'THREE', technology: 'strobe', power: 261, powerLabel: '261 Ws', guideNumber: 55, flashDurationT05: 1 / 1400, minFlashDurationT05: 1 / 12000, cct: '5500 K', bicolor: false, cri: 95, powerRange: 8, hss: true, recycleSeconds: 1.2, mountBrand: 'Elinchrom', street: 'Battery monolight' },
  'godox-ad1200pro': { id: 'godox-ad1200pro', maker: 'Godox', model: 'AD1200 Pro', technology: 'strobe', power: 1200, powerLabel: '1200 Ws', guideNumber: 102, flashDurationT05: 1 / 900, minFlashDurationT05: 1 / 10870, cct: '5600 K', bicolor: false, cri: 96, powerRange: 9, hss: true, recycleSeconds: 1.2, mountBrand: 'Bowens', street: 'Battery pack' },
  'godox-ad600pro': { id: 'godox-ad600pro', maker: 'Godox', model: 'AD600 Pro', technology: 'strobe', power: 600, powerLabel: '600 Ws', guideNumber: 87, flashDurationT05: 1 / 220, minFlashDurationT05: 1 / 10100, cct: '5600 K', bicolor: false, cri: 96, powerRange: 9, hss: true, recycleSeconds: 0.9, mountBrand: 'Bowens', street: 'Battery monolight' },
  'godox-ad400pro': { id: 'godox-ad400pro', maker: 'Godox', model: 'AD400 Pro', technology: 'strobe', power: 400, powerLabel: '400 Ws', guideNumber: 72, flashDurationT05: 1 / 380, minFlashDurationT05: 1 / 12820, cct: '5600 K', bicolor: false, cri: 96, powerRange: 9, hss: true, recycleSeconds: 0.9, mountBrand: 'Bowens', street: 'Battery monolight' },
  'godox-ad200pro': { id: 'godox-ad200pro', maker: 'Godox', model: 'AD200 Pro', technology: 'strobe', power: 200, powerLabel: '200 Ws', guideNumber: 60, flashDurationT05: 1 / 220, minFlashDurationT05: 1 / 13158, cct: '5600 K', bicolor: false, cri: 96, powerRange: 9, hss: true, recycleSeconds: 1.8, mountBrand: 'Godox S', street: 'Pocket strobe' },
  'westcott-fj400': { id: 'westcott-fj400', maker: 'Westcott', model: 'FJ400', technology: 'strobe', power: 400, powerLabel: '400 Ws', guideNumber: 62, flashDurationT05: 1 / 500, minFlashDurationT05: 1 / 16000, cct: '5500 K', bicolor: false, cri: 96, powerRange: 9, hss: true, recycleSeconds: 0.9, mountBrand: 'Bowens', street: 'Battery monolight' },

  // --- Continuous LED ------------------------------------------------------
  'aputure-1200d': { id: 'aputure-1200d', maker: 'Aputure', model: 'LS 1200d Pro', technology: 'led-cob', power: 1200, powerLabel: '1200 W', lumens: 110000, cct: '5600 K', bicolor: false, cri: 96, powerRange: 10, hss: false, mountBrand: 'Bowens', street: 'Daylight COB' },
  'aputure-600d': { id: 'aputure-600d', maker: 'Aputure', model: 'LS 600d Pro', technology: 'led-cob', power: 600, powerLabel: '600 W', lumens: 58000, cct: '5600 K', bicolor: false, cri: 96, powerRange: 10, hss: false, mountBrand: 'Bowens', street: 'Daylight COB' },
  'aputure-600c': { id: 'aputure-600c', maker: 'Aputure', model: 'LS 600c Pro', technology: 'led-cob', power: 600, powerLabel: '600 W', lumens: 42000, cct: '2300–10000 K', bicolor: true, cri: 95, powerRange: 10, hss: false, mountBrand: 'Bowens', street: 'RGBWW COB' },
  'aputure-300x': { id: 'aputure-300x', maker: 'Aputure', model: 'LS 300X', technology: 'led-cob', power: 300, powerLabel: '300 W', lumens: 26000, cct: '2700–6500 K', bicolor: true, cri: 96, powerRange: 10, hss: false, mountBrand: 'Bowens', street: 'Bi-colour COB' },
  'amaran-200x': { id: 'amaran-200x', maker: 'Amaran', model: '200x S', technology: 'led-cob', power: 200, powerLabel: '200 W', lumens: 17000, cct: '2700–6500 K', bicolor: true, cri: 95, powerRange: 10, hss: false, mountBrand: 'Bowens', street: 'Bi-colour COB' },
  'nanlite-forza720b': { id: 'nanlite-forza720b', maker: 'Nanlite', model: 'Forza 720B', technology: 'led-cob', power: 800, powerLabel: '800 W', lumens: 66000, cct: '2700–6500 K', bicolor: true, cri: 96, powerRange: 10, hss: false, mountBrand: 'Bowens', street: 'Bi-colour COB' },
  'nanlite-forza500ii': { id: 'nanlite-forza500ii', maker: 'Nanlite', model: 'Forza 500 II', technology: 'led-cob', power: 500, powerLabel: '500 W', lumens: 45000, cct: '5600 K', bicolor: false, cri: 98, powerRange: 10, hss: false, mountBrand: 'Bowens', street: 'Daylight COB' },
  'godox-knowled-m600d': { id: 'godox-knowled-m600d', maker: 'Godox', model: 'KNOWLED M600D', technology: 'led-cob', power: 600, powerLabel: '600 W', lumens: 55000, cct: '5600 K', bicolor: false, cri: 96, powerRange: 10, hss: false, mountBrand: 'Bowens', street: 'Daylight COB' },
  'arri-orbiter': { id: 'arri-orbiter', maker: 'ARRI', model: 'Orbiter', technology: 'led-cob', power: 500, powerLabel: '500 W', lumens: 40000, cct: '2000–20000 K', bicolor: true, cri: 98, powerRange: 10, hss: false, mountBrand: 'ARRI', street: 'Six-colour engine' },
  'arri-skypanel-s60': { id: 'arri-skypanel-s60', maker: 'ARRI', model: 'SkyPanel S60-C', technology: 'led-panel', power: 450, powerLabel: '450 W', lumens: 27000, cct: '2800–10000 K', bicolor: true, cri: 95, powerRange: 10, hss: false, mountBrand: 'Yoke', street: 'Soft panel' },
  'litepanels-gemini-2x1': { id: 'litepanels-gemini-2x1', maker: 'Litepanels', model: 'Gemini 2×1 Hard', technology: 'led-panel', power: 325, powerLabel: '325 W', lumens: 17000, cct: '2700–10000 K', bicolor: true, cri: 96, powerRange: 10, hss: false, mountBrand: 'Yoke', street: 'Soft panel' },

  // --- HMI / tungsten ------------------------------------------------------
  'arri-m18': { id: 'arri-m18', maker: 'ARRI', model: 'M18 HMI', technology: 'hmi', power: 1800, powerLabel: '1800 W', lumens: 155000, cct: '6000 K', bicolor: false, cri: 95, powerRange: 2, hss: false, mountBrand: 'Junior', street: 'Daylight HMI' },
  'arri-650-fresnel': { id: 'arri-650-fresnel', maker: 'ARRI', model: '650 Plus Fresnel', technology: 'tungsten', power: 650, powerLabel: '650 W', lumens: 17000, cct: '3200 K', bicolor: false, cri: 100, powerRange: 3, hss: false, mountBrand: 'Baby', street: 'Tungsten fresnel' },

  // --- House generic -------------------------------------------------------
  'generic-led': { id: 'generic-led', maker: 'LUMEN', model: 'Generic 300', technology: 'led-cob', power: 300, powerLabel: '300 W', lumens: 26000, cct: '2800–7500 K', bicolor: true, cri: 95, powerRange: 10, hss: false, mountBrand: 'Bowens', street: 'House COB' },
  'generic-strobe': { id: 'generic-strobe', maker: 'LUMEN', model: 'Generic 500', technology: 'strobe', power: 500, powerLabel: '500 Ws', guideNumber: 68, flashDurationT05: 1 / 800, minFlashDurationT05: 1 / 8000, cct: '5600 K', bicolor: false, cri: 95, powerRange: 8, hss: true, recycleSeconds: 1.2, mountBrand: 'Bowens', street: 'House monolight' },
}

export type LightHeadId = string

export const DEFAULT_HEAD_ID = 'generic-led'

export function getHead(id: string): LightHead {
  return LIGHT_HEADS[id] ?? LIGHT_HEADS[DEFAULT_HEAD_ID]
}

export function headOutputSpec(head: LightHead): HeadOutputSpec {
  if (head.guideNumber !== undefined) {
    return { kind: 'flash', guideNumber: head.guideNumber, flashDurationT05: head.flashDurationT05 ?? 1 / 800 }
  }
  return { kind: 'continuous', lumens: head.lumens ?? 20000 }
}

/** Conserved bare-head flux: lumens for continuous, lumen-seconds for strobe. */
export function headFlux(head: LightHead) {
  if (head.guideNumber !== undefined) return flashFluxSeconds(head.guideNumber)
  return bareHeadFlux(headOutputSpec(head))
}

/**
 * Linear output fraction from the head's power dial.
 *
 * The UI dial is marked in percent of output, so it maps to percent of flux.
 * (Hardware marked in fractions — 1/1, 1/2, 1/4 — lands on the same scale:
 * 1/2 is the 50 % position.) Reading the dial as *stops* instead makes 48 %
 * mean 2.7 % of output, which silently under-lights every scene.
 */
export function powerFraction(light: { powerPercent: number }) {
  return Math.min(100, Math.max(0, light.powerPercent)) / 100
}

export const HEAD_MAKERS = Array.from(new Set(Object.values(LIGHT_HEADS).map((head) => head.maker)))

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

export type ModifierFamily =
  | 'softbox' | 'octabox' | 'stripbox' | 'umbrella' | 'beauty-dish'
  | 'parabolic' | 'lantern' | 'reflector' | 'fresnel' | 'spot' | 'panel-diffusion'

/** Maps onto the render-side optic geometry the scene already knows how to draw. */
export type OpticKind =
  | 'softbox' | 'umbrella-shoot' | 'umbrella-reflect' | 'beauty-dish' | 'deep-parabolic'
  | 'lantern' | 'standard' | 'fresnel' | 'snoot' | 'barn-doors' | 'projection'

export type ModifierProfile = {
  id: string
  maker: string
  model: string
  family: ModifierFamily
  optic: OpticKind
  /** Emitting face in metres. Round faces repeat the diameter. */
  width: number
  height: number
  round: boolean
  /** Fraction of head flux that leaves the face. 0.45 ≈ one stop of loss. */
  transmission: number
  /** Full beam angle in degrees, unmodified. */
  beamDegrees: number
  /** True for anything with a real emitting area — drives the near-field model. */
  area: boolean
  /**
   * On-axis intensity gain against the standard reflector, at equal flux.
   * Only meaningful for hard optics: a Magnum genuinely redirects light (2×),
   * a snoot only clips it (1×). Defaults to 1.
   */
  concentration?: number
  /** Grid options available for this modifier, in degrees. */
  grids: number[]
  mount: string
  note: string
}

const softbox = (
  id: string, maker: string, model: string, width: number, height: number,
  transmission: number, beamDegrees: number, grids: number[], mount: string, note: string,
): ModifierProfile => ({ id, maker, model, family: width === height ? 'softbox' : Math.max(width, height) / Math.min(width, height) >= 2.5 ? 'stripbox' : 'softbox', optic: 'softbox', width, height, round: false, transmission, beamDegrees, area: true, grids, mount, note })

export const MODIFIERS: Record<string, ModifierProfile> = {
  // --- Softbox -------------------------------------------------------------
  'rfi-1x1': softbox('rfi-1x1', 'Profoto', 'RFi 1×1′', 0.3, 0.3, 0.34, 78, [50, 20], 'Profoto', 'Tight accent box'),
  'rfi-2x2': softbox('rfi-2x2', 'Profoto', 'RFi 2×2′', 0.6, 0.6, 0.34, 76, [50, 20], 'Profoto', 'Small key or hair light'),
  'rfi-3x3': softbox('rfi-3x3', 'Profoto', 'RFi 3×3′', 0.9, 0.9, 0.34, 75, [50, 20], 'Profoto', 'The default portrait key'),
  'rfi-2x3': softbox('rfi-2x3', 'Profoto', 'RFi 2×3′', 0.6, 0.9, 0.34, 75, [50, 20], 'Profoto', 'Half-length key'),
  'rfi-3x4': softbox('rfi-3x4', 'Profoto', 'RFi 3×4′', 0.9, 1.2, 0.34, 74, [50, 20], 'Profoto', 'Three-quarter length key'),
  'rfi-4x6': softbox('rfi-4x6', 'Profoto', 'RFi 4×6′', 1.2, 1.8, 0.33, 73, [50], 'Profoto', 'Full-length wrap'),
  'chimera-medium': softbox('chimera-medium', 'Chimera', 'Video Pro Medium', 0.76, 0.91, 0.45, 80, [40], 'Speed ring', 'Cine standard'),
  'godox-90x90': softbox('godox-90x90', 'Godox', 'SB-BW 90×90', 0.9, 0.9, 0.31, 76, [40], 'Bowens', 'Budget square box'),
  'godox-60x90': softbox('godox-60x90', 'Godox', 'SB-BW 60×90', 0.6, 0.9, 0.31, 76, [40], 'Bowens', 'Budget rectangle'),

  // --- Stripbox ------------------------------------------------------------
  'rfi-1x3': softbox('rfi-1x3', 'Profoto', 'RFi 1×3′ Strip', 0.3, 0.9, 0.34, 72, [50, 20], 'Profoto', 'Edge and rim light'),
  'rfi-1x4': softbox('rfi-1x4', 'Profoto', 'RFi 1×4′ Strip', 0.3, 1.2, 0.34, 72, [50, 20], 'Profoto', 'Full-length rim'),
  'rfi-1x6': softbox('rfi-1x6', 'Profoto', 'RFi 1×6′ Strip', 0.3, 1.8, 0.32, 70, [50], 'Profoto', 'Standing figure rim'),
  'broncolor-strip-30x120': softbox('broncolor-strip-30x120', 'Broncolor', 'Softbox 30×120', 0.3, 1.2, 0.36, 72, [40], 'Broncolor', 'Precise strip'),

  // --- Octabox -------------------------------------------------------------
  'rfi-octa-3': { id: 'rfi-octa-3', maker: 'Profoto', model: 'RFi Octa 3′', family: 'octabox', optic: 'softbox', width: 0.9, height: 0.9, round: true, transmission: 0.34, beamDegrees: 76, area: true, grids: [50, 20], mount: 'Profoto', note: 'Round catchlight key' },
  'rfi-octa-5': { id: 'rfi-octa-5', maker: 'Profoto', model: 'RFi Octa 5′', family: 'octabox', optic: 'softbox', width: 1.5, height: 1.5, round: true, transmission: 0.33, beamDegrees: 75, area: true, grids: [50], mount: 'Profoto', note: 'Beauty and half-length' },
  'broncolor-octa-150': { id: 'broncolor-octa-150', maker: 'Broncolor', model: 'Octabox 150', family: 'octabox', optic: 'softbox', width: 1.5, height: 1.5, round: true, transmission: 0.36, beamDegrees: 74, area: true, grids: [40], mount: 'Broncolor', note: 'Even, expensive, worth it' },
  'godox-octa-120': { id: 'godox-octa-120', maker: 'Godox', model: 'Octa 120', family: 'octabox', optic: 'softbox', width: 1.2, height: 1.2, round: true, transmission: 0.31, beamDegrees: 76, area: true, grids: [40], mount: 'Bowens', note: 'Workhorse octa' },
  'westcott-fj-octa-190': { id: 'westcott-fj-octa-190', maker: 'Westcott', model: 'Rapid Box 190', family: 'octabox', optic: 'softbox', width: 1.9, height: 1.9, round: true, transmission: 0.32, beamDegrees: 74, area: true, grids: [40], mount: 'Bowens', note: 'Group and full length' },

  // --- Umbrella ------------------------------------------------------------
  'umbrella-shoot-85': { id: 'umbrella-shoot-85', maker: 'Generic', model: 'Shoot-through 85 cm', family: 'umbrella', optic: 'umbrella-shoot', width: 0.85, height: 0.85, round: true, transmission: 0.5, beamDegrees: 130, area: true, grids: [], mount: 'Shaft', note: 'Cheap, fast, spills everywhere' },
  'umbrella-shoot-105': { id: 'umbrella-shoot-105', maker: 'Generic', model: 'Shoot-through 105 cm', family: 'umbrella', optic: 'umbrella-shoot', width: 1.05, height: 1.05, round: true, transmission: 0.5, beamDegrees: 132, area: true, grids: [], mount: 'Shaft', note: 'Big and forgiving' },
  'umbrella-silver-105': { id: 'umbrella-silver-105', maker: 'Generic', model: 'Silver reflective 105 cm', family: 'umbrella', optic: 'umbrella-reflect', width: 1.05, height: 1.05, round: true, transmission: 0.62, beamDegrees: 105, area: true, grids: [], mount: 'Shaft', note: 'Punchier, more specular' },
  'profoto-umbrella-deep-m': { id: 'profoto-umbrella-deep-m', maker: 'Profoto', model: 'Umbrella Deep White M', family: 'umbrella', optic: 'umbrella-reflect', width: 1.05, height: 1.05, round: true, transmission: 0.66, beamDegrees: 85, area: true, grids: [], mount: 'Shaft', note: 'Deep, controlled, near-parabolic' },
  'profoto-umbrella-deep-xl': { id: 'profoto-umbrella-deep-xl', maker: 'Profoto', model: 'Umbrella Deep White XL', family: 'umbrella', optic: 'umbrella-reflect', width: 1.65, height: 1.65, round: true, transmission: 0.64, beamDegrees: 80, area: true, grids: [], mount: 'Shaft', note: 'Huge soft key on a budget' },

  // --- Beauty dish ---------------------------------------------------------
  'profoto-softlight-white': { id: 'profoto-softlight-white', maker: 'Profoto', model: 'Softlight White 51 cm', family: 'beauty-dish', optic: 'beauty-dish', width: 0.51, height: 0.51, round: true, transmission: 0.72, beamDegrees: 58, area: true, grids: [25, 10], mount: 'Profoto', note: 'The beauty-dish look' },
  'profoto-softlight-silver': { id: 'profoto-softlight-silver', maker: 'Profoto', model: 'Softlight Silver 51 cm', family: 'beauty-dish', optic: 'beauty-dish', width: 0.51, height: 0.51, round: true, transmission: 0.8, beamDegrees: 55, area: true, grids: [25, 10], mount: 'Profoto', note: 'Crisper, more contrast' },
  'mola-setti': { id: 'mola-setti', maker: 'Mola', model: 'Setti 70 cm', family: 'beauty-dish', optic: 'beauty-dish', width: 0.7, height: 0.7, round: true, transmission: 0.78, beamDegrees: 60, area: true, grids: [25], mount: 'Speed ring', note: 'Wide, smooth beauty' },
  'godox-dish-55': { id: 'godox-dish-55', maker: 'Godox', model: 'Beauty Dish 55 cm', family: 'beauty-dish', optic: 'beauty-dish', width: 0.55, height: 0.55, round: true, transmission: 0.74, beamDegrees: 58, area: true, grids: [25], mount: 'Bowens', note: 'Budget dish' },
  'dish-sock': { id: 'dish-sock', maker: 'Generic', model: 'Beauty Dish + Sock 55 cm', family: 'beauty-dish', optic: 'beauty-dish', width: 0.55, height: 0.55, round: true, transmission: 0.32, beamDegrees: 78, area: true, grids: [], mount: 'Bowens', note: 'Dish shape, softbox edge' },

  // --- Parabolic -----------------------------------------------------------
  'broncolor-para-88': { id: 'broncolor-para-88', maker: 'Broncolor', model: 'Para 88', family: 'parabolic', optic: 'deep-parabolic', width: 0.88, height: 0.88, round: true, transmission: 0.85, beamDegrees: 45, area: true, grids: [], mount: 'Para adapter', note: 'Focusable, sculpted' },
  'broncolor-para-133': { id: 'broncolor-para-133', maker: 'Broncolor', model: 'Para 133', family: 'parabolic', optic: 'deep-parabolic', width: 1.33, height: 1.33, round: true, transmission: 0.86, beamDegrees: 42, area: true, grids: [], mount: 'Para adapter', note: 'The fashion parabolic' },
  'broncolor-para-177': { id: 'broncolor-para-177', maker: 'Broncolor', model: 'Para 177', family: 'parabolic', optic: 'deep-parabolic', width: 1.77, height: 1.77, round: true, transmission: 0.86, beamDegrees: 40, area: true, grids: [], mount: 'Para adapter', note: 'Full length, punchy and soft' },
  'profoto-zoom-reflector': { id: 'profoto-zoom-reflector', maker: 'Profoto', model: 'Zoom Reflector', family: 'reflector', optic: 'standard', width: 0.24, height: 0.24, round: true, transmission: 0.95, beamDegrees: 50, area: false, concentration: 1.15, grids: [20, 10], mount: 'Profoto', note: 'Zoomable 45–70°' },

  // --- Lantern / ambient ---------------------------------------------------
  'chimera-lantern-50': { id: 'chimera-lantern-50', maker: 'Chimera', model: 'Pancake Lantern 50', family: 'lantern', optic: 'lantern', width: 0.5, height: 0.5, round: true, transmission: 0.55, beamDegrees: 300, area: true, grids: [], mount: 'Speed ring', note: 'Omni ambient fill' },
  'aputure-lantern-90': { id: 'aputure-lantern-90', maker: 'Aputure', model: 'Lantern 90', family: 'lantern', optic: 'lantern', width: 0.9, height: 0.9, round: true, transmission: 0.52, beamDegrees: 330, area: true, grids: [], mount: 'Bowens', note: 'Room-filling soft source' },

  // --- Hard optics ---------------------------------------------------------
  'standard-reflector': { id: 'standard-reflector', maker: 'Generic', model: 'Standard Reflector', family: 'reflector', optic: 'standard', width: 0.18, height: 0.18, round: true, transmission: 0.95, beamDegrees: 50, area: false, concentration: 1, grids: [40, 30, 20, 10], mount: 'Bowens', note: 'The reference reflector' },
  'magnum-reflector': { id: 'magnum-reflector', maker: 'Profoto', model: 'Magnum Reflector', family: 'reflector', optic: 'standard', width: 0.26, height: 0.26, round: true, transmission: 0.96, beamDegrees: 33, area: false, concentration: 2, grids: [20, 10], mount: 'Profoto', note: 'Long throw, +1 stop' },
  'wide-reflector': { id: 'wide-reflector', maker: 'Generic', model: 'Wide Reflector', family: 'reflector', optic: 'standard', width: 0.3, height: 0.3, round: true, transmission: 0.94, beamDegrees: 78, area: false, concentration: 0.45, grids: [], mount: 'Bowens', note: 'Background wash' },
  'fresnel-8': { id: 'fresnel-8', maker: 'Aputure', model: 'Fresnel 2X', family: 'fresnel', optic: 'fresnel', width: 0.2, height: 0.2, round: true, transmission: 0.78, beamDegrees: 45, area: false, concentration: 1.9, grids: [], mount: 'Bowens', note: 'Spot 12° to flood 45°' },
  'arri-fresnel-650': { id: 'arri-fresnel-650', maker: 'ARRI', model: '650 Fresnel Lens', family: 'fresnel', optic: 'fresnel', width: 0.15, height: 0.15, round: true, transmission: 0.8, beamDegrees: 50, area: false, concentration: 1.7, grids: [], mount: 'Baby', note: 'Classic hard cine key' },
  'barn-doors': { id: 'barn-doors', maker: 'Generic', model: 'Barn Doors', family: 'reflector', optic: 'barn-doors', width: 0.2, height: 0.2, round: false, transmission: 0.8, beamDegrees: 46, area: false, concentration: 1, grids: [], mount: 'Bowens', note: 'Cut the spill by hand' },
  'snoot': { id: 'snoot', maker: 'Generic', model: 'Snoot', family: 'spot', optic: 'snoot', width: 0.1, height: 0.1, round: true, transmission: 0.4, beamDegrees: 20, area: false, concentration: 1, grids: [10], mount: 'Bowens', note: 'Tight pool of light' },
  'conical-snoot': { id: 'conical-snoot', maker: 'Aputure', model: 'Spotlight Mount 26°', family: 'spot', optic: 'projection', width: 0.08, height: 0.08, round: true, transmission: 0.3, beamDegrees: 26, area: false, concentration: 1.4, grids: [], mount: 'Bowens', note: 'Gobo projection' },
  'optical-spot-19': { id: 'optical-spot-19', maker: 'Profoto', model: 'OCF II Optical Spot 19°', family: 'spot', optic: 'projection', width: 0.07, height: 0.07, round: true, transmission: 0.26, beamDegrees: 19, area: false, concentration: 1.8, grids: [], mount: 'Profoto', note: 'Sharp-edged pattern' },

  // --- Bare / panel --------------------------------------------------------
  'bare-bulb': { id: 'bare-bulb', maker: 'Generic', model: 'Bare Bulb', family: 'reflector', optic: 'standard', width: 0.05, height: 0.05, round: true, transmission: 1, beamDegrees: 170, area: false, concentration: 0.14, grids: [], mount: 'None', note: 'Raw, omnidirectional' },
  'skypanel-diffusion': { id: 'skypanel-diffusion', maker: 'ARRI', model: 'SkyPanel S60 Face', family: 'panel-diffusion', optic: 'softbox', width: 0.65, height: 0.3, round: false, transmission: 0.9, beamDegrees: 115, area: true, grids: [60, 30], mount: 'Integrated', note: 'Built-in soft face' },
  'panel-diffuser': { id: 'panel-diffuser', maker: 'Generic', model: 'LED Panel + Diffuser', family: 'panel-diffusion', optic: 'softbox', width: 0.6, height: 0.3, round: false, transmission: 0.72, beamDegrees: 110, area: true, grids: [40], mount: 'Integrated', note: 'Flat, even, portable' },
}

export const DEFAULT_MODIFIER_ID = 'rfi-3x3'

export function getModifier(id: string): ModifierProfile {
  return MODIFIERS[id] ?? MODIFIERS[DEFAULT_MODIFIER_ID]
}

export const MODIFIER_FAMILIES: { id: ModifierFamily; label: string }[] = [
  { id: 'softbox', label: 'Softbox' },
  { id: 'octabox', label: 'Octabox' },
  { id: 'stripbox', label: 'Stripbox' },
  { id: 'umbrella', label: 'Umbrella' },
  { id: 'beauty-dish', label: 'Beauty dish' },
  { id: 'parabolic', label: 'Parabolic' },
  { id: 'lantern', label: 'Lantern' },
  { id: 'reflector', label: 'Reflector' },
  { id: 'fresnel', label: 'Fresnel' },
  { id: 'spot', label: 'Spot / projection' },
  { id: 'panel-diffusion', label: 'Panel' },
]

/**
 * Transmission of an egg-crate grid, from its cut angle.
 * A 20° grid on a softbox costs about a stop and a half — the number people
 * forget when they wonder why the shot went dark.
 */
export function gridTransmission(gridDegrees: number | null) {
  if (!gridDegrees) return 1
  if (gridDegrees >= 50) return 0.8
  if (gridDegrees >= 40) return 0.74
  if (gridDegrees >= 30) return 0.66
  if (gridDegrees >= 25) return 0.6
  if (gridDegrees >= 20) return 0.52
  return 0.38
}

/** Beam angle after a grid is fitted — the grid wins if it is tighter. */
export function griddedBeam(beamDegrees: number, gridDegrees: number | null) {
  if (!gridDegrees) return beamDegrees
  return Math.min(beamDegrees, gridDegrees)
}

/** Everything the photometry layer needs about one fitted light, in one place. */
export function fittedOptics(modifier: ModifierProfile, gridDegrees: number | null, widthOverride?: number, heightOverride?: number) {
  const width = widthOverride ?? modifier.width
  const height = heightOverride ?? modifier.height
  return {
    area: modifier.area,
    width,
    height,
    beamDegrees: griddedBeam(modifier.beamDegrees, gridDegrees),
    // On-axis intensity from flux conservation over the optic's NATIVE lobe:
    // for I(θ) = I₀·cosⁿθ, Φ = I₀·2π/(n+1), so I₀ = Φ(n+1)/2π. A perfect
    // Lambertian (n = 1) gives Φ/π; a 75° softbox concentrates about a stop more.
    //
    // The native beam is deliberate. An egg-crate grid absorbs off-axis rays —
    // it does not focus the on-axis ones — so it shows up in `transmission` and
    // in the tightened `beamDegrees` lobe, never as a gain here.
    concentration: modifier.concentration ?? (modifier.area ? (lobeExponent(modifier.beamDegrees) + 1) / 2 : 1),
    transmission: modifier.transmission * gridTransmission(gridDegrees),
    solidAngle: coneSolidAngle(griddedBeam(modifier.beamDegrees, gridDegrees)),
  }
}
