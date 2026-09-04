/** Public token values, authored definitions, and canonical `$*` handles. */

import type * as CSS from 'csstype'
import type { VanityAxisDefinitions, VanityAxisModeName } from '../system/axes'
import type {
  VanityCompatibleTokenInput,
  VanityCssDataType,
  VanityCssValue,
  VanityDataTypeOf,
  VanitySelfValue,
  VanityTokenInput,
  VanityValue,
} from '../values/types'

/** Whether a contrast value is statically checked or remains live at runtime. */
export type VanityContrastGuarantee = 'checked' | 'live'

// ─── Authoring color values ──────────────────────────────────────────────────

/** Anything the color helpers accept: authored color data, token inputs, or a CSS color literal. */
export type VanityColorish
  = | VanityAuthoredColor
    | VanityAuthoredContrast
    | VanityColorTokenHandle
    | VanityTokenInput<'color'>
    | string

/** CSS color space names accepted by color interpolation helpers, plus a custom `--name` space. */
export type VanityColorInterpolationSpace
  = | 'srgb' | 'srgb-linear' | 'display-p3' | 'display-p3-linear' | 'a98-rgb' | 'prophoto-rgb' | 'rec2020'
    | 'lab' | 'oklab' | 'xyz' | 'xyz-d50' | 'xyz-d65' | 'hsl' | 'hwb' | 'lch' | 'oklch'
    | `--${string}`
export type VanityPolarColorSpace = 'hsl' | 'hwb' | 'lch' | 'oklch'
export type VanityHueInterpolation = 'shorter' | 'longer' | 'increasing' | 'decreasing'

/** Canonical authored color value: expression/data only, with no token mode. */
export interface VanityAuthoredColor extends VanitySelfValue<'color'> {
  alpha: (amount: number) => VanityAuthoredColor
  lighten: (amount: number) => VanityAuthoredColor
  darken: (amount: number) => VanityAuthoredColor
  saturate: (amount: number) => VanityAuthoredColor
  desaturate: (amount: number) => VanityAuthoredColor
  rotate: (degrees: number) => VanityAuthoredColor
  mix: (other: VanityColorish, amount: number) => VanityAuthoredInterpolatedColor
}

export interface VanityAuthoredInterpolatedColor extends VanityAuthoredColor {
  in: {
    (space: VanityColorInterpolationSpace): VanityAuthoredColor
    (space: VanityPolarColorSpace, options: { hue: VanityHueInterpolation }): VanityAuthoredColor
  }
}

/** Authored contrast pairing; resolution determines its build guarantee. */
export interface VanityAuthoredContrast<G extends VanityContrastGuarantee = VanityContrastGuarantee> {
  readonly guarantee: G
}

// ─── Token handles ───────────────────────────────────────────────────────────

// ─── Canonical token traits ────────────────────────────────────────────────

/** Select a token's direct value or a CSS `var()` reference as its resolved form. */
export type VanityTokenReference = 'val' | 'var'

/** Per-token reference and emission traits after system defaults are applied. */
export interface VanityTokenPolicy<
  Reference extends VanityTokenReference = VanityTokenReference,
  Emit extends boolean = boolean,
> {
  /** Resolve this token as a direct value or a `var()` reference. */
  readonly reference: Reference
  /** Emit this token's declaration into the stylesheet. */
  readonly emit: Emit
}

/** The default token policy: emit a `var()` reference and include its declaration. */
export type VanityDefaultTokenPolicy = VanityTokenPolicy<'var', true>

/** CSS Properties and Values API registration metadata for a token. */
export interface VanityTokenRegistration<Val = unknown> {
  /** CSS Properties and Values API syntax; inferred from the token type when omitted. */
  readonly syntax?: string
  /** Whether descendants inherit the registered custom property. */
  readonly inherits?: boolean
  /** Initial value used by the browser when the property is unset. */
  readonly initialVal?: Val
}

/** Deprecation guidance attached to a token handle. */
export type VanityTokenDeprecation = string | {
  /** Explain why the token should no longer be used. */
  readonly reason?: string
  /** Name the preferred replacement token. */
  readonly use?: string
}

export type VanityTokenMetadataValue
  = | string
    | number
    | boolean
    | null
    | readonly VanityTokenMetadataValue[]
    | { readonly [key: string]: VanityTokenMetadataValue }

export type VanityTokenMetadata = Readonly<Record<string, VanityTokenMetadataValue>>

/** One issue returned by an implementation of Standard Schema validation. */
export interface VanityStandardSchemaIssue {
  /** Human-readable validation failure. */
  readonly message: string
  /** Structured path to the invalid input member. */
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[]
}

