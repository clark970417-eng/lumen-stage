import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const routes = ['/', '/privacy', '/terms', '/support'] as const

for (const route of routes) {
  test(`has no automatically detectable WCAG A/AA violations on ${route}`, async ({ page }, testInfo) => {
    test.skip(!['chromium-desktop', 'chromium-phone'].includes(testInfo.project.name), 'Axe runs once per desktop and phone DOM')
    await page.goto(route)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
}

test.describe('studio accessibility', () => {
  test.describe.configure({ mode: 'serial', timeout: 60_000 })
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The complete live studio DOM is scanned once')
  })

  for (const [name, route, readyName] of [
    ['professional', '/studio?ui=full', 'Project name'],
    ['simple', '/studio?ui=mobile', 'Person'],
  ] as const) {
    test(`${name} studio has no automatically detectable WCAG A/AA violations`, async ({ page }) => {
      await page.goto(route)
      if (name === 'professional') await expect(page.getByRole('textbox', { name: readyName })).toBeVisible({ timeout: 30_000 })
      else await expect(page.getByRole('tab', { name: readyName })).toBeVisible({ timeout: 30_000 })
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
    })
  }
})
