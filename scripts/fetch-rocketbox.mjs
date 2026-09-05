/**
 * Fetches the source files one Rocketbox avatar needs, into rocketbox-src/.
 *
 * Not into public/: Vite copies everything there into the build, and that is
 * how 306 MB of FBX and TGA once reached the deployed site. A dev-only plugin
 * in vite.config.ts gives the converters a URL to read these from instead.
 *
 * Avatars are not all laid out the same way. Most carry a body map and a head
 * map, about half also carry a lash-and-hair atlas, and forty of them carry
 * further parts — a helmet, a keffiyeh, a stethoscope — each of which is its
 * own material on the mesh and its own map on disk. Some of those maps also
 * come in colourways (`_color_blue`, `_color_acu`). So rather than guess at
 * filenames, this reads the avatar's own Textures listing and writes what it
 * found to <prefix>.parts.json for the converter to follow.
 *
 *   node scripts/fetch-rocketbox.mjs Adults/Male_Adult_19
 */
import { mkdir, writeFile, access } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const REPO = 'microsoft/Microsoft-Rocketbox'
const RAW = `https://raw.githubusercontent.com/${REPO}/master/Assets/Avatars`
const API = `https://api.github.com/repos/${REPO}/contents/Assets/Avatars`
const DEST = 'rocketbox-src'

const spec = process.argv[2]
if (!spec || !spec.includes('/')) {
  console.error('usage: node scripts/fetch-rocketbox.mjs <Category>/<Avatar_Name>')
  process.exit(1)
}
const name = spec.split('/').pop()

const exists = (file) => access(file).then(() => true, () => false)

async function grab(url, file) {
  if (await exists(file)) return 'cached'
  const response = await fetch(url)
  if (!response.ok) return `HTTP ${response.status}`
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file))
  return 'ok'
}

await mkdir(DEST, { recursive: true })

const fbx = `${DEST}/${name}.fbx`
console.log(`${name}.fbx  ${await grab(`${RAW}/${spec}/Export/${name}_facial.fbx`, fbx)}`)

const listing = await fetch(`${API}/${spec}/Textures`).then((r) => r.json())
if (!Array.isArray(listing)) {
  console.error('no Textures listing:', listing.message)
  process.exit(1)
}

// `<prefix>_<part>_color[_variant].tga`, or `<prefix>_color.tga` on the one
// avatar whose robe covers it so completely that it ships a single map.
const parts = {}
let prefix = null
for (const entry of listing) {
  const match = entry.name.match(/^([a-z]+\d+)_(?:(.+)_)?color(?:_[a-z]+)?\.tga$/i)
  if (!match) continue
  prefix ??= match[1]
  const part = match[2] ?? 'body'
  // First colourway wins; they are the same garment in another shade.
  if (parts[part]) continue
  parts[part] = entry.name
  console.log(`  ${part.padEnd(14)} ${entry.name}  ${await grab(`${RAW}/${spec}/Textures/${entry.name}`, `${DEST}/${entry.name}`)}`)
}

await writeFile(`${DEST}/${prefix}.parts.json`, JSON.stringify({ avatar: name, prefix, parts }, null, 2))
console.log(`prefix ${prefix}, parts: ${Object.keys(parts).join(', ')}`)
