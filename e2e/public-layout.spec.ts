import { expect, test } from '@playwright/test'

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
