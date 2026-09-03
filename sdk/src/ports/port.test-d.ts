/**
 * The type-shape evidence dimension: port type inference, `set()` typing, and the
 * `VanityPort` interface — the contracts of [spec-ports.md §1-3], asserted
 * at the type level.
 */

import type { VanityColorTokenHandle, VanityPort, VanityPortDecValue, VanityPortKind, VanityPortMeta, VanityVarReference } from '@mszr/vanity'
import { angle, createSystem, oklch } from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

const open = createSystem()

// Never evaluated — the typecheck evidence dimension only reads types.
function system() {
  return open.addTokens(ds => ({
    color: {
      brand: ds.tdef({ val: oklch(0.58, 0.2, 285), mutable: true }),
      ink: oklch(0.2, 0, 0),
    },
    opacity: { disabled: 0.5 },
    space: { sm: '8px', md: '16px' },
  })).consolidate()
}

describe('port type inference', () => {
  it('port(0) is a number port — typed by its default', () => {
    const { port } = system()
    const fraction = port(0)

    expectTypeOf(fraction).toExtend<VanityPort<number>>()
    expectTypeOf(fraction.defaultValue).toEqualTypeOf<number>()
    expectTypeOf(fraction.kind).toExtend<VanityPortKind>()
  })

  it('port("4px") is a string port', () => {
    const { port } = system()
    const width = port('4px')

    expectTypeOf(width).toExtend<VanityPort<string, 'length'>>()
    expectTypeOf(width.defaultValue).toEqualTypeOf<string>()
  })

  it('port(t.color.brand) is a color port — typed by the token handle', () => {
    const { port, t } = system()
    const tint = port(t.color.brand)

    expectTypeOf(tint).toExtend<VanityPort<VanityColorTokenHandle, 'color'>>()
  })

  it('the var reference includes the default as a string literal', () => {
    const { port } = system()
    const fraction = port(0)

    expectTypeOf(fraction.var).toEqualTypeOf<`var(--${string}, ${string})`>()
  })

  it('a port satisfies VanityVarReference', () => {
    const { port } = system()
    const fraction = port(0)

    expectTypeOf(fraction).toExtend<VanityVarReference>()
  })
})

describe('dec() typing', () => {
  it('a number port accepts a number or a reference', () => {
    const { port, t } = system()
    const fraction = port(0)

    expectTypeOf(fraction.dec).parameter(0).toEqualTypeOf<VanityPortDecValue<'number'>>()
    fraction.dec(0.62)
    fraction.dec(t.opacity.disabled)
  })

  it('a string port accepts a string or a reference', () => {
    const { port, t } = system()
    const width = port('4px')

    expectTypeOf(width.dec).parameter(0).toEqualTypeOf<VanityPortDecValue<'length'>>()
    width.dec('8px')
    width.dec(t.space.md)
  })

  it('a color port accepts a string or a token reference', () => {
    const { port, t } = system()
    const tint = port(t.color.brand)

    tint.dec('oklch(0.45 0.15 250)')
    tint.dec(t.color.ink)
  })

  it('a number port rejects a string at the call site', () => {
    const { port } = system()
    const fraction = port(0)

    // @ts-expect-error — a number port takes a number, not a string
    fraction.dec('hello')
  })

  it('a string port rejects a number at the call site', () => {
    const { port } = system()
    const width = port('4px')

    // @ts-expect-error — a string port takes a string, not a number
    width.dec(8)
  })

  it('port rejects a non-port-input default', () => {
    const { port } = system()

    // @ts-expect-error — a boolean is not a port input
    void port(true)
    // @ts-expect-error — an object is not a port input
    void port({ x: 1 })
  })

  it('set() returns a style-object fragment', () => {
    const { port } = system()
    const fraction = port(0)

    expectTypeOf(fraction.dec(0.5)).toEqualTypeOf<Record<`--${string}`, string | number>>()
  })
})

describe('token and expression defaults', () => {
  it('a value-token default types set() to strings and references', () => {
    const { port, t } = system()
    const gap = port(t.space.sm)

    gap.dec('12px')
    gap.dec(t.space.md)
    // @ts-expect-error — a token-defaulted port takes strings or references, not numbers
    gap.dec(8)
  })

  it('a color expression default is a color port', () => {
    const { port } = system()
    const tint = port(oklch(0.5, 0.1, 200))

    tint.dec('rebeccapurple')
    // @ts-expect-error — a color port takes a string or a reference, not a number
    tint.dec(0.5)
  })

  it('defaultValue is honest about serialization: references become strings', () => {
    const { port, t } = system()

    expectTypeOf(port(0).defaultValue).toEqualTypeOf<number>()
    expectTypeOf(port('4px').defaultValue).toEqualTypeOf<string>()
    expectTypeOf(port(t.color.brand).defaultValue).toEqualTypeOf<string>()
  })

  it('meta is the declaration record', () => {
    const { port } = system()

    expectTypeOf(port(0).meta).toExtend<VanityPortMeta>()
  })
})

describe('options', () => {
  it('units come from branded values and `as` is retired', () => {
    const { port } = system()
    const rotation = port(angle.deg(0))

    expectTypeOf(rotation.type).toEqualTypeOf<'angle'>()
    rotation.dec(angle.deg(45))
    rotation.dec('0.5turn')
    // @ts-expect-error — a raw number has no angle unit
    rotation.dec(45)
    // @ts-expect-error — the retired `as` option cannot bolt meaning onto a number
    void port(0, { as: 'deg' })
  })

  it('the `label` option accepts a debug string', () => {
    const { port } = system()
    const fraction = port(0, { label: 'fraction' })

    expectTypeOf(fraction).toExtend<VanityPort<number>>()
  })

  it('the config form infers through Standard Schema and keeps binding explicit', () => {
    const { port } = system()
    const factor = port({
      val: 0,
      validate: {
        id: 'factor',
        runtime: 'always',
        schema: {
          '~standard': {
            version: 1,
            vendor: 'test',
            validate: (value: number) => ({ value }),
          },
        },
      },
    })

    factor.dec(0.5)
    expectTypeOf(factor.bind({ validators: {} })).toEqualTypeOf<typeof factor>()
  })
})
