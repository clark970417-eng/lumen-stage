/** Capture rebuildable, native-HiDPI guide sources from the production site. */

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const captureRoot = resolve(process.env.LUMEN_GUIDE_CAPTURE_DIR || resolve(projectRoot, 'tmp/guide-captures'))
const production = {
  desktop: 'https://lumen-stage.vercel.app/?ui=full',
  mobile: 'https://lumen-stage.vercel.app/?ui=mobile',
}

const runtimePlaywright = resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
const playwrightModule = process.env.LUMEN_PLAYWRIGHT_MODULE || runtimePlaywright
if (!existsSync(playwrightModule)) {
  throw new Error(`Playwright module not found: ${playwrightModule}. Set LUMEN_PLAYWRIGHT_MODULE to playwright/index.mjs.`)
}
const { chromium } = await import(pathToFileURL(playwrightModule).href)

const chromePath = process.env.LUMEN_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}. Set LUMEN_CHROME_PATH.`)

const localeConfig = {
  zh: { browser: 'zh-TW', proof: '定調' },
  en: { browser: 'en-US', proof: 'Define' },
  ja: { browser: 'ja-JP', proof: '方向' },
}
const requested = process.argv[2] || 'all'
const requestedScope = process.argv[3] || 'all'
const locales = requested === 'all' ? Object.keys(localeConfig) : [requested]
if (locales.some((locale) => !localeConfig[locale]) || !['all', 'desktop', 'mobile'].includes(requestedScope)) {
  throw new Error('Usage: node scripts/capture_guide_hidpi.mjs [all|zh|en|ja] [all|desktop|mobile]')
}

const browser = await chromium.launch({
  headless: false,
  executablePath: chromePath,
  args: [
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-angle=metal',
    '--window-position=-10000,-10000',
    '--disable-dev-shm-usage',
  ],
})

function dimensions(buffer) {
  if (buffer.subarray(1, 4).toString() !== 'PNG') throw new Error('Capture is not PNG')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

async function prepare(context, url, locale, selector) {
  await context.addInitScript((selectedLocale) => {
    localStorage.setItem('lumen-stage:locale', selectedLocale)
    localStorage.setItem('lumen-stage:onboarding:v1:desktop', 'done')
    localStorage.setItem('lumen-stage:onboarding:v1:mobile', 'done')
    localStorage.setItem('lumen-stage:onboarding:v2:desktop', 'done')
    localStorage.setItem('lumen-stage:onboarding:v2:mobile', 'done')
  }, locale)
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error(`[${locale}:pageerror] ${error.message}`))
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
  if (new URL(page.url()).origin !== 'https://lumen-stage.vercel.app') throw new Error(`Unexpected capture origin: ${page.url()}`)
  await page.locator(selector).waitFor({ state: 'visible', timeout: 120000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1200)
  const body = await page.locator('body').innerText()
  if (!body.includes(localeConfig[locale].proof)) throw new Error(`${locale} locale proof not found in production UI`)
  return page
}

async function save(page, locale, name, expected) {
  const targetDirectory = resolve(captureRoot, locale)
  await mkdir(targetDirectory, { recursive: true })
  const buffer = await page.screenshot({
    path: resolve(targetDirectory, `${name}.png`),
    type: 'png',
    animations: 'disabled',
    captureBeyondViewport: false,
  })
  const actual = dimensions(buffer)
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(`${locale}/${name}.png is ${actual.width}x${actual.height}; expected ${expected.width}x${expected.height}`)
  }
  console.log(`${locale}/${name}.png ${actual.width}x${actual.height}`)
}

async function captureDesktop(locale) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1150 },
    deviceScaleFactor: 3,
    locale: localeConfig[locale].browser,
    colorScheme: 'dark',
  })
  const page = await prepare(context, production.desktop, locale, '.workflow-navigation')
  const expected = { width: 5760, height: 3450 }
  const workflow = page.locator('.workflow-navigation button')
  const modes = page.locator('.view-mode-dock button')

  await workflow.nth(0).click()
  await modes.nth(2).click()
  await page.waitForTimeout(700)
  await save(page, locale, 'desktop-00-cover-focus', expected)

  await modes.nth(0).click()
  await page.locator('.intent-card > button').click()
  await page.locator('.reference-panel').waitFor({ state: 'visible' })
  await save(page, locale, 'desktop-01-tone', expected)
  await page.locator('.reference-panel > header > button').click()

  await workflow.nth(1).click()
  await modes.nth(1).click()
  await page.waitForTimeout(500)
  await save(page, locale, 'desktop-02-blocking', expected)

  await workflow.nth(2).click()
  await modes.nth(0).click()
  await page.waitForTimeout(500)
  await save(page, locale, 'desktop-03-shaping-before', expected)
  await page.locator('.decision-actions button').first().click()
  await page.waitForTimeout(500)
  await save(page, locale, 'desktop-03-shaping-after', expected)

  await workflow.nth(3).click()
  await page.waitForTimeout(700)
  await save(page, locale, 'desktop-04-framing', expected)

  await workflow.nth(4).click()
  await modes.nth(0).click()
  await page.waitForTimeout(500)
  await save(page, locale, 'desktop-05-validation', expected)

  await workflow.nth(0).click()
  await modes.nth(0).click()
  await page.waitForTimeout(500)
  await save(page, locale, 'desktop-06-shoot-blueprint', expected)

  await workflow.nth(2).click()
  await modes.nth(0).click()
  await page.locator('.blueprint-row').nth(1).click()
  await page.waitForTimeout(500)
  await save(page, locale, 'desktop-07-current-decision', expected)

  await workflow.nth(4).click()
  await modes.nth(0).click()
  await page.locator('.verify-actions > button').first().click()
  await page.waitForTimeout(500)
  await save(page, locale, 'desktop-10-final-check', expected)
  await context.close()
}

async function captureMobile(locale) {
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    locale: localeConfig[locale].browser,
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
  })
  const page = await prepare(context, production.mobile, locale, '.m-tabs')
  const expected = { width: 860, height: 1864 }
  const tabs = page.locator('.m-tabs button[role="tab"]')
  const names = ['tone', 'blocking', 'shaping', 'framing', 'validation']
  for (let index = 0; index < names.length; index += 1) {
    const tab = tabs.nth(index)
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click()
    await page.locator('.m-sheet').waitFor({ state: 'visible' })
    await page.waitForTimeout(500)
    await save(page, locale, `mobile-0${index + 1}-${names[index]}`, expected)
  }
  await context.close()
}

try {
  for (const locale of locales) {
    if (requestedScope !== 'mobile') await captureDesktop(locale)
    if (requestedScope !== 'desktop') await captureMobile(locale)
  }
} finally {
  await browser.close()
}