/** The synchronous portion of Standard Schema v1 used at CSS write boundaries. */
export interface VanityStandardSchemaV1<Input = unknown, Output = Input> {
  /** Standard Schema v1 adapter used for portable runtime validation. */
  readonly '~standard': {
    /** Standard Schema protocol version. */
    readonly version: 1
    /** Package or library that owns the schema. */
    readonly vendor: string
    /** Validate an input synchronously or asynchronously. */
    readonly validate: (
      value: Input,
    ) => { readonly value: Output, readonly issues?: undefined }
      | { readonly issues: readonly VanityStandardSchemaIssue[] }
      | PromiseLike<unknown>
  }
}

/** Select whether a mutable token validates only in development (`'dev'`) or on every update (`'always'`); `false` disables runtime validation. */
export type VanityRuntimeValidationMode = false | 'dev' | 'always'
/** Choose whether an invalid mutable-token value throws, uses its fallback, or is omitted. */
export type VanityInvalidRuntimeValuePolicy = 'throw' | 'fallback' | 'omit'

export interface VanityTokenValidation<Input = unknown, Output = Input> {
  /** Stable lookup key required when this schema crosses the build/app boundary. */
  readonly id: string
  /** Standard Schema implementation used when validation runs. */
  readonly schema?: VanityStandardSchemaV1<Input, Output>
  /** Select development-only, always-on, or type-only validation. */
  readonly runtime?: VanityRuntimeValidationMode
  /** Choose whether invalid runtime input throws, falls back, or is omitted. */
  readonly onInvalid?: VanityInvalidRuntimeValuePolicy
  /** Required when onInvalid is 'fallback'; it passes universal data-type checks. */
  readonly fallback?: Output
}

export interface VanityTokenCase<
  When extends Readonly<Record<string, string>> = Readonly<Record<string, string>>,
  Val = unknown,
> {
  /** Axis modes that select this branch. */
  readonly when: When
  /** Branch value, or `null` to reserve the address without a value. */
  readonly val: Val | null
}

/** Configure a token's value, policy overrides, axes, metadata, and runtime behavior. */
export interface VanityTokenConfig<
  Val = unknown,
  Axes extends Readonly<Record<string, Readonly<Record<string, unknown | null>>>> = Readonly<Record<string, Readonly<Record<string, unknown | null>>>>,
  Cases extends readonly VanityTokenCase[] = readonly VanityTokenCase[],
> {
  /** Default token value before axis branches are applied. */
  readonly val?: Val
  /** Override the system token reference policy for this token. */
  readonly reference?: VanityTokenReference
  /** Override the system token emission policy for this token. */
  readonly emit?: boolean
  /** Allow runtime updates to the token's base value and branches. */
  readonly mutable?: boolean
  /** Register this custom property with the browser Properties and Values API. */
  readonly register?: boolean | VanityTokenRegistration<Val>
  /** Values keyed by environmental axis modes. */
  readonly axes?: Axes
  /** Explicit semantic branches keyed by axis modes. */
  readonly cases?: Cases
  /** Human-readable explanation surfaced in introspection and diagnostics. */
  readonly description?: string
  /** Deprecation guidance shown to authors consuming this token. */
  readonly deprecated?: VanityTokenDeprecation
  /** JSON-safe metadata copied into introspection and manifests. */
  readonly metadata?: VanityTokenMetadata
  /** Optional synchronous Standard Schema policy for runtime-bound setters. */
  readonly validate?: VanityTokenValidation
}

/** Runtime brand for an advanced token definition. Ordinary group keys stay unreserved. */
export const VANITY_CONFIGURED_TOKEN = Symbol.for('vanity.configuredToken')

declare const VANITY_CONFIGURED_TOKEN_TYPE: unique symbol

/**
 * Type-only public carrier for an authored token definition.
 *
 * The configuration payload remains available to the graph type machinery,
 * but does not leak the runtime transport's `config`/`type` fields into
 * `tdef()` completion. Bare names on that surface belong to user axes.
 */
export interface VanityConfiguredTokenShape<
  Config extends object = VanityTokenConfig,
  Type extends VanityCssDataType = VanityCssDataType,
> {
  readonly [VANITY_CONFIGURED_TOKEN]: true
  readonly [VANITY_CONFIGURED_TOKEN_TYPE]?: {
    readonly config: Config
    readonly type: Type
  }
}

export interface VanityConfiguredToken<
  Config extends object = VanityTokenConfig,
  Type extends VanityCssDataType = VanityCssDataType,
> extends VanityConfiguredTokenShape<Config, Type> {
  readonly config: Config
  readonly type: Type
}

type VanityAxisValues<Axes extends VanityAxisDefinitions> = {
  readonly [Axis in keyof Axes]?: Readonly<Partial<Record<VanityAxisModeName<Axes[Axis]>, unknown | null>>>
}

type VanityCaseAddress<Axes extends VanityAxisDefinitions> = {
  readonly [Axis in keyof Axes]?: VanityAxisModeName<Axes[Axis]>
}

