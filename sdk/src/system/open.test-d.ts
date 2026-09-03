import { createSystem, definePlugin } from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

describe('open and locked system types', () => {
  it('accumulates exact shape and narrows at consolidation', () => {
    const open = createSystem({ constructors: { length: { unitless: 'rem' } } })
      .addTokens({ color: { brand: '#635bff' } })
      .addConditions({ selected: '&[data-selected]' })
      .addConsts({ density: 0.875 })
      .addUtils({ twice: (value: number) => value * 2 })

    expectTypeOf(open.t.color.brand.$phase).toEqualTypeOf<'logical'>()
    expectTypeOf(open.length(2).css).toEqualTypeOf<'2rem'>()
    // @ts-expect-error — logical handles have no final CSS name
    void open.t.color.brand.$name
    // @ts-expect-error — styling requires a locked system
    void open.css

    const ds = open.consolidate({ prefix: 'app' as const })
    expectTypeOf(ds.t.color.brand.$name).toEqualTypeOf<'--app-color-brand'>()
    expectTypeOf(ds.consts.density).toEqualTypeOf<0.875>()
    expectTypeOf(ds.twice(2)).toEqualTypeOf<number>()
    // @ts-expect-error — registration is absent from the locked surface
    void ds.addTokens
    // @ts-expect-error — the removed nested capability surface has no output alias
    void ds.createSystem
  })

  it('rejects duplicate additive keys at their inputs', () => {
    const base = createSystem()
      .addConditions({ selected: '&[data-selected]' })
      .addConsts({ density: 1 })
      .addUtils({ twice: (value: number) => value * 2 })

    // @ts-expect-error — addConditions is additive-only
    base.addConditions({ selected: '&[aria-selected=true]' })
    // @ts-expect-error — addConsts is additive-only
    base.addConsts({ density: 2 })
    // @ts-expect-error — addUtils is additive-only
    base.addUtils({ twice: (value: number) => value + value })
    // @ts-expect-error — locked styling names are reserved across both system states
    base.addUtils({ class: () => 'lost' })
    // @ts-expect-error — constructors and registration methods share the same namespace
    base.addUtils({ length: () => 'lost', addTokens: () => 'lost' })
    // @ts-expect-error — constructors cannot replace an existing utility
    base.addConstructor('twice', { call: (value: number) => base.length.px(value) })
    // @ts-expect-error — consts cross the portable boundary as JSON data
    base.addConsts({ executable: () => true })
  })

  it('keeps overwrites key-safe while allowing replacement values to evolve', () => {
    const changed = createSystem()
      .addConditions({ selected: '&[data-selected]' })
      .addConsts({ density: 1 })
      .overwriteConditions({ selected: '&[aria-selected=true]' })
      .overwriteConsts({ density: 2 })

    expectTypeOf(changed.conditions.selected).toEqualTypeOf<'&[aria-selected=true]'>()
    expectTypeOf(changed.consts.density).toEqualTypeOf<2>()

    // @ts-expect-error — overwriteConditions cannot introduce keys
    changed.overwriteConditions({ missing: '&' })
    // @ts-expect-error — overwriteConsts cannot introduce keys
    changed.overwriteConsts({ missing: true })
  })

  it('infers plugin contributions and rejects unconfigured options and early requirements', () => {
    const configured = definePlugin({
      id: 'org.vanity.types.configured',
      version: 1,
      setup: (ds, options: { readonly factor: number }) => ds
        .addUtils({ scaled: (value: number) => value * options.factor })
        .addConstructor('step', {
          call: (value: number) => ds.length.px(value * options.factor),
          from: (value: number) => ds.length.rem(value),
        }),
    })

    // @ts-expect-error — required plugin options must be configured locally
    createSystem().addPlugin(configured)
    const withConfigured = createSystem().addPlugin(configured({ factor: 2 }))
    expectTypeOf(withConfigured.scaled(2)).toEqualTypeOf<number>()
    expectTypeOf(withConfigured.step(2).type).toEqualTypeOf<'length'>()
    expectTypeOf(withConfigured.step.from(2).type).toEqualTypeOf<'length'>()

    const requirement = definePlugin({
      id: 'org.vanity.types.requirement',
      version: 1,
      setup: (ds) => {
        const expected = ds
          .expectTokens({ color: { brand: { type: 'color', mutable: true } } })
          .expectAxis('scheme', ['light', 'dark'])
        return expected.addUtils({
          ready: () => true,
          brandTheme: (value: string) => expected.tdec({ color: { brand: value } }),
        })
      },
    })
    // @ts-expect-error — requirements must precede the plugin in the chain
    createSystem().addPlugin(requirement)

    const host = createSystem()
      .addAxis('scheme', ['light', 'dark'])
      .addTokens(system => ({
        color: {
          brand: system.tdef.color({ mutable: true }),
        },
      }))
      .augmentTokens({ color: { brand: 'red' } })
    expectTypeOf(host.t.color.brand.$type).toEqualTypeOf<'color'>()
    expectTypeOf(host.t.color.brand.$mutable).toEqualTypeOf<true>()
    const hostModes: keyof typeof host.axes.scheme.modes = 'light'
    void hostModes
    const mounted = host
      .addPlugin(requirement)
    expectTypeOf(mounted.ready()).toEqualTypeOf<boolean>()
    expectTypeOf(mounted.brandTheme('blue')).toMatchTypeOf<Record<`--${string}`, string | number>>()
  })

  it('omits overwrite and mount methods from plugin setup', () => {
    definePlugin({
      id: 'org.vanity.types.additive',
      version: 1,
      setup: (ds) => {
        // @ts-expect-error — plugins cannot overwrite host-owned vocabulary
        ds.overwriteTokens({})
        // @ts-expect-error — plugin setup cannot mount another plugin
        ds.addPlugin({} as never)
        // @ts-expect-error — plugin setup cannot consolidate the host
        ds.consolidate()
        return ds.addUtils({ safe: () => true })
      },
    })
  })

  it('keeps constructor families on the branded value protocol', () => {
    // @ts-expect-error — constructors return vanity values, not raw CSS text
    createSystem().addConstructor('rawString', { call: () => 'red' })
  })
})
