import { createSystem, data, selector } from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'

describe('condition placement', () => {
  it('nests a registered bare selector under each producer anchor', () => {
    const ds = createSystem().addConditions({ selected: data('selected') }).consolidate()
    const { css, returned: value } = emit(() => {
      const direct = ds.class({ selected: { padding: 9 } }, 'direct')
      const property = ds.class({ padding: { selected: 9 } }, 'property')
      const recipe = ds.recipe({ base: { selected: { padding: 9 } } }, 'row')
      const anatomy = ds.anatomy({ parts: ['root', 'label'], base: {
        root: { selected: { padding: 9 } },
        label: { 'root:selected': { padding: 9 } },
      } }, 'parts')
      const fragment = ds.class(ds.fragment({ selected: { padding: 9 } }), 'fragment')
      ds.rules({ '.global': { selected: { padding: 9 } } })
      return { direct, property, recipe: recipe(), anatomy: anatomy(), fragment }
    })
    for (const name of [value.direct, value.property, value.recipe, value.anatomy.root, value.fragment])
      expect(css).toContain(`.${name.replaceAll('.', '\\.')} [data-selected]`)
    expect(css).toContain(`.${value.anatomy.root.replaceAll('.', '\\.')} [data-selected] .${value.anatomy.label.replaceAll('.', '\\.')}`)
    expect(css).toContain('.global [data-selected]')
    expect(css).not.toMatch(/^ {2}\[data-selected\] \{/m)
  })

  it('has no complement-of-anchor arm in conjunction or disjunction negation', () => {
    const compact = data('density', 'compact')
    const anchored = selector('&').and(compact)
    expect(anchored.not().arms).toEqual([{ selector: '&:not([data-density=\'compact\'])' }])
    expect(anchored.or(data('selected')).not().arms).toEqual([{ selector: '&:not([data-density=\'compact\']):not([data-selected])' }])
    expect(anchored.not().not().arms).toEqual(anchored.arms.map(({ runtime: _runtime, ...arm }) => arm))
  })
})

it('retains the anchor inside a negated literal selector list', () => {
  const value = selector('&[data-density=\'compact\'], &[data-selected]').not()
  expect(value.arms).toEqual([{ selector: '&:not(:is(&[data-density=\'compact\'], &[data-selected]))' }])
})