/** An independent vocabulary surface keeps literal values intact while excess keys fail locally. */
type VanityTokenAxisInput<Axes extends VanityAxisDefinitions>
  = [keyof Axes] extends [never]
    ? { readonly axes?: never, readonly cases?: never }
    : {
        readonly axes?: VanityAxisValues<Axes>
        readonly cases?: readonly {
          readonly when: VanityCaseAddress<Axes>
          readonly val: unknown | null
        }[]
      }

export type VanityTokenTraitDiagnostic<Config>
  = Config extends { readonly mutable: true } | { readonly axes: object } | { readonly cases: readonly unknown[] }
    ? (Config extends { readonly reference: infer Reference }
      ? Reference extends 'var' ? unknown : { readonly 'mutable/axes/cases require reference: \'var\'': never }
      : unknown)
    & (Config extends { readonly emit: infer Emit }
      ? Emit extends true ? unknown : { readonly 'mutable/axes/cases require emit: true': never }
      : unknown)
    : unknown

type VanityAxesVocabularyGuard<Configured, Axes extends VanityAxisDefinitions>
  = Configured extends object ? {
    readonly [Axis in keyof Configured]: Axis extends keyof Axes
      ? Configured[Axis] extends object ? {
        readonly [Mode in keyof Configured[Axis]]: Mode extends VanityAxisModeName<Axes[Axis]>
          ? Configured[Axis][Mode]
          : never
      } : never
      : never
  } : never

type VanityCaseVocabularyGuard<When, Axes extends VanityAxisDefinitions>
  = When extends object ? {
    readonly [Axis in keyof When]: Axis extends keyof Axes
      ? When[Axis] extends VanityAxisModeName<Axes[Axis]> ? When[Axis] : never
      : never
  } : never

type VanityTokenVocabularyGuard<Config, Axes extends VanityAxisDefinitions>
  = (Config extends { readonly axes: infer Configured }
    ? { readonly axes: VanityAxesVocabularyGuard<Configured, Axes> }
    : unknown)
  & (Config extends { readonly cases: infer Cases extends readonly unknown[] }
    ? {
        readonly cases: {
          readonly [Index in keyof Cases]: Cases[Index] extends { readonly when: infer When }
            ? Omit<Cases[Index], 'when'> & { readonly when: VanityCaseVocabularyGuard<When, Axes> }
            : never
        }
      }
    : unknown)

export type VanityTokenInitialVal<Type extends VanityCssDataType>
  = | VanityValue<Type>
    | string
    | (Type extends 'number' | 'integer' | 'percentage' | 'number-percentage' ? number : never)

type VanityNoDefaultTokenConfig<Type extends VanityCssDataType>
  = Omit<VanityTokenConfig<never>, 'val' | 'register'> & {
    readonly register?: boolean | VanityTokenRegistration<VanityTokenInitialVal<Type>>
  }

export interface VanityTypedNoDefaultTokenFactory<
  Type extends VanityCssDataType,
  Axes extends VanityAxisDefinitions = Record<never, never>,
> {
  (): VanityConfiguredToken<Record<never, never> & VanityTokenConfig<never>, Type>
  <const Config extends VanityNoDefaultTokenConfig<Type>>(
    config: Config
      & VanityTokenAxisInput<Axes>
      & NoInfer<VanityTokenVocabularyGuard<Config, Axes> & VanityTokenTraitDiagnostic<Config>>,
  ): VanityConfiguredToken<Config, Type>
}

type VanityConfiguredType<Config extends object>
  = Config extends { readonly val: infer Val } ? VanityDataTypeOf<Val>
    : Config extends { readonly axes: infer Axes extends object }
      ? VanityDataTypeOf<Exclude<Axes[keyof Axes] extends infer Modes
        ? Modes extends object ? Modes[keyof Modes] : never
        : never, null>>
      : Config extends { readonly cases: readonly (infer Case)[] }
        ? Case extends { readonly val: infer Val } ? VanityDataTypeOf<Exclude<Val, null>> : 'unknown'
        : 'unknown'

type VanityDerivedModes<Axis>
  = Axis extends { readonly derive: infer Derive } ? Derive : Record<never, never>

type VanityDerivedAxis<Configured extends object, Axis> = Configured & {
  readonly [Mode in Exclude<keyof VanityDerivedModes<Axis>, keyof Configured>]:
  VanityDerivedModes<Axis>[Mode] extends (...args: any[]) => infer Result ? Result : never
}

type VanityAxisWithDerivations<Configured, Axis>
  = Configured extends object ? VanityDerivedAxis<Configured, Axis> : Configured

