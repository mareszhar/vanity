/**
 * Public composition model: one immutable open system accumulates
 * shape and plugins; `consolidate()` returns an emission-free locked contract.
 */

import type { VanityTokenDeclarations } from '../css/types'
import type { VanityDiagnosticCode } from '../diagnostics'
import type { VanityDtcgCodec } from '../introspect/interchange'
import type { VanityAuditConfig } from '../introspect/records'
import type { VanityAliasesOf } from '../plugins/propertyAliases'
import type { VanitySystemMember } from '../system/surface'
import type {
  VanityTdefFactory,
  VanityTokenBuilder,
  VanityTokenTreeContext,
  VanityTokenTreeGraph,
  VanityTokenTreeInputGuard,
} from '../tokens/builder'
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
import type { VanityCanonicalConstructors } from '../values/defaults'
import type { VanityValueOperationContext } from '../values/kernel'
import type { VanityCssDataType, VanitySelfValue, VanityTokenInput, VanityValue } from '../values/types'
import type { VanityLengthUnit } from '../values/units'
import type {
  VanityAxisDefinition,
  VanityAxisDefinitions,
  VanityAxisModeInput,
  VanityAxisModeName,
  VanityAxisOrderGuard,
  VanityAxisRegistry,
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
  VanityConstructorDefinition,
  VanityConstructorFamily,
  VanityUtilTree,
} from './definitions'
import type {
  VanityDefaultLayers,
  VanityLockedSystem,
  VanityPublicConsts,
  VanityRulesOf,
  VanitySystemConditionName,
  VanityWithRules,
} from './locked'
import type {
  VanityAxisModuleInput,
  VanityDefinitionKind,
  VanityDefinitionMerge,
  VanityDefinitionModule,
  VanityDefinitionModulesShape,
} from './modules'
import type {
  VanityConstructorPolicy,
  VanityPolicies,
} from './policies'
import type { VanitySystemRule } from './rules'
import type {
  ProjectConstructors,
  ProjectSystemShape,
  ShapeAxes,
  ShapeConstructors,
  ShapePolicies,
  ShapePolicy,
  ShapeRequirements,
  VanityPluginRequirements,
  VanitySystemShape,
  WithSystemRequirements,
} from './shape'
import type { OpenSystemState, SystemProvenance } from './state'
import { createDeferredTokenDeclarations } from '../css/tdec'
import { getDiagnosticSource, VanityError } from '../diagnostics'
import {
  VANITY_PROPERTY_ALIASES,

} from '../plugins/propertyAliases'
import {
  assertSystemNamespaceAvailable,
} from '../system/surface'
import {
  createTdefFactory,
  defineSystemTokens,
  getTokenModule,
  isTokenBuilder,
} from '../tokens/builder'
import { createTokenFactory } from '../tokens/config'
import {
  attachLogicalTokenDeclarationGetter,
  attachTokenDeclarationGetters,
} from '../tokens/declarations'
import { augmentTokenDefinition, composeTokenModules, overwriteTokenDefinition } from '../tokens/derive'
import { defineTokenModule, getTokenModulePaths, isTokenModule } from '../tokens/module'
import { getTokenModuleRequirement } from '../tokens/requirements'
import { resolveTokenModule } from '../tokens/resolve'
import { mergeDtcgCodecs } from '../values/codecs'
import { createValueKernel, extendValueKernel, serializeValueWithContext } from '../values/kernel'
import { markConstructorUsage, VANITY_DEFAULT_CSS_SUPPORT } from '../values/protocol'
import { axis as defineAxis, defineOpenAxis, isAxisDefinition, normalizeAxisAdditions } from './axes'
import { createBaseConditions, thisMode } from './conditions'
import { consolidateSystem } from './consolidate'
import {
  defineConstructor,
  defineConstructors,
  defineConsts,
  defineRules,
  defineUtils,
} from './definitions'
import {
  defineAxes,
  defineConditions,
  definePolicies,
  resolveDefinitionInput,
} from './modules'
import {
  hasPlugin,
  registerPlugin,
} from './plugins'
import {
  addPolicies,
  overwritePolicies,
  resolvePolicies,
} from './policies'
import {
  getSystemCapabilitySignature,
  getSystemTokenModuleRequirement,
} from './shape'
import { getOpenSystemState, VANITY_OPEN_SYSTEM_STATE } from './state'

export type {
  VanityConstructorPolicies,
  VanityConstructorPolicy,
  VanityConstructorRestriction,
  VanityPolicies,
  VanityTokenPolicies,
} from './policies'

export type {
  ProjectSystemShape,
  VanityPluginRequirements,
  VanitySystemShape,
} from './shape'

declare const VANITY_OPEN_SYSTEM_TYPE: unique symbol
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
  Shape,
  Tokens extends object,
  Conditions extends object,
  Consts extends object,
  Utils extends object,
  Plugins extends string,
  Requirement extends VanityPluginRequirements,
> = EveryTrue<
  | (Requirement extends { readonly tokens: infer RequiredTokens }
    ? TokenRequirementSatisfied<ResolvedTokens<Tokens, 'vanity-open', ShapePolicy<Shape>>, RequiredTokens>
    : true)
  | (Requirement extends { readonly axes: infer RequiredAxes }
    ? AxisRequirementSatisfied<ShapeAxes<Shape>, RequiredAxes>
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
    ? Exclude<keyof RequiredConstructors, keyof ShapeConstructors<Shape>> extends never ? true : false
    : true)
  | (Requirement extends { readonly policies: infer RequiredPolicy }
    ? RequiredPolicy extends keyof ShapePolicies<Shape> ? true : false
    : true)
>

type PluginRequirementGuard<
  Shape,
  Tokens extends object,
  Conditions extends object,
  Consts extends object,
  Utils extends object,
  Plugins extends string,
  Plugin,
>
  = PluginRequirementSatisfied<
    Shape,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins,
    ShapeRequirements<PluginSystemShape<Plugin>>
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
interface OpenSystemTypeMetadata<
  Shape,
  Tokens extends object,
  Conditions extends object,
  Consts extends object,
  Utils extends object,
  Plugins extends string,
> {
  readonly shape: Shape
  readonly tokens: Tokens
  readonly conditions: Conditions
  readonly consts: Consts
  readonly utils: Utils
  readonly plugins: Plugins
}
interface OpenSystemTypeCarrier<
  Shape,
  Tokens extends object,
  Conditions extends object,
  Consts extends object,
  Utils extends object,
  Plugins extends string,
> {
  readonly [VANITY_OPEN_SYSTEM_TYPE]?: OpenSystemTypeMetadata<Shape, Tokens, Conditions, Consts, Utils, Plugins>
}
type OpenShape<System> = System extends { readonly consolidate: infer Consolidate }
  ? Consolidate extends (this: infer Carrier, ...args: any[]) => any
    ? Carrier extends { readonly [VANITY_OPEN_SYSTEM_TYPE]?: infer Metadata }
      ? NonNullable<Metadata>
      : never
    : never
  : never
type EmptySystemShape = VanitySystemShape<Record<never, never>, VanityDefaultTokenPolicy, Record<never, never>>
type PluginSystemShape<Plugin> = [OpenShape<PluginResult<Plugin>>] extends [never]
  ? EmptySystemShape
  : OpenShape<PluginResult<Plugin>> extends { readonly shape: infer Shape } ? Shape : EmptySystemShape
type PluginConstructors<Plugin>
  = Plugin extends { readonly __vanityPluginConstructors?: infer Constructors extends object }
    ? Constructors
    : ShapeConstructors<PluginSystemShape<Plugin>>
type PluginAxes<Plugin>
  = Plugin extends { readonly __vanityPluginAxes?: infer Axes extends VanityAxisDefinitions }
    ? Axes
    : ShapeAxes<PluginSystemShape<Plugin>>
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
  = [PluginRegisteredPolicy<Plugin>] extends [never] ? ShapePolicies<PluginSystemShape<Plugin>>
    : Plugin extends { readonly id: infer Id extends string }
      ? { readonly plugins: Readonly<Record<Id, PluginRegisteredPolicy<Plugin>>> }
      : Record<never, never>
type MountedPluginPolicies<Shape, Plugin>
  = VanityDefinitionMerge<'policies', ShapePolicies<Shape>, PluginPolicyBook<Plugin>>

interface VanitySystemPluginSystemShape {
  readonly id: string
  readonly version: string | number
  readonly fingerprint?: string
  readonly options?: unknown
  readonly setup: (...args: any[]) => object
  readonly dtcg?: readonly unknown[]
}

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
  = VanityRulesOf<Consts>

type WithRules<Consts extends object, Rules extends object>
  = VanityWithRules<Consts, Rules>

type PublicConsts<Consts extends object> = VanityPublicConsts<Consts>

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

type OpenNamespace<Shape, Utils extends object>
  = ShapeConstructors<Shape>
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

/** Build-time token handle that exposes semantic metadata before CSS is emitted. */
export type VanityLogicalTokenHandle<Handle extends VanityTokenHandleAny>
  = Readonly<Pick<
    Handle,
    '$var' | '$path' | '$type' | '$reference' | '$emit' | '$mutable' | '$description' | '$deprecated' | '$metadata' | 'toString'
  >>
  & VanityTokenInput<Handle['$type']>
  & { readonly $phase: 'logical' }

/** Recursively project resolved token handles into the emission-free open-system view. */
export type VanityLogicalTokens<T> = {
  readonly [Key in keyof T]: T[Key] extends VanityTokenHandleAny
    ? VanityLogicalTokenHandle<T[Key]>
    : T[Key] extends object ? VanityLogicalTokens<T[Key]> : T[Key]
}

/** Options that finalize an open system into a locked stylesheet contract. */
export interface VanityConsolidateOptions<
  Layers extends readonly string[] = VanityDefaultLayers,
  Prefix extends string = 'vanity',
  BaseConditions extends boolean = true,
