/**
 * Re-encodes the PNGs whose alpha channel says nothing.
 *
 * Every actor carries one PNG, and it is always the base colour of a MASK
 * material -- the hair cards, the eyelashes, the eyebrows, the parts that are
 * cut out rather than modelled. For most of the cast that alpha is doing real
 * work and the PNG has to stay.
 *
 * For seven of them it is not. Those actors have modelled hair, nothing is cut
 * out, and every one of the 1024x1024 alpha bytes is 255. That is a megabyte
 * and a half of lossless RGB carried in a container chosen for a transparency
 * that does not exist, on a model whose skin and clothing already ship as
 * JPEG. Re-encoded at quality 95 -- higher than the JPEGs already beside it --
 * each drops to about 300 KB.
 *
 * The alpha is checked rather than assumed, by inflating the image and reading
 * every alpha byte. Anything with a single texel below 255 is left alone: this
 * script cannot tell a deliberate cutout from a rounding artefact, so it does
 * not try. The material keeps its MASK mode, which passes everything once the
 * texture has no alpha to test.
 *
 * Uses macOS sips as the encoder.
 *
 *   node scripts/flatten-opaque-textures.mjs <file.glb> [more.glb ...]
 *   node scripts/flatten-opaque-textures.mjs --dry-run <file.glb>
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

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

/**
 * The lowest alpha byte in an 8-bit RGBA PNG, or null if it is not one.
 *
 * Undoing the row filters is the whole of PNG decoding that matters here --
 * every filter is defined against the pixel to the left and the row above, so
 * the alpha bytes cannot be read without reconstructing the colour bytes too.
 */
function minimumAlpha(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (buffer[24] !== 8 || buffer[25] !== 6) return null

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
  let lowest = 255
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
    for (let x = 3; x < stride; x += 4) if (current[x] < lowest) lowest = current[x]
    current.copy(previous)
  }
  return { lowest, width, height }
}

function encodeJpeg(png, quality, scratch) {
  const source = join(scratch, 'source.png')
  const target = join(scratch, 'target.jpg')
  writeFileSync(source, png)
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), source, '--out', target], {
    stdio: 'ignore',
  })
  return readFileSync(target)
}

function flatten(file, { dryRun = false, quality = 95 } = {}) {
  const { json, bin, size } = readGlb(file)
  const scratch = mkdtempSync(join(tmpdir(), 'lumen-tex-'))
  try {
    const replacement = new Map()
    const report = []
    for (const [index, image] of (json.images ?? []).entries()) {
      if (image.mimeType !== 'image/png' || image.bufferView === undefined) continue
      const view = json.bufferViews[image.bufferView]
      const png = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
      const alpha = minimumAlpha(png)
      if (!alpha) continue
      if (alpha.lowest < 255) {
        report.push(`image ${index} keeps its alpha (lowest ${alpha.lowest})`)
        continue
      }
      const jpeg = encodeJpeg(png, quality, scratch)
      replacement.set(image.bufferView, jpeg)
      json.images[index] = { ...image, mimeType: 'image/jpeg' }
      report.push(`image ${index} ${alpha.width}x${alpha.height} ${(png.length / 1048576).toFixed(2)} -> ${(jpeg.length / 1048576).toFixed(2)} MB`)
    }
    if (!replacement.size) return { file, skipped: true, before: size, report }

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
      const after = 12 + 8 + Buffer.byteLength(JSON.stringify(json)) + 8 + rebuilt.length
      return { file, before: size, after, report }
    }
    writeGlb(file, json, rebuilt)
    return { file, before: size, after: readFileSync(file).length, report }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
let saved = 0
for (const file of args.filter((a) => a !== '--dry-run')) {
  const result = flatten(file, { dryRun })
  const name = result.file.split('/').pop()
  if (result.skipped) {
    console.log(`  ${name.padEnd(38)} ${result.report.join('; ') || 'no png'}`)
    continue
  }
  saved += result.before - result.after
  console.log(`  ${name.padEnd(38)} ${(result.before / 1048576).toFixed(2)} -> ${(result.after / 1048576).toFixed(2)} MB`)
}
if (saved) console.log(`\n  ${(saved / 1048576).toFixed(2)} MB removed${dryRun ? ' (dry run)' : ''}`)
