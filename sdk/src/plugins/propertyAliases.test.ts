import { createSystem, media, propertyAliases, VanityError } from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'

describe('propertyAliases()', () => {
  it('expands aliases through the ordinary css compiler', () => {
    const ds = createSystem()
      .addPlugin(propertyAliases({ py: 'paddingBlock', bg: 'background' }))
      .addTokens({ space: { md: '16px' } })
      .consolidate()
    const { css } = emit(() => ds.class({ py: ds.t.space.md, bg: 'red' }, 'aliased'))

    expect(css).toContain('padding-block: var(--vanity-space-md)')
    expect(css).toContain('background: red')
  })

  it('keeps aliases across fragments, ordered contributions, and selector maps', () => {
    const ds = createSystem()
      .addPlugin(propertyAliases({ py: 'paddingBlock', bg: 'background' }))
      .consolidate()
    const { css } = emit(() => {
      const fragment = ds.fragment({ py: '1rem', bg: 'red' })
      const className = ds.class([fragment, { py: '2rem' }], 'alias-array')
      ds.rules({ body: [fragment, { bg: 'blue' }] })
      ds.recipe({ base: [fragment, { color: 'white' }] }, 'alias-recipe')
      ds.anatomy({
        parts: ['root'],
        base: { root: [fragment, { color: 'white' }] },
      }, 'alias-anatomy')
      return className
    })

    expect(css).toContain('padding-block: 1rem')
    expect(css).toContain('padding-block: 2rem')
    expect(css).toContain('background: blue')
    expect(css).toContain('alias-recipe')
    expect(css).toContain('alias-anatomy_root')
  })

  it('aliases-only rejects the hidden spelling while class.standard preserves the platform', () => {
    const ds = createSystem()
      .addPlugin(propertyAliases({ py: 'paddingBlock' }, { expose: 'aliases-only' }))
      .consolidate()
    const result = emit(() => {
      const standard = ds.class.standard({ paddingBlock: '2rem' }, 'standard')
      let failure: unknown
      try {
        ds.class({ paddingBlock: '1rem' } as never)
      }
      catch (error) {
        failure = error
      }
      return { standard, failure }
    })

    expect(result.css).toContain('padding-block: 2rem')
    expect(result.returned.failure).toBeInstanceOf(VanityError)
    expect((result.returned.failure as Error).message).toContain('class.standard()')
  })

  it('rejects collisions instead of silently choosing one spelling', () => {
    expect(() => propertyAliases({ paddingBlock: 'paddingBlock' } as never)).toThrow(/standard CSS vocabulary/)
  })

  it('rejects alias and platform spellings in the same declaration arm', () => {
    const ds = createSystem()
      .addPlugin(propertyAliases({ py: 'paddingBlock' }))
      .consolidate()
    expect(() => emit(() => {
      return ds.class({ py: '1rem', paddingBlock: '2rem' })
    })).toThrow(/declare the same CSS property/)
  })

  it('applies collision diagnostics independently inside conditional arms', () => {
    const ds = createSystem()
      .addPlugin(propertyAliases({ py: 'paddingBlock' }))
      .addConditions({ wide: media('(width >= 60rem)') })
      .consolidate()
    expect(() => emit(() => {
      return ds.class({ wide: { py: '1rem', paddingBlock: '2rem' } })
    })).toThrow(/declare the same CSS property/)
  })
})
