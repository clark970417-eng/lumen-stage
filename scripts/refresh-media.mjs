import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const base = process.env.LUMEN_CAPTURE_URL || 'http://127.0.0.1:5173'
// Chrome by preference, but not by requirement: this machine has not had
// Chrome.app installed since 2026-09-03, and the hard path made the whole
// script unrunnable rather than one flag away from running. Playwright's own
// build is the fallback, which is what `executablePath: undefined` selects.
const chromePath = process.env.LUMEN_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome = existsSync(chromePath) ? chromePath : undefined
if (!chrome) console.log(`  ${chromePath} is not installed — using Playwright's Chromium`)
const allLocales = ['en', 'zh', 'ja']
const requestedLocale = process.argv.find((value) => allLocales.includes(value))
const locales = requestedLocale ? [requestedLocale] : allLocales
const captureSharedCompare = !requestedLocale || requestedLocale === 'en'
const introsOnly = process.argv.includes('--video-intros')
const siteFixOnly = process.argv.includes('--site-fix')
const compareOnly = process.argv.includes('--compare-only')
const initialGender = { en: 'Masculine', zh: 'Feminine', ja: 'Masculine' }
const oppositeGender = { Feminine: 'Masculine', Masculine: 'Feminine' }
const fullTutorialGenders = ['Masculine', 'Feminine', 'Masculine', 'Feminine']
const fullVideoGender = { en: 'Masculine', zh: 'Feminine', ja: 'Masculine' }
const simpleVideoGender = { en: 'Feminine', zh: 'Masculine', ja: 'Feminine' }
const genderLabel = {
  en: { Feminine: 'Feminine', Masculine: 'Masculine' },
  zh: { Feminine: '女性', Masculine: '男性' },
  ja: { Feminine: '女性的', Masculine: '男性的' },
}

