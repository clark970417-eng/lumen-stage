/**
 * Rewrites a GLB's morph targets as sparse accessors.
 *
 * glTF stores a morph target as a delta for every vertex in the mesh, whether
 * that vertex moves or not. A face blendshape on a whole body moves very few of
 * them, and the FBX these actors came from leaves float noise on most of the
 * rest: measured across the shipped pair, 56% of the deltas are exactly zero,
 * another 42% move less than a micron, and only about 2% move far enough to see
 * on a 1.74 m figure. That data was 58-66% of each file.
 *
 * So the deltas below a threshold are dropped and the rest stored as a sparse
 * accessor, which is what sparse accessors are for. Nothing about the rendered
 * shape changes; a tenth of a millimetre of movement is not on the screen.
 *
 *   node scripts/shrink-morphs.mjs public/models/lumen-human/*.glb
 *
 * Writes in place unless --out=<dir> is given.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/** Model units are centimetres, so this is ten microns. */
const DEFAULT_THRESHOLD = 1e-3

const args = process.argv.slice(2)
const files = args.filter((a) => !a.startsWith('--'))
const flag = (name, fallback) => {
  const found = args.find((a) => a.startsWith(`--${name}=`))
  return found ? found.slice(name.length + 3) : fallback
}
const threshold = Number(flag('threshold', DEFAULT_THRESHOLD))
const outDir = flag('out', null)

const align4 = (n) => (n + 3) & ~3

function parse(glb) {
  if (glb.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB')
  const jsonLength = glb.readUInt32LE(12)
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString())
  const binHeader = 20 + jsonLength
  const binLength = glb.readUInt32LE(binHeader)
  const bin = glb.subarray(binHeader + 8, binHeader + 8 + binLength)
  return { json, bin }
}

function build(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonPad = Buffer.alloc(align4(jsonBuf.length) - jsonBuf.length, 0x20)
  const binPad = Buffer.alloc(align4(bin.length) - bin.length, 0)
  const jsonChunk = Buffer.concat([jsonBuf, jsonPad])
  const binChunk = Buffer.concat([bin, binPad])
  const header = Buffer.alloc(12)
  header.write('glTF', 0, 'ascii')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonChunk.length, 0)
  jsonHeader.write('JSON', 4, 'ascii')
  const binHeaderBuf = Buffer.alloc(8)
  binHeaderBuf.writeUInt32LE(binChunk.length, 0)
  binHeaderBuf.write('BIN\0', 4, 'ascii')
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeaderBuf, binChunk])
}

for (const file of files) {
  const source = readFileSync(file)
  const { json, bin } = parse(source)

  // Which accessors are morph target positions, and the views they own.
  const morph = new Set()
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      for (const target of primitive.targets ?? []) {
        if (target.POSITION !== undefined) morph.add(target.POSITION)
      }
    }
  }
  const usedBy = new Map()
  json.accessors.forEach((a, i) => {
    if (a.bufferView === undefined) return
    if (!usedBy.has(a.bufferView)) usedBy.set(a.bufferView, [])
    usedBy.get(a.bufferView).push(i)
  })
  for (const image of json.images ?? []) {
    if (image.bufferView === undefined) continue
    if (!usedBy.has(image.bufferView)) usedBy.set(image.bufferView, [])
    usedBy.get(image.bufferView).push('image')
  }
  // Only rewrite a target whose view carries nothing else.
  const convert = [...morph].filter((i) => {
    const view = json.accessors[i].bufferView
    return view !== undefined && usedBy.get(view).every((user) => user === i)
  })
  const retired = new Set(convert.map((i) => json.accessors[i].bufferView))

  const chunks = []
  let offset = 0
  const push = (buffer) => {
    const pad = align4(offset) - offset
    if (pad) { chunks.push(Buffer.alloc(pad, 0)); offset += pad }
    const at = offset
    chunks.push(buffer)
    offset += buffer.length
    return at
  }

  // Keep every view that is still carrying something, in order.
  const remap = new Map()
  const views = []
  json.bufferViews.forEach((view, index) => {
    if (retired.has(index)) return
    const start = view.byteOffset ?? 0
    const at = push(Buffer.from(bin.subarray(start, start + view.byteLength)))
    remap.set(index, views.length)
    views.push({ ...view, buffer: 0, byteOffset: at })
  })

  let before = 0
  let kept = 0
  let total = 0
  for (const index of convert) {
    const accessor = json.accessors[index]
    const view = json.bufferViews[accessor.bufferView]
    before += view.byteLength
    const stride = view.byteStride ?? 12
    const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const indices = []
    const values = []
    const min = [0, 0, 0]
    const max = [0, 0, 0]
    for (let v = 0; v < accessor.count; v += 1) {
      const at = base + v * stride
      const x = bin.readFloatLE(at)
      const y = bin.readFloatLE(at + 4)
      const z = bin.readFloatLE(at + 8)
      total += 1
      if (Math.abs(x) < threshold && Math.abs(y) < threshold && Math.abs(z) < threshold) continue
      indices.push(v)
      values.push(x, y, z)
      min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z)
      max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z)
    }
    kept += indices.length
    delete accessor.bufferView
    delete accessor.byteOffset
    accessor.min = min
    accessor.max = max
    if (indices.length === 0) {
      // An accessor with neither a view nor a sparse block reads as all zeros.
      delete accessor.sparse
      continue
    }
    const indexAt = push(Buffer.from(Uint32Array.from(indices).buffer))
    const indexView = views.push({ buffer: 0, byteOffset: indexAt, byteLength: indices.length * 4 }) - 1
    const valueAt = push(Buffer.from(Float32Array.from(values).buffer))
    const valueView = views.push({ buffer: 0, byteOffset: valueAt, byteLength: values.length * 4 }) - 1
    accessor.sparse = {
      count: indices.length,
      indices: { bufferView: indexView, byteOffset: 0, componentType: 5125 },
      values: { bufferView: valueView, byteOffset: 0 },
    }
  }

  // Every remaining reference has to follow the views to their new places.
  const point = (holder, key) => {
    if (holder && holder[key] !== undefined) holder[key] = remap.get(holder[key])
  }
  for (const accessor of json.accessors) point(accessor, 'bufferView')
  for (const image of json.images ?? []) point(image, 'bufferView')

  json.bufferViews = views
  const outBin = Buffer.concat(chunks)
  json.buffers = [{ byteLength: outBin.length }]
  const out = build(json, outBin)
  const target = outDir ? join(outDir, basename(file)) : file
  writeFileSync(target, out)
  const mb = (bytes) => (bytes / 1048576).toFixed(2)
  if (!convert.length) {
    console.log(`${basename(file)}  nothing to convert — no morph targets, or already sparse`)
    continue
  }
  console.log(`${basename(file)}  morph ${mb(before)} MB -> ${mb(kept * 16)} MB, kept ${(kept / total * 100).toFixed(1)}% of deltas`)
  console.log(`   file ${mb(source.length)} MB -> ${mb(out.length)} MB`)
}
