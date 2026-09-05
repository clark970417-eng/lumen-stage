/**
 * Removes COLOR_0 from a GLB.
 *
 * The Rocketbox exports carry a vertex colour per vertex, VEC3 float, and every
 * one of them is white: across the twelve actors that ship them, 285 of ten
 * million components differ from 1.0, and those by float rounding. White vertex
 * colours multiply to nothing, so the data describes no part of the picture —
 * but three's GLTFLoader still sets `vertexColors` on the material when the
 * attribute is present, and the bytes still have to be downloaded.
 *
 * Five of the shipped actors ship no COLOR_0 at all and render identically,
 * which is the check that says this is safe rather than merely small.
 *
 *   node scripts/strip-vertex-colors.mjs <file.glb> [more.glb ...]
 */
import { readFileSync, writeFileSync } from 'node:fs'

const JSON_CHUNK = 0x4E4F534A
const BIN_CHUNK = 0x004E4942

function readGlb(file) {
  const buffer = readFileSync(file)
  if (buffer.readUInt32LE(0) !== 0x46546C67) throw new Error(`${file} is not a GLB`)
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
  return { json, bin }
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
  const out = Buffer.alloc(12)
  out.writeUInt32LE(0x46546C67, 0)
  out.writeUInt32LE(2, 4)
  out.writeUInt32LE(total, 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonBytes.length + jsonPad.length, 0)
  jsonHeader.writeUInt32LE(JSON_CHUNK, 4)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(bin.length + binPad.length, 0)
  binHeader.writeUInt32LE(BIN_CHUNK, 4)
  writeFileSync(file, Buffer.concat([out, jsonHeader, jsonBytes, jsonPad, binHeader, bin, binPad]))
}

function strip(file) {
  const { json, bin } = readGlb(file)
  const before = readFileSync(file).length

  // Which accessors are read as vertex colour, and which are read as anything
  // else. A buffer view is only removable when nothing but colour points into
  // it — these exports give each its own, but that is a fact to check rather
  // than assume.
  const colourAccessors = new Set()
  const keptAccessors = new Set()
  const note = (index, colour) => (colour ? colourAccessors : keptAccessors).add(index)
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      for (const [name, index] of Object.entries(primitive.attributes)) note(index, name === 'COLOR_0')
      if (primitive.indices !== undefined) note(primitive.indices, false)
      for (const target of primitive.targets ?? []) for (const index of Object.values(target)) note(index, false)
    }
  }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) note(skin.inverseBindMatrices, false)
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) { note(sampler.input, false); note(sampler.output, false) }
  }

  const dropAccessors = new Set([...colourAccessors].filter((index) => !keptAccessors.has(index)))
  if (!dropAccessors.size) return { file, skipped: true }

  const colourViews = new Set([...dropAccessors].map((index) => json.accessors[index].bufferView))
  const keptViews = new Set()
  json.accessors.forEach((accessor, index) => {
    if (dropAccessors.has(index)) return
    if (accessor.bufferView !== undefined) keptViews.add(accessor.bufferView)
    // A sparse accessor keeps its indices and values in buffer views of their
    // own, and says nothing about them in `bufferView`. The morph targets here
    // are sparse — scripts/shrink-morphs.mjs made them so — and missing these
    // left every blendshape pointing at a view that had been renumbered out
    // from under it.
    if (accessor.sparse) {
      keptViews.add(accessor.sparse.indices.bufferView)
      keptViews.add(accessor.sparse.values.bufferView)
    }
  })
  for (const image of json.images ?? []) if (image.bufferView !== undefined) keptViews.add(image.bufferView)
  const dropViews = new Set([...colourViews].filter((view) => !keptViews.has(view)))

  // Rebuild the binary from the views that survive, in their original order so
  // the file stays readable in a hex dump, and record where each one moved to.
  const order = json.bufferViews
    .map((view, index) => ({ view, index }))
    .filter(({ index }) => !dropViews.has(index))
    .sort((a, b) => (a.view.byteOffset ?? 0) - (b.view.byteOffset ?? 0))

  const pieces = []
  const viewOffset = new Map()
  let cursor = 0
  for (const { view, index } of order) {
    const padding = pad(cursor, 4, 0)
    if (padding.length) { pieces.push(padding); cursor += padding.length }
    const start = view.byteOffset ?? 0
    pieces.push(bin.subarray(start, start + view.byteLength))
    viewOffset.set(index, cursor)
    cursor += view.byteLength
  }
  const rebuilt = Buffer.concat(pieces)

  const viewIndex = new Map()
  const bufferViews = []
  for (const { view, index } of order.slice().sort((a, b) => a.index - b.index)) {
    viewIndex.set(index, bufferViews.length)
    bufferViews.push({ ...view, byteOffset: viewOffset.get(index) })
  }

  const accessorIndex = new Map()
  const accessors = []
  json.accessors.forEach((accessor, index) => {
    if (dropAccessors.has(index)) return
    accessorIndex.set(index, accessors.length)
    const moved = { ...accessor }
    if (accessor.bufferView !== undefined) moved.bufferView = viewIndex.get(accessor.bufferView)
    if (accessor.sparse) {
      moved.sparse = {
        ...accessor.sparse,
        indices: { ...accessor.sparse.indices, bufferView: viewIndex.get(accessor.sparse.indices.bufferView) },
        values: { ...accessor.sparse.values, bufferView: viewIndex.get(accessor.sparse.values.bufferView) },
      }
    }
    accessors.push(moved)
  })

  const remap = (index) => accessorIndex.get(index)
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      delete primitive.attributes.COLOR_0
      primitive.attributes = Object.fromEntries(
        Object.entries(primitive.attributes).map(([name, index]) => [name, remap(index)]))
      if (primitive.indices !== undefined) primitive.indices = remap(primitive.indices)
      primitive.targets = primitive.targets?.map((target) =>
        Object.fromEntries(Object.entries(target).map(([name, index]) => [name, remap(index)])))
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = remap(skin.inverseBindMatrices)
  }
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) { sampler.input = remap(sampler.input); sampler.output = remap(sampler.output) }
  }
  for (const image of json.images ?? []) {
    if (image.bufferView !== undefined) image.bufferView = viewIndex.get(image.bufferView)
  }

  json.accessors = accessors
  json.bufferViews = bufferViews
  json.buffers = [{ byteLength: rebuilt.length }]

  writeGlb(file, json, rebuilt)
  const after = readFileSync(file).length
  return { file, before, after, views: dropViews.size }
}

let saved = 0
for (const file of process.argv.slice(2)) {
  const result = strip(file)
  const name = result.file.split('/').pop()
  if (result.skipped) { console.log(`  ${name.padEnd(38)} no vertex colours`); continue }
  saved += result.before - result.after
  console.log(`  ${name.padEnd(38)} ${(result.before / 1048576).toFixed(2)} -> ${(result.after / 1048576).toFixed(2)} MB`)
}
if (saved) console.log(`\n  ${(saved / 1048576).toFixed(2)} MB removed`)
