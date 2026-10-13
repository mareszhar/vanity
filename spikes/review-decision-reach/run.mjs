// Run: pnpm --filter spike-review-decision-reach test
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { seen } from './geometry.mjs'
import { createPreview } from './preview.mjs'
import { getAuthoredValueSpans } from './spans.mjs'

await mkdir(new URL('test-results/', import.meta.url), { recursive: true })

const browser = await chromium.launch()
const geometry = []
try {
  for (const dpr of [1, 2]) {
    for (const font of ['Arial', 'Georgia', 'monospace']) {
      const page = await browser.newPage({ viewport: { width: 200, height: 200 }, deviceScaleFactor: dpr })
      for (const wrapped of [false, true]) {
        await page.setContent(`<!doctype html><style>body{margin:0;background:white}.text{margin:8px;width:${wrapped ? 40 : 160}px;font:16px/24px ${font};color:black}</style><div class="text">${wrapped ? 'H H H H H H' : 'H'}</div>`)
        await page.evaluate(`window.__seen=${seen.toString()}`)
        const measurement = await page.locator('.text').evaluate(el => ({ vertical: window.__seen(el), cross: window.__seen(el, 'horizontal') }))
        const screenshot = await page.screenshot()
        const raster = await page.evaluate(async (data) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
          const canvas = document.createElement('canvas')
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          const context = canvas.getContext('2d')
          context.drawImage(bitmap, 0, 0)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          const lines = []
          for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
              const i = (y * canvas.width + x) * 4
              if (pixels[i] < 128 && pixels[i + 1] < 128 && pixels[i + 2] < 128) {
                lines.push(y)
                break
              }
            }
          }
          return { top: Math.min(...lines) / devicePixelRatio, bottom: (Math.max(...lines) + 1) / devicePixelRatio }
        }, screenshot.toString('base64'))
        const error = Math.max(Math.abs(measurement.vertical.top - raster.top), Math.abs(measurement.vertical.bottom - raster.bottom)) * dpr
        assert(!measurement.vertical.estimated)
        assert(error <= 1, 'one physical pixel precision')
        assert.equal(measurement.cross.estimated, wrapped)
        geometry.push({ dpr, font, wrapped, measurement, raster, error })
      }
      await page.close()
    }
  }
  const page = await browser.newPage()
  await page.evaluate(`window.__seen=${seen.toString()};window.__preview=${createPreview.toString()}`)
  for (const surface of [false, true]) {
    await page.setContent(`<!doctype html><style>body{margin:0}.rows{display:flex;flex-direction:column;gap:4px}.row{padding:8px;font:16px/12px Arial;${surface ? 'background:#ddd' : ''}}</style><div class="rows"><div class="row">H</div><div class="row">H</div></div>`)
    const gap = await page.evaluate(() => {
      const elements = [...document.querySelectorAll('.row')]
      const boxes = elements.map(el => window.__seen(el))
      return { box: elements[1].getBoundingClientRect().top - elements[0].getBoundingClientRect().bottom, seen: boxes[1].top - boxes[0].bottom }
    })
    assert.deepEqual(gap, { box: 4, seen: surface ? 4 : 20 })
  }
  await page.setContent('<style>.target{padding:4px!important;padding-top:8px!important;color:blue}.other{padding:4px;color:red}</style><div class="target" style="--space:16px">A</div><div class="target" style="--space:24px">B</div><div class="other">C</div>')
  const preview = await page.evaluate(() => {
    const graph = { arms: [{ selector: '.target', declarations: [{ id: 'padding', property: 'padding', value: '4px', priority: 'important' }, { id: 'top', property: 'padding-top', value: '8px', priority: 'important' }, { id: 'color', property: 'color', value: 'blue' }] }] }
    const api = window.__preview(graph, document.styleSheets)
    const style = document.styleSheets[0].cssRules[0].style
    const original = style.cssText
    const read = () => [...document.querySelectorAll('div')].map(el => ({ top: getComputedStyle(el).paddingTop, right: getComputedStyle(el).paddingRight, color: getComputedStyle(el).color }))
    const before = read()
    api.set('padding', 'var(--space)')
    const first = read()
    api.set('top', '20px')
    const second = read()
    api.reset('padding')
    const reset = read()
    api.reset()
    return { before, first, second, reset, restored: read(), exact: original === style.cssText }
  })
  assert.equal(preview.first[0].top, '8px')
  assert.equal(preview.first[0].right, '16px')
  assert.equal(preview.first[1].right, '24px')
  assert.equal(preview.second[0].top, '20px')
  assert.equal(preview.reset[0].right, '4px')
  assert.equal(preview.reset[0].top, '20px')
  assert.deepEqual(preview.first[2], preview.before[2])
  assert.deepEqual(preview.restored, preview.before)
  assert(preview.exact)
  // Known false positive is kept in the calibration, never recast as a pass.
  const cases = [{ name: 'healthy', inside: 8, outside: 16, expected: false }, { name: 'clear', inside: 24, outside: 16, expected: true }, { name: 'near', inside: 16.25, outside: 16, expected: false }, { name: 'wrapped-card', inside: 19, outside: 12.15625, expected: false }, { name: 'transform', inside: 21, outside: 30.578125, reason: 'transform', expected: false }]
  const calibration = cases.map(row => ({ ...row, flagged: !row.reason && row.inside - row.outside >= 4 }))
  const audit = { evaluated: calibration.filter(r => !r.reason).length, skipped: calibration.filter(r => r.reason).length, skippedByReason: { transform: 1 }, positives: calibration.filter(r => r.expected).length, falsePositives: calibration.filter(r => r.flagged && !r.expected).length, falseNegatives: calibration.filter(r => !r.flagged && r.expected).length, rows: calibration }
  assert.equal(audit.falsePositives, 1)
  assert.equal(audit.falseNegatives, 0)
  // The fixture intentionally contains an authored interpolation as source text.
  // eslint-disable-next-line no-template-curly-in-string
  const source = '// 😀 café\r\nconst base=ds.class({padding:t.space.sm,margin:(t.space.md as any),border:`1px solid ${t.color.edge}`,gap:calc(t.space.sm).multiply(2),width:helper(),...bundle});'
  const spans = getAuthoredValueSpans(source, 'fixture.css.ts')
  assert.equal(spans.find(r => r.path.at(-1) === 'padding').source.text, 't.space.sm')
  assert(spans.find(r => r.path.at(-1) === 'padding').editable)
  assert(!spans.find(r => r.path.at(-1) === 'width').editable)
  assert(spans.some(r => !r.editable && r.reason.includes('spread')))
  await writeFile(new URL('test-results/results.json', import.meta.url), JSON.stringify({ browser: browser.version(), geometry, preview, audit, spans }, null, 2))
  console.log(JSON.stringify({ geometry: geometry.length, precisionPhysicalPixels: Math.max(...geometry.map(r => r.error)), audit }, null, 2))
}
finally { await browser.close() }