> {
  /** Prefix custom-property names and generated class identities with this value. */
  readonly prefix?: Prefix
  /** Anchor root-scoped output to this selector; defaults to `:root`. */
  readonly root?: string
  /** Define the complete deterministic cascade-layer order for the system. */
  readonly layerOrder?: Layers
  /** Place emitted token declarations in one named layer from `layerOrder`. */
  readonly tokenLayer?: Layers[number]
  /** Include the base condition family generated by the system. */
  readonly baseConditions?: BaseConditions
  /** Set the environmental-axis order used by generated selectors and runtime metadata. */
  readonly axisOrder?: readonly string[]
  /** Promote selected audit categories when the locked system runs `audit()`. */
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
  /** Add or replace the axis modes. */
  readonly modes?: Readonly<Record<string, VanityConditionInput | import('./axes').VanityAxisTrigger>>
  /** Select the default mode after applying the patch. */
  readonly default?: string
  /** Set the tie-break order for overlapping mode arms. */
  readonly modeOrder?: readonly string[]
  /** Add value derivations for named modes. */
  readonly derive?: Readonly<Record<string, (modes: Readonly<Record<string, any>>) => unknown>>
  /** Provide query-free runtime activation for the axis. */
  readonly control?: import('./axes').VanityAxisControl<any>
  /** Configure native scheme behavior for the axis. */
  readonly native?: import('./axes').VanityNativeSchemePolicy
  /** Describe the axis in introspection and editor tooling. */
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

/** Definition input for one reusable system contribution. */
export interface VanityPluginDefinition<
  Options,
  Result extends object,
  Id extends string = string,
> {
  /** Stable public id used for requirements, ownership, and portable identity. */
  readonly id: Id
  /** Plugin release version stored in introspection and manifests. */
  readonly version: string | number
  /** Optional deterministic fingerprint for plugin behavior. */
  readonly fingerprint?: string
  /** DTCG codecs that make plugin-owned value semantics portable. */
  readonly dtcg?: readonly VanityDtcgCodec[]
  /** Project rich options onto deterministic JSON identity. */
  readonly optionsIdentity?: (options: Options) => unknown
  /** Extend the receiving system and return the plugin's public contribution. */
  readonly setup: (system: VanityPluginSetupSystem, options: Options) => Result
}

type VanityPluginConfigure<
  Options = undefined,
  Result extends object = object,
  Id extends string = string,
> = undefined extends Options
  ? (options?: Exclude<Options, undefined>) => VanitySystemPlugin<Options, Result, Id, true>
  : (options: Options) => VanitySystemPlugin<Options, Result, Id, true>

/** Callable unconfigured plugin and the configured immutable copies it creates. */
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

/** Public operations available while a system accumulates its authoring shape. */
export interface VanityOpenSystemMethods<
  Shape extends VanitySystemShape<any, any, any>,
  Tokens extends object,
  Conditions extends Record<string, VanityConditionInput>,
  Consts extends object,
  Utils extends object,
  Plugins extends string,
> {
  /** Logical token handles resolve after consolidation; they do not emit CSS here. */
  readonly t: VanityLogicalTokens<ResolvedTokens<
    Tokens,
    'vanity-open',
    ShapePolicy<Shape>,
    keyof Conditions & string | VanityBaseConditionName,
    keyof VanityAliasesOf<Consts> & string
  >>
  /** Named conditions available to token, recipe, atom, and rule authoring. */
  readonly conditions: Readonly<Conditions>
  /** Environmental axes accumulated by this open system. */
  readonly axes: Readonly<ShapeAxes<Shape>>
  /** JSON-safe constants published by this open system. */
  readonly consts: Readonly<PublicConsts<Consts>>
  /** Authored policies before consolidation resolves their defaults. */
  readonly policies: Readonly<VanityPolicies & ShapePolicies<Shape>>

  readonly definePolicies: typeof definePolicies
  readonly addPolicy: <const Name extends keyof VanityPolicies & string, const Value extends NonNullable<VanityPolicies[Name]>>(
    name: Name,
    value: Value | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Value),
  ) => VanityOpenSystem<ProjectSystemShape<Shape, Record<Name, Value>>, Tokens, Conditions, Consts, Utils, Plugins>
  readonly addPolicies: {
    <const Added extends VanityPolicies>(
      policies: Added | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Added),
    ): VanityOpenSystem<ProjectSystemShape<Shape, Added>, Tokens, Conditions, Consts, Utils, Plugins>
    <const Input extends VanityDefinitionModule<'policies', any> | readonly VanityDefinitionModule<'policies', any>[]>(
      policies: Input,
    ): VanityOpenSystem<
      ProjectSystemShape<Shape, DefinitionShape<'policies', Input>>,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
  }
  readonly overwritePolicy: <const Name extends keyof VanityPolicies & string, const Value extends NonNullable<VanityPolicies[Name]>>(
    name: Name,
    value: Value | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Value),
  ) => VanityOpenSystem<ProjectSystemShape<Shape, Record<Name, Value>>, Tokens, Conditions, Consts, Utils, Plugins>
  readonly overwritePolicies: {
    <const Patch extends VanityPolicies>(
      policies: Patch | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
    ): VanityOpenSystem<ProjectSystemShape<Shape, Patch>, Tokens, Conditions, Consts, Utils, Plugins>
    <const Input extends VanityDefinitionModule<'policies', any> | readonly VanityDefinitionModule<'policies', any>[]>(
      policies: Input,
    ): VanityOpenSystem<
      ProjectSystemShape<Shape, DefinitionShape<'policies', Input>>,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
  }
  readonly expectPolicy: <const Name extends keyof VanityPolicies & string>(
    name: Name,
  ) => VanityOpenSystem<WithSystemRequirements<Shape, { readonly policies: Name }>, Tokens, Conditions, Consts, Utils, Plugins>
  readonly expectPolicies: <const Names extends readonly (keyof VanityPolicies & string)[]>(
    names: Names,
  ) => VanityOpenSystem<WithSystemRequirements<Shape, { readonly policies: Names[number] }>, Tokens, Conditions, Consts, Utils, Plugins>

  readonly defineTokens: <
    const Seed extends VanityTokenTreeContext<ShapeAxes<Shape>> = Record<never, never>,
  >(
    seed?: Seed
      & VanityTokenTreeContext<ShapeAxes<Shape>>
      & VanityTokenTreeInputGuard<Seed, ShapeAxes<Shape>>,
  ) => VanityTokenBuilder<
    VanityTokenTreeGraph<Seed>,
    ShapePolicy<Shape>,
    ShapeAxes<Shape>
  >
  /**
   * Define advanced token traits or a typed reservation before consolidation.
   *
   * @example
   * `brand: open.tdef.color({ val: '#635bff', mutable: true })`
   */
  readonly tdef: VanityTdefFactory<ShapeAxes<Shape>>
  /**
   * Produce CSS declaration data over logical tokens; this never mutates runtime state.
   *
   * @example
   * `ds.class({ ...ds.tdec({ color: { brand: 'rebeccapurple' } }) })`
   */
  readonly tdec: (
    declarations: VanityTokenDeclarations<ResolvedTokens<Tokens, 'vanity-open', ShapePolicy<Shape>>>,
  ) => Record<`--${string}`, string | number>
  /** Serialize a core value using the open system's current policy context. */
  readonly serialize: <Type extends VanityCssDataType>(value: VanitySelfValue<Type>) => string

  /** Add token values, builders, modules, arrays, or axis-aware token trees. */
  readonly addTokens: {
    <const Inputs extends readonly (
      VanityTokenModule<any, any> | VanityTokenBuilder<any, any, any>
    )[]>(
      inputs: Inputs,
    ): VanityOpenSystem<
      Shape,
      VanityAdditiveGraph<Tokens, GraphsOfInputs<Inputs>>,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Input extends VanityTokenModule<any, any> | VanityTokenBuilder<any, any, any> | VanityTokenTreeContext<ShapeAxes<Shape>>>(
      input: Input & VanityCompositionGuard<Tokens, GraphOf<Input>>,
    ): VanityOpenSystem<Shape, VanityAdditiveGraph<Tokens, GraphOf<Input>>, Conditions, Consts, Utils, Plugins>
    <const Input extends VanityTokenModule<any, any> | VanityTokenBuilder<any, any, any> | VanityTokenTreeContext<ShapeAxes<Shape>>>(
      factory: (system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Input & VanityCompositionGuard<Tokens, GraphOf<Input>>,
    ): VanityOpenSystem<Shape, VanityAdditiveGraph<Tokens, GraphOf<Input>>, Conditions, Consts, Utils, Plugins>
  }
  readonly addToken: {
    <const Name extends string, const Input extends VanityLeafInput | VanityDerivedResult | VanityTokenConfig>(
      name: Name extends keyof Tokens ? never : Name,
      input: Input,
    ): VanityOpenSystem<Shape, VanityAdditiveGraph<Tokens, Record<Name, Input>>, Conditions, Consts, Utils, Plugins>
    <const Name extends string, const Input extends VanityLeafInput | VanityDerivedResult | VanityTokenConfig>(
      name: Name extends keyof Tokens ? never : Name,
      input: (system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Input,
    ): VanityOpenSystem<Shape, VanityAdditiveGraph<Tokens, Record<Name, Input>>, Conditions, Consts, Utils, Plugins>
  }
  readonly augmentToken: <const Name extends keyof Tokens & string>(
    name: Name,
    patch: TokenPatch<ResolvedTokenAt<Tokens, Name, ShapePolicy<Shape>>, ShapeAxes<Shape>>
      | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) =>
      TokenPatch<ResolvedTokenAt<Tokens, Name, ShapePolicy<Shape>>, ShapeAxes<Shape>>),
  ) => VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>
  readonly augmentTokens: {
    <const Inputs extends readonly (
      VanityTokenModule<any, any> | VanityTokenBuilder<any, any, any>
    )[]>(
      inputs: Inputs & (
        GraphsOfInputs<Inputs> extends TokenPatch<
          ResolvedTokens<Tokens, 'vanity-open', ShapePolicy<Shape>>,
          ShapeAxes<Shape>
        > ? unknown : never
      ),
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>
    <const Input extends VanityTokenModule<any, any> | VanityTokenBuilder<any, any, any>>(
      input: Input & (
        GraphOf<Input> extends TokenPatch<
          ResolvedTokens<Tokens, 'vanity-open', ShapePolicy<Shape>>,
          ShapeAxes<Shape>
        > ? unknown : never
      ),
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>
    (
      patch: TokenPatch<ResolvedTokens<Tokens, 'vanity-open', ShapePolicy<Shape>>, ShapeAxes<Shape>>
        | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) =>
        TokenPatch<ResolvedTokens<Tokens, 'vanity-open', ShapePolicy<Shape>>, ShapeAxes<Shape>>),
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>
  }
  readonly overwriteToken: <const Name extends keyof Tokens & string>(
    name: Name,
    patch: TokenPatch<ResolvedTokenAt<Tokens, Name, ShapePolicy<Shape>>, ShapeAxes<Shape>>
      | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) =>
      TokenPatch<ResolvedTokenAt<Tokens, Name, ShapePolicy<Shape>>, ShapeAxes<Shape>>),
  ) => VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>
  readonly overwriteTokens: {
    <const Inputs extends readonly (
      VanityTokenModule<any, any> | VanityTokenBuilder<any, any, any>
    )[]>(
      inputs: Inputs & (
        GraphsOfInputs<Inputs> extends TokenPatch<
          ResolvedTokens<Tokens, 'vanity-open', ShapePolicy<Shape>>,
          ShapeAxes<Shape>
        > ? unknown : never
      ),
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>
    <const Input extends VanityTokenModule<any, any> | VanityTokenBuilder<any, any, any>>(
      input: Input & (
        GraphOf<Input> extends TokenPatch<
          ResolvedTokens<Tokens, 'vanity-open', ShapePolicy<Shape>>,
          ShapeAxes<Shape>
        > ? unknown : never
      ),
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>
    (
      patch: TokenPatch<ResolvedTokens<Tokens, 'vanity-open', ShapePolicy<Shape>>, ShapeAxes<Shape>>
        | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) =>
        TokenPatch<ResolvedTokens<Tokens, 'vanity-open', ShapePolicy<Shape>>, ShapeAxes<Shape>>),
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>
  }

  readonly defineConditions: typeof defineConditions
  readonly addCondition: <const Name extends string, const Input extends VanityConditionInput>(
    name: Name extends keyof Conditions ? never : Name,
    condition: Input | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Input),
  ) => VanityOpenSystem<Shape, Tokens, Conditions & Record<Name, Input>, Consts, Utils, Plugins>
  readonly addConditions: {
    <const Added extends Record<string, VanityConditionInput>>(
      factory: (system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) =>
        Added & AdditiveRecordGuard<Conditions, Added>,
    ): VanityOpenSystem<Shape, Tokens, Conditions & Added, Consts, Utils, Plugins>
    <const Added extends Record<string, VanityConditionInput>>(
      conditions: Added & AdditiveRecordGuard<Conditions, Added>,
    ): VanityOpenSystem<Shape, Tokens, Conditions & Added, Consts, Utils, Plugins>
    <const Input extends
    | VanityDefinitionModule<'conditions', Record<string, VanityConditionInput>>
    | readonly VanityDefinitionModule<'conditions', Record<string, VanityConditionInput>>[]>(
      conditions: Input,
    ): VanityOpenSystem<
      Shape,
      Tokens,
      Conditions & DefinitionShape<'conditions', Input>,
      Consts,
      Utils,
      Plugins
    >
  }
  readonly overwriteCondition: <const Name extends keyof Conditions & string, const Input extends VanityConditionInput>(
    name: Name,
    condition: Input | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Input),
  ) => VanityOpenSystem<Shape, Tokens, Omit<Conditions, Name> & Record<Name, Input>, Consts, Utils, Plugins>
  readonly overwriteConditions: {
    <const Patch extends Record<string, VanityConditionInput>>(
      factory: (system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) =>
        Patch & ExistingRecordGuard<Conditions, Patch>,
    ): VanityOpenSystem<Shape, Tokens, Omit<Conditions, keyof Patch> & Patch, Consts, Utils, Plugins>
    <const Patch extends Record<string, VanityConditionInput>>(
      conditions: Patch & ExistingRecordGuard<Conditions, Patch>,
    ): VanityOpenSystem<Shape, Tokens, Omit<Conditions, keyof Patch> & Patch, Consts, Utils, Plugins>
    <const Input extends
    | VanityDefinitionModule<'conditions', Record<string, VanityConditionInput>>
    | readonly VanityDefinitionModule<'conditions', Record<string, VanityConditionInput>>[]>(
      conditions: Input,
    ): VanityOpenSystem<
      Shape,
      Tokens,
      Omit<Conditions, keyof DefinitionShape<'conditions', Input>> & DefinitionShape<'conditions', Input>,
      Consts,
      Utils,
      Plugins
    >
  }

  readonly addAxis: {
    <const Name extends string, const Modes extends readonly [string, ...string[]]>(
      name: Name extends keyof ShapeAxes<Shape> ? never : Name,
      modes: Modes,
    ): VanityOpenSystem<
      VanitySystemShape<
        ShapeConstructors<Shape>,
        ShapePolicy<Shape>,
        ShapeAxes<Shape> & Record<Name, VanityAxisDefinition<Record<Modes[number], VanityAxisModeInput>>>,
        ShapeRequirements<Shape>,
        ShapePolicies<Shape>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Name extends string, const Input extends VanityAxisDefinition<any, any> | VanityOpenAxisConfig<any, any>>(
      name: Name extends keyof ShapeAxes<Shape> ? never : Name,
      input: Input,
    ): VanityOpenSystem<
      VanitySystemShape<
        ShapeConstructors<Shape>,
        ShapePolicy<Shape>,
        ShapeAxes<Shape> & Record<Name, OpenAxisDefinition<Input>>,
        ShapeRequirements<Shape>,
        ShapePolicies<Shape>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Name extends string, const Input extends VanityAxisDefinition<any, any> | VanityOpenAxisConfig<any, any>>(
      name: Name extends keyof ShapeAxes<Shape> ? never : Name,
      factory: (system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Input,
    ): VanityOpenSystem<
      VanitySystemShape<
        ShapeConstructors<Shape>,
        ShapePolicy<Shape>,
        ShapeAxes<Shape> & Record<Name, OpenAxisDefinition<Input>>,
        ShapeRequirements<Shape>,
        ShapePolicies<Shape>
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
        system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>,
      ) => Added,
    ): VanityOpenSystem<
      VanitySystemShape<ShapeConstructors<Shape>, ShapePolicy<Shape>, ShapeAxes<Shape> & OpenAxisRecord<Added>, ShapeRequirements<Shape>, ShapePolicies<Shape>>,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
    <const Added extends Record<string, VanityAxisModuleInput>>(
      axes: Added,
    ): VanityOpenSystem<
      VanitySystemShape<ShapeConstructors<Shape>, ShapePolicy<Shape>, ShapeAxes<Shape> & OpenAxisRecord<Added>, ShapeRequirements<Shape>, ShapePolicies<Shape>>,
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
      VanitySystemShape<
        ShapeConstructors<Shape>,
        ShapePolicy<Shape>,
        ShapeAxes<Shape> & OpenAxisRecord<DefinitionShape<'axes', Input>>,
        ShapeRequirements<Shape>,
        ShapePolicies<Shape>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
  }
  readonly augmentAxis: <
    const Name extends keyof ShapeAxes<Shape> & string,
    const Patch extends VanityAxisPatch,
  >(
    name: Name,
    patch: Patch | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
  ) => VanityOpenSystem<
    VanitySystemShape<
      ShapeConstructors<Shape>,
      ShapePolicy<Shape>,
      Omit<ShapeAxes<Shape>, Name> & Record<Name, PatchedAxis<ShapeAxes<Shape>[Name], Patch>>,
      ShapeRequirements<Shape>,
      ShapePolicies<Shape>
    >,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly augmentAxes: {
    <const Patch extends Partial<Record<keyof ShapeAxes<Shape>, VanityAxisPatch>>>(
      patch: Patch | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
    ): VanityOpenSystem<
      VanitySystemShape<
        ShapeConstructors<Shape>,
        ShapePolicy<Shape>,
        PatchedAxes<ShapeAxes<Shape>, Patch>,
        ShapeRequirements<Shape>,
        ShapePolicies<Shape>
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
        DefinitionShape<'axes', Input> extends Partial<Record<keyof ShapeAxes<Shape>, VanityAxisPatch>>
          ? unknown
          : never
      ),
    ): VanityOpenSystem<
      VanitySystemShape<
        ShapeConstructors<Shape>,
        ShapePolicy<Shape>,
        PatchedAxes<ShapeAxes<Shape>, DefinitionShape<'axes', Input>>,
        ShapeRequirements<Shape>,
        ShapePolicies<Shape>
      >,
      Tokens,
      Conditions,
      Consts,
      Utils,
      Plugins
    >
  }
  readonly overwriteAxis: <
    const Name extends keyof ShapeAxes<Shape> & string,
    const Patch extends VanityAxisPatch,
  >(
    name: Name,
    patch: Patch | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
  ) => VanityOpenSystem<
    VanitySystemShape<
      ShapeConstructors<Shape>,
      ShapePolicy<Shape>,
      Omit<ShapeAxes<Shape>, Name> & Record<Name, PatchedAxis<ShapeAxes<Shape>[Name], Patch>>,
      ShapeRequirements<Shape>,
      ShapePolicies<Shape>
    >,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly overwriteAxes: {
    <const Patch extends Partial<Record<keyof ShapeAxes<Shape>, VanityAxisPatch>>>(
      patch: Patch | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
    ): VanityOpenSystem<
      VanitySystemShape<
        ShapeConstructors<Shape>,
        ShapePolicy<Shape>,
        PatchedAxes<ShapeAxes<Shape>, Patch>,
        ShapeRequirements<Shape>,
        ShapePolicies<Shape>
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
        DefinitionShape<'axes', Input> extends Partial<Record<keyof ShapeAxes<Shape>, VanityAxisPatch>>
          ? unknown
          : never
      ),
    ): VanityOpenSystem<
      VanitySystemShape<
        ShapeConstructors<Shape>,
        ShapePolicy<Shape>,
        PatchedAxes<ShapeAxes<Shape>, DefinitionShape<'axes', Input>>,
        ShapeRequirements<Shape>,
        ShapePolicies<Shape>
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
        system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>,
      ) => Value & JsonConst<Value>,
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts & Record<Name, Value>, Utils, Plugins>
    <const Name extends string, const Value>(
      name: Name extends keyof PublicConsts<Consts> ? never : Name,
      value: Value & JsonConst<Value>,
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts & Record<Name, Value>, Utils, Plugins>
  }
  readonly addConsts: {
    <const Added extends object>(
      factory: (system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) =>
        Added & JsonConst<Added> & AdditiveRecordGuard<PublicConsts<Consts>, Added>,
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts & Added, Utils, Plugins>
    <const Added extends object>(
      consts: Added & JsonConst<Added> & AdditiveRecordGuard<PublicConsts<Consts>, Added>,
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts & Added, Utils, Plugins>
    <const Input extends
    | VanityDefinitionModule<'consts', object>
    | readonly VanityDefinitionModule<'consts', object>[]>(
      consts: Input,
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts & DefinitionShape<'consts', Input>, Utils, Plugins>
  }
  readonly overwriteConst: {
    <const Name extends keyof PublicConsts<Consts> & string, const Value>(
      name: Name,
      factory: (
        system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>,
      ) => Value & JsonConst<Value>,
    ): VanityOpenSystem<Shape, Tokens, Conditions, Omit<Consts, Name> & Record<Name, Value>, Utils, Plugins>
    <const Name extends keyof PublicConsts<Consts> & string, const Value>(
      name: Name,
      value: Value & JsonConst<Value>,
    ): VanityOpenSystem<Shape, Tokens, Conditions, Omit<Consts, Name> & Record<Name, Value>, Utils, Plugins>
  }
  readonly overwriteConsts: {
    <const Patch extends object>(
      factory: (system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) =>
        Patch & JsonConst<Patch> & ExistingRecordGuard<PublicConsts<Consts>, Patch>,
    ): VanityOpenSystem<Shape, Tokens, Conditions, Omit<Consts, keyof Patch> & Patch, Utils, Plugins>
    <const Patch extends object>(
      consts: Patch & JsonConst<Patch> & ExistingRecordGuard<PublicConsts<Consts>, Patch>,
    ): VanityOpenSystem<Shape, Tokens, Conditions, Omit<Consts, keyof Patch> & Patch, Utils, Plugins>
    <const Input extends
    | VanityDefinitionModule<'consts', object>
    | readonly VanityDefinitionModule<'consts', object>[]>(
      consts: Input,
    ): VanityOpenSystem<
      Shape,
      Tokens,
      Conditions,
      Omit<Consts, keyof DefinitionShape<'consts', Input>> & DefinitionShape<'consts', Input>,
      Utils,
      Plugins
    >
  }

  readonly defineUtils: typeof defineUtils
  readonly addUtil: <const Name extends string, const Value extends (...args: any[]) => unknown>(
    name: Name extends keyof OpenNamespace<Shape, Utils> ? never : Name,
    value: Value,
  ) => VanityOpenSystem<Shape, Tokens, Conditions, Consts, VanityDefinitionMerge<'utils', Utils, Record<Name, Value>>, Plugins>
  readonly addUtils: {
    <const Added extends VanityUtilTree>(
      utils: Added & RecursiveUtilityGuard<OpenNamespace<Shape, Utils>, Added>,
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts, VanityDefinitionMerge<'utils', Utils, Added>, Plugins>
    <const Added extends VanityUtilTree>(
      factory: (system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) =>
        Added & RecursiveUtilityGuard<OpenNamespace<Shape, Utils>, Added>,
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts, VanityDefinitionMerge<'utils', Utils, Added>, Plugins>
    <const Input extends
    | VanityDefinitionModule<'utils', VanityUtilTree>
    | readonly VanityDefinitionModule<'utils', VanityUtilTree>[]>(
      utils: Input,
    ): VanityOpenSystem<
      Shape,
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
    name: Name extends keyof OpenNamespace<Shape, Utils> ? never : Name,
    definition: Definition
      | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Definition),
  ) => VanityOpenSystem<
    VanitySystemShape<
      ProjectConstructors<
        ShapeConstructors<Shape> & Record<Name, VanityConstructorFamily<Definition>>,
        ShapePolicies<Shape>
      >,
      ShapePolicy<Shape>,
      ShapeAxes<Shape>,
      ShapeRequirements<Shape>,
      ShapePolicies<Shape>
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
        | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Added),
    ): VanityOpenSystem<
      VanitySystemShape<
        ProjectConstructors<
          ShapeConstructors<Shape> & ConstructorFamilies<Added>,
          ShapePolicies<Shape>
        >,
        ShapePolicy<Shape>,
        ShapeAxes<Shape>,
        ShapeRequirements<Shape>,
        ShapePolicies<Shape>
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
      VanitySystemShape<
        ProjectConstructors<
          ShapeConstructors<Shape> & ConstructorFamilies<DefinitionShape<'constructors', Input>>,
          ShapePolicies<Shape>
        >,
        ShapePolicy<Shape>,
        ShapeAxes<Shape>,
        ShapeRequirements<Shape>,
        ShapePolicies<Shape>
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
    rule: Rule | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Rule),
  ) => VanityOpenSystem<
    Shape,
    Tokens,
    Conditions,
    WithRules<Consts, RulesOf<Consts> & Record<Name, Rule>>,
    Utils,
    Plugins
  >
  readonly addRules: {
    <const Added extends Readonly<Record<string, VanitySystemRule>>>(
      rules: Added | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Added),
    ): VanityOpenSystem<
      Shape,
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
      Shape,
      Tokens,
      Conditions,
      WithRules<Consts, RulesOf<Consts> & DefinitionShape<'rules', Input>>,
      Utils,
      Plugins
    >
  }
  readonly overwriteRule: <const Name extends keyof RulesOf<Consts> & string, const Patch extends Partial<VanitySystemRule>>(
    name: Name,
    patch: Patch | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
  ) => VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>
  readonly overwriteRules: {
    <const Patch extends Partial<Record<keyof RulesOf<Consts>, Partial<VanitySystemRule>>>>(
      rules: Patch | ((system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>) => Patch),
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>
    <const Input extends
    | VanityDefinitionModule<'rules', object>
    | readonly VanityDefinitionModule<'rules', object>[]>(
      rules: Input & (
        DefinitionShape<'rules', Input> extends Partial<Record<keyof RulesOf<Consts>, Partial<VanitySystemRule>>>
          ? unknown
          : never
      ),
    ): VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>
  }

  readonly addPlugin: {
    <const Plugin extends VanitySystemPluginSystemShape>(
      plugin: Plugin
        & PluginRequirementGuard<Shape, Tokens, Conditions, Consts, Utils, Plugins, Plugin>
        & PluginConfigurationGuard<Plugin>,
    ): VanityOpenSystem<
      VanitySystemShape<
        ProjectConstructors<
          ShapeConstructors<Shape> & PluginConstructors<Plugin>,
          MountedPluginPolicies<Shape, Plugin>
        >,
        ShapePolicy<Shape>,
        ShapeAxes<Shape> & PluginAxes<Plugin>,
        ShapeRequirements<Shape>,
        MountedPluginPolicies<Shape, Plugin>
      >,
      Tokens & PluginTokens<Plugin>,
      Conditions & PluginConditions<Plugin>,
      Consts & PluginConstsAndRules<Plugin>,
      Utils & PluginUtils<Plugin>,
      Plugins | Plugin['id']
    >
    <const Plugin extends VanitySystemPluginSystemShape>(
      factory: (
        system: VanityOpenSystem<Shape, Tokens, Conditions, Consts, Utils, Plugins>,
      ) => Plugin
        & PluginRequirementGuard<Shape, Tokens, Conditions, Consts, Utils, Plugins, Plugin>
        & PluginConfigurationGuard<Plugin>,
    ): VanityOpenSystem<
      VanitySystemShape<
        ProjectConstructors<
          ShapeConstructors<Shape> & PluginConstructors<Plugin>,
          MountedPluginPolicies<Shape, Plugin>
        >,
        ShapePolicy<Shape>,
        ShapeAxes<Shape> & PluginAxes<Plugin>,
        ShapeRequirements<Shape>,
        MountedPluginPolicies<Shape, Plugin>
      >,
      Tokens & PluginTokens<Plugin>,
      Conditions & PluginConditions<Plugin>,
      Consts & PluginConstsAndRules<Plugin>,
      Utils & PluginUtils<Plugin>,
      Plugins | Plugin['id']
    >
  }

  readonly expectTokens: <const Expected extends object>(
    shape: Expected,
  ) => VanityOpenSystem<
    WithSystemRequirements<Shape, { readonly tokens: Expected }>,
    Tokens & ExpectationGraph<Expected>,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly expectToken: <const Name extends string, const Expected extends object | true = true>(
    name: Name,
    shape?: Expected,
  ) => VanityOpenSystem<
    WithSystemRequirements<Shape, { readonly tokens: Record<Name, Expected> }>,
    Tokens & Record<Name, ExpectationGraph<Expected>>,
    Conditions,
    Consts,
    Utils,
    Plugins
  >
  readonly expectAxis: <const Name extends string, const Modes extends readonly string[] = readonly []>(
    name: Name,
    modes?: Modes,
  ) => VanityOpenSystem<
    VanitySystemShape<
      ShapeConstructors<Shape>,
      ShapePolicy<Shape>,
      ShapeAxes<Shape> & Record<Name, VanityAxisDefinition<Record<Modes[number], VanityAxisModeInput>>>,
      ShapeRequirements<Shape> & { readonly axes: Record<Name, Modes> },
      ShapePolicies<Shape>
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
    VanitySystemShape<
      ShapeConstructors<Shape>,
      ShapePolicy<Shape>,
      ShapeAxes<Shape> & {
        readonly [Name in keyof Axes]: VanityAxisDefinition<Record<Axes[Name][number], VanityAxisModeInput>>
      },
      ShapeRequirements<Shape> & { readonly axes: Axes },
      ShapePolicies<Shape>
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
    WithSystemRequirements<Shape, { readonly conditions: Record<Name, true> }>,
    Tokens,
    Conditions & Record<Name, VanityConditionInput>,
    Consts,
    Utils,
    Plugins
  >
  readonly expectConditions: <const Expected extends object>(
    shape: Expected,
  ) => VanityOpenSystem<
    WithSystemRequirements<Shape, { readonly conditions: Expected }>,
    Tokens,
    Conditions & ExistenceGraph<Expected, VanityConditionInput>,
    Consts,
    Utils,
    Plugins
  >
  readonly expectConst: <const Name extends string>(
    name: Name,
  ) => VanityOpenSystem<
    WithSystemRequirements<Shape, { readonly consts: Record<Name, true> }>,
    Tokens,
    Conditions,
    Consts & Record<Name, unknown>,
    Utils,
    Plugins
  >
  readonly expectConsts: <const Expected extends object>(
    shape: Expected,
  ) => VanityOpenSystem<
    WithSystemRequirements<Shape, { readonly consts: Expected }>,
    Tokens,
    Conditions,
    Consts & ExistenceGraph<Expected, unknown>,
    Utils,
    Plugins
  >
  readonly expectUtil: <const Path extends string>(
    path: Path,
  ) => VanityOpenSystem<
    WithSystemRequirements<Shape, { readonly utils: Path }>,
    Tokens,
    Conditions,
    Consts,
    Utils & PathTree<Path, (...args: any[]) => unknown>,
    Plugins
  >
  readonly expectUtils: <const Paths extends readonly string[]>(
    paths: Paths,
  ) => VanityOpenSystem<
    WithSystemRequirements<Shape, { readonly utils: Paths[number] }>,
    Tokens,
    Conditions,
    Consts,
    Utils & UnionToIntersection<PathTree<Paths[number], (...args: any[]) => unknown>>,
    Plugins
  >
  readonly expectRule: <const Name extends string>(
    name: Name,
  ) => VanityOpenSystem<
    WithSystemRequirements<Shape, { readonly rules: Name }>,
    Tokens,
    Conditions,
    WithRules<Consts, RulesOf<Consts> & Record<Name, VanitySystemRule>>,
    Utils,
    Plugins
  >
  readonly expectRules: <const Names extends readonly string[]>(
    names: Names,
  ) => VanityOpenSystem<
    WithSystemRequirements<Shape, { readonly rules: Names[number] }>,
    Tokens,
    Conditions,
    WithRules<Consts, RulesOf<Consts> & Record<Names[number], VanitySystemRule>>,
    Utils,
    Plugins
  >
  readonly expectPlugin: <const Id extends string>(
    id: Id,
  ) => VanityOpenSystem<WithSystemRequirements<Shape, { readonly plugins: Id }>, Tokens, Conditions, Consts, Utils, Plugins>
  readonly expectConstructor: <const Name extends string>(
    name: Name,
  ) => VanityOpenSystem<
    VanitySystemShape<
      ShapeConstructors<Shape> & Record<Name, (...args: any[]) => VanityValue>,
      ShapePolicy<Shape>,
      ShapeAxes<Shape>,
      ShapeRequirements<Shape> & { readonly constructors: Record<Name, unknown> },
      ShapePolicies<Shape>
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
    VanitySystemShape<
      ShapeConstructors<Shape> & Record<Names[number], (...args: any[]) => VanityValue>,
      ShapePolicy<Shape>,
      ShapeAxes<Shape>,
      ShapeRequirements<Shape> & { readonly constructors: Record<Names[number], unknown> },
      ShapePolicies<Shape>
    >,
    Tokens,
    Conditions,
    Consts,
    Utils,
    Plugins
  >

  /** Finalize the accumulated shape into an immutable locked system. */
  readonly consolidate: {
    <
      const Layers extends readonly string[] = VanityDefaultLayers,
      Prefix extends string = 'vanity',
      BaseConditions extends boolean = true,
      const AxisOrder extends readonly (keyof ShapeAxes<Shape> & string)[] = readonly (keyof ShapeAxes<Shape> & string)[],
    >(
      this: {
        readonly consolidate: unknown
      } & OpenSystemTypeCarrier<Shape, Tokens, Conditions, Consts, Utils, Plugins>,
      options?: VanityConsolidateOptions<Layers, Prefix, BaseConditions> & {
        readonly axisOrder?: VanityAxisOrderGuard<ShapeAxes<Shape>, AxisOrder>
      },
    ): VanityLockedSystem<
      ResolvedTokens<
        Tokens,
        Prefix,
        ShapePolicy<Shape>,
        VanityConditionKeyName<VanitySystemConditionName<Conditions, BaseConditions>>,
        keyof VanityAliasesOf<Consts> & string
      >,
      VanitySystemConditionName<Conditions, BaseConditions>,
      Layers[number],
      ShapeConstructors<Shape>,
      ShapeAxes<Shape>,
      Consts,
      Utils,
      VanityPolicies & ShapePolicies<Shape>
    >
  }
}

