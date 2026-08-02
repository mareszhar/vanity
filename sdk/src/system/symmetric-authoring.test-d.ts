import {
  createSystem,
  defineAxes,
  defineConditions,
  defineConstructor,
  defineConsts,
  definePlugin,
  defineRules,
  defineTokens,
  defineUtils,
} from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

describe('symmetric authoring types', () => {
  it('preserves accumulated module and system callback context', () => {
    const consts = defineConsts({ seed: 2 }).add(m => ({
      doubled: m.seed * 2,
    }))
    const conditions = defineConditions().add('selected', '&[aria-selected=true]')
    const axes = defineAxes().add('density', ['comfortable', 'compact'])
    const utils = defineUtils({ mx: { circle: () => 'circle' as const } })
      .add({ mx: { badge: () => 'badge' as const } })
    const rules = defineRules().add('reset', {
      css: { '*': { boxSizing: 'border-box' } },
    })
    const constructor = defineConstructor('family', {
      call: (value: number) => createSystem().length.px(value),
      alternate: (value: number) => createSystem().length.rem(value),
    })

    const open = createSystem()
      .addConsts(consts)
      .addConst('tripled', ds => ds.consts.seed * 3)
      .addConditions(conditions)
      .addAxes([axes])
      .addUtils(utils)
      .addRules(rules)
      .addConstructors([constructor])

    expectTypeOf(open.consts.doubled).toEqualTypeOf<number>()
    expectTypeOf(open.consts.tripled).toEqualTypeOf<number>()
    expectTypeOf(open.conditions.selected).toEqualTypeOf<'&[aria-selected=true]'>()
    expectTypeOf(open.mx.circle()).toEqualTypeOf<'circle'>()
    expectTypeOf(open.mx.badge()).toEqualTypeOf<'badge'>()
    expectTypeOf(open.family(2).type).toEqualTypeOf<'length'>()
    expectTypeOf(open.family.alternate(2).type).toEqualTypeOf<'length'>()
    expectTypeOf(open.axes.density.modes).toHaveProperty('compact')
  })

  it('places additive collisions on the offending input', () => {
    const base = createSystem()
      .addCondition('selected', '&[data-selected]')
      .addConst('density', 1)
      .addUtil('double', (value: number) => value * 2)

    // @ts-expect-error — singular condition names are additive.
    base.addCondition('selected', '&[aria-selected=true]')
    // @ts-expect-error — singular const names are additive.
    base.addConst('density', 2)
    // @ts-expect-error — singular utility names are additive.
    base.addUtil('double', (value: number) => value + value)
  })

  it('keeps plugin-owned axis names literal', () => {
    const density = definePlugin({
      id: 'org.vanity.types.density-axis',
      version: 1,
      setup: ds => ds.addAxis('density', ['comfortable', 'compact']),
    })
    const open = createSystem().addPlugin(density)
    expectTypeOf(open.axes.density.modes).toHaveProperty('comfortable')
    expectTypeOf(open.axes.density.modes).toHaveProperty('compact')
  })

  it('accepts detached modules for every plural patch verb', () => {
    const open = createSystem()
      .addAxis('scheme', ['light', 'dark'])
      .addTokens({ accent: 'red' })
      .addRule('base', { css: { html: { color: 'red' } } })
      .augmentAxes(defineAxes({
        scheme: { modes: { system: '&[data-scheme=system]' } },
      }))
      .overwriteTokens([defineTokens({ accent: 'blue' })])
      .overwriteRules(defineRules({
        base: { css: { html: { color: 'blue' } } },
      }))

    expectTypeOf(open.axes.scheme.modes).toHaveProperty('system')
  })
})
