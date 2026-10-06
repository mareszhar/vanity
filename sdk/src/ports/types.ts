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

/** Token handle accepted as a port default or declaration value. */
export interface VanityPortTokenReference<Type extends VanityCssDataType = VanityCssDataType> {
  /** CSS data type carried by the referenced token. */
  readonly $type: Type
  /** Return the referenced token's CSS variable. */
  readonly $var: (fallback?: never) => `var(--${string})` | `var(--${string}, ${string})`
  /** Serialize the reference as a CSS variable. */
  toString: () => string
}

/** Explicit CSS variable reference used as a port default or declaration value. */
export interface VanityPortVarReference {
  /** CSS variable expression carried by this reference. */
  readonly var: `var(--${string})` | `var(--${string}, ${string})`
}

export type VanityPortInput
  = | string
    | number
    | VanityValue
    | VanityPortTokenReference
    | VanityPortVarReference

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
    | VanityPortVarReference

/** Runtime validation policy for values supplied through a port. */
export interface VanityPortValidation<Input = unknown, Output = Input> {
  /** Stable application-runtime lookup key. */
  readonly id: string
  /** Standard Schema implementation used to validate values. */
  readonly schema?: VanityStandardSchemaV1<Input, Output>
  /** `dev` by default; `false` is type-only, `always` includes production. */
  readonly runtime?: VanityRuntimeValidationMode
  /** Invalid input never becomes a declaration. */
  readonly onInvalid?: VanityInvalidRuntimeValuePolicy
  /** Required for `onInvalid: 'fallback'`. */
  readonly fallback?: Output
}

/** Optional label and runtime validation attached to a port definition. */
export interface VanityPortOptions<Input = unknown, Output = Input> {
  /** Human-readable port label for component documentation. */
  readonly label?: string
  /** Runtime validation policy for values supplied through the port. */
  readonly validate?: VanityPortValidation<Input, Output>
}

/** A port's authored default, label and optional validation policy. */
export interface VanityPortDefinition<
  Value extends VanityPortInput = VanityPortInput,
  Output = Value,
> extends VanityPortOptions<Value, Output> {
  /** Default value serialized as the component's custom-property fallback. */
  readonly val: Value
}

/** Application-runtime implementations used when a port validates a value. */
export interface VanityPortBindingOptions {
  /** Validators keyed by the stable ids declared in port metadata. */
  readonly validators?: Readonly<Record<string, VanityStandardSchemaV1>>
  /** Enable development-only validation when a validator requests it. */
  readonly dev?: boolean
}

/** Portable validation policy; application validators are supplied when binding. */
export interface VanityPortValidationMeta {
  /** Stable key used to find the application validator. */
  readonly id: string
  /** Whether validation runs in development, always, or only at type checking. */
  readonly runtime: VanityRuntimeValidationMode
  /** Throw, use the fallback, or omit an invalid declaration. */
  readonly onInvalid: VanityInvalidRuntimeValuePolicy
  /** Serialized replacement used by the fallback policy. */
  readonly fallback?: VanityPortValue
}

/** Serialized component-port identity, default and troubleshooting metadata. */
export interface VanityPortMeta {
  /** Generated custom-property name owned by the port. */
  readonly name: string
  /** Serialized fallback used when no override is supplied. */
  readonly defaultValue: VanityPortValue
  /** Canonical CSS data type used to validate port values. */
  readonly type: VanityCssDataType
  /** Compatibility metadata for current manifest consumers. */
  readonly kind: VanityPortKind
  /** Portable validator lookup and invalid-value policy. */
  readonly validation?: VanityPortValidationMeta
  /** Human-readable component-port documentation. */
  description?: string
  /** Migration guidance for a deprecated component port. */
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
  /** Generated custom-property name owned by this component port. */
  readonly name: `--${string}`
  /** Serialized fallback used when the component has no port override. */
  readonly defaultValue: VanityPortDefault<Value>
  /** CSS data type inferred from the default; constrains declaration values. */
  readonly type: Type
  /** Coarse number, string, or color category; type carries the exact CSS data type. */
  readonly kind: VanityPortKind
  /** CSS var() reference including the port’s fallback value. */
  readonly var: `var(--${string}, ${string})`
  /** Portable port description, default, type, and validation metadata. */
  readonly meta: VanityPortMeta
  /** Produce custom-property declaration data for this port; does not write to the DOM. */
  dec: {
    /** @param value - A CSS value or token compatible with the port's data type. */
    (value: VanityPortDecValue<Type>): VanityPortStyle
  }
  /** Bind app/SSR validator implementations without global mutable state. */
  bind: (options: VanityPortBindingOptions) => VanityPort<Value, Type>
  /** Attach human-readable guidance to this port's metadata and return this handle. */
  describe: (text: string) => VanityPort<Value, Type>
  /** Attach a deprecation reason to this port's metadata and return this handle. */
  deprecated: (reason: string) => VanityPort<Value, Type>
  /** Return the port’s CSS var() reference with its fallback. */
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
