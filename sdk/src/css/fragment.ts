import type {
  VanityFragmentFactory,
  VanityOmit,
  VanityRuleInput,
} from './types'

const OMIT = Object.freeze({}) as VanityOmit

/** Public sentinel for conditional contribution lists. */
export const omit: VanityOmit = OMIT

export function isOmit(value: unknown): value is VanityOmit {
  return value === OMIT
}

/**
 * Fragments intentionally preserve ordinary object/array behavior: they can
 * be spread, inspected, and nested without an opaque wrapper.
 */
export function createFragmentFactory<C extends string>(): VanityFragmentFactory<C> {
  return (<T extends VanityRuleInput<C>>(value: T): T => value) as VanityFragmentFactory<C>
}
