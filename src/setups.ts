/**
 * Lighting setup library.
 *
 * Set.A.Light's stickiest feature is a shared library of other people's setups.
 * This is the same idea built the other way round: instead of an unsorted feed,
 * every entry here is a named lighting pattern a photographer is expected to
 * know, specified in real gear at real distances, with the reasoning attached.
 *
 * Positions are metres in world space with the subject at the origin facing +Z
 * and the camera down the +Z axis. Heights are from the floor.
 */

import type { LightOptic, LightShape, StudioLight } from './store'

export type SetupCategory = 'portrait' | 'beauty' | 'dramatic' | 'commercial' | 'cinematic'

type LightSpec = {
  id: string
  name: string
  headId: string
  modifierId: string
  optic: LightOptic
  shape: LightShape
  position: [number, number, number]
  /** Aim point; defaults to the subject's face at 1.5 m. */
  target?: [number, number, number]
  powerPercent: number
  temperature?: number
  gelId?: string
  gridDegrees?: number | null
  mode?: 'flash' | 'continuous'
  width?: number
  height?: number
  beamAngle?: number
}

export type LightingSetup = {
  id: string
  category: SetupCategory
  label: string
  /** One line on what the setup is for. */
  summary: string
  /** The reasoning — why the lights are where they are. */
  note: string
  /** Suggested background, applied with the setup. */
  backdropId?: string
  camera: { position: [number, number, number]; target: [number, number, number]; focalLength: number; aperture: number }
  /** Ratio the setup is built around, for the setup sheet. */
  ratio: string
  lights: LightSpec[]
}

const FACE: [number, number, number] = [0, 1.5, 0]

/**
 * The library.
 *
 * The classical portrait patterns come first because they are the vocabulary:
 * every other setup in the list is a departure from one of them.
 */
