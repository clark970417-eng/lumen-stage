import { expect, test } from '@playwright/test'

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
