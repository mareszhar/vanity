/**
 * The public token types. Two rules govern everything here:
 *
 * - **Type the names** ([patterns.md §2]): token paths, emitted variable
 *   names, and modes are all literal types, so mistakes die at the cursor and
 *   hovers read as facts (`VanityColorToken<'live', 'vanity-color-brand'>`).
 * - **The types are honest about liveness** ([patterns.md §3]):
 *   `applyTheme` accepts only runtime inputs — tokens marked `.live()` —
 *   because those are the only writes that re-derive the world instead of
 *   half-clobbering it.
 */

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

// ─── Modes ───────────────────────────────────────────────────────────────────

/**
 * How a token behaves at runtime:
 * `static` folds at build · `scheme` pairs per scheme via `light-dark()` ·
 * `live` is a runtime input (`.live()`) · `derived` re-derives from its inputs.
 */
export type VanityTokenMode = 'static' | 'scheme' | 'live' | 'derived'
export type VanityColorMode = 'static' | 'scheme' | 'live'
export type VanityContrastGuarantee = 'checked' | 'live'

/** The runtime-value mode a token contributes when used inside a derivation. */
type VanityValueMode<M extends VanityTokenMode> = M extends 'derived' ? 'live' : M

// ─── Authoring color values ──────────────────────────────────────────────────

/** Anything the color helpers accept: a color value/token, a contrast pick, or a CSS color literal. */
export type VanityColorish
  = | VanityColor<any>
    | VanityAuthoredColor
    | VanityColorTokenAny
    | VanityColorTokenHandle
    | VanityTokenInput<'color'>
    | VanityContrast<any>
    | string

export type VanityModeOf<S extends VanityColorish>
  = S extends VanityContrast<infer G> ? (G extends 'checked' ? 'scheme' : 'live')
    : S extends VanityColor<infer M> ? M
      : S extends VanityColorToken<infer M, any> ? VanityValueMode<M>
        : S extends VanityTokenInput<'color'> ? 'live'
          : 'static'

/** Distributes over mode unions, so an uncertain target claims no guarantee it can't keep. */
export type VanityGuaranteeOf<M extends VanityColorMode> = M extends 'live' ? 'live' : 'checked'

/**
 * A color under construction: an expression tree the compiler either folds at
 * build time or serializes to live CSS, per liveness. The method set is finite
 * by design — each entry has a defined live-CSS serialization.
 */
export interface VanityColor<out M extends VanityColorMode = VanityColorMode> extends VanitySelfValue<'color'> {
  readonly mode: M
  /** Marks the token as a runtime input: writable via `applyTheme`, emitted live. */
  live: () => VanityColor<'live'>
  /** Intent at the definition site — surfaced by the manifest and audits. */
  describe: (text: string) => VanityColor<M>
  deprecated: (reason: string) => VanityColor<M>
  alpha: (amount: number) => VanityColor<M>
  lighten: (amount: number) => VanityColor<M>
  darken: (amount: number) => VanityColor<M>
  saturate: (amount: number) => VanityColor<M>
  desaturate: (amount: number) => VanityColor<M>
  rotate: (degrees: number) => VanityColor<M>
  mix: (other: VanityColorish, amount: number) => VanityInterpolatedColor<VanityColorMode>
}

export type VanityColorInterpolationSpace
  = | 'srgb' | 'srgb-linear' | 'display-p3' | 'display-p3-linear' | 'a98-rgb' | 'prophoto-rgb' | 'rec2020'
    | 'lab' | 'oklab' | 'xyz' | 'xyz-d50' | 'xyz-d65' | 'hsl' | 'hwb' | 'lch' | 'oklch'
    | `--${string}`
export type VanityPolarColorSpace = 'hsl' | 'hwb' | 'lch' | 'oklch'
export type VanityHueInterpolation = 'shorter' | 'longer' | 'increasing' | 'decreasing'

/** Only interpolation-producing operations expose CSS's `in <color-space>` choice. */
export interface VanityInterpolatedColor<out M extends VanityColorMode = VanityColorMode> extends VanityColor<M> {
  in: {
    (space: VanityColorInterpolationSpace): VanityColor<M>
    (space: VanityPolarColorSpace, options: { hue: VanityHueInterpolation }): VanityColor<M>
  }
}

