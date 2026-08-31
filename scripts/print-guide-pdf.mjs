import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const [output, locale = 'en', url = 'http://127.0.0.1:5173/studio?ui=full'] = process.argv.slice(2)
if (!output) throw new Error('Usage: node scripts/print-guide-pdf.mjs <output> [locale] [url]')
if (!['en', 'zh', 'ja'].includes(locale)) throw new Error(`Unsupported locale: ${locale}`)

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate((nextLocale) => {
    localStorage.setItem('lumen-stage:locale', nextLocale)
    for (const version of ['v1', 'v2']) {
      localStorage.setItem(`lumen-stage:onboarding:${version}:desktop`, 'done')
      localStorage.setItem(`lumen-stage:onboarding:${version}:mobile`, 'done')
    }
  }, locale)
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.file-menu > button').click()
  await page.locator('.file-menu-list button').filter({ has: page.locator('small', { hasText: '?' }) }).click()
  await page.locator('.guide-dialog').waitFor({ state: 'visible' })

  const figures = page.locator('.guide-page-stage > figure')
  if (await figures.count() !== 10) throw new Error(`Guide did not open correctly for ${locale}`)
  await page.locator('.guide-slide img').evaluateAll(async (images) => {
    images.forEach((image) => { image.loading = 'eager' })
    await Promise.race([
      Promise.all(images.map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true })
            image.addEventListener('error', resolve, { once: true })
          }))),
      new Promise((resolve) => setTimeout(resolve, 12000)),
    ])
  })

  await page.emulateMedia({ media: 'print' })
  await mkdir(dirname(output), { recursive: true })
  await page.pdf({
    path: output,
    // Chromium wraps the fixed-size modal with one leading and one trailing
    // canvas page. The ten guide figures themselves are pages 2-11.
    pageRanges: '2-11',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  })
  console.log(`Printed ${locale} guide -> ${output}`)
} finally {
  await browser.close()
}
