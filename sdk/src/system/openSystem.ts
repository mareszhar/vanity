/**
 * Public composition model: one immutable open system accumulates
 * shape and plugins; `consolidate()` returns an emission-free locked contract.
 */

import type {
  VanityClassEmitter,
  VanityFragmentFactory,
  VanityPropertyAliasClassEmitter,
  VanityPropertyAliasFragmentFactory,
  VanityPropertyAliasRulesEmitter,
  VanityRulesEmitter,
  VanityStrictPropertyAliasClassEmitter,
  VanityStrictPropertyAliasFragmentFactory,
  VanityStrictPropertyAliasRulesEmitter,
  VanityTokenDeclarations,
} from '../css/types'
import type {
  VanityEngine,
} from '../engine/createEngine'
import type { VanitySystemMember } from '../engine/reservations'
import type { VanityAuditConfig } from '../internal/inspect'
import type { VanityDtcgCodec } from '../internal/interchange'
import type { VanitySystemMapV1 } from '../introspect/system'
import type { VanityAliasesOf, VanityAliasExposureOf } from '../plugins/propertyAliases'
import type {
  VanityTdefFactory,
  VanityTokenTreeContext,
  VanityTokenTreeGraph,
  VanityTokenTreeInputGuard,
  VanityUnifiedTokenBuilder,
} from '../tokens/builder'
import type { check as tokenCheck } from '../tokens/checks'
import type { scale as tokenScale } from '../tokens/scale'
import type {
  VanityAdditiveGraph,
  VanityCanonicalTokens,
  VanityCompositionGuard,
  VanityConfiguredToken,
  VanityDefaultTokenPolicy,
  VanityDerivedResult,
  VanityLeafInput,
  VanityTokenConfig,
  VanityTokenHandleAny,
  VanityTokenModule,
  VanityTokenPolicy,
} from '../tokens/types'
import type { VanityCanonicalConstructors } from '../values/defaultEngine'
import type { VanityCssSupportTarget } from '../values/protocol'
import type { VanityCssDataType, VanitySelfValue, VanityTokenInput, VanityValue } from '../values/types'
import type { VanityLengthConstructor, VanityLengthUnit } from '../values/units'
import type {
  VanityAxisDefinition,
  VanityAxisDefinitions,
  VanityAxisModeInput,
  VanityAxisModeName,
  VanityAxisOrderGuard,
  VanityOpenAxisConfig,
  VanityOpenAxisModes,
} from './axes'
import type {
  VanityBaseConditionName,
  VanityConditionInput,
  VanityConditionKeyName,
} from './conditions'
import type { VanityOverwriteProvenance } from './contract'
import type {
  VanitySystem as VanityBoundSystem,
  VanityDefaultLayers,
  VanitySystemConditionName,
} from './createSystem'
import type {
  VanityAxisModuleInput,
  VanityConstructorDefinition,
  VanityConstructorFamily,
  VanityDefinitionKind,
  VanityDefinitionMerge,
  VanityDefinitionModule,
  VanityDefinitionModulesShape,
  VanitySystemRule,
  VanityUtilTree,
} from './modules'
import { getFileScope, hasFileScope } from '@vanilla-extract/css/fileScope'
import { deferredTokenDeclarations } from '../css/tdec'
import { diagnosticSource, VanityError } from '../diagnostics'
import {
  consolidateEngineSystem,
  createEngine,
  defineEnginePlugin,
  enginePrivate,
  overwriteEngineAxis,
  previewEngineTokens,
  updateEnginePolicies,
} from '../engine/createEngine'
import {
  assertSystemNamespaceAvailable,

} from '../engine/reservations'
import { withEmissionFileScope } from '../internal/fileScope'
import { record } from '../internal/inspect'
import { explainFromSystem } from '../introspect/explain'
import { introspectSystem } from '../introspect/system'
import {
  VANITY_PROPERTY_ALIASES,

} from '../plugins/propertyAliases'
import {
  createTdefFacade,
  defineSystemTokens,
  isUnifiedTokenBuilder,
  unwrapUnifiedTokenBuilder,
} from '../tokens/builder'
import {
  attachLogicalTokenDeclarationGetter,
  attachTokenDeclarationGetters,
} from '../tokens/declarations'
import { constructorUsagesOf, isTokenBuilder, patchTokenModule, tokenModulePaths } from '../tokens/graph'
import { defineCssOperation, defineCssValue } from '../values/extensions'
import { markConstructorUsage } from '../values/protocol'
import { axis as defineAxis, defineOpenAxis, isAxisDefinition } from './axes'
import { baseConditions, thisMode } from './conditions'
import { systemContractOf } from './contract'
import { VANITY_DEFAULT_LAYERS } from './createSystem'
import {
  defineAxes,
  defineConditions,
  defineConstructor,
  defineConstructors,
  defineConsts,
  definePolicies,
  defineRules,
  defineUtils,
  unwrapDefinitionInput,
} from './modules'

declare const VANITY_SYSTEM_ENVIRONMENT: unique symbol
declare const VANITY_OPEN_SYSTEM_SHAPE: unique symbol
declare const VANITY_SYSTEM_RULES_SHAPE: unique symbol
export interface VanityPluginRequirements {
  readonly tokens?: object
  readonly axes?: Readonly<Record<string, readonly string[]>>
  readonly conditions?: object
  readonly consts?: object
  readonly utils?: string
  readonly rules?: string
  readonly plugins?: string
  readonly constructors?: object
  readonly policies?: string
}

export interface VanityConstructorRestriction<
  Level extends 'forbid' | 'discourage' = 'forbid' | 'discourage',
  Use extends string | undefined = string | undefined,
  Reason extends string | undefined = string | undefined,
  Enforce extends 'prospective' | 'retroactive' = 'prospective' | 'retroactive',
> {
  readonly level: Level
  readonly use?: Use
  readonly reason?: Reason
  readonly enforce?: Enforce
}

export interface VanityConstructorPolicy {
  /** Host unit for portable/bound bare length values; explicit units ignore it. */
  readonly unitless?: VanityLengthUnit
  /** Diagnostic/enforcement metadata; restriction never removes callable shape. */
  readonly restrict?: VanityConstructorRestriction
  readonly description?: string
}

export type VanityConstructorPolicies = {
  readonly [Name in keyof VanityCanonicalConstructors]?: VanityConstructorPolicy
} & Readonly<Record<string, VanityConstructorPolicy>>

/** The namespaced, immutable system policy book. */
export interface VanityPolicies {
  /** Open family for built-in, user, and plugin constructor policies. */
  readonly constructors?: VanityConstructorPolicies
  /** Native CSS feature target used for preservation/fallback diagnostics. */
  readonly support?: VanityCssSupportTarget
  /** The system's ordered cascade-layer policy. */
  readonly layerOrder?: readonly string[]
  /** Default token reference strategy. */
  readonly reference?: 'val' | 'var'
  /** Validation severity for author-controlled checks. */
  readonly validation?: 'strict' | 'warn' | 'off'
  /** Plugin-owned, auto-scoped readable policy data. */
  readonly plugins?: Readonly<Record<string, unknown>>
}

type RestrictionOf<Policies, Name extends PropertyKey>
  = Policies extends { readonly constructors?: infer Constructors }
    ? Name extends keyof Constructors
      ? Constructors[Name] extends { readonly restrict?: infer Restriction } ? Restriction : never
      : never
    : never

type ForbiddenArguments<Args extends readonly unknown[], Name extends PropertyKey, Restriction>
  = Args & {
    readonly [Message in
      `Constructor '${Extract<Name, string>}' is forbidden${Restriction extends { readonly use: infer Use extends string } ? `; use '${Use}'` : ''}`
    ]: never
  }

interface DiscouragedCall<Args extends readonly unknown[], Result> {
  /** @deprecated This constructor is discouraged by the bound system policy. */
  (...args: Args): Result
}

type ProjectConstructorMembers<Constructor, Restriction> = {
  readonly [Member in keyof Constructor]: ProjectRestrictedConstructor<Constructor[Member], Member, Restriction>
}

type ProjectDiscouragedConstructor<Constructor, Restriction> = Constructor extends (...args: infer Args) => infer Result
  ? DiscouragedCall<Args, Result> & ProjectConstructorMembers<Constructor, Restriction>
  : Constructor

type ProjectRestrictedConstructor<Constructor, Name extends PropertyKey, Restriction>
  = [Restriction] extends [never] ? Constructor
    : Restriction extends { readonly level: 'forbid' }
      ? Constructor extends (...args: infer Args) => infer Result
        ? ((...args: ForbiddenArguments<Args, Name, Restriction>) => Result) & {
          readonly [Member in keyof Constructor]: ProjectRestrictedConstructor<Constructor[Member], Member, Restriction>
        }
        : Constructor
      : Restriction extends { readonly level: 'discourage' }
        ? ProjectDiscouragedConstructor<Constructor, Restriction>
        : Constructor

type ConfiguredLengthUnit<Policies, Fallback extends VanityLengthUnit>
  = Policies extends {
    readonly constructors?: {
      readonly length?: { readonly unitless?: infer Unit extends VanityLengthUnit }
    }
  } ? Unit : Fallback

type CurrentLengthUnit<Constructors>
  = Constructors extends { readonly length: VanityLengthConstructor<infer Unit> } ? Unit : 'px'

type ProjectConstructors<Constructors extends object, Policies>
  = {
    readonly [Name in keyof Constructors]: Name extends 'length'
      ? ProjectRestrictedConstructor<
        VanityLengthConstructor<ConfiguredLengthUnit<Policies, CurrentLengthUnit<Constructors>>>,
        Name,
        RestrictionOf<Policies, Name>
      >
      : ProjectRestrictedConstructor<Constructors[Name], Name, RestrictionOf<Policies, Name>>
  }

type ProjectTokenPolicy<Policy extends VanityTokenPolicy, Policies>
  = VanityTokenPolicy<
    Policies extends { readonly reference?: infer Reference extends 'val' | 'var' }
      ? Reference
      : Policy['reference'],
    Policy['emit']
  >

type ProjectEnvironment<Engine, Policies>
  = VanityDefinitionMerge<
    'policies',
    EnginePolicies<Engine>,
    Policies extends object ? Policies : Record<never, never>
  > extends infer MergedPolicies
    ? VanitySystemEnvironment<
      ProjectConstructors<EngineConstructors<Engine>, MergedPolicies>,
      ProjectTokenPolicy<EnginePolicy<Engine>, MergedPolicies>,
      EngineAxes<Engine>,
      EngineRequirements<Engine>,
    MergedPolicies & object
    >
    : never

/**
 * Public type-only description of an open system's accumulated vocabulary.
 * It keeps consumer declaration emit independent from the removed engine
 * implementation while preserving exact constructors, token policy, and axes.
 */
export interface VanitySystemEnvironment<
  Constructors extends object = VanityCanonicalConstructors<'px'>,
  Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Axes extends VanityAxisDefinitions = Record<never, never>,
  Requirements extends VanityPluginRequirements = Record<never, never>,
  Policies extends object = Record<never, never>,
> {
  readonly [VANITY_SYSTEM_ENVIRONMENT]?: {
    readonly constructors: Constructors
    readonly policy: Policy
    readonly axes: Axes
    readonly requirements: Requirements
    readonly policies: Policies
  }
}

type EngineConstructors<Engine> = Engine extends VanitySystemEnvironment<infer Constructors, any, any, any> ? Constructors : never
type EnginePolicy<Engine> = Engine extends VanitySystemEnvironment<any, infer Policy, any, any> ? Policy : VanityDefaultTokenPolicy
type EngineAxes<Engine> = Engine extends VanitySystemEnvironment<any, any, infer Axes, any> ? Axes : Record<never, never>
type EngineRequirements<Engine> = Engine extends VanitySystemEnvironment<any, any, any, infer Requirements> ? Requirements : Record<never, never>
type EnginePolicies<Engine> = Engine extends VanitySystemEnvironment<any, any, any, any, infer Policies> ? Policies : Record<never, never>
type WithRequirements<Engine, Added extends VanityPluginRequirements>
  = VanitySystemEnvironment<
    EngineConstructors<Engine>,
    EnginePolicy<Engine>,
    EngineAxes<Engine>,
    EngineRequirements<Engine> & Added,
    EnginePolicies<Engine>
  >

interface TokenExpectationLeaf {
  readonly type?: VanityCssDataType
  readonly mutable?: boolean
  readonly reference?: 'val' | 'var'
  readonly emit?: boolean
}
type HasTokenExpectationTrait<Shape>
  = Shape extends
  | { readonly type: VanityCssDataType }
  | { readonly mutable: boolean }
  | { readonly reference: 'val' | 'var' }
  | { readonly emit: boolean }
    ? true
    : false

type ExpectationGraph<Shape>
  = Shape extends true ? unknown
    : HasTokenExpectationTrait<Shape> extends true
      ? VanityConfiguredToken<
        { readonly val: string } & (Shape extends { readonly mutable: infer Mutable } ? { readonly mutable: Mutable } : object),
        Shape extends { readonly type: infer Type extends VanityCssDataType } ? Type : 'unknown'
      >
      : Shape extends object ? { readonly [Key in keyof Shape]: ExpectationGraph<Shape[Key]> } : never

type ExistenceGraph<Shape, Leaf> = Shape extends true ? Leaf
  : Shape extends object ? { readonly [Key in keyof Shape]: ExistenceGraph<Shape[Key], Leaf> }
    : Leaf

type EveryTrue<Values> = Exclude<Values, true> extends never ? true : false

type DeepPaths<Tree extends object> = {
  [Key in keyof Tree & string]:
  Tree[Key] extends (...args: any[]) => unknown ? Key
    : Tree[Key] extends object ? `${Key}.${DeepPaths<Tree[Key]>}` : never
}[keyof Tree & string]

type PathTree<Path extends string, Leaf>
  = Path extends `${infer Head}.${infer Tail}`
    ? Readonly<Record<Head, PathTree<Tail, Leaf>>>
    : Readonly<Record<Path, Leaf>>

type UnionToIntersection<Union>
  = (Union extends unknown ? (value: Union) => void : never) extends
  (value: infer Intersection) => void ? Intersection : never

type TokenTraitSatisfied<Actual extends VanityTokenHandleAny, Requirement extends TokenExpectationLeaf>
  = EveryTrue<{
    [Key in keyof Requirement]-?:
    Key extends 'type' ? Actual['$type'] extends Requirement[Key] ? true : false
      : Key extends 'mutable' ? Actual['$mutable'] extends Requirement[Key] ? true : false
        : Key extends 'reference' ? Actual['$reference'] extends Requirement[Key] ? true : false
          : Key extends 'emit' ? Actual['$emit'] extends Requirement[Key] ? true : false
            : false
  }[keyof Requirement]>

type TokenRequirementSatisfied<Actual, Requirement>
  = Requirement extends true ? true
    : HasTokenExpectationTrait<Requirement> extends true
      ? Actual extends VanityTokenHandleAny ? TokenTraitSatisfied<Actual, Requirement & TokenExpectationLeaf> : false
      : Requirement extends object
        ? EveryTrue<{
          [Key in keyof Requirement]: Key extends keyof Actual
            ? TokenRequirementSatisfied<Actual[Key], Requirement[Key]>
            : false
        }[keyof Requirement]>
        : false

type AxisRequirementSatisfied<Axes extends VanityAxisDefinitions, Requirement>
  = Requirement extends Readonly<Record<string, readonly string[]>>
    ? EveryTrue<{
      [Name in keyof Requirement]: Name extends keyof Axes
        ? Exclude<Requirement[Name][number], AxisModeNames<Axes[Name]>> extends never ? true : false
        : false
    }[keyof Requirement]>
    : true

type PluginRequirementSatisfied<
  Engine,
  Tokens extends object,
  Conditions extends object,
  Consts extends object,
  Utils extends object,
  Plugins extends string,
  Requirement extends VanityPluginRequirements,
> = EveryTrue<
  | (Requirement extends { readonly tokens: infer RequiredTokens }
    ? TokenRequirementSatisfied<ResolvedTokens<Tokens, 'vanity-open', EnginePolicy<Engine>>, RequiredTokens>
    : true)
  | (Requirement extends { readonly axes: infer RequiredAxes }
    ? AxisRequirementSatisfied<EngineAxes<Engine>, RequiredAxes>
    : true)
  | (Requirement extends { readonly conditions: infer RequiredConditions }
    ? RecursiveRequirementSatisfied<Conditions, RequiredConditions>
    : true)
  | (Requirement extends { readonly consts: infer RequiredConsts }
    ? RecursiveRequirementSatisfied<PublicConsts<Consts>, RequiredConsts>
    : true)
  | (Requirement extends { readonly utils: infer RequiredUtil }
    ? RequiredUtil extends DeepPaths<Utils> ? true : false
    : true)
  | (Requirement extends { readonly rules: infer RequiredRule }
    ? RequiredRule extends keyof RulesOf<Consts> ? true : false
    : true)
  | (Requirement extends { readonly plugins: infer RequiredPlugin }
    ? RequiredPlugin extends Plugins ? true : false
    : true)
  | (Requirement extends { readonly constructors: infer RequiredConstructors }
    ? Exclude<keyof RequiredConstructors, keyof EngineConstructors<Engine>> extends never ? true : false
    : true)
  | (Requirement extends { readonly policies: infer RequiredPolicy }
    ? RequiredPolicy extends keyof EnginePolicies<Engine> ? true : false
    : true)
