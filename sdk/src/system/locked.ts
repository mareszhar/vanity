/**
 * `createSystem` — bind once, typed everywhere ([spec-css.md §1]): a
 * factory that closes over tokens, conditions, and layers and returns
 * authoring functions whose types are inferred. No codegen, no artifact
 * directory — inference is the codegen. The floor is deliberately designed: tokens can be
 * defined inline and `t` always comes back out, layers default, and the base
 * condition set is already there. The happy path is one file, one call.
 */

import type { VanityAtomsFactory } from '../atoms/types'
import type {
  VanityClassEmitter,
  VanityCssPropertyName,
  VanityFontFaceFunction,
  VanityFragmentFactory,
  VanityKeyframesFunction,
  VanityOmit,
  VanityRawEmitter,
  VanityRulesEmitter,
  VanityTokenDeclarations,
} from '../css/types'
import type { VanityTokenExplanation } from '../introspect/explain'
import type { VanityAuditConfig } from '../introspect/records'
import type { VanityPortFactory, VanityPortInput } from '../ports/types'
import type { VanityAnatomyFactory, VanityRecipeFactory } from '../recipes/types'
import type { VanityRuntimeServices } from '../runtime/contract'
import type { VanityTokenBuilder } from '../tokens/builder'
import type { VanityTokenPhaseLayers } from '../tokens/module'
import type {
  VanityCanonicalTokens,
  VanityCheck,
  VanityDefaultTokenPolicy,
  VanityGraphInput,
  VanityNamesOf,
  VanityResolvedTokens,
  VanityTokenDefinition,
  VanityTokenHandleAny,
  VanityTokenModule,
  VanityTokenModuleRequirement,
  VanityTokenPolicy,
  VanityTokens,
  VanityTokensFromDefinition,
  VanityVarsOf,
} from '../tokens/types'
import type { DtcgCodecRegistry } from '../values/codecs'
import type { VanityValueKernel, VanityValueOperationContext } from '../values/kernel'
import type { VanityCssValue, VanityValue } from '../values/types'
import type { VanityAxisDefinitions, VanityAxisRegistry } from './axes'
import type {
  VanityBaseConditionInputs,
  VanityConditionInput,
  VanityConditionKeyName,
  VanityConditionKeys,
} from './conditions'
import type {
  VanityCapabilityOrigin,
  VanityOverwriteProvenance,
  VanityPortableSystemV2,
} from './contract'
import type { VanityUtilTree } from './definitions'
import type { VanityPolicies, VanityResolvedPolicies } from './policies'
import type { VanitySystemRule } from './rules'
import { bindAtoms } from '../atoms/atoms'
import { createClassEmitter } from '../css/class'
import { createLayerContext } from '../css/context'
import { createFragmentFactory, omit } from '../css/fragment'
import { bindFontFace, bindKeyframes } from '../css/keyframes'
import { createRawEmitter } from '../css/raw'
import { createRulesEmitter } from '../css/rules'
import { tokenDeclarations } from '../css/tdec'
import { checkSelector } from '../css/validation'
import { getDiagnosticSource, VanityError } from '../diagnostics'
import { explainFromSystem, explainToken } from '../introspect/explain'
import { VANITY_SYSTEM_INTERCHANGE } from '../introspect/interchange'
import { record } from '../introspect/records'
import { introspectSystem } from '../introspect/system'
import { VANITY_PROPERTY_ALIASES } from '../plugins/propertyAliases'
import { createPort } from '../ports/port'
import { bindAnatomy } from '../recipes/anatomy'
import { bindRecipe } from '../recipes/recipe'
import { createRuntimeServices } from '../runtime/controller'
import { substrate } from '../substrate'
import { VANITY_BUILTIN_CONSTRUCTOR_NAMES } from '../system/surface'
import { getTokenModule, isTokenBuilder } from '../tokens/builder'
import { attachTokenDeclarationGetters } from '../tokens/declarations'
import { isHandle } from '../tokens/handle'
import {
  defineTokenModule,
  emitTokenGraph,
  getRuntimeContract,
  getRuntimeSchemas,
  getTokenGraph,
  getTokenInspections,
  getTokenModulePaths,
  getTokenRestorations,
  isTokenModule,
} from '../tokens/module'
import { getTokenModuleRequirement } from '../tokens/requirements'
import { resolveTokenModule } from '../tokens/resolve'
import { serializeValueWithContext } from '../values/kernel'
import { isVanityValue } from '../values/types'
import { describeAxisRegistry } from './axes'
import { createBaseConditions, describeConditionArms, describeConditionAsts, describeConditions, normalizeConditions } from './conditions'
import {
  createSystemContract,
  VANITY_IN_PROCESS_SYSTEM,
} from './contract'
import { resolvePolicies } from './policies'

/** Default nested cascade order: `createSystem().consolidate({ layerOrder: VANITY_DEFAULT_LAYERS })`. */
export const VANITY_DEFAULT_LAYERS = ['reset', 'tokens', 'recipes', 'utilities', 'overrides'] as const

export type VanityDefaultLayers = typeof VANITY_DEFAULT_LAYERS

