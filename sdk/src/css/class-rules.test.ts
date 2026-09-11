import { colorMix, colorSchemes, createSystem, fromEntries, mapRecord, range, VanityError } from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'

describe('the class and rules', () => {
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

  it('propagates scoped substitutions through folded dependents without mutating the graph', () => {
    const open = createSystem()
    const ds = open.addTokens(open.defineTokens({
      color: {
        base: open.tdef.color({ val: 'white', reference: 'var' }),
      },
    }).add(m => ({
      color: {
        onBase: open.legibleOn(m.color.base),
        live: open.alpha(m.color.base, 0.2),
      },
    }))).consolidate({ prefix: 'prop' })

    const { css } = emit(() => ds.class({
      ...ds.tdec.propagated({ color: { base: '#18181b' } }),
      color: ds.t.color.onBase,
    }, 'propagated'))

    expect(css).toContain('--prop-color-base: white;')
    expect(css).toContain('--prop-color-base: #18181b;')
    expect(css).toContain('--prop-color-on-base: white;')
    expect(css.match(/--prop-color-live:/g)?.length).toBe(1)
    expect(css).toContain('color: var(--prop-color-on-base);')
  })

  it('diagnoses propagated folded dependents that vary across an axis', () => {
    const open = createSystem().addAxis('scheme', colorSchemes())
    const ds = open.addTokens(open.defineTokens({
      color: {
        base: open.tdef.color({ axes: { scheme: { light: '#cccccc', dark: '#444444' } } }),
        tint: open.tdef({ val: open.color('#0a7d55') }),
      },
    }).add(m => ({
      color: {
        blend: colorMix([m.color.base, m.color.tint]).in('oklab'),
      },
    })).add(m => ({
      color: {
        onBlend: open.legibleOn(m.color.blend, { contrast: 50 }),
      },
    }))).consolidate({ prefix: 'prop' })

    let caught: unknown
    try {
      emit(() => ds.tdec.propagated({ color: { tint: '#0080e0' } }))
    }
    catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(VanityError)
    expect((caught as VanityError).diagnostics).toContainEqual(expect.objectContaining({
      code: 'VANITY_TOKENS_INVALID_OVERRIDE',
      path: ['color', 'onBlend'],
      message: expect.stringContaining('cannot scope \'onBlend\': its folded value differs across the \'scheme\' axis'),
      fix: expect.objectContaining({
        message: 'scope the substitution inside a single mode, keep the derivation live so the browser recomputes it, or express the variation as an axis',
      }),
    }))
  })

  it('keeps the propagated guard silent for unrelated and flattening relationships', () => {
    const open = createSystem().addAxis('scheme', colorSchemes())
    const ds = open
      .addTokens({
        canvas: open.tdef.color({ axes: { scheme: { light: '#cccccc', dark: '#444444' } } }),
        brand: open.tdef({ val: open.color('#0a7d55') }),
        accent: open.tdef({ val: open.color('purple') }),
        tint: open.tdef({ val: open.color('#0a7d55') }),
        space: open.tdef({ val: open.length.rem(1) }),
        ratio: open.tdef({ val: 1 }),
      })
      .addTokens(current => ({
        onCanvas: current.legibleOn(current.t.canvas),
        onBrand: current.legibleOn(current.t.brand),
        blend: current.colorMix([current.t.canvas, current.t.tint]).in('oklab'),
      }))
      .addTokens(current => ({
        onBlend: current.legibleOn(current.t.blend, { contrast: 50 }),
      }))
      .consolidate({ prefix: 'guard' })

    const cases = [
      {
        name: 'unrelated-length',
        run: () => emit(() => ds.class({
          ...ds.tdec.propagated({ space: '2rem' }),
          color: ds.t.onCanvas,
        }, 'unrelated-length')),
      },
      {
        name: 'unrelated-number',
        run: () => emit(() => ds.class({
          ...ds.tdec.propagated({ ratio: 2 }),
          color: ds.t.onCanvas,
        }, 'unrelated-number')),
      },
      {
        name: 'unrelated-color',
        run: () => emit(() => ds.class({
          ...ds.tdec.propagated({ accent: 'blue' }),
          color: ds.t.onCanvas,
        }, 'unrelated-color')),
      },
      {
        name: 'invariant-dependent',
        run: () => emit(() => ds.class({
          ...ds.tdec.propagated({ brand: 'red' }),
          color: ds.t.onBrand,
        }, 'invariant-dependent')),
      },
      {
        name: 'direct-axis-flattening',
        run: () => emit(() => ds.class({
          ...ds.tdec.propagated({ canvas: '#808080' }),
          color: ds.t.onCanvas,
        }, 'direct-axis-flattening')),
      },
    ] as const

    for (const scenario of cases) {
      expect(() => scenario.run(), scenario.name).not.toThrow()
    }
  })

  it('does not apply the propagated axis guard when no axes are present', () => {
    const open = createSystem()
    const ds = open
      .addTokens({
        base: open.tdef({ val: open.color('#cccccc') }),
        tint: open.tdef({ val: open.color('#0a7d55') }),
      })
      .addTokens(current => ({
        blend: current.colorMix([current.t.base, current.t.tint]).in('oklab'),
      }))
      .addTokens(current => ({
        onBlend: current.legibleOn(current.t.blend, { contrast: 50 }),
      }))
      .consolidate({ prefix: 'no-axis' })

    const { css } = emit(() => ds.class({
      ...ds.tdec.propagated({ tint: '#0080e0' }),
      color: ds.t.onBlend,
    }, 'no-axis'))

    expect(css).toContain('--no-axis-on-blend: black;')
  })

  it('keeps propagated validation and registration diagnostics aligned with tdec', () => {
    const open = createSystem()
    const ds = open.addTokens({
      color: {
        brand: open.tdef({ val: 'red' }),
        local: open.tdef.color({ register: { inherits: false, initialVal: 'blue' } }),
      },
    }).consolidate()

    expect(() => emit(() => ds.tdec.propagated({ color: { missing: 'red' } } as any)))
      .toThrowError(VanityError)
    expect(() => emit(() => ds.tdec.propagated({ color: { brand: { value: 'red' } } } as any)))
      .toThrowError(VanityError)
    expect(() => emit(() => ds.tdec.propagated({ color: { local: 'green' } })))
      .toThrowError(VanityError)
  })

  it('surfaces one graph diagnostic when a substitution breaks a folded check', () => {
    const open = createSystem()
    const ds = open.addTokens(open.defineTokens({
      color: { base: open.tdef.color({ val: 'black', reference: 'val' }) },
    }).add(m => ({
      color: { onBase: open.legibleOn(m.color.base, { contrast: 90 }) },
    }))).consolidate({ prefix: 'diagnostic' })

    let caught: unknown
    try {
      emit(() => ds.tdec.propagated({ color: { base: '#777777' } }))
    }
    catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(VanityError)
    expect((caught as VanityError).diagnostics).toHaveLength(1)
    expect((caught as VanityError).diagnostics[0]).toMatchObject({
      code: 'VANITY_TOKENS_CONTRAST',
      path: ['color', 'onBase'],
    })
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
