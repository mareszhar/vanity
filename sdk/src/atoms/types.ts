/**
 * Public atom-set types ([spec-integrations.md §5]): finite declared utility selection.
 * Token keys autocomplete; values outside the map are rejected at the key —
 * unless passed through the labeled escape (`unsafe.value`). Conditional maps
 * use the same condition grammar as everything else (principle 5), over the
 * conditions the atoms declare — declaring them is what keeps the emitted CSS
 * bounded by construction.
 */

import type { VanityCssPropertyName, VanityNestedRule, VanityVarReference } from '../css/types'
import type { VanityNoInput, VanityPrettify } from '../recipes/types'
import type { VanityConditionKeyName } from '../system/conditions'
import type { VanityAuthoredColor } from '../tokens/types'
import type { VanityCssValue, VanityTokenInput } from '../values/types'

// ─── The definition side ─────────────────────────────────────────────────────

/** One value a property map may hold: a CSS literal, or a token handle. */
export type VanityAtomValue = string | number | VanityVarReference | VanityTokenInput | VanityAuthoredColor | VanityCssValue

/** A property's declared values: a literal list, or a token-keyed map (`gap: t.space`). */
export type VanityAtomValues = readonly (string | number)[] | Record<string, VanityAtomValue>

type VanityAtomValuesInput<Value>
  = Value extends readonly (string | number)[] ? Value
    : Value extends object ? {
      readonly [Key in keyof Value as Key extends `$${string}` ? never : Key]:
      Value[Key] extends VanityAtomValue ? Value[Key] : never
    }
      : never

/**
 * The `properties` shape, checked key by key: a name that is not a CSS
 * property errors at that key ([patterns.md §2]).
 */
export type VanityAtomsPropertiesInput<P> = {
  [K in keyof P]: K extends VanityCssPropertyName ? VanityAtomValuesInput<P[K]> : never
}

export type VanityAtomsToggles<C extends string, G> = { [K in keyof G]: VanityNestedRule<C> }

export interface VanityAtomsOptions<
  C extends string,
  _L extends string,
  P,
  S extends Record<string, keyof P & string>,
  G,
  TCond extends readonly VanityConditionKeyName<C>[],
> {
  /** Property → its closed value set. The token map both guides and gates. */
  properties?: P & VanityAtomsPropertiesInput<P>
  /** Call-site aliases: `{ p: 'padding', bg: 'background' }`. */
  shorthands?: S
  /** Boolean one-liners, each a full vanity rule: `stack: { display: 'flex', flexDirection: 'column' }`. */
  toggles?: VanityAtomsToggles<C, G>
  /**
   * The conditions available at atoms call sites. Each declared condition
   * pre-generates one class per property value, so output stays bounded —
   * and none are declared by default (principle 10).
   */
  conditions?: TCond
}

// ─── The call side ───────────────────────────────────────────────────────────

/** The labeled escape: an off-map value carries a reason and surfaces in the audit. */
export interface VanityUnsafeValue {
  readonly value: string | number
  readonly reason: string
}

/** A declared value's call-site key: a list member, or a map key. */
export type VanityAtomKey<V> = V extends readonly (infer U)[]
  ? U
  : Exclude<keyof V & string, `$${string}`>

export type VanityAtomArms<V, C extends string>
  = { base?: VanityAtomKey<V> | VanityUnsafeValue }
    & { [K in C as VanityConditionKeyName<K>]?: VanityAtomKey<V> | VanityUnsafeValue }

export type VanityAtomInput<V, C extends string> = VanityAtomKey<V> | VanityUnsafeValue | VanityAtomArms<V, C>

/** The inferred call-site props: properties, shorthands, and toggles, all optional. */
export type VanityAtomsProps<P, S extends Record<string, keyof P & string>, G, C extends string> = VanityPrettify<
  { [K in keyof P]?: VanityAtomInput<P[K], C> }
  & { [K in keyof S]?: VanityAtomInput<P[S[K]], C> }
  & { [K in keyof G]?: boolean }
>

/** What `atoms` returns: props in, a class string out — never new CSS at runtime. */
export interface VanityAtoms<TProps extends object = VanityNoInput> {
  (props?: TProps): string
}

/** The system-bound `atoms` — one signature, generics inferred from the options literal. */
export interface VanityAtomsFactory<C extends string, L extends string> {
  <
    const P extends object = VanityNoInput,
    const S extends Record<string, keyof P & string> = VanityNoInput,
    G extends Record<string, unknown> = VanityNoInput,
    const TCond extends readonly VanityConditionKeyName<C>[] = readonly [],
  >(
    options: VanityAtomsOptions<C, L, P, S, G, TCond>,
    debugId?: string,
  ): VanityAtoms<VanityAtomsProps<P, S, G, TCond[number]>>
  readonly layer: <Layer extends L>(name: Layer) => VanityAtomsFactory<C, Layer>
}

// ─── The serialized boundary crossing ────────────────────────────────────────

/** What survives the build/app wall: precompiled class tables, never a rule. */
export interface VanityAtomsRuntime {
  /** The debug name, for dev-mode call-site warnings. */
  name?: string
  /** Property → value key → `'base'` or condition name → class. */
  classes: Record<string, Record<string, Record<string, string>>>
  /** Shorthand → the property it resolves to. */
  shorthands: Record<string, string>
  /** Toggle → its class. */
  toggles: Record<string, string>
}
