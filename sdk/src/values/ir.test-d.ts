import type { VanityCssValue, VanitySelfValue, VanityValue } from '@mszr/vanity'
import {
  angle,
  calc,
  number as cssNumber,
  customProperty,
  defineTokens,
  hwb,
  length,
  min,
  mix,
  oklch,
  percent,
} from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'
import { getTokenModule } from '../tokens/builder'
import { resolveTokenModule } from '../tokens/resolve'

describe('typed CSS value contracts', () => {
  it('keeps the common interface context-bound while compatibility helpers remain usable', () => {
    const neutral = null as unknown as VanitySelfValue<'length'>
    // @ts-expect-error — context-free `.css` is not part of the common contract
    void neutral.css

    expectTypeOf(length.rem(2)).toExtend<VanityCssValue<`${number}rem`, 'length'>>()
    expectTypeOf(angle.deg(45)).toExtend<VanitySelfValue<'angle'>>()
  })

  it('infers custom-property types and fallback types', () => {
    const typed = customProperty('--gap', { type: 'length' })
    const inferred = customProperty('--ratio').$var(cssNumber(1.2))
    expectTypeOf(typed.$var()).toExtend<VanityValue<'length'>>()
    expectTypeOf(inferred).toExtend<VanityValue<'number'>>()
  })

  it('propagates math results and rejects known incompatible comparisons', () => {
    expectTypeOf(calc(length.px(2)).multiply(cssNumber(3))).toExtend<import('@mszr/vanity').VanityCalc<'length'>>()
    expectTypeOf(calc(length.px(2)).divide(length.px(1))).toExtend<import('@mszr/vanity').VanityCalc<'number'>>()
    expectTypeOf(min(length.px(2), percent(30))).toExtend<import('@mszr/vanity').VanityMathValue<'length-percentage'>>()
    // @ts-expect-error — known time and length dimensions cannot share min()
    min('1s', '2px')
  })

  it('types the full color-channel forms and interpolation-only .in()', () => {
    const chroma = customProperty('--chroma', { type: 'number' }).$var()
    void oklch(percent(50), chroma, angle.deg(285), cssNumber(0.5))
    void hwb(angle.deg(20), 'none', percent(10))
    const channels = resolveTokenModule(getTokenModule(defineTokens({ channel: { l: 0.5, c: 0.2, h: 285 } }))!)
    void oklch((channels as any).channel.l, (channels as any).channel.c, (channels as any).channel.h)
    // @ts-expect-error — arbitrary strings are not typed channel values
    oklch('mystery', 0.2, 20)
    // @ts-expect-error — lengths are not numeric color components
    oklch(length.px(1), 0.2, 20)
    // @ts-expect-error — percentages are not hues
    oklch(0.5, 0.2, percent(20))
    void oklch(0.5, 0.2, angle.deg(285))

    mix('#fff', '#000', 0.5).in('oklch', { hue: 'shorter' })
    // @ts-expect-error — a rectangular color space has no hue path
    mix('#fff', '#000', 0.5).in('srgb', { hue: 'shorter' })
    // @ts-expect-error — a color constructor is not an interpolation operation
    oklch(0.5, 0.2, 20).in('oklab')
  })
})
