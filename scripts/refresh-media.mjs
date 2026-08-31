import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const base = process.env.LUMEN_CAPTURE_URL || 'http://127.0.0.1:5173'
const chrome = process.env.LUMEN_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const allLocales = ['en', 'zh', 'ja']
const requestedLocale = process.argv.find((value) => allLocales.includes(value))
const locales = requestedLocale ? [requestedLocale] : allLocales
const introsOnly = process.argv.includes('--video-intros')
const initialGender = { en: 'Masculine', zh: 'Feminine', ja: 'Masculine' }
const oppositeGender = { Feminine: 'Masculine', Masculine: 'Feminine' }
const fullTutorialGenders = ['Masculine', 'Feminine', 'Masculine', 'Feminine']
const simpleTutorialGenders = ['Feminine', 'Masculine', 'Feminine', 'Masculine']
const fullVideoGenders = ['Masculine', 'Feminine', 'Masculine', 'Feminine', 'Masculine']
const simpleVideoGenders = ['Feminine', 'Masculine', 'Feminine', 'Masculine', 'Feminine']
const genderLabel = {
  en: { Feminine: 'Feminine', Masculine: 'Masculine' },
  zh: { Feminine: '女性', Masculine: '男性' },
  ja: { Feminine: '女性的', Masculine: '男性的' },
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chrome,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=metal', '--window-position=-10000,-10000'],
})

