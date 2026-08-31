import { createSystem, propertyAliases } from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'

describe('css declaration keywords', () => {
  it('accepts box-shadow none through class, recipe, atom, and alias forms', () => {
    const ds = createSystem()
      .addPlugin(propertyAliases({ shadow: 'boxShadow' }))
      .consolidate()
    const { css } = emit(() => {
      ds.class({ boxShadow: 'none' }, 'class-shadow')
      ds.recipe({
        base: { boxShadow: 'none' },
        variants: { raised: { no: { boxShadow: 'none' } } },
      }, 'recipe-shadow')
      ds.atoms({ properties: { boxShadow: ['none'] } }, 'atom-shadow')
      ds.class({ shadow: 'none' }, 'alias-shadow')
    })

    expect(css.match(/box-shadow: none;/g)).toHaveLength(5)
  })

  it.each(['initial', 'inherit', 'unset', 'revert', 'revert-layer'] as const)(
    'accepts the CSS-wide keyword %s in the shadow grammar',
    (keyword) => {
      const ds = createSystem().consolidate()
      const { css } = emit(() => {
        ds.class({ boxShadow: keyword }, `shadow-${keyword}`)
      })

      expect(css).toContain(`box-shadow: ${keyword};`)
    },
  )
})
