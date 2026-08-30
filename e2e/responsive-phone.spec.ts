import { expect, test } from '@playwright/test'

test('keeps the simple studio inside a phone screen', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/studio?ui=mobile')
  await expect(page.getByRole('tab', { name: 'Person' })).toBeVisible({ timeout: 30_000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