/**
 * The immutable accumulating system returned by `createSystem()`.
 *
 * @example
 * `const open: VanityOpenSystem = createSystem()`
 */
export type VanityOpenSystem<
  Shape extends VanitySystemShape<any, any, any> = VanitySystemShape,
  Tokens extends object = Record<never, never>,
  Conditions extends Record<string, VanityConditionInput> = Record<never, never>,
  Consts extends object = Record<never, never>,
  Utils extends object = Record<never, never>,
  Plugins extends string = never,
> = Readonly<ShapeConstructors<Shape>>
  & Readonly<Utils>
  & VanityOpenSystemMethods<Shape, Tokens, Conditions, Consts, Utils, Plugins>

/**
 * Compact open-system helper boundary. It deliberately exposes only the
 * built-in constructor kit and system-bound token-definition surface; shape
 * accumulation methods stay on the concrete `VanityOpenSystem<…>` type.
 */
export type VanityOpenSystemBase
  = Readonly<VanityCanonicalConstructors<VanityLengthUnit>>
    & Pick<
      VanityOpenSystemMethods<
        VanitySystemShape,
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
    VanitySystemShape<
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

/** Restricted open-system surface available while a plugin installs its contribution. */
export type VanityPluginSetupSystem<
  RegisteredPolicy extends object = Record<never, never>,
