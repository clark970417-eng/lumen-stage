import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const base = process.env.LUMEN_CAPTURE_URL || 'http://127.0.0.1:5173'
const chrome = process.env.LUMEN_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const allLocales = ['en', 'zh', 'ja']
const locales = process.argv[2] ? [process.argv[2]] : allLocales
const initialGender = { en: 'Masculine', zh: 'Feminine', ja: 'Masculine' }
const genderLabel = {
  en: { Feminine: 'Feminine', Masculine: 'Masculine' },
  zh: { Feminine: '女性', Masculine: '男性' },
  ja: { Feminine: '女性的', Masculine: '男性的' },
}

const browser = await chromium.launch({
  headless: false,
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
}

async function setFullGender(page, locale, gender) {
  await page.locator('.workflow-navigation button').nth(0).click()
  const choice = page.getByRole('button', { name: genderLabel[locale][gender], exact: true }).first()
  await choice.waitFor({ state: 'visible', timeout: 30_000 })
  await choice.click()
  await page.waitForTimeout(2200)
}

async function setSimpleGender(page, locale, gender) {
  const person = page.getByRole('tab').nth(0)
  if (await person.getAttribute('aria-selected') !== 'true') await person.click()
  const choice = page.getByRole('button', { name: genderLabel[locale][gender], exact: true }).first()
  await choice.waitFor({ state: 'visible', timeout: 30_000 })
  await choice.click()
  await page.waitForTimeout(2200)
}

async function shot(page, path, options = {}) {
  await mkdir(resolve(path, '..'), { recursive: true })
  await page.screenshot({ path, animations: 'disabled', type: 'png', ...options })
  console.log(path.replace(`${root}/`, ''))
}

try {
  for (const locale of locales) {
    const full = await browser.newContext({ viewport: { width: 1905, height: 1080 }, colorScheme: 'dark', locale })
    const page = await full.newPage()
    await prepare(page, locale, 'full')
    await setFullGender(page, locale, initialGender[locale])
    await shot(page, resolve(root, `public/site-preview/${locale}.png`))

    const genders = ['Masculine', 'Feminine', 'Masculine', 'Feminine']
    for (let index = 0; index < 4; index += 1) {
      await setFullGender(page, locale, genders[(index + allLocales.indexOf(locale)) % genders.length])
      await page.locator('.workflow-navigation button').nth(index).click()
      await page.waitForTimeout(900)
      await shot(page, resolve(root, `public/onboarding/${locale}/desktop-${index}.png`))
      if (index > 0) {
        await shot(page, resolve(root, `tmp/media-capture/${locale}/detail-${index}.png`))
      }
    }
    await full.close()

    const simple = await browser.newContext({ viewport: { width: 780, height: 844 }, colorScheme: 'dark', locale })
    const mobile = await simple.newPage()
    await prepare(mobile, locale, 'mobile')
    await setSimpleGender(mobile, locale, initialGender[locale])
    await shot(mobile, resolve(root, `public/site-preview/${locale}-mobile.png`))
    await mobile.setViewportSize({ width: 780, height: 438 })
    await mobile.waitForTimeout(500)
    for (let index = 0; index < 4; index += 1) {
      const tab = mobile.getByRole('tab').nth(index)
      if (await tab.getAttribute('aria-selected') !== 'true') await tab.click()
      await mobile.locator('.m-sheet').waitFor({ state: 'visible', timeout: 30_000 })
      await mobile.waitForTimeout(700)
      await shot(mobile, resolve(root, `public/onboarding/${locale}/mobile-${index}.png`))
    }
    await simple.close()
  }
} finally {
  await browser.close()
}