type VanityApplyAxisDerivations<Configured, Axes extends VanityAxisDefinitions>
  = Configured extends object ? {
    readonly [Axis in keyof Configured]: Axis extends keyof Axes
      ? VanityAxisWithDerivations<Configured[Axis], Axes[Axis]>
      : Configured[Axis]
  } : Configured

type VanityMissingAxisDerivations<Configured, Axes extends VanityAxisDefinitions>
  = Configured extends object ? {
    [Axis in keyof Configured]: Axis extends keyof Axes
      ? Configured[Axis] extends object
        ? Exclude<keyof VanityDerivedModes<Axes[Axis]>, keyof Configured[Axis]>
        : never
      : never
  }[keyof Configured] : never

export type VanityConfigWithAxisDerivations<Config extends object, Axes extends VanityAxisDefinitions>
  = Config extends { readonly axes: infer ConfiguredAxes }
    ? [VanityMissingAxisDerivations<ConfiguredAxes, Axes>] extends [never]
        ? Config
        : Omit<Config, 'axes'> & { readonly axes: VanityApplyAxisDerivations<ConfiguredAxes, Axes> }
    : Config

export interface VanityTokenFactory<
  Axes extends VanityAxisDefinitions = Record<never, never>,
> {
  <const Config extends VanityTokenConfig>(
    config: Config
      & VanityTokenAxisInput<Axes>
      & NoInfer<VanityTokenVocabularyGuard<Config, Axes> & VanityTokenTraitDiagnostic<Config>>,
  ): VanityConfiguredToken<VanityConfigWithAxisDerivations<Config, Axes>, VanityConfiguredType<Config>>

  readonly unknown: VanityTypedNoDefaultTokenFactory<'unknown', Axes>
  readonly number: VanityTypedNoDefaultTokenFactory<'number', Axes>
  readonly integer: VanityTypedNoDefaultTokenFactory<'integer', Axes>
  readonly percentage: VanityTypedNoDefaultTokenFactory<'percentage', Axes>
  readonly numberPercentage: VanityTypedNoDefaultTokenFactory<'number-percentage', Axes>
  readonly length: VanityTypedNoDefaultTokenFactory<'length', Axes>
  readonly lengthPercentage: VanityTypedNoDefaultTokenFactory<'length-percentage', Axes>
  readonly angle: VanityTypedNoDefaultTokenFactory<'angle', Axes>
  readonly time: VanityTypedNoDefaultTokenFactory<'time', Axes>
  readonly frequency: VanityTypedNoDefaultTokenFactory<'frequency', Axes>
  readonly resolution: VanityTypedNoDefaultTokenFactory<'resolution', Axes>
  readonly flex: VanityTypedNoDefaultTokenFactory<'flex', Axes>
  readonly color: VanityTypedNoDefaultTokenFactory<'color', Axes>
  readonly image: VanityTypedNoDefaultTokenFactory<'image', Axes>
  readonly position: VanityTypedNoDefaultTokenFactory<'position', Axes>
  readonly easingFunction: VanityTypedNoDefaultTokenFactory<'easing-function', Axes>
  readonly transformFunction: VanityTypedNoDefaultTokenFactory<'transform-function', Axes>
  readonly transformList: VanityTypedNoDefaultTokenFactory<'transform-list', Axes>
  readonly customIdent: VanityTypedNoDefaultTokenFactory<'custom-ident', Axes>
  readonly dashedIdent: VanityTypedNoDefaultTokenFactory<'dashed-ident', Axes>
  readonly string: VanityTypedNoDefaultTokenFactory<'string', Axes>
  readonly url: VanityTypedNoDefaultTokenFactory<'url', Axes>
}

export type VanityTokenFallback<Type extends VanityCssDataType>
  = | VanityValue<Type>
    | VanityCompatibleTokenInput<Type>
    | string
    | (Type extends 'number' | 'integer' | 'percentage' | 'number-percentage' ? number : never)

declare const VANITY_BRANCH_MUTABILITY: unique symbol

export interface VanityTokenBranchHandle<Val = unknown, Mutable extends boolean = boolean> {
  /** Type-only owner trait used to keep runtime tuple batches honest. */
  readonly [VANITY_BRANCH_MUTABILITY]: Mutable
  /** Authored branch value; undefined denotes an explicit no-default reservation. */
  readonly $val: VanityResolvedTokenVal<Val>
  /** Human-readable explanation for this branch. */
  readonly $description?: string
  /** JSON-safe metadata attached to this branch. */
  readonly $metadata?: VanityTokenMetadata
  /** Serialize the branch's resolved value. */
  toString: () => string
}

type VanityAxisHandles<Axes, Mutable extends boolean> = Axes extends object ? {
  readonly [Axis in keyof Axes]: Axes[Axis] extends object ? {
    readonly [Mode in keyof Axes[Axis]]: VanityTokenBranchHandle<Axes[Axis][Mode], Mutable>
  } : never
} : Record<never, never>