>

type PluginRequirementGuard<
  Engine,
  Tokens extends object,
  Conditions extends object,
  Consts extends object,
  Utils extends object,
  Plugins extends string,
  Plugin,
>
  = PluginRequirementSatisfied<
    Engine,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins,
    EngineRequirements<PluginEngine<Plugin>>
  > extends true
    ? unknown
    : { readonly __vanityPluginRequirementsNotMet: never }

type PluginConfigurationGuard<Plugin>
  = Plugin extends {
    readonly __vanityPluginConfigured?: infer Configured
    readonly __vanityPluginNeedsOptions?: infer NeedsOptions
  }
    ? NeedsOptions extends true
      ? Configured extends true ? unknown
        : { readonly __vanityPluginOptionsMustBeConfigured: never }
      : unknown
    : unknown

type PluginResult<Plugin> = Plugin extends { readonly setup: (...args: any[]) => infer Result } ? Result : never
type OpenShape<System> = System extends { readonly [VANITY_OPEN_SYSTEM_SHAPE]?: infer Shape } ? NonNullable<Shape> : never
type EmptyPluginEnvironment = VanitySystemEnvironment<Record<never, never>, VanityDefaultTokenPolicy, Record<never, never>>
type PluginEngine<Plugin> = [OpenShape<PluginResult<Plugin>>] extends [never]
  ? EmptyPluginEnvironment
  : OpenShape<PluginResult<Plugin>> extends { readonly engine: infer Engine } ? Engine : EmptyPluginEnvironment
type PluginConstructors<Plugin>
  = Plugin extends { readonly __vanityPluginConstructors?: infer Constructors extends object }
    ? Constructors
    : EngineConstructors<PluginEngine<Plugin>>
type PluginAxes<Plugin>
  = Plugin extends { readonly __vanityPluginAxes?: infer Axes extends VanityAxisDefinitions }
    ? Axes
    : EngineAxes<PluginEngine<Plugin>>
type PluginTokens<Plugin> = Plugin extends { readonly __vanityPluginTokens?: infer Tokens extends object }
  ? Tokens
  : OpenShape<PluginResult<Plugin>> extends { readonly tokens: infer Tokens extends object } ? Tokens : object
type PluginConditions<Plugin> = Plugin extends { readonly __vanityPluginConditions?: infer Conditions extends object }
  ? Conditions
  : OpenShape<PluginResult<Plugin>> extends { readonly conditions: infer Conditions extends object } ? Conditions : object
type PluginConsts<Plugin> = Plugin extends { readonly __vanityPluginConsts?: infer Consts extends object }
  ? Consts
  : OpenShape<PluginResult<Plugin>> extends { readonly consts: infer Consts extends object } ? Consts : object
type PluginRules<Plugin> = Plugin extends { readonly __vanityPluginRules?: infer Rules extends object }
  ? Rules
  : OpenShape<PluginResult<Plugin>> extends { readonly consts: infer Consts extends object }
    ? RulesOf<Consts>
    : object
type PluginConstsAndRules<Plugin>
  = WithRules<PluginConsts<Plugin>, RulesOf<PluginConsts<Plugin>> & PluginRules<Plugin>>
type PluginUtils<Plugin> = Plugin extends { readonly __vanityPluginUtils?: infer Utils extends object }
  ? Utils
  : OpenShape<PluginResult<Plugin>> extends { readonly utils: infer Utils extends object } ? Utils : object
type PluginRegisteredPolicy<Plugin>
  = PluginResult<Plugin> extends { readonly __vanityRegisteredPluginPolicy?: infer Policy extends object }
    ? Policy
    : never
type PluginPolicyBook<Plugin>
  = [PluginRegisteredPolicy<Plugin>] extends [never] ? EnginePolicies<PluginEngine<Plugin>>
    : Plugin extends { readonly id: infer Id extends string }
      ? { readonly plugins: Readonly<Record<Id, PluginRegisteredPolicy<Plugin>>> }
      : Record<never, never>
type MountedPluginPolicies<Engine, Plugin>
  = VanityDefinitionMerge<'policies', EnginePolicies<Engine>, PluginPolicyBook<Plugin>>

interface VanitySystemPluginShape {
  readonly id: string
  readonly version: string | number
  readonly fingerprint?: string
  readonly options?: unknown
  readonly setup: (...args: any[]) => object
  readonly dtcg?: readonly unknown[]
}

const VANITY_OPEN_SYSTEM_ENGINE = Symbol.for('vanity.openSystem.engine')
const VANITY_OPEN_SYSTEM_STATE = Symbol.for('vanity.openSystem.state')
const VANITY_SYSTEM_PLUGIN = Symbol.for('vanity.systemPlugin')

type GraphOf<Input>
  = Input extends import('../tokens/types').VanityTokenDefinition<infer Graph extends object, any> ? Graph
    : Input extends VanityTokenTreeContext<any> ? VanityTokenTreeGraph<Input>
      : never

type GraphsOfInputs<
  Inputs extends readonly unknown[],
  Result extends object = Record<never, never>,
> = Inputs extends readonly [infer Head, ...infer Tail]
  ? GraphsOfInputs<Tail, VanityAdditiveGraph<Result, GraphOf<Head>>>
  : Result

type DefinitionShape<
  Kind extends VanityDefinitionKind,
  Input,
> = Input extends VanityDefinitionModule<Kind, infer Shape> ? Shape
  : Input extends readonly VanityDefinitionModule<Kind, any>[]
    ? VanityDefinitionModulesShape<Kind, Input>
    : Input extends object ? Input
      : never

type RulesOf<Consts extends object>
  = Consts extends { readonly [VANITY_SYSTEM_RULES_SHAPE]?: infer Rules extends object }
    ? Rules
    : Record<never, never>

type WithRules<Consts extends object, Rules extends object>
  = Consts & { readonly [VANITY_SYSTEM_RULES_SHAPE]?: Rules }

type PublicConsts<Consts extends object> = Omit<Consts, typeof VANITY_SYSTEM_RULES_SHAPE>

type ConstructorFamilies<Definitions extends object> = {
  readonly [Name in keyof Definitions]:
  Definitions[Name] extends VanityConstructorDefinition
    ? VanityConstructorFamily<Definitions[Name]>
    : never
}

type RecursiveRequirementSatisfied<Actual, Requirement>
  = Requirement extends true ? true
    : Requirement extends object ? EveryTrue<{
      [Key in keyof Requirement]: Key extends keyof Actual
        ? RecursiveRequirementSatisfied<Actual[Key], Requirement[Key]>
        : false
    }[keyof Requirement]>
      : true

type AdditiveRecordGuard<Current extends object, Added extends object> = {
  readonly [Key in keyof Added & keyof Current]: never
}

type RecursiveUtilityGuard<Current, Added>
  = Added extends (...args: any[]) => unknown
    ? Current extends undefined ? Added : never
    : Added extends object
      ? Current extends (...args: any[]) => unknown ? never
        : Current extends object ? {
          readonly [Key in keyof Added]:
          Key extends keyof Current ? RecursiveUtilityGuard<Current[Key], Added[Key]> : Added[Key]
        }
          : Added
      : never

type VanityOpenRegistrationMember
  = | VanitySystemMember
    | 'defineTokens'
    | 'defineAxes'
    | 'defineConditions'
    | 'defineConsts'
    | 'defineUtils'
    | 'defineRules'
    | 'defineConstructors'
    | 'tdef'
    | 'addToken'
    | 'addTokens'
    | 'augmentToken'
    | 'augmentTokens'
    | 'overwriteToken'
    | 'overwriteTokens'
    | 'addCondition'
    | 'addConditions'
    | 'overwriteCondition'
    | 'overwriteConditions'
    | 'addAxis'
    | 'addAxes'
    | 'overwriteAxis'
    | 'overwriteAxes'
    | 'augmentAxis'
    | 'augmentAxes'
    | 'addConst'
    | 'addConsts'
    | 'overwriteConst'
    | 'overwriteConsts'
    | 'addUtil'
    | 'addUtils'
    | 'defineConstructor'
    | 'addConstructor'
    | 'addConstructors'
    | 'addRule'
    | 'addRules'
    | 'overwriteRule'
    | 'overwriteRules'
    | 'addPlugin'
    | 'expectTokens'
    | 'expectToken'
    | 'expectAxis'
    | 'expectAxes'
    | 'expectCondition'
    | 'expectConditions'
    | 'expectConst'
    | 'expectConsts'
    | 'expectUtil'
    | 'expectUtils'
    | 'expectRule'
    | 'expectRules'
    | 'expectConstructors'
    | 'expectPlugin'
    | 'expectConstructor'
    | 'consolidate'
    | 'axes'
    | 'consts'

type OpenNamespace<Engine, Utils extends object>
  = EngineConstructors<Engine>
    & Utils
    & Record<VanityOpenRegistrationMember, unknown>

type ExistingRecordGuard<Current extends object, Patch extends object>
  = Record<Exclude<keyof Patch, keyof Current>, never>

type JsonConst<Value>
  = Value extends string | number | boolean | null ? Value
    : Value extends readonly unknown[] ? { readonly [Index in keyof Value]: JsonConst<Value[Index]> }
      : Value extends (...args: any[]) => unknown ? never
        : Value extends object ? { readonly [Key in keyof Value]: JsonConst<Value[Key]> }
          : never

type AxisModeNames<Axis>
  = Axis extends VanityAxisDefinition<infer Modes, any> ? keyof Modes : never

type TokenPatchTarget<Axes extends VanityAxisDefinitions> = {
  readonly val: <const Value extends VanityDerivedResult>(value: Value) => VanityConfiguredToken
} & {
  readonly [Axis in keyof Axes & string]: {
    <const Values extends Partial<Record<VanityAxisModeName<Axes[Axis]>, VanityDerivedResult | null>>>(
      values: Values,
    ): VanityConfiguredToken
    <const Value extends VanityDerivedResult>(
      values: (mode: VanityAxisModeName<Axes[Axis]>) => Value | null,
    ): VanityConfiguredToken
  }
}

type TokenPatch<T, Axes extends VanityAxisDefinitions>
  = T extends VanityTokenHandleAny
    ? | VanityLeafInput
    | VanityDerivedResult
    | VanityTokenConfig
    | ((token: TokenPatchTarget<Axes>) => VanityConfiguredToken)
    : T extends object ? {
      readonly [Key in keyof T as Key extends `$${string}` ? never : Key]?: TokenPatch<T[Key], Axes>
    }
      : never

type ResolvedTokens<
  Tokens extends object,
  Prefix extends string,
  Policy extends VanityTokenPolicy,
  Conditions extends string = string,
  Aliases extends string = string,
> = keyof Tokens extends never
  ? Record<never, never>
  : VanityCanonicalTokens<Tokens, Prefix, Policy, Conditions, Aliases>

type ResolvedTokenAt<
  Tokens extends object,
  Name extends keyof Tokens,
  Policy extends VanityTokenPolicy,
> = Name extends keyof ResolvedTokens<Tokens, 'vanity-open', Policy>
  ? ResolvedTokens<Tokens, 'vanity-open', Policy>[Name]
  : never

export type VanityLogicalTokenHandle<Handle extends VanityTokenHandleAny>
  = Readonly<Pick<
    Handle,
    '$var' | '$path' | '$type' | '$reference' | '$emit' | '$mutable' | '$description' | '$deprecated' | '$metadata' | 'toString'
  >>
  & VanityTokenInput<Handle['$type']>
  & { readonly $phase: 'logical' }

export type VanityLogicalTokens<T> = {
  readonly [Key in keyof T]: T[Key] extends VanityTokenHandleAny
    ? VanityLogicalTokenHandle<T[Key]>
    : T[Key] extends object ? VanityLogicalTokens<T[Key]> : T[Key]
}

export interface VanityConsolidateOptions<
  Layers extends readonly string[] = VanityDefaultLayers,
  Prefix extends string = 'vanity',
  BaseConditions extends boolean = true,
> {
  readonly prefix?: Prefix
  readonly root?: string
  readonly layerOrder?: Layers
  readonly tokenLayer?: Layers[number]
  readonly baseConditions?: BaseConditions
  readonly axisOrder?: readonly string[]
  readonly audit?: VanityAuditConfig
}

type OpenAxisDefault<Input, Modes> = Input extends { readonly default: infer Default extends keyof Modes & string }
  ? { readonly defaultMode: Default }
  : object

type OpenAxisConfigDefinition<Input, Modes extends Readonly<Record<string, unknown>>>
  = VanityAxisDefinition<VanityOpenAxisModes<Modes>>
    & OpenAxisDefault<Input, Modes>
    & (Input extends { readonly control: infer Control } ? { readonly control: Control } : object)

type OpenAxisDefinition<Input>
  = Input extends VanityAxisDefinition<any, any> ? Input
    : Input extends readonly [string, ...string[]]
      ? VanityAxisDefinition<Record<Input[number], VanityAxisModeInput>>
      : Input extends { readonly modes: infer Modes extends Readonly<Record<string, unknown>> }
        ? OpenAxisConfigDefinition<Input, Modes>
        : never

type OpenAxisRecord<Added extends object> = {
  readonly [Name in keyof Added]: OpenAxisDefinition<Added[Name]>
}

export interface VanityAxisPatch {
  readonly modes?: Readonly<Record<string, VanityConditionInput | import('./axes').VanityAxisTrigger>>
  readonly default?: string
  readonly modeOrder?: readonly string[]
  readonly derive?: Readonly<Record<string, (modes: Readonly<Record<string, any>>) => unknown>>
  readonly control?: import('./axes').VanityAxisControl<any>
  readonly native?: import('./axes').VanityNativeSchemePolicy
  readonly description?: string
}

type PatchModes<Axis, Patch>
  = Axis extends VanityAxisDefinition<infer Modes, any>
    ? Patch extends {
      readonly modes: infer Added extends Readonly<
        Record<string, VanityConditionInput | import('./axes').VanityAxisTrigger>
      >
    }
      ? Modes & VanityOpenAxisModes<Added>
      : Modes
    : Record<never, never>

type PatchDerive<Axis, Patch>
  = Axis extends VanityAxisDefinition<any, infer Derive>
    ? Patch extends { readonly derive: infer Added extends object } ? Derive & Added : Derive
    : Record<never, never>

type PatchedAxis<Axis, Patch>
  = VanityAxisDefinition<PatchModes<Axis, Patch>, PatchDerive<Axis, Patch>>

type PatchedAxes<Axes extends VanityAxisDefinitions, Patch extends object> = {
  readonly [Name in keyof Axes]:
  Name extends keyof Patch ? PatchedAxis<Axes[Name], Patch[Name]> : Axes[Name]
}

/**
 * The consolidated read surface: resolved tokens, styling, runtime, and inspection.
 *
 * @example
 * `type DesignSystem = ReturnType<typeof open.consolidate>`
 */
export type VanityLockedSystem<
  Engine extends VanitySystemEnvironment<any, any, any> = VanitySystemEnvironment,
  Tokens extends object = Record<never, never>,
  Conditions extends Record<string, VanityConditionInput> = Record<never, never>,
  Consts extends object = Record<never, never>,
  Utils extends object = Record<never, never>,
  Layers extends readonly string[] = VanityDefaultLayers,
  Prefix extends string = 'vanity',
  BaseConditions extends boolean = true,
> = Omit<VanityBoundSystem<
  ResolvedTokens<
    Tokens,
    Prefix,
    EnginePolicy<Engine>,
    VanityConditionKeyName<VanitySystemConditionName<Conditions, BaseConditions>>,
    keyof VanityAliasesOf<Consts> & string
  >,
  VanitySystemConditionName<Conditions, BaseConditions>,
  Layers[number],
  EngineConstructors<Engine>,
  EngineAxes<Engine>
>, 'class' | 'css' | 'explain' | 'fragment' | 'globalCss' | 'rules' | 'tokenOverride' | 'inLayer'> & Readonly<Utils> & {
  readonly class: LockedClassEmitter<
    VanitySystemConditionName<Conditions, BaseConditions>,
    Layers[number],
    PublicConsts<Consts>
  >
  readonly fragment: LockedFragmentFactory<
    VanitySystemConditionName<Conditions, BaseConditions>,
    Layers[number],
    PublicConsts<Consts>
  >
  readonly rules: LockedRulesEmitter<
    VanitySystemConditionName<Conditions, BaseConditions>,
    Layers[number],
    PublicConsts<Consts>
  >
  readonly inLayer: <Layer extends Layers[number]>(
    name: Layer,
  ) => VanityLockedSystem<Engine, Tokens, Conditions, Consts, Utils, Layers, Prefix, BaseConditions>
  readonly consts: Readonly<PublicConsts<Consts>>
  readonly policies: Readonly<VanityPolicies & EnginePolicies<Engine>>
  /** Semantic axis handles; pass one directly to `explain()`. */
  readonly axes: Readonly<{
    [Name in keyof EngineAxes<Engine> & string]: VanitySystemMapV1['axes'][string]
  }>
  readonly explain: <Subject>(
    subject: Subject,
  ) => import('../introspect/explain').VanityExplanationFor<Subject>
  /** Canonical, versioned semantic map available to tools and configuration. */
  readonly introspect: () => VanitySystemMapV1
}

