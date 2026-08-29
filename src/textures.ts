/**
 * Procedural surface detail.
 *
 * Flat colour is the reason a generated body reads as plastic: real skin
 * breaks a specular highlight into thousands of tiny facets, and a softbox is
 * mostly specular. So every surface here gets a normal map and a roughness map
 * generated at load — no downloads, no licensing, and they scale with whatever
 * colour the user picks.
 *
 * Everything is cached by key; a texture is built at most once per session.
 */

import * as THREE from 'three'

const cache = new Map<string, THREE.Texture>()

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)

/** Deterministic hash noise — no Math.random, so a scene renders the same twice. */
function hash2(x: number, y: number, seed: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
  return n - Math.floor(n)
}

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

function fbm(x: number, y: number, octaves: number, seed: number) {
  let sum = 0
  let amplitude = 0.5
  let frequency = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, y * frequency, seed + i * 17) * amplitude
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2.07
  }
  return sum / norm
}

function makeCanvas(size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return canvas
}

function finish(canvas: HTMLCanvasElement, repeat: number, srgb = false) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeat, repeat)
  texture.anisotropy = 8
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/** Sobel-converts a height field into a tangent-space normal map. */
function heightToNormal(height: Float32Array, size: number, strength: number, repeat: number) {
  const canvas = makeCanvas(size)
  const context = canvas.getContext('2d')!
  const image = context.createImageData(size, size)
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const length = Math.hypot(dx, dy, 1)
      const index = (y * size + x) * 4
      image.data[index] = ((-dx / length) * 0.5 + 0.5) * 255
      image.data[index + 1] = ((-dy / length) * 0.5 + 0.5) * 255
      image.data[index + 2] = (1 / length * 0.5 + 0.5) * 255
      image.data[index + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  return finish(canvas, repeat)
}

function grayscale(values: Float32Array, size: number, repeat: number) {
  const canvas = makeCanvas(size)
  const context = canvas.getContext('2d')!
  const image = context.createImageData(size, size)
  for (let i = 0; i < values.length; i++) {
    const level = clamp01(values[i]) * 255
    image.data[i * 4] = level
    image.data[i * 4 + 1] = level
    image.data[i * 4 + 2] = level
    image.data[i * 4 + 3] = 255
  }
  context.putImageData(image, 0, 0)
  return finish(canvas, repeat)
}

function cached(key: string, build: () => THREE.Texture) {
  const existing = cache.get(key)
  if (existing) return existing
  const texture = build()
  cache.set(key, texture)
  return texture
}

// ---------------------------------------------------------------------------
// Skin
// ---------------------------------------------------------------------------

const SKIN_SIZE = 512

function skinHeight() {
  const size = SKIN_SIZE
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      // Two scales: pores at high frequency, the coarser dermal ripple under it.
      const pores = fbm(u * 190, v * 190, 2, 3)
      const dermal = fbm(u * 26, v * 26, 3, 11)
      height[y * size + x] = pores * 0.72 + dermal * 0.28
    }
  }
  return height
}

/** Pore-level normal map. One map serves every skin tone — tone is albedo. */
export function skinNormalMap() {
  return cached('skin-normal', () => heightToNormal(skinHeight(), SKIN_SIZE, 1.5, 5))
}

/**
 * Skin roughness.
 *
 * Real skin is not uniformly rough — sebum makes some patches glossy. Feeding
 * that variation in is what turns one flat specular blob into the broken
 * highlight a beauty dish actually produces.
 */
export function skinRoughnessMap() {
  return cached('skin-roughness', () => {
    const size = SKIN_SIZE
    const values = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size
        const v = y / size
        const patch = fbm(u * 9, v * 9, 3, 29)
        const fine = fbm(u * 120, v * 120, 2, 5)
        values[y * size + x] = 0.42 + patch * 0.46 + fine * 0.12
      }
    }
    return grayscale(values, size, 5)
  })
}

// ---------------------------------------------------------------------------
// Fabric
// ---------------------------------------------------------------------------

export type FabricKind = 'cotton' | 'silk' | 'leather' | 'wool' | 'denim' | 'linen' | 'satin' | 'velvet'

/** Weave geometry, per fabric. A twill runs diagonally; a plain weave does not. */
export function fabricNormalMap(kind: FabricKind) {
  return cached(`fabric-normal-${kind}`, () => {
    const size = 512
    const height = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size
        const v = y / size
        let value = 0
        if (kind === 'cotton' || kind === 'linen') {
          const warp = Math.sin(u * Math.PI * 2 * 90) * 0.5 + 0.5
          const weft = Math.sin(v * Math.PI * 2 * 90) * 0.5 + 0.5
          const slub = kind === 'linen' ? fbm(u * 40, v * 8, 2, 7) * 0.5 : 0
          value = warp * 0.4 + weft * 0.4 + slub + fbm(u * 60, v * 60, 2, 13) * 0.2
        } else if (kind === 'denim') {
          // 3/1 twill: the diagonal is the whole look.
          const twill = Math.sin((u * 110 + v * 110) * Math.PI) * 0.5 + 0.5
          value = twill * 0.7 + fbm(u * 70, v * 70, 2, 19) * 0.3
        } else if (kind === 'silk' || kind === 'satin') {
          const warp = Math.sin(v * Math.PI * 2 * 160) * 0.5 + 0.5
          value = warp * 0.25 + fbm(u * 6, v * 6, 3, 23) * 0.75
        } else if (kind === 'wool') {
          value = fbm(u * 34, v * 34, 4, 31) * 0.8 + fbm(u * 120, v * 120, 2, 37) * 0.2
        } else if (kind === 'velvet') {
          value = fbm(u * 200, v * 200, 2, 41) * 0.6 + fbm(u * 20, v * 20, 3, 43) * 0.4
        } else {
          // Leather: irregular cells with a fine grain over them.
          const cells = fbm(u * 22, v * 22, 3, 47)
          value = cells * 0.72 + fbm(u * 150, v * 150, 2, 53) * 0.28
        }
        height[y * size + x] = value
      }
    }
    const strength = kind === 'silk' || kind === 'satin' ? 0.5 : kind === 'leather' ? 1.6 : kind === 'velvet' ? 0.9 : 1.3
    return heightToNormal(height, size, strength, kind === 'silk' || kind === 'satin' ? 6 : 10)
  })
}

