import { expect, test } from '@playwright/test'

// Keep the installed PWA cache from intercepting mocked feedback responses.
test.use({ serviceWorkers: 'block' })

test('switches all three languages', async ({ page }) => {
  await page.goto('/')
  await page.locator('.site-language-picker summary').click()
  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('進棚拍攝前')
  await page.locator('.site-language-picker summary').click()
  await page.getByRole('button', { name: '日本語' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('撮影の前に')
  await page.locator('.site-language-picker summary').click()
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
  await page.goto('/support')
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


test('keeps the homepage focused on features, workflow, presets and FAQ', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link')).toHaveCount(4)
  await expect(page.locator('.product-features article')).toHaveCount(4)
  await expect(page.locator('.cast-gallery, .release-proof, #feedback')).toHaveCount(0)
  await expect(page.locator('#setups .preset-comparison')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Load this setup' })).toHaveCount(3)
})

test('demo playback uses chapter buttons without player controls', async ({ page }) => {
  await page.goto('/')
  const demo = page.locator('#demo')
  const video = demo.locator('video')
  await expect(video).not.toHaveAttribute('controls')
  await expect(demo.getByRole('slider')).toHaveCount(0)
  await demo.getByRole('button', { name: /04 Confirm the camera/ }).click()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(5)
  await expect(demo.locator('.demo-screen button')).toHaveCount(0)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)
})
