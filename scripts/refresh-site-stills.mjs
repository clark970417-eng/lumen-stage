/** Capture current UI at native 4K output, using isolated browser storage. */
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
const base = process.env.LUMEN_CAPTURE_URL ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch({ headless: true })
const crops = {}
try {
  for (const locale of (process.env.LUMEN_CAPTURE_LOCALES ?? 'en,zh,ja').split(',')) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
    await context.addInitScript((language) => {
      localStorage.setItem('lumen-stage:locale', language)
      for (const scope of ['desktop', 'mobile']) localStorage.setItem(`lumen-stage:onboarding:v2:${scope}`, 'done')
    }, locale)
    const page = await context.newPage()
    await page.goto(`${base}/studio?ui=full`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.locator('.workflow-navigation button').first().waitFor()
    await page.evaluate(async () => {
      const moduleUrl = performance.getEntriesByType('resource').map((r) => r.name).filter((name) => /\/src\/store\.ts(?:\?|$)/.test(name)).at(-1)
      const { useStudio } = await import(moduleUrl)
      window.captureStudio = useStudio
      useStudio.getState().castActor('female')
      useStudio.getState().setValue('qualityPreset', 'ultra')
    })
    await page.waitForTimeout(5000)
    await mkdir(`public/site-preview`, { recursive: true })
    await page.screenshot({ path: `public/site-preview/${locale}.png` })
    for (const [index, mode] of [1, 2, 3].entries()) {
      await page.locator('.workflow-navigation button').nth(mode).click()
      await page.evaluate((i) => { const s = window.captureStudio.getState(); if (i === 0) s.selectObject(s.lights[0].id); if (i === 1) s.openCameraView(); if (i === 2) s.openTopView() }, index)
      await page.waitForTimeout(2000)
      const rect = await page.locator('.viewport').boundingBox()
      crops[index] = [rect.x * 2, rect.y * 2, rect.width * 2, rect.height * 2]
      await writeFile('/private/tmp/lumen-still-crops.json', JSON.stringify(crops))
      await mkdir(`public/site-detail/${locale}`, { recursive: true })
      await page.screenshot({ path: `public/site-detail/${locale}/scene-${index}.png` })
    }
    await context.close()
    const mobile = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 4, isMobile: true, hasTouch: true })
    await mobile.addInitScript((language) => { localStorage.setItem('lumen-stage:locale', language); localStorage.setItem('lumen-stage:onboarding:v2:mobile', 'done') }, locale)
    const phone = await mobile.newPage()
    await phone.goto(`${base}/studio?ui=mobile`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await phone.locator('.m-cast-select').waitFor()
    await phone.waitForTimeout(5000)
    await phone.screenshot({ path: `public/site-preview/${locale}-mobile.png` })
    await mobile.close()
    console.log(`Captured ${locale}: desktop 3840×2160; phone 2160×3840`)
  }
  await writeFile('/private/tmp/lumen-still-crops.json', JSON.stringify(crops))
} finally { await browser.close() }
