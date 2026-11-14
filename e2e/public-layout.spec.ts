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

test('stacks mobile media and controls without cropping at narrow and landscape widths', async ({ page }) => {
  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 })
    await page.goto('/')
    await expect(page.locator('.preset-workbench')).toBeVisible()
    const layout = await page.evaluate(() => {
      const rect = (selector: string) => {
        const box = document.querySelector(selector)!.getBoundingClientRect()
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
      }
      return {
        video: rect('.demo-screen'),
        nodes: rect('.demo-console ol'),
        presets: rect('.setup-showcase'),
        comparison: rect('.preset-comparison'),
        nodeRows: Array.from(document.querySelectorAll('.demo-console li')).map((item) => item.getBoundingClientRect().top),
        imageFit: getComputedStyle(document.querySelector('.compare-stage > img')!).objectFit,
        videoFit: getComputedStyle(document.querySelector('.demo-screen video')!).objectFit,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(layout.nodes.top).toBeGreaterThanOrEqual(layout.video.bottom - 1)
    expect(layout.comparison.top).toBeGreaterThanOrEqual(layout.presets.bottom - 1)
    for (let index = 1; index < layout.nodeRows.length; index++) expect(layout.nodeRows[index]).toBeGreaterThan(layout.nodeRows[index - 1])
    for (const box of [layout.video, layout.nodes, layout.presets, layout.comparison]) {
      expect(box.left).toBeGreaterThanOrEqual(-1)
      expect(box.right).toBeLessThanOrEqual(width + 1)
    }
    expect(layout.imageFit).toBe('contain')
    expect(layout.videoFit).toBe('contain')
    expect(layout.overflow).toBeLessThanOrEqual(1)
  }
})

test('keeps feature panels aligned and the comparison handle visible at both ends', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const figure = await page.locator('.feature-workspace figure').boundingBox()
  const list = await page.locator('.feature-list').boundingBox()
  expect(Math.abs(figure!.y - list!.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(figure!.height - list!.height)).toBeLessThanOrEqual(1)
  const input = page.locator('.compare-stage input')
  for (const key of ['Home', 'End']) {
    await input.press(key)
    const stage = await page.locator('.compare-stage').boundingBox()
    const handle = await page.locator('.compare-handle i').boundingBox()
    expect(handle!.x).toBeGreaterThanOrEqual(stage!.x)
    expect(handle!.x + handle!.width).toBeLessThanOrEqual(stage!.x + stage!.width)
  }
})

test('shows the complete hero artwork beside desktop copy and below mobile copy', async ({ page }) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const artwork = page.locator('.hero-instrument img')
    await expect(artwork).toHaveJSProperty('naturalWidth', 1280)
    const image = await artwork.boundingBox()
    const copy = await page.locator('.hero-copy').boundingBox()
    if (width === 1440) expect(image!.x).toBeGreaterThan(copy!.x + copy!.width)
    else expect(image!.y).toBeGreaterThan(copy!.y + copy!.height)
    expect(image!.x).toBeGreaterThanOrEqual(0)
    expect(image!.x + image!.width).toBeLessThanOrEqual(width)
    expect(image!.width / image!.height).toBeCloseTo(1.25, 1)
    await expect(page.locator('.hero-instrument figcaption')).toBeVisible()
  }
})
