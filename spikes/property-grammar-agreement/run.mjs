// Run: pnpm --filter spike-property-grammar-agreement test
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { chromium } from '@playwright/test'
import { parse } from 'css-tree'
import { attributeHole, observeAttribution } from './attribution.mjs'
import { enumerateEnvironments, measureEnvironmentProduct, resolveFixtureValue } from './environments.mjs'
import { getMathSubstitutions } from './math-types.mjs'
import { emitNumber, getLexer, getPropertyFamily, grammar, inspectDeclaration, platformGaps } from './model.mjs'

const start = performance.now()
const regenerate = process.argv.includes('--generate-gaps')
for (const [name, valid, invalid] of [
  ['calc', 'calc(1px * 2)', 'calc(1px + 1s)'],
  ['min', 'min(1px, 2px)', 'min(1px, 2s)'],
  ['max', 'max(1px, 2px)', 'max(1px, 2s)'],
  ['clamp', 'clamp(1px, 2px, 3px)', 'clamp(1px, 2s, 3px)'],
]) {
  const classify = value => getMathSubstitutions(parse(value, { context: 'value', positions: true }), value, getLexer('padding').units)
  assert.deepEqual(classify(valid), { status: 'accepted', values: ['1px'] }, `${name} establishes the valid length type`)
  assert.equal(classify(invalid).status, 'rejected', `${name} rejects incompatible dimensions`)
  assert.equal(inspectDeclaration('padding', valid).status, 'accepted', `${name} validates a length`)
  assert.equal(inspectDeclaration('padding', invalid).status, 'rejected', `${name} reports the mismatch`)
}
const corpus = JSON.parse(readFileSync(new URL('./corpus.json', import.meta.url)))
const rows = [...grammar.propertyNames.flatMap(property => [
  ...corpus.strings.map(authored => ({ property, authored, value: authored })),
  ...corpus.numbers.map(authored => ({ property, authored, value: emitNumber(property, authored) })),
]), ...corpus.additional.map(({ property, value }) => ({ property, value, authored: value }))]
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const oracle = await page.evaluate(rows => rows.map(row => CSS.supports(row.property, row.value)), rows)
  const counts = { accepted: 0, rejected: 0, unresolved: 0, errored: 0 }
  const rawCounts = { ...counts }
  const observedGaps = {}
  const errors = []
  const finalDisagreements = []
  for (const [index, row] of rows.entries()) {
    const raw = inspectDeclaration(row.property, row.value, { useFallback: false })
    rawCounts[raw.status]++
    if (raw.status === 'errored')
      errors.push({ ...row, result: raw, stage: 'raw' })
    if (['accepted', 'rejected'].includes(raw.status) && (raw.status === 'accepted') !== oracle[index]) {
      const cells = observedGaps[row.property] ??= []
      cells.push({ authored: row.authored, value: row.value, status: raw.status, browser: oracle[index] })
    }
    const result = inspectDeclaration(row.property, row.value)
    counts[result.status]++
    if (result.status === 'errored')
      errors.push({ ...row, result, stage: 'fallback' })
    if (['accepted', 'rejected'].includes(result.status) && (result.status === 'accepted') !== oracle[index])
      finalDisagreements.push({ ...row, result, browser: oracle[index] })
  }
  const names = Object.keys(observedGaps).sort()
  const support = await page.evaluate(names => Object.fromEntries(names.map(property => [property, CSS.supports(property, 'initial')])), names)
  const agreement = Object.fromEntries(names.map(property => [property, {
    reason: support[property] ? 'Pinned Chromium and pinned grammar disagree on listed cells; family unresolved' : 'Pinned Chromium does not support this grammar property; family unresolved',
    href: grammar.properties[property].href,
    supported: support[property],
    cells: observedGaps[property],
  }]))
  const familyLedger = {
    browser: browser.version(),
    families: names.length,
    unsupported: names.filter(name => !support[name]).length,
    supported: names.filter(name => support[name]).length,
    cells: names.reduce((count, name) => count + observedGaps[name].length, 0),
    entries: names.map(property => ({ property, supported: support[property], cells: observedGaps[property].length, href: grammar.properties[property].href })),
    native: platformGaps.native,
  }
  mkdirSync(new URL('./.vanity/', import.meta.url), { recursive: true })
  const observation = { browser: browser.version(), rows: rows.length, counts, rawCounts, errored: errors, observedGaps, disagreements: finalDisagreements, familyLedger }
  writeFileSync(new URL('./.vanity/corpus-observations.json', import.meta.url), `${JSON.stringify(observation, null, 2)}\n`)
  assert.equal(rawCounts.errored, 0, 'Internal model errors fail the gate; inspect .vanity/corpus-observations.json')
  assert.equal(counts.errored, 0, 'Internal model errors must not become unresolved')
  if (regenerate) {
    writeFileSync(new URL('./platform-gaps.json', import.meta.url), `${JSON.stringify({ native: platformGaps.native, agreement }, null, 2)}\n`)
    writeFileSync(new URL('./family-ledger.json', import.meta.url), `${JSON.stringify(familyLedger, null, 2)}\n`)
    console.log(JSON.stringify({ browser: browser.version(), rows: rows.length, rawCounts, familyLedger: { ...familyLedger, entries: undefined, native: undefined } }, null, 2))
    // The model loaded the previous ledger. A fresh test process checks the
    // regenerated ledger and establishes final fallback counts.
    process.exitCode = 0
  }
  else {
    const expectedGaps = Object.fromEntries(Object.entries(platformGaps.agreement).map(([property, gap]) => [property, gap.cells]))
    assert.deepEqual(observedGaps, expectedGaps, 'The pinned browser/data observations changed; investigate the family ledger')
    assert.deepEqual(familyLedger, JSON.parse(readFileSync(new URL('./family-ledger.json', import.meta.url))), 'Generated family ledger drift; run generate:gaps')
    assert.deepEqual(finalDisagreements, [], 'A resolved declaration disagrees with Chromium')
    // Contract boundaries named by the release; the full corpus is an
    // observation of substrates, not a second release assertion suite.
    for (const [property, value] of [['padding', '1'], ['padding', '-1px'], ['width', '-5px'], ['flex-grow', '-1']]) {
      assert.equal(inspectDeclaration(property, value).status, 'rejected')
    }
    assert.equal(emitNumber('padding', 1), '1px')
    assert.equal(inspectDeclaration('padding', emitNumber('padding', 1)).status, 'accepted')
    const attribution = observeAttribution()
    assert.deepEqual(attribution.color.accepted.map(x => [x.kind, x.component]), [['color', 'border-color']])
    assert.deepEqual(attribution.wrong.accepted.map(x => [x.kind, x.component]), [['color', 'border-color']])
    assert.equal(attribution.invalid.status, 'rejected')
    const resolvedWidth = attributeHole('border', 'var(--stroke) solid red', 0)
    assert.deepEqual(resolvedWidth.accepted.map(x => [x.kind, x.component]), [['length', 'border-width']])
    assert.deepEqual(attribution.width.accepted, [], 'An external second hole does not establish a component')
    assert.ok(getPropertyFamily('border-color').includes('border-inline-start-color'))
    assert.ok(getPropertyFamily('border-color').includes('border-top-color'))

    const axes = { density: ['cozy', 'compact'], skin: ['calm', 'crisp'] }
    const token = { path: 'space.pad', base: '12px', cases: [
      { when: { density: 'compact' }, value: '-1px' },
      { when: { density: 'compact', skin: 'crisp' }, value: '16px' },
      { when: { scheme: 'dark', skin: 'crisp' }, value: '8px' },
    ] }
    const states = enumerateEnvironments({ axes })
    const checks = states.map(state => ({ environment: state.id, value: resolveFixtureValue(token, state), result: inspectDeclaration('padding', resolveFixtureValue(token, state)).status }))
    assert.equal(states.length, 8)
    assert.equal(checks.filter(x => x.result === 'rejected').length, 2)
    const narrowed = enumerateEnvironments({ axes, when: { scheme: 'dark', skin: 'crisp' } })
    assert.equal(narrowed.length, 2)
    assert.ok(narrowed.every(state => resolveFixtureValue(token, state) === '8px'))
    const subtree = enumerateEnvironments({ axes, subtree: { 'space.pad': '20px' } })
    assert.ok(subtree.every(state => resolveFixtureValue(token, state) === '20px'))
    await page.setContent(`<style>
    :root { --pad:12px; --dependent:calc(var(--pad) * 2) }
    .literal,.propagated { --pad:20px }
    .propagated { --dependent:calc(var(--pad) * 2) }
    .probe { width:var(--dependent) }
  </style><div class="probe" id="base"></div>
    <div class="literal"><div class="probe" id="literal"></div></div>
    <div class="propagated"><div class="probe" id="propagated"></div></div>`)
    const subtreeComputed = await page.evaluate(() => Object.fromEntries(['base', 'literal', 'propagated'].map(id => [id, getComputedStyle(document.getElementById(id)).width])))
    assert.deepEqual(subtreeComputed, { base: '24px', literal: '24px', propagated: '40px' })
    const product = measureEnvironmentProduct()
    assert.equal(product.observations, 810000)
    const report = {
      evidence: JSON.parse(readFileSync(new URL('./evidence-records.json', import.meta.url))),
      subtreeComputed,
      source: grammar.source,
      browser: browser.version(),
      properties: grammar.propertyNames.length,
      rows: rows.length,
      counts,
      rawCounts,
      disagreements: finalDisagreements.length,
      agreementFamilies: Object.keys(platformGaps.agreement).length,
      nativeFamilies: Object.keys(platformGaps.native),
      checks,
      narrowed: narrowed.map(x => x.id),
      product,
      attribution,
      resolvedWidth,
      wallMs: performance.now() - start,
    }
    mkdirSync(new URL('./.vanity/', import.meta.url), { recursive: true })
    writeFileSync(new URL('./.vanity/results.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify({ browser: report.browser, properties: report.properties, rows: report.rows, counts, disagreements: report.disagreements, agreementFamilies: report.agreementFamilies, nativeFamilies: report.nativeFamilies, product, wallMs: report.wallMs }, null, 2))
  }
}
finally { await browser.close() }
