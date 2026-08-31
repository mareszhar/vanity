/**
 * The runtime evidence dimension: port declaration, interpolation, `set()`, the `ports()`
 * merge, `restorePort`, and the diagnostics contract — the behavior contracts
 * of [spec-ports.md], asserted directly.
 */

import { restorePort } from '@mszr/vanity/runtime'
import { definePrismSystem, emit } from '@test'
import { describe, expect, it } from 'vitest'
import { createSystem, angle as cssAngle, oklch, ports, VanityError } from '../test-support/characterization'

describe('port() declaration', () => {
  it('creates a handle with a hashed name under the system prefix', () => {
    const { returned: fraction } = emit(() => {
      const { port } = definePrismSystem()
      return port(0)
    })

    expect(fraction.name).toMatch(/^--vanity-[a-z0-9_]+$/)
    expect(fraction.kind).toBe('number')
    expect(fraction.defaultValue).toBe(0)
  })

  it('interpolates as var(--name, <default>) — the default makes the style complete', () => {
    const { returned: fraction } = emit(() => {
      const { port } = definePrismSystem()
      return port(0)
    })

    expect(`${fraction}`).toBe(`var(${fraction.name}, 0)`)
    expect(fraction.var).toBe(`var(${fraction.name}, 0)`)
    expect(fraction.toString()).toBe(`var(${fraction.name}, 0)`)
  })

  it('a string default serializes into the var() reference', () => {
    const { returned: width } = emit(() => {
      const { port } = definePrismSystem()
      return port('100%')
    })

    expect(`${width}`).toBe(`var(${width.name}, 100%)`)
    expect(width.kind).toBe('string')
  })

  it('a color token default nests the token var() as the fallback', () => {
    const { returned: tint } = emit(() => {
      const { port, t } = definePrismSystem()
      return port(t.color.brand)
    })

    expect(`${tint}`).toBe(`var(${tint.name}, var(--vanity-color-brand))`)
    expect(tint.kind).toBe('color')
  })

  it('a custom prefix flows into the port name', () => {
    const { returned: fraction } = emit(() => {
      const system = createSystem({
        tokens: { color: { brand: '#635bff' } },
        prefix: 'prism',
      })
      return system.port(0)
    })

    expect(fraction.name).toMatch(/^--prism-/)
  })

  it('a branded value owns its unit', () => {
    const { returned: angle } = emit(() => {
      const { port } = definePrismSystem()
      return port(cssAngle.deg(0))
    })

    expect(`${angle}`).toBe(`var(${angle.name}, 0deg)`)
    expect(angle.dec(cssAngle.deg(45))).toEqual({ [angle.name]: '45deg' })
  })

  it('a value-token default is a string port — the kind never claims color', () => {
    const { returned: gap } = emit(() => {
      const { port, t } = definePrismSystem()
      return port(t.space.sm)
    })

    expect(gap.kind).toBe('string')
    expect(`${gap}`).toBe(`var(${gap.name}, var(--vanity-space-sm))`)
  })

  it('a color expression default folds to its CSS form', () => {
    const { returned: tint } = emit(() => {
      const { port } = definePrismSystem()
      return port(oklch(0.58, 0.2, 285))
    })

    expect(tint.kind).toBe('color')
    expect(`${tint}`).toBe(`var(${tint.name}, oklch(0.58 0.2 285))`)
  })

  it('a port default inherits the parent port — nested var(), same kind', () => {
    const { returned } = emit(() => {
      const { port, t } = definePrismSystem()
      const parent = port(t.color.brand)
      return { parent, child: port(parent) }
    })

    expect(returned.child.kind).toBe('color')
    expect(`${returned.child}`).toBe(`var(${returned.child.name}, ${returned.parent.var})`)
  })

  it('an invalid default is a diagnostic, not a silent String()', () => {
    const fail = (value: unknown) => {
      try {
        emit(() => {
          const system = definePrismSystem()
          // A JS caller can pass anything; the factory answers with a diagnostic.
          return (system.port as unknown as (v: unknown) => unknown)(value)
        })
        return undefined
      }
      catch (error) {
        return error
      }
    }

    const objectFailure = fail({ not: 'css' })
    expect(objectFailure).toBeInstanceOf(VanityError)
    expect((objectFailure as VanityError).code).toBe('VANITY_PORT_INVALID_DEFAULT')
  })

  it('metadata rides the handle and its meta — describe and deprecated chain', () => {
    const { returned: gap } = emit(() => {
      const { port } = definePrismSystem()
      return port('8px').describe('The gap between buttons.').deprecated('use gap.sm')
    })

    expect(gap.meta.description).toBe('The gap between buttons.')
    expect(gap.meta.deprecated).toBe('use gap.sm')

    // The methods survive chaining — `.deprecated()` never clobbers itself.
    expect(typeof gap.describe).toBe('function')
    expect(typeof gap.deprecated).toBe('function')

    // The same meta restores the port on the far side of the boundary.
    const restored = restorePort({ ...gap.meta })
    expect(restored.meta.description).toBe('The gap between buttons.')
    expect(`${restored}`).toBe(`${gap}`)
  })
})

