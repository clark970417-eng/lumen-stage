import { expect, test } from '@playwright/test'

test('keeps the full studio inside unusual desktop screen shapes', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/studio?ui=full')
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible({ timeout: 30_000 })
  const layout = await page.evaluate(() => {
    const header = document.querySelector('header.topbar')?.getBoundingClientRect()
    const stage = document.querySelector('.viewport')?.getBoundingClientRect()
    return {
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      headerInside: Boolean(header && header.left >= 0 && header.right <= innerWidth && header.top >= 0),
      stageUsable: Boolean(stage && stage.width >= 320 && stage.height >= 300 && stage.right <= innerWidth),
    }
  })
  expect(layout.overflowX).toBeLessThanOrEqual(1)
  expect(layout.headerInside).toBeTruthy()
  expect(layout.stageUsable).toBeTruthy()
})