/** The system's own ordered layers; authored styles default to the first layer after them. */
const SYSTEM_LAYERS: readonly string[] = ['reset', 'tokens']

// ─── Options ─────────────────────────────────────────────────────────────────

/**
 * A condition name colliding with a CSS property is refused at the definition
 * key (`never` value → error at that key); the build diagnostic carries the
 * full sentence (`VANITY_SYSTEM_CONDITION_COLLISION`).
 */
export type VanityConditionsInput<C> = {
  [K in keyof C]: K extends VanityCssPropertyName ? never : VanityConditionInput
}

export interface VanitySystemOptions<
  T extends object,
  C extends Record<string, VanityConditionInput>,
  L extends readonly string[],
  P extends string,
  B extends boolean,
> {
  /** Raw token module data or an unfinished system-bound module; `t` is always returned. */
  tokens: T & VanitySystemTokenInput<T>
  conditions?: C & VanityConditionsInput<C>
  /** Cascade-layer order, `['reset', 'tokens', 'recipes', 'utilities', 'overrides']` by default. */
  layerOrder?: L
  /** The emitted custom-property prefix: `--vanity-*` by default. */
  prefix?: P
  /** The absolute selector that owns ordinary token declarations. */
  root?: string
  /** The declared layer that owns ordinary token declarations. */
  tokenLayer?: L[number]
  /** Build-time checks over an inline token module ([spec-tokens.md §5]); a `defineTokens` result brings its own. */
  checks?: (tokens: VanitySystemTokens<T, P>) => readonly VanityCheck[]
  /** Opt out of the built-in base condition set. */
  baseConditions?: B
  /**
   * Per-audit promotion ([spec-introspection.md §3]): every audit warns by
   * default; `'error'` makes one a hard gate, `'off'` silences one. Declared
   * on the system so the quality bar travels with the design system.
   */
  audit?: VanityAuditConfig
}

type VanitySystemTokenInput<T>
  = T extends VanityResolvedTokens ? unknown
    : T extends VanityTokenDefinition<any, any> ? unknown
      : T extends VanityGraphInput ? unknown
        : never

/** Static graphs and unfinished builders compile here; built tokens pass through untouched. */
export type VanitySystemTokens<
  T extends object,
  P extends string,
  Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Canonical extends boolean = false,
> = T extends VanityTokenModule<infer G, infer ModulePolicy>
  ? Canonical extends true ? VanityCanonicalTokens<G, P, ModulePolicy> : VanityTokens<G, P>
  : T extends VanityTokenBuilder<infer G> ? VanityTokens<G, P>
    : T extends VanityGraphInput
      ? Canonical extends true ? VanityCanonicalTokens<T, P, Policy> : VanityTokens<T, P>
      : T

export type VanitySystemBindingOptions<
  T extends object,
  C extends Record<string, VanityConditionInput>,
  L extends readonly string[],
  P extends string,
  B extends boolean,
  Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
> = Omit<VanitySystemOptions<T, C, L, P, B>, 'tokens' | 'checks'> & {
  tokens: T & (T extends VanityTokenModule<infer _Graph, infer _ModulePolicy> ? unknown : T extends VanityGraphInput ? unknown : never)
  checks?: (tokens: VanitySystemTokens<T, P, Policy, true>) => readonly VanityCheck[]
}

export type VanitySystemConditionName<C, B extends boolean>
  = C extends Record<string, VanityConditionInput>
    ? VanityConditionKeys<C> | (B extends false ? never : VanityConditionKeys<VanityBaseConditionInputs>)
    : never

export type VanityConditionDescriptions<Conditions extends string> = Readonly<{
  [Key in Conditions as VanityConditionKeyName<Key>]: string
}>

// ─── The system ──────────────────────────────────────────────────────────────

export interface VanityLockedSystem<
  T,
  C extends string,
  L extends string,
  Axes extends VanityAxisDefinitions = Record<never, never>,
> extends VanityRuntimeServices<T, Axes> {
  /** The resolved token module — one import line serves every style file. */
  readonly t: T
  readonly class: VanityClassEmitter<C, L>
  readonly rules: VanityRulesEmitter<C, L>
  readonly raw: VanityRawEmitter<L>
  readonly fragment: VanityFragmentFactory<C>
  readonly omit: VanityOmit
  /**
   * Produce CSS declaration data over resolved tokens; this never mutates runtime state.
   *
   * @example
   * `ds.class({ ...ds.tdec({ color: { brand: 'rebeccapurple' } }) })`
   */
  readonly tdec: (declarations: VanityTokenDeclarations<T>) => Record<`--${string}`, string | number>
  readonly keyframes: VanityKeyframesFunction<L>
  readonly fontFace: VanityFontFaceFunction<L>
  /** Variants compress state: props in, classes out ([spec-recipes.md §1]). */
  readonly recipe: VanityRecipeFactory<C, L>
  /** The recipe pattern applied to parts ([spec-recipes.md §3]). */
  readonly anatomy: VanityAnatomyFactory<C, L>
  /** The typed runtime boundary: declare a port with a default, typed by it. */
  readonly port: VanityPortFactory
  /** Finite declared utility selection over your token map ([spec-integrations.md §5]). */
  readonly atoms: VanityAtomsFactory<C, L>
  readonly inLayer: <Layer extends L>(name: Layer) => VanityLockedSystem<T, C, Layer, Axes>
  /** Resolve an unfinished module, subtree, or composed selection against this system. */
  readonly tokensOf: <const Selection extends object>(
    selection: Selection,
  ) => VanityTokensFromDefinition<T, Selection>
  /** Project final custom-property names without emitting CSS. */
  readonly namesOf: <const Selection extends object>(
    selection: Selection,
  ) => VanityNamesOf<VanityTokensFromDefinition<T, Selection>>
  /** Project final `var()` references without emitting CSS. */
  readonly varsOf: <const Selection extends object>(
    selection: Selection,
  ) => VanityVarsOf<VanityTokensFromDefinition<T, Selection>>
  /** Serialize a portable value with this system's finalized reference map. */
  readonly serialize: (value: VanityValue) => string
  /** Explain one token from authored expression through every emitted context. */
  readonly explain: (token: VanityTokenHandleAny) => VanityTokenExplanation
  /** Read-only normalized authoring context for integrations and inspection. */
  readonly conditions: VanityConditionDescriptions<C>
  readonly layers: readonly L[]
}

