import { createSystem, fromEntries, mapRecord, range, VanityError } from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'

describe('the target styling family', () => {
  it('preserves ordered contributions, repeated fallbacks, fragments, and omission', () => {
    const ds = createSystem()
      .addConditions({ hover: '&:hover' })
      .consolidate()
    const { css } = emit(() => {
      const reusable = ds.fragment({
        display: ['-webkit-box', 'flex'],
        gap: ds.omit,
      })
      return ds.class([
        reusable,
        { hover: { color: 'red' } },
        false,
        ds.omit,
        { hover: { color: 'blue' } },
      ], 'ordered')
    })

    expect(css.indexOf('display: -webkit-box')).toBeLessThan(css.indexOf('display: flex'))
    expect(css.indexOf('color: red')).toBeLessThan(css.indexOf('color: blue'))
    expect(css).not.toContain('gap:')
  })

  it('emits selector maps, complete raw CSS, and family-wide layer bindings', () => {
    const ds = createSystem().consolidate()
    const { css } = emit(() => {
      ds.rules.layer('reset')({
        'html, body': { margin: 0 },
      })
      ds.raw.layer('utilities')`
        @property --fixture-progress {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        .raw-fixture {
          color: red;
        }
      `
      const animation = ds.keyframes.layer('utilities')({
        from: { opacity: 0 },
        to: { opacity: 1 },
      }, 'fade')
      const family = ds.fontFace.layer('utilities')({
        src: 'url("/fixture.woff2") format("woff2")',
      }, 'fixture')
      ds.class.layer('overrides')({ animationName: animation, fontFamily: family }, 'placed')
    })

    expect(css).toContain('@layer vanity.reset')
    expect(css).toContain('html, body')
    expect(css).toMatch(/@property --fixture-progress/)
    expect(css.indexOf('@property --fixture-progress'))
      .toBeLessThan(css.lastIndexOf('@layer vanity.utilities {'))
    expect(css).toMatch(/@keyframes prism_fade__[\w-]+/)
    expect(css).toContain('@font-face')
    expect(css).toContain('@layer vanity.overrides')
  })

  it('parses complete descriptor rules before raw adapter emission', () => {
    const ds = createSystem().consolidate()
    expect(() => emit(() => ds.fontFace({
      src: '} @font-face broken {',
    }))).toThrowError(VanityError)
  })

  it('creates token-shaped declaration fragments and rejects non-inheriting registrations', () => {
    const open = createSystem()
    const ds = open
      .addTokens({
        color: {
          brand: open.tdef({ val: 'red' }),
          local: open.tdef.color({
            register: { inherits: false, initialVal: 'blue' },
          }),
        },
      })
      .consolidate()

    const { css } = emit(() =>
      ds.class({ ...ds.tdec({ color: { brand: 'rebeccapurple' } }) }, 'theme'))
    expect(css).toContain('--vanity-color-brand: rebeccapurple')

    expect(() => emit(() => ds.tdec({ color: { local: 'green' } })))
      .toThrowError(VanityError)
  })

  it('keeps ordinary TypeScript collection helpers literal and predictable', () => {
    const entries = [['sm', 4], ['md', 8]] as const
    expect(fromEntries(entries)).toEqual({ sm: 4, md: 8 })
    expect(mapRecord({ sm: 4, md: 8 } as const, value => `${value}px`))
      .toEqual({ sm: '4px', md: '8px' })
    expect(range(4)).toEqual([0, 1, 2, 3])
    expect(() => range(-1)).toThrow(/non-negative safe integer/)
  })
})
