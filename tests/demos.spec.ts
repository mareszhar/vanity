import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const studio = 'http://127.0.0.1:3100'
const comparisons = 'http://127.0.0.1:4173'

declare global {
  interface Window {
    __firstPaint?: { background: string, display: string }
  }
}

function captureBrowserErrors(page: Page): string[] {
  const failures: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      failures.push(`console ${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', error => failures.push(`page: ${error.message}`))
  page.on('requestfailed', (request) => {
    failures.push(`request: ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`)
  })
  return failures
}

function cssTimeMilliseconds(value: string): number {
  return value.endsWith('ms')
    ? Number.parseFloat(value)
    : Number.parseFloat(value) * 1000
}

/** Canvas resolves equivalent CSS Color syntax to the same rendered sRGB pixel. */
function renderedPair(element: Element): { background: string, color: string } {
  const pixel = (property: 'backgroundColor' | 'color') => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (context === null)
      throw new Error('2D canvas is unavailable')
    context.fillStyle = getComputedStyle(element)[property]
    context.fillRect(0, 0, 1, 1)
    return [...context.getImageData(0, 0, 1, 1).data].join(',')
  }
  return { background: pixel('backgroundColor'), color: pixel('color') }
}

async function captureFirstPaint(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const inspect = () => {
      const main = document.querySelector('main')
      if (main === null) {
        requestAnimationFrame(inspect)
        return
      }
      const style = getComputedStyle(main)
      window.__firstPaint = { background: style.backgroundColor, display: style.display }
    }
    requestAnimationFrame(inspect)
  })
}

test('the studio paints with CSS and projects every control onto one system', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  const stylesheets: Array<{ url: string, status: number }> = []
  // Begin in dark at the platform level; the first explicit selection below
  // proves a light application choice wins against the opposing OS preference.
  await page.emulateMedia({ colorScheme: 'dark' })
  await captureFirstPaint(page)
  page.on('response', (response) => {
    if (response.request().resourceType() === 'stylesheet')
      stylesheets.push({ url: response.url(), status: response.status() })
  })

  await page.goto(studio, { waitUntil: 'networkidle' })

  // First paint is real CSS, not a runtime style engine.
  expect(stylesheets.length).toBeGreaterThan(0)
  expect(stylesheets.filter(response => response.status >= 400)).toEqual([])
  expect(stylesheets.some(response => response.url.includes('.vanity.css'))).toBe(false)
  await expect.poll(() => page.evaluate(() => window.__firstPaint)).toMatchObject({ display: 'grid' })
  expect((await page.evaluate(() => window.__firstPaint))?.background).not.toBe('rgba(0, 0, 0, 0)')

  const root = page.locator('#prism-studio')
  const hue = page.getByRole('slider', { name: 'Palette hue' })
  const radius = page.getByRole('slider', { name: 'Radius' })
  const solid = page.getByRole('button', { name: 'Solid', exact: true })

  const readVar = (name: string) => root.evaluate((el, n) => getComputedStyle(el).getPropertyValue(n), name)

  // Hue writes one channel and re-derives the palette.
  await expect(hue).toHaveValue('275')
  const brandBefore = await readVar('--prism-color-brand')
  await hue.fill('160')
  await expect.poll(() => readVar('--prism-color-hue')).toBe('160')
  await expect.poll(() => readVar('--prism-color-brand')).not.toBe(brandBefore)
  // The runtime moves the hue slot only — it never re-serialises the whole color.
  expect(await root.evaluate(el => el.getAttribute('style'))).not.toContain('oklch')
  // The brand action keeps a legible (contrasting) foreground.
  expect(await solid.evaluate((el) => {
    const s = getComputedStyle(el)
    return s.color !== s.backgroundColor && s.color !== 'rgba(0, 0, 0, 0)'
  })).toBe(true)

  // Radius seed drives the derived scale.
  const radiusBefore = await solid.evaluate(el => getComputedStyle(el).borderRadius)
  await radius.fill('2')
  await expect.poll(() => solid.evaluate(el => getComputedStyle(el).borderRadius)).not.toBe(radiusBefore)

  // Explicit scheme wins over the OS preference, from one token set.
  await page.getByRole('radio', { name: 'Light', exact: true }).click()
  await expect(root).toHaveAttribute('data-scheme', 'light')
  await expect(root).toHaveCSS('color-scheme', 'light')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  const lightSurface = await root.evaluate(el => getComputedStyle(el).backgroundColor)
  // `onBrand` is derived from `brand`, not from the surrounding surface. A
  // scheme switch may retint the canvas, but it must never change either half
  // of this opaque brand pairing.
  const lightSolid = await solid.evaluate(renderedPair)
  await page.getByRole('radio', { name: 'Dark', exact: true }).click()
  await expect(root).toHaveAttribute('data-scheme', 'dark')
  await expect(root).toHaveCSS('color-scheme', 'dark')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await expect.poll(() => root.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(lightSurface)
  await expect.poll(() => solid.evaluate(renderedPair)).toEqual(lightSolid)
  // Shadows flatten in the dark, keep their layers in the light.
  await page.getByRole('radio', { name: 'Light', exact: true }).click()
  await expect(root).toHaveAttribute('data-scheme', 'light')
  const lightShadow = await solid.evaluate(el => getComputedStyle(el).boxShadow)
  await page.getByRole('radio', { name: 'Dark', exact: true }).click()
  await expect(root).toHaveAttribute('data-scheme', 'dark')
  await expect.poll(async () => {
    const shadow = await solid.evaluate(el => getComputedStyle(el).boxShadow)
    return shadow.includes('/ 0)') || shadow.includes('rgba(0, 0, 0, 0)')
  }).toBe(true)
  const darkShadow = await solid.evaluate(el => getComputedStyle(el).boxShadow)
  expect(darkShadow).not.toBe(lightShadow)

  // Density retunes spacing; typeface swaps a mutable family.
  const cozyPadding = await solid.evaluate(el => getComputedStyle(el).paddingInline)
  await page.getByRole('radio', { name: 'Compact', exact: true }).click()
  await expect(root).toHaveAttribute('data-density', 'compact')
  await expect.poll(() => solid.evaluate(el => getComputedStyle(el).paddingInline)).not.toBe(cozyPadding)
  const sansFamily = await root.evaluate(el => getComputedStyle(el).fontFamily)
  await page.getByRole('radio', { name: 'Serif', exact: true }).click()
  await expect.poll(() => root.evaluate(el => getComputedStyle(el).fontFamily)).not.toBe(sansFamily)
  await expect(root).toHaveCSS('font-family', /ui-serif/)

  // The inspector dialog is a complete, focus-managed surface.
  const openDialog = page.getByRole('button', { name: 'Inspect system' })
  await openDialog.click()
  const dialog = page.getByRole('dialog', { name: 'One coherent system' })
  await expect(dialog).toBeFocused()
  await expect(dialog).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(openDialog).toBeFocused()

  // Tabs are keyboard operable.
  await page.getByRole('tab', { name: 'Solid', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Soft', exact: true })).toHaveAttribute('aria-selected', 'true')

  // A reactive component value crosses one typed port; the stylesheet remains
  // static while the declaration and computed geometry change.
  const progressbar = page.getByRole('progressbar')
  const progressFill = progressbar.locator(':scope > div')
  const progressWidth = await progressFill.evaluate(el => getComputedStyle(el).inlineSize)
  await page.getByRole('button', { name: 'Advance', exact: true }).click()
  await expect(progressbar).toHaveAttribute('aria-valuenow', '76')
  await expect.poll(() => progressFill.evaluate(el => getComputedStyle(el).inlineSize)).not.toBe(progressWidth)

  // The specimen follows its own container, independently of the viewport.
  const resizer = page.locator('[data-capability="container-query"]')
  const specimen = page.locator('[data-capability="container-specimen"]')
  await resizer.evaluate((el) => {
    (el as HTMLElement).style.inlineSize = '20rem'
  })
  const stackedColumns = await specimen.evaluate(el => getComputedStyle(el).gridTemplateColumns)
  await resizer.evaluate((el) => {
    (el as HTMLElement).style.inlineSize = '42rem'
  })
  await expect.poll(() => specimen.evaluate(el => getComputedStyle(el).gridTemplateColumns)).not.toBe(stackedColumns)

  // The visible inspector facts are build-produced explain() projections.
  const explanation = page.locator('[data-capability="explanation"]')
  await expect(explanation.getByText('color.brand', { exact: true })).toBeVisible()
  await expect(explanation.getByText('shadow.panel', { exact: true })).toBeVisible()

  // Choices persist through SSR on reload.
  const persisted = await page.reload({ waitUntil: 'networkidle' })
  const html = await persisted!.text()
  expect(html).toContain('data-scheme="dark"')
  expect(html).toContain('data-density="compact"')
  await expect(hue).toHaveValue('160')

  // Reset returns to authored defaults and clears the axes.
  await page.getByRole('button', { name: 'Reset to defaults' }).click()
  await expect(hue).toHaveValue('275')
  await expect(root).not.toHaveAttribute('data-scheme')
  await expect(root).not.toHaveAttribute('data-density')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light dark')

  // No fictional users, personas, or region-specific names.
  await expect(page.getByText(/Devon|Priya|Aisha|Tomas|Sparrow/)).toHaveCount(0)
  expect(browserErrors, browserErrors.join('\n')).toEqual([])
})

test('the studio stays operable and accessible across phone, tablet, and desktop', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)

  for (const viewport of [
    { width: 360, height: 780 },
    { width: 820, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto(studio, { waitUntil: 'networkidle' })

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const semantics = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(el => el.id)
      const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
      const unnamedButtons = [...document.querySelectorAll('button')]
        .filter(button => !button.textContent?.trim() && !button.getAttribute('aria-label'))
        .length
      const unlabelledInputs = [...document.querySelectorAll('input, select')]
        .filter((control) => {
          const input = control as HTMLInputElement
          return input.labels?.length === 0 && !input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')
        })
        .length
      return { duplicateIds, unnamedButtons, unlabelledInputs }
    })
    expect(semantics).toEqual({ duplicateIds: [], unnamedButtons: 0, unlabelledInputs: 0 })
  }

  const inspect = page.getByRole('button', { name: 'Inspect system' })
  await inspect.focus()
  expect(await inspect.evaluate(el => el.matches(':focus-visible'))).toBe(true)
  await expect(inspect).toHaveCSS('outline-style', 'solid')

  // Reduced motion is authoritative over the motion axis.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('radio', { name: 'Springy', exact: true }).click()
  const bar = page.getByRole('img', { name: /replaying its entrance/ }).locator('span').first()
  await expect.poll(async () =>
    cssTimeMilliseconds(await bar.evaluate(el => getComputedStyle(el).animationDuration)),
  ).toBeCloseTo(0.001, 6)

  expect(browserErrors, browserErrors.join('\n')).toEqual([])
})

test('comparison lanes stay functional, visible, and live-themed', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await page.goto(comparisons, { waitUntil: 'networkidle' })

  const laneIds = ['sfc', 'tailwind', 'panda', 'extract', 'vanity'] as const
  await expect(page.locator('[data-lane]')).toHaveCount(5)
  await expect(page.getByRole('button', { name: 'Dispatch', exact: true })).toHaveCount(5)

  for (const lane of laneIds) {
    const progress = page.locator(`[data-lane="${lane}"] [role="progressbar"]`)
    await expect(progress).toBeVisible()
    expect((await progress.boundingBox())?.height, `${lane} progress must have height`).toBeGreaterThan(0)
  }

  // The shared live value reaches every lane, including Vanity's typed port.
  const vanityProgress = page.locator('[data-lane="vanity"] [role="progressbar"]')
  const vanityFill = vanityProgress.locator(':scope > div')
  const vanityWidth = await vanityFill.evaluate(el => getComputedStyle(el).inlineSize)
  await page.getByRole('slider', { name: 'Dispersion' }).fill('82')
  await expect(vanityProgress).toHaveAttribute('aria-valuenow', '82')
  await expect.poll(() => vanityFill.evaluate(el => getComputedStyle(el).inlineSize)).not.toBe(vanityWidth)

  const scheme = page.getByLabel('Scheme')
  await scheme.selectOption('light')
  const lightCards = await Promise.all(laneIds.map(lane => page
    .locator(`[data-lane="${lane}"] .card-block article`)
    .evaluate(el => getComputedStyle(el).backgroundColor)))
  const buttons = laneIds.map(lane => page.locator(`[data-lane="${lane}"] button`).first())
  // A solid CTA's opaque brand background is independent of the scheme-aware
  // card surrounding it. Vanity's `onBrand` foreground must be, too.
  const lightButtons = await Promise.all(buttons.map(button => button.evaluate(renderedPair)))
  await scheme.selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark')
  const darkCards = await Promise.all(laneIds.map(lane => page
    .locator(`[data-lane="${lane}"] .card-block article`)
    .evaluate(el => getComputedStyle(el).backgroundColor)))
  for (const [index, lane] of laneIds.entries())
    expect(darkCards[index], `${lane} must preserve its scheme pair`).not.toBe(lightCards[index])
  const darkButtons = await Promise.all(buttons.map(button => button.evaluate(renderedPair)))
  for (const [index, lane] of laneIds.entries())
    expect(darkButtons[index].background, `${lane} primary background must not follow the scheme`).toBe(lightButtons[index].background)
  const vanityIndex = laneIds.indexOf('vanity')
  expect(darkButtons[vanityIndex].color, 'Vanity onBrand must not follow the scheme').toBe(lightButtons[vanityIndex].color)

  // Every lane re-derives from the same live hue channel — the feature is
  // identical across models; only the authoring differs.
  const before = await Promise.all(buttons.map(button => button.evaluate(el => getComputedStyle(el).backgroundColor)))
  await page.getByRole('slider', { name: 'Brand hue' }).fill('20')
  for (const [index, button] of buttons.entries()) {
    await expect
      .poll(() => button.evaluate(el => getComputedStyle(el).backgroundColor), { message: `${laneIds[index]} must follow the hue` })
      .not
      .toBe(before[index])
  }

  expect(browserErrors, browserErrors.join('\n')).toEqual([])
})

test('the comparison matrix has no horizontal clipping at phone or desktop widths', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    await page.goto(comparisons, { waitUntil: 'networkidle' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await expect(page.locator('[data-lane]')).toHaveCount(5)
  }
  expect(browserErrors, browserErrors.join('\n')).toEqual([])
})
