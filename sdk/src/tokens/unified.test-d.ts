import {
  colorSchemes,
  createSystem,
  data,
  defineTokens,
  media,
} from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

describe('unified token and axis types', () => {
  it('keeps logical graph handles valid through calculations and color channels', () => {
    const open = createSystem()
      .addTokens(current => ({
        control: {
          min: current.tdef.number({ val: 0.2, mutable: true }),
          max: current.tdef.number({ val: 0.9, mutable: true }),
          pivot: current.tdef.number({ val: 0.5, mutable: true }),
        },
      }))
      .addTokens(current => ({
        brand: current.oklch(
          current.calc(current.t.control.min)
            .add(current.calc(current.t.control.max).subtract(current.t.control.min)),
          current.t.control.pivot,
          280,
        ),
        shifted: current.oklch.from('oklch(60% 0.2 280)', {
          l: current.channel.subtract(current.t.control.pivot).multiply(-1000),
          alpha: current.calc(current.t.control.max).subtract(current.t.control.min),
        }),
      }))

    expectTypeOf(open.t.brand.$type).toEqualTypeOf<'color'>()
    expectTypeOf(open.t.shifted.$type).toEqualTypeOf<'color'>()

    open.oklch(
      // @ts-expect-error — a color handle is not a numeric channel
      open.t.brand,
      0.2,
      280,
    )
  })

  it('accumulates the four t() forms and rebinds portable module shape', () => {
    const portable = defineTokens({ seed: 'red' })
      .add('alias', m => m.seed)
      .add(m => ({ nested: { contrast: m.alias } }))
    const open = createSystem()
    const module = open.defineTokens({ color: portable })
      .add('space', '4px')
      .add(open.defineTokens({ radius: '6px' }))

    expectTypeOf(module.refs.color.seed.$path).toEqualTypeOf<'color.seed'>()
    expectTypeOf(module.refs.color.alias.$path).toEqualTypeOf<'color.alias'>()
    expectTypeOf(module.refs.color.nested.contrast.$path).toEqualTypeOf<'color.nested.contrast'>()

    // @ts-expect-error — add() is additive and rejects an existing exact path
    module.add('space', '8px')
    // @ts-expect-error — token metadata names are reserved
    module.add('$axes', 'invalid')

    const openDefinition = open.tdef({ val: 'red' })
    // @ts-expect-error — portable modules cannot capture system-bound definitions
    defineTokens({ invalid: openDefinition })
    // @ts-expect-error — token traits require the system-bound builder
    portable.add('invalidConfig', { val: 'red', mutable: true })
  })

  it('carries reservations, fluent axis methods, bulk axes, and exact patch targets', () => {
    const open = createSystem()
      .addAxis('scheme', colorSchemes({ locality: 'root' }))
      .addAxis('density', {
        modes: {
          cozy: '&',
          compact: data('density', 'compact'),
        },
        default: 'cozy',
      })
    const staged = open.addTokens({
      color: {
        canvas: open.tdef.color({ mutable: true }),
        $axes: {
          scheme: mode => ({
            canvas: mode === 'dark' ? '#111' : '#fff',
          }),
        },
      },
      control: open.tdef({
        val: '12px',
        mutable: true,
        axes: { density: { compact: null } },
      }),
    }).augmentTokens({
      control: token => token.density({ compact: '8px' }),
    })
    const ds = staged.consolidate({
      prefix: 'typed',
      axisOrder: ['scheme', 'density'],
    })

    expectTypeOf(ds.t.color.canvas.$type).toEqualTypeOf<'color'>()
    expectTypeOf(ds.t.color.canvas.$axes.scheme.dark.$val).toEqualTypeOf<string>()
    expectTypeOf(ds.t.control.$axes.density.cozy.$val).toEqualTypeOf<'12px'>()

    // @ts-expect-error — an exhaustive axis order cannot omit density
    staged.consolidate({ axisOrder: ['scheme'] })
    // @ts-expect-error — an exhaustive axis order cannot repeat scheme
    staged.consolidate({ axisOrder: ['scheme', 'scheme'] })
    staged.augmentTokens({
      control: token =>
        // @ts-expect-error — axis patch modes are exact
        token.density({ tiny: '4px' }),
    })
  })

  it('types accumulated condition callbacks and structured ranges', () => {
    const open = createSystem()
      .addConditions({ wide: media({ width: { '>=': '60rem' } }) })
      .addAxis('viewport', ds => ({
        modes: {
          narrow: '&',
          wide: ds.conditions.wide,
        },
        default: 'narrow',
      }))

    expectTypeOf(open.conditions.wide.ast.kind).toEqualTypeOf<
      'selector' | 'media' | 'supports' | 'container' | 'scope' | 'anchor' | 'and' | 'or' | 'not'
    >()

    // @ts-expect-error — equality cannot be combined with another range bound
    media({ width: { '=': '60rem', '<': '80rem' } })
  })
})