export type VanitySystem<
  T,
  C extends string,
  L extends string,
  Constructors extends object = Record<never, never>,
  Axes extends VanityAxisDefinitions = Record<never, never>,
> = VanityLockedSystem<T, C, L, Axes> & Readonly<Constructors>

export interface VanitySystemBinding<
  Constructors extends object,
  TokenPolicy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Axes extends VanityAxisDefinitions = VanityAxisDefinitions,
> {
  readonly kernel: VanityValueKernel<Constructors>
  readonly valueContext: VanityValueOperationContext
  readonly signature: string
  readonly requirement: VanityTokenModuleRequirement
  readonly tokenPolicy: TokenPolicy
  readonly axes: VanityAxisRegistry<Axes>
  readonly dtcg: DtcgCodecRegistry
}

export interface VanitySystemContractMetadata {
  readonly source?: string
  readonly consts?: Readonly<Record<string, unknown>>
  readonly utilities?: readonly string[]
  readonly ruleGroups?: VanityPortableSystemV2['ruleGroups']
  readonly plugins?: readonly string[]
  readonly owners?: Readonly<Record<string, { readonly kind: 'plugin', readonly id: string }>>
  readonly overwrites?: readonly VanityOverwriteProvenance[]
  /** Open-system facets carried directly into the locked surface. */
  readonly policies?: VanityPolicies
  readonly utilityTree?: VanityUtilTree
  readonly systemRules?: Readonly<Record<string, VanitySystemRule>>
}

interface VanitySystemCreationMode extends VanitySystemContractMetadata {
  readonly emitCss: boolean
  readonly requireStyleModule: boolean
}

