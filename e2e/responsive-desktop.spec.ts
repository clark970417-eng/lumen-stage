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

  for (const size of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 900, height: 720 },
    { width: 1470, height: 956 },
  ]) {
    await page.setViewportSize(size)
    await page.waitForTimeout(150)
    const fit = await page.evaluate(() => {
      const shell = document.querySelector('main.app-shell')?.getBoundingClientRect()
      const header = document.querySelector('header.topbar')?.getBoundingClientRect()
      const stage = document.querySelector('.viewport')?.getBoundingClientRect()
      const leftRail = document.querySelector('.blueprint-panel')?.getBoundingClientRect()
      const rightRail = document.querySelector('.decision-console')?.getBoundingClientRect()
      const actions = document.querySelector('.project-actions')?.getBoundingClientRect()
      const canvas = document.querySelector('.viewport canvas')?.getBoundingClientRect()
      const workflow = document.querySelector('.workflow-navigation')?.getBoundingClientRect()
      const workflowLabels = [...document.querySelectorAll('.workflow-navigation span')].map((label) => label.getBoundingClientRect())
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        shellRight: shell?.right ?? Infinity,
        headerRight: header?.right ?? Infinity,
        stageWidth: stage?.width ?? 0,
        railsInside: Boolean(leftRail && rightRail && leftRail.left >= 0 && rightRail.right <= innerWidth + 1),
        actionsInside: Boolean(actions && actions.left >= 0 && actions.right <= innerWidth + 1),
        canvasFitsStage: Boolean(canvas && stage && canvas.width <= stage.width + 1 && canvas.height <= stage.height + 1),
        workflowLabelsInside: Boolean(workflow && workflowLabels.every((label) => label.left >= workflow.left - 1 && label.right <= workflow.right + 1)),
      }
    })
    expect(fit.documentWidth).toBeLessThanOrEqual(fit.viewport + 1)
    expect(fit.shellRight).toBeLessThanOrEqual(fit.viewport + 1)
    expect(fit.headerRight).toBeLessThanOrEqual(fit.viewport + 1)
    expect(fit.stageWidth).toBeGreaterThanOrEqual(300)
    expect(fit.railsInside).toBeTruthy()
    expect(fit.actionsInside).toBeTruthy()
    expect(fit.canvasFitsStage).toBeTruthy()
    expect(fit.workflowLabelsInside).toBeTruthy()
  }
})

test('keeps the simple studio canvas and desktop control rail in the same window', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('lumen-stage:onboarding:v2:mobile', 'done'))
  await page.setViewportSize({ width: 1470, height: 956 })
  await page.goto('/studio?ui=mobile')
  await expect(page.getByRole('tab', { name: 'Person' })).toBeVisible({ timeout: 50_000 })

  for (const size of [
    { width: 1470, height: 956 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 900, height: 720 },
  ]) {
    await page.setViewportSize(size)
    await page.waitForTimeout(150)
    const fit = await page.evaluate(() => {
      const shell = document.querySelector('.m-shell')?.getBoundingClientRect()
      const stage = document.querySelector('.m-viewport')?.getBoundingClientRect()
      const consolePanel = document.querySelector('.m-console')?.getBoundingClientRect()
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        shellRight: shell?.right ?? Infinity,
        stageWidth: stage?.width ?? 0,
        stageRight: stage?.right ?? Infinity,
        consoleRight: consolePanel?.right ?? 0,
        consoleWidth: consolePanel?.width ?? 0,
      }
    })

    expect(fit.documentWidth).toBeLessThanOrEqual(fit.viewport + 1)
    expect(fit.shellRight).toBeLessThanOrEqual(fit.viewport + 1)
    expect(fit.stageWidth).toBeGreaterThanOrEqual(300)
    expect(fit.stageRight).toBeLessThanOrEqual(fit.viewport + 1)
    if (size.width >= 901) {
      expect(fit.consoleWidth).toBeGreaterThanOrEqual(300)
      expect(fit.consoleRight).toBeLessThanOrEqual(fit.viewport + 1)
    }
  }
})