describe('set()', () => {
  it('returns a style-object fragment with the port\'s variable name', () => {
    const { returned: fraction } = emit(() => {
      const { port } = definePrismSystem()
      return port(0)
    })

    expect(fraction.dec(0.62)).toEqual({ [fraction.name]: 0.62 })
  })

  it('a branded angle port serializes another angle', () => {
    const { returned: angle } = emit(() => {
      const { port } = definePrismSystem()
      return port(cssAngle.deg(0))
    })

    expect(angle.dec(cssAngle.deg(90))).toEqual({ [angle.name]: '90deg' })
  })

  it('a color port set accepts a CSS string', () => {
    const { returned: tint } = emit(() => {
      const { port, t } = definePrismSystem()
      return port(t.color.brand)
    })

    expect(tint.dec('oklch(0.45 0.15 250)')).toEqual({ [tint.name]: 'oklch(0.45 0.15 250)' })
  })

  it('a color port set accepts a token reference — compiles to var()', () => {
    const { returned } = emit(() => {
      const system = definePrismSystem()
      const tint = system.port(system.t.color.brand)
      return { tint, t: system.t }
    })

    expect(returned.tint.dec(returned.t.color.ink)).toEqual({ [returned.tint.name]: 'var(--vanity-color-ink)' })
  })

  it('setting writes a value, never a rule — the fragment is plain data', () => {
    const { returned: fraction } = emit(() => {
      const { port } = definePrismSystem()
      return port(0)
    })

    const fragment = fraction.dec(0.5)
    expect(typeof fragment).toBe('object')
    expect(Object.keys(fragment)).toHaveLength(1)
    expect(Object.keys(fragment)[0]).toMatch(/^--vanity-/)
  })

  it('a sync Standard Schema rejects invalid values before returning a fragment', () => {
    const { returned: fraction } = emit(() => {
      const { port } = definePrismSystem()
      return port({
        val: 0,
        validate: {
          id: 'fraction',
          runtime: 'always',
          schema: {
            '~standard': {
              version: 1,
              vendor: 'test',
              validate: (value: number) => value >= 0 && value <= 1
                ? { value }
                : { issues: [{ message: 'outside 0..1' }] },
            },
          },
        },
      })
    })

    expect(() => fraction.dec(2)).toThrow(/outside 0\.\.1/)
    expect(fraction.dec(0.5)).toEqual({ [fraction.name]: 0.5 })
  })

  it('supports false/dev/always and non-write fallback/omit policies', () => {
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: (value: number) => value >= 0 ? { value } : { issues: [{ message: 'negative' }] },
      },
    }
    const { returned } = emit(() => {
      const { port } = definePrismSystem()
      return {
        unchecked: port({ val: 0, validate: { id: 'off', schema, runtime: false } }),
        omitted: port({ val: 0, validate: { id: 'omit', schema, runtime: 'always', onInvalid: 'omit' } }),
        fallback: port({ val: 0, validate: { id: 'fallback', schema, runtime: 'always', onInvalid: 'fallback', fallback: 1 } }),
      }
    })

    expect(returned.unchecked.dec(-1)).toEqual({ [returned.unchecked.name]: -1 })
    expect(returned.omitted.dec(-1)).toEqual({})
    expect(returned.fallback.dec(-1)).toEqual({ [returned.fallback.name]: 1 })
    expect(returned.omitted.bind({ dev: false }).dec(-1)).toEqual({}) // `always` ignores dev.
  })

  it('rejects async validators before any synchronous style fragment can escape', () => {
    const { returned: value } = emit(() => {
      const { port } = definePrismSystem()
      return port({
        val: 0,
        validate: {
          id: 'async',
          runtime: 'always',
          schema: {
            '~standard': {
              version: 1,
              vendor: 'test',
              validate: async (input: number) => ({ value: input }),
            },
          },
        },
      })
    })

    expect(() => value.dec(1)).toThrow(/async; dec\(\) is synchronous/)
  })
})