export const SETUP_LIBRARY: LightingSetup[] = [
  {
    id: 'rembrandt',
    category: 'portrait',
    label: 'Sculpted dramatic portrait',
    summary: 'Key at 45° and above; a triangle of light on the far cheek.',
    note: 'The key sits 45° round and 45° up so the nose shadow reaches down to meet the cheek shadow, leaving one lit triangle under the far eye. Move the key any wider and the triangle closes; any higher and it drops onto the lip.',
    backdropId: 'thunder-grey',
    ratio: '4:1',
    camera: { position: [0, 1.55, 2.4], target: FACE, focalLength: 85, aperture: 4 },
    lights: [
      { id: 'key', name: 'Key · 90 cm octa', headId: 'godox-ad600pro', modifierId: 'rfi-octa-3', optic: 'softbox', shape: 'round', position: [-1.25, 2.15, 1.25], powerPercent: 18, width: 0.9, height: 0.9 },
      { id: 'fill', name: 'Fill · white V-flat bounce', headId: 'godox-ad400pro', modifierId: 'rfi-4x6', optic: 'softbox', shape: 'square', position: [1.7, 1.6, 1.5], powerPercent: 4, width: 1.2, height: 1.8 },
    ],
  },
  {
    id: 'loop',
    category: 'portrait',
    label: 'Natural everyday portrait',
    summary: 'The everyday portrait key. A small loop of nose shadow, no join.',
    note: 'Key about 35° round and 35° up. The nose shadow makes a short loop on the cheek but never touches the cheek shadow — the most forgiving pattern there is, which is why it is the default for headshots.',
    backdropId: 'studio-grey',
    ratio: '3:1',
    camera: { position: [0, 1.58, 2.2], target: FACE, focalLength: 85, aperture: 4 },
    lights: [
      { id: 'key', name: 'Key · 120 cm octa', headId: 'godox-ad600pro', modifierId: 'rfi-octa-5', optic: 'softbox', shape: 'round', position: [-1.0, 2.0, 1.5], powerPercent: 16, width: 1.2, height: 1.2 },
      { id: 'fill', name: 'Fill · 90 cm', headId: 'godox-ad400pro', modifierId: 'rfi-3x3', optic: 'softbox', shape: 'square', position: [1.35, 1.65, 1.7], powerPercent: 5, width: 0.9, height: 0.9 },
    ],
  },
  {
    id: 'butterfly',
    category: 'beauty',
    label: 'Sculpted cheekbone beauty',
    summary: 'Key straight above the lens; a butterfly shadow under the nose.',
    note: 'Dead on axis and high, with a reflector under the chin to open the eye sockets. The symmetry is the point — it flatters cheekbones and punishes anything asymmetrical about the face.',
    backdropId: 'fashion-grey',
    ratio: '2:1',
    camera: { position: [0, 1.55, 2.0], target: FACE, focalLength: 105, aperture: 5.6 },
    lights: [
      { id: 'key', name: 'Key · beauty dish', headId: 'profoto-d2-1000', modifierId: 'profoto-softlight-white', optic: 'beauty-dish', shape: 'round', position: [0, 2.4, 1.35], powerPercent: 20, width: 0.7, height: 0.7 },
      { id: 'fill', name: 'Fill · from below', headId: 'godox-ad200pro', modifierId: 'rfi-2x3', optic: 'softbox', shape: 'square', position: [0, 0.9, 1.5], powerPercent: 6, width: 0.6, height: 0.9 },
    ],
  },
  {
    id: 'clamshell',
    category: 'beauty',
    label: 'Soft beauty light',
    summary: 'Two sources stacked on the lens axis. The standard beauty light.',
    note: 'A large source above and a second below, both on axis, with the subject in the gap. It fills every shadow the top light makes, which is exactly what a skin-and-makeup shot wants and exactly what a character portrait does not.',
    backdropId: 'super-white',
    ratio: '1.5:1',
    camera: { position: [0, 1.52, 1.8], target: FACE, focalLength: 105, aperture: 8 },
    lights: [
      { id: 'key', name: 'Key · beauty dish + sock', headId: 'profoto-d2-1000', modifierId: 'profoto-softlight-white', optic: 'beauty-dish', shape: 'round', position: [0, 2.25, 1.1], powerPercent: 22, width: 0.7, height: 0.7 },
      { id: 'fill', name: 'Fill · stripbox below', headId: 'godox-ad400pro', modifierId: 'rfi-1x4', optic: 'softbox', shape: 'strip', position: [0, 0.95, 1.25], powerPercent: 9, width: 0.3, height: 1.2 },
      { id: 'bg', name: 'Background · wash', headId: 'godox-ad400pro', modifierId: 'standard-reflector', optic: 'standard', shape: 'round', position: [0, 1.4, -1.0], target: [0, 1.4, -2.2], powerPercent: 22 },
    ],
  },
  {
    id: 'split',
    category: 'dramatic',
    label: 'Bold half-shadow portrait',
    summary: 'Key at 90°. Half the face lit, half in shadow.',
    note: 'The key sits level with the face and directly to the side, so the shadow line runs down the centre of the nose. Nothing is more unforgiving, which is why it works on faces with structure and fails on faces without.',
    backdropId: 'black-paper',
    ratio: '8:1',
    camera: { position: [0, 1.5, 2.2], target: FACE, focalLength: 85, aperture: 5.6 },
    lights: [
      { id: 'key', name: 'Key · gridded 60 cm', headId: 'profoto-d2-500', modifierId: 'rfi-2x2', optic: 'softbox', shape: 'square', position: [-1.5, 1.6, 0.15], powerPercent: 14, gridDegrees: 40, width: 0.6, height: 0.6 },
    ],
  },
  {
    id: 'noir',
    category: 'dramatic',
    label: 'Film-noir edge portrait',
    summary: 'Hard key high and to the side, plus a hard back light.',
    note: 'A bare reflector for a hard shadow edge, deliberately unfilled, with a snooted back light separating the shoulder from black. The absence of fill is the setup: if you soften it, it stops being noir.',
    backdropId: 'black-paper',
    ratio: '16:1',
    camera: { position: [0.3, 1.5, 2.1], target: FACE, focalLength: 50, aperture: 4 },
    lights: [
      { id: 'key', name: 'Key · standard reflector', headId: 'profoto-d2-500', modifierId: 'standard-reflector', optic: 'standard', shape: 'round', position: [-1.4, 2.5, 0.9], powerPercent: 10 },
      { id: 'back', name: 'Back · snoot', headId: 'godox-ad200pro', modifierId: 'snoot', optic: 'snoot', shape: 'round', position: [1.1, 2.3, -1.5], target: [0.15, 1.62, 0], powerPercent: 16 },
    ],
  },
  {
    id: 'rim-pair',
    category: 'dramatic',
    label: 'Graphic rim silhouette',
    summary: 'Two strips behind, edging both shoulders. No key at all.',
    note: 'Both sources sit behind the subject at 135°, aimed forward. The face stays dark and the outline does the work — the fastest way to read a silhouette against a black background.',
    backdropId: 'charcoal',
    ratio: 'rim only',
    camera: { position: [0, 1.5, 2.4], target: FACE, focalLength: 85, aperture: 2.8 },
    lights: [
      { id: 'rim-l', name: 'Rim L · 120 cm strip', headId: 'godox-ad400pro', modifierId: 'rfi-1x4', optic: 'softbox', shape: 'strip', position: [-1.5, 1.9, -1.3], target: [0, 1.2, 0], powerPercent: 14, gridDegrees: 40, width: 0.3, height: 1.2 },
      { id: 'rim-r', name: 'Rim R · 120 cm strip', headId: 'godox-ad400pro', modifierId: 'rfi-1x4', optic: 'softbox', shape: 'strip', position: [1.5, 1.9, -1.3], target: [0, 1.2, 0], powerPercent: 14, gridDegrees: 40, width: 0.3, height: 1.2 },
    ],
  },
  {
    id: 'high-key',
    category: 'commercial',
    label: 'Bright white commercial',
    summary: 'Flat frontal key plus two lights burning the paper to white.',
    note: 'The background lights run about 2⅓ stops over the key — enough to clip to paper white without spilling back onto the subject. Flag them or the wrap kills your contrast.',
    backdropId: 'super-white',
    ratio: '1.2:1',
    camera: { position: [0, 1.5, 2.6], target: FACE, focalLength: 85, aperture: 8 },
    lights: [
      { id: 'key', name: 'Key · 150 cm octa', headId: 'godox-ad600pro', modifierId: 'rfi-octa-5', optic: 'softbox', shape: 'round', position: [-0.7, 1.95, 1.9], powerPercent: 20, width: 1.5, height: 1.5 },
      { id: 'fill', name: 'Fill · 120 cm', headId: 'godox-ad600pro', modifierId: 'rfi-3x4', optic: 'softbox', shape: 'square', position: [0.9, 1.85, 1.9], powerPercent: 13, width: 0.9, height: 1.2 },
      { id: 'bg-l', name: 'BG L · stripbox', headId: 'godox-ad400pro', modifierId: 'rfi-1x6', optic: 'softbox', shape: 'strip', position: [-1.6, 1.5, -1.1], target: [-0.6, 1.5, -2.2], powerPercent: 48, width: 0.3, height: 1.8 },
      { id: 'bg-r', name: 'BG R · stripbox', headId: 'godox-ad400pro', modifierId: 'rfi-1x6', optic: 'softbox', shape: 'strip', position: [1.6, 1.5, -1.1], target: [0.6, 1.5, -2.2], powerPercent: 48, width: 0.3, height: 1.8 },
    ],
  },
  {
    id: 'low-key',
    category: 'dramatic',
    label: 'Deep spotlight portrait',
    summary: 'One gridded source, everything else flagged off.',
    note: 'A single small source with a 20° grid, close in so the fall-off is steep. The grid is doing the real work: it keeps the light off the background so the black stays black.',
    backdropId: 'black-paper',
    ratio: '10:1',
    camera: { position: [0, 1.5, 2.0], target: FACE, focalLength: 85, aperture: 2.8 },
    lights: [
      { id: 'key', name: 'Key · 60 cm + 20° grid', headId: 'profoto-d2-500', modifierId: 'rfi-2x2', optic: 'softbox', shape: 'square', position: [-0.95, 2.0, 0.85], powerPercent: 11, gridDegrees: 20, width: 0.6, height: 0.6 },
    ],
  },
  {
    id: 'three-point',
    category: 'cinematic',
    label: 'Clear interview lighting',
    summary: 'Key, fill and back light. The interview standard.',
    note: 'Key at 40° camera left, fill on the opposite side at half the level, back light high and behind on the key side so the rim lands where the shadow is deepest. Continuous heads, because this one is usually shot as video.',
    backdropId: 'canvas-grey',
    ratio: '3:1',
    camera: { position: [0.2, 1.5, 2.3], target: FACE, focalLength: 50, aperture: 2.8 },
    lights: [
      { id: 'key', name: 'Key · 120 cm', headId: 'aputure-600d', modifierId: 'chimera-lantern-50', optic: 'lantern', shape: 'round', position: [-1.3, 2.05, 1.4], powerPercent: 42, mode: 'continuous' },
      { id: 'fill', name: 'Fill · panel', headId: 'arri-skypanel-s60', modifierId: 'skypanel-diffusion', optic: 'softbox', shape: 'square', position: [1.4, 1.7, 1.4], powerPercent: 22, mode: 'continuous', width: 1.2, height: 0.6 },
      { id: 'back', name: 'Back · fresnel', headId: 'arri-650-fresnel', modifierId: 'fresnel-8', optic: 'fresnel', shape: 'round', position: [1.2, 2.6, -1.6], target: [0.1, 1.6, 0], powerPercent: 60, mode: 'continuous', gelId: 'cto-quarter' },
    ],
  },
  {
    id: 'window-light',
    category: 'cinematic',
    label: 'Natural window softness',
    summary: 'One big soft source at 60°, bounce opposite. Nothing else.',
    note: 'A 2 m source stood on end and feathered so the near edge, not the centre, points at the face. Feathering is what gives it the fall-off of a real window instead of the flatness of a big box.',
    backdropId: 'plaster-grey',
    ratio: '5:1',
    camera: { position: [0.1, 1.5, 2.2], target: FACE, focalLength: 50, aperture: 2 },
    lights: [
      { id: 'key', name: 'Key · 1.8 m softbox', headId: 'aputure-1200d', modifierId: 'rfi-4x6', optic: 'softbox', shape: 'square', position: [-1.7, 1.75, 0.75], powerPercent: 38, mode: 'continuous', width: 1.2, height: 1.8, beamAngle: 82 },
      { id: 'bounce', name: 'Bounce · white flat', headId: 'aputure-300x', modifierId: 'rfi-4x6', optic: 'softbox', shape: 'square', position: [1.6, 1.5, 0.9], powerPercent: 9, mode: 'continuous', width: 1.2, height: 1.8 },
    ],
  },
  {
    id: 'gel-duo',
    category: 'cinematic',
    label: 'Teal-orange cinema contrast',
    summary: 'Warm key one side, cool rim the other.',
    note: 'Complementary gels on opposite sides give separation without a background light. Remember the cost: the blue-green side is nearly two stops down before it leaves the head, so it needs the bigger unit.',
    backdropId: 'charcoal',
    ratio: '2:1',
    camera: { position: [0, 1.5, 2.1], target: FACE, focalLength: 85, aperture: 2 },
    lights: [
      { id: 'key', name: 'Key · warm', headId: 'godox-ad600pro', modifierId: 'rfi-3x3', optic: 'softbox', shape: 'square', position: [-1.2, 1.9, 1.2], powerPercent: 20, gelId: 'straw', width: 0.9, height: 0.9 },
      { id: 'rim', name: 'Rim · teal', headId: 'godox-ad600pro', modifierId: 'rfi-1x4', optic: 'softbox', shape: 'strip', position: [1.45, 1.95, -0.9], target: [0, 1.4, 0], powerPercent: 68, gelId: 'teal', width: 0.3, height: 1.2 },
    ],
  },
  {
    id: 'product-tent',
    category: 'commercial',
    label: 'Even premium product light',
    summary: 'One very large source overhead, white cards either side.',
    note: 'The source has to be bigger than the subject or the specular roll-off breaks at the edges. Cards on both sides return enough to fill the sides without adding a second highlight.',
    backdropId: 'vinyl-white',
    ratio: '1.5:1',
    camera: { position: [0, 0.95, 1.5], target: [0, 0.7, 0], focalLength: 100, aperture: 11 },
    lights: [
      { id: 'top', name: 'Top · 1.8 m box', headId: 'profoto-d2-1000', modifierId: 'rfi-4x6', optic: 'softbox', shape: 'square', position: [0, 2.1, 0.35], target: [0, 0.7, 0], powerPercent: 26, width: 1.2, height: 1.8 },
      { id: 'left', name: 'Card L', headId: 'godox-ad200pro', modifierId: 'rfi-2x3', optic: 'softbox', shape: 'square', position: [-1.0, 0.95, 0.5], target: [0, 0.7, 0], powerPercent: 6, width: 0.6, height: 0.9 },
      { id: 'right', name: 'Card R', headId: 'godox-ad200pro', modifierId: 'rfi-2x3', optic: 'softbox', shape: 'square', position: [1.0, 0.95, 0.5], target: [0, 0.7, 0], powerPercent: 6, width: 0.6, height: 0.9 },
    ],
  },
  {
    id: 'short-broad',
    category: 'portrait',
    label: 'Slimming short-side portrait',
    summary: 'Key on the far side of a turned face. Narrows the jaw.',
    note: 'With the head turned, put the key on the side turned away from camera. The near cheek falls into shadow, which slims the face — the reverse (broad light) widens it, which is why short light is the default for most people.',
    backdropId: 'studio-grey',
    ratio: '5:1',
    camera: { position: [0, 1.55, 2.2], target: FACE, focalLength: 105, aperture: 4 },
    lights: [
      { id: 'key', name: 'Key · 90 cm', headId: 'godox-ad600pro', modifierId: 'rfi-3x3', optic: 'softbox', shape: 'square', position: [1.35, 2.1, 0.95], powerPercent: 17, width: 0.9, height: 0.9 },
      { id: 'fill', name: 'Fill · large, low', headId: 'godox-ad400pro', modifierId: 'rfi-3x4', optic: 'softbox', shape: 'square', position: [-1.3, 1.5, 1.8], powerPercent: 4, width: 0.9, height: 1.2 },
    ],
  },
  {
    id: 'fashion-hard',
    category: 'commercial',
    label: 'Crisp hard-fashion light',
    summary: 'Single bare head, high and frontal. Sharp shadows, saturated colour.',
    note: 'A deep parabolic or a bare reflector on axis and high. The shadow edge is the aesthetic — no fill, no diffusion, and the background sits close enough to take the shadow as part of the picture.',
    backdropId: 'blush',
    ratio: '6:1',
    camera: { position: [0, 1.5, 2.4], target: FACE, focalLength: 85, aperture: 8 },
    lights: [
      { id: 'key', name: 'Key · deep parabolic', headId: 'profoto-pro11-2400', modifierId: 'broncolor-para-133', optic: 'deep-parabolic', shape: 'round', position: [0, 2.75, 1.55], powerPercent: 8, width: 1.33, height: 1.33 },
    ],
  },
]