/** Canonical engine color value: expression/data type only, with no token liveness mode. */
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

/**
 * A guaranteed-legible pairing from `legibleOn`. `checked` is proven at build
 * (APCA); over a live target the guarantee degrades honestly to `live` and
 * retains the computed fallback from the authored defaults.
 */
export interface VanityContrast<G extends VanityContrastGuarantee = VanityContrastGuarantee> {
  readonly guarantee: G
  describe: (text: string) => VanityContrast<G>
  deprecated: (reason: string) => VanityContrast<G>
}

// ─── Token handles ───────────────────────────────────────────────────────────

export interface VanityTokenBase<Name extends string = string, Path extends string = string> {
  /** The emitted custom-property name: `--vanity-color-brand`. */
  readonly name: `--${Name}`
  /** The reference form for interpolation: `var(--vanity-color-brand)`. */
  readonly var: `var(--${Name})`
  /** The dot path in the graph: `color.brand`. */
  readonly path: Path
  /** Intent from `.describe()` at the definition site. */
  readonly description?: string
  /** The replacement named by `.deprecated()`. */
  readonly deprecated?: string
  toString: () => `var(--${Name})`
}

export interface VanityColorToken<
  M extends VanityTokenMode = VanityTokenMode,
  Name extends string = string,
  Path extends string = string,
> extends VanityTokenBase<Name, Path> {
  readonly mode: M
  alpha: (amount: number) => VanityColor<VanityValueMode<M>>
  lighten: (amount: number) => VanityColor<VanityValueMode<M>>
  darken: (amount: number) => VanityColor<VanityValueMode<M>>
  saturate: (amount: number) => VanityColor<VanityValueMode<M>>
  desaturate: (amount: number) => VanityColor<VanityValueMode<M>>
  rotate: (degrees: number) => VanityColor<VanityValueMode<M>>
  mix: (other: VanityColorish, amount: number) => VanityInterpolatedColor<VanityColorMode>
}

type VanityColorTokenAny = VanityColorToken<any, string>

export interface VanityContrastToken<
  G extends VanityContrastGuarantee = VanityContrastGuarantee,
  Name extends string = string,
  Path extends string = string,
> extends VanityTokenBase<Name, Path> {
  readonly mode: 'derived'
  readonly guarantee: G
}

export interface VanityValueToken<
  V extends string | number = string | number,
  Name extends string = string,
  M extends 'static' | 'derived' = 'static' | 'derived',
  Path extends string = string,
> extends VanityTokenBase<Name, Path> {
  readonly mode: M
  /** The resolved value — hover a token, read its answer. */
  readonly value: V
}

// ─── Canonical token traits ────────────────────────────────────────────────

export type VanityTokenReference = 'val' | 'var'

export interface VanityTokenPolicy<
  Reference extends VanityTokenReference = VanityTokenReference,
  Emit extends boolean = boolean,
> {
  readonly reference: Reference
  readonly emit: Emit
}

export type VanityDefaultTokenPolicy = VanityTokenPolicy<'var', true>

export interface VanityTokenRegistration<Val = unknown> {
  /** CSS Properties and Values API syntax; inferred from the token type when omitted. */
  readonly syntax?: string
  readonly inherits?: boolean
  readonly initialVal?: Val
}

export type VanityTokenDeprecation = string | {
  readonly reason?: string
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

export interface VanityStandardSchemaIssue {
  readonly message: string
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[]
}

/** The synchronous portion of Standard Schema v1 used at CSS write boundaries. */
export interface VanityStandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: Input,
    ) => { readonly value: Output, readonly issues?: undefined }
      | { readonly issues: readonly VanityStandardSchemaIssue[] }
      | PromiseLike<unknown>
  }
}

export type VanityRuntimeValidationMode = false | 'dev' | 'always'
export type VanityInvalidRuntimeValuePolicy = 'throw' | 'fallback' | 'omit'

