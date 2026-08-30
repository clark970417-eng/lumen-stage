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

let failed = false
for (const [label, actual, limit] of checks) {
  const passed = actual <= limit
  failed ||= !passed
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}: ${(actual / 1024).toFixed(1)} KiB / ${(limit / 1024).toFixed(1)} KiB`)
}

if (failed) process.exitCode = 1
