import { createEngine } from '@test/legacy'
import { describe, expect, it } from 'vitest'

describe('interpolation conveniences', () => {
  it('interpolate is typed CSS math over any compatible numeric dimension', () => {
    const de = createEngine()
    expect(de.serialize(de.interpolate(de.length.rem(1), de.length.rem(2), 0.5)))
      .toBe('calc(1rem + (2rem - 1rem) * 0.5)')
    expect(de.serialize(de.interpolate(de.angle.deg(0), de.angle.deg(90), 0.5)))
      .toBe('calc(0deg + (90deg - 0deg) * 0.5)')
    expect(de.serialize(de.interpolate(de.length.rem(1), de.length.rem(3), de.number(0.25))))
      .toBe('calc(1rem + (3rem - 1rem) * 0.25)')
  })

  it('fluid emits monotonic clamp/calc CSS and rejects inverted bounds', () => {
    const de = createEngine()
    expect(de.serialize(de.fluid({ min: 16, max: 24, minVw: 320, maxVw: 1280 })))
      .toBe('clamp(16px, calc(13.333333px + 0.833333vw), 24px)')
    expect(() => de.fluid({ min: 24, max: 16 })).toThrow(/max must be greater/)
    expect(() => de.fluid({ min: 16, max: 24, minVw: 900, maxVw: 400 })).toThrow(/maxVw/)
  })
})
