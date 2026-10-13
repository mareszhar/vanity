import { describe, expect, it } from 'vitest'
import { createSystem, media, VanityError } from '../../index'
import { collectInspection, record } from '../../introspect/records'
import { evaluateStyleModule } from './evaluate'
import { applySourceLocations } from './source'

describe('baseline evaluation evidence', () => {
  it('warns about unknown pseudos, including nested selectors, without rejecting CSS or escaped known names', () => {
    const ds = createSystem().consolidate()
    const warnings: any[] = []
    const source = applySourceLocations(`const ds = require('fixture').ds; ds.class({'&:is(:hover,:hovr)::befor':{padding:1}});`, '/fixture/row.css.ts', '/fixture')
    const result = evaluateStyleModule(source, '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]), diagnostic => warnings.push(diagnostic))
    expect(warnings).toMatchObject([{ code: 'VANITY_SELECTOR_UNKNOWN', severity: 'warning', file: 'row.css.ts', path: ['&:is(:hover,:hovr)::befor'] }])
    expect(warnings[0].message).toContain(':hovr')
    expect(warnings[0].message).toContain('::befor')
    expect([...result.cssByFileScope.values()].join('')).toContain('padding: 1px')
    warnings.length = 0
    evaluateStyleModule(`const ds = require('fixture').ds; ds.class({'&:h\\\\6f ver::before':{padding:1}});`, '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]), diagnostic => warnings.push(diagnostic))
    expect(warnings).toEqual([])
  })
  it('retains a direct default export independently of its debug name', () => {
    const ds = createSystem({ declarations: { level: 'discourage', tokens: ['length'] } }).consolidate()
    const source = applySourceLocations(`const ds = require('fixture').ds; export default ds.class({padding:'13px'},'manual');`, '/fixture/row.css.ts', '/fixture').replace('export default', 'const value =')
    expect(evaluateStyleModule(source, '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]), () => {}).findings).toMatchObject([{ exports: ['default'], style: 'manual' }])
  })
  it('retains partial inspection after an authored throw without replacing the original error', () => {
    const failure = Object.freeze({ authored: true })
    let observed: any
    expect(() => (collectInspection as any)(() => {
      record({ kind: 'escape', form: 'raw', detail: 'earlier' })
      throw failure
    }, (capture: unknown) => { observed = capture })).toThrow(failure)
    expect(observed).toMatchObject({ complete: false, error: failure, records: [{ detail: 'earlier' }] })
  })

  it('retains export identity and exact condition keys independently of source line numbers', () => {
    const ds = createSystem({ declarations: { level: 'discourage', tokens: ['length'] } }).consolidate()
    const rows = ['', '\n'.repeat(10)].map((prefix) => {
      const source = `${prefix}const ds = require('fixture').ds; export const local = ds.class({ '& .child': { padding: '13px' } }, 'manual'); export { local as row };`
      const instrumented = applySourceLocations(source, '/fixture/row.css.ts', '/fixture').replace('export const', 'const').replace('export { local as row };', '')
      return evaluateStyleModule(instrumented, '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]), () => {}).findings
    })
    for (const row of rows) {
      expect(row).toMatchObject([{ style: 'manual', exports: ['local', 'row'], declaration: { conditionPath: ['& .child'] } }])
    }
    expect(rows[1][0].diagnostic.line).toBe(rows[0][0].diagnostic.line! + 10)
  })
})

it('names a condition object mistake at its computed key with a source frame', () => {
  const ds = createSystem().consolidate()
  const authored = `const { ds, media } = require('fixture');
ds.class({
  [media('(width > 40rem)')]: { display: 'grid' },
});`
  try {
    evaluateStyleModule(applySourceLocations(authored, '/fixture/card.css.ts', '/fixture'), '/fixture/card.css.ts', 'debug', new Map([['fixture', { ds, media }]]))
  }
  catch (error) {
    expect(error).toBeInstanceOf(VanityError)
    expect((error as VanityError).diagnostics[0]).toMatchObject({ code: 'VANITY_CSS_INVALID_KEY', file: 'card.css.ts', line: 3, column: 3, fix: { message: expect.stringContaining('createSystem({ conditions })') } })
    expect((error as Error).stack).toContain('card.css.ts:3:3')
    return
  }
  throw new Error('expected a condition object key to fail')
})
