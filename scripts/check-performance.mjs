import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = new URL('..', import.meta.url)
const budget = JSON.parse(await readFile(new URL('performance-budget.json', root), 'utf8'))
const assetsDir = new URL('dist/assets/', root)
const assetsPath = fileURLToPath(assetsDir)
const files = await readdir(assetsDir)

async function sizesFor(extension) {
  const matches = files.filter((file) => file.endsWith(extension))
  const sizes = await Promise.all(matches.map(async (file) => ({ file, bytes: (await stat(join(assetsPath, file))).size })))
  return sizes.sort((a, b) => b.bytes - a.bytes)
}

const javascript = await sizesFor('.js')
const stylesheets = await sizesFor('.css')
const indexHtml = await readFile(new URL('dist/index.html', root), 'utf8')
const initialScripts = [...indexHtml.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((match) => match[1])
const initialHomepageJavaScript = (await Promise.all(initialScripts.map(async (file) => (await stat(join(assetsPath, file))).size))).reduce((sum, bytes) => sum + bytes, 0)
const checks = [
  ['largest JavaScript asset', javascript[0]?.bytes ?? 0, budget.largestJavaScriptBytes],
  ['total JavaScript assets', javascript.reduce((sum, asset) => sum + asset.bytes, 0), budget.totalJavaScriptBytes],
  ['largest stylesheet', stylesheets[0]?.bytes ?? 0, budget.largestStylesheetBytes],
  ['total stylesheets', stylesheets.reduce((sum, asset) => sum + asset.bytes, 0), budget.totalStylesheetBytes],
  ['initial homepage JavaScript', initialHomepageJavaScript, budget.initialHomepageJavaScriptBytes],
]

/**
 * Everything the build is about to publish, so the check can speak for the
 * whole site rather than only its JavaScript.
 *
 * Vite copies all of `public/` into `dist/`, which is exactly what makes it a
 * good place to stage the sources an offline converter reads — and exactly how
 * 306 MB of FBX and TGA went up to the deployed site behind a .gitignore that
 * looked like it was keeping them out. A .gitignore keeps files out of the
 * repository; nothing was keeping them out of the build.
 */
async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await walk(full))
    else out.push({ file: full, bytes: (await stat(full)).size })
  }
  return out
}
const published = await walk(fileURLToPath(new URL('dist', root)))
const SOURCE_ASSET = /\.(fbx|tga|psd|blend|max|exr|zip)$/i
const strays = published.filter((entry) => SOURCE_ASSET.test(entry.file))
const publishedBytes = published.reduce((sum, entry) => sum + entry.bytes, 0)

let failed = false
if (strays.length) {
  failed = true
  const total = strays.reduce((sum, entry) => sum + entry.bytes, 0)
  console.log(`FAIL source assets in the build: ${strays.length} files, ${(total / 1048576).toFixed(1)} MiB`)
  for (const entry of strays.slice(0, 5)) console.log(`     ${entry.file.split('/dist/')[1]}`)
  if (strays.length > 5) console.log(`     and ${strays.length - 5} more`)
}
const publishedLimit = budget.publishedBytes ?? 200 * 1024 * 1024
const publishedOk = publishedBytes <= publishedLimit
failed ||= !publishedOk
console.log(`${publishedOk ? 'PASS' : 'FAIL'} published site: ${(publishedBytes / 1048576).toFixed(1)} MiB / ${(publishedLimit / 1048576).toFixed(1)} MiB`)

for (const [label, actual, limit] of checks) {
  const passed = actual <= limit
  failed ||= !passed
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}: ${(actual / 1024).toFixed(1)} KiB / ${(limit / 1024).toFixed(1)} KiB`)
}

if (failed) process.exitCode = 1
