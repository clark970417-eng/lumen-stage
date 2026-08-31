import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const output = resolve('tmp/model-verification')
await mkdir(output, { recursive: true })
const femaleOnly = process.argv.includes('--female-only')

const browser = await chromium.connectOverCDP('http://127.0.0.1:9224')
const context = browser.contexts()[0]
const page = context.pages().find((candidate) => candidate.url().startsWith('http://127.0.0.1:5173/')) ?? await context.newPage()
await page.setViewportSize({ width: 1440, height: 900 })
await page.addInitScript(() => {
  localStorage.setItem('lumen-stage:locale', 'en')
  localStorage.setItem('lumen-stage:onboarding:v2:desktop', 'done')
})
await page.goto('http://127.0.0.1:5173/studio?ui=full', { waitUntil: 'networkidle', timeout: 120_000 })
await page.locator('.workflow-navigation').waitFor({ state: 'visible', timeout: 120_000 })

const nativeRange = async (label, value) => {
  const input = page.getByRole('slider', { name: label }).first()
  await input.waitFor({ state: 'attached' })
  await input.evaluate((element, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(element, String(next))
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

const selectTab = async (name) => {
  await page.getByRole('button', { name, exact: true }).first().click()
  await page.waitForTimeout(300)
}

const expose = async (query) => {
  const search = page.getByRole('searchbox', { name: 'Find a control…' })
  await search.fill(query)
  await page.waitForTimeout(100)
}

const settledCanvas = async (name) => {
  const canvas = page.locator('.viewport canvas').first()
  await canvas.waitFor({ state: 'visible', timeout: 120_000 })
  let previous = null
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const current = await canvas.screenshot({ animations: 'disabled' })
    const hash = createHash('sha256').update(current).digest('hex')
    if (hash === previous) {
      await canvas.screenshot({ path: resolve(output, `${name}.png`), animations: 'disabled' })
      console.log(`${name}: stable ${hash.slice(0, 12)} after ${attempt + 1} captures`)
      return
    }
    previous = hash
    await page.waitForTimeout(1200)
  }
  throw new Error(`${name}: canvas never reached two byte-identical captures`)
}

await selectTab('Person')
await expose('facing')
await nativeRange('Facing', 0)
await selectTab('Camera')
await expose('focal')
await nativeRange('Focal length', 105)
await expose('camera depth')
await nativeRange('Camera depth', 2.2)
await expose('camera height')
await nativeRange('Camera height', 1.9)
await expose('aim height')
await nativeRange('Aim height', 1.7)
const actors = femaleOnly
  ? [['Feminine', ['Bob', 'Long']]]
  : [['Masculine', ['Short', 'Buzzed']], ['Feminine', ['Bob', 'Long']]]
for (const [gender, styles] of actors) {
  await selectTab('Person')
  await expose('')
  await page.getByRole('button', { name: gender, exact: true }).first().click()
  for (const style of styles) {
    await expose('')
    const styleButton = page.getByRole('button', { name: style, exact: true }).first()
    if (await styleButton.count()) await styleButton.click()
    for (const facing of [0, 40, 90, 180]) {
      await expose('facing')
      await nativeRange('Facing', facing)
      await page.waitForTimeout(500)
      await page.getByRole('button', { name: /Viewfinder3/ }).click()
      await page.waitForTimeout(300)
      await settledCanvas(`${gender.toLowerCase()}-${style.toLowerCase()}-${facing}`)
    }
  }
  if (gender === 'Masculine') {
    await selectTab('Person')
    await expose('facing')
    await nativeRange('Facing', 0)
    await selectTab('Camera')
    await expose('focal')
    await nativeRange('Focal length', 150)
    await expose('camera depth')
    await nativeRange('Camera depth', 1.6)
    await expose('camera height')
    await nativeRange('Camera height', 1.82)
    await expose('aim height')
    await nativeRange('Aim height', 1.72)
    await page.addStyleTag({ content: '.focus-point{display:none!important}' })
    await page.getByRole('button', { name: /Viewfinder3/ }).click()
    await settledCanvas('masculine-eyes-macro')
    await expose('focal')
    await nativeRange('Focal length', 105)
    await expose('camera depth')
    await nativeRange('Camera depth', 2.2)
    await expose('camera height')
    await nativeRange('Camera height', 1.9)
    await expose('aim height')
    await nativeRange('Aim height', 1.7)
  }
}

await browser.close()
