import { expect, test } from '@playwright/test'

const desktopShapes = new Set(['chromium-ultrawide', 'chromium-tall', 'chromium-short-laptop'])

test('keeps the full studio inside unusual desktop screen shapes', async ({ page }, testInfo) => {
  test.skip(!desktopShapes.has(testInfo.project.name), 'Only the additional screen-shape projects run this check')
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

test('keeps the simple studio inside a phone screen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-phone', 'The phone project owns this check')
  test.setTimeout(90_000)
  await page.goto('/studio?ui=mobile')
  await expect(page.getByRole('tab', { name: 'Person' })).toBeVisible({ timeout: 30_000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