export interface VanityTokenValidation<Input = unknown, Output = Input> {
  /** Stable lookup key required when this schema crosses the build/app boundary. */
  readonly id: string
  readonly schema?: VanityStandardSchemaV1<Input, Output>
  readonly runtime?: VanityRuntimeValidationMode
  readonly onInvalid?: VanityInvalidRuntimeValuePolicy
  /** Required when onInvalid is 'fallback'; it passes universal data-type checks. */
  readonly fallback?: Output
}

export interface VanityTokenCase<
  When extends Readonly<Record<string, string>> = Readonly<Record<string, string>>,
  Val = unknown,
> {
  readonly when: When
  readonly val: Val | null
}

export interface VanityTokenConfig<
  Val = unknown,
  Axes extends Readonly<Record<string, Readonly<Record<string, unknown | null>>>> = Readonly<Record<string, Readonly<Record<string, unknown | null>>>>,
  Cases extends readonly VanityTokenCase[] = readonly VanityTokenCase[],
> {
  readonly val?: Val
  readonly reference?: VanityTokenReference
  readonly emit?: boolean
  readonly mutable?: boolean
  readonly register?: boolean | VanityTokenRegistration<Val>
  readonly axes?: Axes
  readonly cases?: Cases
  readonly description?: string
  readonly deprecated?: VanityTokenDeprecation
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

type VanityTokenTraitDiagnostic<Config>
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
  readonly $description?: string
  readonly $metadata?: VanityTokenMetadata
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
  readonly $name: `--${Name}`
  readonly $val: VanityResolvedTokenVal<Val>
  readonly $var: (fallback?: VanityTokenFallback<Type>) => `var(--${Name})` | `var(--${Name}, ${string})`
  readonly $path: Path
  readonly $type: Type
  readonly $reference: Reference
  readonly $emit: Emit
  readonly $mutable: Mutable
  /**
   * Apply this token as a declaration named by its final path segment.
   *
   * A locked system narrows this to the exact declaration key and reports a
   * readable type/runtime diagnostic when that key is not a CSS property,
   * custom property, or configured alias.
   */
  readonly $dec: Readonly<Record<string, VanityTokenHandle<any, any, any, any, any, any, any, any, any, any>>>
  readonly $description: Description
  readonly $deprecated?: string
  readonly $metadata?: VanityTokenMetadata
  readonly $register?: boolean | VanityTokenRegistration<Val>
  readonly $validate?: VanityTokenValidation
  readonly $axes: VanityAxisHandles<Axes, Mutable>
  readonly $case: (
    when: VanityCaseWhen<Cases>,
  ) => VanityTokenBranchHandle<VanityCaseVal<Cases, VanityCaseWhen<Cases>>, Mutable>
  toString: () => string
}

export type VanityTokenHandleAny = VanityTokenHandle<any, string, string, any, any, any, any, any, any, any>
export type VanityColorTokenHandle = VanityTokenHandle<any, string, string, 'color', any, any, any, any, any, any>

// ─── The graph: input shape and inferred output ──────────────────────────────

export type VanityLeafInput
  = | VanityColor<any>
    | VanityAuthoredColor
    | VanityContrast<any>
    | VanityCssValue
    | VanityConfiguredTokenShape
    | string
    | number
    | null
export type VanityDerivedResult
  = | VanityColor<any>
    | VanityAuthoredColor
    | VanityContrast<any>
    | VanityColorTokenAny
    | VanityContrastToken<any, any>
    | VanityValueToken<any, any, any>
    | VanityTokenHandleAny
    | VanityCssValue
    | VanityConfiguredTokenShape
    | string
    | number
    | null

/**
 * The dependency-free seed accepted by `defineTokens`. Derivations live in
 * explicit `.derive()` stages, where TypeScript has the whole prior graph and
 * can therefore complete and validate every token path at the cursor.
 */
export interface VanityGraphInput {
  [token: string]: VanityLeafInput | VanityGraphInput
}

/** A nested set of tokens produced by one topological derivation stage. */
export interface VanityTokenDerivationStage {
  [token: string]: VanityDerivedResult | VanityTokenDerivationStage
}

