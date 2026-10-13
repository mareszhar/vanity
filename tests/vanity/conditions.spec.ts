import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const emitted = JSON.parse(execFileSync(process.execPath, [
  '--import',
  'tsx',
  fileURLToPath(new URL('./conditions.fixture.ts', import.meta.url)),
], { encoding: 'utf8' })) as {
  css: string
  value: Record<string, string>
  axis: { css: string, value: string, seed: unknown, props: { attributes: Record<string, string> }, runtime: string }
}

const base = '@layer base, vanity; @layer base { div { padding: 4px } }'

test('registered selectors preserve descendant nesting and explicit self state', async ({ page }) => {
  const { value: classes } = emitted
  await page.setContent(`<!doctype html><style>${base}${emitted.css}</style>
    <div class="${classes.selected}" data-selected id="own"><div data-selected id="descendant"></div></div>
    <div data-selected id="unrelated"></div>
    <div class="${classes.raw}" data-selected id="raw-own"><div data-selected id="raw-descendant"></div></div>
    <div class="${classes.self}" data-selected id="self"></div>`)
  for (const [id, padding] of [['own', '4px'], ['descendant', '9px'], ['unrelated', '4px'], ['raw-own', '4px'], ['raw-descendant', '9px'], ['self', '9px']]) {
    expect(await page.locator(`#${id}`).evaluate(element => getComputedStyle(element).padding)).toBe(padding)
  }
})

test('anchored conjunction, disjunction and nested negation match native nesting', async ({ page }) => {
  expect(emitted.css).not.toContain(':not(:scope)')
  const native = `
    .native-negated { &:not(&[data-density='compact']) { padding: 9px } }
    .native-disjunction { &:not(&[data-density='compact'], [data-selected]) { padding: 9px } }
    .native-double { &:not(:not(&[data-density='compact'])) { padding: 9px } }
    .native-literalList { &:not(&[data-density='compact'], &[data-selected]) { padding: 9px } }
  `
  const states = [{ name: 'compact', attrs: 'data-density="compact"' }, { name: 'selected', attrs: 'data-selected' }, { name: 'plain', attrs: '' }]
  const kinds = ['negated', 'disjunction', 'double', 'literalList']
  await page.setContent(`<!doctype html><style>${base}${emitted.css}${native}</style>${kinds.flatMap(kind => states.map(state => `
    <div id="${kind}-${state.name}" class="${emitted.value[kind]}" ${state.attrs}></div>
    <div id="native-${kind}-${state.name}" class="native-${kind}" ${state.attrs}></div>
  `)).join('')}`)
  for (const kind of kinds) {
    for (const state of states) {
      const actual = await page.locator(`#${kind}-${state.name}`).evaluate(element => getComputedStyle(element).padding)
      const native = await page.locator(`#native-${kind}-${state.name}`).evaluate(element => getComputedStyle(element).padding)
      expect(actual).toBe(native)
    }
  }
  expect(await page.locator('#negated-compact').evaluate(element => getComputedStyle(element).padding)).toBe('4px')
})

test('axis negation under a custom root matches nesting and runtime SSR projection', async ({ page }) => {
  const { axis } = emitted
  await page.setContent(`<!doctype html><style>${axis.css}
    .native-zone { --native-width: 4px; &:not(&[data-density='compact']) { --native-width: 9px } }
    .native-row { width: var(--native-width) }</style>
    <div id="client" class="zone" data-density="compact"><div id="row" class="${axis.value}"></div></div>
    <div class="native-zone" data-density="compact"><div id="native" class="native-row"></div></div>
    <div class="zone" ${Object.entries(axis.props.attributes).map(([key, value]) => `${key}="${value}"`).join(' ')}><div id="ssr" class="${axis.value}"></div></div>`)
  expect(await page.locator('#row').evaluate(element => getComputedStyle(element).width)).toBe('4px')
  expect(await page.locator('#native').evaluate(element => getComputedStyle(element).width)).toBe('4px')
  expect(axis.css).not.toContain(':not(:scope)')
  await page.addScriptTag({ content: axis.runtime })
  const result = await page.evaluate(() => (window as unknown as { switchDensity: (mode: string) => unknown }).switchDensity('relaxed'))
  expect(result).toEqual({ snapshot: axis.seed, props: axis.props, current: 'relaxed' })
  expect(await page.locator('#client').getAttribute('data-density')).toBe('relaxed')
  expect(await page.locator('#row').evaluate(element => getComputedStyle(element).width)).toBe('9px')
  expect(await page.locator('#ssr').evaluate(element => getComputedStyle(element).width)).toBe('9px')
  await page.evaluate(() => (window as unknown as { switchDensity: (mode: string) => unknown }).switchDensity('default'))
  expect(await page.locator('#client').getAttribute('data-density')).toBe('compact')
  expect(await page.locator('#row').evaluate(element => getComputedStyle(element).width)).toBe('4px')
})