const browser = await chromium.launch({
  headless: process.env.LUMEN_HEADFUL !== '1',
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
  // Resolve the store and the cast once, here, and hang them on window. Doing
  // the dynamic import inside each later call meant a promise Playwright could
  // lose the moment the page's execution context was replaced -- which shows up
  // as "Resulting promise was garbage collected" halfway through a locale.
  await page.evaluate(async () => {
    const url = (file) => performance.getEntriesByType('resource').map((r) => r.name)
      .filter((name) => new RegExp(`/src/${file}\\.ts(?:\\?|$)`).test(name)).at(-1)
    const { useStudio } = await import(url('store'))
    const { CAST } = await import(url('actorCast'))
    window.captureStudio = useStudio
    window.captureCast = Object.fromEntries(['masculine', 'feminine']
      .map((sex) => [sex, CAST.find((member) => member.sex === sex && !member.child)?.id])
      .filter(([, id]) => id))
    if (!window.captureCast.masculine || !window.captureCast.feminine) throw new Error('the cast is missing an adult of one sex')
  })
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

/**
 * The desktop UI has no masculine/feminine switch for the main subject any
 * more. The actors are photographed, so the build controls could never reshape
 * one; choosing a body now means casting a different person, and the panel
 * that held those buttons is hidden for a photographed actor. Waiting for the
 * button therefore timed out and took the whole script with it.
 *
 * So go through the store, which is what the cast picker does, and pick the
 * first adult of the sex asked for rather than naming an actor here -- the
 * cast is edited far more often than this script is.
 */
async function setFullGender(page, locale, gender) {
  await page.locator('.workflow-navigation button').nth(0).click()
  const cast = await page.evaluate((sex) => {
    const id = window.captureCast[sex]
    window.captureStudio.getState().castActor(id)
    return id
  }, gender.toLowerCase() === 'masculine' ? 'masculine' : 'feminine')
  await waitForModelReady(page)
  return cast
}

/** The phone shell has the same story: the main subject is cast, not sexed. */
async function setSimpleGender(page, locale, gender) {
  const person = page.getByRole('tab').nth(0)
  if (await person.getAttribute('aria-selected') !== 'true') await person.click()
  await page.locator('.m-cast-select').waitFor({ state: 'visible', timeout: 30_000 })
  await page.evaluate((sex) => window.captureStudio.getState().castActor(window.captureCast[sex]),
    gender.toLowerCase() === 'masculine' ? 'masculine' : 'feminine')
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
  for (let index = 0; index < 5; index += 1) {
    await setFullGender(page, locale, fullVideoGender[locale])
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
  for (let index = 0; index < 5; index += 1) {
    await setSimpleGender(page, locale, simpleVideoGender[locale])
    const tab = page.getByRole('tab').nth(Math.min(index, 3))
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click()
    await page.locator('.m-sheet').waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForTimeout(700)
    if (index === 4) {
      await page.locator('.m-sheet-handle').click()
      await page.locator('.m-sheet').waitFor({ state: 'hidden', timeout: 30_000 })
      await page.waitForTimeout(250)
    }
    await shot(page, resolve(folder, `video-simple-${index + 1}.png`))
  }
}

async function saveCanvasFrame(page, target, denoise = false) {
  const dataUrl = await page.locator('.viewport canvas:not(.exposure-overlay)').first().evaluate((source, shouldDenoise) => {
    const ratio = 16 / 9
    const sourceRatio = source.width / source.height
    let sx = 0; let sy = 0; let sw = source.width; let sh = source.height
    if (sourceRatio > ratio) { sw = Math.round(source.height * ratio); sx = Math.round((source.width - sw) / 2) }
    else { sh = Math.round(source.width / ratio); sy = Math.round((source.height - sh) / 2) }
    const output = document.createElement('canvas')
    output.width = 1600
    output.height = 900
    const context = output.getContext('2d')
    context.filter = shouldDenoise ? 'blur(0.35px)' : 'none'
    context.drawImage(source, sx, sy, sw, sh, 0, 0, output.width, output.height)
    context.filter = 'none'
    return output.toDataURL('image/webp', 0.96)
  }, denoise)
  await mkdir(resolve(target, '..'), { recursive: true })
  await writeFile(target, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'))
  console.log(target.replace(`${root}/`, ''))
}

async function captureRenderComparison(page, locale) {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await setFullGender(page, locale, 'Masculine')
  await page.locator('.workflow-navigation button').nth(2).click()
  await page.locator('.view-mode-dock button').nth(2).click()
  await page.waitForTimeout(900)
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.keyboard.press('Tab')
  await page.waitForFunction(() => {
    const shell = document.querySelector('main.app-shell')
    return shell?.classList.contains('left-panel-hidden') && shell.classList.contains('right-panel-hidden') && shell.classList.contains('top-panel-hidden')
  })
  await page.waitForTimeout(400)
  await saveCanvasFrame(page, resolve(root, 'public/onboarding/render-after.webp'))

  // Build the matching "before" through the real studio controls: isolate the
  // weaker fill through the exposure panel's SOLO control, then return to the
  // exact same camera view.
  await page.keyboard.press('Tab')
  await page.locator('.workflow-navigation button').nth(2).click()
  await page.locator('.verify-actions button').first().click()
  const soloLights = page.locator('.solo-metering > button')
  if (await soloLights.count() < 2) throw new Error('Comparison capture needs both key and fill lights')
  await soloLights.nth(1).click()
  await soloLights.nth(1).filter({ hasText: 'SOLO' }).waitFor({ state: 'visible', timeout: 30_000 })
  await page.locator('.exposure-panel > header button').click()
  await page.locator('.view-mode-dock button').nth(2).click()
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.keyboard.press('Tab')
  await page.waitForTimeout(500)
  await saveCanvasFrame(page, resolve(root, 'public/onboarding/render-before.webp'))
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
    page.on('console', (message) => { if (message.type() === 'error') console.error(`browser: ${message.text()}`) })
    page.on('pageerror', (error) => console.error(`browser page error: ${error.message}`))
    await prepare(page, locale, 'full')
    if (compareOnly) {
      await captureRenderComparison(page, locale)
      await full.close()
      break
    }
    if (!siteFixOnly) {
      // The homepage preview belongs to refresh-site-stills, which shoots it at
      // 1920x1080 on a 2x scale factor. This context is 1905x1080 at 1x, so
      // writing it here quietly halved the resolution of the hero image
      // whenever this script ran second.
      await setFullGender(page, locale, initialGender[locale])

      for (let index = 0; index < 4; index += 1) {
        await setFullGender(page, locale, fullTutorialGenders[index])
        await page.locator('.workflow-navigation button').nth(index).click()
        await page.waitForTimeout(900)
        await shot(page, resolve(root, `public/onboarding/${locale}/desktop-${index}.png`))
        if (index > 0) {
          await shot(page, resolve(root, `tmp/media-capture/${locale}/detail-${index}.png`))
        }
      }
    }
    await captureFullVideoSources(page, locale)
    if (locale === locales[0] && captureSharedCompare) await captureRenderComparison(page, locale)
    await full.close()

    const simple = await browser.newContext({ viewport: { width: 780, height: 844 }, colorScheme: 'dark', locale })
    const mobile = await simple.newPage()
    await prepare(mobile, locale, 'mobile')
    if (!siteFixOnly) {
      // Same again: the phone preview is refresh-site-stills' at 540x960 on a
      // 4x scale factor, not this context's 780x844 at 1x.
      await setSimpleGender(mobile, locale, oppositeGender[initialGender[locale]])
      // The phone tutorial stills, the light/camera/handoff details and the
      // workflow plan and shoot shots used to be captured here. Nothing on the
      // site has ever shown them -- they were 5 MB of the published build --
      // and deleting the files alone would only have brought them back on the
      // next refresh. The phone shot above is still used, as the guide's
      // mobile slide.
    }
    await captureSimpleVideoSources(mobile, locale)
    await simple.close()
  }
} finally {
  await browser.close()
}
// Playwright writes PNG only, and the site asks for .webp. Without this the
// next refresh would quietly put PNGs back beside a page that no longer looks
// for them. See scripts/webp-site-stills.mjs.
await new Promise((done, fail) => {
  const child = spawn(process.execPath, ['scripts/webp-site-stills.mjs'], { stdio: 'inherit' })
  child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`webp-site-stills exited ${code}`))))
})

