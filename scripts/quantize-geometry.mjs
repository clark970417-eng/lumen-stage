/**
 * Narrows the vertex attributes that are stored wider than they mean.
 *
 * The Rocketbox exports come out of the converter with every attribute as
 * float32, which for three of them is simply the wrong container:
 *
 *   JOINTS_0    uint16 holding indices whose largest value across the cast is
 *               79. Core glTF accepts ubyte, and no actor has 256 bones.
 *   WEIGHTS_0   float32 holding four numbers in [0, 1]. Core glTF accepts
 *               ubyte normalized, which is what skinning uses on hardware
 *               anyway; the weights are requantised together so each vertex
 *               still sums to exactly 1 rather than to 0.996.
 *   TEXCOORD_n  float32 holding coordinates inside [0, 1]. Core glTF accepts
 *               ushort normalized: 1/65535 of a 2048 px map is 0.03 px.
 *
 * All three are plain glTF 2.0 — no KHR_mesh_quantization, no decoder, nothing
 * for the loader to opt into. POSITION and NORMAL are deliberately left alone:
 * they need the extension, and POSITION additionally needs its dequantisation
 * folded into a transform, which a skinned mesh has nowhere to put.
 *
 * A UV set that tiles (anything outside [0, 1]) is skipped rather than
 * clamped, because clamping it would silently move the texture.
 *
 *   node scripts/quantize-geometry.mjs <file.glb> [more.glb ...]
 *   node scripts/quantize-geometry.mjs --dry-run <file.glb>
 */
import { readFileSync, writeFileSync } from 'node:fs'

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }

