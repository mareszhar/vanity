import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { createFixtureSystem } from '../test-support/system'
import { checkDeclaration } from './validation'

describe('property grammar bounds and unitless rules', () => {
  it.each([
    ['unitless nonzero length', 'padding', '1', '0'],
    ['non-negative length', 'width', '-5px', '0px'],
    ['non-negative number', 'flex-grow', '-1', '0'],
    ['integer lower bound', 'orphans', '0', '1'],
    ['dimensioned time lower bound', 'animation-duration', '-1s', '0s'],
    ['angle upper bound', 'font-style', 'oblique 91deg', 'oblique 90deg'],
    ['angle lower bound', 'font-style', 'oblique -91deg', 'oblique -90deg'],
    ['time needs a unit even at zero', 'animation-duration', '0', '0s'],
  ])('checks %s', (_rule, property, invalid, valid) => {
    // These committed rows also fail if the validator throws an internal
    // exception. Unresolved is a designed limit, never an exception verdict.
    expect(checkDeclaration(property!, invalid!)).toMatchObject({ kind: 'invalid-value' })
    expect(checkDeclaration(property!, valid!)).toBeUndefined()
  })

  it.each([
    ['calc', 'calc(1px + 1s)', 'calc(1px * 2)'],
    ['min', 'min(1px, 2s)', 'min(1px, 2px)'],
    ['max', 'max(1px, 2s)', 'max(1px, 2px)'],
    ['clamp', 'clamp(1px, 2s, 3px)', 'clamp(1px, 2px, 3px)'],
  ])('checks %s dimensions', (_function, invalid, valid) => {
    expect(checkDeclaration('padding', invalid!)).toMatchObject({ kind: 'invalid-value' })
    expect(checkDeclaration('padding', valid!)).toBeUndefined()
  })

  it('preserves an accepted verdict in an unresolved family', () => {
    expect(checkDeclaration('voice-pitch', '-1Hz')).toBeUndefined()
  })

  it('preserves a rejected verdict in an unresolved family', () => {
    expect(checkDeclaration('-webkit-animation-duration', 'auto')).toEqual({
      kind: 'invalid-value',
      reason: '\'auto\' does not parse as a -webkit-animation-duration value',
    })
  })

  it('preserves bounded-integer syntax in an unresolved browser family', () => {
    for (const value of ['digits 1', 'digits 2', 'digits 5'])
      expect(checkDeclaration('text-combine-upright', value)).toBeUndefined()
  })

  it('applies the substrate unit rule before validating JavaScript numbers', () => {
    const { css } = emit(() => createFixtureSystem().class({ padding: 1 }, 'numeric'))
    expect(css).toContain('padding: 1px')
    expect(() => emit(() => createFixtureSystem().class({ padding: '1' }, 'string'))).toThrow(/padding/)
    expect(() => emit(() => createFixtureSystem().class({ padding: -1 }, 'negative'))).toThrow(/padding/)
  })

  it('validates the value independently of declaration priority', () => {
    for (const suffix of ['!important', '!/**/IMPORTANT']) {
      expect(checkDeclaration('animation-duration', `0.001ms ${suffix}`)).toBeUndefined()
      expect(checkDeclaration('animation-iteration-count', `1 ${suffix}`)).toBeUndefined()
      expect(checkDeclaration('padding', `1px ${suffix}`)).toBeUndefined()
      expect(checkDeclaration('padding', `1 ${suffix}`)).toMatchObject({ kind: 'invalid-value' })
      expect(checkDeclaration('padding', `-1px ${suffix}`)).toMatchObject({ kind: 'invalid-value' })
    }
  })
})
