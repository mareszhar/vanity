import { emit } from '@test'
import { createEngine, defineCssSupportTarget, VanityError } from '@test/legacy'
import { describe, expect, it } from 'vitest'
import { collectInspection } from '../internal/inspect'

describe('axis declarations and contexts', () => {
  it('emits canonical grouped token overrides in the final token sublayer', () => {
    const de = createEngine()
    const module = de.defineTokens({ color: { brand: de.oklch(0.58, 0.2, 285) } })
      .derive(({ color }) => ({ color: { soft: de.alpha(color.brand, 0.12) } }))
    const { records, result } = collectInspection(() => emit(() => {
      const ds = de.createSystem({ prefix: 'app', tokens: module })
      return ds.tokenOverride({ color: { brand: '#111111' } }, 'midnight')
    }))

    expect(result.returned).toMatch(/^prism_midnight__/)
    expect(result.css).toContain('@layer app.tokens.overrides')
    expect(result.css).toContain('--app-color-brand: #111111;')
    expect(records).toContainEqual(expect.objectContaining({
      kind: 'style',
      name: 'midnight',
      vars: ['--app-color-brand'],
    }))
  })

  it('stages immutable axes with declaration order and an exhaustive override', () => {
    const base = createEngine()
    const environmental = base.axes(({ axis, data, scheme }) => ({
      scheme: scheme(),
      density: axis({
        modes: {
          cozy: data('density', 'cozy'),
          compact: data('density', 'compact'),
        },
        default: 'cozy',
      }),
    }))
    const reordered = environmental.axisOrder('density', 'scheme')

    expect(environmental.signature).not.toBe(base.signature)
    expect(reordered.signature).not.toBe(environmental.signature)
    expect(() => (environmental.axisOrder as any)('scheme')).toThrow(/every name exactly once.*missing: density/)
    expect(() => (environmental.axisOrder as any)('scheme', 'scheme')).toThrow(/duplicate: scheme/)
    expect(() => createEngine().axes(({ axis, data }) => ({
      density: axis({
        modes: { compact: data('density', 'compact'), dense: data('density', 'compact') },
      }),
    }))).toThrow(/same trigger at the same priority/)
    expect(() => createEngine().axes(({ axis, data }) => ({
      density: axis({
        modes: { compact: data('density', 'compact'), cozy: data('density', 'cozy') },
        modeOrder: ['compact'],
      }),
    }))).toThrow(/modeOrder.*every name exactly once.*missing: cozy/)
    expect(() => createEngine().axes(({ axis, condition }) => ({
      density: axis({ modes: { compact: condition('& [data-density=compact]', { on: 'root' }) } }),
    }))).toThrow(/anchored as 'descendant'.*declares on: 'root'/)
    expect(() => createEngine().axes(({ axis, data }) => ({
      0: axis({ modes: { on: data('state', 'on') } }),
    }))).toThrow(/integer-like/)
  })

  it('validates totality, modes, cases, branch types, and mutable reservations locally', () => {
    const de = createEngine().axes(({ axis, data, scheme }) => ({
      scheme: scheme(),
      density: axis({ modes: { compact: data('density', 'compact'), cozy: data('density', 'cozy') } }),
    }))

    expect(() => de.token({ axes: { scheme: { light: 'white' } } } as any))
      .not
      .toThrow() // Finalization owns totality because axis derivations may fill it.
    expect(() => emit(() => de.createSystem({
      tokens: { incomplete: de.token({ axes: { scheme: { light: 'white' } } }) },
    }))).not.toThrow()
    expect(() => de.token({ val: 'red', axes: { scheme: { midnight: 'black' } } } as any))
      .toThrow(/no mode 'midnight'/)
    expect(() => de.token({
      val: 'red',
      cases: [{ when: { scheme: 'dark' }, val: 'black' }],
    } as any)).toThrow(/at least two declared axes/)
    expect(() => de.token({
      val: 'red',
      cases: [
        { when: { scheme: 'dark', density: 'compact' }, val: 'black' },
        { when: { density: 'compact', scheme: 'dark' }, val: 'white' },
      ],
    } as any)).toThrow(/duplicate token case/)
    expect(() => de.token({ val: de.length.px(8), axes: { scheme: { dark: de.oklch(0.2, 0, 0) } } }))
      .not
      .toThrow()
    expect(() => emit(() => de.createSystem({
      tokens: { mismatch: de.token({ val: de.length.px(8), axes: { scheme: { dark: de.oklch(0.2, 0, 0) } } }) },
    }))).toThrow(/use a length value.*branch is color/)
    expect(() => emit(() => de.createSystem({
      tokens: { invalid: de.token({ val: 'red', axes: { scheme: { dark: null } } } as any) },
    }))).toThrow(/requires mutable: true/)
  })

  it('derives missing modes from sibling values and preserves exact branch handles', () => {
    const de = createEngine().axes(({ axis, data, darken }) => ({
      scheme: axis({
        modes: {
          light: data('scheme', 'light'),
          dark: data('scheme', 'dark'),
        },
        default: 'light',
        derive: {
          dark: ({ light }) => darken(light, 0.35),
        },
      }),
    }))
    const { returned: ds } = emit(() => de.createSystem({
      tokens: {
        color: {
          brand: de.token({ axes: { scheme: { light: de.oklch(0.72, 0.16, 285) } } }),
        },
      },
    }))

    expect(ds.t.color.brand.$axes.scheme.light.$val).toBe('oklch(0.72 0.16 285)')
    expect(ds.t.color.brand.$axes.scheme.dark.$val).toContain('oklch(')
  })

  it('lowers derivations into modules before compatible-engine finalization', () => {
    const make = (derived: string, description: string) => createEngine().axes(({ axis, data }) => ({
      scheme: axis({
        modes: { light: data('scheme', 'light'), dark: data('scheme', 'dark') },
        default: 'light',
        derive: { dark: () => derived },
        description,
      }),
    }))
    const authoring = make('authored-engine-dark', 'Original documentation')
    const hmrEquivalent = make('later-engine-dark', 'Edited during HMR')
    const module = authoring.defineTokens({
      color: { accent: authoring.token({ axes: { scheme: { light: 'light' } } }) },
    })

    expect(authoring.signature).toBe(hmrEquivalent.signature)
    const { returned: ds } = emit(() => hmrEquivalent.createSystem({ tokens: module }))
    expect(ds.t.color.accent.$axes.scheme.dark.$val).toBe('authored-engine-dark')
  })

  it('composes group roots and rejects mutable substitution outside them', () => {
    const de = createEngine().axes(({ axis, condition, data }) => ({
      density: axis({ modes: { compact: data('density', 'compact') } }),
      descendant: axis({ modes: { active: condition('[data-active]', { on: 'descendant' }) } }),
    }))

    const { css } = emit(() => de.createSystem({
      root: '#app',
      tokens: {
        widget: {
          $root: '& .widget',
          space: de.token({ val: '12px', axes: { density: { compact: '8px' } } }),
        },
      },
    }))
    expect(css).toContain(':is(#app) .widget')
    expect(css).toContain('[data-density=\'compact\']')
    expect(() => emit(() => de.createSystem({
      tokens: { group: { $axes: { density: {} }, value: '1rem' } } as any,
    }))).toThrow(/group\.\$axes.*canonical token language/)

    expect(() => emit(() => de.createSystem({
      tokens: {
        unsafe: de.token({ val: '1', mutable: true, axes: { descendant: { active: '2' } } }),
      },
    }))).toThrow(/mutable bindings must compute on their effective root/)
  })

  it('guards native scheme locality, registration timing, and support fallback', () => {
    const local = createEngine().axes(({ scheme }) => ({ scheme: scheme() }))
    expect(() => emit(() => local.createSystem({
      tokens: {
        color: {
          accent: local.token.color({
            axes: { scheme: { light: 'white', dark: 'black' } },
            register: { syntax: '<color>', inherits: true, initialVal: 'white' },
          }),
        },
      },
    }))).toThrow(/preserve element-local light-dark/)

    expect(() => emit(() => local.createSystem({
      tokens: {
        color: {
          accent: local.token.color({
            axes: { scheme: { light: 'white', dark: 'black' } },
            register: { syntax: '*', inherits: true },
          }),
        },
      },
    }))).not.toThrow()

    expect(() => emit(() => local.createSystem({
      tokens: {
        color: {
          accent: local.token.color({ register: { initialVal: local.length.px(8) } } as any),
        },
      },
    }))).toThrow(/register\.initialVal conflicts[\s\S]*use a color value; this branch is length/)

    const oldTarget = createEngine({
      support: defineCssSupportTarget({ id: 'without-light-dark', features: ['custom-properties'] }),
    }).axes(({ scheme }) => ({ scheme: scheme() }))
    expect(() => emit(() => oldTarget.createSystem({
      tokens: { color: { accent: oldTarget.token.color({ axes: { scheme: { light: 'white', dark: 'black' } } }) } },
    }))).toThrow(/requests element-local scheme selection.*lacks light-dark/)

    const rootBound = createEngine({
      support: defineCssSupportTarget({ id: 'without-light-dark', features: ['custom-properties'] }),
    }).axes(({ scheme }) => ({ scheme: scheme({ locality: 'root' }) }))
    expect(() => emit(() => rootBound.createSystem({
      tokens: { color: { accent: rootBound.token.color({ axes: { scheme: { light: 'white', dark: 'black' } } }) } },
    }))).not.toThrow()
  })

  it('records axis order, arm locality, and resolved token contexts for inspection', () => {
    const de = createEngine().axes(({ axis, absoluteCondition, data, media, condition }) => ({
      density: axis({
        modes: {
          compact: data('density', 'compact', { priority: 20 }),
          print: condition(media('print'), { priority: 0 }),
          portal: absoluteCondition('#portal[data-density=compact]', { priority: 30 }),
          child: condition('& [data-density=child]'),
        },
      }),
    }))
    const { records } = collectInspection(() => emit(() => de.createSystem({
      tokens: { space: { control: de.token({ val: '12px', axes: { density: { compact: '8px' } } }) } },
    })))

    const system = records.find(record => record.kind === 'system')
    const token = records.find(record => record.kind === 'token' && record.path === 'space.control')
    expect(system).toMatchObject({
      kind: 'system',
      axes: {
        order: ['density'],
        definitions: {
          density: {
            modeOrder: ['compact', 'print', 'portal', 'child'],
            modes: {
              compact: { arms: [{ locality: 'root', placement: 'root', priority: 20 }] },
              print: { arms: [{ locality: 'document', placement: 'query', priority: 0 }] },
              portal: { arms: [{ locality: 'absolute', placement: 'absolute', priority: 30 }] },
              child: { arms: [{ locality: 'subtree', placement: 'descendant', priority: 0 }] },
            },
          },
        },
      },
    })
    expect(token).toMatchObject({
      kind: 'token',
      emission: [
        { kind: 'base', root: ':root', layer: 'vanity.tokens.base' },
        {
          kind: 'axis',
          axis: 'density',
          mode: 'compact',
          root: ':is(:root)[data-density=\'compact\']',
          locality: 'root',
          placement: 'root',
          priority: 20,
          layer: 'vanity.tokens.axes.density',
        },
      ],
    })
  })

  it('uses VanityError for escaped invalid engine/token composition', () => {
    const one = createEngine().axes(({ scheme }) => ({ scheme: scheme() }))
    const two = createEngine().axes(({ axis, data }) => ({
      density: axis({ modes: { compact: data('density', 'compact') } }),
    }))
    const module = one.defineTokens({ color: { accent: one.token({ axes: { scheme: { light: 'white', dark: 'black' } } }) } })
    expect(() => emit(() => (two.createSystem as any)({ tokens: module }))).toThrowError(VanityError)
  })
})