type VanityCaseWhen<Cases> = Cases extends readonly (infer Case)[]
  ? Case extends { readonly when: infer When } ? When : never
  : never

type VanityCaseVal<Cases, _When> = Cases extends readonly (infer Case)[]
  ? Case extends { readonly val: infer Val } ? Val : never
  : never

type VanityConfiguredAxes<Node> = Node extends VanityConfiguredTokenShape<infer Config, any>
  ? Config extends { readonly axes: infer Axes } ? Axes : Record<never, never>
  : Record<never, never>

type VanityConfiguredCases<Node> = Node extends VanityConfiguredTokenShape<infer Config, any>
  ? Config extends { readonly cases: infer Cases } ? Cases : readonly []
  : readonly []

type VanityConfiguredVal<Node> = Node extends VanityConfiguredTokenShape<infer Config, any>
  ? Config extends { readonly val: infer Val } ? Val : undefined
  : Node extends null ? undefined : Node

type VanityConfiguredReference<Node, Policy extends VanityTokenPolicy>
  = Node extends null ? 'var'
    : Node extends VanityConfiguredTokenShape<infer Config, any>
      ? Config extends { readonly reference: infer Reference extends VanityTokenReference } ? Reference
        : Config extends { readonly mutable: true } | { readonly axes: object } | { readonly cases: readonly unknown[] } ? 'var'
          : 'val' extends Policy['reference'] ? Policy['reference'] : 'var'
      : Policy['reference']

type VanityConfiguredEmit<Node, Policy extends VanityTokenPolicy>
  = Node extends null ? false
    : Node extends VanityConfiguredTokenShape<infer Config, any>
      ? Config extends { readonly emit: infer Emit extends boolean } ? Emit
        : Config extends { readonly mutable: true } | { readonly axes: object } | { readonly cases: readonly unknown[] } ? true
          : Config extends { readonly val: unknown } ? Policy['emit'] : false
      : Policy['emit']

type VanityConfiguredMutable<Node> = Node extends VanityConfiguredTokenShape<infer Config, any>
  ? Config extends { readonly mutable: true } ? true : false
  : false

type VanityConfiguredDescription<Node> = Node extends VanityConfiguredTokenShape<infer Config, any>
  ? Config extends { readonly description: infer Description extends string } ? Description : undefined
  : undefined

export type VanityResolvedTokenVal<Val>
  = Val extends null | undefined ? undefined
    : Val extends VanityCssValue<infer Css> ? Css
      : Val extends string | number ? Val
        : string

/** Canonical public-property handle shared across build and application contexts. */
export interface VanityTokenHandle<
  Val = unknown,
  Name extends string = string,
  Path extends string = string,
  Type extends VanityCssDataType = VanityCssDataType,
  Reference extends VanityTokenReference = VanityTokenReference,
  Emit extends boolean = boolean,
  Mutable extends boolean = boolean,
  Axes = Record<never, never>,
  Cases = readonly [],
  Description extends string | undefined = string | undefined,
> {
  /** Final `--name` custom-property name; available on consolidated handles. */
  readonly $name: `--${Name}`
  /** Resolved direct value for this token. */
  readonly $val: VanityResolvedTokenVal<Val>
  /** Return the token's `var()` reference, optionally with a typed fallback. */
  readonly $var: (fallback?: VanityTokenFallback<Type>) => `var(--${Name})` | `var(--${Name}, ${string})`
  /** Semantic token path used by introspection, diagnostics, and runtime updates. */
  readonly $path: Path
  /** CSS data type carried by this token. */
  readonly $type: Type
  /** Resolved reference mode selected by token and system policy. */
  readonly $reference: Reference
  /** Resolved decision for emitting this token's declaration. */
  readonly $emit: Emit
  /** Whether runtime updates are allowed for this token. */
  readonly $mutable: Mutable
  /**
   * Apply this token as a declaration named by its final path segment.
   *
   * A locked system narrows this to the exact declaration key and reports a
   * readable type/runtime diagnostic when that key is not a CSS property,
   * custom property, or configured alias.
   */
  readonly $dec: Readonly<Record<string, VanityTokenHandle<any, any, any, any, any, any, any, any, any, any>>>
  /** Human-readable explanation attached to the token. */
  readonly $description: Description
  /** Deprecation guidance for consumers of this token. */
  readonly $deprecated?: string
  /** JSON-safe metadata for tooling and integrations. */
  readonly $metadata?: VanityTokenMetadata
  /** Browser property registration metadata, when registration is enabled. */
  readonly $register?: boolean | VanityTokenRegistration<Val>
  /** Runtime validation metadata for mutable updates. */
  readonly $validate?: VanityTokenValidation
  /** Branch handles grouped by environmental axis and mode. */
  readonly $axes: VanityAxisHandles<Axes, Mutable>
  /** Resolve the branch selected by a semantic axis-mode address. */
  readonly $case: (
    when: VanityCaseWhen<Cases>,
  ) => VanityTokenBranchHandle<VanityCaseVal<Cases, VanityCaseWhen<Cases>>, Mutable>
  /** Serialize the token's resolved value. */
  toString: () => string
}

