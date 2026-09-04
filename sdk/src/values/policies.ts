import type { VanityCssSupportTarget } from './protocol'
import type { VanityLengthUnit } from './units'

/**
 * Policy shapes shared by value serialization and system policy operations.
 * Runtime policy transitions remain owned by `system/policies.ts`.
 */
export type VanityPolicyJson
  = | string
    | number
    | boolean
    | null
    | readonly VanityPolicyJson[]
    | { readonly [key: string]: VanityPolicyJson }

/** Restriction metadata that explains when a constructor should be avoided or rejected. */
export interface VanityConstructorRestriction {
  /** Select a hard prohibition or an authoring-time warning. */
  readonly level: 'forbid' | 'discourage'
  /** Suggest the constructor or value shape an author should use instead. */
  readonly use?: string
  /** Explain why the constructor is restricted. */
  readonly reason?: string
  /** Choose whether the restriction applies to new input or all resolved values. */
  readonly enforce?: 'prospective' | 'retroactive'
}

/** Policy for one named value constructor, including its unit and restriction guidance. */
export interface VanityConstructorPolicy {
  /** Choose the unit applied when the constructor receives a unitless number. */
  readonly unitless?: VanityLengthUnit
  /** Apply authoring guidance or enforcement to this constructor. */
  readonly restrict?: VanityConstructorRestriction
  /** Human-readable explanation surfaced in diagnostics and tooling. */
  readonly description?: string
}

/** Named constructor policies contributed by a system or plugin. */
export type VanityConstructorPolicies = Readonly<Record<string, VanityConstructorPolicy>>

/** Token-wide defaults for reference mode and CSS emission. Per-token `tdef` traits win. */
export interface VanityTokenPolicies {
  /** Choose whether a token resolves to its value or a `var()` reference by default. */
  readonly reference?: 'var' | 'val'
  /** Choose whether tokens emit CSS by default; explicit token traits take precedence. */
  readonly emit?: boolean
}

/** Authored system policy; omitted known leaves resolve from the library defaults. */
export interface VanityPolicies {
  /** Configure restrictions and unit behavior for named value constructors. */
  readonly constructors?: VanityConstructorPolicies
  /** Declare the CSS feature target used when values are serialized. */
  readonly support?: VanityCssSupportTarget
  /** Set the deterministic cascade-layer order for emitted styles. */
  readonly layerOrder?: readonly string[]
  /** Set token-wide reference and emission defaults; explicit token traits win. */
  readonly tokens?: VanityTokenPolicies
  /** Store JSON-safe plugin policy payloads keyed by plugin id. */
  readonly plugins?: Readonly<Record<string, VanityPolicyJson>>
  /** Preserve an extension policy that is owned by a system or plugin. */
  readonly [customPolicy: string]: unknown
}

/** Fully resolved policy used by bound constructors, value resolution, and contracts. */
export interface VanityResolvedPolicies {
  /** Resolved restrictions and unit behavior for every known constructor. */
  readonly constructors: VanityConstructorPolicies
  /** Resolved CSS feature target used by value serialization. */
  readonly support: VanityCssSupportTarget
  /** Resolved deterministic cascade-layer order. */
  readonly layerOrder: readonly string[]
  /** Resolved token reference and emission defaults. */
  readonly tokens: {
    /** Default token reference mode after policy resolution. */
    readonly reference: 'var' | 'val'
    /** Default token emission decision after policy resolution. */
    readonly emit: boolean
  }
  /** Resolved JSON-safe plugin policy payloads keyed by plugin id. */
  readonly plugins: Readonly<Record<string, VanityPolicyJson>>
  /** Preserve extension policy data not known to the core. */
  readonly [customPolicy: string]: unknown
}
