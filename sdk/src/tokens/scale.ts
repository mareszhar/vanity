/** Callable numeric scales; named token tables are a projection, not the scale itself. */

import type { VanityCssValue } from '../values/types'
import type { VanityLengthUnit } from '../values/units'
import { length } from '../values/units'

export interface VanityLinearScaleOptions<Steps extends Readonly<Record<string, number>>> {
  /** Number of CSS pixels per scale step. */
  readonly unit: number
  readonly steps: Steps
}

export interface VanityModularScaleOptions<Steps extends Readonly<Record<string, number>>> {
  /** Base magnitude in `unit`; defaults to 1. */
  readonly base?: number
  readonly ratio: number
  readonly steps: Steps
  /** Defaults to rem. */
  readonly unit?: VanityLengthUnit
}

export interface VanityScale<
  Steps extends Readonly<Record<string, number>>,
  Value,
> {
  /** Resolve a named configured step or any finite negative/fractional step. */
  <Step extends keyof Steps & string>(step: Step): Value
  (step: number): Value
  readonly steps: Readonly<Steps>
  /** Materialize the configured named steps as an immutable token subtree. */
  readonly tokens: () => { readonly [Key in keyof Steps]: Value }
}

type LengthValue = VanityCssValue<string, 'length'>

export const scale = Object.freeze({
  linear<const Steps extends Readonly<Record<string, number>>>(
    options: VanityLinearScaleOptions<Steps>,
  ): VanityScale<Steps, LengthValue> {
    validateFinite(options.unit, 'linear unit')
    return createScale(options.steps, step => length.px(roundNumber(options.unit * step)))
  },

  modular<const Steps extends Readonly<Record<string, number>>>(
    options: VanityModularScaleOptions<Steps>,
  ): VanityScale<Steps, LengthValue> {
    const base = options.base ?? 1
    const unit = options.unit ?? 'rem'
    validateFinite(base, 'modular base')
    validateFinite(options.ratio, 'modular ratio')
    if (options.ratio <= 0)
      throw new RangeError(`[vanity] modular scale ratio must be greater than zero; received ${options.ratio}`)
    return createScale(options.steps, step => length[unit](roundNumber(base * options.ratio ** step)))
  },
})

function createScale<Steps extends Readonly<Record<string, number>>, Value>(
  authoredSteps: Steps,
  resolve: (step: number) => Value,
): VanityScale<Steps, Value> {
  const steps = Object.freeze({ ...authoredSteps }) as Readonly<Steps>
  for (const [name, step] of Object.entries(steps))
    validateFinite(step, `step '${name}'`)

  const cache = new Map<number, Value>()
  const at = (step: number): Value => {
    validateFinite(step, 'step')
    const prior = cache.get(step)
    if (prior !== undefined)
      return prior
    const value = resolve(step)
    cache.set(step, value)
    return value
  }
  const callable = ((step: string | number): Value => {
    if (typeof step === 'string') {
      if (!Object.hasOwn(steps, step))
        throw new RangeError(`[vanity] this scale has no named step '${step}'`)
      return at(steps[step]!)
    }
    return at(step)
  }) as VanityScale<Steps, Value>

  let tokenTable: { readonly [Key in keyof Steps]: Value } | undefined
  return Object.freeze(Object.assign(callable, {
    steps,
    tokens: () => tokenTable ??= Object.freeze(Object.fromEntries(
      Object.entries(steps).map(([name, step]) => [name, at(step)]),
    )) as { readonly [Key in keyof Steps]: Value },
  }))
}

function validateFinite(value: number, role: string): void {
  if (!Number.isFinite(value))
    throw new RangeError(`[vanity] scale ${role} must be finite; received ${value}`)
}

function roundNumber(value: number): number {
  return Math.round(value * 1e6) / 1e6
}