const LOCKED_ONLY_SYSTEM_MEMBERS = new Set([
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

/** Construct one emission-free locked system contract from a resolved binding. */
export function materializeLockedSystemContract<
  const Constructors extends object,
  const TokenPolicy extends VanityTokenPolicy,
  const Axes extends VanityAxisDefinitions,
  const T extends object,
  const C extends Record<string, VanityConditionInput> = Record<never, never>,
  const L extends readonly string[] = VanityDefaultLayers,
  P extends string = 'vanity',
  B extends boolean = true,
>(
  binding: VanitySystemBinding<Constructors, TokenPolicy, Axes>,
  options: VanitySystemBindingOptions<T, C, L, P, B, TokenPolicy>,
  metadata: VanitySystemContractMetadata = {},
): VanitySystem<VanitySystemTokens<T, P, TokenPolicy, true>, VanitySystemConditionName<C, B>, L[number], Constructors, Axes> {
  return materializeLockedSystem<Constructors, T, C, L, P, B, TokenPolicy, true, Axes>(
    binding,
    options as VanitySystemOptions<T, C, L, P, B>,
    {
      ...metadata,
      emitCss: false,
      requireStyleModule: false,
    },
  )
}

function materializeLockedSystem<
  const Constructors extends object,
  const T extends object,
  const C extends Record<string, VanityConditionInput>,
  const L extends readonly string[],
  P extends string,
  B extends boolean,
  TokenPolicy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Canonical extends boolean = false,
  Axes extends VanityAxisDefinitions = Record<never, never>,
>(
  binding: VanitySystemBinding<Constructors, TokenPolicy, Axes>,
  options: VanitySystemOptions<T, C, L, P, B>,
  mode: VanitySystemCreationMode,
): VanitySystem<VanitySystemTokens<T, P, TokenPolicy, Canonical>, VanitySystemConditionName<C, B>, L[number], Constructors, Axes> {
  const file = mode.requireStyleModule
    ? substrate.modules.requireStyleModule('createSystem')
    : mode.source ?? getDiagnosticSource()?.file
  const prefix = options.prefix ?? 'vanity'
  const root = options.root ?? ':root'
  const policies = resolvePolicies(
    mode.policies ?? binding.valueContext.policies as VanityPolicies,
    {
      support: binding.valueContext.support,
      layerOrder: options.layerOrder ?? VANITY_DEFAULT_LAYERS,
    },
  ) as VanityResolvedPolicies
  const valueContext: VanityValueOperationContext = {
    ...binding.valueContext,
    values: binding.kernel,
    support: policies.support,
    policies,
  }
  const tokenPolicy = policies.tokens as TokenPolicy
  const contractPolicies = Object.freeze(Object.fromEntries(
    Object.entries(valueContext.policies).filter(([name]) => name !== 'support'),
  ))
  const layers = (options.layerOrder ?? policies.layerOrder) as readonly string[]

  if (!/^-?(?:[_a-z]|[^\0-\x7F])(?:[-\w]|[^\0-\x7F])*$/i.test(prefix)) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_INVALID_PREFIX',
      message: `'${prefix}' is not a valid design-system prefix`,
      file,
      fix: 'use a stable CSS identifier such as \'app\', \'prism\', or \'acme-ui\'',
    })
  }

  if (root.includes('&') || checkSelector(root)) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_INVALID_ROOT',
      message: `'${root}' is not a valid absolute system root selector`,
      file,
      fix: 'use an absolute selector such as \':root\', \'#app\', or \'#widget\' without \'&\'',
    })
  }

  if (layers.length === 0) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_UNKNOWN_LAYER',
      message: 'a system declares at least one layer',
      file,
      fix: 'drop the layerOrder key to accept the default order, or declare your own',
    })
  }

  const declaredLayers = layers as readonly string[]
  const tokenLayer = options.tokenLayer ?? (declaredLayers.includes('tokens') ? 'tokens' : layers[0])
  if (tokenLayer !== undefined && !declaredLayers.includes(tokenLayer)) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_UNKNOWN_LAYER',
      message: `token layer '${tokenLayer}' is not declared by this system`,
      detail: [`declared layers: ${layers.join(', ')}`],
      file,
      fix: 'add the layer to layerOrder, or choose one of the declared layer names',
    })
  }
  const qualifiedTokenLayer = tokenLayer === undefined ? undefined : `${prefix}.${tokenLayer}`

  let phaseLayers: VanityTokenPhaseLayers | undefined
  if (qualifiedTokenLayer !== undefined) {
    const baseLayer = `${qualifiedTokenLayer}.base`
    const axesLayer = `${qualifiedTokenLayer}.axes`
    const axisLayers = Object.freeze(Object.fromEntries(binding.axes.order.map(axis => [
      axis,
      `${axesLayer}.${axis}`,
    ])))
    const casesLayer = `${qualifiedTokenLayer}.cases`
    const overridesLayer = `${qualifiedTokenLayer}.overrides`
    phaseLayers = Object.freeze({
      root: qualifiedTokenLayer,
      base: baseLayer,
      axes: axisLayers,
      cases: casesLayer,
      overrides: overridesLayer,
    })
  }

  // Static modules and staged builders finalize exactly once at the system
  // boundary. Canonical systems refuse already-finalized modules because
  // their prefix/root identity has already been claimed elsewhere.
  let tokens: object
  if (getTokenGraph(options.tokens)) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_INCOMPATIBLE',
      message: 'a system cannot consume an already-finalized token module',
      file,
      fix: 'pass the unfinished module returned by de.defineTokens(); the system owns final names',
    })
  }
  else {
    const builder = isTokenModule(options.tokens)
      ? options.tokens as unknown as TokenModuleImplementation
      : defineTokenModule(binding.requirement, tokenPolicy, options.tokens as VanityGraphInput) as unknown as TokenModuleImplementation

    const moduleRequirement = getTokenModuleRequirement(builder)
    if (!moduleRequirement || !binding.requirement.compatibleCapabilitySignatures.includes(moduleRequirement.capabilitySignature)) {
      throw new VanityError({
        code: 'VANITY_TOKEN_MODULE_INCOMPATIBLE',
        message: 'this token module is not compatible with the system capability set',
        detail: [
          `system capability signature: ${binding.signature}`,
          `module capability signature: ${moduleRequirement?.capabilitySignature ?? 'unbound'}`,
        ],
        file,
        fix: { message: 'define the module with this system capability set or an equivalent compatible revision' },
      })
    }

    tokens = resolveTokenModule(builder, {
      prefix,
      root,
      layers,
      serializeValue: (value: VanityCssValue) => serializeValueWithContext(valueContext, value),
      support: valueContext.support,
      policies: valueContext.policies,
      axes: binding.axes,
      dtcgCodecIds: new Set(binding.dtcg.map(codec => codec.extension)),
      ...(phaseLayers === undefined ? {} : { phaseLayers }),
      ...(qualifiedTokenLayer === undefined ? {} : { layer: qualifiedTokenLayer }),
      ...(options.checks === undefined ? {} : { checks: options.checks as () => readonly VanityCheck[] }),
      emitCss: false,
    })
  }

  const conditionInputs = {
    ...(options.baseConditions === false ? {} : createBaseConditions()),
    ...options.conditions,
  }
  const conditions = normalizeConditions(conditionInputs, file)

  const aliasConfig = VANITY_PROPERTY_ALIASES in binding.kernel.constructors
    ? (binding.kernel.constructors as any)[VANITY_PROPERTY_ALIASES]
    : mode.consts && VANITY_PROPERTY_ALIASES in mode.consts
      ? (mode.consts as any)[VANITY_PROPERTY_ALIASES]
      : undefined
  if (aliasConfig) {
    for (const alias of Object.keys(aliasConfig.aliases)) {
      if (conditions.has(alias)) {
        throw new VanityError({
          code: 'VANITY_SYSTEM_CONDITION_COLLISION',
          message: `property alias '${alias}' collides with a condition of this system`,
          path: alias,
          file,
          fix: 'rename either the alias or the condition so a rule key has one meaning',
        })
      }
    }
  }
  attachTokenDeclarationGetters(tokens, {
    conditions: new Set(conditions.keys()),
    ...(aliasConfig === undefined ? {} : { aliases: aliasConfig.aliases }),
    file,
  })

  let serializeSystemValue: (value: unknown) => string | number
  const system = {
    conditions,
    layers,
    defaultLayer: layers.find(layer => !SYSTEM_LAYERS.includes(layer)) ?? layers[0],
    globalDefaultLayer: layers.includes('reset') ? 'reset' : layers[0],
    layerRoot: prefix,
    ...(aliasConfig === undefined ? {} : { propertyAliases: aliasConfig }),
    resolveTokenDeclarations: (input: object) =>
      tokenDeclarations(tokens as any, input as any),
    serializeValue: (value: unknown) => serializeSystemValue(value),
  }
  const runtimeContract = getRuntimeContract(tokens)!

  type Bound = VanitySystem<VanitySystemTokens<T, P, TokenPolicy, Canonical>, VanitySystemConditionName<C, B>, L[number], Constructors, Axes>

  const describedConditions = Object.freeze(describeConditions(conditions)) as VanityConditionDescriptions<VanitySystemConditionName<C, B>>
  const resolvedGraph = getTokenGraph(tokens)!
  const runtimeControls = Object.fromEntries(
    (resolvedGraph.axes?.order ?? []).flatMap((axis) => {
      const control = resolvedGraph.axes?.definitions[axis]?.control
      return control === undefined ? [] : [[control.id, control]]
    }),
  )
  const runtimeServices = createRuntimeServices<Bound['t'], Axes>(
    runtimeContract,
    getRuntimeSchemas(tokens),
    runtimeControls,
  )
  serializeSystemValue = (value: unknown): string | number => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value))
        throw new RangeError(`[vanity] a CSS number must be finite; received ${value}`)
      return Object.is(value, -0) ? 0 : value
    }
    if (typeof value === 'string') {
      if (value.trim().length === 0)
        throw new TypeError('[vanity] a CSS value cannot be empty')
      return value
    }
    if (isHandle(value))
      return String(value)
    if ((typeof value === 'object' || typeof value === 'function') && value !== null && 'var' in value)
      return (value as { readonly var: string }).var
    if (isVanityValue(value)) {
      return serializeValueWithContext(valueContext, value, (reference) => {
        if (reference.name)
          return reference.name
        if (reference.path) {
          const node = resolvedGraph.nodes.get(reference.path)
          if (node)
            return node.name
        }
        throw new TypeError(`[vanity] system '${prefix}' cannot resolve ${reference.path ?? 'an unnamed value reference'}`)
      })
    }
    throw new TypeError('[vanity] a system value must be CSS text, a finite number, a token, a port, or a vanity value')
  }
  const projectTokens = (selection: object): object => {
    const module = isTokenModule(selection)
      ? selection
      : isTokenBuilder(selection) ? getTokenModule(selection) : undefined
    if (module === undefined)
      return selection

    const paths = getTokenModulePaths(module, tokens)
    if (!paths) {
      throw new VanityError({
        code: 'VANITY_SYSTEM_INCOMPATIBLE',
        message: 'this token module was not finalized into the current system',
        file,
        fix: 'compose the module into this system before projecting its tokens, names, or vars',
      })
    }

    const projection: Record<string, unknown> = {}
    for (const path of paths) {
      const parts = path.split('.')
      let source: any = tokens
      let target = projection
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index]!
        source = source[part]
        if (index === parts.length - 1) {
          target[part] = source
        }
        else {
          if (typeof target[part] !== 'object' || target[part] === null)
            target[part] = {}
          target = target[part] as Record<string, unknown>
        }
      }
    }
    return Object.freeze(projection)
  }
  const project = (selection: object, kind: 'name' | 'var'): unknown => mapTokenProjection(
    projectTokens(selection),
    kind,
    [],
  )
  let emitted = false
  const emitSystem = () => {
    if (emitted)
      return

    const activeFile = substrate.modules.requireStyleModule('locked system authoring')
    substrate.modules.runInFileScope({ filePath: file ?? activeFile }, () => {
      // Establish the complete layer order before token/style declarations.
      substrate.css.emitLayer({ name: prefix })
      for (const layer of layers)
        substrate.css.emitLayer({ parent: prefix, name: layer })

      if (qualifiedTokenLayer !== undefined) {
        substrate.css.emitLayer({ parent: qualifiedTokenLayer, name: 'base' })
        substrate.css.emitLayer({ parent: qualifiedTokenLayer, name: 'axes' })
        const axesLayer = `${qualifiedTokenLayer}.axes`
        for (const axis of binding.axes.order)
          substrate.css.emitLayer({ parent: axesLayer, name: axis })
        substrate.css.emitLayer({ parent: qualifiedTokenLayer, name: 'cases' })
        substrate.css.emitLayer({ parent: qualifiedTokenLayer, name: 'overrides' })
      }

      emitTokenGraph(tokens)
      if (mode.systemRules !== undefined)
        emitSystemRules(system, mode.systemRules, layers)
    })
    emitted = true
  }

  let bound: Record<string, unknown>
  const createLayeredSystem = (name: string): object => {
    const placed = createLayerContext(system, name)
    return Object.freeze({
      ...bound,
      class: buildOnly('class', createClassEmitter(placed)),
      rules: buildOnly('rules', createRulesEmitter(placed)),
      raw: buildOnly('raw', createRawEmitter(placed)),
      keyframes: buildOnly('keyframes', bindKeyframes(placed)),
      fontFace: buildOnly('fontFace', bindFontFace(placed)),
      recipe: buildOnly('recipe', bindRecipe(placed)),
      anatomy: buildOnly('anatomy', bindAnatomy(placed)),
      atoms: buildOnly('atoms', bindAtoms(placed, name)),
    })
  }

  const utilityTree = mode.utilityTree ?? {}
  for (const name of Object.keys(utilityTree)) {
    if (name in binding.kernel.constructors || name in {
      t: true,
      class: true,
      rules: true,
      raw: true,
      fragment: true,
      tdec: true,
      keyframes: true,
      fontFace: true,
      recipe: true,
      anatomy: true,
      port: true,
      atoms: true,
      inLayer: true,
      tokensOf: true,
      namesOf: true,
      varsOf: true,
      serialize: true,
      conditions: true,
      layers: true,
      consts: true,
      policies: true,
    }) {
      throw new TypeError(`[vanity] utility '${name}' collides with a locked-system member`)
    }
  }

  bound = {
    ...binding.kernel.constructors,
    ...utilityTree,

    t: tokens as Bound['t'],
    class: buildOnly('class', createClassEmitter(system) as Bound['class']),
    rules: buildOnly('rules', createRulesEmitter(system) as Bound['rules']),
    raw: buildOnly('raw', createRawEmitter(system) as Bound['raw']),
    fragment: buildOnly('fragment', createFragmentFactory()),
    omit,
    tdec: buildOnly('tdec', (declarations: VanityTokenDeclarations<Bound['t']>) =>
      tokenDeclarations(tokens as Bound['t'], declarations)),
    keyframes: buildOnly('keyframes', bindKeyframes(system)),
    fontFace: buildOnly('fontFace', bindFontFace(system)),
    recipe: buildOnly('recipe', bindRecipe(system) as Bound['recipe']),
    anatomy: buildOnly('anatomy', bindAnatomy(system) as Bound['anatomy']),
    port: buildOnly('port', ((input: VanityPortInput, options?: object) =>
      createPort(input, options as any, { prefix, serialize: serializeSystemValue })) as Bound['port']),
    atoms: buildOnly('atoms', bindAtoms(system) as Bound['atoms']),
    inLayer: buildOnly('inLayer', createLayeredSystem as Bound['inLayer']),
    tokensOf: buildOnly('tokensOf', projectTokens as Bound['tokensOf']),
    namesOf: buildOnly('namesOf', ((selection: object) => project(selection, 'name')) as Bound['namesOf']),
    varsOf: buildOnly('varsOf', ((selection: object) => project(selection, 'var')) as Bound['varsOf']),
    explain: buildOnly('explain', ((token: VanityTokenHandleAny) => explainToken(resolvedGraph, token)) as Bound['explain']),
    runtime: registerApplicationProjection(runtimeServices.runtime, 'restoreRuntimeControllerFactory', runtimeContract),
    snapshotFrom: registerApplicationProjection(runtimeServices.snapshotFrom, 'restoreSnapshotFrom', runtimeContract),
    reconcileRuntimeSnapshot: registerApplicationProjection(runtimeServices.reconcileRuntimeSnapshot, 'restoreRuntimeReconciler', runtimeContract),
    runtimeStyle: registerApplicationProjection(runtimeServices.runtimeStyle, 'restoreRuntimeStyle', runtimeContract),
    runtimeProps: registerApplicationProjection(runtimeServices.runtimeProps, 'restoreRuntimeProps', runtimeContract),
    serialize: (value: VanityValue) => String(serializeSystemValue(value)),
    conditions: describedConditions,
    layers: Object.freeze([...layers]) as readonly L[number][],
    consts: Object.freeze({ ...(mode.consts ?? {}) }),
    policies,
  } as any

  // A whole system can cross into app code (for example through a project's
  // explicit Nuxt auto-import surface). Keep build-only functions callable
  // while the compiler evaluates this module, but give the exported surface a
  // serializable application projection. The wrapper restores the same
  // throwing stub used by individual authoring methods; token handles and
  // runtime services already carry their own serializers and are preserved.
  for (const [key, value] of Object.entries(bound))
    (bound as Record<string, unknown>)[key] = createSerializableSystemValue(value, key)

  Object.defineProperty(bound, VANITY_SYSTEM_INTERCHANGE, {
    enumerable: false,
    value: Object.freeze({ graph: resolvedGraph, codecs: Object.freeze([...binding.dtcg]) }),
  })

  const describedArms = Object.freeze(describeConditionArms(conditions))
  const describedAsts = Object.freeze(describeConditionAsts(conditionInputs))
  const describedAxes = binding.axes.order.length === 0 ? undefined : describeAxisRegistry(binding.axes)
  const contract = createSystemContract({
    ...(file === undefined ? {} : { source: file }),
    prefix,
    root,
    ...(qualifiedTokenLayer === undefined ? {} : { tokenLayer: qualifiedTokenLayer }),
    layers: [...layers],
    capabilities: {
      signature: binding.signature,
      supportTarget: valueContext.support.id,
      constructors: Object.keys(binding.kernel.constructors).map(name => ({
        name,
        origin: getConstructorOrigin(name, binding, mode.owners),
      })),
      extensions: binding.kernel.extensions.map(extension => ({
        id: extension.id,
        version: String(extension.version),
        ...(extension.fingerprint === undefined ? {} : { fingerprint: extension.fingerprint }),
      })),
    },
    policies: contractPolicies,
    conditions: describedConditions as Readonly<Record<string, string>>,
    conditionArms: describedArms,
    conditionAsts: describedAsts,
    ...(describedAxes === undefined ? {} : { axes: describedAxes }),
    tokens: getTokenRestorations(tokens),
    tokenRecords: getTokenInspections(resolvedGraph),
    runtime: runtimeContract,
    ...(mode.consts === undefined ? {} : { consts: mode.consts }),
    ...(mode.utilities === undefined ? {} : { utilities: mode.utilities }),
    ...(mode.ruleGroups === undefined ? {} : { ruleGroups: mode.ruleGroups }),
    ...(mode.plugins === undefined ? {} : { plugins: mode.plugins }),
    ...(mode.owners === undefined ? {} : { owners: mode.owners }),
    ...(options.audit === undefined ? {} : { audits: options.audit }),
    ...(mode.overwrites === undefined ? {} : { overwrites: mode.overwrites }),
    emit: emitSystem,
  })
  Object.defineProperty(bound, VANITY_IN_PROCESS_SYSTEM, {
    enumerable: false,
    value: contract,
  })

  const semantic = introspectSystem(contract.portable)
  Object.defineProperties(bound, {
    axes: { enumerable: true, value: semantic.axes },
    explain: {
      enumerable: true,
      value: (subject: unknown) => explainFromSystem(semantic, subject),
    },
    introspect: {
      enumerable: true,
      value: () => semantic,
    },
  })

  record({
    kind: 'system',
    file,
    ...getDiagnosticSource(),
    prefix,
    root,
    ...(qualifiedTokenLayer === undefined ? {} : { tokenLayer: qualifiedTokenLayer }),
    capabilitySignature: binding.signature,
    supportTarget: valueContext.support.id,
    layers: [...layers],
    conditions: describedConditions as Readonly<Record<string, string>>,
    conditionArms: describedArms,
    conditionAsts: describedAsts,
    ...(describedAxes === undefined ? {} : { axes: describedAxes }),
    ...(options.audit === undefined ? {} : { audit: options.audit }),
    runtime: {
      protocol: runtimeContract.protocol,
      system: runtimeContract.system,
      root: runtimeContract.root,
    },
    identities: contract.portable.identities,
    portable: contract.portable,
  })

  if (mode.emitCss)
    emitSystem()

  const locked = Object.freeze(bound) as Bound
  return mode.emitCss
    ? locked
    : new Proxy(locked, {
      get(object, key, receiver) {
        if (typeof key === 'string' && LOCKED_ONLY_SYSTEM_MEMBERS.has(key)) {
          return () => {
            throw new TypeError(`[vanity] ${key}() is unavailable after consolidate(); fork the open system instead`)
          }
        }
        if (typeof key === 'string' && BUILD_SURFACES.has(key)) {
          // Consolidation normally happens in a plain system module, outside
          // the style-module inspection collector. Record the portable
          // contract at the first build-time use so manifests still receive
          // the system record without making consolidation itself a build
          // side effect.
          recordPortableSystem(contract.portable)
          contract.emit()
        }
        return Reflect.get(object, key, receiver)
      },
      has(object, key) {
        return typeof key === 'string' && LOCKED_ONLY_SYSTEM_MEMBERS.has(key)
          ? false
          : Reflect.has(object, key)
      },
    }) as Bound
}

