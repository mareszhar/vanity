// Run: pnpm --filter spike-element-provenance test
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const { manifest, result: expected } = JSON.parse(await readFile(new URL('./provenance-fixture.json', import.meta.url)))
const { observed } = JSON.parse(await readFile(new URL('./emission-observations.json', import.meta.url)))
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.setContent(`<main>
    <div id="small" class="${observed.recipe.small}"></div><div id="large" class="${observed.recipe.large}"></div>
    <div id="empty" class="${observed.empty.quiet}"></div><div id="bound" class="${observed.empty.quiet}" data-vanity-variant='{"tone":"loud"}'></div>
    <div id="anatomy-root" class="${observed.anatomy.comfy.root}"><span id="label" class="${observed.anatomy.comfy.label}"></span></div>
    <span id="orphan" class="${observed.anatomy.comfy.label}"></span>
    <div id="outer" class="${observed.anatomy.comfy.root}"><div id="inner" class="${observed.anatomy.compact.root}"><span id="nested" class="${observed.anatomy.compact.label}"></span></div></div>
  </main>`)
  const model = await readFile(new URL('./model.mjs', import.meta.url), 'utf8')
  const binding = await readFile(new URL('./binding.mjs', import.meta.url), 'utf8')
  await page.addScriptTag({ type: 'module', content: `${model.replaceAll('export function', 'function')}\n${binding.replace('import { validateSelection } from \'./model.mjs\'', '').replaceAll('export function', 'function')}\nObject.assign(window, { inspectElement, inferVariant, validateSelection, createVariantDirective, inspectInstance, modelReady: true });` })
  await page.waitForFunction(() => window.modelReady)
  const result = await page.evaluate(manifest => Object.fromEntries(['small', 'large', 'empty', 'bound', 'label', 'orphan', 'nested'].map(id => [id, window.inspectElement(document.getElementById(id), manifest)])), manifest)
  for (const [name, value] of Object.entries(result)) assert.deepEqual(value, expected[name], name)
  const compound = await page.evaluate(({ recipe, observed }) => ({ loudActive: window.inferVariant(observed.compound.loudActive.split(' '), recipe), active: window.inferVariant(observed.compound.active.split(' '), recipe), quiet: window.inferVariant(observed.compound.quiet.split(' '), recipe), bindingDefaults: window.inferVariant([], recipe, 'root', {}), invalid: window.inferVariant([], recipe, 'root', { tone: 'unknown' }), badToggle: window.validateSelection(recipe, { active: 'yes' }), unknown: window.validateSelection(recipe, { mystery: true }) }), { recipe: manifest.recipes.compound, observed })
  assert.deepEqual(compound, expected.compoundResults)
  const directive = await page.evaluate((recipe) => {
    const element = document.getElementById('small')
    const directive = window.createVariantDirective()
    directive.mounted(element, { value: { recipe, selection: {} } })
    const defaults = JSON.parse(element.dataset.vanityVariant)
    directive.updated(element, { value: { recipe, selection: { size: 'invalid' } } })
    const invalid = { absent: element.dataset.vanityVariant === undefined, errors: JSON.parse(element.dataset.vanityVariantErrors) }
    directive.updated(element, { value: { recipe, selection: { size: 'large' } } })
    return { defaults, invalid, updated: JSON.parse(element.dataset.vanityVariant), errorsRemoved: element.dataset.vanityVariantErrors === undefined }
  }, manifest.recipes.row)
  assert.deepEqual(directive.defaults, { size: 'small' })
  assert.equal(directive.invalid.absent, true)
  assert.ok(directive.invalid.errors.some(error => error.startsWith('Invalid selection:')))
  assert.deepEqual(directive.updated, { size: 'large' })
  assert.equal(directive.errorsRemoved, true)
  await page.setContent('<main><ul><li data-vanity-key="alpha">Same</li><li data-vanity-key="beta">Same</li></ul><p>Unique</p><div data-vanity-key="collision">Repeated key</div><div data-vanity-key="collision">Repeated key</div></main>')
  const instances = await page.evaluate(() => {
    const rows = document.querySelectorAll('li')
    const keyed = window.inspectInstance(rows[1])
    rows.forEach(row => row.removeAttribute('data-vanity-key'))
    return { keyed, weak: window.inspectInstance(rows[1]), unique: window.inspectInstance(document.querySelector('p')), duplicate: window.inspectInstance(document.querySelector('div')) }
  })
  assert.equal(instances.keyed.strength, 'app-key')
  assert.equal(instances.weak.strength, 'ambiguous')
  assert.equal(instances.weak.candidates, 2)
  assert.equal(instances.unique.strength, 'locator')
  assert.equal(instances.duplicate.strength, 'ambiguous')
  assert.equal(instances.keyed.index, 2)
  assert.ok(instances.keyed.path.includes('li:nth-child(2)'))
  console.log('Class/default/empty/toggle/compound inference, anatomy ancestry and validated directive passed')
}
finally { await browser.close() }
await import('./nuxt.mjs')
await import('./production.mjs')
