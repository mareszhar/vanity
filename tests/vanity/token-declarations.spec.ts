import type { TokenDeclarationFixtures } from './token-declarations.fixture'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// The compiler emits this CSS; the browser decides what a subtree inherits.
// Expectations below are independent platform values, never read from Vanity.
const fixtures = JSON.parse(execFileSync(process.execPath, [
  '--import',
  'tsx',
  fileURLToPath(new URL('./token-declarations.fixture.ts', import.meta.url)),
], { encoding: 'utf8' })) as TokenDeclarationFixtures
const { css, value: zones } = fixtures.live

const consumer = `
  [data-probe] {
    color: var(--probe-accent-soft);
    background-color: var(--probe-surface);
    outline-color: var(--probe-accent-wash);
  }
`

async function render(page: import('@playwright/test').Page, scheme: 'light' | 'dark') {
  await page.setContent(`
    <style>${css}${consumer}</style>
    <span data-probe id="outside"></span>
    <div class="${zones.propagated}"><span data-probe id="propagated"></span></div>
    <div class="${zones.literal}"><span data-probe id="literal"></span></div>
    <span id="root-soft" style="color: oklch(0.95 0.15 265)"></span>
    <span id="zone-soft" style="color: oklch(0.95 0.2 25)"></span>
    <span id="zone-surface" style="background-color: oklch(${scheme === 'light' ? 0.9 : 0.3} 0.2 25)"></span>
    <span id="zone-wash" style="outline-color: oklch(0.95 0.2 25 / 0.5)"></span>
  `)
  await page.locator('html').evaluate((element, mode) => element.setAttribute('data-scheme', mode), scheme)
}

function computed(page: import('@playwright/test').Page, id: string) {
  return page.locator(`#${id}`).evaluate((element) => {
    const style = getComputedStyle(element)
    return { color: style.color, background: style.backgroundColor, outline: style.outlineColor }
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`tdec.propagated re-derives live dependents inside the subtree (${scheme})`, async ({ page }) => {
    await render(page, scheme)

    const propagated = await computed(page, 'propagated')
    expect(propagated.color).toBe((await computed(page, 'zone-soft')).color)
    expect(propagated.background).toBe((await computed(page, 'zone-surface')).background)
    expect(propagated.outline).toBe((await computed(page, 'zone-wash')).outline)

    // Outside the zone the root values still hold, and plain tdec stays
    // literal: an inherited dependent keeps the value substituted at the root.
    const rootSoft = (await computed(page, 'root-soft')).color
    expect((await computed(page, 'outside')).color).toBe(rootSoft)
    expect((await computed(page, 'literal')).color).toBe(rootSoft)
  })
}

test('propagation resolves escaped and Unicode var references on the subtree', async ({ page }) => {
  const emitted = fixtures.numeric
  await page.setContent(`
    <style>${emitted.css}
      [data-probe] { width: calc(var(--café-live) * 1px); height: calc(var(--café-next) * 1px) }
    </style>
    <div data-probe id="outside"></div>
    <div class="${emitted.value.propagated}"><div data-probe id="zone"></div></div>
    <div class="${emitted.value.literal}"><div data-probe id="literal"></div></div>
  `)
  for (const [id, width, height] of [['outside', '4px', '5px'], ['zone', '6px', '7px'], ['literal', '4px', '5px']]) {
    const size = await page.locator(`#${id}`).evaluate((element) => {
      const style = getComputedStyle(element)
      return { width: style.width, height: style.height }
    })
    expect(size).toEqual({ width, height })
  }
})

for (const density of ['cozy', 'compact'] as const) {
  for (const tone of ['warm', 'cool'] as const) {
    test(`a folded intersection is flattened only when the scoped value is invariant (${density}, ${tone})`, async ({ page }) => {
      const emitted = fixtures.folded
      const intersection = density === 'compact' && tone === 'cool'
      await page.setContent(`
        <style>${emitted.css}
          [data-probe] { color: var(--intersection-on); background: var(--intersection-bg) }
        </style>
        <div data-probe id="outside"></div>
        <div class="${emitted.value}"><div data-probe id="zone"></div></div>
        <div id="root-reference" style="color: ${intersection ? 'black' : 'white'}; background: oklch(${intersection ? 0.9 : 0} 0 0)"></div>
        <div id="zone-reference" style="color: white; background: oklch(0 0 0)"></div>
      `)
      await page.locator('html').evaluate((element, modes) => {
        element.setAttribute('data-density', modes.density)
        element.setAttribute('data-tone', modes.tone)
      }, { density, tone })
      expect(await computed(page, 'outside')).toEqual(await computed(page, 'root-reference'))
      expect(await computed(page, 'zone')).toEqual(await computed(page, 'zone-reference'))
    })
  }
}
