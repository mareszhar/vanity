import { colorMix, colorSchemes, createSystem, data, fromEntries, mapRecord, range, VanityError } from '@mszr/vanity'
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

  it('propagates scoped substitutions through folded and live dependents without mutating the graph', () => {
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
    expect(css.match(/--prop-color-live: oklch\(from var\(--prop-color-base\) l c h \/ 0\.2\);/g)?.length).toBe(2)
    expect(css).toContain('color: var(--prop-color-on-base);')
  })

  it('repeats exactly the live dependents that read a property the fragment changes', () => {
    const open = createSystem()
    const ds = open.addTokens(open.defineTokens()
      .add('accent', open.oklch(0.6, 0.15, 265))
      .add('other', open.oklch(0.5, 0.1, 140))
      .add('hard', { val: open.color('#336699'), reference: 'val' })
      .add(m => ({
        soft: open.oklch.from(m.accent, { l: 0.95 }),
        link: m.accent,
        onAccent: open.legibleOn(m.accent),
        hardSoft: open.oklch.from(m.hard, { l: 0.9 }),
        unrelated: open.oklch.from(m.other, { l: 0.9 }),
      }))
      .add(m => ({
        wash: open.alpha(m.soft, 0.5),
        hardEdge: open.oklch.from(m.hardSoft, { c: 0.05 }),
      }))).consolidate({ prefix: 'live' })

    // `onAccent` reads accent through the graph but folds to the same pick,
    // and `unrelated` reads only properties this fragment leaves alone.
    expect(emit(() => ds.tdec.propagated({ accent: open.oklch(0.6, 0.2, 25) })).returned).toEqual({
      '--live-accent': 'oklch(0.6 0.2 25)',
      '--live-soft': 'oklch(from var(--live-accent) 0.95 c h)',
      '--live-link': 'var(--live-accent)',
      '--live-wash': 'oklch(from var(--live-soft) l c h / 0.5)',
    })
    // A folded dependent is re-declared with its new value, and a live
    // dependent of that folded token follows it.
    expect(emit(() => ds.tdec.propagated({ hard: '#000000' })).returned).toEqual({
      '--live-hard': '#000000',
      '--live-hard-soft': expect.not.stringContaining('var('),
      '--live-hard-edge': 'oklch(from var(--live-hard-soft) l 0.05 h)',
    })
    expect(emit(() => ds.tdec({ accent: open.oklch(0.6, 0.2, 25) })).returned).toEqual({
      '--live-accent': 'oklch(0.6 0.2 25)',
    })
  })

  it('refuses live dependents whose root declaration one subtree value cannot reproduce', () => {
    const open = createSystem()
      .addAxis('scheme', colorSchemes())
      .addAxis('density', { modes: { cozy: data('density', 'cozy'), compact: data('density', 'compact') }, default: 'cozy' })
    const ds = open.addTokens(open.defineTokens()
      .add('accent', open.oklch(0.6, 0.15, 265))
      .add(m => ({
        dense: open.tdef.color({
          val: open.oklch.from(m.accent, { l: 0.95 }),
          axes: { density: { compact: open.oklch.from(m.accent, { l: 0.8 }) } },
        }),
        paired: open.tdef.color({
          val: open.oklch.from(m.accent, { l: 0.95 }),
          cases: [{ when: { scheme: 'dark', density: 'compact' }, val: open.oklch.from(m.accent, { l: 0.3 }) }],
        }),
        runtime: open.tdef.color({ val: open.oklch.from(m.accent, { l: 0.5 }), mutable: true }),
        schemed: open.tdef.color({
          axes: { scheme: { light: open.oklch.from(m.accent, { l: 0.9 }), dark: open.oklch.from(m.accent, { l: 0.3 }) } },
        }),
      }))).consolidate({ prefix: 'arm' })

    const scoped = { dense: 'red', paired: 'red', runtime: 'red' } as const
    const diagnose = (named: Partial<Record<keyof typeof scoped, string>>) => {
      try {
        emit(() => ds.tdec.propagated({ accent: 'blue', ...named }))
      }
      catch (error) {
        expect(error).toBeInstanceOf(VanityError)
        return (error as VanityError).diagnostics[0]
      }
      return undefined
    }

    expect(diagnose({ paired: 'red', runtime: 'red' })).toMatchObject({
      code: 'VANITY_TOKENS_INVALID_OVERRIDE',
      path: ['dense'],
      message: expect.stringContaining('cannot scope \'dense\': its live expression differs across the \'density\' axis'),
    })
    expect(diagnose({ dense: 'red', runtime: 'red' })).toMatchObject({
      path: ['paired'],
      message: expect.stringContaining('differs in the case scheme \'dark\' + density \'compact\''),
    })
    expect(diagnose({ dense: 'red', paired: 'red' })).toMatchObject({
      path: ['runtime'],
      message: expect.stringContaining('it is runtime-mutable'),
    })
    // Naming each dependent chooses its scoped value; an element-local
    // light-dark() base already selects the scheme arm where it is used.
    expect(diagnose(scoped)).toBeUndefined()
    expect(emit(() => ds.tdec.propagated({ accent: 'blue', ...scoped })).returned).toMatchObject({
      '--arm-schemed': 'light-dark(oklch(from var(--arm-accent) 0.9 c h), oklch(from var(--arm-accent) 0.3 c h))',
    })
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
        message: 'name this dependent in the same tdec.propagated call to choose its scoped value, or express the variation as an axis',
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
