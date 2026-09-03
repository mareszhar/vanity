import { describe, expect, it } from 'vitest'
import { angle, number as cssNumber, fluid, interpolate, length } from '../index'
import { defaultValueKernel } from './defaults'
import { serializeValueWithContext } from './kernel'
import { VANITY_DEFAULT_CSS_SUPPORT } from './protocol'

function serialize(value: import('./types').VanitySelfValue): string {
  return serializeValueWithContext({
    values: defaultValueKernel,
    support: VANITY_DEFAULT_CSS_SUPPORT,
    policies: {},
  }, value)
}

describe('interpolation conveniences', () => {
  it('interpolate is typed CSS math over any compatible numeric dimension', () => {
    expect(serialize(interpolate(length.rem(1), length.rem(2), 0.5)))
      .toBe('calc(1rem + (2rem - 1rem) * 0.5)')
    expect(serialize(interpolate(angle.deg(0), angle.deg(90), 0.5)))
      .toBe('calc(0deg + (90deg - 0deg) * 0.5)')
    expect(serialize(interpolate(length.rem(1), length.rem(3), cssNumber(0.25))))
      .toBe('calc(1rem + (3rem - 1rem) * 0.25)')
  })

  it('fluid emits monotonic clamp/calc CSS and rejects inverted bounds', () => {
    expect(serialize(fluid({ min: 16, max: 24, minVw: 320, maxVw: 1280 })))
      .toBe('clamp(16px, calc(13.333333px + 0.833333vw), 24px)')
    expect(() => fluid({ min: 24, max: 16 })).toThrow(/max must be greater/)
    expect(() => fluid({ min: 16, max: 24, minVw: 900, maxVw: 400 })).toThrow(/maxVw/)
  })
})