export function fabricRoughnessMap(kind: FabricKind) {
  return cached(`fabric-roughness-${kind}`, () => {
    const size = 256
    const values = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size
        const v = y / size
        const base = kind === 'silk' || kind === 'satin' ? 0.28 : kind === 'leather' ? 0.40 : kind === 'velvet' ? 0.70 : 0.78
        values[y * size + x] = base + fbm(u * 24, v * 24, 3, 59) * 0.22
      }
    }
    return grayscale(values, size, kind === 'silk' || kind === 'satin' ? 6 : 10)
  })
}

// ---------------------------------------------------------------------------
// Hair
// ---------------------------------------------------------------------------

/** Strand-direction normals. Anisotropy is what makes a hair light read as hair. */
export function hairNormalMap() {
  return cached('hair-normal', () => {
    const size = 512
    const height = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size
        const v = y / size
        // Strands run down V, wandering slightly in U.
        const drift = fbm(u * 5, v * 2, 2, 61) * 0.06
        const strand = Math.sin((u + drift) * Math.PI * 2 * 220) * 0.5 + 0.5
        const clump = fbm((u + drift) * 30, v * 3, 3, 67)
        height[y * size + x] = strand * 0.55 + clump * 0.45
      }
    }
    return heightToNormal(height, size, 2.2, 3)
  })
}

// ---------------------------------------------------------------------------
// Sets and surfaces
// ---------------------------------------------------------------------------

/** Seamless paper: near-flat, with the faint tooth that catches a raking key. */
export function paperNormalMap() {
  return cached('paper-normal', () => {
    const size = 512
    const height = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        height[y * size + x] = fbm(x / size * 150, y / size * 150, 2, 71) * 0.6 + fbm(x / size * 12, y / size * 12, 2, 73) * 0.4
      }
    }
    return heightToNormal(height, size, 0.35, 4)
  })
}

/** Painted plaster — the standard cyc wall. */
export function plasterNormalMap() {
  return cached('plaster-normal', () => {
    const size = 512
    const height = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        height[y * size + x] = fbm(x / size * 44, y / size * 44, 4, 79)
      }
    }
    return heightToNormal(height, size, 0.9, 6)
  })
}

export function canvasNormalMap() {
  return cached('canvas-normal', () => {
    const size = 512
    const height = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size
        const v = y / size
        const weave = (Math.sin(u * Math.PI * 2 * 46) * 0.5 + 0.5) * (Math.sin(v * Math.PI * 2 * 46) * 0.5 + 0.5)
        // Painted muslin is mottled by the dye as much as by the weave.
        height[y * size + x] = weave * 0.35 + fbm(u * 7, v * 7, 4, 83) * 0.65
      }
    }
    return heightToNormal(height, size, 1.4, 3)
  })
}

/** Mottled dye pattern for a painted backdrop, as a colour multiplier. */
export function mottleMap() {
  return cached('mottle', () => {
    const size = 512
    const values = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size
        const v = y / size
        values[y * size + x] = 0.55 + fbm(u * 4, v * 4, 4, 89) * 0.72
      }
    }
    const texture = grayscale(values, size, 1)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  })
}

export function woodNormalMap() {
  return cached('wood-normal', () => {
    const size = 512
    const height = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size
        const v = y / size
        const rings = Math.sin((v * 18 + fbm(u * 3, v * 6, 3, 97) * 6) * Math.PI * 2) * 0.5 + 0.5
        height[y * size + x] = rings * 0.6 + fbm(u * 90, v * 12, 2, 101) * 0.4
      }
    }
    return heightToNormal(height, size, 1.1, 4)
  })
}

export function concreteNormalMap() {
  return cached('concrete-normal', () => {
    const size = 512
    const height = new Float32Array(size * size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        height[y * size + x] = fbm(x / size * 18, y / size * 18, 5, 103)
      }
    }
    return heightToNormal(height, size, 1.7, 3)
  })
}

export function brickNormalMap() {
  return cached('brick-normal', () => {
    const size = 512
    const height = new Float32Array(size * size)
    const rows = 12
    const cols = 6
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const row = Math.floor(y / size * rows)
        const offset = row % 2 === 0 ? 0 : 0.5
        const u = (x / size * cols + offset) % 1
        const v = (y / size * rows) % 1
        const mortarU = u < 0.035 || u > 0.965
        const mortarV = v < 0.09 || v > 0.91
        const face = mortarU || mortarV ? 0.1 : 0.85
        height[y * size + x] = face + fbm(x / size * 70, y / size * 70, 3, 107) * 0.15
      }
    }
    return heightToNormal(height, size, 2.4, 2)
  })
}

/** Releases everything. Called when the scene tears down. */
export function disposeTextures() {
  cache.forEach((texture) => texture.dispose())
  cache.clear()
}
