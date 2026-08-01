/**
 * Minimal cases derived from normative CSSWG grammar and the WPTs linked by
 * those specs. These are provenance anchors, not a forked CSS parser.
 *
 * - CSS Color 4 §§4.4, 5, 7–10 and color-computed-lab.html
 *   https://www.w3.org/TR/css-color-4/
 * - CSS Color 5 §§3, 9, 11 and color-mix-percents-01/02.html
 *   https://www.w3.org/TR/css-color-5/
 * - CSS Values 4 §10.2 comparison functions
 *   https://www.w3.org/TR/css-values-4/#comp-func
 */

import { describe, expect, it } from 'vitest'
import {
  angle,
  clamp,
  color,
  colorMix,
  number as cssNumber,
  customProperty,
  hsl,
  hwb,
  length,
  max,
  min,
  oklch,
  percent,
  rgb,
} from '../test-support/characterization'
import { defaultEngine } from './defaultEngine'

describe('cSSWG/WPT-derived value grammar', () => {
  it('covers modern color channels, missing components, alpha, and typed refs', () => {
    const channel = customProperty('--channel', { type: 'number' }).$var(cssNumber(0.2))
    expect(defaultEngine.serialize(rgb(percent(10), channel, 'none', percent(50))))
      .toBe('rgb(10% var(--channel, 0.2) none / 50%)')
    expect(defaultEngine.serialize(hsl(angle.deg(30), percent(40), percent(50), 'none')))
      .toBe('hsl(30deg 40% 50% / none)')
    expect(defaultEngine.serialize(hwb(30, 'none', percent(10))))
      .toBe('hwb(30 none 10%)')
    expect(defaultEngine.serialize(oklch(percent(42.1), 0.192, angle.deg(328.6), 1)))
      .toBe('oklch(0.421 0.192 328.6)')
  })

  it('covers predefined and custom-profile color() channel counts', () => {
    expect(defaultEngine.serialize(color('display-p3-linear', 0.1, 0.2, 0.3)))
      .toBe('color(display-p3-linear 0.1 0.2 0.3)')
    expect(defaultEngine.serialize(color('--press-profile', [0.1, 0.2, 0.3, 0.4], { alpha: percent(80) })))
      .toBe('color(--press-profile 0.1 0.2 0.3 0.4 / 80%)')
  })

  it('covers multi-item color-mix(), custom spaces, and polar hue policy', () => {
    expect(defaultEngine.serialize(colorMix(['red']))).toMatch(/^color-mix\(oklch\(.+\)\)$/)
    expect(defaultEngine.serialize(colorMix(['red', ['green', 25], 'blue'], { in: 'oklch', hue: 'longer' })))
      .toMatch(/^color-mix\(in oklch longer hue, oklch\(.+\), oklch\(.+\) 25%, oklch\(.+\)\)$/)
    expect(defaultEngine.serialize(colorMix(['red', 'blue'], { in: '--brand-profile' })))
      .toMatch(/^color-mix\(in --brand-profile, /)
    expect(() => colorMix(['red', 'blue'], { in: 'lab', hue: 'shorter' })).toThrow(/no hue interpolation path/)
  })

  it('covers one-or-more min/max and none-sided clamp grammar', () => {
    expect(min(length.rem(2)).css).toBe('min(2rem)')
    expect(max(length.px(20), percent(50)).dimension).toBe('length-percentage')
    expect(clamp(length.px(12), length.vw(10), 'none').css).toBe('clamp(12px, 10vw, none)')
    expect(clamp('none', length.vw(10), length.px(100)).dimension).toBe('length')
  })
})