function recordPortableSystem(portable: VanityPortableSystemV2): void {
  record({
    kind: 'system',
    ...(portable.source === undefined ? {} : { file: portable.source }),
    prefix: portable.prefix,
    root: portable.root,
    ...(portable.tokenLayer === undefined ? {} : { tokenLayer: portable.tokenLayer }),
    capabilitySignature: portable.capabilities.signature,
    supportTarget: portable.capabilities.supportTarget,
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

function getConstructorOrigin(
  name: string,
  binding: Pick<VanitySystemBinding<any, any, any>, 'kernel'>,
  owners: VanitySystemCreationMode['owners'],
): VanityCapabilityOrigin {
  const contributionOwner = owners?.[`constructor:${name}`]
  if (contributionOwner !== undefined) {
    return {
      kind: 'plugin',
      id: contributionOwner.id.startsWith('plugin:')
        ? contributionOwner.id.slice('plugin:'.length)
        : contributionOwner.id,
    }
  }

  const extension = binding.kernel.constructorExtensions[name]
  if (extension !== undefined) {
    return {
      kind: 'extension',
      id: extension.id,
      version: String(extension.version),
    }
  }

  return VANITY_BUILTIN_CONSTRUCTOR_NAMES.includes(name as typeof VANITY_BUILTIN_CONSTRUCTOR_NAMES[number])
    ? { kind: 'builtin' }
    : { kind: 'system' }
}

function emitSystemRules(
  system: Parameters<typeof createRulesEmitter>[0],
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
      ? createRulesEmitter(system)
      : createRulesEmitter(createLayerContext(system, rule.layer))
    emitter(rule.css)
  }
}

function mapTokenProjection(
  selection: unknown,
  kind: 'name' | 'var',
  path: string[],
): unknown {
  if (isHandle(selection))
    return kind === 'name' ? selection.$name : selection.$var()

  if (typeof selection !== 'object' || selection === null) {
    throw new TypeError(
      `[vanity] ${path.join('.') || 'projection'} is not a resolved token handle or token subtree`,
    )
  }

  return Object.freeze(Object.fromEntries(Object.entries(selection).map(([key, value]) => [
    key,
    mapTokenProjection(value, kind, [...path, key]),
  ])))
}

type TokenModuleImplementation = object

/**
 * Let a bound authoring function cross the build/app boundary as a stub:
 * importing the system module from app code is legal and useful (`t` and
 * published classes), so the build-only functions beside those
 * exports serialize into throwing stubs instead of poisoning the module
 * ([patterns.md §1] — app code never executes styling work at runtime).
 */
function buildOnly<F>(name: string, fn: F): F {
  substrate.modules.registerFunctionSerialization(fn as (...args: unknown[]) => unknown, {
    importPath: '@mszr/vanity/runtime',
    importName: 'restoreStyleAuthoringStub',
    args: [{ name }],
  })

  return fn
}

function registerApplicationProjection<F>(fn: F, importName: string, contract: object): F {
  substrate.modules.registerFunctionSerialization(fn as (...args: unknown[]) => unknown, {
    importPath: '@mszr/vanity/runtime',
    importName,
    args: [contract as any],
  })
  return fn
}

function createSerializableSystemValue(value: unknown, name: string, seen = new WeakMap<object, unknown>()): unknown {
  if (typeof value === 'function') {
    const existing = seen.get(value)
    if (existing !== undefined)
      return existing

    if (!Object.isExtensible(value)) {
      const createWrapper = function (this: unknown, ...args: unknown[]): unknown {
        return Reflect.apply(value, this, args)
      }
      seen.set(value, createWrapper)
      substrate.modules.registerFunctionSerialization(createWrapper, {
        importPath: '@mszr/vanity/runtime',
        importName: 'restoreStyleAuthoringStub',
        args: [{ name }],
      })
      copySerializableFunctionProperties(value as (...args: any[]) => unknown, createWrapper, name, seen)
      return Object.freeze(createWrapper)
    }

    seen.set(value, value)

    if (!Object.hasOwn(value, '__recipe__')) {
      substrate.modules.registerFunctionSerialization(value as (...args: unknown[]) => unknown, {
        importPath: '@mszr/vanity/runtime',
        importName: 'restoreStyleAuthoringStub',
        args: [{ name }],
      })
    }

    for (const [key, child] of Object.entries(value))
      createSerializableSystemValue(child, `${name}.${key}`, seen)

    return value
  }

  if (Array.isArray(value)) {
    const existing = seen.get(value)
    if (existing !== undefined)
      return existing
    seen.set(value, value)
    value.forEach((child, index) => createSerializableSystemValue(child, `${name}[${index}]`, seen))
    return value
  }

  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype)
    return value

  const existing = seen.get(value)
  if (existing !== undefined)
    return existing

  seen.set(value, value)

  for (const [key, child] of Object.entries(value))
    createSerializableSystemValue(child, `${name}.${key}`, seen)

  return value
}

function copySerializableFunctionProperties(
  source: (...args: any[]) => unknown,
  target: (...args: any[]) => unknown,
  name: string,
  seen: WeakMap<object, unknown>,
): void {
  for (const key of Reflect.ownKeys(source)) {
    if (key === 'name' || key === 'length' || key === 'prototype' || key === 'arguments' || key === 'caller')
      continue
    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    if (!descriptor)
      continue
    if ('value' in descriptor)
      descriptor.value = createSerializableSystemValue(descriptor.value, `${name}.${String(key)}`, seen)
    try {
      Object.defineProperty(target, key, descriptor)
    }
    catch {
      // A host-provided function may expose a non-configurable exotic member.
    }
  }
}