/** Type-only marker: a stage-produced leaf is always a graph derivation. */
declare const VANITY_DERIVED_DEFINITION: unique symbol

/** A type-level graph node produced by a `.derive()` stage. */
export interface VanityDerived<R> {
  readonly [VANITY_DERIVED_DEFINITION]: R
}

type VanityDefinitionLeaf = VanityLeafInput | VanityDerived<unknown>

type VanityMarkDerived<S> = {
  [K in keyof S]: S[K] extends VanityDerivedResult
    ? VanityDerived<S[K]>
    : S[K] extends object ? VanityMarkDerived<S[K]> : never
}

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
 * The unified builder and open system use this form so one type layer is not
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
 * TypeScript print every colliding dot path at the `.compose(module)` call.
 */
export type VanityCompositionGuard<A, B>
  = [VanityDuplicatePaths<A, B>] extends [never]
    ? unknown
    : {
        readonly [K in `Token module duplicates an existing token: ${VanityDuplicatePaths<A, B>}`]: never
      }

/**
 * Let a stage reopen existing groups, but reject an existing leaf at the exact
 * returned key. The recursive intersection keeps TypeScript's diagnostic on
 * the typo/duplicate instead of collapsing into an overload wall.
 */
type VanityAddition<G, S> = {
  [K in keyof S]: K extends keyof G
    ? G[K] extends VanityDefinitionLeaf
      ? never
      : S[K] extends VanityDerivedResult
        ? never
        : S[K] extends object
          ? VanityAddition<G[K], S[K]>
          : never
    : S[K]
}

/** Semantic engine requirement carried by an unfinished module. */
export interface VanityEngineRequirement {
  readonly protocol: number
  readonly signature: string
  readonly compatibleSignatures: readonly string[]
}

/** Emission intent retained by a module until one system finalizes it. */
export interface VanityTokenModuleOptions {
  readonly root?: string
  /** Internal lowered `@scope` preludes inherited by every declaration. */
  readonly scopes?: readonly string[]
  /** Internal DOM query retained when CSS emission itself is rooted at `:scope`. */
  readonly runtimeRoot?: string
  /** Resolve this module back to the owning system root at finalization. */
  readonly systemRoot?: true
  readonly layer?: string
}

/**
 * An unfinished, engine-bound token graph. It has structure and derivations,
 * but no prefix, custom-property names, or emitted CSS until `createSystem()`.
 */
declare const VANITY_TOKEN_DEFINITION: unique symbol

export interface VanityTokenDefinition<
  G extends object,
  Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
> {
  /** Type-only graph carrier; runtime identity uses `Symbol.for`. */
  readonly [VANITY_TOKEN_DEFINITION]: G
  /** Type-only engine token policy captured when this unfinished module was defined. */
  readonly __vanityTokenPolicy?: Policy
}

export interface VanityTokenModule<
  G extends object,
  Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
> extends VanityTokenDefinition<G, Policy> {
  /**
   * Compose an independently authored token module into this definition.
   * Modules retain their internal stage order; later derivations see the
   * exact combined graph. Duplicate paths fail at this call.
   */
  compose: <const M extends object>(
    module: VanityTokenDefinition<M, Policy> & VanityCompositionGuard<G, M>,
  ) => VanityTokenModule<VanityMergeGraph<G, M>, Policy>
  derive: <const S extends VanityTokenDerivationStage>(
    stage: (m: VanityCanonicalTokens<G, string, Policy>) => S & VanityAddition<G, S>,
  ) => VanityTokenModule<VanityMergeGraph<G, VanityMarkDerived<S>>, Policy>
}

/**
 * Standalone characterization builder. Engine-bound modules deliberately do
 * not expose `.build()` because the finalized system is the sole name owner.
 */
export interface VanityTokenBuilder<G extends object> extends VanityTokenDefinition<G> {
  compose: <const M extends object>(
    module: VanityTokenDefinition<M> & VanityCompositionGuard<G, M>,
  ) => VanityTokenBuilder<VanityMergeGraph<G, M>>
  derive: <const S extends VanityTokenDerivationStage>(
    stage: (m: VanityTokens<G, string>) => S & VanityAddition<G, S>,
  ) => VanityTokenBuilder<VanityMergeGraph<G, VanityMarkDerived<S>>>
  /** Finalize the standalone graph for characterization. */
  build: <Prefix extends string = 'vanity'>(
    options?: VanityTokensOptions<G, Prefix>,
  ) => VanityTokens<G, Prefix>
}

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