export const SETUP_CATEGORIES: SetupCategory[] = ['portrait', 'beauty', 'dramatic', 'commercial', 'cinematic']

export function getSetup(id: string) {
  return SETUP_LIBRARY.find((setup) => setup.id === id)
}

/** Expands a spec into a full light, filling in everything the scene needs. */
export function specToLight(spec: LightSpec, base: StudioLight): StudioLight {
  return {
    ...base,
    id: spec.id,
    name: spec.name,
    enabled: true,
    profileId: spec.headId,
    modifierId: spec.modifierId,
    optic: spec.optic,
    shape: spec.shape,
    softbox: spec.optic === 'softbox' || spec.optic === 'lantern',
    position: [...spec.position] as [number, number, number],
    target: [...(spec.target ?? FACE)] as [number, number, number],
    targetSubjectId: spec.target ? undefined : 'model',
    targetZone: spec.target ? undefined : 'face',
    powerPercent: spec.powerPercent,
    temperature: spec.temperature ?? (spec.mode === 'continuous' ? 5600 : 5600),
    gelId: spec.gelId ?? 'none',
    gridDegrees: spec.gridDegrees ?? null,
    grid: (spec.gridDegrees ?? null) !== null,
    operationMode: spec.mode ?? 'flash',
    modifierWidth: spec.width ?? 0.9,
    modifierHeight: spec.height ?? 0.9,
    beamAngle: spec.beamAngle ?? 75,
    groupId: undefined,
    locked: false,
  }
}