/** Erased token-handle shape used at dynamic graph and introspection boundaries; prefer the inferred handle type at authoring sites. */
export type VanityTokenHandleAny = VanityTokenHandle<any, string, string, any, any, any, any, any, any, any>
export type VanityColorTokenHandle = VanityTokenHandle<any, string, string, 'color', any, any, any, any, any, any>

// ─── Token module: input shape and inferred output ──────────────────────────

export type VanityLeafInput
  = | VanityAuthoredColor
    | VanityAuthoredContrast
    | VanityCssValue
    | VanityConfiguredTokenShape
    | string
    | number
    | null
export type VanityDerivedResult
  = | VanityAuthoredColor
    | VanityAuthoredContrast
    | VanityTokenHandleAny
    | VanityCssValue
    | VanityConfiguredTokenShape
    | string
    | number
    | null

/**
 * The dependency-free seed accepted by `defineTokens`. Derivations live in
 * explicit derivation steps, where TypeScript has the whole prior module and
 * can therefore complete and validate every token path at the cursor.
 */
export interface VanityGraphInput {
  [token: string]: VanityLeafInput | VanityGraphInput
}

/** A nested set of tokens produced by one topological derivation stage. */
export interface VanityTokenDerivationTree {
  [token: string]: VanityDerivedResult | VanityTokenDerivationTree
}

/** Type-only marker: a derived leaf is always produced by a derivation step. */
declare const VANITY_DERIVED_DEFINITION: unique symbol

/** A type-level node produced by a derivation step. */
export interface VanityDerived<R> {
  readonly [VANITY_DERIVED_DEFINITION]: R
}

type VanityDefinitionLeaf = VanityLeafInput | VanityDerived<unknown>

type VanityMergeNode<A, B>
  = A extends VanityDefinitionLeaf ? B
    : B extends VanityDefinitionLeaf ? B
      : A extends object
        ? B extends object ? VanityMergeGraph<A, B> : B
        : B

export type VanityMergeGraph<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? K extends keyof A ? VanityMergeNode<A[K], B[K]> : B[K]
    : K extends keyof A ? A[K] : never
}

/**
 * Collision-checked additive composition is structurally an intersection.
 * The token builder and open system use this form so one type layer is not
 * added for every module in a large design system. Shared object groups merge
 * naturally; their leaf collisions are rejected before this type is produced.
 */
export type VanityAdditiveGraph<A, B>
  = keyof A extends never ? B
    : keyof B extends never ? A
      : A & B

type VanityPath<Prefix extends string, Key extends string>
  = Prefix extends '' ? Key : `${Prefix}.${Key}`

/** Every path at which two independently authored graphs both own a token. */
type VanityDuplicatePaths<A, B, Prefix extends string = ''> = {
  [K in keyof A & keyof B & string]: A[K] extends VanityDefinitionLeaf
    ? VanityPath<Prefix, K>
    : B[K] extends VanityDefinitionLeaf
      ? VanityPath<Prefix, K>
      : A[K] extends object
        ? B[K] extends object
          ? VanityDuplicatePaths<A[K], B[K], VanityPath<Prefix, K>>
          : VanityPath<Prefix, K>
        : VanityPath<Prefix, K>
}[keyof A & keyof B & string]

/**
 * A readable, cursor-local composition error. The impossible property makes
 * TypeScript print every colliding dot path at the `.add(module)` call.
 */
export type VanityCompositionGuard<A, B>
  = [VanityDuplicatePaths<A, B>] extends [never]
    ? unknown
    : {
        readonly [K in `Token module duplicates an existing token: ${VanityDuplicatePaths<A, B>}`]: never
      }

/** Semantic requirement carried by an unfinished token module. */
/** Capability requirement carried by a token module until a system mounts it. */
export interface VanityTokenModuleRequirement {
  /** Value protocol revision required by the module. */
  readonly protocol: number
  /** Exact capability identity required by the module. */
  readonly capabilitySignature: string
  /** Older compatible capability identities accepted by the module. */
  readonly compatibleCapabilitySignatures: readonly string[]
}

/** Emission intent retained by a module until one system finalizes it. */
export interface VanityTokenModuleOptions {
  /** Root selector or path for module emission. */
  readonly root?: string
  /** Internal lowered `@scope` preludes inherited by every declaration. */
  readonly scopes?: readonly string[]
  /** Internal DOM query retained when CSS emission itself is rooted at `:scope`. */
  readonly runtimeRoot?: string
  /** Resolve this module back to the owning system root at finalization. */
  readonly systemRoot?: true
  /** Cascade layer used for the module's declarations. */
  readonly layer?: string
}

