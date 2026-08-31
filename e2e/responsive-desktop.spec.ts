import { expect, test } from '@playwright/test'

test('keeps the full studio inside unusual desktop screen shapes', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/studio?ui=full')
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible({ timeout: 50_000 })
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

test('reflows immediately when a full studio window is resized', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('lumen-stage:onboarding:v2:desktop', 'done'))
  await page.setViewportSize({ width: 1470, height: 956 })
  await page.goto('/studio?ui=full')
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible({ timeout: 50_000 })

  for (const size of [{ width: 1180, height: 820 }, { width: 1024, height: 700 }, { width: 900, height: 720 }, { width: 1470, height: 956 }]) {
    await page.setViewportSize(size)
    await page.waitForTimeout(150)
    const fit = await page.evaluate(() => {
      const shell = document.querySelector('main.app-shell')?.getBoundingClientRect()
      const header = document.querySelector('header.topbar')?.getBoundingClientRect()
      const stage = document.querySelector('.viewport')?.getBoundingClientRect()
      const workflow = document.querySelector('.workflow-navigation')?.getBoundingClientRect()
      const workflowLabels = [...document.querySelectorAll('.workflow-navigation span')].map((label) => label.getBoundingClientRect())
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        shellRight: shell?.right ?? Infinity,
        headerRight: header?.right ?? Infinity,
        stageWidth: stage?.width ?? 0,
        workflowLabelsInside: Boolean(workflow && workflowLabels.every((label) => label.left >= workflow.left - 1 && label.right <= workflow.right + 1)),
      }
    })
    expect(fit.documentWidth).toBeLessThanOrEqual(fit.viewport + 1)
    expect(fit.shellRight).toBeLessThanOrEqual(fit.viewport + 1)
    expect(fit.headerRight).toBeLessThanOrEqual(fit.viewport + 1)
    expect(fit.stageWidth).toBeGreaterThanOrEqual(300)
    expect(fit.workflowLabelsInside).toBeTruthy()
  }
})
