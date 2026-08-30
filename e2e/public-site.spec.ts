import { expect, test } from '@playwright/test'

test.describe('public site across supported screen shapes', () => {
  test('keeps the homepage inside the viewport', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('keeps legal and support pages readable', async ({ page }) => {
    for (const route of ['/privacy', '/terms', '/support']) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${route} should not overflow horizontally`).toBeLessThanOrEqual(1)
    }
  })
})

test.describe('critical public interactions', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'One engine is enough for interaction semantics')
  })

  test('switches all three languages', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '中文' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('進棚拍攝前')
    await page.getByRole('button', { name: '日本語' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('スタジオに入る前に')
    await page.getByRole('button', { name: 'English' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Plan the lights')
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
})