describe('ports() merge', () => {
  it('merges fragments, skipping falsy entries', () => {
    expect(ports({ '--a': 1 }, false, { '--b': 'x' }, undefined)).toEqual({ '--a': 1, '--b': 'x' })
  })

  it('merges multiple port sets into one style object', () => {
    const { returned } = emit(() => {
      const { port } = definePrismSystem()
      const fraction = port(0)
      const tint = port('red')
      return { fraction, tint }
    })

    const merged = ports(returned.fraction.dec(0.3), returned.tint.dec('blue'))
    expect(merged).toEqual({
      [returned.fraction.name]: 0.3,
      [returned.tint.name]: 'blue',
    })
  })
})

describe('restorePort', () => {
  it('rebuilds a port handle from serialized meta', () => {
    const handle = restorePort({
      name: '--vanity-fraction__h4x',
      defaultValue: 0,
      kind: 'number',
      type: 'number',
    })

    expect(`${handle}`).toBe('var(--vanity-fraction__h4x, 0)')
    expect(handle.name).toBe('--vanity-fraction__h4x')
    expect(handle.kind).toBe('number')
    expect(handle.dec(0.62)).toEqual({ '--vanity-fraction__h4x': 0.62 })
  })

  it('a restored port equals its build-time original — defaultValue included', () => {
    const { returned: angle } = emit(() => {
      const { port } = definePrismSystem()
      return port(cssAngle.deg(0))
    })

    const restored = restorePort({ ...angle.meta })

    expect(restored.defaultValue).toBe(angle.defaultValue)
    expect(restored.defaultValue).toBe('0deg')
    expect(`${restored}`).toBe(`${angle}`)
    expect(restored.dec('45deg')).toEqual(angle.dec(cssAngle.deg(45)))
  })

  it('a restored branded port keeps serialized CSS values', () => {
    const handle = restorePort({
      name: '--vanity-angle__h4x',
      defaultValue: '0deg',
      kind: 'string',
      type: 'angle',
    })

    expect(`${handle}`).toBe('var(--vanity-angle__h4x, 0deg)')
    expect(handle.dec('45deg')).toEqual({ '--vanity-angle__h4x': '45deg' })
  })

  it('a restored color port set accepts a string', () => {
    const handle = restorePort({
      name: '--vanity-tint__h4x',
      defaultValue: 'var(--vanity-color-brand)',
      kind: 'color',
      type: 'color',
    })

    expect(`${handle}`).toBe('var(--vanity-tint__h4x, var(--vanity-color-brand))')
    expect(handle.dec('oklch(0.4 0.1 100)')).toEqual({ '--vanity-tint__h4x': 'oklch(0.4 0.1 100)' })
  })

  it('binds application-runtime validators by stable id without global state', () => {
    const restored = restorePort({
      name: '--vanity-fraction__h4x',
      defaultValue: 0,
      kind: 'number',
      type: 'number',
      validation: { id: 'fraction', runtime: 'always', onInvalid: 'throw' },
    })
    expect(() => restored.dec(2)).toThrow(/needs the synchronous Standard Schema validator/)

    const bound = restored.bind({
      validators: {
        fraction: {
          '~standard': {
            version: 1,
            vendor: 'test',
            validate: (value: unknown) => typeof value === 'number' && value <= 1
              ? { value }
              : { issues: [{ message: 'too large' }] },
          },
        },
      },
    })
    expect(bound.dec(0.5)).toEqual({ '--vanity-fraction__h4x': 0.5 })
    expect(() => bound.dec(2)).toThrow(/too large/)
  })
})

describe('the spec\'s progress bar', () => {
  it('a port interpolates inside calc() and serializes as var(--name, default)', () => {
    const { css } = emit(() => {
      const { css, port, t } = definePrismSystem()
      const fraction = port(0)

      css({
        inlineSize: `calc(${fraction} * 100%)`,
        background: t.color.brand,
      }, 'fill')
    })

    expect(css).toMatch(/inline-size: calc\(var\(--vanity-[^,]+, 0\) \* 100%\)/)
  })

  it('a port used directly as a value serializes with its default fallback', () => {
    const { css } = emit(() => {
      const { css, port, t } = definePrismSystem()
      const tint = port(t.color.brand)

      css({
        background: tint,
      }, 'fill')
    })

    expect(css).toMatch(/background: var\(--vanity-[^,]+, var\(--vanity-color-brand\)\)/)
  })

  it('a static set() inside a css() rule compiles into a custom-property declaration', () => {
    const { css } = emit(() => {
      const { css, port, t } = definePrismSystem()
      const gap = port(t.space.xs)

      css({
        display: 'flex',
        ...gap.dec(t.space.sm),
      }, 'toolbar')
    })

    expect(css).toMatch(/--vanity-[^:]+: var\(--vanity-space-sm\)/)
    expect(css).toContain('display: flex;')
  })
})
