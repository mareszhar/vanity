import { createEngine } from '@test/legacy'
import { describe, expectTypeOf, it } from 'vitest'

const de = createEngine().axes(({ axis, data }) => ({
  scheme: axis({ modes: { dark: data('scheme', 'dark'), contrast: data('scheme', 'contrast') } }),
  density: axis({ modes: { compact: data('density', 'compact') } }),
}))
const colors = de.defineTokens({
  color: {
    brand: de.oklch(0.58, 0.2, 285),
    folded: de.token({ val: de.oklch(0.4, 0.1, 120), reference: 'val', emit: false }),
    accent: de.token({
      val: de.oklch(0.6, 0.18, 285),
      mutable: true,
      description: 'Accent',
      axes: { scheme: { dark: null, contrast: de.oklch(0.75, 0.12, 285) } },
      cases: [{ when: { scheme: 'dark', density: 'compact' }, val: de.oklch(0.8, 0.1, 285) }],
    }),
  },
  fill: null,
  future: de.token.color({
    mutable: true,
    register: { inherits: true, initialVal: de.oklch(0.5, 0, 0) },
  }),
})
const ds = de.createSystem({ tokens: colors, prefix: 'app' })

describe('canonical token-graph types', () => {
  it('carries literal names, paths, data types, traits, and authored branches', () => {
    expectTypeOf(ds.t.color.brand.$name).toEqualTypeOf<'--app-color-brand'>()
    expectTypeOf(ds.t.color.brand.$path).toEqualTypeOf<'color.brand'>()
    expectTypeOf(ds.t.color.brand.$type).toEqualTypeOf<'color'>()
    expectTypeOf(ds.t.color.brand.$reference).toEqualTypeOf<'var'>()
    expectTypeOf(ds.t.color.brand.$emit).toEqualTypeOf<true>()
    expectTypeOf(ds.t.color.folded.$reference).toEqualTypeOf<'val'>()
    expectTypeOf(ds.t.color.folded.$emit).toEqualTypeOf<false>()
    expectTypeOf(ds.t.color.accent.$mutable).toEqualTypeOf<true>()
    expectTypeOf(ds.t.color.accent.$description).toEqualTypeOf<'Accent'>()
    expectTypeOf(ds.t.color.accent.$axes.scheme.dark.$val).toEqualTypeOf<undefined>()
    expectTypeOf(ds.t.color.accent.$axes.scheme.contrast.$val).toEqualTypeOf<string>()
    expectTypeOf(ds.t.color.accent.$case({ scheme: 'dark', density: 'compact' }).$val).toEqualTypeOf<string>()
    expectTypeOf(ds.t.fill.$val).toEqualTypeOf<undefined>()
    expectTypeOf(ds.t.future.$type).toEqualTypeOf<'color'>()
    expectTypeOf(ds.t.future.$mutable).toEqualTypeOf<true>()
  })

  it('exposes only authored branches and the canonical `$` vocabulary', () => {
    const authored = de.oklch(0.58, 0.2, 285)
    // @ts-expect-error — liveness belongs to token traits, not authored values
    authored.live()
    // @ts-expect-error — the canonical value model has no token mode enum
    void authored.mode
    // @ts-expect-error — light was not authored on this token
    void ds.t.color.accent.$axes.scheme.light
    // @ts-expect-error — branch handles do not pretend private slots are public properties
    void ds.t.color.accent.$axes.scheme.dark.$name
    // @ts-expect-error — only the authored case address is accepted
    ds.t.color.accent.$case({ scheme: 'light', density: 'compact' })
    // @ts-expect-error — the obsolete public token name is not on canonical handles
    void ds.t.color.brand.name
    // @ts-expect-error — removed token modes are not on the canonical handle model
    void ds.t.color.brand.mode
    // @ts-expect-error — branded fallbacks retain CSS data-type compatibility
    ds.t.color.brand.$var(de.length.rem(1))
  })

  it('keeps projections isomorphic and literal', () => {
    const tokens = ds.tokensOf(colors)
    const names = ds.namesOf(colors)
    const vars = ds.varsOf({ color: ds.t.color })

    expectTypeOf(tokens.color.brand).toEqualTypeOf<typeof ds.t.color.brand>()
    expectTypeOf(names.color.brand).toEqualTypeOf<'--app-color-brand'>()
    expectTypeOf(vars.color.brand).toEqualTypeOf<'var(--app-color-brand)'>()
  })

  it('types project-wide val defaults exactly', () => {
    const compile = createEngine({ tokens: { reference: 'val', emit: false } })
    const compileDs = compile.createSystem({ tokens: { threshold: compile.length.rem(64) } })
    expectTypeOf(compileDs.t.threshold.$reference).toEqualTypeOf<'val'>()
    expectTypeOf(compileDs.t.threshold.$emit).toEqualTypeOf<false>()
  })

  it('rejects incompatible trait combinations at their keys', () => {
    // @ts-expect-error — mutable tokens require a var reference
    de.token({
      val: 'red',
      mutable: true,
      reference: 'val',
    })
    // @ts-expect-error — environmental values require an emitted binding
    de.token({
      val: 'red',
      axes: { scheme: { dark: 'black' } },
      emit: false,
    })

    // @ts-expect-error — graph color operations accept color-typed handles only
    de.alpha(ds.t.fill, 0.5)
  })
})
