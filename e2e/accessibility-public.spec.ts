import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const routes = ['/', '/privacy', '/terms', '/support'] as const

for (const route of routes) {
  test(`has no automatically detectable WCAG A/AA violations on ${route}`, async ({ page }) => {
    await page.goto(route)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
}