> = VanityPluginSetupBase & {
  /** Type-only record of policy data registered by this plugin. */
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

type OpenState = OpenSystemState

function getValueContext(state: OpenState): VanityValueOperationContext {
  const policies = resolvePolicies(state.policies, {
    support: state.policies.support ?? VANITY_DEFAULT_CSS_SUPPORT,
  })
  return {
    values: state.values,
    policies,
  }
}

function getTokenPolicyOfState(state: OpenState): VanityTokenPolicy {
  const policies = resolvePolicies(state.policies, {
    support: state.policies.support ?? VANITY_DEFAULT_CSS_SUPPORT,
  })
  return Object.freeze({
    reference: policies.tokens.reference,
    emit: policies.tokens.emit,
  })
}

function getTokenRequirementOfState(state: OpenState) {
  const prior = getTokenModuleRequirement(state.tokens)
  return getSystemTokenModuleRequirement(
    state.values,
    getValueContext(state),
    state.axes,
    prior?.compatibleCapabilitySignatures,
  )
}

function previewTokenModule(state: OpenState, module: object): object {
  const context = getValueContext(state)
  return resolveTokenModule(module, {
    prefix: 'vanity-open',
    root: ':root',
    serializeValue: value => serializeValueWithContext(context, value),
    support: context.policies.support,
    policies: context.policies,
    axes: state.axes,
    dtcgCodecIds: new Set(state.codecs.map(codec => codec.extension)),
    emitCss: false,
  }) as object
}

const OPEN_ONLY_MISUSE = new Set(['class', 'rules', 'raw', 'recipe', 'anatomy', 'atoms', 'runtime', 'snapshotFrom'])
const OPEN_STATE_PLUGIN_CONTEXT = new WeakMap<object, string | undefined>()

/** Define a callable plugin; each call returns an immutable configured copy. */
export function definePlugin<
  const Id extends string,
  Options = undefined,
  Result extends object = object,
>(
  definition: VanityPluginDefinition<Options, Result, Id>,
): VanitySystemPlugin<Options, Result, Id, false> {
  if (!definition.id || String(definition.version).length === 0) {
    throwOpenError(
      'VANITY_SYSTEM_INVALID_DEFINITION',
      'definePlugin() needs a stable id and version',
      ['plugin', 'id'],
      'provide a non-empty string id and version for the plugin definition',
    )
  }

  const configurePlugin = (options: Options | undefined): VanitySystemPlugin<Options, Result, Id, any> => {
    const callable = ((next?: Options) => configurePlugin(next)) as VanitySystemPlugin<Options, Result, Id, any>
    const optionFingerprint = options === undefined
      ? undefined
      : getStableOptions(definition.optionsIdentity?.(options) ?? options)
    Object.defineProperties(callable, {
      ...Object.getOwnPropertyDescriptors(definition),
      ...(options === undefined ? {} : { options: { enumerable: true, value: copyImmutable(options) } }),
      fingerprint: {
        enumerable: true,
        value: [definition.fingerprint, optionFingerprint].filter(Boolean).join(':') || undefined,
      },
      [VANITY_SYSTEM_PLUGIN]: { value: true },
      __vanityPluginConfigured: { value: options !== undefined },
    })
    return Object.freeze(callable)
  }

  return configurePlugin(undefined) as VanitySystemPlugin<Options, Result, Id, false>
}

function replaceAxis(
  registry: VanityAxisRegistry,
  name: string,
  definition: VanityAxisDefinition,
): VanityAxisRegistry {
  return Object.freeze({
    definitions: Object.freeze({ ...registry.definitions, [name]: definition }),
    order: Object.freeze([...registry.order]),
  })
}

export function materializeOpen(
  state: OpenState,
  pluginContext: string | null | undefined = OPEN_STATE_PLUGIN_CONTEXT.get(state),
): VanityOpenSystem<any, any, any, any, any, any> {
  const activePluginContext = pluginContext === null ? undefined : pluginContext
  OPEN_STATE_PLUGIN_CONTEXT.set(state, activePluginContext)
  let surface: VanityOpenSystem<any, any, any, any, any, any>
  let preview: object | undefined
  const getPreviewLogicalTokens = () => {
    preview ??= previewTokenModule(state, state.tokens as object) as object
    return preview
  }
  const getDeclarationGrammar = () => {
    const constructors = state.values.constructors as Record<PropertyKey, unknown>
    const aliasConfig = constructors[VANITY_PROPERTY_ALIASES]
      ?? (state.consts as Record<PropertyKey, unknown>)[VANITY_PROPERTY_ALIASES]
    return {
      conditions: new Set([
        ...Object.keys(createBaseConditions()),
        ...Object.keys(state.conditions),
      ]),
      ...(aliasConfig && typeof aliasConfig === 'object'
        ? { aliases: (aliasConfig as { readonly aliases: Readonly<Record<string, string>> }).aliases }
        : {}),
    }
  }
  const getLogicalTokens = () => {
    const grammar = getDeclarationGrammar()
    const tokens = getPreviewLogicalTokens()
    attachTokenDeclarationGetters(tokens, grammar)
    return createLogicalTokenTree(tokens, grammar)
  }
  const materializeNextOpenSystem = (patch: Partial<OpenState>) => materializeOpen({
    ...state,
    ...patch,
  }, activePluginContext)
  const resolveRecordInput = (
    kind: VanityDefinitionKind,
    input: unknown,
  ): Record<string, any> => {
    const resolved = typeof input === 'function'
      ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
      : input
    return resolveDefinitionInput(kind, resolved) as Record<string, any>
  }
  const applyTokenPatch = (mode: 'augment' | 'overwrite', input: unknown) => {
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
    if (!patch || typeof patch !== 'object') {
      throwOpenError(
        'VANITY_TOKENS_INVALID_DEFINITION',
        `${mode}Tokens() needs a token-shaped object, module, module array, or callback`,
        `${mode}Tokens`,
        'pass a token object, unfinished token module, module array, or callback',
      )
    }
    const unwrapped = isTokenBuilder(patch)
      ? getTokenModule(patch)
      : patch
    const isModule = isTokenModule(unwrapped)
    const paths = isModule
      ? getTokenModulePaths(
        unwrapped,
        previewTokenModule(state, unwrapped as object),
      ) ?? []
      : getFlattenedPaths(patch)
    const sequence = state.sequence + 1
    return materializeNextOpenSystem({
      tokens: (mode === 'augment'
        ? augmentTokenDefinition(state.tokens, unwrapped)
        : overwriteTokenDefinition(state.tokens, unwrapped)) as object,
      sequence,
      revisions: Object.freeze({
        ...state.revisions,
        tokens: Object.freeze({
          ...state.revisions.tokens,
          ...Object.fromEntries(paths.map(path => [path, sequence])),
        }),
      }),
      provenance: Object.freeze({
        ...state.provenance,
        overwrites: Object.freeze([
          ...state.provenance.overwrites,
          getProvenancePaths('tokens', paths, mode),
        ]),
      }),
    })
  }
  const applyPolicyPatch = (mode: 'add' | 'overwrite', input: unknown) => {
    const patch = resolveRecordInput('policies', input)
    if (!isPlainRecord(patch)) {
      throwOpenError(
        'VANITY_POLICY_INVALID',
        `${mode}Policies() needs one plain policy object or callback`,
        `${mode}Policies`,
        'pass one plain policy object or a callback that returns one',
      )
    }
    const policies = mode === 'add'
      ? addPolicies(state.policies, patch as VanityPolicies)
      : overwritePolicies(state.policies, patch as VanityPolicies)
    const sequence = state.sequence + 1
    const restrictionRevisions = { ...state.revisions.restrictions }
    for (const [name, policy] of Object.entries(patch.constructors ?? {}) as [string, VanityConstructorPolicy][]) {
      if (policy.restrict !== undefined)
        restrictionRevisions[name] = sequence
    }
    return materializeNextOpenSystem({
      policies,
      sequence,
      revisions: Object.freeze({
        ...state.revisions,
        restrictions: Object.freeze(restrictionRevisions),
      }),
    })
  }
  const axes = state.axes
  const tdef = createTdefFactory(createTokenFactory(axes), axes)
  const defineTokens = (seed: object = {}) => defineSystemTokens({
    defineModule: graph => defineTokenModule(
      getTokenRequirementOfState(state),
      getTokenPolicyOfState(state),
      graph,
    ),
    tdef: tdef as any,
    axes,
    preview: module => previewTokenModule(state, module),
  }, seed as VanityTokenTreeContext<any>)
  const addConstructorEntries = (
    entries: Record<string, VanityConstructorDefinition>,
    singular: boolean,
  ) => {
    let values = state.values
    const names: string[] = []
    for (const [name, definition] of Object.entries(entries)) {
      if (!name || name.startsWith('$')) {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_DEFINITION',
          'addConstructor() needs a non-$ constructor name',
          ['constructors', name || '<empty>'],
          'choose a non-empty constructor name that does not begin with \'$\'',
        )
      }
      assertSystemNamespaceAvailable([name], 'addConstructor()')
      if (Object.hasOwn(state.utils, name) || Object.hasOwn(values.constructors, name)) {
        throwOpenError(
          'VANITY_SYSTEM_COLLISION',
          `addConstructor() cannot define '${name}' because that system member already exists`,
          ['constructors', name],
          'choose a constructor name that is not already defined by the system',
        )
      }
      if (!definition || typeof definition.call !== 'function') {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_DEFINITION',
          `constructor '${name}' needs a call function`,
          ['constructors', name, 'call'],
          'provide a callable constructor definition',
        )
      }

      const createConstructorFamily = function (this: unknown, ...args: unknown[]) {
        return markConstructorUsage(Reflect.apply(definition.call, this, args), name)
      }
      for (const [member, value] of Object.entries(definition)) {
        if (member === 'call')
          continue
        if (typeof value !== 'function') {
          throwOpenError(
            'VANITY_SYSTEM_INVALID_DEFINITION',
            `constructor '${name}.${member}' must be call-like`,
            ['constructors', name, member],
            'provide a function for every constructor member',
          )
        }
        Object.defineProperty(createConstructorFamily, member, {
          enumerable: true,
          value(this: unknown, ...args: unknown[]) {
            return markConstructorUsage(Reflect.apply(value, this, args), name)
          },
        })
      }
      const contribution = { [name]: Object.freeze(createConstructorFamily) }
      values = OPEN_STATE_PLUGIN_CONTEXT.get(state) === undefined
        ? createValueKernel(
            { ...values.constructors, ...contribution },
            {
              extensions: values.extensions.all,
              compatibleSignatures: [...values.compatibleSignatures],
              constructorExtensions: values.constructorExtensions,
            },
          )
        : createValueKernel(
            { ...values.constructors, ...contribution },
            {
              extensions: values.extensions.all,
              compatibleSignatures: [...values.compatibleSignatures],
              constructorExtensions: values.constructorExtensions,
            },
          )
      names.push(name)
    }
    return materializeNextOpenSystem({
      values,
      provenance: Object.freeze({
        ...state.provenance,
        owners: getContributionOwners('constructor', names),
      }),
      revisions: Object.freeze({
        ...state.revisions,
        singularAdds: state.revisions.singularAdds + (singular ? 1 : 0),
      }),
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
      return createDeferredTokenDeclarations(getPreviewLogicalTokens(), input as any)
    },
    serialize: (value: VanityValue) => serializeValueWithContext(getValueContext(state), value),
    addPolicy(name: string, value: unknown) {
      const resolved = typeof value === 'function' ? value(surface) : value
      return applyPolicyPatch('add', { [name]: resolved })
    },
    addPolicies(input: unknown) {
      return applyPolicyPatch('add', input)
    },
    overwritePolicy(name: string, value: unknown) {
      const resolved = typeof value === 'function' ? value(surface) : value
      return applyPolicyPatch('overwrite', { [name]: resolved })
    },
    overwritePolicies(input: unknown) {
      return applyPolicyPatch('overwrite', input)
    },
    expectPolicy(name: string) {
      if (!Object.hasOwn(state.policies, name)) {
        throwOpenError(
          'VANITY_POLICY_MISSING',
          `expected policy '${name}' is missing`,
          name,
          'add the policy before mounting this plugin',
        )
      }
      return surface
    },
    expectPolicies(names: readonly string[]) {
      for (const name of names) {
        if (!Object.hasOwn(state.policies, name)) {
          throwOpenError(
            'VANITY_POLICY_MISSING',
            `expected policy '${name}' is missing`,
            name,
            'add the policy before mounting this plugin',
          )
        }
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
      const unwrapped = isTokenBuilder(resolved)
        ? getTokenModule(resolved)
        : undefined
      const module = unwrapped ?? (isTokenModule(resolved)
        ? resolved
        : getTokenModule(defineTokens(resolved as VanityTokenTreeContext<any>))!
      )
      // Axis/plugin/policy additions may evolve the state after earlier token
      // contributions. Compose through an empty module owned by the newest
      // state so all ancestor-compatible contributions meet at the current
      // requirement instead of asking an ancestor to accept a child.
      const accumulator = defineTokenModule(
        getTokenRequirementOfState(state),
        getTokenPolicyOfState(state),
        {},
      )
      const tokens = composeTokenModules(composeTokenModules(accumulator, state.tokens), module)
      const preview = previewTokenModule(state, tokens as object)
      const paths = getTokenModulePaths(module, preview) ?? []
      const sequence = state.sequence + 1
      return materializeNextOpenSystem({
        tokens,
        sequence,
        revisions: Object.freeze({
          ...state.revisions,
          tokens: Object.freeze({
            ...state.revisions.tokens,
            ...Object.fromEntries(paths.map(path => [path, sequence])),
          }),
        }),
        provenance: Object.freeze({
          ...state.provenance,
          owners: getContributionOwners('token', paths),
        }),
      })
    },
    addToken(name: string, input: unknown) {
      if (!name || name.startsWith('$')) {
        throwOpenError(
          'VANITY_TOKENS_INVALID_NAME',
          'addToken() needs one non-$ top-level name',
          ['tokens', name || '<empty>'],
          'choose one non-empty top-level token name that does not begin with \'$\'',
        )
      }
      const resolved = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      const result = Reflect.apply(methods.addTokens as (...args: any[]) => unknown, surface, [{ [name]: resolved }])
      const resultState = getOpenSystemState(result)!
      return materializeOpen({
        ...resultState,
        revisions: Object.freeze({
          ...resultState.revisions,
          singularAdds: resultState.revisions.singularAdds + 1,
        }),
      }, activePluginContext)
    },
    augmentToken(name: string, input: unknown) {
      const patch = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      return applyTokenPatch('augment', { [name]: patch })
    },
    augmentTokens(input: unknown) {
      return applyTokenPatch('augment', input)
    },
    overwriteToken(name: string, input: unknown) {
      const patch = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      return applyTokenPatch('overwrite', { [name]: patch })
    },
    overwriteTokens(input: unknown) {
      return applyTokenPatch('overwrite', input)
    },
    addCondition(name: string, input: unknown) {
      const value = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      const result = Reflect.apply(methods.addConditions as (...args: any[]) => unknown, surface, [{ [name]: value }])
      const resultState = getOpenSystemState(result)!
      return materializeOpen({
        ...resultState,
        revisions: Object.freeze({
          ...resultState.revisions,
          singularAdds: resultState.revisions.singularAdds + 1,
        }),
      }, activePluginContext)
    },
    addConditions(input: unknown) {
      const added = resolveRecordInput('conditions', input) as Record<string, VanityConditionInput>
      assertAdditive('condition', state.conditions, added)
      return materializeNextOpenSystem({
        conditions: Object.freeze({ ...state.conditions, ...added }),
        provenance: Object.freeze({
          ...state.provenance,
          owners: getContributionOwners('condition', Object.keys(added)),
        }),
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
      return materializeNextOpenSystem({
        conditions: Object.freeze({ ...state.conditions, ...patch }),
        provenance: Object.freeze({
          ...state.provenance,
          overwrites: Object.freeze([...state.provenance.overwrites, createProvenance('conditions', patch)]),
        }),
      })
    },
    addAxis(name: string, input: unknown) {
      const resolved = typeof input === 'function' ? input(surface) : input
      if (!name || resolved === undefined) {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_AXIS',
          'addAxis() needs a name and an ordered mode definition',
          ['axes', name || '<empty>'],
          'provide an axis name and a mode definition',
        )
      }
      const definition = Array.isArray(resolved)
        ? defineOpenAxis(name, {
            modes: Object.fromEntries(resolved.map(mode => [mode, thisMode])),
            modeOrder: resolved,
          })
        : isAxisDefinition(resolved)
          ? resolved
          : defineOpenAxis(name, resolved as VanityOpenAxisConfig<any, any>)
      const nextAxes = normalizeAxisAdditions(state.axes, { [name]: definition })
      return materializeNextOpenSystem({
        axes: nextAxes,
        provenance: Object.freeze({
          ...state.provenance,
          owners: getContributionOwners('axis', [name]),
        }),
        revisions: Object.freeze({
          ...state.revisions,
          singularAdds: state.revisions.singularAdds + 1,
        }),
      })
    },
    addAxes(input: unknown) {
      const additions = resolveRecordInput('axes', input)
      const normalized = Object.fromEntries(Object.entries(additions).map(([name, definition]) => [
        name,
        normalizeOpenAxisInput(name, definition),
      ]))
      const nextAxes = normalizeAxisAdditions(state.axes, normalized as VanityAxisDefinitions)
      return materializeNextOpenSystem({
        axes: nextAxes,
        provenance: Object.freeze({
          ...state.provenance,
          owners: getContributionOwners('axis', Object.keys(normalized)),
        }),
      })
    },
    augmentAxis(name: string, input: unknown) {
      const patch = typeof input === 'function'
        ? Reflect.apply(input as (...args: any[]) => unknown, undefined, [surface])
        : input
      const existing = state.axes.definitions[name]
      if (!existing) {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_AXIS',
          `augmentAxis() cannot patch unknown axis '${name}'`,
          ['axes', name],
          'use addAxis() when introducing a new axis',
        )
      }
      const definition = applyOpenAxisPatch(name, existing, patch, 'augment')
      const nextAxes = replaceAxis(state.axes, name, definition)
      return materializeNextOpenSystem({
        axes: nextAxes,
        provenance: Object.freeze({
          ...state.provenance,
          overwrites: Object.freeze([...state.provenance.overwrites, {
            kind: 'axis' as const,
            operation: 'augment' as const,
            paths: Object.freeze(getAxisPatchPaths(name, patch)),
            ...getSourceField(),
          }]),
        }),
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
      const existing = state.axes.definitions[name]
      if (!existing) {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_AXIS',
          `overwriteAxis() cannot patch unknown axis '${name}'`,
          ['axes', name],
          'use addAxis() when introducing a new axis',
        )
      }
      const definition = applyOpenAxisPatch(name, existing, patch, 'overwrite')
      const nextAxes = replaceAxis(state.axes, name, definition)
      return materializeNextOpenSystem({
        axes: nextAxes,
        provenance: Object.freeze({
          ...state.provenance,
          overwrites: Object.freeze([...state.provenance.overwrites, {
            kind: 'axis' as const,
            operation: 'overwrite' as const,
            paths: Object.freeze(getAxisPatchPaths(name, patch)),
            ...getSourceField(),
          }]),
        }),
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
      const resultState = getOpenSystemState(result)!
      return materializeOpen({
        ...resultState,
        revisions: Object.freeze({
          ...resultState.revisions,
          singularAdds: resultState.revisions.singularAdds + 1,
        }),
      }, activePluginContext)
    },
    addConsts(input: unknown) {
      const added = resolveRecordInput('consts', input)
      assertSystemNamespaceAvailable(Object.keys(added), 'addConsts()')
      assertAdditive('const', state.consts, added)
      assertJson(added, 'addConsts')
      return materializeNextOpenSystem({
        consts: copyImmutable({ ...state.consts, ...added }),
        provenance: Object.freeze({
          ...state.provenance,
          owners: getContributionOwners('const', Object.keys(added)),
        }),
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
      return materializeNextOpenSystem({
        consts: copyImmutable({ ...state.consts, ...patch }),
        provenance: Object.freeze({
          ...state.provenance,
          overwrites: Object.freeze([...state.provenance.overwrites, createProvenance('consts', patch)]),
        }),
      })
    },
    addUtil(name: string, value: unknown) {
      if (typeof value !== 'function') {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_DEFINITION',
          `utility '${name}' must be a function`,
          ['utils', name],
          'provide a callable utility value',
        )
      }
      const result = Reflect.apply(methods.addUtils as (...args: any[]) => unknown, surface, [{ [name]: value }])
      const resultState = getOpenSystemState(result)!
      return materializeOpen({
        ...resultState,
        revisions: Object.freeze({
          ...resultState.revisions,
          singularAdds: resultState.revisions.singularAdds + 1,
        }),
      }, activePluginContext)
    },
    addUtils(input: unknown) {
      const added = resolveRecordInput('utils', input) as VanityUtilTree
      assertSystemNamespaceAvailable(
        Object.keys(added).filter(name => !Object.hasOwn(state.utils, name)),
        'addUtils()',
      )
      assertRecursiveUtilsAdditive('addUtils()', {
        ...state.values.constructors,
        ...state.utils,
        ...methods,
      }, added)
      assertUtilTree(added)
      const merged = mergeUtilityTrees(state.utils, added)
      return materializeNextOpenSystem({
        utils: copyImmutable(merged),
        provenance: Object.freeze({
          ...state.provenance,
          owners: getContributionOwners('utility', getFlattenedPaths(added)),
        }),
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
      const resultState = getOpenSystemState(result)!
      return materializeOpen({
        ...resultState,
        revisions: Object.freeze({
          ...resultState.revisions,
          singularAdds: resultState.revisions.singularAdds + 1,
        }),
      }, activePluginContext)
    },
    addRules(input: unknown) {
      const added = resolveRecordInput('rules', input) as Record<string, VanitySystemRule>
      assertAdditive('rule', state.rules, added)
      for (const [name, rule] of Object.entries(added))
        assertSystemRule(name, rule)
      return materializeNextOpenSystem({
        rules: copyImmutable({ ...state.rules, ...added }),
        provenance: Object.freeze({
          ...state.provenance,
          owners: getContributionOwners('rule', Object.keys(added)),
        }),
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
      if (!isPlainRecord(patches)) {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_DEFINITION',
          'overwriteRules() needs a rule patch record, module, module array, or callback',
          'rules',
          'pass a rule patch record or a callback that returns one',
        )
      }
      assertKnown('rule', state.rules, patches)
      const rules = { ...state.rules }
      for (const [name, patch] of Object.entries(patches)) {
        if (!isPlainRecord(patch)) {
          throwOpenError(
            'VANITY_SYSTEM_INVALID_DEFINITION',
            `overwriteRule('${name}', ...) needs a partial system-rule object`,
            ['rules', name],
            'provide a partial system-rule object',
          )
        }
        const current = rules[name]!
        const merged = { ...current, ...patch }
        assertSystemRule(name, merged)
        rules[name] = merged
      }
      return materializeNextOpenSystem({
        rules: copyImmutable(rules),
        provenance: Object.freeze({
          ...state.provenance,
          overwrites: Object.freeze([...state.provenance.overwrites, createProvenance('rules', patches)]),
        }),
      })
    },
    addPlugin(input: VanitySystemPlugin<any, any> | ((system: object) => VanitySystemPlugin<any, any>)) {
      const plugin = typeof input === 'function' && !Object.hasOwn(input, VANITY_SYSTEM_PLUGIN)
        ? Reflect.apply(input, undefined, [surface])
        : input as VanitySystemPlugin<any, any>
      if (hasPlugin(state.plugins, plugin.id)) {
        throwOpenError(
          'VANITY_SYSTEM_COLLISION',
          `plugin '${plugin.id}' is already installed`,
          ['plugins', plugin.id],
          'install each plugin id only once, or choose a different id',
        )
      }

      const setupSurface = materializeOpen(state, plugin.id)
      const additive = createPluginSetupSurface(setupSurface, plugin.id)
      let result: unknown
      try {
        result = plugin.setup(additive as VanityPluginSetupSystem, plugin.options)
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const temporal = message.includes('expected ') && message.includes('missing')
          ? ' Requirements are temporal: add the requirement before mounting this plugin.'
          : ''
        if (error instanceof VanityError) {
          throw new VanityError(
            error.diagnostics.map((diagnostic, index) => ({
              ...diagnostic,
              message: index === 0
                ? `plugin '${plugin.id}' setup failed: ${diagnostic.message}${temporal}`
                : diagnostic.message,
            })),
            { cause: error },
          )
        }
        throwOpenError(
          'VANITY_SYSTEM_INVALID_DEFINITION',
          `plugin '${plugin.id}' setup failed: ${message}${temporal}`,
          ['plugins', plugin.id, 'setup'],
          'make setup return the accumulated system and use the additive plugin surface',
        )
      }
      const resultState = getOpenSystemState(result)
      if (!resultState || OPEN_STATE_PLUGIN_CONTEXT.get(resultState) !== plugin.id) {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_DEFINITION',
          `plugin '${plugin.id}' setup must return the accumulated system`,
          ['plugins', plugin.id, 'setup'],
          'return the system returned by the final additive operation in setup',
        )
      }

      const identity = {
        id: plugin.id,
        version: plugin.version,
        ...(plugin.fingerprint === undefined ? {} : { fingerprint: plugin.fingerprint }),
      }
      const addedConstructors = Object.fromEntries(
        Object.entries(resultState.values.constructors)
          .filter(([name]) => !Object.hasOwn(state.values.constructors, name)),
      )
      const values = Object.keys(addedConstructors).length === 0
        ? resultState.values
        : extendValueKernel(state.values, identity, addedConstructors)
      const codecs = mergeDtcgCodecs(resultState.codecs, plugin.dtcg)
      const installedState = { ...resultState, values, codecs } as OpenState
      const owned = Object.entries(resultState.provenance.owners)
        .filter(([, owner]) => owner.id === plugin.id)
        .map(([name]) => name)
      return materializeOpen({
        ...installedState,
        plugins: registerPlugin(resultState.plugins, {
          id: plugin.id,
          version: plugin.version,
          ...(plugin.fingerprint === undefined ? {} : { fingerprint: plugin.fingerprint }),
          capabilitySignature: getSystemCapabilitySignature(
            values,
            getValueContext(installedState),
            installedState.axes,
          ),
          ...(resultState.policies.plugins?.[plugin.id] === undefined
            ? {}
            : { policy: resultState.policies.plugins[plugin.id] }),
          owners: owned,
        }),
      }, null)
    },
    expectTokens(shape: object) {
      assertTokenExpectation(getLogicalTokens(), shape)
      return surface
    },
    expectToken(name: string, shape: object | true = true) {
      assertTokenExpectation(getLogicalTokens(), { [name]: shape })
      return surface
    },
    expectAxis(name: string, modes: readonly string[] = []) {
      const definition = state.axes.definitions[name]
      if (!definition) {
        throwOpenError(
          'VANITY_SYSTEM_MISSING',
          `expected axis '${name}' is missing; call addAxis('${name}', ...) earlier`,
          ['axes', name],
          `add axis '${name}' before mounting this plugin`,
        )
      }
      for (const mode of modes) {
        if (!Object.hasOwn(definition.modes, mode)) {
          throwOpenError(
            'VANITY_SYSTEM_MISSING',
            `expected axis mode '${name}.${mode}' is missing; add it before mounting this plugin`,
            ['axes', name, 'modes', mode],
            `add mode '${name}.${mode}' before mounting this plugin`,
          )
        }
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
      if (!hasPlugin(state.plugins, id)) {
        throwOpenError(
          'VANITY_SYSTEM_MISSING',
          `expected plugin '${id}' is missing; call addPlugin() earlier`,
          ['plugins', id],
          `install plugin '${id}' before mounting this plugin`,
        )
      }
      return surface
    },
    expectConstructor(name: string) {
      if (!Object.hasOwn(state.values.constructors, name)) {
        throwOpenError(
          'VANITY_SYSTEM_MISSING',
          `expected constructor '${name}' is missing; define it before mounting this plugin`,
          ['constructors', name],
          `define constructor '${name}' before mounting this plugin`,
        )
      }
      return surface
    },
    expectConstructors(names: readonly string[]) {
      for (const name of names)
        Reflect.apply(methods.expectConstructor as (...args: any[]) => unknown, surface, [name])
      return surface
    },
    consolidate(options: VanityConsolidateOptions = {}) {
      return consolidateSystem(state, options)
    },
  }

  const target = {
    ...state.values.constructors,
    ...state.utils,
    ...methods,
    [VANITY_OPEN_SYSTEM_STATE]: state,
    get t() {
      return getLogicalTokens()
    },
    conditions: state.conditions,
    axes: state.axes.definitions,
    consts: state.consts,
    policies: state.policies,
  }
  Object.freeze(target)
  surface = new Proxy(target, {
    get(object, key, receiver) {
      if (typeof key === 'string' && OPEN_ONLY_MISUSE.has(key)) {
        return () => {
          throwOpenError(
            'VANITY_SYSTEM_INCOMPATIBLE',
            `${key}() is available only after consolidate()`,
            key,
            'call consolidate() before using the locked-system surface',
          )
        }
      }
      return Reflect.get(object, key, receiver)
    },
  }) as unknown as VanityOpenSystem<any, any, any, any, any, any>
  return surface

  function getContributionOwners(
    kind: 'axis' | 'condition' | 'const' | 'constructor' | 'rule' | 'token' | 'utility',
    names: readonly string[],
  ): SystemProvenance['owners'] {
    const pluginContext = OPEN_STATE_PLUGIN_CONTEXT.get(state)
    if (pluginContext === undefined)
      return state.provenance.owners
    return Object.freeze({
      ...state.provenance.owners,
      ...Object.fromEntries(names.map(name => [
        `${kind}:${name}`,
        { kind: 'plugin' as const, id: `plugin:${pluginContext}` },
      ])),
    })
  }
}

function createPluginSetupSurface(system: object, id: string): object {
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
            ? Reflect.apply(input as (...args: unknown[]) => unknown, undefined, [createPluginSetupSurface(system, id)])
            : input
          if (!isPlainRecord(value)) {
            throwOpenError(
              'VANITY_POLICY_INVALID',
              `plugin '${id}' registerPluginPolicy() needs one plain policy object or callback`,
              ['plugins', id, 'policy'],
              'return one plain policy object from the registration callback',
            )
          }
          const state = getOpenSystemState(system)
          if (!state) {
            throwOpenError(
              'VANITY_SYSTEM_INCOMPATIBLE',
              `plugin '${id}' policy registration lost its open-system context`,
              ['plugins', id, 'policy'],
              'register the policy against the open system passed to plugin setup',
            )
          }
          if (state.policies.plugins && Object.hasOwn(state.policies.plugins, id)) {
            throwOpenError(
              'VANITY_POLICY_CONFLICT',
              `plugin '${id}' already registered its policy`,
              ['policies', 'plugins', id],
              'register one policy per plugin id',
            )
          }
          const next = Reflect.apply((system as any).addPolicies, system, [{
            plugins: { [id]: value },
          }])
          return createPluginSetupSurface(next as object, id)
        }
      }
      if (typeof key === 'string' && forbidden.has(key as PluginForbiddenRuntime)) {
        return () => {
          throwOpenError(
            'VANITY_SYSTEM_INCOMPATIBLE',
            `plugin '${id}' cannot call ${key}(); plugin setup is additive`,
            ['plugins', id, 'setup', key],
            'use the additive API exposed during plugin setup',
          )
        }
      }
      const value = Reflect.get(system, key, system)
      if (typeof value !== 'function' || typeof key !== 'string' || !chaining.has(key))
        return value
      return (...args: unknown[]) => {
        const result = Reflect.apply(value, system, args)
        return getOpenSystemState(result) === undefined
          ? result
          : createPluginSetupSurface(result as object, id)
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

function createLogicalTokenTree(
  value: object,
  grammar: import('../tokens/declarations').VanityTokenDeclarationGrammar,
  path: readonly string[] = [],
): object {
  if (typeof value === 'function' && Object.hasOwn(value, '$path')) {
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
      ? createLogicalTokenTree(child as object, grammar, [...path, name])
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

function applyOpenAxisPatch(
  name: string,
  existing: VanityAxisDefinition,
  input: unknown,
  operation: 'augment' | 'overwrite',
): VanityAxisDefinition {
  if (isAxisDefinition(input)) {
    if (operation === 'augment') {
      throwOpenError(
        'VANITY_SYSTEM_INVALID_AXIS',
        `augmentAxis('${name}', ...) needs a partial patch, not a complete replacement`,
        ['axes', name],
        'pass only the axis fields or modes that should be added',
      )
    }
    for (const mode of Object.keys(existing.modes)) {
      if (!Object.hasOwn(input.modes, mode)) {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_AXIS',
          `overwriteAxis() cannot remove existing mode '${name}.${mode}'`,
          ['axes', name, 'modes', mode],
          'retain every existing mode in an overwrite patch',
        )
      }
    }
    return input
  }
  if (!isPlainRecord(input)) {
    throwOpenError(
      'VANITY_SYSTEM_INVALID_AXIS',
      `${operation}Axis('${name}', ...) needs a partial axis patch or callback`,
      ['axes', name],
      'pass a partial axis object or a callback that returns one',
    )
  }

  const patch = input as VanityAxisPatch
  const normalizedModes = patch.modes === undefined
    ? {}
    : defineOpenAxis(name, { modes: patch.modes }).modes
  if (operation === 'augment') {
    for (const mode of Object.keys(normalizedModes)) {
      if (Object.hasOwn(existing.modes, mode)) {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_AXIS',
          `augmentAxis() cannot touch existing mode '${name}.${mode}'; use overwriteAxis()`,
          ['axes', name, 'modes', mode],
          'use overwriteAxis() when changing an existing mode',
        )
      }
    }
    for (const key of ['default', 'modeOrder', 'control', 'native', 'description'] as const) {
      const existingKey = key === 'default' ? existing.defaultMode : existing[key]
      if (patch[key] !== undefined && existingKey !== undefined) {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_AXIS',
          `augmentAxis() cannot touch existing '${name}.${key}'; use overwriteAxis()`,
          ['axes', name, key],
          'use overwriteAxis() when changing an existing axis field',
        )
      }
    }
    for (const mode of Object.keys(patch.derive ?? {})) {
      if (Object.hasOwn(existing.derive, mode)) {
        throwOpenError(
          'VANITY_SYSTEM_INVALID_AXIS',
          `augmentAxis() cannot touch existing derivation '${name}.${mode}'; use overwriteAxis()`,
          ['axes', name, 'derive', mode],
          'use overwriteAxis() when changing an existing derivation',
        )
      }
    }
  }

  const modes = { ...existing.modes, ...normalizedModes }
  const modeOrder = patch.modeOrder
    ?? [...existing.modeOrder, ...Object.keys(normalizedModes).filter(mode => !Object.hasOwn(existing.modes, mode))]
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

function getAxisPatchPaths(name: string, patch: unknown): string[] {
  if (isAxisDefinition(patch))
    return [name]
  return isPlainRecord(patch)
    ? getFlattenedPaths(patch).map(path => `${name}.${path}`)
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
    if (!Object.hasOwn(current, name))
      continue
    const existing = (current as Record<string, unknown>)[name]
    if (isPlainRecord(existing) && isPlainRecord(value)) {
      assertRecursiveUtilsAdditive(owner, existing, value, path)
      continue
    }
    const collision = typeof existing === 'function' && typeof value === 'function'
      ? 'duplicate utility leaf'
      : 'namespace/function collision'
    throwOpenError(
      'VANITY_SYSTEM_COLLISION',
      `${owner} ${collision} at '${path.join('.')}'`,
      ['utils', ...path],
      collision === 'duplicate utility leaf'
        ? 'choose a new utility path; additive registration cannot replace an existing leaf'
        : 'keep a utility path either as a namespace or as one callable leaf',
    )
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
  if (!isPlainRecord(rule) || !isPlainRecord(rule.css)) {
    throwOpenError(
      'VANITY_SYSTEM_INVALID_DEFINITION',
      `named system rule '${name}' needs a css selector map`,
      ['rules', name, 'css'],
      'provide a plain object mapping selectors to declarations',
    )
  }
  if (rule.layer !== undefined && (typeof rule.layer !== 'string' || rule.layer.length === 0)) {
    throwOpenError(
      'VANITY_SYSTEM_INVALID_DEFINITION',
      `named system rule '${name}.layer' must be a non-empty layer name`,
      ['rules', name, 'layer'],
      'provide a non-empty layer name',
    )
  }
  if (rule.order !== undefined && (typeof rule.order !== 'number' || !Number.isFinite(rule.order))) {
    throwOpenError(
      'VANITY_SYSTEM_INVALID_DEFINITION',
      `named system rule '${name}.order' must be a finite number`,
      ['rules', name, 'order'],
      'provide a finite numeric order',
    )
  }
}

function assertNamedRequirement(kind: string, current: object, name: string): void {
  if (!Object.hasOwn(current, name)) {
    throwOpenError(
      'VANITY_SYSTEM_MISSING',
      `expected ${kind} '${name}' is missing; add it before mounting this plugin`,
      [kind, name],
      `add ${kind} '${name}' before mounting this plugin`,
    )
  }
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
    if (!current || (typeof current !== 'object' && typeof current !== 'function') || !Object.hasOwn(current, name)) {
      throwOpenError(
        'VANITY_SYSTEM_MISSING',
        `expected ${kind} '${path.join('.')}' is missing; add it before mounting this plugin`,
        [kind, ...path],
        `add ${kind} '${path.join('.')}' before mounting this plugin`,
      )
    }
    assertShapeRequirement(kind, (current as any)[name], child, path)
  }
}

function assertPathRequirement(kind: string, current: object, path: string): void {
  let value: unknown = current
  for (const part of path.split('.')) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || !Object.hasOwn(value, part)) {
      throwOpenError(
        'VANITY_SYSTEM_MISSING',
        `expected ${kind} '${path}' is missing; add it before mounting this plugin`,
        [kind, ...path.split('.')],
        `add ${kind} '${path}' before mounting this plugin`,
      )
    }
    value = (value as any)[part]
  }
  if (typeof value !== 'function') {
    throwOpenError(
      'VANITY_SYSTEM_INVALID_DEFINITION',
      `expected ${kind} '${path}' to be a callable leaf`,
      [kind, ...path.split('.')],
      `make ${kind} '${path}' a function or choose a callable leaf`,
    )
  }
}

function assertAdditive(kind: string, current: object, added: object): void {
  for (const name of Object.keys(added)) {
    if (Object.hasOwn(current, name)) {
      throwOpenError(
        'VANITY_SYSTEM_COLLISION',
        `add${capitalizeName(kind)}s() cannot replace existing ${kind} '${name}'`,
        [kind, name],
        `use overwrite${capitalizeName(kind)}s() when changing an existing ${kind}`,
      )
    }
  }
}

function assertKnown(kind: string, current: object, patch: object): void {
  for (const name of Object.keys(patch)) {
    if (!Object.hasOwn(current, name)) {
      throwOpenError(
        'VANITY_SYSTEM_MISSING',
        `overwrite${capitalizeName(kind)}s() cannot replace unknown ${kind} '${name}'; use add${capitalizeName(kind)}s()`,
        [kind, name],
        `use add${capitalizeName(kind)}s() to introduce '${name}' before overwriting it`,
      )
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
        throwOpenError(
          'VANITY_TOKENS_TRAIT_CONFLICT',
          `expected token '${path.join('.')}' to have ${trait}: ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
          ['tokens', ...path, `$${trait}`],
          `define token '${path.join('.')}' with ${trait}: ${JSON.stringify(expected)}`,
        )
      }
    }
    return
  }

  for (const [name, child] of entries) {
    const next = [...path, name]
    if (!current || (typeof current !== 'object' && typeof current !== 'function') || !Object.hasOwn(current, name)) {
      throwOpenError(
        'VANITY_TOKENS_MISSING',
        `expected token '${next.join('.')}' is missing; add it earlier in the chain`,
        ['tokens', ...next],
        `add token '${next.join('.')}' earlier in the chain`,
      )
    }
    assertTokenExpectation((current as any)[name], child, next)
  }
}

function assertUtilTree(value: VanityUtilTree, path: string[] = []): void {
  for (const [name, child] of Object.entries(value)) {
    const next = [...path, name]
    if (typeof child === 'function')
      continue
    if (!child || typeof child !== 'object' || Array.isArray(child)) {
      throwOpenError(
        'VANITY_SYSTEM_INVALID_DEFINITION',
        `utility '${next.join('.')}' must be a function or a namespace of functions`,
        ['utils', ...next],
        'provide a callable utility or a namespace containing callable utilities',
      )
    }
    assertUtilTree(child as VanityUtilTree, next)
  }
}

function getStableOptions(value: unknown): string {
  const ancestors = new WeakSet<object>()
  return JSON.stringify(sort(value, ancestors))
}

function sort(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === 'function') {
    throwOpenError(
      'VANITY_SYSTEM_INVALID_DEFINITION',
      'plugin options cannot use a function as compatibility identity; provide a stable id',
      ['plugins', 'options'],
      'provide a stable primitive/object identity or define an explicit optionsIdentity function',
    )
  }
  if (value === null || typeof value !== 'object')
    return value
  if (ancestors.has(value)) {
    throwOpenError(
      'VANITY_SYSTEM_INVALID_DEFINITION',
      'plugin options cannot contain cycles',
      ['plugins', 'options'],
      'remove the cyclic reference from plugin options',
    )
  }
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

function createProvenance(
  kind: VanityOverwriteProvenance['kind'],
  value: object,
  operation: VanityOverwriteProvenance['operation'] = 'overwrite',
): VanityOverwriteProvenance {
  return Object.freeze({
    kind,
    operation,
    paths: Object.freeze(getFlattenedPaths(value)),
    ...getSourceField(),
  })
}

function getProvenancePaths(
  kind: VanityOverwriteProvenance['kind'],
  paths: readonly string[],
  operation: VanityOverwriteProvenance['operation'] = 'overwrite',
): VanityOverwriteProvenance {
  return Object.freeze({
    kind,
    operation,
    paths: Object.freeze([...paths]),
    ...getSourceField(),
  })
}

function getSourceField(): { readonly source?: string } {
  const source = getDiagnosticSource()?.file
  return source === undefined ? {} : { source }
}

function getFlattenedPaths(value: object, parent: string[] = []): string[] {
  const paths: string[] = []
  for (const [name, child] of Object.entries(value)) {
    const next = [...parent, name]
    if (child && typeof child === 'object' && !Array.isArray(child))
      paths.push(...getFlattenedPaths(child, next))
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
    throwOpenError(
      'VANITY_SYSTEM_INVALID_DEFINITION',
      `${surface}() consts cannot contain non-finite numbers`,
      ['consts'],
      'replace non-finite numbers with JSON-compatible finite values',
    )
  }
  if (typeof value !== 'object') {
    throwOpenError(
      'VANITY_SYSTEM_INVALID_DEFINITION',
      `${surface}() consts must be JSON-serializable`,
      ['consts'],
      'use only JSON-compatible strings, booleans, finite numbers, arrays, and objects',
    )
  }
  if (ancestors.has(value)) {
    throwOpenError(
      'VANITY_SYSTEM_INVALID_DEFINITION',
      `${surface}() consts cannot contain cycles`,
      ['consts'],
      'remove the cyclic reference from the const value',
    )
  }
  ancestors.add(value)
  for (const child of Array.isArray(value) ? value : Object.values(value))
    assertJson(child, surface, ancestors)
  ancestors.delete(value)
}

function copyImmutable<T>(value: T, copies = new WeakMap<object, object>()): T {
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
    array.push(...value.map(entry => copyImmutable(entry, copies)))
    return Object.freeze(array) as T
  }

  const clone = Object.create(prototype) as Record<PropertyKey, unknown>
  copies.set(value, clone)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined)
      continue
    Object.defineProperty(clone, key, 'value' in descriptor
      ? { ...descriptor, value: copyImmutable(descriptor.value, copies) }
      : descriptor)
  }
  return Object.freeze(clone) as T
}

function capitalizeName(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
}

function throwOpenError(
  code: VanityDiagnosticCode,
  message: string,
  path: string | readonly string[],
  fix: string,
): never {
  throw new VanityError({ code, message, path, fix })
}
