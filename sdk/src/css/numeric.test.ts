import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { createSystem, unsafe } from '../index'

describe('numeric declaration units', () => {
  it('uses one property unit rule across style producers and atom escapes', () => {
    const ds = createSystem().consolidate()
    const producers = {
      class: () => ds.class({ padding: 1, opacity: 1 }),
      recipe: () => ds.recipe({ base: { padding: 1, opacity: 1 } }),
      anatomy: () => ds.anatomy({ parts: ['root'], base: { root: { padding: 1, opacity: 1 } } }),
      rules: () => ds.rules({ '.numeric': { padding: 1, opacity: 1 } }),
      fragment: () => ds.class(ds.fragment({ padding: 1, opacity: 1 })),
      keyframes: () => ds.keyframes({ from: { padding: 1, opacity: 1 } }),
      atoms: () => ds.atoms({ properties: { padding: [1], opacity: [1] } })({ padding: 1, opacity: 1 }),
      escape: () => ds.atoms({ properties: { padding: [0], opacity: [0] } })({ padding: unsafe.value(1, 'optical alignment'), opacity: unsafe.value(1, 'fully visible') }),
    }
    for (const [name, producer] of Object.entries(producers)) {
      const { css } = emit<unknown>(producer)
      expect(css, name).toContain('padding: 1px;')
      expect(css, name).toContain('opacity: 1;')
    }
    // Font descriptors are not style properties: padding is not a descriptor.
    // Its numeric descriptor shares font-weight's unitless property rule.
    expect(emit(() => ds.fontFace({ src: 'url("numeric.woff2")', fontWeight: 1 })).css).toContain('font-weight: 1;')
  })

  it('preserves numbers in custom properties and token and port defaults', () => {
    const ds = createSystem().addTokens({ count: 1 }).consolidate({ prefix: 'numeric' })
    const { css } = emit(() => {
      const count = ds.port(1)
      ds.class({ '--numeric-local': 1, 'opacity': count })
      ds.class({ opacity: ds.t.count })
      ds.keyframes({ from: { '--numeric-local': 1 } })
    })
    expect(css.match(/--numeric-local: 1;/g)).toHaveLength(2)
    expect(css).toContain('--numeric-count: 1;')
    expect(css).toMatch(/opacity: var\(--numeric-[\w-]+, 1\);/)
    expect(css).not.toContain('1px')
  })
})