export type VanityTokens<T, Name extends string = 'vanity'> = VanityResolvedTokens & VanityTokenGroup<T, Name, ''>

/** The canonical token graph: independent traits and `$`-prefixed handle members. */
export type VanityCanonicalTokens<
  T,
  Name extends string = 'vanity',
  Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Conditions extends string = string,
  Aliases extends string = string,
> = VanityResolvedTokens & VanityCanonicalTokenGroup<T, Name, '', Policy, Conditions, Aliases>

type VanityTokenGroup<T, Name extends string, Path extends string> = {
  readonly [K in keyof T & string]: VanityTokenOf<T[K], `${Name}-${VanityKebab<K>}`, Path extends '' ? K : `${Path}.${K}`>
}

type VanityTokenOf<N, Name extends string, Path extends string>
  = N extends VanityDerived<infer R> ? VanityDerivedTokenOf<R, Name, Path>
    : N extends VanityContrast<infer G> ? VanityContrastToken<G, Name, Path>
      : N extends VanityColor<infer M> ? VanityColorToken<M, Name, Path>
        : N extends VanityCssValue<infer Css> ? VanityValueToken<Css, Name, 'static', Path>
          : N extends string | number ? VanityValueToken<N, Name, 'static', Path>
            : VanityTokenGroup<N, Name, Path>

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

type VanityDerivedTokenOf<R, Name extends string, Path extends string>
  = R extends VanityContrast<infer G> ? VanityContrastToken<G, Name, Path>
    : R extends VanityContrastToken<infer G, any, any> ? VanityContrastToken<G, Name, Path>
      : R extends VanityColor<any> | VanityColorTokenAny ? VanityColorToken<'derived', Name, Path>
        : R extends VanityValueToken<infer V, any, any, any> ? VanityValueToken<V, Name, 'derived', Path>
          : R extends VanityCssValue<infer Css> ? VanityValueToken<Css, Name, 'derived', Path>
            : R extends string | number ? VanityValueToken<R, Name, 'derived', Path>
              : never

// ─── Options ─────────────────────────────────────────────────────────────────

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

// ─── Build-time token override shapes ────────────────────────────────────────

/** Canonical `ds.tokenOverride()` accepts typed leaves from the bound graph. */
export type VanityTokenOverrides<T> = {
  [K in keyof T as K extends `$${string}` ? never : K]?: T[K] extends VanityTokenHandleAny
    ? VanityTokenFallback<T[K]['$type']>
    : T[K] extends object
      ? VanityTokenOverrides<T[K]>
      : never
}

/** Override shape used by the standalone characterization adapter. */
export type VanityThemeOverrides<T> = {
  [K in keyof T as K extends `$${string}` ? never : K]?: T[K] extends VanityColorToken<any, any> | VanityContrastToken<any, any>
    ? VanityColor<any> | string
    : T[K] extends VanityValueToken<any, any>
      ? string | number
      : VanityThemeOverrides<T[K]>
}

type VanityHasLive<N>
  = N extends VanityColorToken<infer M, any> ? (M extends 'live' ? true : false)
    : N extends VanityContrastToken<any, any> | VanityValueToken<any, any> ? false
      : N extends object ? (true extends VanityHasLive<N[Exclude<keyof N, `$${string}`>]> ? true : false)
        : false

/**
 * Runtime `applyTheme` accepts **live tokens only** — the graph's declared
 * runtime inputs. A static, scheme, or derived key is a type error at that
 * key, because writing it could not honestly work ([patterns.md §3]).
 */
export type VanityLiveOverrides<T> = {
  [K in keyof T as K extends `$${string}` ? never : VanityHasLive<T[K]> extends true ? K : never]?:
  T[K] extends VanityColorToken<'live', any> ? string : VanityLiveOverrides<T[K]>
}
