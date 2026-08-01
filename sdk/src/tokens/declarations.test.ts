import { createSystem, propertyAliases, VanityError } from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'

describe('token $dec', () => {
  it('applies themeable leaves, aliases, conditions, selectors, and custom properties', () => {
    const ds = createSystem()
      .addPlugin(propertyAliases({ bg: 'background' }))
      .addConditions({ hover: '&:hover' })
      .addTokens({
        text: {
          body: {
            'fontSize': '1rem',
            'lineHeight': 1.5,
            'hover': {
              'color': 'rebeccapurple',
              '& > strong': { fontWeight: 700 },
            },
            '--measure': '65ch',
          },
        },
        surface: {
          bg: 'canvas',
        },
      })
      .consolidate({ prefix: 'app' })

    expect(Object.keys(ds.t.text.body.$dec)).toEqual([
      'fontSize',
      'lineHeight',
      'hover',
      '--measure',
    ])
    expect(ds.t.text.body.fontSize.$dec).toEqual({
      fontSize: ds.t.text.body.fontSize,
    })

    const { css } = emit(() => ds.class({
      ...ds.t.text.body.$dec,
      ...ds.t.surface.$dec,
    }, 'token-bundle'))

    expect(css).toContain('font-size: var(--app-text-body-font-size)')
    expect(css).toContain('line-height: var(--app-text-body-line-height)')
    expect(css).toContain('color: var(--app-text-body-hover-color)')
    expect(css).toMatch(/font-weight: var\(--app-text-body-hover-selector-[a-z0-9]+-font-weight\)/)
    expect(css).toContain('--measure: var(--app-text-body---measure)')
    expect(css).not.toMatch(/var\([^)]*[&> ]/)
    expect(css).toContain('background: var(--app-surface-bg)')
  })

  it('honors value-only reference policy instead of inventing variables', () => {
    const ds = createSystem({ reference: 'val' })
      .addTokens({ body: { fontSize: '1rem', lineHeight: 1.5 } })
      .consolidate({ prefix: 'folded' })

    const { css } = emit(() => ds.class({ ...ds.t.body.$dec }))

    expect(css).toContain('font-size: 1rem')
    expect(css).toContain('line-height: 1.5')
    expect(css).not.toContain('var(--folded-body')
  })

  it('refuses to flatten namespaces and gives both likely repairs', () => {
    const ds = createSystem()
      .addTokens({
        text: {
          body: { fontSize: '1rem' },
          heading: { fontSize: '2rem' },
        },
      })
      .consolidate()

    expect(() => ds.t.text.$dec).toThrowError(VanityError)
    expect(() => ds.t.text.$dec).toThrow(/body.*heading/)
    expect(() => ds.t.text.$dec).toThrow(/navigate to a leaf bundle/)
    expect(() => ds.t.text.$dec).toThrow(/register\/use the child as a condition/)
  })
})