function readGlb(file) {
  const buffer = readFileSync(file)
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB`)
  let offset = 12
  let json = null
  let bin = null
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset)
    const type = buffer.readUInt32LE(offset + 4)
    const body = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === JSON_CHUNK) json = JSON.parse(body.toString('utf8'))
    if (type === BIN_CHUNK) bin = body
    offset += 8 + length
  }
  if (!json || !bin) throw new Error(`${file} has no JSON or BIN chunk`)
  return { json, bin, size: buffer.length }
}

/** Pads to the four-byte boundary the glTF chunk layout requires. */
function pad(length, to, fill) {
  const short = (to - (length % to)) % to
  return short ? Buffer.alloc(short, fill) : Buffer.alloc(0)
}

function writeGlb(file, json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonPad = pad(jsonBytes.length, 4, 0x20)
  const binPad = pad(bin.length, 4, 0)
  const total = 12 + 8 + jsonBytes.length + jsonPad.length + 8 + bin.length + binPad.length
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(total, 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonBytes.length + jsonPad.length, 0)
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(bin.length + binPad.length, 0)
  binHeader.writeUInt32LE(BIN_CHUNK, 4)
  writeFileSync(file, Buffer.concat([header, jsonHeader, jsonBytes, jsonPad, binHeader, bin, binPad]))
}

/** Reads one accessor out of the binary as a flat array of numbers. */
function readAccessor(json, bin, accessor) {
  const view = json.bufferViews[accessor.bufferView]
  const components = COMPONENTS[accessor.type]
  const elementBytes = COMPONENT_BYTES[accessor.componentType]
  const stride = view.byteStride ?? components * elementBytes
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const out = new Float64Array(accessor.count * components)
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < components; c++) {
      const at = base + i * stride + c * elementBytes
      out[i * components + c] =
        accessor.componentType === 5126 ? bin.readFloatLE(at)
        : accessor.componentType === 5125 ? bin.readUInt32LE(at)
        : accessor.componentType === 5123 ? bin.readUInt16LE(at)
        : accessor.componentType === 5122 ? bin.readInt16LE(at)
        : accessor.componentType === 5121 ? bin.readUInt8(at)
        : bin.readInt8(at)
    }
  }
  return out
}

/**
 * Four weights to four bytes that still add to 255.
 *
 * Rounding each weight on its own leaves a vertex summing to 254 or 256, and
 * three does not renormalise: the skin quietly shrinks or swells around that
 * vertex. So round down, then hand the remaining counts to whichever weights
 * lost the most in the rounding.
 */
function quantizeWeights(values, out, at) {
  const scaled = values.map((v) => Math.max(0, Math.min(1, v)) * 255)
  const floors = scaled.map(Math.floor)
  let remainder = 255 - floors.reduce((sum, v) => sum + v, 0)
  const order = scaled
    .map((v, i) => ({ i, loss: v - floors[i] }))
    .sort((a, b) => b.loss - a.loss)
  for (const { i } of order) {
    if (remainder <= 0) break
    floors[i] += 1
    remainder -= 1
  }
  // A vertex with no weight at all cannot be fixed by redistribution; leave it
  // as the file had it rather than inventing an attachment.
  if (remainder > 0 && floors.every((v) => v === 0)) floors[0] = 255
  for (let c = 0; c < 4; c++) out.writeUInt8(Math.min(255, floors[c]), at + c)
}

function quantize(file, { dryRun = false } = {}) {
  const { json, bin, size } = readGlb(file)

  // What each accessor is read as. An accessor used two ways is left alone --
  // there is no encoding that is right for both.
  const role = new Map()
  const conflicted = new Set()
  const note = (index, name) => {
    if (role.has(index) && role.get(index) !== name) conflicted.add(index)
    role.set(index, name)
  }
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      for (const [name, index] of Object.entries(primitive.attributes)) note(index, name)
      if (primitive.indices !== undefined) note(primitive.indices, 'INDICES')
      for (const target of primitive.targets ?? []) {
        for (const index of Object.values(target)) note(index, 'MORPH')
      }
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) note(skin.inverseBindMatrices, 'IBM')
  }
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) {
      note(sampler.input, 'ANIM')
      note(sampler.output, 'ANIM')
    }
  }

  const plans = new Map()
  json.accessors.forEach((accessor, index) => {
    if (conflicted.has(index) || accessor.sparse || accessor.bufferView === undefined) return
    const name = role.get(index)
    if (name === 'JOINTS_0' && accessor.componentType === 5123) {
      if ((accessor.max ?? []).some((v) => v > 255)) return
      plans.set(index, { componentType: 5121, normalized: false, kind: 'joints' })
    } else if (name === 'WEIGHTS_0' && accessor.componentType === 5126) {
      plans.set(index, { componentType: 5121, normalized: true, kind: 'weights' })
    } else if (name?.startsWith('TEXCOORD') && accessor.componentType === 5126) {
      const min = accessor.min ?? []
      const max = accessor.max ?? []
      if (!min.length || !max.length) return
      if (min.some((v) => v < 0) || max.some((v) => v > 1)) return
      plans.set(index, { componentType: 5123, normalized: true, kind: 'uv' })
    }
  })

  if (!plans.size) return { file, skipped: true, before: size }

  // Each planned accessor owns its buffer view outright, which the cast does --
  // nothing here is interleaved. Anything shared would need the whole view
  // rebuilt, so refuse rather than corrupt it.
  const viewUsers = new Map()
  json.accessors.forEach((accessor) => {
    if (accessor.bufferView === undefined) return
    viewUsers.set(accessor.bufferView, (viewUsers.get(accessor.bufferView) ?? 0) + 1)
  })
  for (const index of plans.keys()) {
    if (viewUsers.get(json.accessors[index].bufferView) > 1) plans.delete(index)
  }
  if (!plans.size) return { file, skipped: true, before: size }

  const replacement = new Map()
  for (const [index, plan] of plans) {
    const accessor = json.accessors[index]
    const components = COMPONENTS[accessor.type]
    const values = readAccessor(json, bin, accessor)
    const width = COMPONENT_BYTES[plan.componentType] * components
    const out = Buffer.alloc(accessor.count * width)
    for (let i = 0; i < accessor.count; i++) {
      const at = i * width
      if (plan.kind === 'weights') {
        quantizeWeights([0, 1, 2, 3].map((c) => values[i * components + c]), out, at)
      } else {
        for (let c = 0; c < components; c++) {
          const v = values[i * components + c]
          if (plan.kind === 'joints') out.writeUInt8(Math.max(0, Math.min(255, Math.round(v))), at + c)
          else out.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(v * 65535))), at + c * 2)
        }
      }
    }
    replacement.set(accessor.bufferView, { bytes: out, stride: width })
  }

  // Rebuild the binary in the views' original order so the file still reads
  // sensibly in a hex dump, recording where each one landed.
  const order = json.bufferViews
    .map((view, index) => ({ view, index }))
    .sort((a, b) => (a.view.byteOffset ?? 0) - (b.view.byteOffset ?? 0))

  const pieces = []
  const moved = new Map()
  let cursor = 0
  for (const { view, index } of order) {
    const padding = pad(cursor, 4, 0)
    if (padding.length) {
      pieces.push(padding)
      cursor += padding.length
    }
    const swap = replacement.get(index)
    const bytes = swap ? swap.bytes : bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    pieces.push(bytes)
    moved.set(index, { offset: cursor, length: bytes.length, stride: swap?.stride })
    cursor += bytes.length
  }
  const rebuilt = Buffer.concat(pieces)

  json.bufferViews = json.bufferViews.map((view, index) => {
    const { offset, length, stride } = moved.get(index)
    const next = { ...view, byteOffset: offset, byteLength: length }
    if (stride !== undefined) next.byteStride = stride
    return next
  })
  for (const [index, plan] of plans) {
    const accessor = json.accessors[index]
    accessor.componentType = plan.componentType
    accessor.byteOffset = 0
    if (plan.normalized) accessor.normalized = true
    else delete accessor.normalized
    if (plan.kind === 'uv' || plan.kind === 'weights') {
      // min/max are stated in the accessor's own units, so they move with it.
      const scale = 65535
      if (plan.kind === 'uv') {
        accessor.min = accessor.min?.map((v) => Math.round(v * scale) / scale)
        accessor.max = accessor.max?.map((v) => Math.round(v * scale) / scale)
      } else {
        accessor.min = accessor.min?.map((v) => Math.round(v * 255) / 255)
        accessor.max = accessor.max?.map((v) => Math.round(v * 255) / 255)
      }
    }
  }
  json.buffers = [{ byteLength: rebuilt.length }]

  if (dryRun) {
    const after = 12 + 8 + Buffer.byteLength(JSON.stringify(json)) + 8 + rebuilt.length
    return { file, before: size, after, changed: plans.size }
  }
  writeGlb(file, json, rebuilt)
  return { file, before: size, after: readFileSync(file).length, changed: plans.size }
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
let saved = 0
for (const file of args.filter((a) => a !== '--dry-run')) {
  const result = quantize(file, { dryRun })
  const name = result.file.split('/').pop()
  if (result.skipped) {
    console.log(`  ${name.padEnd(38)} nothing to narrow`)
    continue
  }
  saved += result.before - result.after
  const pct = (100 * (result.before - result.after) / result.before).toFixed(1)
  console.log(
    `  ${name.padEnd(38)} ${(result.before / 1048576).toFixed(2)} -> ${(result.after / 1048576).toFixed(2)} MB  (-${pct}%, ${result.changed} accessors)`,
  )
}
if (saved) console.log(`\n  ${(saved / 1048576).toFixed(2)} MB removed${dryRun ? ' (dry run)' : ''}`)
