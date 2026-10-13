import { aria, createSystem, data, defineTokens, importDesignTokens, VanityError } from '@mszr/vanity'
import { describe, expect, it } from 'vitest'

describe('element state authoring', () => {
  it('anchors data and aria states explicitly with self', () => {
    expect(data('selected').self.arms).toEqual([{ selector: '&[data-selected]', runtime: { kind: 'attribute', name: 'data-selected', value: '' } }])
    const ds = createSystem().addConditions({ selected: data('selected').self }).consolidate()
    expect(ds.explain(ds.conditions.selected)).toMatchObject({ readable: '&[data-selected]', arms: [{ selector: '&[data-selected]' }] })
    expect(aria('expanded', 'true').self.arms).toEqual([{ selector: '&[aria-expanded=\'true\']' }])
  })
  it('warns for registered descendant states and honors audit levels', () => {
    const ds = createSystem().addConditions({ selected: data('selected'), expanded: aria('expanded', 'true'), explicit: '&[data-x]' }).consolidate()
    const warnings = ds.audit().findings.filter(finding => finding.kind === 'descendantConditions')
    expect(warnings).toHaveLength(2)
    expect(warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'VANITY_CONDITION_DESCENDANT', level: 'warn', fix: expect.stringContaining('.self') })]))
    expect(ds.audit({ descendantConditions: 'off' }).findings.filter(finding => finding.kind === 'descendantConditions')).toEqual([])
    expect(ds.audit({ descendantConditions: 'error' }).findings.filter(finding => finding.kind === 'descendantConditions').every(finding => finding.level === 'error')).toBe(true)
  })
  it.each([
    () => createSystem().addTokens({ blue: { 500: '#123456' } }),
    () => createSystem().addToken('500', '#123456'),
    () => createSystem().defineTokens().add('500', '#123456'),
  ])('rejects numeric keys at definition with an addressable repair', (run) => {
    try {
      run()
    }
    catch (error) {
      expect(error).toBeInstanceOf(VanityError)
      expect((error as VanityError).diagnostics[0]).toMatchObject({ code: 'VANITY_TOKENS_NUMERIC_KEY', fix: { message: expect.stringContaining('s500') } })
      return
    }
    throw new Error('expected numeric token definition to fail')
  })
})

it.each(['-1', '1.5', '1e3'])('rejects the numeric spelling %s at definition', (key) => {
  try {
    createSystem().addTokens({ blue: { [key]: '#123456' } })
  }
  catch (error) {
    expect(error).toBeInstanceOf(VanityError)
    expect((error as VanityError).diagnostics[0]).toMatchObject({ code: 'VANITY_TOKENS_NUMERIC_KEY', path: ['blue', key] })
    return
  }
  throw new Error('expected a numeric key to fail')
})

it.each([
  () => createSystem().addTokens(defineTokens({ seed: 'red' }).add(m => ({ 500: m.seed }))).consolidate(),
  () => createSystem().addTokens(defineTokens({ seed: 'red' }).add('500', m => m.seed)).consolidate(),
  () => createSystem().addTokens({ 500: defineTokens({ seed: 'red' }) }).consolidate(),
  () => {
    const open = createSystem()
    return open.addTokens(importDesignTokens({ 500: { $type: 'number', $value: 1 } }, { system: open })).consolidate()
  },
])('rejects numeric keys introduced by lazy contributions, mounts and imports', (run) => {
  expect(run).toThrowError(expect.objectContaining({ diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'VANITY_TOKENS_NUMERIC_KEY', path: ['500'] })]) }))
})
