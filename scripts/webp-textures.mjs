/**
 * Moves the textures that genuinely need an alpha channel from PNG to WebP.
 *
 * Ten of the seventeen actors carry a PNG whose alpha is doing real work --
 * the hair cards, the eyelashes, the eyebrows, cut out of a MASK material
 * rather than modelled. `flatten-opaque-textures.mjs` handles the seven whose
 * alpha turned out to be entirely opaque; these are the ones it correctly
 * refuses, and between them they are 33.4 MB, a quarter of the whole site.
 *
 * WebP carries the alpha and costs about a quarter of the bytes: 9.2 MB at
 * quality 0.9. Measured against the originals, the alpha survives bit for bit
 * -- every texel identical, and not one crossing the 0.5 cutoff that decides
 * the silhouette -- and on the texels a MASK material actually draws, RGB is
 * out by a mean of 1 to 2 of 255.
 *
 * The cost is EXT_texture_webp, which the file then requires. three reads it
 * without a decoder or a support check, so for a web app this is close to
 * free; it does mean the GLB will not open in a tool that has never heard of
 * the extension. No PNG fallback is kept, because keeping one would keep the
 * bytes this exists to remove.
 *
 * Encoding happens elsewhere. Nothing on this machine writes WebP -- no cwebp,
 * no sharp, and sips declines -- so the images go out to a directory, get
 * encoded (Chrome's canvas encoder does it, as scripts/rocketbox-convert.html
 * already does for the models), and come back in:
 *
 *   node scripts/webp-textures.mjs --extract <dir> <file.glb ...>
 *   # encode <dir>/*.png to <dir>/*.webp, same basename
 *   node scripts/webp-textures.mjs --from <dir> [--dry-run] <file.glb ...>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { basename, join } from 'node:path'

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const EXTENSION = 'EXT_texture_webp'

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

/** True when an 8-bit RGBA PNG has at least one texel that is not fully opaque. */
function usesAlpha(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) return false
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (buffer[24] !== 8 || buffer[25] !== 6) return false

  let offset = 8
  const parts = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') parts.push(buffer.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
    if (type === 'IEND') break
  }
  const raw = inflateSync(Buffer.concat(parts))

  const bpp = 4
  const stride = width * bpp
  const previous = Buffer.alloc(stride)
  const current = Buffer.alloc(stride)
  let at = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[at++]
    raw.copy(current, 0, at, at + stride)
    at += stride
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? current[i - bpp] : 0
      const up = previous[i]
      const upLeft = i >= bpp ? previous[i - bpp] : 0
      let v = current[i]
      if (filter === 1) v += left
      else if (filter === 2) v += up
      else if (filter === 3) v += (left + up) >> 1
      else if (filter === 4) {
        const guess = left + up - upLeft
        const dl = Math.abs(guess - left)
        const du = Math.abs(guess - up)
        const dul = Math.abs(guess - upLeft)
        v += dl <= du && dl <= dul ? left : du <= dul ? up : upLeft
      }
      current[i] = v & 255
    }
    for (let x = 3; x < stride; x += 4) if (current[x] < 255) return true
    current.copy(previous)
  }
  return false
}

const stem = (file) => basename(file).replace(/\.glb$/, '')

/** Which images in this file are PNGs whose alpha is load-bearing. */
function candidates(json, bin) {
  const out = []
  for (const [index, image] of (json.images ?? []).entries()) {
    if (image.mimeType !== 'image/png' || image.bufferView === undefined) continue
    const view = json.bufferViews[image.bufferView]
    const png = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    if (usesAlpha(png)) out.push({ index, png })
  }
  return out
}

function extract(file, dir) {
  const { json, bin } = readGlb(file)
  const found = candidates(json, bin)
  for (const { index, png } of found) writeFileSync(join(dir, `${stem(file)}.${index}.png`), png)
  return found.map(({ index, png }) => ({ index, bytes: png.length }))
}

function apply(file, dir, { dryRun = false } = {}) {
  const { json, bin, size } = readGlb(file)
  const found = candidates(json, bin)

  const replacement = new Map()
  const missing = []
  for (const { index } of found) {
    const path = join(dir, `${stem(file)}.${index}.webp`)
    if (!existsSync(path)) {
      missing.push(path)
      continue
    }
    const webp = readFileSync(path)
    // RIFF....WEBP. A truncated or misnamed file here would replace a texture
    // with something the browser silently fails to decode.
    if (webp.toString('ascii', 0, 4) !== 'RIFF' || webp.toString('ascii', 8, 12) !== 'WEBP') {
      throw new Error(`${path} is not a WebP`)
    }
    replacement.set(json.images[index].bufferView, webp)
    json.images[index] = { ...json.images[index], mimeType: 'image/webp' }
  }
  if (missing.length) return { file, skipped: true, before: size, missing }
  if (!replacement.size) return { file, skipped: true, before: size, missing: [] }

  // The texture stops naming its image directly and names it through the
  // extension instead. No fallback source: keeping a PNG beside it would keep
  // the bytes this is here to remove, which is also why the extension goes in
  // extensionsRequired.
  const converted = new Set(found.map(({ index }) => index))
  for (const texture of json.textures ?? []) {
    if (!converted.has(texture.source)) continue
    texture.extensions = { ...texture.extensions, [EXTENSION]: { source: texture.source } }
    delete texture.source
  }
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), EXTENSION])]
  json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), EXTENSION])]

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
    const bytes = swap ?? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    pieces.push(bytes)
    moved.set(index, { offset: cursor, length: bytes.length })
    cursor += bytes.length
  }
  const rebuilt = Buffer.concat(pieces)
  json.bufferViews = json.bufferViews.map((view, index) => ({
    ...view,
    byteOffset: moved.get(index).offset,
    byteLength: moved.get(index).length,
  }))
  json.buffers = [{ byteLength: rebuilt.length }]

  if (dryRun) {
    return { file, before: size, after: 12 + 8 + Buffer.byteLength(JSON.stringify(json)) + 8 + rebuilt.length }
  }
  writeGlb(file, json, rebuilt)
  return { file, before: size, after: readFileSync(file).length }
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const extractAt = args.indexOf('--extract')
const fromAt = args.indexOf('--from')
const dir = extractAt >= 0 ? args[extractAt + 1] : fromAt >= 0 ? args[fromAt + 1] : null
if (!dir) {
  console.error('give either --extract <dir> or --from <dir>')
  process.exit(1)
}
const files = args.filter((a, i) => a.endsWith('.glb') && i !== extractAt + 1 && i !== fromAt + 1)

if (extractAt >= 0) {
  let total = 0
  for (const file of files) {
    for (const { index, bytes } of extract(file, dir)) {
      total += bytes
      console.log(`  ${(stem(file) + '.' + index).padEnd(40)} ${(bytes / 1048576).toFixed(2)} MB`)
    }
  }
  console.log(`\n  ${(total / 1048576).toFixed(2)} MB written to ${dir}`)
} else {
  let saved = 0
  for (const file of files) {
    const result = apply(file, dir, { dryRun })
    const name = basename(result.file)
    if (result.skipped) {
      console.log(`  ${name.padEnd(38)} ${result.missing.length ? 'not encoded yet: ' + result.missing.join(', ') : 'nothing with alpha'}`)
      continue
    }
    saved += result.before - result.after
    console.log(`  ${name.padEnd(38)} ${(result.before / 1048576).toFixed(2)} -> ${(result.after / 1048576).toFixed(2)} MB`)
  }
  if (saved) console.log(`\n  ${(saved / 1048576).toFixed(2)} MB removed${dryRun ? ' (dry run)' : ''}`)
}
