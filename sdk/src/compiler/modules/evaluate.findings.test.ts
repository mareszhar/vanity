import type { VanityRecipeRecord } from '../../introspect/records'
import { describe, expect, it } from 'vitest'
import { createSystem, length, propertyAliases, selector } from '../../index'
import { substrate } from '../../substrate'
import { evaluateStyleModule } from './evaluate'
import { applySourceLocations } from './source'

describe('style evaluation findings', () => {
  it('projects merged anchor winners but keeps separate selector spellings locatable', () => {
    const ds = createSystem().addConditions({ anchor: selector('&') }).consolidate()
    const source = `const {ds}=require('fixture'); ds.class({padding:4,paddingTop:8,anchor:{padding:12}}); ds.class({'&:is(:hover,:focus)':{padding:4},'&:is(:hover, :focus)':{padding:12}});`
    const evaluated = evaluateStyleModule(applySourceLocations(source, '/fixture/row.css.ts', '/fixture'), '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]))
    const styles = evaluated.records.filter(record => record.kind === 'style')
    expect(styles[0]?.emittedDeclarations?.map(record => [record.property, record.value])).toEqual([['padding', 12], ['padding-top', 8]])
    expect(styles[1]?.emittedDeclarations?.map(record => [record.value, record.arm.ordinal])).toEqual([[4, 0], [12, 1]])
  })

  it('keeps aliases out of emitted conditions and records custom-property value spans', () => {
    const ds = createSystem().addPlugin(propertyAliases({ py: 'paddingBlock' })).consolidate()
    const source = `const {ds}=require('fixture'); ds.class({py:{base:4,hover:8},'--local-gap':'4px'});`
    const result = evaluateStyleModule(applySourceLocations(source, '/fixture/row.css.ts', '/fixture'), '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]))
    const style = result.records.find(record => record.kind === 'style')!
    expect(style.emittedDeclarations?.map(declaration => [declaration.property, declaration.conditionPath, declaration.source?.text])).toEqual([
      ['padding-block', [], '4'],
      ['--local-gap', [], '\'4px\''],
      ['padding-block', ['hover'], '8'],
    ])
    expect(style.declarations?.filter(record => record.property === 'padding-block').map(record => record.conditionPath)).toEqual([['py'], ['py', 'hover']])
  })

  it('records emitted winners in CSS order while retaining authored findings', () => {
    const ds = createSystem().consolidate()
    const source = `const { ds } = require('fixture'); const row=ds.class([{padding:4,paddingTop:8},{padding:12}]);`
    const result = evaluateStyleModule(applySourceLocations(source, '/fixture/row.css.ts', '/fixture', undefined, true), '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]))
    const style = result.records.find(record => record.kind === 'style')!
    expect(style.declarations).toHaveLength(3)
    expect(style.emittedDeclarations?.map(record => [record.property, record.source?.text])).toEqual([['padding', '12'], ['padding-top', '8']])
    expect(style.emittedDeclarations?.every(record => record.arm.selector === `.${style.class}` && record.layer.endsWith('.recipes'))).toBe(true)
  })

  it('records recipe and anatomy emissions with their variant lookup and source leaves', () => {
    const ds = createSystem().consolidate()
    const source = `const { ds } = require('fixture'); const row=ds.recipe({base:{padding:4},variants:{density:{compact:{padding:8},loose:{padding:12}}},toggles:{selected:{color:'red'}},compound:[{when:{selected:true},style:{gap:4}}],defaults:{density:'compact'}}); const parts=ds.anatomy({parts:['root','label'],base:{root:{padding:4},label:{color:'red'}}});`
    const result = evaluateStyleModule(applySourceLocations(source, '/fixture/row.css.ts', '/fixture', undefined, true), '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]))
    const recipe = result.records.find((record): record is VanityRecipeRecord => record.kind === 'recipe')!
    const anatomy = result.records.find((record): record is VanityRecipeRecord => record.kind === 'anatomy')!
    expect(recipe.classes).toMatchObject({ base: expect.any(String), variants: { density: { compact: '', loose: expect.any(String) } }, toggles: { selected: expect.any(String) }, compound: [{ when: { selected: true }, class: expect.any(String) }] })
    expect(anatomy.classes).toMatchObject({ base: { root: expect.any(String), label: expect.any(String) } })
    const styles = result.records.filter(record => record.kind === 'style')
    expect(styles).toHaveLength(6)
    expect(styles.flatMap(style => style.emittedDeclarations ?? []).every(record => record.source && record.editable)).toBe(true)
    expect(styles.flatMap(style => style.emittedDeclarations ?? []).every(record => record.conditionPath?.length === 0)).toBe(true)
  })

  it('records original value spans across contributions and property-first conditions', () => {
    const ds = createSystem().addTokens({ small: length.px(4), large: length.px(8) }).consolidate()
    const source = `const { ds } = require('fixture');\r\n// 👁️\r\nconst row=ds.class([{padding:ds.t.small},{padding:{base:(ds.t.large),hover:ds.t.small}}]);`
    const result = evaluateStyleModule(applySourceLocations(source, '/fixture/row.css.ts', '/fixture', undefined, true), '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]))
    const records = result.records.filter(record => record.kind === 'style').flatMap(record => record.declarations ?? [])
    expect(records).toHaveLength(3)
    expect(records.map(record => record.source?.text)).toEqual(['ds.t.small', 'ds.t.large', 'ds.t.small'])
    for (const record of records) {
      expect(record.editable).toBe(true)
      expect(record.source?.file).toBe('row.css.ts')
      expect(source.slice(record.source!.start, record.source!.end)).toBe(record.source!.text)
    }
  })

  it('does not offer helper, fallback-array or dynamic values as editable source leaves', () => {
    const ds = createSystem().consolidate()
    const source = `const { ds } = require('fixture'); function make(){return ds.class({padding:4})}; make(); ds.class({display:['block','grid']}); ds.class(true ? {padding:8} : {padding:12});`
    const result = evaluateStyleModule(applySourceLocations(source, '/fixture/row.css.ts', '/fixture'), '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]))
    const records = result.records.filter(record => record.kind === 'style').flatMap(record => record.declarations ?? [])
    expect(records).toHaveLength(4)
    for (const record of records) {
      expect(record.editable).toBe(false)
      expect(record.reason).toEqual(expect.any(String))
    }
  })

  it('keeps authored locations when injecting debug names into earlier declarations', () => {
    const ds = createSystem({ declarations: { level: 'discourage', tokens: ['length'] } }).consolidate()
    const source = `const { ds } = require('fixture'); const first=ds.class({padding:'13px'}); const second=ds.class({margin:'15px'});`
    const located = applySourceLocations(source, '/fixture/row.css.ts', '/fixture', undefined, true)
    const warnings: unknown[] = []
    evaluateStyleModule(located, '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]), warning => warnings.push(warning))
    expect(located).toContain('padding:\'13px\'}, \'first\'')
    expect(located).toContain('margin:\'15px\'}, \'second\'')
    expect(warnings).toMatchObject([
      { file: 'row.css.ts', line: 1, column: source.indexOf('padding:') + 1 },
      { file: 'row.css.ts', line: 1, column: source.indexOf('margin:') + 1 },
    ])
  })

  it('retains each authored declaration site when findings are finalized together', () => {
    const ds = createSystem({ declarations: { level: 'discourage', tokens: ['length'] } }).consolidate()
    const source = `const { ds } = require('fixture');
ds.class({
  padding: '13px',
}, 'first');
ds.class({
  padding: '15px',
}, 'second');
`
    const warnings: unknown[] = []
    evaluateStyleModule(applySourceLocations(source, '/fixture/row.css.ts', '/fixture'), '/fixture/row.css.ts', 'debug', new Map([['fixture', { ds }]]), warning => warnings.push(warning))
    expect(warnings).toMatchObject([
      { file: 'row.css.ts', line: 3, column: 3 },
      { file: 'row.css.ts', line: 6, column: 3 },
    ])
  })

  it('delivers policy warnings after evaluating the whole module and fails forbid findings together', () => {
    for (const level of ['discourage', 'forbid'] as const) {
      const ds = createSystem({ declarations: { level, tokens: ['length'] } }).addTokens({ gap: length.px(8) }).consolidate()
      const reached: string[] = []
      const warnings: unknown[] = []
      const evaluate = () => evaluateStyleModule(`
        const { ds, reached } = require('fixture');
        ds.class({ padding: '13px' }, 'first'); reached.push('first');
        ds.class({ margin: '15px' }, 'second'); reached.push('second');
      `, '/fixture/style.css.ts', 'debug', new Map([['fixture', { ds, reached }]]), warning => warnings.push(warning))
      if (level === 'forbid') {
        let failure: any
        try {
          evaluate()
        }
        catch (error) { failure = error }
        expect(failure.diagnostics.map((entry: any) => entry.code)).toEqual(['VANITY_DECLARATION_RAW', 'VANITY_DECLARATION_RAW'])
        expect(warnings).toEqual([])
      }
      else {
        const result = evaluate()
        expect(result.findings).toMatchObject([{ style: 'first' }, { style: 'second' }])
        expect([...result.cssByFileScope.values()].join('\n')).toContain('margin: 15px;')
        expect(warnings).toMatchObject([{ severity: 'warning', path: ['padding'] }, { severity: 'warning', path: ['margin'] }])
      }
      expect(reached).toEqual(['first', 'second'])
    }
  })

  it('evaluates later declarations and reports both compatibility findings together', () => {
    const ds = substrate.modules.runInFileScope({ filePath: 'fixture/system.ts' }, () => createSystem().addTokens(h => ({ ink: h.tdef.color({ val: 'red', reference: 'var' }), gap: h.tdef.length({ val: length.px(8), reference: 'var' }) })).consolidate())
    const reached: string[] = []
    let failure: any
    try {
      evaluateStyleModule(`
        const { ds, reached } = require('fixture');
        ds.class({ padding: ds.t.ink }, 'first'); reached.push('first');
        ds.class({ color: ds.t.gap }, 'second'); reached.push('second');
      `, '/fixture/style.css.ts', 'debug', new Map([['fixture', { ds, reached }]]))
    }
    catch (error) { failure = error }
    expect(reached).toEqual(['first', 'second'])
    expect(failure.diagnostics.map((entry: any) => entry.code)).toEqual(['VANITY_CSS_TOKEN_KIND', 'VANITY_CSS_TOKEN_KIND'])
    expect(failure.message).toContain('padding')
    expect(failure.message).toContain('color')
  })
})
