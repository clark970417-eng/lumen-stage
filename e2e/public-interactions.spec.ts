import { expect, test } from '@playwright/test'

// Keep the installed PWA cache from intercepting mocked feedback responses.
test.use({ serviceWorkers: 'block' })

test('switches all three languages', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('進棚拍攝前')
  await page.getByRole('button', { name: '日本語' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('撮影の前に')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Plan the light')
})

test('offers both simple and professional entry points', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open the studio free' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Choose your workspace' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: /Open simple mode/ })).toHaveAttribute('href', /ui=mobile/)
  await expect(dialog.getByRole('link', { name: /Open professional mode/ })).toHaveAttribute('href', /ui=full/)
})

test('keeps keyboard focus inside the workspace chooser and restores it on close', async ({ page }) => {
  await page.goto('/')
  const launcher = page.getByRole('button', { name: 'Open the studio free' }).first()
  await launcher.focus()
  await launcher.press('Enter')
  const close = page.getByRole('button', { name: 'Close mode chooser' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('link', { name: /Open professional mode/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(launcher).toBeFocused()
})

test('builds a reviewable issue draft from technical details only', async ({ page }) => {
  await page.goto('/support')
  const report = page.getByRole('link', { name: 'Create an issue report' })
  const href = await report.getAttribute('href')
  expect(href).toContain('lumen-stage-showcase/issues/new')
  expect(href).toContain('LUMEN+STAGE%3A+0.1.0')
  expect(href).toContain('Viewport%3A')
  expect(href).toContain('Browser%3A')
})

test('keeps the 3D engine out of the homepage payload', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name))
  expect(resources.some((url) => /three-vendor|pathtracer-vendor|\/App-|\/MobileApp-/.test(url))).toBeFalsy()
})

test('anonymous feedback preserves text after failure and clears after acceptance', async ({ page }) => {
  await page.goto('/')
  const section = page.locator('#feedback')
  const message = section.locator('textarea')
  await message.fill('Please add more lighting examples.')
  await page.route('**/api/feedback', (route) => route.fulfill({ contentType: 'application/json', body: '{"accessKey":"test-key"}' }))
  await page.route('https://api.web3forms.com/submit', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }))
  await section.getByRole('button', { name: 'Send feedback', exact: true }).click()
  await expect(section.getByRole('status')).toContainText('Could not send')
  await expect(message).toHaveValue('Please add more lighting examples.')
  await page.unroute('https://api.web3forms.com/submit')
  await page.route('https://api.web3forms.com/submit', async (route) => {
    expect(route.request().postDataJSON().email).toBeUndefined()
    expect(route.request().postDataJSON().access_key).toBe('test-key')
    await route.fulfill({ contentType: 'application/json', body: '{"success":true}' })
  })
  await section.getByRole('button', { name: 'Send feedback', exact: true }).click()
  await expect(section.getByRole('status')).toContainText('Feedback sent')
  await expect(message).toHaveValue('')
})


test('keeps homepage navigation focused and optional characters keyboard accessible', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link')).toHaveCount(3)
  const characters = page.locator('.cast-extra')
  await expect(characters).not.toHaveAttribute('open', '')
  await expect(characters.getByRole('heading', { level: 2 })).toBeHidden()
  await characters.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(characters.getByRole('heading', { level: 2 })).toBeVisible()
  await expect(characters.getByRole('group', { name: 'Choose a character', exact: true }).getByRole('button')).toHaveCount(4)
  await characters.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(characters.getByRole('heading', { level: 2 })).toBeHidden()
  await expect(page.locator('.audience-strip, .site-trust, .release-proof')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Load this setup' })).toHaveCount(3)
})


test('demo playback seeks through chapter buttons without a scrubber', async ({ page }) => {
  await page.goto('/')
  const demo = page.locator('#demo')
  const video = demo.locator('video')
  await expect(video).not.toHaveAttribute('controls')
  await expect(demo.getByRole('slider')).toHaveCount(0)
  await demo.getByRole('button', { name: /04 Confirm the camera/ }).click()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(5)
  await demo.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
})

test('interactive trial leaves the saved project untouched', async ({ page }) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('lumen-stage-scene-v22', 'saved-project-sentinel'))
  await page.getByRole('button', { name: 'Try the studio here' }).click()
  await page.locator('iframe.studio-trial').scrollIntoViewIfNeeded()
  const trial = page.frameLocator('iframe.studio-trial')
  await expect(trial.locator('canvas')).toBeVisible({ timeout: 30000 })
  await trial.getByRole('tab', { name: 'Light', exact: true }).click()
  await expect(trial.getByRole('slider').first()).toBeVisible({ timeout: 30000 })
  await trial.getByRole('slider').first().focus()
  await trial.getByRole('slider').first().press('ArrowRight')
  // Allow the normal 900 ms autosave debounce to pass.
  await page.waitForTimeout(1200)
  expect(await page.evaluate(() => localStorage.getItem('lumen-stage-scene-v22'))).toBe('saved-project-sentinel')
})
