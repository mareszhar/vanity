/** Public types for ports: component-owned, defaulted custom properties. */

import type {
  VanityInvalidRuntimeValuePolicy,
  VanityRuntimeValidationMode,
  VanityStandardSchemaV1,
} from '../tokens/types'
import type {
  VanityCssDataType,
  VanityDataTypeOf,
  VanityValue,
} from '../values/types'

export type VanityPortValue = string | number
export type VanityPortStyle = Record<`--${string}`, VanityPortValue>

export interface VanityPortTokenReference<Type extends VanityCssDataType = VanityCssDataType> {
  readonly $type: Type
  readonly $var: (fallback?: never) => `var(--${string})` | `var(--${string}, ${string})`
  toString: () => string
}

export interface VanityPortLegacyReference {
  readonly var: `var(--${string})` | `var(--${string}, ${string})`
}

export type VanityPortInput
  = | string
    | number
    | VanityValue
    | VanityPortTokenReference
    | VanityPortLegacyReference

export type VanityPortDataTypeOf<Value>
  = Value extends VanityValue<infer Type> ? Type
    : Value extends VanityPortTokenReference<infer Type> ? Type
      : Value extends { readonly type: infer Type extends VanityCssDataType, readonly var: `var(--${string}, ${string})` } ? Type
        : Value extends number ? 'number'
          : Value extends string
            ? VanityDataTypeOf<Value> extends 'unknown' ? 'declaration' : VanityDataTypeOf<Value>
            : 'unknown'

/** Kept as coarse compatibility metadata; `type` is the canonical data type. */
export type VanityPortKind = 'number' | 'string' | 'color'

export type VanityPortDefault<Value extends VanityPortInput>
  = Value extends number ? number : string

export type VanityPortDecValue<Type extends VanityCssDataType>
  = (Type extends 'number' | 'integer' ? number : string)
    | VanityValue<Type>
    | VanityPortTokenReference<Type>
    | VanityPortLegacyReference

export interface VanityPortValidation<Input = unknown, Output = Input> {
  /** Stable application-runtime lookup key. */
  readonly id: string
  readonly schema?: VanityStandardSchemaV1<Input, Output>
  /** `dev` by default; `false` is type-only, `always` includes production. */
  readonly runtime?: VanityRuntimeValidationMode
  /** Invalid input never becomes a declaration. */
  readonly onInvalid?: VanityInvalidRuntimeValuePolicy
  /** Required for `onInvalid: 'fallback'`. */
  readonly fallback?: Output
}

export interface VanityPortOptions<Input = unknown, Output = Input> {
  readonly label?: string
  readonly validate?: VanityPortValidation<Input, Output>
}

export interface VanityPortDefinition<
  Value extends VanityPortInput = VanityPortInput,
  Output = Value,
> extends VanityPortOptions<Value, Output> {
  readonly val: Value
}

export interface VanityPortBindingOptions {
  readonly validators?: Readonly<Record<string, VanityStandardSchemaV1>>
  readonly dev?: boolean
}

export interface VanityPortValidationMeta {
  readonly id: string
  readonly runtime: VanityRuntimeValidationMode
  readonly onInvalid: VanityInvalidRuntimeValuePolicy
  readonly fallback?: VanityPortValue
}

export interface VanityPortMeta {
  readonly name: string
  readonly defaultValue: VanityPortValue
  readonly type: VanityCssDataType
  /** Compatibility metadata for current manifest consumers. */
  readonly kind: VanityPortKind
  readonly validation?: VanityPortValidationMeta
  description?: string
  deprecated?: string
}

/**
 * A typed style/component custom-property input with declaration and binding helpers.
 *
 * @example
 * `type ProgressPort = VanityPort<number, 'number'>`
 */
export interface VanityPort<
  Value extends VanityPortInput = VanityPortInput,
  Type extends VanityCssDataType = VanityPortDataTypeOf<Value>,
> {
  readonly name: `--${string}`
  readonly defaultValue: VanityPortDefault<Value>
  readonly type: Type
  readonly kind: VanityPortKind
  readonly var: `var(--${string}, ${string})`
  readonly meta: VanityPortMeta
  dec: (value: VanityPortDecValue<Type>) => VanityPortStyle
  /** Bind app/SSR validator implementations without global mutable state. */
  bind: (options: VanityPortBindingOptions) => VanityPort<Value, Type>
  describe: (text: string) => VanityPort<Value, Type>
  deprecated: (reason: string) => VanityPort<Value, Type>
  toString: () => `var(--${string}, ${string})`
}

export interface VanityPortFactory {
  <const Value extends VanityPortInput>(
    defaultValue: Value,
    options?: VanityPortOptions<Value>,
  ): VanityPort<VanityPortWiden<Value>, VanityPortDataTypeOf<Value>>
  <const Value extends VanityPortInput, Output = Value>(
    definition: VanityPortDefinition<Value, Output>,
  ): VanityPort<VanityPortWiden<Value>, VanityPortDataTypeOf<Value>>
}

/** Literal widening for the default carrier; the data type remains exact. */
export type VanityPortWiden<T> = T extends number ? number : T extends string ? string : T
