import { expect, test } from '@playwright/test'

test.describe('studio release flows', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 })
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Full WebGL workflow is verified once in Chromium')
  })

  test('autosaves a renamed project and exports its backup', async ({ page }) => {
    await page.goto('/studio?ui=full')
    const projectName = page.getByRole('textbox', { name: 'Project name' })
    await expect(projectName).toBeVisible({ timeout: 20_000 })
    await projectName.fill('Browser release check')
    await expect(page.getByText('Auto-saved', { exact: true })).toBeVisible({ timeout: 10_000 })
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.lumen\.json$/)
  })

  test('opens the simple workspace when explicitly requested', async ({ page }) => {
    await page.goto('/studio?ui=mobile')
    await expect(page.getByRole('main', { name: /Lumen Stage/ })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('tab', { name: 'Person' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Light' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Camera' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Layout' })).toBeVisible()
  })
})

test('shows a recoverable message when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (contextId, options) {
      if (contextId === 'webgl' || contextId === 'webgl2') return null
      return original.call(this, contextId, options as CanvasRenderingContext2DSettings)
    } as typeof HTMLCanvasElement.prototype.getContext
  })
  await page.goto('/studio?ui=full')
  await expect(page.getByRole('heading', { name: 'This device cannot open the 3D studio.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Compatibility help' })).toBeVisible()
})
