import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial', timeout: 90_000 })

function watchRuntimeHealth(page: import('@playwright/test').Page) {
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error' || (message.type() === 'warning' && /shader error|webgl context lost|failed to (?:compile|link)|gltf.*(?:error|failed)/i.test(text))) {
      problems.push(`${message.type()}: ${text}`)
    }
  })
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === 'http://127.0.0.1:4173') {
      problems.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`)
    }
  })
  page.on('response', (response) => {
    if (new URL(response.url()).origin === 'http://127.0.0.1:4173' && response.status() >= 400) {
      problems.push(`response: ${response.status()} ${response.url()}`)
    }
  })
  return problems
}

test('guides a first-time beginner through simple mode without runtime failures', async ({ page }) => {
  // Software-rendered WebGL on GitHub's shared runner is substantially slower
  // than local hardware during the four animated onboarding transitions.
  test.setTimeout(180_000)
  const problems = watchRuntimeHealth(page)
  await page.goto('/studio?ui=mobile')
  await expect(page.getByRole('dialog', { name: 'Quick start tour' })).toBeVisible({ timeout: 50_000 })

  for (let step = 0; step < 4; step += 1) await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Start creating', exact: true }).click()

  await expect(page.getByRole('dialog', { name: 'Quick start tour' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Person' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Light' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Camera' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Layout' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lumen-stage:onboarding:v2:mobile'))).toBe('done')
  expect(problems).toEqual([])
})

test('lets an experienced user enter professional mode immediately without runtime failures', async ({ page }) => {
  const problems = watchRuntimeHealth(page)
  await page.goto('/studio?ui=full')
  await expect(page.getByRole('dialog', { name: 'Quick start tour' })).toBeVisible({ timeout: 50_000 })
  await page.getByRole('button', { name: 'Skip', exact: true }).click()

  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible()
  await expect(page.getByRole('button', { name: '+ Add to stage', exact: true })).toBeVisible()
  for (const mode of ['Person', 'Light', 'Camera', 'Layout']) {
    await expect(page.getByRole('button', { name: mode, exact: true })).toBeVisible()
  }
  expect(problems).toEqual([])
})

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
  await expect(page.getByRole('main', { name: /Lumen Stage/ })).toBeVisible({ timeout: 50_000 })
  await expect(page.getByRole('tab', { name: 'Person' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Light' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Camera' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Layout' })).toBeVisible()
})

test('keeps setup presets in Layout and exposes direct power and focal controls', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => localStorage.setItem('lumen-stage:onboarding:v2:mobile', 'done'))
  await page.goto('/studio?ui=mobile')
  await expect(page.getByRole('main', { name: /Lumen Stage/ })).toBeVisible({ timeout: 50_000 })

  await page.getByRole('tab', { name: 'Light' }).click()
  const power = page.getByRole('slider', { name: /Output power/ })
  await expect(power).toBeVisible()
  await expect(power).toHaveAttribute('max', /\d+/)
  await expect(page.getByRole('tab', { name: 'Portrait' })).toHaveCount(0)

  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('slider', { name: /輸出瓦數/ })).toBeVisible()
  await page.getByRole('button', { name: '日本語' }).click()
  await expect(page.getByRole('slider', { name: /出力ワット数/ })).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()

  await page.getByRole('tab', { name: 'Layout' }).click()
  await expect(page.getByRole('tab', { name: 'Portrait' })).toBeVisible()

  await page.getByRole('tab', { name: 'Camera' }).click()
  const focalLength = page.getByRole('slider', { name: /Focal length/ })
  await expect(focalLength).toHaveAttribute('min', '24')
  await expect(focalLength).toHaveAttribute('max', '200')
  await expect(page.getByRole('button', { name: '24–70' })).toHaveCount(0)
})

test('allows every subject, including the main subject, to be removed in the full workspace', async ({ page }) => {
  test.setTimeout(180_000)

  await page.addInitScript(() => {
    localStorage.setItem('lumen-stage:locale', 'en')
    localStorage.setItem('lumen-stage:onboarding:v2:desktop', 'done')
  })
  await page.goto('/studio?ui=full')

  const addPerson = async (label: 'Woman' | 'Man') => {
    await page.getByRole('button', { name: '+ Add to stage', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'Add to the stage' })
    await drawer.getByRole('button', { name: 'People & set', exact: true }).click()
    await drawer.getByText('Person', { exact: true }).click()
    await drawer.getByText(label, { exact: true }).click()
  }

  await addPerson('Woman')
  const removeSupporting = page.getByRole('button', { name: 'Remove selected item: Subject 1' })
  await expect(removeSupporting).toBeVisible()
  await removeSupporting.click()
  await expect(removeSupporting).toHaveCount(0)

  const removeMain = page.getByRole('button', { name: 'Remove selected item: Main subject' })
  await expect(removeMain).toBeVisible({ timeout: 50_000 })
  await removeMain.click()
  await expect(removeMain).toHaveCount(0)
  await expect(page.getByText('Main subject', { exact: true })).toHaveCount(0)

  await addPerson('Woman')
  await addPerson('Man')
  await expect(page.getByRole('button', { name: 'Remove selected item: Subject 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove selected item: Subject 2' })).toBeVisible()
})

test('keeps multi-person controls available after deleting the last subject in the simple workspace', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    localStorage.setItem('lumen-stage:locale', 'en')
    localStorage.setItem('lumen-stage:onboarding:v2:mobile', 'done')
  })
  await page.goto('/studio?ui=mobile')

  const addFeminine = page.getByRole('button', { name: '＋ Feminine', exact: true })
  const addMasculine = page.getByRole('button', { name: '＋ Masculine', exact: true })
  await expect(addFeminine).toBeVisible({ timeout: 50_000 })
  await addFeminine.click()
  await addMasculine.click()
  await expect(page.locator('.m-subject-bar .m-chips').first().getByRole('button')).toHaveCount(3)

  const remove = page.locator('.m-subject-actions').getByRole('button', { name: 'Delete', exact: true })
  await remove.click()
  await remove.click()
  await remove.click()
  await expect(remove).toHaveCount(0)
  await expect(page.locator('.m-subject-bar .m-chips').first().getByRole('button')).toHaveCount(0)
  await expect(addFeminine).toBeVisible()
  await expect(addMasculine).toBeVisible()
})