/**
 * The compact locked empty-system baseline. Every consolidated system is
 * assignable to it by width subtyping.
 */
export type VanitySystem = Omit<VanityLockedSystem<
  VanitySystemEnvironment<VanityCanonicalConstructors<VanityLengthUnit>>,
  Record<never, never>,
  Record<never, never>,
  Record<never, never>,
  Record<never, never>,
  readonly never[],
  'vanity',
  false
>, 'inLayer' | 'layers'>

type LockedClassEmitter<C extends string, L extends string, Consts extends object>
  = typeof import('../plugins/propertyAliases').VANITY_PROPERTY_ALIASES extends keyof Consts
    ? VanityAliasExposureOf<Consts> extends 'aliases-only'
      ? VanityStrictPropertyAliasClassEmitter<C, L, VanityAliasesOf<Consts>>
      : VanityPropertyAliasClassEmitter<C, L, VanityAliasesOf<Consts>>
    : VanityClassEmitter<C, L>

type LockedFragmentFactory<C extends string, L extends string, Consts extends object>
  = typeof import('../plugins/propertyAliases').VANITY_PROPERTY_ALIASES extends keyof Consts
    ? VanityAliasExposureOf<Consts> extends 'aliases-only'
      ? VanityStrictPropertyAliasFragmentFactory<C, L, VanityAliasesOf<Consts>>
      : VanityPropertyAliasFragmentFactory<C, L, VanityAliasesOf<Consts>>
    : VanityFragmentFactory<C>

type LockedRulesEmitter<C extends string, L extends string, Consts extends object>
  = typeof import('../plugins/propertyAliases').VANITY_PROPERTY_ALIASES extends keyof Consts
    ? VanityAliasExposureOf<Consts> extends 'aliases-only'
      ? VanityStrictPropertyAliasRulesEmitter<C, L, VanityAliasesOf<Consts>>
      : VanityPropertyAliasRulesEmitter<C, L, VanityAliasesOf<Consts>>
    : VanityRulesEmitter<C, L>

/** Definition input for one reusable system contribution. */
export interface VanityPluginDefinition<
  Options,
  Result extends object,
  Id extends string = string,
> {
  readonly id: Id
  readonly version: string | number
  readonly fingerprint?: string
  readonly dtcg?: readonly VanityDtcgCodec[]
  /** Project rich options onto deterministic JSON identity. */
  readonly optionsIdentity?: (options: Options) => unknown
  readonly setup: (system: VanityPluginSetupSystem, options: Options) => Result
}

type VanityPluginConfigure<
  Options = undefined,
  Result extends object = object,
  Id extends string = string,
> = undefined extends Options
  ? (options?: Exclude<Options, undefined>) => VanitySystemPlugin<Options, Result, Id, true>
  : (options: Options) => VanitySystemPlugin<Options, Result, Id, true>

/** Callable unconfigured plugin and the configured immutable copies it makes. */
export type VanitySystemPlugin<
  Options = undefined,
  Result extends object = object,
  Id extends string = string,
  Configured extends boolean = false,
> = VanityPluginDefinition<Options, Result, Id>
  & VanityPluginConfigure<Options, Result, Id>
  & {
    readonly options: Configured extends true ? Exclude<Options, undefined> : undefined
    /** @internal */
    readonly __vanityPluginConfigured?: Configured
    /** @internal */
    readonly __vanityPluginNeedsOptions?: undefined extends Options ? false : true
  }

export interface VanityOpenSystemMethods<
  Engine extends VanitySystemEnvironment<any, any, any>,
  Tokens extends object,
  Conditions extends Record<string, VanityConditionInput>,
  Consts extends object,
  Utils extends object,
  Plugins extends string,
