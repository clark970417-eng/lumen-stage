import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial', timeout: 60_000 })

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