/**
 * An unfinished, system-bound token module. It has structure and derivations,
 * but no prefix, custom-property names, or emitted CSS until `createSystem()`.
 */
declare const VANITY_TOKEN_DEFINITION: unique symbol

/** Type-only token graph carried by a builder until a system resolves it. */
export interface VanityTokenDefinition<
  G extends object,
  Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
> {
  /** Type-only graph carrier; runtime identity uses `Symbol.for`. */
  readonly [VANITY_TOKEN_DEFINITION]: G
  /** Type-only system token policy captured when this unfinished module was defined. */
  readonly __vanityTokenPolicy?: Policy
}

/** Named token module that can be mounted into an open system. */
export interface VanityTokenModule<
  G extends object,
  Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
> extends VanityTokenDefinition<G, Policy> {}

/** Per-character kebab-case, in lockstep with the runtime rule in `names.ts`. */
export type VanityKebab<S extends string> = S extends `${infer Head}${infer Rest}`
  ? Head extends Uppercase<Head>
    ? Head extends Lowercase<Head>
      ? `${Head}${VanityKebab<Rest>}` // digit or symbol
      : `-${Lowercase<Head>}${VanityKebab<Rest>}`
    : `${Head}${VanityKebab<Rest>}`
  : S

type VanityTokenNameSegment<Segment extends string>
  = Segment extends VanityRawSelectorKey ? `selector-${string}` : VanityKebab<Segment>

/** The typed graph `defineTokens` returns: every leaf a handle, every name a literal. */
declare const VANITY_RESOLVED_TOKENS: unique symbol

export interface VanityResolvedTokens {
  readonly [VANITY_RESOLVED_TOKENS]: true
}

export type VanityTokens<T, Name extends string = 'vanity'> = VanityResolvedTokens & VanityCanonicalTokenGroup<
  T,
  Name,
  '',
  VanityDefaultTokenPolicy,
  string,
  string
>

/** The canonical token module: independent traits and `$`-prefixed handle members. */
export type VanityCanonicalTokens<
  T,
  Name extends string = 'vanity',
  Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Conditions extends string = string,
  Aliases extends string = string,
> = VanityResolvedTokens & VanityCanonicalTokenGroup<T, Name, '', Policy, Conditions, Aliases>

type VanityCanonicalTokenGroup<
  T,
  Name extends string,
  Path extends string,
  Policy extends VanityTokenPolicy,
  Conditions extends string,
  Aliases extends string,
> = {
  readonly [K in keyof T & string as K extends `$${string}` ? never : K]: VanityCanonicalTokenOf<
    T[K],
    `${Name}-${VanityTokenNameSegment<K>}`,
    Path extends '' ? K : `${Path}.${K}`,
    Policy,
    Conditions,
    Aliases
  >
} & {
  /** Apply every direct property leaf and condition/selector subgroup. */
  readonly $dec: VanityTokenDeclarationGroup<T, Name, Path, Policy, Conditions, Aliases>
}

type VanityCanonicalTokenOf<
  Node,
  Name extends string,
  Path extends string,
  Policy extends VanityTokenPolicy,
  Conditions extends string,
  Aliases extends string,
> = Node extends VanityDerived<infer Result>
  ? VanityDeclarableTokenHandle<VanityTokenHandleOf<Result, Name, Path, Policy>, VanityLastPathSegment<Path>, Aliases>
  : Node extends VanityLeafInput
    ? VanityDeclarableTokenHandle<VanityTokenHandleOf<Node, Name, Path, Policy>, VanityLastPathSegment<Path>, Aliases>
    : VanityCanonicalTokenGroup<Node, Name, Path, Policy, Conditions, Aliases>

type VanityCssDeclarationProperty = keyof CSS.Properties<number | (string & {})>

type VanityLastPathSegment<Path extends string>
  = Path extends `${string}.${infer Tail}` ? VanityLastPathSegment<Tail> : Path

type VanityRawSelectorKey
  = | `${string}&${string}`
    | `.${string}`
    | `#${string}`
    | `[${string}`
    | `:${string}`
    | `*${string}`
    | `>${string}`
    | `+${string}`
    | `~${string}`
    | `${string} ${string}`

type VanityDeclarationProperty<Key extends string, Aliases extends string>
  = Key extends VanityCssDeclarationProperty | `--${string}` | Aliases ? true : false

