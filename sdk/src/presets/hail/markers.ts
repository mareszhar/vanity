import type { VanityCssInput } from '@mszr/vanity'
import type { HailExact, HailExactFactory, HailSpan, HailSpanFactory } from './types'

const HAIL_MARKER = Symbol('vanity.hail.marker')

type HailMarker = HailExact | HailSpan
type RuntimeHailMarker = HailMarker & { readonly [HAIL_MARKER]: true }

function marker<const Kind extends HailMarker['kind'], const Input extends VanityCssInput>(
  kind: Kind,
  input: Input,
): (Kind extends 'span' ? HailSpan<Input> : HailExact<Input>) {
  if (input === undefined || input === null)
    throw new TypeError(`[hail] ${kind}() needs a CSS numeric input`)

  return Object.freeze({
    kind,
    input,
    [HAIL_MARKER]: true,
  }) as unknown as Kind extends 'span' ? HailSpan<Input> : HailExact<Input>
}

export const hailSpan: HailSpanFactory = input => marker('span', input)
export const hailExact: HailExactFactory = input => marker('exact', input)

export function isHailMarker(value: unknown): value is RuntimeHailMarker {
  return typeof value === 'object'
    && value !== null
    && HAIL_MARKER in value
}

export function isHailSpan(value: unknown): value is HailSpan {
  return isHailMarker(value) && value.kind === 'span'
}

export function isHailExact(value: unknown): value is HailExact {
  return isHailMarker(value) && value.kind === 'exact'
}
