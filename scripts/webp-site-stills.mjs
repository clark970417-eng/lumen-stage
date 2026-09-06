/**
 * Turns the captured site stills into WebP.
 *
 * The screenshots are 3840×2160 and they were PNG, which is lossless RGB for
 * what is a photographic 3D render inside a browser: 61 files, 33 MB, most of
 * the published site. The 4K was asked for deliberately and stays; the format
 * was never the point.
 *
 * Lossless WebP saves about a fifth, which is not the win. Quality 0.95 saves
 * about six sevenths -- 1.41 MB to 0.23 MB on a preview shot -- for a mean
 * error of 0.66 of 255, on images the page then scales down to fit a card. The
 * stills that are still lossless where it matters are the ones nobody scales:
 * there are none here.
 *
 * Playwright writes PNG and JPEG only, so the generators keep taking PNGs and
 * this converts them afterwards -- which is why `refresh-media.mjs` and
 * `refresh-site-stills.mjs` both end by calling it. Without that the next
 * refresh would quietly put PNGs back beside a site asking for `.webp`.
 *
 * The encoder is the browser's, for want of any other on this machine: no
 * cwebp, no sharp, and sips will not write WebP.
 *
 *   node scripts/webp-site-stills.mjs                 # everything the site shows
 *   node scripts/webp-site-stills.mjs a.png b.png     # just these
 *   node scripts/webp-site-stills.mjs --keep-png      # leave the originals
 */
import { chromium } from '@playwright/test'
import { readdir, readFile, writeFile, unlink, stat } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'

const QUALITY = 0.95

/** Everything the site actually puts on screen, and nothing it does not. */
async function defaultTargets() {
  const out = []
  const push = async (dir, match) => {
    let names = []
    try {
      names = await readdir(dir)
    } catch {
      return
    }
    for (const name of names) if (match.test(name)) out.push(join(dir, name))
  }
  await push('public/site-preview', /\.png$/)
  for (const locale of ['en', 'zh', 'ja']) {
    await push(`public/site-detail/${locale}`, /^scene-\d+\.png$/)
    await push(`public/onboarding/${locale}`, /^desktop-\d+\.png$/)
  }
  return out
}

const args = process.argv.slice(2)
const keepPng = args.includes('--keep-png')
const targets = args.filter((a) => a.endsWith('.png'))
const files = targets.length ? targets : await defaultTargets()
if (!files.length) {
  console.log('  nothing to convert')
  process.exit(0)
}

const browser = await chromium.launch({ headless: true })
let before = 0
let after = 0
try {
  const page = await browser.newPage()
  for (const file of files) {
    const png = await readFile(file)
    const { size } = await stat(file)
    const encoded = await page.evaluate(
      async ([data, quality]) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
        const source = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const canvas = new OffscreenCanvas(source.width, source.height)
        canvas.getContext('2d').drawImage(source, 0, 0)
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality })
        const out = new Uint8Array(await blob.arrayBuffer())
        let binary = ''
        for (let i = 0; i < out.length; i += 8192) binary += String.fromCharCode(...out.subarray(i, i + 8192))
        return { data: btoa(binary), width: source.width, height: source.height }
      },
      [png.toString('base64'), QUALITY],
    )
    const webp = Buffer.from(encoded.data, 'base64')
    // RIFF....WEBP. A failed encode would otherwise replace a picture with
    // whatever the page handed back.
    if (webp.toString('ascii', 0, 4) !== 'RIFF' || webp.toString('ascii', 8, 12) !== 'WEBP') {
      throw new Error(`${file} did not come back as a WebP`)
    }
    const target = join(dirname(file), basename(file).replace(/\.png$/, '.webp'))
    await writeFile(target, webp)
    if (!keepPng) await unlink(file)
    before += size
    after += webp.length
    console.log(`  ${target.padEnd(46)} ${encoded.width}×${encoded.height}  ${(size / 1048576).toFixed(2)} -> ${(webp.length / 1048576).toFixed(2)} MB`)
  }
} finally {
  await browser.close()
}
console.log(`\n  ${files.length} stills, ${(before / 1048576).toFixed(1)} -> ${(after / 1048576).toFixed(1)} MB at quality ${QUALITY}`)
