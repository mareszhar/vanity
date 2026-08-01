import type { VanityCondition, VanityEnginePlugin } from '../test-support/characterization'
import { describe, expectTypeOf, it } from 'vitest'
import { createEngine, defineEnginePlugin, defineTokens } from '../test-support/characterization'

describe('canonical engine types', () => {
  it('keeps configuration, modules, systems, and extension namespaces exact', () => {
    const de = createEngine({ length: { unitless: 'rem' } })
    const colors = de.defineTokens({ color: { brand: de.oklch(0.58, 0.2, 285) } })

    expectTypeOf(de.length(2).css).toEqualTypeOf<'2rem'>()
    // @ts-expect-error unfinished modules cannot claim a final prefix/name
    colors.build()

    const editorial = de.extend(engine => ({
      editorial: {
        measure: <const Value extends number>(value: Value) => engine.length.ch(value),
      },
    }))
    expectTypeOf(editorial.editorial.measure(70).css).toEqualTypeOf<'70ch'>()

    const ds = editorial.createSystem({
      tokens: editorial.defineTokens().compose(colors),
      prefix: 'app',
      conditions: { selected: '&[aria-selected="true"]' },
    })

    expectTypeOf(ds.t.color.brand.$name).toEqualTypeOf<'--app-color-brand'>()
    expectTypeOf(ds.length(2).css).toEqualTypeOf<'2rem'>()
    expectTypeOf(ds.editorial.measure(70).css).toEqualTypeOf<'70ch'>()
    expectTypeOf(ds.conditions.selected).toEqualTypeOf<string>()
    type Layer = (typeof ds.layers)[number]
    expectTypeOf<Layer>().toEqualTypeOf<'reset' | 'tokens' | 'recipes' | 'utilities' | 'overrides'>()

    // Definition and finalization stay engine-only.
    // @ts-expect-error systems style things; they do not define token modules
    ds.defineTokens({})
    // @ts-expect-error systems cannot finalize another system
    ds.createSystem({ tokens: {} })
  })

  it('gives reusable plugins the configured core environment', () => {
    const rhythm = defineEnginePlugin({
      id: 'com.example.rhythm',
      version: 1,
      setup: engine => ({
        rhythm: {
          double: <const Value extends number>(value: Value) => engine.length.rem(value * 2),
        },
      }),
    })
    const de = createEngine({ length: { unitless: 'ch' } }).use(rhythm)

    expectTypeOf(de.rhythm.double(4).css).toEqualTypeOf<`${number}rem`>()
  })

  it('carries exact, runtime-kebabed condition output in helper types', () => {
    const de = createEngine()

    expectTypeOf(de.data('activeState', 'open'))
      .toMatchTypeOf<VanityCondition<'[data-active-state=\'open\']', true>>()
    expectTypeOf(de.aria('currentPage', false))
      .toMatchTypeOf<VanityCondition<'[aria-current-page=\'false\']'>>()
  })

  it('rejects a plugin whose required earlier namespace is absent', () => {
    interface EditorialRequirement {
      editorial: { double: (value: number) => number }
    }
    const expansion: VanityEnginePlugin<{
      expansion: { quadruple: (value: number) => number }
    }, EditorialRequirement> = {
      id: 'com.example.expansion',
      version: 1,
      setup: engine => ({
        expansion: { quadruple: value => engine.editorial.double(value) * 2 },
      }),
    }
    const base = createEngine()
    const editorial = base.extend(() => ({
      editorial: { double: (value: number) => value * 2 },
    }))

    // @ts-expect-error this plugin declares an editorial namespace requirement
    base.use(expansion)
    expectTypeOf(editorial.use(expansion).expansion.quadruple(2)).toEqualTypeOf<number>()
  })

  it('rejects finalized handle graphs and reserved extension names at the cursor', () => {
    const de = createEngine()
    const finalized = defineTokens({ color: { brand: '#f00' } }).build()

    // @ts-expect-error canonical systems accept unfinished modules or raw graphs, not built handles
    de.createSystem({ tokens: finalized })

    de.extend(() => ({
      // @ts-expect-error class is reserved by system surface v2
      class: {},
    }))
    de.extend(() => ({
      // @ts-expect-error length is already a built-in constructor
      length: {},
    }))
  })
})
