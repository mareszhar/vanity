import { createSystem } from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'
import { hail } from '../../presets'

describe('Hail public types', () => {
  it('keeps the default surface small and readable', () => {
    const ds = createSystem().addPlugin(hail()).consolidate()

    expectTypeOf(ds.oklchx).toBeFunction()
    expectTypeOf(ds.oklchx.from).toBeFunction()
    expectTypeOf(ds.span).toBeFunction()
    expectTypeOf(ds.exact).toBeFunction()
    expectTypeOf(ds.size).toBeFunction()
    expectTypeOf(ds.bem).toBeFunction()
    expectTypeOf(ds.mx.circle).toBeFunction()
    // @ts-expect-error — elevation members cost nothing and do not exist by default
    void ds.oklchx.inE
    // @ts-expect-error — presets are opt-in when the presets option is omitted
    void ds.t.color.palette
  })

  it('projects conditional elevation, marker names, tokens, and rule names', () => {
    const open = createSystem().addPlugin(hail({
      color: {
        elevation: true,
        markers: { span: 'portion', exact: 'literal' },
        ranges: { l: [0.08, 0.96], c: [0, 0.3], h: [300, 20] },
      },
      controls: { default: 'token', overrides: { c: 'mutable' } },
      presets: {
        mode: 'opt-in',
        listed: ['palette', 'roles', 'sizes', 'breakpoints', 'icons', 'reset', 'theming'],
      },
    }))

    expectTypeOf(open.oklchx.inE).toBeFunction()
    expectTypeOf(open.portion).toBeFunction()
    expectTypeOf(open.literal).toBeFunction()
    expectTypeOf(open.t.color.palette.accent.$type).toEqualTypeOf<'color'>()
    void open.t.text.body.$dec.fontSize
    expectTypeOf(open.t.size['8p'].$type).toEqualTypeOf<'length'>()
    expectTypeOf(open.t.hail.control.ranges.c.min.$mutable).toEqualTypeOf<true>()
    expectTypeOf(open.t.hail.control.base.$mutable).toEqualTypeOf<false>()
    expectTypeOf(open.t.hail.mostElevatedL.$emit).toEqualTypeOf<true>()
    expectTypeOf(open.axes.scheme).toBeObject()
    expectTypeOf(open.consolidate().runtime().t.hail.control.ranges.c.max.$set).toBeFunction()
    open.overwriteRule('hailReset', { description: 'host reset refinement' })
    open.overwriteRule('hailTheming', { description: 'host theming refinement' })
    // @ts-expect-error — renamed markers do not leave aliases behind
    void open.span
    // @ts-expect-error — unselected rule groups are absent
    open.overwriteRule('hailMotion', {})
  })

  it('rejects malformed options at their authoring site', () => {
    hail({
      color: {
        ranges: {
          // @ts-expect-error — a Hail range is exactly [minimum, maximum]
          l: [0, 0.5, 1],
          // @ts-expect-error — RGB components are intentionally not normalizable
          r: [0, 1],
        },
      },
    })
    hail({
      presets: {
        mode: 'opt-in',
        // @ts-expect-error — preset names are an exact completion union
        listed: ['pallete'],
      },
    })

    const flat = createSystem().addPlugin(hail()).consolidate()
    // @ts-expect-error — `e` is conditional alongside `.inE`
    flat.oklchx.from('red', { e: 0.5 })
    // @ts-expect-error — lightness and elevation are mutually exclusive
    createSystem().addPlugin(hail({ color: { elevation: true } })).oklchx.from('red', { l: 0.5, e: 0.5 })
  })
})
