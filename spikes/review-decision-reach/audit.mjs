import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { seen } from './geometry.mjs'

await mkdir(new URL('test-results/', import.meta.url), { recursive: true })

const scale = [4, 8, 12, 16, 20, 24, 32]
const fixtures = [
  { name: 'healthy', inside: 8, outside: 16, expected: [] },
  { name: 'clear-inversion', inside: 24, outside: 16, expected: ['proximity'] },
  { name: 'equal', inside: 16, outside: 16, expected: [] },
  { name: 'near-tie', inside: 16.25, outside: 16, expected: [] },
  { name: 'rounding', inside: 16.25, outside: 16, expected: [] },
  { name: 'off-scale', inside: 18, outside: 24, expected: ['off-scale'] },
  { name: 'wrapped', inside: 24, outside: 16, shape: 'wrapped', expected: ['proximity'] },
  ...['hover', 'pseudo', 'divider', 'absolute', 'transform', 'image'].map(shape => ({ name: shape, inside: 24, outside: 16, shape, expected: [] })),
]
const browser = await chromium.launch()
const rows = []
try {
  const page = await browser.newPage({ viewport: { width: 300, height: 300 } })
  for (const fixture of fixtures) {
    const extra = fixture.shape === 'pseudo' ? '.item::before{content:"x"}' : fixture.shape === 'hover' ? '.item:hover{background:red}' : ''
    const shape = fixture.shape === 'transform' ? 'transform:translateY(1px)' : fixture.shape === 'absolute' ? 'position:absolute' : fixture.shape === 'wrapped' ? 'width:8px' : ''
    await page.setContent(`<!doctype html><style>.groups{display:flex;flex-direction:column;gap:${fixture.outside}px}.group{display:flex;flex-direction:column;gap:${fixture.inside}px}.item{font:16px/12px Arial;background:#ddd;${shape}}${extra}</style><main class="groups">${[1, 2].map(() => `<section class="group">${[1, 2].map(() => `<div class="item">${fixture.shape === 'image' ? '<img width="20" height="20" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22/%3E">' : fixture.shape === 'wrapped' ? 'H H H' : 'H'}</div>`).join('')}${fixture.shape === 'divider' ? '<hr>' : ''}</section>`).join('')}</main>`)
    await page.evaluate(`globalThis.__name=(fn)=>fn;window.__seen=${seen.toString()}`)
    const measurement = await page.evaluate(({ conditionalSurface }) => {
      const groups = [...document.querySelectorAll('.group')].map(el => window.__seen(el))
      const items = [...document.querySelectorAll('.group:first-child .item')].map(el => window.__seen(el))
      const reasons = []
      if (conditionalSurface)
        reasons.push('conditional surface')
      if (document.querySelector('hr'))
        reasons.push('divider')
      if (document.querySelector('img'))
        reasons.push('image pixels')
      for (const el of document.querySelectorAll('.item')) {
        const style = getComputedStyle(el)
        if (style.transform !== 'none')
          reasons.push('transform')
        if (['absolute', 'fixed'].includes(style.position))
          reasons.push('absolute position')
        if (['::before', '::after'].some(pseudo => !['none', 'normal'].includes(getComputedStyle(el, pseudo).content)))
          reasons.push('decorative pseudo-element')
      }
      return { tolerance: 1 / devicePixelRatio, inside: items[1].top - items[0].bottom, outside: groups[1].top - groups[0].bottom, estimated: [...groups, ...items].some(box => box.estimated), reasons: [...new Set(reasons)] }
    }, { conditionalSurface: fixture.shape === 'hover' })
    const misleading = measurement.reasons.length > 0
    const step = scale.find(value => value > measurement.outside) - measurement.outside
    const findings = []
    if (!misleading && !measurement.estimated) {
      if (measurement.inside - measurement.outside >= step)
        findings.push('proximity')
      if (Math.min(...scale.map(value => Math.abs(value - measurement.inside))) > measurement.tolerance)
        findings.push('off-scale')
    }
    assert.deepEqual(findings, fixture.expected, fixture.name)
    rows.push({ ...fixture, measurement, findings, label: misleading || measurement.estimated ? 'estimated' : findings.length ? 'clear' : 'information' })
  }
  const falsePositives = rows.flatMap(row => row.findings.filter(finding => !row.expected.includes(finding))).length
  const falseNegatives = rows.flatMap(row => row.expected.filter(finding => !row.findings.includes(finding))).length
  assert.equal(falsePositives, 0)
  assert.equal(falseNegatives, 0)
  await writeFile(new URL('test-results/audit-domain-wrapped.json', import.meta.url), JSON.stringify({ browser: browser.version(), scale, rows, falsePositives, falseNegatives, evaluated: rows.filter(r => r.label !== 'estimated').length, skipped: rows.filter(r => r.label === 'estimated').length, skippedByReason: Object.fromEntries([...new Set(rows.flatMap(r => r.measurement.reasons))].map(reason => [reason, rows.filter(r => r.measurement.reasons.includes(reason)).length])), positiveCases: rows.filter(r => r.expected.length).length }, null, 2))
  console.log(JSON.stringify({ rows: rows.length, falsePositives, falseNegatives, results: rows.map(({ name, measurement, findings, label }) => ({ name, measurement, findings, label })) }, null, 2))
}
finally {
  await browser.close()
}