async function prepare(page, locale, ui) {
  await page.addInitScript((selected) => {
    localStorage.setItem('lumen-stage:locale', selected)
    localStorage.setItem('lumen-stage:onboarding:v2:desktop', 'done')
    localStorage.setItem('lumen-stage:onboarding:v2:mobile', 'done')
  }, locale)
  await page.goto(`${base}/studio?ui=${ui}`, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.locator(ui === 'full' ? '.workflow-navigation' : '.m-tabs').waitFor({ state: 'visible', timeout: 120_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1800)
  await assertCaptureHealth(page)
}

async function assertCaptureHealth(page) {
  const health = await page.evaluate(() => ({
    title: document.title,
    canvas: [...document.querySelectorAll('canvas')].map((item) => ({ width: item.width, height: item.height })),
    brokenImages: [...document.images].filter((item) => item.complete && item.naturalWidth === 0).map((item) => item.currentSrc),
  }))
  if (!health.canvas.some(({ width, height }) => width > 0 && height > 0)) throw new Error(`No healthy WebGL canvas on ${page.url()}`)
  if (health.brokenImages.length) throw new Error(`Broken images on ${page.url()}: ${health.brokenImages.join(', ')}`)
}

async function waitForModelReady(page) {
  const status = page.locator('.selection-chip small').first()
  if (await status.count()) {
    await status.filter({ hasText: 'Rigged human' }).waitFor({ state: 'visible', timeout: 120_000 })
  } else {
    // Simple mode does not expose the import status in its compact chrome.
    // Its GLBs are cached after navigation; keep a deterministic settle window.
    await page.waitForTimeout(5000)
  }
  await page.waitForTimeout(700)
}

async function setFullGender(page, locale, gender) {
  await page.locator('.workflow-navigation button').nth(0).click()
  const choice = page.getByRole('button', { name: genderLabel[locale][gender], exact: true }).first()
  await choice.waitFor({ state: 'visible', timeout: 30_000 })
  await choice.click()
  await waitForModelReady(page)
}

async function setSimpleGender(page, locale, gender) {
  const person = page.getByRole('tab').nth(0)
  if (await person.getAttribute('aria-selected') !== 'true') await person.click()
  const choice = page.getByRole('button', { name: genderLabel[locale][gender], exact: true }).first()
  await choice.waitFor({ state: 'visible', timeout: 30_000 })
  await choice.click()
  await waitForModelReady(page)
}

async function shot(page, path, options = {}) {
  await mkdir(resolve(path, '..'), { recursive: true })
  await page.screenshot({ path, animations: 'disabled', type: 'png', ...options })
  console.log(path.replace(`${root}/`, ''))
}

async function captureWebsiteScene(context, locale, target) {
  const site = await context.newPage()
  await site.setViewportSize({ width: 1920, height: 1440 })
  await site.addInitScript((selected) => localStorage.setItem('lumen-stage:locale', selected), locale)
  await site.goto(base, { waitUntil: 'networkidle', timeout: 120_000 })
  await site.locator('.featured-setups').scrollIntoViewIfNeeded()
  await site.evaluate(() => document.fonts.ready)
  await site.waitForTimeout(900)
  await shot(site, target)
  await site.close()
}

async function captureFullVideoSources(page, locale) {
  await page.setViewportSize({ width: 1920, height: 1440 })
  const folder = resolve(root, `tmp/media-capture/${locale}`)
  await captureWebsiteScene(page.context(), locale, resolve(folder, 'video-full-0.png'))
  for (let index = 0; index < fullVideoGenders.length; index += 1) {
    await setFullGender(page, locale, fullVideoGenders[index])
    const workflowIndex = Math.min(index, 3)
    await page.locator('.workflow-navigation button').nth(workflowIndex).click()
    await page.waitForTimeout(900)
    if (index === 4) {
      const fileButton = page.locator('.file-menu > button')
      if (await fileButton.isVisible()) await fileButton.click()
      await page.waitForTimeout(250)
    }
    await shot(page, resolve(folder, `video-full-${index + 1}.png`))
  }
}

async function captureSimpleVideoSources(page, locale) {
  await page.setViewportSize({ width: 1920, height: 1440 })
  const folder = resolve(root, `tmp/media-capture/${locale}`)
  await captureWebsiteScene(page.context(), locale, resolve(folder, 'video-simple-0.png'))
  for (let index = 0; index < simpleVideoGenders.length; index += 1) {
    await setSimpleGender(page, locale, simpleVideoGenders[index])
    const tab = page.getByRole('tab').nth(Math.min(index, 3))
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click()
    await page.locator('.m-sheet').waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForTimeout(700)
    await shot(page, resolve(folder, `video-simple-${index + 1}.png`))
  }
}

try {
  for (const locale of locales) {
    if (introsOnly) {
      const intro = await browser.newContext({ viewport: { width: 1920, height: 1440 }, colorScheme: 'dark', locale })
      const folder = resolve(root, `tmp/media-capture/${locale}`)
      await captureWebsiteScene(intro, locale, resolve(folder, 'video-full-0.png'))
      await captureWebsiteScene(intro, locale, resolve(folder, 'video-simple-0.png'))
      await intro.close()
      continue
    }
    const full = await browser.newContext({ viewport: { width: 1905, height: 1080 }, colorScheme: 'dark', locale })
    const page = await full.newPage()
    await prepare(page, locale, 'full')
    await setFullGender(page, locale, initialGender[locale])
    await shot(page, resolve(root, `public/site-preview/${locale}.png`))

    for (let index = 0; index < 4; index += 1) {
      await setFullGender(page, locale, fullTutorialGenders[index])
      await page.locator('.workflow-navigation button').nth(index).click()
      await page.waitForTimeout(900)
      await shot(page, resolve(root, `public/onboarding/${locale}/desktop-${index}.png`))
      if (index > 0) {
        await shot(page, resolve(root, `tmp/media-capture/${locale}/detail-${index}.png`))
      }
    }
    await captureFullVideoSources(page, locale)
    await full.close()

    const simple = await browser.newContext({ viewport: { width: 780, height: 844 }, colorScheme: 'dark', locale })
    const mobile = await simple.newPage()
    await prepare(mobile, locale, 'mobile')
    await setSimpleGender(mobile, locale, oppositeGender[initialGender[locale]])
    await shot(mobile, resolve(root, `public/site-preview/${locale}-mobile.png`))
    await mobile.setViewportSize({ width: 780, height: 438 })
    await mobile.waitForTimeout(500)
    for (let index = 0; index < 4; index += 1) {
      await setSimpleGender(mobile, locale, simpleTutorialGenders[index])
      const tab = mobile.getByRole('tab').nth(index)
      if (await tab.getAttribute('aria-selected') !== 'true') await tab.click()
      await mobile.locator('.m-sheet').waitFor({ state: 'visible', timeout: 30_000 })
      await mobile.waitForTimeout(700)
      await shot(mobile, resolve(root, `public/onboarding/${locale}/mobile-${index}.png`))
      if (index > 0) {
        const detailName = ['light', 'camera', 'handoff'][index - 1]
        await shot(mobile, resolve(root, `public/site-detail/${locale}/${detailName}.png`))
      }
    }
    await captureSimpleVideoSources(mobile, locale)
    await simple.close()
  }
} finally {
  await browser.close()
}