> {
  readonly t: VanityLogicalTokens<ResolvedTokens<
    Tokens,
    'vanity-open',
    EnginePolicy<Engine>,
    keyof Conditions & string | VanityBaseConditionName,
    keyof VanityAliasesOf<Consts> & string
  >>
  readonly conditions: Readonly<Conditions>
  readonly axes: Readonly<EngineAxes<Engine>>
  readonly consts: Readonly<PublicConsts<Consts>>
  readonly policies: Readonly<VanityPolicies & EnginePolicies<Engine>>

  readonly definePolicies: typeof definePolicies
  readonly addPolicy: <const Name extends keyof VanityPolicies & string, const Value extends NonNullable<VanityPolicies[Name]>>(
    name: Name,
    value: Value | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Value),
  ) => VanityOpenSystem<ProjectEnvironment<Engine, Record<Name, Value>>, Tokens, Conditions, Consts, Utils, Plugins>
  readonly addPolicies: {
    <const Added extends VanityPolicies>(
      policies: Added | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Added),
    ): VanityOpenSystem<ProjectEnvironment<Engine, Added>, Tokens, Conditions, Consts, Utils, Plugins>
    <const Input extends VanityDefinitionModule<'policies', any> | readonly VanityDefinitionModule<'policies', any>[]>(
      policies: Input,
    ): VanityOpenSystem<
      ProjectEnvironment<Engine, DefinitionShape<'policies', Input>>,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
  }
  readonly overwritePolicy: <const Name extends keyof VanityPolicies & string, const Value extends NonNullable<VanityPolicies[Name]>>(
    name: Name,
    value: Value | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Value),
  ) => VanityOpenSystem<ProjectEnvironment<Engine, Record<Name, Value>>, Tokens, Conditions, Consts, Utils, Plugins>
  readonly overwritePolicies: {
    <const Patch extends VanityPolicies>(
      policies: Patch | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
    ): VanityOpenSystem<ProjectEnvironment<Engine, Patch>, Tokens, Conditions, Consts, Utils, Plugins>
    <const Input extends VanityDefinitionModule<'policies', any> | readonly VanityDefinitionModule<'policies', any>[]>(
      policies: Input,
    ): VanityOpenSystem<
      ProjectEnvironment<Engine, DefinitionShape<'policies', Input>>,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
  }
  readonly expectPolicy: <const Name extends keyof VanityPolicies & string>(
    name: Name,
  ) => VanityOpenSystem<WithRequirements<Engine, { readonly policies: Name }>, Tokens, Conditions, Consts, Utils, Plugins>
  readonly expectPolicies: <const Names extends readonly (keyof VanityPolicies & string)[]>(
    names: Names,
  ) => VanityOpenSystem<WithRequirements<Engine, { readonly policies: Names[number] }>, Tokens, Conditions, Consts, Utils, Plugins>

  readonly defineTokens: <
    const Seed extends VanityTokenTreeContext<EngineAxes<Engine>> = Record<never, never>,
  >(
    seed?: Seed
      & VanityTokenTreeContext<EngineAxes<Engine>>
      & VanityTokenTreeInputGuard<Seed, EngineAxes<Engine>>,
  ) => VanityUnifiedTokenBuilder<
    VanityTokenTreeGraph<Seed>,
    EnginePolicy<Engine>,
    EngineAxes<Engine>
  >
  /**
   * Define advanced token traits or a typed reservation before consolidation.
   *
   * @example
   * `brand: open.tdef.color({ val: '#635bff', mutable: true })`
   */
  readonly tdef: VanityTdefFactory<EngineAxes<Engine>>
  /**
   * Produce CSS declaration data over logical tokens; this never mutates runtime state.
   *
   * @example
   * `ds.class({ ...ds.tdec({ color: { brand: 'rebeccapurple' } }) })`
   */
  readonly tdec: (
    declarations: VanityTokenDeclarations<ResolvedTokens<Tokens, 'vanity-open', EnginePolicy<Engine>>>,
  ) => Record<`--${string}`, string | number>
  readonly serialize: <Type extends VanityCssDataType>(value: VanitySelfValue<Type>) => string
  readonly defineCssValue: typeof defineCssValue
  readonly defineCssOperation: typeof defineCssOperation
  readonly check: typeof tokenCheck
  readonly scale: typeof tokenScale

  readonly addTokens: {
    <const Inputs extends readonly (
      VanityTokenModule<any, any> | VanityUnifiedTokenBuilder<any, any, any>
    )[]>(
      inputs: Inputs,
    ): VanityOpenSystem<
      Engine,
      VanityAdditiveGraph<Tokens, GraphsOfInputs<Inputs>>,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Input extends VanityTokenModule<any, any> | VanityUnifiedTokenBuilder<any, any, any> | VanityTokenTreeContext<EngineAxes<Engine>>>(
      input: Input & VanityCompositionGuard<Tokens, GraphOf<Input>>,
    ): VanityOpenSystem<Engine, VanityAdditiveGraph<Tokens, GraphOf<Input>>, Conditions, Consts, Utils, Plugins>
    <const Input extends VanityTokenModule<any, any> | VanityUnifiedTokenBuilder<any, any, any> | VanityTokenTreeContext<EngineAxes<Engine>>>(
      factory: (system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Input & VanityCompositionGuard<Tokens, GraphOf<Input>>,
    ): VanityOpenSystem<Engine, VanityAdditiveGraph<Tokens, GraphOf<Input>>, Conditions, Consts, Utils, Plugins>
  }
  readonly addToken: {
    <const Name extends string, const Input extends VanityLeafInput | VanityDerivedResult | VanityTokenConfig>(
      name: Name extends keyof Tokens ? never : Name,
      input: Input,
    ): VanityOpenSystem<Engine, VanityAdditiveGraph<Tokens, Record<Name, Input>>, Conditions, Consts, Utils, Plugins>
    <const Name extends string, const Input extends VanityLeafInput | VanityDerivedResult | VanityTokenConfig>(
      name: Name extends keyof Tokens ? never : Name,
      input: (system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Input,
    ): VanityOpenSystem<Engine, VanityAdditiveGraph<Tokens, Record<Name, Input>>, Conditions, Consts, Utils, Plugins>
  }
  readonly augmentToken: <const Name extends keyof Tokens & string>(
    name: Name,
    patch: TokenPatch<ResolvedTokenAt<Tokens, Name, EnginePolicy<Engine>>, EngineAxes<Engine>>
      | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) =>
      TokenPatch<ResolvedTokenAt<Tokens, Name, EnginePolicy<Engine>>, EngineAxes<Engine>>),
  ) => VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>
  readonly augmentTokens: {
    <const Inputs extends readonly (
      VanityTokenModule<any, any> | VanityUnifiedTokenBuilder<any, any, any>
    )[]>(
      inputs: Inputs & (
        GraphsOfInputs<Inputs> extends TokenPatch<
          ResolvedTokens<Tokens, 'vanity-open', EnginePolicy<Engine>>,
          EngineAxes<Engine>
        > ? unknown : never
      ),
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>
    <const Input extends VanityTokenModule<any, any> | VanityUnifiedTokenBuilder<any, any, any>>(
      input: Input & (
        GraphOf<Input> extends TokenPatch<
          ResolvedTokens<Tokens, 'vanity-open', EnginePolicy<Engine>>,
          EngineAxes<Engine>
        > ? unknown : never
      ),
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>
    (
      patch: TokenPatch<ResolvedTokens<Tokens, 'vanity-open', EnginePolicy<Engine>>, EngineAxes<Engine>>
        | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) =>
        TokenPatch<ResolvedTokens<Tokens, 'vanity-open', EnginePolicy<Engine>>, EngineAxes<Engine>>),
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>
  }
  readonly overwriteToken: <const Name extends keyof Tokens & string>(
    name: Name,
    patch: TokenPatch<ResolvedTokenAt<Tokens, Name, EnginePolicy<Engine>>, EngineAxes<Engine>>
      | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) =>
      TokenPatch<ResolvedTokenAt<Tokens, Name, EnginePolicy<Engine>>, EngineAxes<Engine>>),
  ) => VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>
  readonly overwriteTokens: {
    <const Inputs extends readonly (
      VanityTokenModule<any, any> | VanityUnifiedTokenBuilder<any, any, any>
    )[]>(
      inputs: Inputs & (
        GraphsOfInputs<Inputs> extends TokenPatch<
          ResolvedTokens<Tokens, 'vanity-open', EnginePolicy<Engine>>,
          EngineAxes<Engine>
        > ? unknown : never
      ),
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>
    <const Input extends VanityTokenModule<any, any> | VanityUnifiedTokenBuilder<any, any, any>>(
      input: Input & (
        GraphOf<Input> extends TokenPatch<
          ResolvedTokens<Tokens, 'vanity-open', EnginePolicy<Engine>>,
          EngineAxes<Engine>
        > ? unknown : never
      ),
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>
    (
      patch: TokenPatch<ResolvedTokens<Tokens, 'vanity-open', EnginePolicy<Engine>>, EngineAxes<Engine>>
        | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) =>
        TokenPatch<ResolvedTokens<Tokens, 'vanity-open', EnginePolicy<Engine>>, EngineAxes<Engine>>),
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>
  }

  readonly defineConditions: typeof defineConditions
  readonly addCondition: <const Name extends string, const Input extends VanityConditionInput>(
    name: Name extends keyof Conditions ? never : Name,
    condition: Input | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Input),
  ) => VanityOpenSystem<Engine, Tokens, Conditions & Record<Name, Input>, Consts, Utils, Plugins>
  readonly addConditions: {
    <const Added extends Record<string, VanityConditionInput>>(
      factory: (system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) =>
        Added & AdditiveRecordGuard<Conditions, Added>,
    ): VanityOpenSystem<Engine, Tokens, Conditions & Added, Consts, Utils, Plugins>
    <const Added extends Record<string, VanityConditionInput>>(
      conditions: Added & AdditiveRecordGuard<Conditions, Added>,
    ): VanityOpenSystem<Engine, Tokens, Conditions & Added, Consts, Utils, Plugins>
    <const Input extends
    | VanityDefinitionModule<'conditions', Record<string, VanityConditionInput>>
    | readonly VanityDefinitionModule<'conditions', Record<string, VanityConditionInput>>[]>(
      conditions: Input,
    ): VanityOpenSystem<
      Engine,
      Tokens,
      Conditions & DefinitionShape<'conditions', Input>,
      Consts,
      Utils,
      Plugins
    >
  }
  readonly overwriteCondition: <const Name extends keyof Conditions & string, const Input extends VanityConditionInput>(
    name: Name,
    condition: Input | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Input),
  ) => VanityOpenSystem<Engine, Tokens, Omit<Conditions, Name> & Record<Name, Input>, Consts, Utils, Plugins>
  readonly overwriteConditions: {
    <const Patch extends Record<string, VanityConditionInput>>(
      factory: (system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) =>
        Patch & ExistingRecordGuard<Conditions, Patch>,
    ): VanityOpenSystem<Engine, Tokens, Omit<Conditions, keyof Patch> & Patch, Consts, Utils, Plugins>
    <const Patch extends Record<string, VanityConditionInput>>(
      conditions: Patch & ExistingRecordGuard<Conditions, Patch>,
    ): VanityOpenSystem<Engine, Tokens, Omit<Conditions, keyof Patch> & Patch, Consts, Utils, Plugins>
    <const Input extends
    | VanityDefinitionModule<'conditions', Record<string, VanityConditionInput>>
    | readonly VanityDefinitionModule<'conditions', Record<string, VanityConditionInput>>[]>(
      conditions: Input,
    ): VanityOpenSystem<
      Engine,
      Tokens,
      Omit<Conditions, keyof DefinitionShape<'conditions', Input>> & DefinitionShape<'conditions', Input>,
      Consts,
      Utils,
      Plugins
    >
  }

  readonly addAxis: {
    <const Name extends string, const Modes extends readonly [string, ...string[]]>(
      name: Name extends keyof EngineAxes<Engine> ? never : Name,
      modes: Modes,
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        EngineConstructors<Engine>,
        EnginePolicy<Engine>,
        EngineAxes<Engine> & Record<Name, VanityAxisDefinition<Record<Modes[number], VanityAxisModeInput>>>,
        EngineRequirements<Engine>,
        EnginePolicies<Engine>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Name extends string, const Input extends VanityAxisDefinition<any, any> | VanityOpenAxisConfig<any, any>>(
      name: Name extends keyof EngineAxes<Engine> ? never : Name,
      input: Input,
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        EngineConstructors<Engine>,
        EnginePolicy<Engine>,
        EngineAxes<Engine> & Record<Name, OpenAxisDefinition<Input>>,
        EngineRequirements<Engine>,
        EnginePolicies<Engine>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Name extends string, const Input extends VanityAxisDefinition<any, any> | VanityOpenAxisConfig<any, any>>(
      name: Name extends keyof EngineAxes<Engine> ? never : Name,
      factory: (system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Input,
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        EngineConstructors<Engine>,
        EnginePolicy<Engine>,
        EngineAxes<Engine> & Record<Name, OpenAxisDefinition<Input>>,
        EngineRequirements<Engine>,
        EnginePolicies<Engine>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
  }
  readonly defineAxes: typeof defineAxes
  readonly addAxes: {
    <const Added extends Record<string, VanityAxisModuleInput>>(
      factory: (
        system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>,
      ) => Added,
    ): VanityOpenSystem<
      VanitySystemEnvironment<EngineConstructors<Engine>, EnginePolicy<Engine>, EngineAxes<Engine> & OpenAxisRecord<Added>, EngineRequirements<Engine>, EnginePolicies<Engine>>,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Added extends Record<string, VanityAxisModuleInput>>(
      axes: Added,
    ): VanityOpenSystem<
      VanitySystemEnvironment<EngineConstructors<Engine>, EnginePolicy<Engine>, EngineAxes<Engine> & OpenAxisRecord<Added>, EngineRequirements<Engine>, EnginePolicies<Engine>>,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Input extends
    | VanityDefinitionModule<'axes', Record<string, VanityAxisModuleInput>>
    | readonly VanityDefinitionModule<'axes', Record<string, VanityAxisModuleInput>>[]>(
      axes: Input,
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        EngineConstructors<Engine>,
        EnginePolicy<Engine>,
        EngineAxes<Engine> & OpenAxisRecord<DefinitionShape<'axes', Input>>,
        EngineRequirements<Engine>,
        EnginePolicies<Engine>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
  }
  readonly augmentAxis: <
    const Name extends keyof EngineAxes<Engine> & string,
    const Patch extends VanityAxisPatch,
  >(
    name: Name,
    patch: Patch | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
  ) => VanityOpenSystem<
    VanitySystemEnvironment<
      EngineConstructors<Engine>,
      EnginePolicy<Engine>,
      Omit<EngineAxes<Engine>, Name> & Record<Name, PatchedAxis<EngineAxes<Engine>[Name], Patch>>,
      EngineRequirements<Engine>,
      EnginePolicies<Engine>
    >,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly augmentAxes: {
    <const Patch extends Partial<Record<keyof EngineAxes<Engine>, VanityAxisPatch>>>(
      patch: Patch | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        EngineConstructors<Engine>,
        EnginePolicy<Engine>,
        PatchedAxes<EngineAxes<Engine>, Patch>,
        EngineRequirements<Engine>,
        EnginePolicies<Engine>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Input extends
    | VanityDefinitionModule<'axes', object>
    | readonly VanityDefinitionModule<'axes', object>[]>(
      axes: Input & (
        DefinitionShape<'axes', Input> extends Partial<Record<keyof EngineAxes<Engine>, VanityAxisPatch>>
          ? unknown
          : never
      ),
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        EngineConstructors<Engine>,
        EnginePolicy<Engine>,
        PatchedAxes<EngineAxes<Engine>, DefinitionShape<'axes', Input>>,
        EngineRequirements<Engine>,
        EnginePolicies<Engine>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
  }
  readonly overwriteAxis: <
    const Name extends keyof EngineAxes<Engine> & string,
    const Patch extends VanityAxisPatch,
  >(
    name: Name,
    patch: Patch | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
  ) => VanityOpenSystem<
    VanitySystemEnvironment<
      EngineConstructors<Engine>,
      EnginePolicy<Engine>,
      Omit<EngineAxes<Engine>, Name> & Record<Name, PatchedAxis<EngineAxes<Engine>[Name], Patch>>,
      EngineRequirements<Engine>,
      EnginePolicies<Engine>
    >,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly overwriteAxes: {
    <const Patch extends Partial<Record<keyof EngineAxes<Engine>, VanityAxisPatch>>>(
      patch: Patch | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        EngineConstructors<Engine>,
        EnginePolicy<Engine>,
        PatchedAxes<EngineAxes<Engine>, Patch>,
        EngineRequirements<Engine>,
        EnginePolicies<Engine>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Input extends
    | VanityDefinitionModule<'axes', object>
    | readonly VanityDefinitionModule<'axes', object>[]>(
      axes: Input & (
        DefinitionShape<'axes', Input> extends Partial<Record<keyof EngineAxes<Engine>, VanityAxisPatch>>
          ? unknown
          : never
      ),
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        EngineConstructors<Engine>,
        EnginePolicy<Engine>,
        PatchedAxes<EngineAxes<Engine>, DefinitionShape<'axes', Input>>,
        EngineRequirements<Engine>,
        EnginePolicies<Engine>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
  }

  readonly defineConsts: typeof defineConsts
  readonly addConst: {
    <const Name extends string, const Value>(
      name: Name extends keyof PublicConsts<Consts> ? never : Name,
      factory: (
        system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>,
      ) => Value & JsonConst<Value>,
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts & Record<Name, Value>, Utils, Plugins>
    <const Name extends string, const Value>(
      name: Name extends keyof PublicConsts<Consts> ? never : Name,
      value: Value & JsonConst<Value>,
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts & Record<Name, Value>, Utils, Plugins>
  }
  readonly addConsts: {
    <const Added extends object>(
      factory: (system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) =>
        Added & JsonConst<Added> & AdditiveRecordGuard<PublicConsts<Consts>, Added>,
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts & Added, Utils, Plugins>
    <const Added extends object>(
      consts: Added & JsonConst<Added> & AdditiveRecordGuard<PublicConsts<Consts>, Added>,
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts & Added, Utils, Plugins>
    <const Input extends
    | VanityDefinitionModule<'consts', object>
    | readonly VanityDefinitionModule<'consts', object>[]>(
      consts: Input,
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts & DefinitionShape<'consts', Input>, Utils, Plugins>
  }
  readonly overwriteConst: {
    <const Name extends keyof PublicConsts<Consts> & string, const Value>(
      name: Name,
      factory: (
        system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>,
      ) => Value & JsonConst<Value>,
    ): VanityOpenSystem<Engine, Tokens, Conditions, Omit<Consts, Name> & Record<Name, Value>, Utils, Plugins>
    <const Name extends keyof PublicConsts<Consts> & string, const Value>(
      name: Name,
      value: Value & JsonConst<Value>,
    ): VanityOpenSystem<Engine, Tokens, Conditions, Omit<Consts, Name> & Record<Name, Value>, Utils, Plugins>
  }
  readonly overwriteConsts: {
    <const Patch extends object>(
      factory: (system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) =>
        Patch & JsonConst<Patch> & ExistingRecordGuard<PublicConsts<Consts>, Patch>,
    ): VanityOpenSystem<Engine, Tokens, Conditions, Omit<Consts, keyof Patch> & Patch, Utils, Plugins>
    <const Patch extends object>(
      consts: Patch & JsonConst<Patch> & ExistingRecordGuard<PublicConsts<Consts>, Patch>,
    ): VanityOpenSystem<Engine, Tokens, Conditions, Omit<Consts, keyof Patch> & Patch, Utils, Plugins>
    <const Input extends
    | VanityDefinitionModule<'consts', object>
    | readonly VanityDefinitionModule<'consts', object>[]>(
      consts: Input,
    ): VanityOpenSystem<
      Engine,
      Tokens,
      Conditions,
      Omit<Consts, keyof DefinitionShape<'consts', Input>> & DefinitionShape<'consts', Input>,
      Utils,
      Plugins
    >
  }

  readonly defineUtils: typeof defineUtils
  readonly addUtil: <const Name extends string, const Value extends (...args: any[]) => unknown>(
    name: Name extends keyof OpenNamespace<Engine, Utils> ? never : Name,
    value: Value,
  ) => VanityOpenSystem<Engine, Tokens, Conditions, Consts, VanityDefinitionMerge<'utils', Utils, Record<Name, Value>>, Plugins>
  readonly addUtils: {
    <const Added extends VanityUtilTree>(
      utils: Added & RecursiveUtilityGuard<OpenNamespace<Engine, Utils>, Added>,
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts, VanityDefinitionMerge<'utils', Utils, Added>, Plugins>
    <const Added extends VanityUtilTree>(
      factory: (system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) =>
        Added & RecursiveUtilityGuard<OpenNamespace<Engine, Utils>, Added>,
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts, VanityDefinitionMerge<'utils', Utils, Added>, Plugins>
    <const Input extends
    | VanityDefinitionModule<'utils', VanityUtilTree>
    | readonly VanityDefinitionModule<'utils', VanityUtilTree>[]>(
      utils: Input,
    ): VanityOpenSystem<
      Engine,
      Tokens,
      Conditions,
      Consts,
      VanityDefinitionMerge<'utils', Utils, DefinitionShape<'utils', Input>>,
      Plugins
    >
  }

  readonly defineConstructor: typeof defineConstructor
  readonly defineConstructors: typeof defineConstructors
  readonly addConstructor: <
    const Name extends string,
    const Definition extends VanityConstructorDefinition,
  >(
    name: Name extends keyof OpenNamespace<Engine, Utils> ? never : Name,
    definition: Definition
      | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Definition),
  ) => VanityOpenSystem<
    VanitySystemEnvironment<
      ProjectConstructors<
        EngineConstructors<Engine> & Record<Name, VanityConstructorFamily<Definition>>,
        EnginePolicies<Engine>
      >,
      EnginePolicy<Engine>,
      EngineAxes<Engine>,
      EngineRequirements<Engine>,
      EnginePolicies<Engine>
    >,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly addConstructors: {
    <const Added extends Readonly<Record<string, VanityConstructorDefinition>>>(
      constructors: Added
        | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Added),
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        ProjectConstructors<
          EngineConstructors<Engine> & ConstructorFamilies<Added>,
          EnginePolicies<Engine>
        >,
        EnginePolicy<Engine>,
        EngineAxes<Engine>,
        EngineRequirements<Engine>,
        EnginePolicies<Engine>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Input extends
    | VanityDefinitionModule<'constructors', Readonly<Record<string, VanityConstructorDefinition>>>
    | readonly VanityDefinitionModule<'constructors', Readonly<Record<string, VanityConstructorDefinition>>>[]>(
      constructors: Input,
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        ProjectConstructors<
          EngineConstructors<Engine> & ConstructorFamilies<DefinitionShape<'constructors', Input>>,
          EnginePolicies<Engine>
        >,
        EnginePolicy<Engine>,
        EngineAxes<Engine>,
        EngineRequirements<Engine>,
        EnginePolicies<Engine>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
  }

  readonly defineRules: typeof defineRules
  readonly addRule: <const Name extends string, const Rule extends VanitySystemRule>(
    name: Name extends keyof RulesOf<Consts> ? never : Name,
    rule: Rule | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Rule),
  ) => VanityOpenSystem<
    Engine,
    Tokens,
    Conditions,
    WithRules<Consts, RulesOf<Consts> & Record<Name, Rule>>,
    Utils,
    Plugins
  >
  readonly addRules: {
    <const Added extends Readonly<Record<string, VanitySystemRule>>>(
      rules: Added | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Added),
    ): VanityOpenSystem<
      Engine,
      Tokens,
      Conditions,
      WithRules<Consts, RulesOf<Consts> & Added>,
      Utils,
      Plugins
    >
    <const Input extends
    | VanityDefinitionModule<'rules', Readonly<Record<string, VanitySystemRule>>>
    | readonly VanityDefinitionModule<'rules', Readonly<Record<string, VanitySystemRule>>>[]>(
      rules: Input,
    ): VanityOpenSystem<
      Engine,
      Tokens,
      Conditions,
      WithRules<Consts, RulesOf<Consts> & DefinitionShape<'rules', Input>>,
      Utils,
      Plugins
    >
  }
  readonly overwriteRule: <const Name extends keyof RulesOf<Consts> & string, const Patch extends Partial<VanitySystemRule>>(
    name: Name,
    patch: Patch | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
  ) => VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>
  readonly overwriteRules: {
    <const Patch extends Partial<Record<keyof RulesOf<Consts>, Partial<VanitySystemRule>>>>(
      rules: Patch | ((system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>
    <const Input extends
    | VanityDefinitionModule<'rules', object>
    | readonly VanityDefinitionModule<'rules', object>[]>(
      rules: Input & (
        DefinitionShape<'rules', Input> extends Partial<Record<keyof RulesOf<Consts>, Partial<VanitySystemRule>>>
          ? unknown
          : never
      ),
    ): VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>
  }

  readonly addPlugin: {
    <const Plugin extends VanitySystemPluginShape>(
      plugin: Plugin
        & PluginRequirementGuard<Engine, Tokens, Conditions, Consts, Utils, Plugins, Plugin>
        & PluginConfigurationGuard<Plugin>,
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        ProjectConstructors<
          EngineConstructors<Engine> & PluginConstructors<Plugin>,
          MountedPluginPolicies<Engine, Plugin>
        >,
        EnginePolicy<Engine>,
        EngineAxes<Engine> & PluginAxes<Plugin>,
        EngineRequirements<Engine>,
        MountedPluginPolicies<Engine, Plugin>
      >,
      Tokens & PluginTokens<Plugin>,
      Conditions & PluginConditions<Plugin>,
      Consts & PluginConstsAndRules<Plugin>,
      Utils & PluginUtils<Plugin>,
      Plugins | Plugin['id']
    >
    <const Plugin extends VanitySystemPluginShape>(
      factory: (
        system: VanityOpenSystem<Engine, Tokens, Conditions, Consts, Utils, Plugins>,
      ) => Plugin
        & PluginRequirementGuard<Engine, Tokens, Conditions, Consts, Utils, Plugins, Plugin>
        & PluginConfigurationGuard<Plugin>,
    ): VanityOpenSystem<
      VanitySystemEnvironment<
        ProjectConstructors<
          EngineConstructors<Engine> & PluginConstructors<Plugin>,
          MountedPluginPolicies<Engine, Plugin>
        >,
        EnginePolicy<Engine>,
        EngineAxes<Engine> & PluginAxes<Plugin>,
        EngineRequirements<Engine>,
        MountedPluginPolicies<Engine, Plugin>
      >,
      Tokens & PluginTokens<Plugin>,
      Conditions & PluginConditions<Plugin>,
      Consts & PluginConstsAndRules<Plugin>,
      Utils & PluginUtils<Plugin>,
      Plugins | Plugin['id']
    >
  }

  readonly expectTokens: <const Shape extends object>(
    shape: Shape,
  ) => VanityOpenSystem<
    WithRequirements<Engine, { readonly tokens: Shape }>,
    Tokens & ExpectationGraph<Shape>,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly expectToken: <const Name extends string, const Shape extends object | true = true>(
    name: Name,
    shape?: Shape,
  ) => VanityOpenSystem<
    WithRequirements<Engine, { readonly tokens: Record<Name, Shape> }>,
    Tokens & Record<Name, ExpectationGraph<Shape>>,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly expectAxis: <const Name extends string, const Modes extends readonly string[] = readonly []>(
    name: Name,
    modes?: Modes,
  ) => VanityOpenSystem<
    VanitySystemEnvironment<
      EngineConstructors<Engine>,
      EnginePolicy<Engine>,
      EngineAxes<Engine> & Record<Name, VanityAxisDefinition<Record<Modes[number], VanityAxisModeInput>>>,
      EngineRequirements<Engine> & { readonly axes: Record<Name, Modes> },
      EnginePolicies<Engine>
    >,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly expectAxes: <const Axes extends Readonly<Record<string, readonly string[]>>>(
    axes: Axes,
  ) => VanityOpenSystem<
    VanitySystemEnvironment<
      EngineConstructors<Engine>,
      EnginePolicy<Engine>,
      EngineAxes<Engine> & {
        readonly [Name in keyof Axes]: VanityAxisDefinition<Record<Axes[Name][number], VanityAxisModeInput>>
      },
      EngineRequirements<Engine> & { readonly axes: Axes },
      EnginePolicies<Engine>
    >,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly expectCondition: <const Name extends string>(
    name: Name,
  ) => VanityOpenSystem<
    WithRequirements<Engine, { readonly conditions: Record<Name, true> }>,
    Tokens,
    Conditions & Record<Name, VanityConditionInput>,
    Consts,
    Utils,
    Plugins
  >
  readonly expectConditions: <const Shape extends object>(
    shape: Shape,
  ) => VanityOpenSystem<
    WithRequirements<Engine, { readonly conditions: Shape }>,
    Tokens,
    Conditions & ExistenceGraph<Shape, VanityConditionInput>,
    Consts,
    Utils,
    Plugins
  >
  readonly expectConst: <const Name extends string>(
    name: Name,
  ) => VanityOpenSystem<
    WithRequirements<Engine, { readonly consts: Record<Name, true> }>,
    Tokens,
    Conditions,
    Consts & Record<Name, unknown>,
    Utils,
    Plugins
  >
  readonly expectConsts: <const Shape extends object>(
    shape: Shape,
  ) => VanityOpenSystem<
    WithRequirements<Engine, { readonly consts: Shape }>,
    Tokens,
    Conditions,
    Consts & ExistenceGraph<Shape, unknown>,
    Utils,
    Plugins
  >
  readonly expectUtil: <const Path extends string>(
    path: Path,
  ) => VanityOpenSystem<
    WithRequirements<Engine, { readonly utils: Path }>,
    Tokens,
    Conditions,
    Consts,
    Utils & PathTree<Path, (...args: any[]) => unknown>,
    Plugins
  >
  readonly expectUtils: <const Paths extends readonly string[]>(
    paths: Paths,
  ) => VanityOpenSystem<
    WithRequirements<Engine, { readonly utils: Paths[number] }>,
    Tokens,
    Conditions,
    Consts,
    Utils & UnionToIntersection<PathTree<Paths[number], (...args: any[]) => unknown>>,
    Plugins
  >
  readonly expectRule: <const Name extends string>(
    name: Name,
  ) => VanityOpenSystem<
    WithRequirements<Engine, { readonly rules: Name }>,
    Tokens,
    Conditions,
    WithRules<Consts, RulesOf<Consts> & Record<Name, VanitySystemRule>>,
    Utils,
    Plugins
  >
  readonly expectRules: <const Names extends readonly string[]>(
    names: Names,
  ) => VanityOpenSystem<
    WithRequirements<Engine, { readonly rules: Names[number] }>,
    Tokens,
    Conditions,
    WithRules<Consts, RulesOf<Consts> & Record<Names[number], VanitySystemRule>>,
    Utils,
    Plugins
  >
  readonly expectPlugin: <const Id extends string>(
    id: Id,
  ) => VanityOpenSystem<WithRequirements<Engine, { readonly plugins: Id }>, Tokens, Conditions, Consts, Utils, Plugins>
  readonly expectConstructor: <const Name extends string>(
    name: Name,
  ) => VanityOpenSystem<
    VanitySystemEnvironment<
      EngineConstructors<Engine> & Record<Name, (...args: any[]) => VanityValue>,
      EnginePolicy<Engine>,
      EngineAxes<Engine>,
      EngineRequirements<Engine> & { readonly constructors: Record<Name, unknown> },
      EnginePolicies<Engine>
    >,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly expectConstructors: <const Names extends readonly string[]>(
    names: Names,
  ) => VanityOpenSystem<
    VanitySystemEnvironment<
      EngineConstructors<Engine> & Record<Names[number], (...args: any[]) => VanityValue>,
      EnginePolicy<Engine>,
      EngineAxes<Engine>,
      EngineRequirements<Engine> & { readonly constructors: Record<Names[number], unknown> },
      EnginePolicies<Engine>
    >,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins
  >

  readonly consolidate: <
    const Layers extends readonly string[] = VanityDefaultLayers,
    Prefix extends string = 'vanity',
    BaseConditions extends boolean = true,
    const AxisOrder extends readonly (keyof EngineAxes<Engine> & string)[] = readonly (keyof EngineAxes<Engine> & string)[],
  >(
    options?: VanityConsolidateOptions<Layers, Prefix, BaseConditions> & {
      readonly axisOrder?: VanityAxisOrderGuard<EngineAxes<Engine>, AxisOrder>
    },
  ) => VanityLockedSystem<Engine, Tokens, Conditions, Consts, Utils, Layers, Prefix, BaseConditions>
}

/**
 * The immutable accumulating system returned by `createSystem()`.
 *
 * @example
 * `const open: VanityOpenSystem = createSystem()`
 */
export type VanityOpenSystem<
  Engine extends VanitySystemEnvironment<any, any, any> = VanitySystemEnvironment,
  Tokens extends object = Record<never, never>,
  Conditions extends Record<string, VanityConditionInput> = Record<never, never>,
  Consts extends object = Record<never, never>,
  Utils extends object = Record<never, never>,
  Plugins extends string = never,
> = Readonly<EngineConstructors<Engine>>
  & Readonly<Utils>
  & VanityOpenSystemMethods<Engine, Tokens, Conditions, Consts, Utils, Plugins>
  & {
    readonly [VANITY_OPEN_SYSTEM_SHAPE]?: {
      readonly engine: Engine
      readonly tokens: Tokens
      readonly conditions: Conditions
      readonly consts: Consts
      readonly utils: Utils
      readonly plugins: Plugins
    }
  }

/**
 * Compact open-system helper boundary. It deliberately exposes only the
 * built-in constructor kit and system-bound token-definition surface; shape
 * accumulation methods stay on the concrete `VanityOpenSystem<…>` type.
 */
export type VanityOpenSystemBase
  = Readonly<VanityCanonicalConstructors<VanityLengthUnit>>
    & Pick<
      VanityOpenSystemMethods<
        VanitySystemEnvironment,
        Record<never, never>,
        Record<never, never>,
        Record<never, never>,
        Record<never, never>,
        never
      >,
      'tdef'
    >

type VanityPluginForbiddenMethod
  = | 'overwriteToken'
    | 'overwriteTokens'
    | 'overwriteCondition'
    | 'overwriteConditions'
    | 'overwriteAxis'
    | 'overwriteAxes'
    | 'overwriteConst'
    | 'overwriteConsts'
    | 'overwriteRule'
    | 'overwriteRules'
    | 'addPolicy'
    | 'addPolicies'
    | 'overwritePolicy'
    | 'overwritePolicies'
    | 'addPlugin'
    | 'consolidate'

/**
 * Setup sees the complete additive builder and expectation refinements, but
 * cannot overwrite host-owned vocabulary or lock the host mid-install.
 */
type VanityPluginSetupBase = Omit<
  VanityOpenSystem<
    VanitySystemEnvironment<
      VanityCanonicalConstructors<'px'>,
      VanityDefaultTokenPolicy,
      Record<never, never>
    >,
    Record<never, never>,
    Record<never, never>,
    Record<never, never>,
    Record<never, never>,
    string
  >,
  VanityPluginForbiddenMethod
>

export type VanityPluginSetupSystem<
  RegisteredPolicy extends object = Record<never, never>,
> = VanityPluginSetupBase & {
  readonly __vanityRegisteredPluginPolicy?: RegisteredPolicy
  /**
   * Publish readable policy data about this plugin's own configuration.
   *
   * Available only during plugin setup and scoped automatically by plugin id;
   * it does not grant authority to change host-global policy.
   */
  readonly registerPluginPolicy: <const Policy extends object>(
    policy: Policy | ((system: VanityPluginSetupSystem) => Policy),
  ) => VanityPluginSetupSystem<VanityDefinitionMerge<'policies', RegisteredPolicy, Policy>>
}

interface OpenState {
  readonly engine: VanityEngine<any, any, any>
  readonly tokens: unknown
  readonly conditions: Readonly<Record<string, VanityConditionInput>>
  readonly consts: Readonly<Record<string, unknown>>
  readonly utils: VanityUtilTree
  readonly rules: Readonly<Record<string, VanitySystemRule>>
  readonly policies: Readonly<VanityPolicies>
  readonly sequence: number
  readonly singularAdds: number
  readonly restrictionRevisions: Readonly<Record<string, number>>
  readonly tokenRevisions: Readonly<Record<string, number>>
  readonly plugins: ReadonlySet<string>
  readonly owners: Readonly<Record<string, { readonly kind: 'plugin', readonly id: string }>>
  readonly overwrites: readonly VanityOverwriteProvenance[]
  readonly pluginContext?: string
}

const OPEN_ONLY_MISUSE = new Set(['class', 'rules', 'raw', 'recipe', 'anatomy', 'atoms', 'runtime', 'snapshotFrom'])
const LOCKED_ONLY_MISUSE = new Set([
  'defineTokens',
  'defineAxes',
  'defineConditions',
  'defineConsts',
  'defineUtils',
  'defineRules',
  'defineConstructor',
  'defineConstructors',
  'definePolicies',
  'tdef',
  'addToken',
  'addTokens',
  'augmentToken',
  'augmentTokens',
  'overwriteToken',
  'overwriteTokens',
  'addCondition',
  'addConditions',
  'overwriteCondition',
  'overwriteConditions',
  'addAxis',
  'addAxes',
  'overwriteAxis',
  'overwriteAxes',
  'augmentAxis',
  'augmentAxes',
  'addConst',
  'addConsts',
  'overwriteConst',
  'overwriteConsts',
  'addUtil',
  'addUtils',
  'addConstructor',
  'addConstructors',
  'addRule',
  'addRules',
  'overwriteRule',
  'overwriteRules',
  'addPolicy',
  'addPolicies',
  'overwritePolicy',
  'overwritePolicies',
  'expectPolicy',
  'expectPolicies',
  'addPlugin',
  'expectToken',
  'expectTokens',
  'expectAxis',
  'expectAxes',
  'expectCondition',
  'expectConditions',
  'expectConst',
  'expectConsts',
  'expectUtil',
  'expectUtils',
  'expectRule',
  'expectRules',
  'expectPlugin',
  'expectConstructor',
  'expectConstructors',
  'consolidate',
])
const BUILD_SURFACES = new Set([
  'class',
  'rules',
  'raw',
  'fragment',
  'tdec',
  'keyframes',
  'fontFace',
  'recipe',
  'anatomy',
  'port',
  'atoms',
  'inLayer',
])
const INTERNAL_STYLING_MEMBERS = new Set(['css', 'globalCss', 'tokenOverride'])

/** Create the immutable open system. */
export function createSystem(): VanityOpenSystem
export function createSystem<
  const Config extends VanityPolicies,
>(
  policies: Config,
): VanityOpenSystem<ProjectEnvironment<VanitySystemEnvironment, Config>>
export function createSystem(
  policies?: VanityPolicies,
): any {
  const engine = createEngine()
  const open = materializeOpen({
    engine,
    tokens: engine.defineTokens({}),
    conditions: Object.freeze({}),
    consts: Object.freeze({}),
    utils: Object.freeze({}),
    rules: Object.freeze({}),
    policies: Object.freeze({}),
    sequence: 0,
    singularAdds: 0,
    restrictionRevisions: Object.freeze({}),
    tokenRevisions: Object.freeze({}),
    plugins: new Set(),
    owners: Object.freeze({}),
    overwrites: Object.freeze([]),
  })
  return policies === undefined ? open : (open as any).addPolicies(policies)
}

/** Define a callable plugin; each call returns an immutable configured copy. */
export function definePlugin<
  const Id extends string,
  Options = undefined,
  Result extends object = object,
>(
  definition: VanityPluginDefinition<Options, Result, Id>,
): VanitySystemPlugin<Options, Result, Id, false> {
  if (!definition.id || String(definition.version).length === 0)
    throw new TypeError('[vanity] definePlugin() needs a stable id and version')

  const configured = (options: Options | undefined): VanitySystemPlugin<Options, Result, Id, any> => {
    const callable = ((next?: Options) => configured(next)) as VanitySystemPlugin<Options, Result, Id, any>
    const optionFingerprint = options === undefined
      ? undefined
      : stableOptions(definition.optionsIdentity?.(options) ?? options)
    Object.defineProperties(callable, {
      ...Object.getOwnPropertyDescriptors(definition),
      ...(options === undefined ? {} : { options: { enumerable: true, value: immutableCopy(options) } }),
      fingerprint: {
        enumerable: true,
        value: [definition.fingerprint, optionFingerprint].filter(Boolean).join(':') || undefined,
      },
      [VANITY_SYSTEM_PLUGIN]: { value: true },
      __vanityPluginConfigured: { value: options !== undefined },
    })
    return Object.freeze(callable)
  }

  return configured(undefined) as VanitySystemPlugin<Options, Result, Id, false>
}

function materializeOpen(state: OpenState): VanityOpenSystem<any, any, any, any, any, any> {
  let surface: VanityOpenSystem<any, any, any, any, any, any>
  let preview: object | undefined
  const previewTokens = () => {
    preview ??= previewEngineTokens(state.engine, state.tokens as object)
    return preview
  }
  const declarationGrammar = () => {
    const constructors = enginePrivate(state.engine).kernel.constructors as Record<PropertyKey, unknown>
    const aliasConfig = constructors[VANITY_PROPERTY_ALIASES]
      ?? (state.consts as Record<PropertyKey, unknown>)[VANITY_PROPERTY_ALIASES]
    return {
      conditions: new Set([
        ...Object.keys(baseConditions()),
        ...Object.keys(state.conditions),
      ]),
      ...(aliasConfig && typeof aliasConfig === 'object'
        ? { aliases: (aliasConfig as { readonly aliases: Readonly<Record<string, string>> }).aliases }
        : {}),
    }
  }
  const logicalTokens = () => {
    const grammar = declarationGrammar()
    const tokens = previewTokens()
    attachTokenDeclarationGetters(tokens, grammar)
    return logicalTokenTree(tokens, grammar)
  }
  const next = (patch: Partial<OpenState>) => materializeOpen({
    ...state,
    ...patch,
  })
  const resolveRecordInput = (
    kind: VanityDefinitionKind,
    input: unknown,
  ): Record<string, any> => {
    const resolved = typeof input === 'function'
      ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
      : input
    return unwrapDefinitionInput(kind, resolved) as Record<string, any>
  }
  const tokenPatch = (mode: 'augment' | 'overwrite', input: unknown) => {
    const patch = typeof input === 'function' ? input(surface) : input
    if (Array.isArray(patch)) {
      return patch.reduce(
        (current, contribution) => Reflect.apply(
          (current as any)[`${mode}Tokens`],
          current,
          [contribution],
        ),
        surface as VanityOpenSystem<any, any, any, any, any, any>,
      )
    }
    if (!patch || typeof patch !== 'object')
      throw new TypeError(`[vanity] ${mode}Tokens() needs a token-shaped object, module, module array, or callback`)
    const unwrapped = isUnifiedTokenBuilder(patch)
      ? unwrapUnifiedTokenBuilder(patch)
      : patch
    const isModule = isTokenBuilder(unwrapped)
    const paths = isModule
      ? tokenModulePaths(
        unwrapped,
        previewEngineTokens(state.engine, unwrapped as object),
      ) ?? []
      : flattenPaths(patch)
    const sequence = state.sequence + 1
    return next({
      tokens: patchTokenModule(state.tokens, mode, unwrapped),
      sequence,
      tokenRevisions: Object.freeze({
        ...state.tokenRevisions,
        ...Object.fromEntries(paths.map(path => [path, sequence])),
      }),
      overwrites: Object.freeze([
        ...state.overwrites,
        provenancePaths('tokens', paths, mode),
      ]),
    })
  }
  const policyPatch = (mode: 'add' | 'overwrite', input: unknown) => {
    const patch = resolveRecordInput('policies', input)
    if (!isPlainRecord(patch))
      throw new TypeError(`[vanity] ${mode}Policies() needs one plain policy object or callback`)
    const policies = mergePolicies(state.policies, patch as VanityPolicies, mode)
    const sequence = state.sequence + 1
    const restrictionRevisions = { ...state.restrictionRevisions }
    for (const [name, policy] of Object.entries(patch.constructors ?? {}) as [string, VanityConstructorPolicy][]) {
      if (policy.restrict !== undefined)
        restrictionRevisions[name] = sequence
    }
    const currentKernel = enginePrivate(state.engine).kernel
    const currentTokens = isPlainRecord(currentKernel.policies.tokens)
      ? currentKernel.policies.tokens
      : {}
    const engine = updateEnginePolicies(state.engine, {
      policies: {
        ...policies,
        tokens: {
          reference: policies.reference ?? currentTokens.reference ?? 'var',
          emit: currentTokens.emit ?? true,
        },
      },
      support: policies.support,
    })
    return next({
      engine,
      policies,
      sequence,
      restrictionRevisions: Object.freeze(restrictionRevisions),
    })
  }
  const axes = enginePrivate(state.engine).axes
  const tdef = createTdefFacade(state.engine.token as any, axes)
  const defineTokens = (seed: object = {}) => defineSystemTokens({
    defineModule: graph => state.engine.defineTokens(graph),
    tdef: tdef as any,
    axes,
    preview: module => previewEngineTokens(state.engine, module),
  }, seed as VanityTokenTreeContext<any>)
  const addConstructorEntries = (
    entries: Record<string, VanityConstructorDefinition>,
    singular: boolean,
  ) => {
    let engine = state.engine
    const names: string[] = []
    for (const [name, definition] of Object.entries(entries)) {
      if (!name || name.startsWith('$'))
        throw new TypeError('[vanity] addConstructor() needs a non-$ constructor name')
      assertSystemNamespaceAvailable([name], 'addConstructor()')
      if (name in state.utils || name in enginePrivate(engine).kernel.constructors)
        throw new TypeError(`[vanity] addConstructor() cannot define '${name}' because that system member already exists`)
      if (!definition || typeof definition.call !== 'function')
        throw new TypeError(`[vanity] constructor '${name}' needs a call function`)

      const family = function (this: unknown, ...args: unknown[]) {
        return markConstructorUsage(Reflect.apply(definition.call, this, args), name)
      }
      for (const [member, value] of Object.entries(definition)) {
        if (member === 'call')
          continue
        if (typeof value !== 'function')
          throw new TypeError(`[vanity] constructor '${name}.${member}' must be call-like`)
        Object.defineProperty(family, member, {
          enumerable: true,
          value(this: unknown, ...args: unknown[]) {
            return markConstructorUsage(Reflect.apply(value, this, args), name)
          },
        })
      }
      const extension = () => ({ [name]: Object.freeze(family) })
      engine = state.pluginContext === undefined
        ? (engine.extend as any)({
            id: `org.vanity.constructor.${name}`,
            version: 1,
          }, extension)
        : (engine.extend as any)(extension)
      names.push(name)
    }
    return next({
      engine,
      owners: contributionOwners('constructor', names),
      singularAdds: state.singularAdds + (singular ? 1 : 0),
    })
  }

  const methods: Record<string, unknown> = {
    defineTokens,
    defineAxes,
    defineConditions,
    defineConsts,
    defineUtils,
    defineRules,
    defineConstructor,
    defineConstructors,
    definePolicies,
    tdef,
    tdec(input: object) {
      return deferredTokenDeclarations(previewTokens(), input as any)
    },
    serialize: state.engine.serialize,
    defineCssValue,
    defineCssOperation,
    check: state.engine.check,
    scale: state.engine.scale,
    addPolicy(name: string, value: unknown) {
      const resolved = typeof value === 'function' ? value(surface) : value
      return policyPatch('add', { [name]: resolved })
    },
    addPolicies(input: unknown) {
      return policyPatch('add', input)
    },
    overwritePolicy(name: string, value: unknown) {
      const resolved = typeof value === 'function' ? value(surface) : value
      return policyPatch('overwrite', { [name]: resolved })
    },
    overwritePolicies(input: unknown) {
      return policyPatch('overwrite', input)
    },
    expectPolicy(name: string) {
      if (!(name in state.policies))
        throw new TypeError(`[vanity] expected policy '${name}' is missing; add it before mounting this plugin`)
      return surface
    },
    expectPolicies(names: readonly string[]) {
      for (const name of names) {
        if (!(name in state.policies))
          throw new TypeError(`[vanity] expected policy '${name}' is missing; add it before mounting this plugin`)
      }
      return surface
    },
    addTokens(input: unknown) {
      if (Array.isArray(input)) {
        return input.reduce(
          (current, contribution) => (current as any).addTokens(contribution),
          surface,
        )
      }
      const resolved = typeof input === 'function' ? input(surface) : input
      const unwrapped = isUnifiedTokenBuilder(resolved)
        ? unwrapUnifiedTokenBuilder(resolved)
        : undefined
      const module = unwrapped ?? (isTokenBuilder(resolved)
        ? resolved
        : unwrapUnifiedTokenBuilder(defineTokens(resolved as VanityTokenTreeContext<any>))!
      )
      // Axis/plugin/policy additions may evolve the engine after earlier
      // token contributions. Compose through an empty module owned by the
      // newest engine so all ancestor-compatible contributions meet at the
      // current requirement instead of asking an ancestor to accept a child.
      const accumulator = state.engine.defineTokens({})
      const tokens = (accumulator as any)
        .compose(state.tokens)
        .compose(module)
      const preview = previewEngineTokens(state.engine, tokens)
      const paths = tokenModulePaths(module, preview) ?? []
      const sequence = state.sequence + 1
      return next({
        tokens,
        sequence,
        tokenRevisions: Object.freeze({
          ...state.tokenRevisions,
          ...Object.fromEntries(paths.map(path => [path, sequence])),
        }),
        owners: contributionOwners('token', paths),
      })
    },
    addToken(name: string, input: unknown) {
      if (!name || name.startsWith('$'))
        throw new TypeError('[vanity] addToken() needs one non-$ top-level name')
      const resolved = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      const result = Reflect.apply(methods.addTokens as (...args: any[]) => unknown, surface, [{ [name]: resolved }])
      const resultState = stateOfOpenSystem(result)!
      return materializeOpen({ ...resultState, singularAdds: state.singularAdds + 1 })
    },
    augmentToken(name: string, input: unknown) {
      const patch = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      return tokenPatch('augment', { [name]: patch })
    },
    augmentTokens(input: unknown) {
      return tokenPatch('augment', input)
    },
    overwriteToken(name: string, input: unknown) {
      const patch = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      return tokenPatch('overwrite', { [name]: patch })
    },
    overwriteTokens(input: unknown) {
      return tokenPatch('overwrite', input)
    },
    addCondition(name: string, input: unknown) {
      const value = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      const result = Reflect.apply(methods.addConditions as (...args: any[]) => unknown, surface, [{ [name]: value }])
      const resultState = stateOfOpenSystem(result)!
      return materializeOpen({ ...resultState, singularAdds: state.singularAdds + 1 })
    },
    addConditions(input: unknown) {
      const added = resolveRecordInput('conditions', input) as Record<string, VanityConditionInput>
      assertAdditive('condition', state.conditions, added)
      return next({
        conditions: Object.freeze({ ...state.conditions, ...added }),
        owners: contributionOwners('condition', Object.keys(added)),
      })
    },
    overwriteCondition(name: string, input: unknown) {
      const value = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      return Reflect.apply(methods.overwriteConditions as (...args: any[]) => unknown, surface, [{ [name]: value }])
    },
    overwriteConditions(input: unknown) {
      const patch = resolveRecordInput('conditions', input) as Record<string, VanityConditionInput>
      assertKnown('condition', state.conditions, patch)
      return next({
        conditions: Object.freeze({ ...state.conditions, ...patch }),
        overwrites: Object.freeze([...state.overwrites, provenance('conditions', patch)]),
      })
    },
    addAxis(name: string, input: unknown) {
      const resolved = typeof input === 'function' ? input(surface) : input
      if (!name || resolved === undefined)
        throw new TypeError('[vanity] addAxis() needs a name and an ordered mode definition')
      const definition = Array.isArray(resolved)
        ? defineOpenAxis(name, {
            modes: Object.fromEntries(resolved.map(mode => [mode, thisMode])),
            modeOrder: resolved,
          })
        : isAxisDefinition(resolved)
          ? resolved
          : defineOpenAxis(name, resolved as VanityOpenAxisConfig<any, any>)
      const engine = (state.engine.axes as any)(() => ({ [name]: definition }))
      return next({
        engine,
        owners: contributionOwners('axis', [name]),
        singularAdds: state.singularAdds + 1,
      })
    },
    addAxes(input: unknown) {
      const additions = resolveRecordInput('axes', input)
      const normalized = Object.fromEntries(Object.entries(additions).map(([name, definition]) => [
        name,
        normalizeOpenAxisInput(name, definition),
      ]))
      return next({
        engine: (state.engine.axes as any)(() => normalized as VanityAxisDefinitions),
        owners: contributionOwners('axis', Object.keys(normalized)),
      })
    },
    augmentAxis(name: string, input: unknown) {
      const patch = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      const existing = enginePrivate(state.engine).axes.definitions[name]
      if (!existing)
        throw new TypeError(`[vanity] augmentAxis() cannot patch unknown axis '${name}'; use addAxis()`)
      const definition = patchOpenAxis(name, existing, patch, 'augment')
      return next({
        engine: overwriteEngineAxis(state.engine, name as never, definition as never),
        overwrites: Object.freeze([...state.overwrites, {
          kind: 'axis',
          operation: 'augment',
          paths: Object.freeze(axisPatchPaths(name, patch)),
          ...sourceField(),
        }]),
      })
    },
    augmentAxes(input: unknown) {
      if (Array.isArray(input)) {
        return input.reduce(
          (current, contribution) => (current as any).augmentAxes(contribution),
          surface,
        )
      }
      const patches = resolveRecordInput('axes', input)
      return Object.entries(patches as object).reduce(
        (current, [name, patch]) => (current as any).augmentAxis(name, patch),
        surface,
      )
    },
    overwriteAxis(name: string, input: unknown) {
      const patch = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      const existing = enginePrivate(state.engine).axes.definitions[name]
      if (!existing)
        throw new TypeError(`[vanity] overwriteAxis() cannot patch unknown axis '${name}'; use addAxis()`)
      const definition = patchOpenAxis(name, existing, patch, 'overwrite')
      return next({
        engine: overwriteEngineAxis(state.engine, name as never, definition as never),
        overwrites: Object.freeze([...state.overwrites, {
          kind: 'axis',
          operation: 'overwrite',
          paths: Object.freeze(axisPatchPaths(name, patch)),
          ...sourceField(),
        }]),
      })
    },
    overwriteAxes(input: unknown) {
      if (Array.isArray(input)) {
        return input.reduce(
          (current, contribution) => (current as any).overwriteAxes(contribution),
          surface,
        )
      }
      const patches = resolveRecordInput('axes', input)
      return Object.entries(patches as object).reduce(
        (current, [name, patch]) => (current as any).overwriteAxis(name, patch),
        surface,
      )
    },
    addConst(name: string, input: unknown) {
      const value = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      const result = Reflect.apply(methods.addConsts as (...args: any[]) => unknown, surface, [{ [name]: value }])
      const resultState = stateOfOpenSystem(result)!
      return materializeOpen({ ...resultState, singularAdds: state.singularAdds + 1 })
    },
    addConsts(input: unknown) {
      const added = resolveRecordInput('consts', input)
      assertAdditive('const', state.consts, added)
      assertJson(added, 'addConsts')
      return next({
        consts: immutableCopy({ ...state.consts, ...added }),
        owners: contributionOwners('const', Object.keys(added)),
      })
    },
    overwriteConst(name: string, input: unknown) {
      const value = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      return Reflect.apply(methods.overwriteConsts as (...args: any[]) => unknown, surface, [{ [name]: value }])
    },
    overwriteConsts(input: unknown) {
      const patch = resolveRecordInput('consts', input)
      assertKnown('const', state.consts, patch)
      assertJson(patch, 'overwriteConsts')
      return next({
        consts: immutableCopy({ ...state.consts, ...patch }),
        overwrites: Object.freeze([...state.overwrites, provenance('consts', patch)]),
      })
    },
    addUtil(name: string, value: unknown) {
      if (typeof value !== 'function')
        throw new TypeError(`[vanity] utility '${name}' must be a function`)
      const result = Reflect.apply(methods.addUtils as (...args: any[]) => unknown, surface, [{ [name]: value }])
      const resultState = stateOfOpenSystem(result)!
      return materializeOpen({ ...resultState, singularAdds: state.singularAdds + 1 })
    },
    addUtils(input: unknown) {
      const added = resolveRecordInput('utils', input) as VanityUtilTree
      assertSystemNamespaceAvailable(
        Object.keys(added).filter(name => !(name in state.utils)),
        'addUtils()',
      )
      assertRecursiveUtilsAdditive('addUtils()', {
        ...enginePrivate(state.engine).kernel.constructors,
        ...state.utils,
        ...methods,
      }, added)
      assertUtilTree(added)
      const merged = mergeUtilityTrees(state.utils, added)
      return next({
        utils: immutableCopy(merged),
        owners: contributionOwners('utility', flattenPaths(added)),
      })
    },
    addConstructor(name: string, input: unknown) {
      const definition = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      return addConstructorEntries({ [name]: definition }, true)
    },
    addConstructors(input: unknown) {
      return addConstructorEntries(resolveRecordInput('constructors', input), false)
    },
    addRule(name: string, input: unknown) {
      const value = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      const result = Reflect.apply(methods.addRules as (...args: any[]) => unknown, surface, [{ [name]: value }])
      const resultState = stateOfOpenSystem(result)!
      return materializeOpen({ ...resultState, singularAdds: state.singularAdds + 1 })
    },
    addRules(input: unknown) {
      const added = resolveRecordInput('rules', input) as Record<string, VanitySystemRule>
      assertAdditive('rule', state.rules, added)
      for (const [name, rule] of Object.entries(added))
        assertSystemRule(name, rule)
      return next({
        rules: immutableCopy({ ...state.rules, ...added }),
        owners: contributionOwners('rule', Object.keys(added)),
      })
    },
    overwriteRule(name: string, input: unknown) {
      const patch = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      return Reflect.apply(methods.overwriteRules as (...args: any[]) => unknown, surface, [{ [name]: patch }])
    },
    overwriteRules(input: unknown) {
      if (Array.isArray(input)) {
        return input.reduce(
          (current, contribution) => (current as any).overwriteRules(contribution),
          surface,
        )
      }
      const patches = resolveRecordInput('rules', input)
      if (!isPlainRecord(patches))
        throw new TypeError('[vanity] overwriteRules() needs a rule patch record, module, module array, or callback')
      assertKnown('rule', state.rules, patches)
      const rules = { ...state.rules }
      for (const [name, patch] of Object.entries(patches)) {
        if (!isPlainRecord(patch))
          throw new TypeError(`[vanity] overwriteRule('${name}', ...) needs a partial system-rule object`)
        const current = rules[name]!
        const merged = { ...current, ...patch }
        assertSystemRule(name, merged)
        rules[name] = merged
      }
      return next({
        rules: immutableCopy(rules),
        overwrites: Object.freeze([...state.overwrites, provenance('rules', patches)]),
      })
    },
    addPlugin(input: VanitySystemPlugin<any, any> | ((system: object) => VanitySystemPlugin<any, any>)) {
      const plugin = typeof input === 'function' && !(VANITY_SYSTEM_PLUGIN in input)
        ? Reflect.apply(input, undefined, [surface])
        : input as VanitySystemPlugin<any, any>
      if (state.plugins.has(plugin.id))
        throw new TypeError(`[vanity] plugin '${plugin.id}' is already installed`)

      const setupSurface = materializeOpen({ ...state, pluginContext: plugin.id })
      const additive = pluginSetupSurface(setupSurface, plugin.id)
      let result: unknown
      try {
        result = plugin.setup(additive as VanityPluginSetupSystem, plugin.options)
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const temporal = message.includes('expected ') && message.includes('missing')
          ? ' Requirements are temporal: add the requirement before mounting this plugin.'
          : ''
        throw new TypeError(`[vanity] plugin '${plugin.id}' setup failed: ${message}${temporal}`)
      }
      const resultState = stateOfOpenSystem(result)
      if (!resultState || resultState.pluginContext !== plugin.id)
        throw new TypeError(`[vanity] plugin '${plugin.id}' setup must return the accumulated system`)

      const identity = defineEnginePlugin({
        id: plugin.id,
        version: plugin.version,
        ...(plugin.fingerprint === undefined ? {} : { fingerprint: plugin.fingerprint }),
        ...(plugin.dtcg === undefined ? {} : { dtcg: plugin.dtcg }),
        setup: () => ({}),
      })
      const engine = (resultState.engine.use as any)(identity)
      return materializeOpen({
        ...resultState,
        engine,
        plugins: new Set([...resultState.plugins, plugin.id]),
        pluginContext: undefined,
      })
    },
    expectTokens(shape: object) {
      assertTokenExpectation(logicalTokens(), shape)
      return surface
    },
    expectToken(name: string, shape: object | true = true) {
      assertTokenExpectation(logicalTokens(), { [name]: shape })
      return surface
    },
    expectAxis(name: string, modes: readonly string[] = []) {
      const definition = enginePrivate(state.engine).axes.definitions[name]
      if (!definition)
        throw new TypeError(`[vanity] expected axis '${name}' is missing; call addAxis('${name}', ...) earlier`)
      for (const mode of modes) {
        if (!(mode in definition.modes))
          throw new TypeError(`[vanity] expected axis mode '${name}.${mode}' is missing; add it before mounting this plugin`)
      }
      return surface
    },
    expectAxes(required: Record<string, readonly string[]>) {
      for (const [name, modes] of Object.entries(required))
        Reflect.apply(methods.expectAxis as (...args: any[]) => unknown, surface, [name, modes])
      return surface
    },
    expectCondition(name: string) {
      assertNamedRequirement('condition', state.conditions, name)
      return surface
    },
    expectConditions(shape: object) {
      assertShapeRequirement('condition', state.conditions, shape)
      return surface
    },
    expectConst(name: string) {
      assertNamedRequirement('const', state.consts, name)
      return surface
    },
    expectConsts(shape: object) {
      assertShapeRequirement('const', state.consts, shape)
      return surface
    },
    expectUtil(path: string) {
      assertPathRequirement('utility', state.utils, path)
      return surface
    },
    expectUtils(paths: readonly string[]) {
      for (const path of paths)
        assertPathRequirement('utility', state.utils, path)
      return surface
    },
    expectRule(name: string) {
      assertNamedRequirement('rule', state.rules, name)
      return surface
    },
    expectRules(names: readonly string[]) {
      for (const name of names)
        assertNamedRequirement('rule', state.rules, name)
      return surface
    },
    expectPlugin(id: string) {
      if (!state.plugins.has(id))
        throw new TypeError(`[vanity] expected plugin '${id}' is missing; call addPlugin() earlier`)
      return surface
    },
    expectConstructor(name: string) {
      if (!(name in enginePrivate(state.engine).kernel.constructors))
        throw new TypeError(`[vanity] expected constructor '${name}' is missing; define it before mounting this plugin`)
      return surface
    },
    expectConstructors(names: readonly string[]) {
      for (const name of names)
        Reflect.apply(methods.expectConstructor as (...args: any[]) => unknown, surface, [name])
      return surface
    },
    consolidate(options: VanityConsolidateOptions = {}) {
      assertPlainSystemModule()
      const source = diagnosticSource()?.file
      const finalEngine = options.axisOrder === undefined
        ? state.engine
        : (state.engine.axisOrder as any)(...options.axisOrder)
      const policyPreview = previewEngineTokens(finalEngine, state.tokens as object)
      enforceConstructorPolicies(state, policyPreview)
      const declaredLayers = options.layerOrder ?? state.policies.layerOrder ?? VANITY_DEFAULT_LAYERS
      for (const [name, group] of Object.entries(state.rules)) {
        if (group.layer !== undefined && !declaredLayers.includes(group.layer)) {
          throw new TypeError(
            `[vanity] named system rule '${name}' references undeclared layer '${group.layer}'; `
            + `declare it in policies.layerOrder or consolidate({ layerOrder })`,
          )
        }
      }
      if (state.singularAdds > 40) {
        console.warn(
          `[vanity] VANITY_SYSTEM_SINGULAR_ADD_THRESHOLD: this system accumulated ${state.singularAdds} singular add links. `
          + 'For a shorter type chain, group bulk vocabulary with define*().add() and mount it through the plural add method.',
        )
      }
      const { axisOrder: _axisOrder, ...systemOptions } = options
      const locked = consolidateEngineSystem(
        finalEngine,
        {
          tokens: state.tokens as any,
          conditions: state.conditions,
          ...(systemOptions.layerOrder !== undefined || state.policies.layerOrder === undefined
            ? {}
            : { layerOrder: state.policies.layerOrder }),
          ...systemOptions,
        } as any,
        {
          ...(source === undefined ? {} : { source }),
          consts: state.consts,
          utilities: flattenPaths(state.utils),
          ruleGroups: describeSystemRules(state.rules),
          plugins: [...state.plugins],
          owners: state.owners,
          overwrites: state.overwrites,
        },
      )
      return materializeLocked(locked, state.consts, state.utils, state.policies, state.rules)
    },
  }

  const target = {
    ...enginePrivate(state.engine).kernel.constructors,
    ...state.utils,
    ...methods,
    [VANITY_OPEN_SYSTEM_ENGINE]: state.engine,
    [VANITY_OPEN_SYSTEM_STATE]: state,
    get t() {
      return logicalTokens()
    },
    conditions: state.conditions,
    axes: enginePrivate(state.engine).axes.definitions,
    consts: state.consts,
    policies: state.policies,
  }
  Object.freeze(target)
  surface = new Proxy(target, {
    get(object, key, receiver) {
      if (typeof key === 'string' && OPEN_ONLY_MISUSE.has(key)) {
        return () => {
          throw new TypeError(`[vanity] ${key}() is available only after consolidate()`)
        }
      }
      return Reflect.get(object, key, receiver)
    },
  }) as VanityOpenSystem<any, any, any, any, any, any>
  return surface

  function contributionOwners(
    kind: 'axis' | 'condition' | 'const' | 'constructor' | 'rule' | 'token' | 'utility',
    names: readonly string[],
  ): OpenState['owners'] {
    if (state.pluginContext === undefined)
      return state.owners
    return Object.freeze({
      ...state.owners,
      ...Object.fromEntries(names.map(name => [
        `${kind}:${name}`,
        { kind: 'plugin' as const, id: `plugin:${state.pluginContext}` },
      ])),
    })
  }
}

/** @internal */
type EngineOfSystem<System> = OpenShape<System> extends { readonly engine: infer Engine }
  ? VanityEngine<EngineConstructors<Engine>, EnginePolicy<Engine>, EngineAxes<Engine>>
  : VanityEngine<any, any, any>

export function engineOfOpenSystem<const System extends object>(
  value: System,
): EngineOfSystem<System> | undefined
export function engineOfOpenSystem(value: unknown): VanityEngine<any, any, any> | undefined
export function engineOfOpenSystem(value: unknown): VanityEngine<any, any, any> | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    return undefined
  return (value as Record<PropertyKey, unknown>)[VANITY_OPEN_SYSTEM_ENGINE] as
    | VanityEngine<any, any, any>
    | undefined
}

function stateOfOpenSystem(value: unknown): OpenState | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    return undefined
  return (value as Record<PropertyKey, unknown>)[VANITY_OPEN_SYSTEM_STATE] as OpenState | undefined
}

function pluginSetupSurface(system: object, id: string): object {
  const forbidden = new Set<PluginForbiddenRuntime>([
    'overwriteToken',
    'overwriteTokens',
    'overwriteCondition',
    'overwriteConditions',
    'overwriteAxis',
    'overwriteAxes',
    'overwriteConst',
    'overwriteConsts',
    'overwriteRule',
    'overwriteRules',
    'addPolicy',
    'addPolicies',
    'overwritePolicy',
    'overwritePolicies',
    'addPlugin',
    'consolidate',
  ])
  const chaining = new Set([
    'addToken',
    'addTokens',
    'augmentToken',
    'augmentTokens',
    'addCondition',
    'addConditions',
    'addAxis',
    'addAxes',
    'augmentAxis',
    'augmentAxes',
    'addConst',
    'addConsts',
    'addUtil',
    'addUtils',
    'addConstructor',
    'addConstructors',
    'addRule',
    'addRules',
    'expectToken',
    'expectTokens',
    'expectAxis',
    'expectAxes',
    'expectCondition',
    'expectConditions',
    'expectConst',
    'expectConsts',
    'expectUtil',
    'expectUtils',
    'expectRule',
    'expectRules',
    'expectPlugin',
    'expectConstructor',
    'expectConstructors',
    'expectPolicy',
    'expectPolicies',
    'registerPluginPolicy',
  ])
  return new Proxy(Object.create(null) as object, {
    get(_target, key) {
      if (key === 'registerPluginPolicy') {
        return (input: unknown) => {
          const value = typeof input === 'function'
            ? Reflect.apply(input as (...args: unknown[]) => unknown, undefined, [pluginSetupSurface(system, id)])
            : input
          if (!isPlainRecord(value))
            throw new TypeError(`[vanity] plugin '${id}' registerPluginPolicy() needs one plain policy object or callback`)
          const state = stateOfOpenSystem(system)
          if (!state)
            throw new TypeError(`[vanity] plugin '${id}' policy registration lost its open-system context`)
          if (state.policies.plugins && id in state.policies.plugins)
            throw new TypeError(`[vanity] plugin '${id}' already registered its policy`)
          const next = Reflect.apply((system as any).addPolicies, system, [{
            plugins: { [id]: value },
          }])
          return pluginSetupSurface(next as object, id)
        }
      }
      if (typeof key === 'string' && forbidden.has(key as PluginForbiddenRuntime)) {
        return () => {
          throw new TypeError(`plugin '${id}' cannot call ${key}(); plugin setup is additive`)
        }
      }
      const value = Reflect.get(system, key, system)
      if (typeof value !== 'function' || typeof key !== 'string' || !chaining.has(key))
        return value
      return (...args: unknown[]) => {
        const result = Reflect.apply(value, system, args)
        return stateOfOpenSystem(result) === undefined
          ? result
          : pluginSetupSurface(result as object, id)
      }
    },
    has(_target, key) {
      if (key === 'registerPluginPolicy')
        return true
      return typeof key === 'string' && forbidden.has(key as PluginForbiddenRuntime)
        ? false
        : Reflect.has(system, key)
    },
    ownKeys() {
      return Reflect.ownKeys(system)
    },
    getOwnPropertyDescriptor(_target, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(system, key)
      return descriptor === undefined ? undefined : { ...descriptor, configurable: true }
    },
  })
}

type PluginForbiddenRuntime
  = | 'overwriteToken'
    | 'overwriteTokens'
    | 'overwriteCondition'
    | 'overwriteConditions'
    | 'overwriteAxis'
    | 'overwriteAxes'
    | 'overwriteConst'
    | 'overwriteConsts'
    | 'overwriteRule'
    | 'overwriteRules'
    | 'addPolicy'
    | 'addPolicies'
    | 'overwritePolicy'
    | 'overwritePolicies'
    | 'addPlugin'
    | 'consolidate'

function materializeLocked(
  legacy: object,
  consts: Readonly<Record<string, unknown>>,
  utils: VanityUtilTree,
  policies: Readonly<VanityPolicies>,
  systemRules: Readonly<Record<string, VanitySystemRule>>,
): object {
  const contract = systemContractOf(legacy)
  if (!contract)
    throw new TypeError('[vanity] consolidate() did not produce an in-process contract')

  const semantic = introspectSystem(contract.portable)
  let systemRulesEmitted = false
  const materialize = (source: object): object => {
    const target = Object.create(Object.getPrototypeOf(source))
    const sourceDescriptors = Object.getOwnPropertyDescriptors(source)
    for (const key of Reflect.ownKeys(sourceDescriptors)) {
      if (typeof key === 'string' && (INTERNAL_STYLING_MEMBERS.has(key) || key === 'explain' || key === 'inLayer'))
        continue
      Object.defineProperty(target, key, Reflect.get(sourceDescriptors, key) as PropertyDescriptor)
    }
    for (const [name, value] of Object.entries(utils)) {
      if (name in target)
        throw new TypeError(`[vanity] utility '${name}' collides with a locked-system member`)
      Object.defineProperty(target, name, { enumerable: true, value })
    }
    Object.defineProperties(target, {
      consts: { enumerable: true, value: consts },
      policies: { enumerable: true, value: policies },
      axes: { enumerable: true, value: semantic.axes },
      explain: {
        enumerable: true,
        value: (subject: unknown) => explainFromSystem(semantic, subject),
      },
      introspect: {
        enumerable: true,
        value: () => semantic,
      },
      inLayer: {
        enumerable: true,
        value: (name: string) => materialize((source as any).inLayer(name)),
      },
    })
    Object.freeze(target)

    return new Proxy(target, {
      get(object, key, receiver) {
        if (typeof key === 'string') {
          if (LOCKED_ONLY_MISUSE.has(key)) {
            return () => {
              throw new TypeError(`[vanity] ${key}() is unavailable after consolidate(); fork the open system instead`)
            }
          }
          if (BUILD_SURFACES.has(key))
            recordPortableSystem(contract.portable)
          if (BUILD_SURFACES.has(key)) {
            contract.emit()
            if (!systemRulesEmitted) {
              withEmissionFileScope(
                contract.portable.source ?? getFileScope().filePath,
                () => emitNamedSystemRules(legacy, systemRules, contract.portable.layers),
              )
              systemRulesEmitted = true
            }
          }
        }
        return Reflect.get(object, key, receiver)
      },
      has(object, key) {
        return typeof key === 'string' && (LOCKED_ONLY_MISUSE.has(key) || INTERNAL_STYLING_MEMBERS.has(key))
          ? false
          : Reflect.has(object, key)
      },
    })
  }

  return materialize(legacy)
}

function recordPortableSystem(portable: import('./contract').VanityPortableSystemV1): void {
  record({
    kind: 'system',
    ...(portable.source === undefined ? {} : { file: portable.source }),
    prefix: portable.prefix,
    root: portable.root,
    ...(portable.tokenLayer === undefined ? {} : { tokenLayer: portable.tokenLayer }),
    engine: portable.engine.signature,
    supportTarget: portable.engine.supportTarget,
    layers: [...portable.layers],
    ruleGroups: portable.ruleGroups,
    conditions: { ...portable.conditions },
    conditionArms: { ...portable.conditionArms },
    conditionAsts: { ...portable.conditionAsts },
    ...(portable.axes === undefined ? {} : { axes: portable.axes }),
    ...(Object.keys(portable.audits).length === 0 ? {} : { audit: portable.audits as VanityAuditConfig }),
    runtime: {
      protocol: portable.runtime.protocol,
      system: portable.runtime.system,
      root: portable.runtime.root,
    },
    identities: portable.identities,
    portable,
  })
}

function logicalTokenTree(
  value: object,
  grammar: import('../tokens/declarations').VanityTokenDeclarationGrammar,
  path: readonly string[] = [],
): object {
  if (typeof value === 'function' && '$path' in value) {
    const token = value as any
    const render = () => token.$reference === 'val' && token.$val !== undefined
      ? String(token.$val)
      : token.$var()
    const logical = (() => render()) as any
    Object.defineProperties(logical, {
      $phase: { enumerable: true, value: 'logical' },
      $var: { enumerable: true, value: token.$var },
      $path: { enumerable: true, value: token.$path },
      $type: { enumerable: true, value: token.$type },
      $reference: { enumerable: true, value: token.$reference },
      $emit: { enumerable: true, value: token.$emit },
      $mutable: { enumerable: true, value: token.$mutable },
      $description: { enumerable: true, value: token.$description },
      $deprecated: { enumerable: true, value: token.$deprecated },
      $metadata: { enumerable: true, value: token.$metadata },
      toString: { value: render },
    })
    attachLogicalTokenDeclarationGetter(logical, path, grammar)
    return Object.freeze(logical)
  }
  const logical = Object.fromEntries(Object.entries(value).map(([name, child]) => [
    name,
    (typeof child === 'object' || typeof child === 'function') && child !== null
      ? logicalTokenTree(child as object, grammar, [...path, name])
      : child,
  ]))
  attachLogicalTokenDeclarationGetter(logical, path, grammar)
  return Object.freeze(logical)
}

function normalizeOpenAxisInput(name: string, input: unknown): VanityAxisDefinition {
  if (Array.isArray(input)) {
    return defineOpenAxis(name, {
      modes: Object.fromEntries(input.map(mode => [mode, thisMode])),
      modeOrder: input,
    })
  }
  return isAxisDefinition(input)
    ? input
    : defineOpenAxis(name, input as VanityOpenAxisConfig<any, any>)
}

function patchOpenAxis(
  name: string,
  existing: VanityAxisDefinition,
  input: unknown,
  operation: 'augment' | 'overwrite',
): VanityAxisDefinition {
  if (isAxisDefinition(input)) {
    if (operation === 'augment')
      throw new TypeError(`[vanity] augmentAxis('${name}', ...) needs a partial patch, not a complete replacement`)
    for (const mode of Object.keys(existing.modes)) {
      if (!(mode in input.modes))
        throw new TypeError(`[vanity] overwriteAxis() cannot remove existing mode '${name}.${mode}'`)
    }
    return input
  }
  if (!isPlainRecord(input))
    throw new TypeError(`[vanity] ${operation}Axis('${name}', ...) needs a partial axis patch or callback`)

  const patch = input as VanityAxisPatch
  const normalizedModes = patch.modes === undefined
    ? {}
    : defineOpenAxis(name, { modes: patch.modes }).modes
  if (operation === 'augment') {
    for (const mode of Object.keys(normalizedModes)) {
      if (mode in existing.modes) {
        throw new TypeError(
          `[vanity] augmentAxis() cannot touch existing mode '${name}.${mode}'; use overwriteAxis()`,
        )
      }
    }
    for (const key of ['default', 'modeOrder', 'control', 'native', 'description'] as const) {
      const existingKey = key === 'default' ? existing.defaultMode : existing[key]
      if (patch[key] !== undefined && existingKey !== undefined)
        throw new TypeError(`[vanity] augmentAxis() cannot touch existing '${name}.${key}'; use overwriteAxis()`)
    }
    for (const mode of Object.keys(patch.derive ?? {})) {
      if (mode in existing.derive)
        throw new TypeError(`[vanity] augmentAxis() cannot touch existing derivation '${name}.${mode}'; use overwriteAxis()`)
    }
  }

  const modes = { ...existing.modes, ...normalizedModes }
  const modeOrder = patch.modeOrder
    ?? [...existing.modeOrder, ...Object.keys(normalizedModes).filter(mode => !(mode in existing.modes))]
  const derive = { ...existing.derive, ...patch.derive }
  return defineAxis({
    modes,
    ...((patch.default ?? existing.defaultMode) === undefined
      ? {}
      : { default: patch.default ?? existing.defaultMode }),
    modeOrder,
    derive,
    ...((patch.control ?? existing.control) === undefined
      ? {}
      : { control: patch.control ?? existing.control }),
    ...((patch.native ?? existing.native) === undefined
      ? {}
      : { native: patch.native ?? existing.native }),
    ...((patch.description ?? existing.description) === undefined
      ? {}
      : { description: patch.description ?? existing.description }),
  } as any)
}

function axisPatchPaths(name: string, patch: unknown): string[] {
  if (isAxisDefinition(patch))
    return [name]
  return isPlainRecord(patch)
    ? flattenPaths(patch).map(path => `${name}.${path}`)
    : [name]
}

function assertRecursiveUtilsAdditive(
  owner: string,
  current: object,
  added: object,
  parent: readonly string[] = [],
): void {
  for (const [name, value] of Object.entries(added)) {
    const path = [...parent, name]
    if (!(name in current))
      continue
    const existing = (current as Record<string, unknown>)[name]
    if (isPlainRecord(existing) && isPlainRecord(value)) {
      assertRecursiveUtilsAdditive(owner, existing, value, path)
      continue
    }
    const collision = typeof existing === 'function' && typeof value === 'function'
      ? 'duplicate utility leaf'
      : 'namespace/function collision'
    throw new TypeError(`[vanity] ${owner} ${collision} at '${path.join('.')}'`)
  }
}

function mergeUtilityTrees(
  current: Readonly<VanityUtilTree>,
  added: Readonly<VanityUtilTree>,
): VanityUtilTree {
  const merged: Record<string, any> = { ...current }
  for (const [name, value] of Object.entries(added)) {
    merged[name] = isPlainRecord(merged[name]) && isPlainRecord(value)
      ? mergeUtilityTrees(merged[name] as VanityUtilTree, value as VanityUtilTree)
      : value
  }
  return merged
}

function assertSystemRule(name: string, rule: unknown): asserts rule is VanitySystemRule {
  if (!isPlainRecord(rule) || !isPlainRecord(rule.css))
    throw new TypeError(`[vanity] named system rule '${name}' needs a css selector map`)
  if (rule.layer !== undefined && (typeof rule.layer !== 'string' || rule.layer.length === 0))
    throw new TypeError(`[vanity] named system rule '${name}.layer' must be a non-empty layer name`)
  if (rule.order !== undefined && (typeof rule.order !== 'number' || !Number.isFinite(rule.order)))
    throw new TypeError(`[vanity] named system rule '${name}.order' must be a finite number`)
}

function describeSystemRules(rules: Readonly<Record<string, VanitySystemRule>>): readonly {
  readonly name: string
  readonly description?: string
  readonly layer?: string
  readonly order?: number
  readonly selectors: readonly string[]
  readonly fingerprint: string
}[] {
  return Object.entries(rules).map(([name, rule]) => ({
    name,
    ...(rule.description === undefined ? {} : { description: rule.description }),
    ...(rule.layer === undefined ? {} : { layer: rule.layer }),
    ...(rule.order === undefined ? {} : { order: rule.order }),
    selectors: Object.keys(rule.css),
    fingerprint: ruleFingerprint(rule.css),
  }))
}

function ruleFingerprint(value: unknown): string {
  const seen = new WeakSet<object>()
  const normalize = (input: unknown): unknown => {
    if (input === null || typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean')
      return input
    if (typeof input === 'function') {
      if ('$path' in input)
        return { token: String((input as any).$path) }
      return { function: input.name || 'anonymous' }
    }
    if (typeof input !== 'object')
      return String(input)
    if (seen.has(input))
      throw new TypeError('[vanity] a named system rule cannot contain cycles')
    seen.add(input)
    if ('$path' in input)
      return { token: String((input as any).$path) }
    if ('css' in input && typeof (input as any).css === 'string')
      return { value: (input as any).css }
    const normalized = Array.isArray(input)
      ? input.map(normalize)
      : Object.fromEntries(Object.keys(input).sort().map(key => [key, normalize((input as any)[key])]))
    seen.delete(input)
    return normalized
  }
  let hash = 0x811C9DC5
  for (const char of JSON.stringify(normalize(value))) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return `rule-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function emitNamedSystemRules(
  locked: object,
  rules: Readonly<Record<string, VanitySystemRule>>,
  layers: readonly string[],
): void {
  const layerIndex = new Map(layers.map((layer, index) => [layer, index]))
  const ordered = Object.entries(rules)
    .map(([name, rule], registration) => ({ name, registration, rule }))
    .sort((left, right) => {
      const leftLayer = layerIndex.get(left.rule.layer ?? '') ?? Number.MAX_SAFE_INTEGER
      const rightLayer = layerIndex.get(right.rule.layer ?? '') ?? Number.MAX_SAFE_INTEGER
      return leftLayer - rightLayer
        || (left.rule.order ?? 0) - (right.rule.order ?? 0)
        || left.registration - right.registration
    })
  for (const { name, rule } of ordered) {
    if (rule.layer !== undefined && !layerIndex.has(rule.layer))
      throw new TypeError(`[vanity] named system rule '${name}' references undeclared layer '${rule.layer}'`)
    const emitter = rule.layer === undefined
      ? (locked as any).rules
      : (locked as any).rules.layer(rule.layer)
    emitter(rule.css)
  }
}

function assertNamedRequirement(kind: string, current: object, name: string): void {
  if (!(name in current))
    throw new TypeError(`[vanity] expected ${kind} '${name}' is missing; add it before mounting this plugin`)
}

function assertShapeRequirement(
  kind: string,
  current: unknown,
  required: unknown,
  parent: readonly string[] = [],
): void {
  if (required === true)
    return
  if (!isPlainRecord(required))
    return
  for (const [name, child] of Object.entries(required)) {
    const path = [...parent, name]
    if (!current || (typeof current !== 'object' && typeof current !== 'function') || !(name in current)) {
      throw new TypeError(`[vanity] expected ${kind} '${path.join('.')}' is missing; add it before mounting this plugin`)
    }
    assertShapeRequirement(kind, (current as any)[name], child, path)
  }
}

function assertPathRequirement(kind: string, current: object, path: string): void {
  let value: unknown = current
  for (const part of path.split('.')) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || !(part in value)) {
      throw new TypeError(`[vanity] expected ${kind} '${path}' is missing; add it before mounting this plugin`)
    }
    value = (value as any)[part]
  }
  if (typeof value !== 'function')
    throw new TypeError(`[vanity] expected ${kind} '${path}' to be a callable leaf`)
}

function assertPlainSystemModule(): void {
  if (!hasFileScope())
    return
  // A plain system imported by a style module executes while vanilla-extract
  // has the importing file scope open. Provenance still identifies the
  // authored call site, so reject only when consolidate() itself was authored
  // in a style module.
  const file = diagnosticSource()?.file ?? getFileScope().filePath
  if (!/\.css\.[cm]?[jt]sx?$/.test(file))
    return
  throw new VanityError({
    code: 'VANITY_SYSTEM_IN_STYLE_MODULE',
    message: 'createSystem()/consolidate() cannot run inside a *.css.ts module',
    file,
    detail: ['A system is a pure compiler contract shared by styles, tools, browser runtime, and SSR.'],
    fix: 'move the open-system chain and consolidate() call to a plain system.ts, then import the locked system into this style module',
  })
}

function assertAdditive(kind: string, current: object, added: object): void {
  for (const name of Object.keys(added)) {
    if (name in current)
      throw new TypeError(`[vanity] add${capitalize(kind)}s() cannot replace existing ${kind} '${name}'`)
  }
}

function assertKnown(kind: string, current: object, patch: object): void {
  for (const name of Object.keys(patch)) {
    if (!(name in current))
      throw new TypeError(`[vanity] overwrite${capitalize(kind)}s() cannot replace unknown ${kind} '${name}'; use add${capitalize(kind)}s()`)
  }
}

function enforceConstructorPolicies(state: OpenState, tokens: object): void {
  const usages = constructorUsagesOf(tokens)
  const errors: import('../diagnostics').VanityDiagnosticInput[] = []
  for (const [path, constructors] of Object.entries(usages)) {
    for (const name of constructors) {
      const policy = state.policies.constructors?.[name]
      const restriction = policy?.restrict
      if (!restriction)
        continue
      const policyRevision = state.restrictionRevisions[name] ?? 0
      const valueRevision = state.tokenRevisions[path] ?? 0
      const applies = restriction.enforce === 'retroactive' || valueRevision > policyRevision
      if (!applies)
        continue
      const use = restriction.use ? `; use '${restriction.use}'` : ''
      const reason = restriction.reason ? ` (${restriction.reason})` : ''
      const diagnostic: import('../diagnostics').VanityDiagnosticInput = {
        code: 'VANITY_POLICY_RESTRICTED_CONSTRUCTOR',
        severity: restriction.level === 'forbid' ? 'error' : 'warning',
        message: `${path} uses ${restriction.level === 'forbid' ? 'forbidden' : 'discouraged'} constructor '${name}'${reason}`,
        path,
        fix: restriction.use
          ? `replace '${name}' with '${restriction.use}'`
          : `remove the '${name}' constructor use or revise its restriction policy`,
      }
      if (restriction.level === 'forbid')
        errors.push(diagnostic)
      else
        console.warn(`[vanity] ${diagnostic.code}: ${diagnostic.message}${use}`)
    }
  }
  if (errors.length > 0)
    throw new VanityError(errors)
}

const POLICY_KEYS = new Set(['constructors', 'support', 'layerOrder', 'reference', 'validation', 'plugins'])

function mergePolicies(
  current: Readonly<VanityPolicies>,
  patch: VanityPolicies,
  mode: 'add' | 'overwrite',
): Readonly<VanityPolicies> {
  for (const name of Object.keys(patch)) {
    if (!POLICY_KEYS.has(name))
      throw new TypeError(`[vanity] unknown policy group '${name}'; use constructors, support, layerOrder, reference, validation, or plugins`)
    if (mode === 'overwrite' && !(name in current))
      throw new TypeError(`[vanity] overwritePolicies() cannot replace unknown policy '${name}'; use addPolicies()`)
  }
  validatePolicies(patch)
  return immutableCopy(mergePolicyObject(current as Record<string, unknown>, patch as Record<string, unknown>, mode, [])) as VanityPolicies
}

function mergePolicyObject(
  current: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
  mode: 'add' | 'overwrite',
  path: readonly string[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current }
  for (const [name, value] of Object.entries(patch)) {
    const nextPath = [...path, name]
    const existing = current[name]
    if (existing === undefined) {
      merged[name] = value
      continue
    }
    if (isPlainRecord(existing) && isPlainRecord(value)
      && (path.length > 0 || name === 'constructors' || name === 'plugins')) {
      merged[name] = mergePolicyObject(existing, value, mode, nextPath)
      continue
    }
    if (mode === 'add') {
      throw new TypeError(
        `[vanity] addPolicies() cannot replace existing policy '${nextPath.join('.')}'; use overwritePolicy()`,
      )
    }
    merged[name] = value
  }
  return merged
}

function validatePolicies(policies: VanityPolicies): void {
  if (policies.reference !== undefined && policies.reference !== 'val' && policies.reference !== 'var')
    throw new TypeError(`[vanity] reference policy must be 'val' or 'var'`)
  if (policies.validation !== undefined && !['strict', 'warn', 'off'].includes(policies.validation))
    throw new TypeError(`[vanity] validation policy must be 'strict', 'warn', or 'off'`)
  if (policies.layerOrder !== undefined && (policies.layerOrder.length === 0 || policies.layerOrder.some(layer => !layer.trim())))
    throw new TypeError('[vanity] layerOrder policy needs at least one non-empty layer name')
  for (const [name, policy] of Object.entries(policies.constructors ?? {})) {
    if (!isPlainRecord(policy))
      throw new TypeError(`[vanity] constructor policy '${name}' must be a plain object`)
    const restriction = policy.restrict
    if (restriction !== undefined) {
      if (!isPlainRecord(restriction) || !['forbid', 'discourage'].includes(String(restriction.level)))
        throw new TypeError(`[vanity] constructor policy '${name}.restrict.level' must be 'forbid' or 'discourage'`)
      if (restriction.enforce !== undefined && !['prospective', 'retroactive'].includes(String(restriction.enforce)))
        throw new TypeError(`[vanity] constructor policy '${name}.restrict.enforce' must be 'prospective' or 'retroactive'`)
    }
  }
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const TOKEN_TRAITS = new Set(['type', 'mutable', 'reference', 'emit'])

function assertTokenExpectation(current: unknown, required: unknown, path: string[] = []): void {
  if (required === true)
    return
  if (!required || typeof required !== 'object')
    return

  const entries = Object.entries(required)
  const isTrait = entries.length > 0 && entries.every(([name]) => TOKEN_TRAITS.has(name))
  if (isTrait) {
    for (const [trait, expected] of entries) {
      const actual = (current as any)?.[`$${trait}`]
      if (actual !== expected) {
        throw new TypeError(
          `[vanity] expected token '${path.join('.')}' to have ${trait}: ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
        )
      }
    }
    return
  }

  for (const [name, child] of entries) {
    const next = [...path, name]
    if (!current || (typeof current !== 'object' && typeof current !== 'function') || !(name in current)) {
      throw new TypeError(`[vanity] expected token '${next.join('.')}' is missing; add it earlier in the chain`)
    }
    assertTokenExpectation((current as any)[name], child, next)
  }
}

function assertUtilTree(value: VanityUtilTree, path: string[] = []): void {
  for (const [name, child] of Object.entries(value)) {
    const next = [...path, name]
    if (typeof child === 'function')
      continue
    if (!child || typeof child !== 'object' || Array.isArray(child))
      throw new TypeError(`[vanity] utility '${next.join('.')}' must be a function or a namespace of functions`)
    assertUtilTree(child as VanityUtilTree, next)
  }
}

function stableOptions(value: unknown): string {
  const ancestors = new WeakSet<object>()
  return JSON.stringify(sort(value, ancestors))
}

function sort(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === 'function')
    throw new TypeError('[vanity] plugin options cannot use a function as compatibility identity; provide a stable id')
  if (value === null || typeof value !== 'object')
    return value
  if (ancestors.has(value))
    throw new TypeError('[vanity] plugin options cannot contain cycles')
  ancestors.add(value)
  const hasStableId = !Array.isArray(value)
    && typeof (value as Record<string, unknown>).id === 'string'
  const sorted = Array.isArray(value)
    ? value.map(entry => sort(entry, ancestors))
    : Object.fromEntries(Object.keys(value as object).sort()
        .filter(key => !(hasStableId && typeof (value as Record<string, unknown>)[key] === 'function'))
        .map(key => [
          key,
          sort((value as Record<string, unknown>)[key], ancestors),
        ]))
  ancestors.delete(value)
  return sorted
}

function provenance(
  kind: VanityOverwriteProvenance['kind'],
  value: object,
  operation: VanityOverwriteProvenance['operation'] = 'overwrite',
): VanityOverwriteProvenance {
  return Object.freeze({
    kind,
    operation,
    paths: Object.freeze(flattenPaths(value)),
    ...sourceField(),
  })
}

function provenancePaths(
  kind: VanityOverwriteProvenance['kind'],
  paths: readonly string[],
  operation: VanityOverwriteProvenance['operation'] = 'overwrite',
): VanityOverwriteProvenance {
  return Object.freeze({
    kind,
    operation,
    paths: Object.freeze([...paths]),
    ...sourceField(),
  })
}

function sourceField(): { readonly source?: string } {
  const source = diagnosticSource()?.file
  return source === undefined ? {} : { source }
}

function flattenPaths(value: object, parent: string[] = []): string[] {
  const paths: string[] = []
  for (const [name, child] of Object.entries(value)) {
    const next = [...parent, name]
    if (child && typeof child === 'object' && !Array.isArray(child))
      paths.push(...flattenPaths(child, next))
    else
      paths.push(next.join('.'))
  }
  return paths
}

function assertJson(value: unknown, surface: string, ancestors = new WeakSet<object>()): void {
  if (value === null || ['string', 'boolean'].includes(typeof value))
    return
  if (typeof value === 'number') {
    if (Number.isFinite(value))
      return
    throw new TypeError(`[vanity] ${surface}() consts cannot contain non-finite numbers`)
  }
  if (typeof value !== 'object')
    throw new TypeError(`[vanity] ${surface}() consts must be JSON-serializable`)
  if (ancestors.has(value))
    throw new TypeError(`[vanity] ${surface}() consts cannot contain cycles`)
  ancestors.add(value)
  for (const child of Array.isArray(value) ? value : Object.values(value))
    assertJson(child, surface, ancestors)
  ancestors.delete(value)
}

function immutableCopy<T>(value: T, copies = new WeakMap<object, object>()): T {
  if (typeof value === 'function' || typeof value !== 'object' || value === null)
    return value

  const prototype = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null)
    return value

  const existing = copies.get(value)
  if (existing !== undefined)
    return existing as T

  if (Array.isArray(value)) {
    const array: unknown[] = []
    copies.set(value, array)
    array.push(...value.map(entry => immutableCopy(entry, copies)))
    return Object.freeze(array) as T
  }

  const clone = Object.create(prototype) as Record<PropertyKey, unknown>
  copies.set(value, clone)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined)
      continue
    Object.defineProperty(clone, key, 'value' in descriptor
      ? { ...descriptor, value: immutableCopy(descriptor.value, copies) }
      : descriptor)
  }
  return Object.freeze(clone) as T
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
}
