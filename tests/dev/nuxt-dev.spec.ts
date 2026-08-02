import type { Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const origin = 'http://127.0.0.1:3200'
const foundationsFile = fileURLToPath(new URL('../../sandbox/demo-main/app/assets/styles/design/foundations.tokens.ts', import.meta.url))
const appStyleFile = fileURLToPath(new URL('../../sandbox/demo-main/app/assets/styles/components/app.css.ts', import.meta.url))

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

async function loadCount(page: Page): Promise<number> {
  try {
    return await page.evaluate(() => Number(sessionStorage.getItem('vanity-dev-loads')))
  }
  catch {
    // An export-shape edit intentionally replaces the document.
    return -1
  }
}

test('Nuxt dev keeps first paint styled and HMR deterministic', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  const stylesheets: Array<{ url: string, status: number }> = []
  const originalFoundations = await readFile(foundationsFile, 'utf8')
  const originalAppStyle = await readFile(appStyleFile, 'utf8')

  page.on('response', (response) => {
    if (response.request().resourceType() === 'stylesheet')
      stylesheets.push({ url: response.url(), status: response.status() })
  })

  await page.addInitScript(() => {
    const loads = Number(sessionStorage.getItem('vanity-dev-loads') ?? 0) + 1
    sessionStorage.setItem('vanity-dev-loads', String(loads))

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

  try {
    for (let reload = 0; reload < 4; reload++) {
      if (reload === 0)
        await page.goto(origin, { waitUntil: 'networkidle' })
      else
        await page.reload({ waitUntil: 'networkidle' })

      await expect.poll(() => page.evaluate(() => window.__firstPaint)).not.toBeUndefined()
      expect((await page.evaluate(() => window.__firstPaint))?.display).not.toBe('none')
      expect((await page.evaluate(() => window.__firstPaint))?.background).not.toBe('rgba(0, 0, 0, 0)')
    }

    expect(stylesheets.some(response => response.url.includes('.vanity.css'))).toBe(true)
    expect(stylesheets.filter(response => response.status >= 400)).toEqual([])

    const loadsBeforeHmr = await loadCount(page)
    const solid = page.getByRole('button', { name: 'Solid', exact: true })
    const radiusBefore = await solid.evaluate(el => getComputedStyle(el).borderRadius)

    // A dependency-token edit hot-updates every style module built on it, no reload.
    expect(originalFoundations).toContain('val: open.length.px(12)')
    await writeFile(foundationsFile, originalFoundations.replace('val: open.length.px(12)', 'val: open.length.px(20)'))
    await expect.poll(() => solid.evaluate(el => getComputedStyle(el).borderRadius)).not.toBe(radiusBefore)
    expect(await loadCount(page)).toBe(loadsBeforeHmr)

    // An export-shape change costs exactly one reload.
    const probe = '\nexport const __vanityHmrShapeProbe = style({ opacity: 1 })\n'
    await writeFile(appStyleFile, `${originalAppStyle}${probe}`)
    await expect.poll(() => loadCount(page)).toBe(loadsBeforeHmr + 1)
    await page.waitForTimeout(750)
    expect(await loadCount(page)).toBe(loadsBeforeHmr + 1)

    expect(browserErrors, browserErrors.join('\n')).toEqual([])
  }
  finally {
    await Promise.all([
      writeFile(foundationsFile, originalFoundations),
      writeFile(appStyleFile, originalAppStyle),
    ])
  }
})