/** Readable type carried by an invalid `$dec` projection. */
export interface VanityTokenDeclarationError<Names extends string> {
  /**
   * Deliberately occupies a real CSS property so spreading an invalid bundle
   * fails structurally even after excess-property checks have been lost.
   */
  readonly color: {
    readonly [
    Message in `$dec cannot apply ${Names}: navigate to a leaf bundle, or register/use the child as a condition`
    ]: never
  }
}

type VanityInvalidDeclarationChildren<
  T,
  Conditions extends string,
  Aliases extends string,
> = {
  [K in keyof T & string]:
  T[K] extends VanityDefinitionLeaf
    ? VanityDeclarationProperty<K, Aliases> extends true ? never : K
    : K extends Conditions | VanityRawSelectorKey ? never : K
}[keyof T & string]

type VanityDeclarableTokenHandle<
  Handle extends VanityTokenHandleAny,
  Key extends string,
  Aliases extends string,
> = Handle & {
  readonly $dec: VanityDeclarationProperty<Key, Aliases> extends true
    ? Readonly<Record<Key, Handle>>
    : VanityTokenDeclarationError<Key>
}

type VanityTokenDeclarationGroup<
  T,
  Name extends string,
  Path extends string,
  Policy extends VanityTokenPolicy,
  Conditions extends string,
  Aliases extends string,
> = [VanityInvalidDeclarationChildren<T, Conditions, Aliases>] extends [never]
  ? {
      readonly [K in keyof T & string as K extends `$${string}` ? never : K]:
      T[K] extends VanityDefinitionLeaf
        ? VanityCanonicalTokenOf<
          T[K],
          `${Name}-${VanityTokenNameSegment<K>}`,
          Path extends '' ? K : `${Path}.${K}`,
          Policy,
          Conditions,
          Aliases
        >
        : K extends Conditions | VanityRawSelectorKey
          ? VanityTokenDeclarationGroup<
            T[K],
            `${Name}-${VanityTokenNameSegment<K>}`,
            Path extends '' ? K : `${Path}.${K}`,
            Policy,
            Conditions,
            Aliases
          >
          : never
    }
  : VanityTokenDeclarationError<VanityInvalidDeclarationChildren<T, Conditions, Aliases>>

/** Readable resolved handle inferred from one canonical authored token node. */
export type VanityTokenHandleOf<
  Node,
  Name extends string,
  Path extends string,
  Policy extends VanityTokenPolicy,
> = VanityTokenHandle<
  VanityConfiguredVal<Node>,
  Name,
  Path,
  Node extends VanityConfiguredTokenShape<any, infer Type> ? Type : VanityDataTypeOf<VanityConfiguredVal<Node>>,
  VanityConfiguredReference<Node, Policy>,
  VanityConfiguredEmit<Node, Policy>,
  VanityConfiguredMutable<Node>,
  VanityConfiguredAxes<Node>,
  VanityConfiguredCases<Node>,
  VanityConfiguredDescription<Node>
>

export type VanityTokensFromDefinition<SystemTokens, Definition>
  = Definition extends VanityTokenDefinition<infer Graph, any>
    ? VanitySelectionFromGraph<SystemTokens, Graph>
    : Definition

type VanitySelectionFromGraph<SystemTokens, Graph> = {
  readonly [K in keyof Graph & keyof SystemTokens as K extends `$${string}` ? never : K]:
  Graph[K] extends VanityDefinitionLeaf
    ? SystemTokens[K]
    : VanitySelectionFromGraph<SystemTokens[K], Graph[K]>
} & (SystemTokens extends { readonly $dec: infer Declarations }
  ? { readonly $dec: Declarations }
  : object)

export type VanityNamesOf<Selection> = Selection extends { readonly $name: infer Name extends `--${string}` }
  ? Name
  : Selection extends object ? {
    readonly [K in keyof Selection as K extends `$${string}` ? never : K]: VanityNamesOf<Selection[K]>
  } : never

export type VanityVarsOf<Selection> = Selection extends { readonly $name: infer Name extends `--${string}` }
  ? `var(${Name})`
  : Selection extends object ? {
    readonly [K in keyof Selection as K extends `$${string}` ? never : K]: VanityVarsOf<Selection[K]>
  } : never

// ─── Options ─────────────────────────────────────────────────────────────────

/** Configure a standalone token graph's prefix and cross-token checks. */
export interface VanityTokensOptions<T = unknown, Prefix extends string = string> {
  /** The custom-property prefix: `--vanity-*` by default. */
  prefix?: Prefix
  /** Standalone guarantees over pairings the graph doesn't own ([spec-tokens.md §5]). */
  checks?: (refs: VanityTokens<T, Prefix>) => readonly VanityCheck[]
}

export interface VanityCheck {
  readonly kind: 'textContrast'
  /** WCAG 2 level shorthands. */
  aa: () => VanityCheck
  aaa: () => VanityCheck
  /** An explicit APCA threshold. */
  lc: (min: number) => VanityCheck
}
