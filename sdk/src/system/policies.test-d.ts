import type {
  VanityAuthoredColor,
  VanityAuthoredInterpolation,
  VanityPendingColorAdjustment,
} from '@mszr/vanity'
import {
  createSystem,
  definePlugin,
  length,
  oklch,
} from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

describe('policy types', () => {
  it('projects the color-mix interpolation requirement through system policy', () => {
    const unconfigured = createSystem()
    const pending = unconfigured.colorMix(['red', 'blue'])
    expectTypeOf(pending).toExtend<VanityAuthoredInterpolation>()
    // @ts-expect-error — an interpolation needs .in() before it can be a token color.
    unconfigured.addTokens({ color: { pending } })

    const configured = createSystem({ color: { mixSpace: 'oklab' } })
    expectTypeOf(configured.colorMix(['red', 'blue'])).toExtend<VanityAuthoredColor>()
    expectTypeOf(configured.colorMix(['red', 'blue']).in('srgb')).toExtend<VanityAuthoredColor>()

    // @ts-expect-error — CSS color-mix() requires exactly two items.
    unconfigured.colorMix(['red'])
  })

  it('projects the adjustment-space requirement and the HWB channel boundary', () => {
    const unconfigured = createSystem()
    expectTypeOf(unconfigured.alpha('red', 0.2)).toExtend<VanityAuthoredColor>()
    expectTypeOf(unconfigured.lighten('red', 0.1)).toExtend<VanityPendingColorAdjustment>()
    // @ts-expect-error — a bare adjustment needs policies.color.adjustSpace.
    unconfigured.addTokens({ color: { pending: unconfigured.lighten('red', 0.1) } })
    // @ts-expect-error — HWB has no lightness channel.
    unconfigured.hwb.lighten('red', 0.1)

    const configured = createSystem({ color: { adjustSpace: 'hsl' } })
    expectTypeOf(configured.lighten('red', 0.1)).toExtend<VanityAuthoredColor>()
    expectTypeOf(configured.hwb.rotate('red', 30)).toExtend<VanityAuthoredColor>()

    const hwbConfigured = createSystem({ color: { adjustSpace: 'hwb' } })
    // @ts-expect-error — the HWB policy has no lightness channel.
    hwbConfigured.lighten('red', 0.1)
    expectTypeOf(hwbConfigured.rotate('red', 30)).toExtend<VanityAuthoredColor>()
  })

  it('projects conformance and restrictions only onto bound constructors', () => {
    const ds = createSystem({
      constructors: {
        length: { unitless: 'rem' },
        oklch: { restrict: { level: 'forbid', use: 'oklchx' } },
      },
    })

    expectTypeOf(ds.length(8).css).toEqualTypeOf<'8rem'>()
    oklch(0.6, 0.2, 280)
    length.px(8)

    // @ts-expect-error — the bound constructor carries the host restriction
    ds.oklch(0.6, 0.2, 280)
  })

  it('keeps plugin policy registration setup-only', () => {
    const plugin = definePlugin({
      id: 'org.example.policy-types',
      version: 1,
      setup: ds => ds.registerPluginPolicy({ mode: 'strict' as const }),
    })

    const user = createSystem()
    // @ts-expect-error — plugins alone register their auto-scoped policy
    user.registerPluginPolicy({ nope: true })

    const mounted = user.addPlugin(plugin)
    expectTypeOf(mounted.policies.plugins!['org.example.policy-types'].mode)
      .toEqualTypeOf<'strict'>()
  })

  it('projects policy onto user-defined families regardless of registration order', () => {
    const before = createSystem({
      constructors: {
        tone: { restrict: { level: 'forbid' } },
      },
    }).addConstructor('tone', {
      call: (value: number) => length.px(value),
      alternate: (value: number) => length.rem(value),
    })
    // @ts-expect-error — custom bound families obey the same policy law.
    before.tone(2)
    // @ts-expect-error — every family member carries the family restriction.
    before.tone.alternate(2)

    const after = createSystem()
      .addConstructor('tone', { call: (value: number) => length.px(value) })
      .addPolicy('constructors', {
        tone: { restrict: { level: 'forbid' as const } },
      })
    // @ts-expect-error — later policy revisions re-project existing families.
    after.tone(2)
  })
})
