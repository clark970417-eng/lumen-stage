import { expect, test } from '@playwright/test'

test('keeps the simple studio inside a phone screen', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/studio?ui=mobile')
  await expect(page.getByRole('tab', { name: 'Person' })).toBeVisible({ timeout: 30_000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 320, height: 740 })
  const widths = await page.getByRole('tab').evaluateAll(tabs => tabs.map(tab => tab.getBoundingClientRect().width))
  expect(widths).toHaveLength(4)
  for (const width of widths) expect(width).toBeGreaterThan(50)
})

test('adds, edits and removes phone lights without recompiling the scene or losing controls', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (/GL_INVALID|shader error|failed to (compile|link)|context lost/i.test(message.text())) errors.push(message.text())
  })
  await page.addInitScript(() => {
    localStorage.setItem('lumen-stage:onboarding:v2:mobile', 'done')
    localStorage.setItem('lumen-stage:locale', 'en')
    const stats = { links: 0 }
    Object.assign(window, { lightTestStats: stats })
    const original = WebGL2RenderingContext.prototype.linkProgram
    WebGL2RenderingContext.prototype.linkProgram = function (program) {
      stats.links++
      return original.call(this, program)
    }
  })
  await page.goto('/studio?ui=mobile')
  await page.getByRole('tab', { name: 'Light', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(8000) // let the cold shader/model load finish before measuring edits
  const chips = page.locator('.m-chips-scroll button[aria-pressed]')
  await expect(chips).toHaveCount(2)
  await page.evaluate(() => { (window as unknown as { lightTestStats: { links: number } }).lightTestStats.links = 0 })
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: 'Add a light', exact: true }).click()
    await expect(chips).toHaveCount(index + 3)
  }
  await page.waitForTimeout(1000)
  const links = await page.evaluate(() => (window as unknown as { lightTestStats: { links: number } }).lightTestStats.links)
  expect(links).toBeLessThan(14) // three fixtures together must cost less than one old full-scene recompile
  await page.locator('.m-light-name').fill('Phone key')
  await expect(chips.filter({ hasText: 'Phone key' })).toHaveAttribute('aria-pressed', 'true')
  const toggle = page.locator('.m-light-actions .m-toggle')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const power = page.getByRole('slider', { name: /Output power/ })
  const original = await power.inputValue()
  await power.focus()
  await power.press('ArrowRight')
  expect(await power.inputValue()).not.toBe(original)
  await page.locator('.m-light-actions .m-delete').click()
  await expect(chips).toHaveCount(4)
  await page.getByRole('tab', { name: 'Camera', exact: true }).click()
  await expect(page.getByRole('slider', { name: /Focal length/ })).toBeVisible()
  const iso = page.getByRole('slider', { name: /^ISO / })
  await iso.focus()
  await iso.press('Home')
  await page.waitForTimeout(1000)
  const brightness = () => page.evaluate(() => {
    const source = document.querySelector('.m-viewport canvas') as HTMLCanvasElement
    const sample = document.createElement('canvas')
    sample.width = sample.height = 32
    const context = sample.getContext('2d')!
    context.drawImage(source, 0, 0, 32, 32)
    const pixels = context.getImageData(0, 0, 32, 32).data
    let total = 0
    for (let i = 0; i < pixels.length; i += 4) total += pixels[i] + pixels[i + 1] + pixels[i + 2]
    return total / (32 * 32 * 3)
  })
  const iso100 = await brightness()
  await iso.press('ArrowRight')
  await expect(iso).toHaveValue('200')
  await page.waitForTimeout(1000)
  expect(await brightness()).toBeGreaterThan(iso100 * 1.05)
  await page.screenshot({ path: test.info().outputPath('phone-camera.png') })
  await page.getByRole('tab', { name: 'Layout', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Portrait', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
