/**
 * `defineTokens` — the graph in plain TS ([spec-tokens.md §1 and §5]).
 *
 * The walk builds a handle for every leaf, derivations then run once against
 * the finished handle tree (so references are ordinary property accesses), and
 * one resolution pass classifies liveness, folds or serializes every value,
 * runs the checks, and emits a single `:root` declaration through the
 * vanilla-extract substrate — which is never re-exported.
 */

import type { VanityDiagnosticInput as VanityDiagnostic } from '../diagnostics'
import type { VanityRuntimeBranchHandle, VanityRuntimeHandle, VanitySemanticTokenAddress, VanityTokenMode } from '../internal/handle'
import type { VanityAxisDefinition, VanityAxisRegistry, VanityAxisTriggerArm } from '../system/axes'
import type { VanityRuntimeContract, VanityRuntimeTokenContract } from '../system/live'
import type { VanityCssSupportTarget, VanityExpressionNode } from '../values/protocol'
import type { VanityCssValue, VanityValue } from '../values/types'
import type { VanityColorExpr } from './color'
import type { VanityOklch } from './math'
import type { VanityExprTraits, VanityResolver, VanityScheme } from './resolve'
import type {
  VanityDefaultTokenPolicy,
  VanityEngineRequirement,
  VanityGraphInput,
  VanityTokenBuilder,
  VanityTokenModule,
  VanityTokenModuleOptions,
  VanityTokenPolicy,
  VanityTokens,
  VanityTokensOptions,
} from './types'
import { createGlobalVar, globalLayer, globalStyle } from '@vanilla-extract/css'
import { getFileScope, hasFileScope } from '@vanilla-extract/css/fileScope'
import { addFunctionSerializer } from '@vanilla-extract/css/functionSerializer'
import { diagnosticSource, didYouMean, VanityError } from '../diagnostics'
import { checkSelector } from '../internal/cssParser'
import { rememberTokenFold } from '../internal/foldEvidence'
import {
  attachAxisBranch,
  attachCaseBranch,
  createBranchHandle,
  createHandle,
  setRuntimeAddress,
  updateHandle,
  VANITY_RUNTIME_ADDRESS,
  wireCaseBranches,
} from '../internal/handle'
import { collectInspection, inspecting, record } from '../internal/inspect'
import { sealRuntimeContract } from '../system/live'
import {
  collectNodeRequirements,
  constructorUsagesOfValue,
  createSerializeContext,
  serializeNode,
  nodeOf as valueNodeOf,
  VANITY_DEFAULT_CSS_SUPPORT,
} from '../values/protocol'
import { isCssValue } from '../values/types'
import { TextContrastCheck } from './checks'
import { colorRequirements, handleColorMethods, isColorValue, isContrastValue, toExpr } from './color'
import { createTokenFactory, isConfiguredToken } from './config'
import { attachTokenDeclarationGetters } from './declarations'
import { apcaContrast, formatNumber, formatOklch, parseColor, pickLegible, wcagContrast } from './math'
import { tokenName } from './names'
import { collectRefs, exprTraits, foldExpr, serializeContrastPick, serializeExpr } from './resolve'

export const GRAPH = Symbol.for('vanity.graph')
export const TOKEN_BUILDER = Symbol.for('vanity.tokenBuilder')
export const VANITY_MODULE_TOKEN_REF = Symbol.for('vanity.moduleTokenRef')
const TOKEN_FINALIZE = Symbol.for('vanity.tokenFinalize')
const NODE = Symbol.for('vanity.node')

const CONTRAST_COLOR_SUPPORT = '(color: contrast-color(red))'

// ─── Graph structures ────────────────────────────────────────────────────────

type VanityLeafDefinition
  = | { kind: 'none' }
    | { kind: 'literal', value: string | number }
    | { kind: 'value', value: VanityCssValue }
    | { kind: 'color', expr: VanityColorExpr, markedLive: boolean }
    | { kind: 'contrast', expr: Extract<VanityColorExpr, { kind: 'contrast' }> }

interface TokenNode {
  /** The dot path: `color.brand`. */
  key: string
  /** The emitted custom-property name: `--vanity-color-brand`. */
  name: string
  handle: VanityRuntimeHandle
  derived: boolean
  definition: VanityLeafDefinition
  meta: { description?: string, deprecated?: string }
  contract: TokenContract
  branches: readonly TokenBranch[]
  /** Effective emission location, finalized by the owning system. */
  root: string
  runtimeRoot?: string
  scopes?: readonly string[]
  moduleId?: symbol
  modulePath?: readonly string[]
  layer?: string
}

interface TokenContract {
  readonly canonical: boolean
  readonly reference: 'val' | 'var'
  readonly emit: boolean
  readonly mutable: boolean
  readonly type: import('../values/types').VanityCssDataType
  readonly register?: unknown
  readonly validate?: unknown
  readonly metadata?: import('./types').VanityTokenMetadata
  readonly inference: {
    readonly reference: 'explicit' | 'engine-default' | 'capability'
    readonly emit: 'explicit' | 'engine-default' | 'capability'
    readonly reasons: readonly string[]
  }
}

type TokenBranch
  = {
    readonly kind: 'axis'
    readonly axis: string
    readonly mode: string
    readonly definition: VanityLeafDefinition
    readonly handle: VanityRuntimeBranchHandle
  }
  | {
    readonly kind: 'case'
    readonly when: Readonly<Record<string, string>>
    readonly definition: VanityLeafDefinition
    readonly handle: VanityRuntimeBranchHandle
  }

interface NodeResult {
  traits: VanityExprTraits
  mode: VanityTokenMode
  emitted: string
  /** The `contrast-color()` upgrade a live-guarantee pairing declares under `@supports`. */
  supportsUpgrade?: string
}

export interface TokenGraph {
  prefix: string
  root: string
  nodes: Map<string, TokenNode>
  results: Map<string, NodeResult>
  /** Engine-bound serializer; absent only on the standalone characterization builder. */
  serializeValue?: (value: VanityCssValue) => string
  support?: VanityCssSupportTarget
  policies?: Readonly<Record<string, unknown>>
  axes?: VanityAxisRegistry<any>
  phaseLayers?: VanityTokenPhaseLayers
  contributions?: ReadonlySet<object>
  file?: string
  runtime?: VanityRuntimeContract
  runtimeSchemas?: Readonly<Record<string, import('./types').VanityStandardSchemaV1>>
  /** Installed authored-interchange codecs, keyed by extension id. */
  dtcgCodecIds?: ReadonlySet<string>
}

export function graphOf(tokens: object): TokenGraph | undefined {
  return (tokens as { [GRAPH]?: TokenGraph })[GRAPH]
}

/** Built-in constructor provenance per token, used by system policy borders. */
export function constructorUsagesOf(tokens: object): Readonly<Record<string, readonly string[]>> {
  const graph = graphOf(tokens)
  if (!graph)
    throw new TypeError('[vanity] constructor-usage inspection needs a resolved token graph')
  return Object.freeze(Object.fromEntries([...graph.nodes.values()].map((node) => {
    const usages = new Set<string>()
    collectDefinitionConstructorUsages(node.definition, usages)
    node.branches.forEach(branch => collectDefinitionConstructorUsages(branch.definition, usages))
    return [node.key, Object.freeze([...usages].sort())]
  })))
}

function collectDefinitionConstructorUsages(
  definition: VanityLeafDefinition,
  usages: Set<string>,
): void {
  if (definition.kind === 'value') {
    constructorUsagesOfValue(definition.value).forEach(name => usages.add(name))
    collectNodeConstructorUsages(valueNodeOf(definition.value), usages)
    return
  }
  if (definition.kind === 'color' || definition.kind === 'contrast') {
    constructorUsagesOfValue(definition.expr).forEach(name => usages.add(name))
    collectColorConstructorUsages(definition.expr, usages)
  }
}

function collectNodeConstructorUsages(node: VanityExpressionNode, usages: Set<string>): void {
  const helper = node.source?.helper
  if (helper)
    usages.add(helper.split('.')[0]!)
  nodeChildren(node).forEach(child => collectNodeConstructorUsages(child, usages))
}

function collectColorConstructorUsages(expr: VanityColorExpr, usages: Set<string>): void {
  switch (expr.kind) {
    case 'oklch':
      usages.add('oklch')
      return
    case 'parse':
    case 'ref':
      return
    case 'value':
      collectNodeConstructorUsages(valueNodeOf(expr.value), usages)
      return
    case 'alpha':
      usages.add('alpha')
      collectColorConstructorUsages(expr.input, usages)
      return
    case 'adjust':
      collectColorConstructorUsages(expr.input, usages)
      return
    case 'channels':
      usages.add('oklch')
      collectColorConstructorUsages(expr.input, usages)
      Object.values(expr.channels).forEach((channel) => {
        const values: readonly unknown[] = channel && typeof channel === 'object' && 'operations' in channel
          ? (channel as { readonly operations: readonly { readonly value: unknown }[] }).operations.map(operation => operation.value)
          : [channel]
        values.forEach((value) => {
          if (value && typeof value === 'object' && 'type' in value)
            collectNodeConstructorUsages(valueNodeOf(value as VanityValue), usages)
        })
      })
      return
    case 'relative':
      usages.add(expr.function)
      collectColorConstructorUsages(expr.input, usages)
      ;[...expr.channels, expr.alpha].forEach((channel) => {
        const values: readonly unknown[] = channel && typeof channel === 'object' && 'operations' in channel
          ? (channel as { readonly operations: readonly { readonly value: unknown }[] }).operations.map(operation => operation.value)
          : [channel]
        values.forEach((value) => {
          if (value && (typeof value === 'object' || typeof value === 'function') && 'type' in value)
            collectNodeConstructorUsages(valueNodeOf(value as VanityValue), usages)
        })
      })
      return
    case 'mix':
      usages.add('mix')
      collectColorConstructorUsages(expr.input, usages)
      collectColorConstructorUsages(expr.other, usages)
      return
    case 'scheme':
      usages.add('lightDark')
      collectColorConstructorUsages(expr.light, usages)
      collectColorConstructorUsages(expr.dark, usages)
      return
    case 'contrast':
      usages.add('legibleOn')
      collectColorConstructorUsages(expr.target, usages)
  }
}

export function runtimeContractOf(tokens: object): VanityRuntimeContract | undefined {
  return graphOf(tokens)?.runtime
}

export function runtimeSchemasOf(tokens: object): Readonly<Record<string, import('./types').VanityStandardSchemaV1>> {
  return graphOf(tokens)?.runtimeSchemas ?? {}
}

/** Data-only token restoration table used by compiler-owned runtime projection. */
export function tokenRestorationsOf(tokens: object): readonly import('../internal/handle').VanityHandleMeta[] {
  const graph = graphOf(tokens)
  if (!graph)
    throw new TypeError('[vanity] token restoration needs a resolved token graph')
  return Object.freeze([...graph.nodes.values()].map(node => Object.freeze(tokenRestorationMeta(node, graph))))
}

/** Emit a previously resolved graph. Consolidation itself always uses `emitCss: false`. */
export function emitTokenGraph(tokens: object): void {
  const graph = graphOf(tokens)
  if (!graph)
    throw new TypeError('[vanity] system emission needs a resolved token graph')
  emitGraph(graph)
}

const TOKEN_INSPECTION_CACHE = new WeakMap<TokenGraph, ReadonlyMap<string, import('../internal/inspect').VanityTokenRecord>>()

export function tokenInspectionsOf(graph: TokenGraph): readonly import('../internal/inspect').VanityTokenRecord[] {
  let cached = TOKEN_INSPECTION_CACHE.get(graph)
  if (!cached) {
    const { records } = collectInspection(() => recordGraph(graph))
    const next = new Map<string, import('../internal/inspect').VanityTokenRecord>()
    for (const record of records) {
      if (record.kind === 'token')
        next.set(record.path, record)
    }
    cached = next
    TOKEN_INSPECTION_CACHE.set(graph, cached)
  }
  return Object.freeze([...cached.values()])
}

/** Build-plane semantic record used by `ds.explain()` and authored interchange. */
export function tokenInspectionOf(
  graph: TokenGraph,
  handle: VanityRuntimeHandle,
): import('../internal/inspect').VanityTokenRecord {
  const node = nodeOf(handle)
  if (!node || graph.nodes.get(node.key) !== node)
    throw new TypeError('[vanity] explain() needs a token handle owned by this system')

  tokenInspectionsOf(graph)
  const cached = TOKEN_INSPECTION_CACHE.get(graph)!
  const token = cached.get(node.key)
  if (!token)
    throw new TypeError(`[vanity] no explanation record exists for ${node.key}`)
  return token
}

function cssOf(graph: TokenGraph, value: VanityCssValue): string {
  return graph.serializeValue?.(value) ?? value.css
}

function nodeOf(handle: VanityRuntimeHandle): TokenNode | undefined {
  return (handle as unknown as { [NODE]?: TokenNode })[NODE]
}

/**
 * Whether a graph handle names a color or a plain value — build-plane
 * knowledge for surfaces that infer a type from a token default (ports).
 * Undefined for handles outside a resolved graph.
 */
export function tokenKindOf(handle: VanityRuntimeHandle): 'color' | 'value' | undefined {
  const node = nodeOf(handle)

  if (!node)
    return undefined

  return node.definition.kind === 'literal' || (node.definition.kind === 'value' && node.definition.value.type !== 'color') ? 'value' : 'color'
}

// ─── defineTokens ────────────────────────────────────────────────────────────

type RuntimeStage = (m: Record<string, unknown>) => object
type RuntimeContribution
  = {
    readonly kind: 'seed'
    readonly graph: VanityGraphInput
    readonly emission: VanityTokenModuleOptions
    readonly moduleId?: symbol
    readonly modulePath?: readonly string[]
  }
  | {
    readonly kind: 'derive'
    readonly stage: RuntimeStage
    readonly emission: VanityTokenModuleOptions
    readonly moduleId?: symbol
    readonly modulePath?: readonly string[]
  }
  | { readonly kind: 'patch', readonly mode: 'augment' | 'overwrite', readonly graph: VanityGraphInput }
  | { readonly kind: 'patch-stage', readonly mode: 'augment' | 'overwrite', readonly stage: RuntimeStage }

const CONTRIBUTION_PATHS = new WeakMap<object, readonly string[]>()

interface RuntimeTokenBuilder {
  readonly [TOKEN_BUILDER]: true
  readonly [TOKEN_FINALIZE]: (options?: RuntimeBuildOptions) => VanityTokens<object, string>
  readonly contributions: readonly RuntimeContribution[]
  readonly engine?: VanityEngineRequirement
  readonly tokenPolicy?: VanityTokenPolicy
  compose: (module: RuntimeTokenBuilder) => RuntimeTokenBuilder
  derive: (stage: RuntimeStage) => RuntimeTokenBuilder
  /** Present only on the standalone characterization builder. */
  build?: (options?: RuntimeBuildOptions) => VanityTokens<object, string>
}

export interface RuntimeBuildOptions extends VanityTokensOptions<object, string> {
  readonly root?: string
  readonly layer?: string
  readonly layers?: readonly string[]
  readonly serializeValue?: (value: VanityCssValue) => string
  readonly support?: VanityCssSupportTarget
  readonly policies?: Readonly<Record<string, unknown>>
  readonly axes?: VanityAxisRegistry<any>
  readonly phaseLayers?: VanityTokenPhaseLayers
  /** Introspection/interchange finalization can build the graph without touching a stylesheet. */
  readonly emitCss?: boolean
  readonly dtcgCodecIds?: ReadonlySet<string>
}

export interface VanityTokenPhaseLayers {
  readonly root: string
  readonly base: string
  readonly axes: Readonly<Record<string, string>>
  readonly cases: string
  readonly overrides: string
}

/** Whether a value is the unfinished definition returned by `defineTokens`. */
export function isTokenBuilder(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && (value as Partial<RuntimeTokenBuilder>)[TOKEN_BUILDER] === true
}

/**
 * Standalone characterization builder used to verify graph semantics without
 * an engine. Product authoring starts from `createEngine().defineTokens()`.
 */
export function defineTokens<const T extends VanityGraphInput = Record<never, never>>(seed?: T): VanityTokenBuilder<T> {
  const graph = seed ?? {} as T
  return createTokenBuilder([{ kind: 'seed', graph, emission: {} }], undefined, undefined, {}, true) as unknown as VanityTokenBuilder<T>
}

/** Canonical, engine-portable module used by the Phase 5 unified builder. */
export function definePortableTokenModule<
  const T extends VanityGraphInput = Record<never, never>,
  const Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
>(
  seed?: T,
  tokenPolicy: Policy = Object.freeze({ reference: 'var', emit: true }) as Policy,
): VanityTokenModule<T, Policy> {
  const graph = snapshotGroup(seed ?? {} as T) as T
  return createTokenBuilder(
    [{ kind: 'seed', graph, emission: {} }],
    undefined,
    tokenPolicy,
  ) as unknown as VanityTokenModule<T, Policy>
}

/** Create the canonical unfinished module bound to one semantic engine. */
export function defineTokenModule<
  const T extends VanityGraphInput = Record<never, never>,
  const Policy extends VanityTokenPolicy = VanityTokenPolicy,
>(
  engine: VanityEngineRequirement,
  tokenPolicy: Policy,
  seed?: T,
  options: VanityTokenModuleOptions = {},
): VanityTokenModule<T, Policy> {
  validateModuleOptions(options)
  const graph = snapshotGroup(seed ?? {} as T) as T
  const emission = Object.freeze({ ...options })
  return createTokenBuilder([{ kind: 'seed', graph, emission }], engine, tokenPolicy, emission) as unknown as VanityTokenModule<T, Policy>
}

function createTokenBuilder(
  contributions: readonly RuntimeContribution[],
  engine?: VanityEngineRequirement,
  tokenPolicy?: VanityTokenPolicy,
  derivationEmission: VanityTokenModuleOptions = {},
  exposeStandaloneBuild = false,
): RuntimeTokenBuilder {
  const frozenContributions = Object.freeze([...contributions])
  const frozenDerivationEmission = Object.freeze({ ...derivationEmission })
  const finalize = (options?: RuntimeBuildOptions) => buildTokens(frozenContributions, tokenPolicy, options)
  const builder: RuntimeTokenBuilder = {
    [TOKEN_BUILDER]: true as const,
    [TOKEN_FINALIZE]: finalize,
    contributions: frozenContributions,
    engine,
    tokenPolicy,
    compose: (module: RuntimeTokenBuilder) => {
      assertComposableEngine(engine, module.engine)
      return createTokenBuilder(
        [...frozenContributions, ...module.contributions],
        engine ?? module.engine,
        tokenPolicy ?? module.tokenPolicy,
        frozenDerivationEmission,
        exposeStandaloneBuild,
      )
    },
    derive: (stage: RuntimeStage) => createTokenBuilder(
      [...frozenContributions, Object.freeze({
        kind: 'derive' as const,
        stage,
        emission: frozenDerivationEmission,
      })],
      engine,
      tokenPolicy,
      frozenDerivationEmission,
      exposeStandaloneBuild,
    ),
    ...(exposeStandaloneBuild ? { build: finalize } : {}),
  }
  return Object.freeze(builder)
}

/** Internal system boundary: canonical modules have no public `.build()`. */
export function finalizeTokenModule(
  module: unknown,
  options?: RuntimeBuildOptions,
): VanityTokens<object, string> {
  if (!isTokenBuilder(module))
    throw new TypeError('[vanity] only an unfinished token module can be finalized')
  return (module as RuntimeTokenBuilder)[TOKEN_FINALIZE](options)
}

/** Phase 4 bridge for explicit user augment/overwrite operations. */
export function patchTokenModule(
  module: unknown,
  mode: 'augment' | 'overwrite',
  input: VanityGraphInput | unknown,
): unknown {
  if (!isTokenBuilder(module))
    throw new TypeError('[vanity] token patches need an unfinished token module')
  const builder = module as RuntimeTokenBuilder
  const additions: readonly RuntimeContribution[] = isTokenBuilder(input)
    ? (input as RuntimeTokenBuilder).contributions.map((contribution): RuntimeContribution => {
        if (contribution.kind === 'seed')
          return Object.freeze({ kind: 'patch' as const, mode, graph: contribution.graph })
        if (contribution.kind === 'derive')
          return Object.freeze({ kind: 'patch-stage' as const, mode, stage: contribution.stage })
        if (contribution.kind === 'patch-stage')
          return Object.freeze({ ...contribution, mode })
        return Object.freeze({ ...contribution, mode })
      })
    : [Object.freeze({
        kind: 'patch' as const,
        mode,
        graph: snapshotGroup(input as VanityGraphInput) as VanityGraphInput,
      })]
  return createTokenBuilder(
    [...builder.contributions, ...additions],
    builder.engine,
    builder.tokenPolicy,
  )
}

/** Tag contributions so lazy module-relative handles can rebind after mounting. */
export function identifyTokenModule(module: unknown, id: symbol): unknown {
  if (!isTokenBuilder(module))
    throw new TypeError('[vanity] only an unfinished token module can carry module identity')
  const builder = module as RuntimeTokenBuilder
  const contributions = builder.contributions.map((contribution): RuntimeContribution =>
    contribution.kind === 'patch' || contribution.kind === 'patch-stage' || contribution.moduleId !== undefined
      ? contribution
      : Object.freeze({
          ...contribution,
          moduleId: id,
          modulePath: Object.freeze([...(contribution.modulePath ?? [])]),
        }))
  return createTokenBuilder(
    contributions,
    builder.engine,
    builder.tokenPolicy,
    {},
    builder.build !== undefined,
  )
}

/** Mount an unfinished module beneath a path without materializing its refs. */
export function prefixTokenModule(module: unknown, path: readonly string[]): unknown {
  if (!isTokenBuilder(module))
    throw new TypeError('[vanity] only an unfinished token module can be mounted')
  if (path.length === 0)
    return module
  const builder = module as RuntimeTokenBuilder
  const contributions = builder.contributions.map((contribution): RuntimeContribution => {
    if (contribution.kind === 'seed') {
      return Object.freeze({
        ...contribution,
        graph: wrapGraph(path, contribution.graph),
        modulePath: Object.freeze([...path, ...(contribution.modulePath ?? [])]),
      })
    }
    if (contribution.kind === 'patch') {
      return Object.freeze({
        ...contribution,
        graph: wrapGraph(path, contribution.graph),
      })
    }
    if (contribution.kind === 'patch-stage') {
      return Object.freeze({
        ...contribution,
        stage: (m: Record<string, unknown>) =>
          wrapGraph(path, contribution.stage(readGraphPath(m, path))),
      })
    }
    return Object.freeze({
      ...contribution,
      modulePath: Object.freeze([...path, ...(contribution.modulePath ?? [])]),
      stage: (m: Record<string, unknown>) =>
        wrapGraph(path, contribution.stage(readGraphPath(m, path))),
    })
  })
  return createTokenBuilder(
    contributions,
    builder.engine,
    builder.tokenPolicy,
    {},
    builder.build !== undefined,
  )
}

/** Apply a module root immutably to every contribution in that module. */
export function rootTokenModule(
  module: unknown,
  root: string | {
    readonly root?: string
    readonly runtimeRoot?: string
    readonly scopes?: readonly string[]
    readonly systemRoot?: true
  },
): unknown {
  if (!isTokenBuilder(module))
    throw new TypeError('[vanity] only an unfinished token module can declare a root')
  const options = typeof root === 'string' ? { root } : root
  if (options.root !== undefined && options.root.trim().length === 0)
    throw new TypeError('[vanity] a token module root must be a non-empty selector')
  const builder = module as RuntimeTokenBuilder
  const emission = Object.freeze({ ...options })
  const contributions = builder.contributions.map((contribution): RuntimeContribution =>
    contribution.kind === 'patch' || contribution.kind === 'patch-stage'
      ? contribution
      : contribution.emission.root !== undefined
        || contribution.emission.systemRoot === true
        || contribution.emission.runtimeRoot !== undefined
        || contribution.emission.scopes !== undefined
        ? contribution
        : Object.freeze({
            ...contribution,
            emission: Object.freeze({ ...contribution.emission, ...options }),
          }))
  return createTokenBuilder(
    contributions,
    builder.engine,
    builder.tokenPolicy,
    emission,
    builder.build !== undefined,
  )
}

function wrapGraph(path: readonly string[], graph: object): VanityGraphInput {
  let wrapped: object = graph
  for (const name of [...path].reverse())
    wrapped = { [name]: wrapped }
  return wrapped as VanityGraphInput
}

function readGraphPath(tree: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
  let current = tree
  for (const name of path) {
    const child = current[name]
    current = child && (typeof child === 'object' || typeof child === 'function')
      ? child as Record<string, unknown>
      : {}
  }
  return current
}

function snapshotGroup(group: object): object {
  return Object.freeze(Object.fromEntries(Object.entries(group).map(([key, value]) => [
    key,
    isGroup(value) ? snapshotGroup(value) : value,
  ])))
}

export function tokenModuleEngine(value: unknown): VanityEngineRequirement | undefined {
  return isTokenBuilder(value) ? (value as RuntimeTokenBuilder).engine : undefined
}

function assertComposableEngine(
  target: VanityEngineRequirement | undefined,
  module: VanityEngineRequirement | undefined,
): void {
  if (module === undefined)
    return

  if (target === undefined || !target.compatibleSignatures.includes(module.signature)) {
    throw new VanityError({
      code: 'VANITY_ENGINE_INCOMPATIBLE',
      message: 'token modules were created by incompatible design engines',
      detail: [
        `target engine: ${target?.signature ?? 'unbound'}`,
        `module engine: ${module?.signature ?? 'unbound'}`,
      ],
      fix: 'define and compose the module with an equivalent engine, or install the same plugin/policy revision',
    })
  }
}

function validateModuleOptions(options: VanityTokenModuleOptions): void {
  if (options.root !== undefined) {
    if (options.root.includes('&') || checkSelector(options.root))
      throw new TypeError(`[vanity] token module root '${options.root}' is not a valid absolute CSS selector`)
  }
  if (options.runtimeRoot !== undefined && checkSelector(options.runtimeRoot))
    throw new TypeError(`[vanity] token module runtime root '${options.runtimeRoot}' is not a valid CSS selector`)
  for (const scope of options.scopes ?? []) {
    if (scope.trim().length === 0)
      throw new TypeError('[vanity] a token module @scope prelude cannot be empty')
  }
  if (options.layer !== undefined && !isLayerPath(options.layer))
    throw new TypeError(`[vanity] token module layer '${options.layer}' is not a valid dotted CSS layer path`)
}

function isLayerPath(value: string): boolean {
  return value.length > 0 && value.split('.').every(part => /^-?(?:[_a-z]|[^\0-\x7F])(?:[-\w]|[^\0-\x7F])*$/i.test(part))
}

function normalizeEmission(
  module: VanityTokenModuleOptions,
  system: {
    readonly root: string
    readonly layer?: string
    readonly layers?: readonly string[]
    readonly prefix?: string
  },
): {
  readonly root: string
  readonly runtimeRoot?: string
  readonly scopes?: readonly string[]
  readonly layer?: string
} {
  const root = module.systemRoot === true ? system.root : module.root ?? system.root
  const runtimeRoot = module.systemRoot === true ? undefined : module.runtimeRoot
  const scopes = module.scopes
  const authoredLayer = module.layer

  if (authoredLayer === undefined) {
    return {
      root,
      ...(runtimeRoot === undefined ? {} : { runtimeRoot }),
      ...(scopes === undefined ? {} : { scopes }),
      ...(system.layer === undefined ? {} : { layer: system.layer }),
    }
  }

  const top = authoredLayer.split('.')[0]!
  if (system.layers && !system.layers.includes(top)) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_UNKNOWN_LAYER',
      message: `token module layer '${authoredLayer}' is outside this system's declared layers`,
      detail: [`declared layers: ${system.layers.join(', ')}`],
      fix: `start the module layer with one of: ${system.layers.join(', ')}`,
    })
  }

  const layer = system.prefix === undefined || authoredLayer.startsWith(`${system.prefix}.`)
    ? authoredLayer
    : `${system.prefix}.${authoredLayer}`
  return {
    root,
    ...(runtimeRoot === undefined ? {} : { runtimeRoot }),
    ...(scopes === undefined ? {} : { scopes }),
    layer,
  }
}

function buildTokens<T extends object, Prefix extends string = 'vanity'>(
  contributions: readonly RuntimeContribution[],
  tokenPolicy: VanityTokenPolicy | undefined,
  options: RuntimeBuildOptions = {},
): VanityTokens<T, Prefix> {
  const prefix = options.prefix ?? 'vanity'
  const defaultRoot = options.root ?? ':root'
  const defaultLayer = options.layer
  const file = hasFileScope() ? getFileScope().filePath : undefined
  const nodes = new Map<string, TokenNode>()
  const tree: Record<string, unknown> = {}

  let stageIndex = 0

  for (const contribution of contributions) {
    if (contribution.kind === 'seed') {
      const emission = normalizeEmission(contribution.emission, {
        root: defaultRoot,
        layer: defaultLayer,
        layers: options.layers,
        prefix,
      })
      const added: string[] = []
      walkInto(
        contribution.graph,
        [],
        prefix,
        nodes,
        tree,
        false,
        emission,
        tokenPolicy,
        options.axes,
        added,
        file,
        contribution.moduleId,
        contribution.modulePath,
      )
      CONTRIBUTION_PATHS.set(contribution, Object.freeze(added))
      continue
    }

    if (contribution.kind === 'patch') {
      applyTokenPatch(
        contribution,
        prefix,
        nodes,
        tree,
        tokenPolicy,
        options.axes,
        file,
      )
      continue
    }

    stageIndex++
    hydratePartialGraph(prefix, nodes, options, file)
    const additions = contribution.stage(refsProxy(
      tree,
      [],
      `${contribution.kind === 'patch-stage' ? 'patch' : 'derivation'} stage ${stageIndex}`,
      file,
    ))

    if (!isGroup(additions)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        message: `${contribution.kind === 'patch-stage' ? 'patch' : 'derivation'} stage ${stageIndex} did not return a token group`,
        file,
        fix: 'return an object whose leaves are token values',
      })
    }

    if (contribution.kind === 'patch-stage') {
      applyTokenPatch(
        { kind: 'patch', mode: contribution.mode, graph: additions as VanityGraphInput },
        prefix,
        nodes,
        tree,
        tokenPolicy,
        options.axes,
        file,
      )
      continue
    }

    const emission = normalizeEmission(contribution.emission, {
      root: defaultRoot,
      layer: defaultLayer,
      layers: options.layers,
      prefix,
    })
    const added: string[] = []
    walkInto(
      additions,
      [],
      prefix,
      nodes,
      tree,
      true,
      emission,
      tokenPolicy,
      options.axes,
      added,
      file,
      contribution.moduleId,
      contribution.modulePath,
    )
    CONTRIBUTION_PATHS.set(contribution, Object.freeze(added))
  }

  const unresolved: TokenGraph = {
    prefix,
    root: defaultRoot,
    nodes,
    results: new Map(),
    file,
    contributions: new Set(contributions),
    ...(options.serializeValue === undefined ? {} : { serializeValue: options.serializeValue }),
    ...(options.support === undefined ? {} : { support: options.support }),
    ...(options.policies === undefined ? {} : { policies: options.policies }),
    ...(options.axes === undefined ? {} : { axes: options.axes }),
    ...(options.phaseLayers === undefined ? {} : { phaseLayers: options.phaseLayers }),
    ...(options.dtcgCodecIds === undefined ? {} : { dtcgCodecIds: options.dtcgCodecIds }),
  }
  const { results, diagnostics } = resolveGraph(unresolved)
  const resolved: TokenGraph = { ...unresolved, results }

  diagnostics.push(...runChecks(options.checks?.(tree as VanityTokens<T, Prefix>) ?? [], resolved))

  if (diagnostics.length > 0)
    throw new VanityError(diagnostics)

  hydrateGraphHandles(resolved)
  attachTokenDeclarationGetters(tree, { file })
  resolved.runtime = buildRuntimeContract(resolved)
  resolved.runtimeSchemas = collectRuntimeSchemas(resolved)
  attachRuntimeAddresses(resolved)

  for (const node of nodes.values()) {
    addFunctionSerializer(node.handle as unknown as (...args: unknown[]) => unknown, {
      importPath: '@mszr/vanity/runtime',
      importName: 'restoreToken',
      args: [tokenRestorationMeta(node, resolved) as any],
    })
  }

  if (options.emitCss !== false)
    emitGraph(resolved)

  Object.defineProperty(tree, GRAPH, { value: resolved })

  if (inspecting())
    recordGraph(resolved)

  return tree as VanityTokens<T, Prefix>
}

function applyTokenPatch(
  contribution: Extract<RuntimeContribution, { kind: 'patch' }>,
  prefix: string,
  nodes: Map<string, TokenNode>,
  tree: Record<string, unknown>,
  tokenPolicy: VanityTokenPolicy | undefined,
  axes: VanityAxisRegistry<any> | undefined,
  file?: string,
): void {
  const visit = (group: object, path: string[]) => {
    for (const [name, raw] of Object.entries(group)) {
      const nextPath = [...path, name]
      const key = nextPath.join('.')
      const current = nodes.get(key)

      if (!current) {
        if (isGroup(raw)) {
          visit(raw, nextPath)
          continue
        }
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_OVERRIDE',
          message: `${contribution.mode}Tokens() cannot change unknown token '${key}'`,
          path: key,
          file,
          fix: `register '${key}' with addTokens() before ${contribution.mode}ing it`,
        })
      }

      const resolvedRaw = resolvePatchValue(raw, current, axes)
      const patchesBase = !isConfiguredToken(resolvedRaw) || Object.hasOwn(resolvedRaw.config, 'val')
      const validationRaw = !patchesBase && isConfiguredToken(resolvedRaw) && current.definition.kind !== 'none'
        ? (createTokenFactory(axes) as any)({
            ...resolvedRaw.config,
            val: current.handle,
          })
        : resolvedRaw

      const temporaryNodes = new Map<string, TokenNode>()
      const temporaryTree: Record<string, unknown> = {}
      walkInto(
        { [name]: validationRaw },
        path,
        prefix,
        temporaryNodes,
        temporaryTree,
        current.derived,
        {
          root: current.root,
          ...(current.runtimeRoot === undefined ? {} : { runtimeRoot: current.runtimeRoot }),
          ...(current.scopes === undefined ? {} : { scopes: current.scopes }),
          ...(current.layer === undefined ? {} : { layer: current.layer }),
        },
        tokenPolicy,
        axes,
        [],
        file,
        current.moduleId,
        current.modulePath,
      )
      const normalizedReplacement = temporaryNodes.get(key)
      if (!normalizedReplacement)
        throw new TypeError(`[vanity] ${contribution.mode}Tokens() did not produce a token at '${key}'`)
      const replacement = filterPatchBranches(normalizedReplacement, resolvedRaw)

      const next = mergePatchedNode(current, replacement, contribution.mode, patchesBase, file)
      nodes.set(key, next)

      // The public preview tree retains the same phase-polymorphic handle.
      let target = tree
      for (let index = 0; index < nextPath.length - 1; index++)
        target = target[nextPath[index]!] as Record<string, unknown>
      target[name] = current.handle
    }
  }

  visit(contribution.graph, [])
}

function filterPatchBranches(replacement: TokenNode, raw: unknown): TokenNode {
  if (!isConfiguredToken(raw))
    return replacement
  const axisSlots = new Set(Object.entries(raw.config.axes ?? {}).flatMap(([axis, modes]) =>
    Object.keys(modes).map(mode => `axis:${axis}:${mode}`),
  ))
  return {
    ...replacement,
    branches: replacement.branches.filter((branch) => {
      const key = tokenBranchKey(branch)
      return branch.kind === 'axis' ? axisSlots.has(key) : raw.config.cases !== undefined
    }),
  }
}

function resolvePatchValue(
  raw: unknown,
  current: TokenNode,
  axes: VanityAxisRegistry<any> | undefined,
): unknown {
  if (typeof raw !== 'function' || nodeOf(raw as VanityRuntimeHandle))
    return raw

  const token = createTokenFactory(axes)
  const configured = (config: import('./types').VanityTokenConfig): unknown => {
    const value = (token as any)(config)
    return new Proxy(value, {
      get(target, key, receiver) {
        if (typeof key !== 'string' || axes?.definitions[key] === undefined)
          return Reflect.get(target, key, receiver)
        return (input: unknown) => configured({
          ...config,
          axes: {
            ...config.axes,
            [key]: normalizePatchAxisInput(input, axes.definitions[key]!),
          },
        })
      },
    })
  }
  const target = new Proxy(Object.create(null) as Record<string, unknown>, {
    get(_target, key) {
      if (key === 'val')
        return (value: unknown) => configured({ val: value })
      if (typeof key === 'string' && axes?.definitions[key] !== undefined) {
        return (input: unknown) => configured({
          axes: { [key]: normalizePatchAxisInput(input, axes.definitions[key]!) },
        })
      }
      return undefined
    },
  })

  try {
    return raw(target)
  }
  catch (cause) {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_OVERRIDE',
      message: `token patch callback for '${current.key}' failed`,
      path: current.key,
      detail: [cause instanceof Error ? cause.message : String(cause)],
      fix: 'return token.val(value) or one of the declared axis methods',
    })
  }
}

function normalizePatchAxisInput(
  input: unknown,
  axis: VanityAxisDefinition,
): Readonly<Record<string, unknown | null>> {
  if (typeof input === 'function')
    return Object.fromEntries(axis.modeOrder.map(mode => [mode, input(mode)]))
  if (!input || typeof input !== 'object')
    throw new TypeError('an axis patch needs a mode-value object or mode callback')
  return input as Readonly<Record<string, unknown | null>>
}

function mergePatchedNode(
  current: TokenNode,
  replacement: TokenNode,
  mode: 'augment' | 'overwrite',
  patchesBase: boolean,
  file?: string,
): TokenNode {
  if (mode === 'augment' && patchesBase && current.definition.kind !== 'none')
    occupiedPatchSlot(current.key, 'val', file)

  const currentBranches = new Map(current.branches.map(branch => [tokenBranchKey(branch), branch]))
  const replacementBranches = new Map(replacement.branches.map(branch => [tokenBranchKey(branch), branch]))
  for (const [address, branch] of replacementBranches) {
    const existing = currentBranches.get(address)
    if (mode === 'augment' && existing?.definition.kind !== undefined && existing.definition.kind !== 'none')
      occupiedPatchSlot(current.key, address, file)
    if (existing) {
      replacementBranches.set(address, { ...branch, handle: existing.handle })
      continue
    }
    if (branch.kind === 'axis')
      attachAxisBranch(current.handle, branch.axis, branch.mode, branch.handle)
    else
      attachCaseBranch(current.handle, branch.when, branch.handle)
  }

  const branches = [
    ...current.branches.map(branch => replacementBranches.get(tokenBranchKey(branch)) ?? branch),
    ...replacement.branches.filter(branch => !currentBranches.has(tokenBranchKey(branch))),
  ]
  const metadata = current.contract.metadata === undefined && replacement.contract.metadata === undefined
    ? undefined
    : Object.freeze({
        ...current.contract.metadata,
        ...replacement.contract.metadata,
      })
  const currentType = current.contract.type
  const replacementType = replacement.contract.type
  if (patchesBase && currentType !== 'unknown' && replacementType !== 'unknown' && currentType !== replacementType)
    invalidTrait(current.key, 'val', `preserve the established ${currentType} data type`)

  return {
    ...current,
    definition: patchesBase ? replacement.definition : current.definition,
    meta: {
      description: replacement.meta.description ?? current.meta.description,
      deprecated: replacement.meta.deprecated ?? current.meta.deprecated,
    },
    contract: {
      ...current.contract,
      reference: current.contract.reference === 'var' || replacement.contract.reference === 'var' ? 'var' : 'val',
      emit: current.contract.emit || replacement.contract.emit,
      mutable: current.contract.mutable || replacement.contract.mutable,
      type: currentType === 'unknown' ? replacementType : currentType,
      ...(replacement.contract.register ?? current.contract.register) === undefined
        ? {}
        : { register: replacement.contract.register ?? current.contract.register },
      ...(replacement.contract.validate ?? current.contract.validate) === undefined
        ? {}
        : { validate: replacement.contract.validate ?? current.contract.validate },
      ...(metadata === undefined ? {} : { metadata }),
    },
    branches: Object.freeze(branches),
  }
}

function tokenBranchKey(branch: TokenBranch): string {
  return branch.kind === 'axis'
    ? `axis:${branch.axis}:${branch.mode}`
    : `case:${Object.entries(branch.when).map(([axis, mode]) => `${axis}:${mode}`).join('|')}`
}

function occupiedPatchSlot(token: string, slot: string, file?: string): never {
  throw new VanityError({
    code: 'VANITY_TOKENS_INVALID_OVERRIDE',
    message: `augmentTokens() cannot fill '${token}.${slot}' because that slot already has a value`,
    path: `${token}.${slot}`,
    file,
    fix: 'use overwriteTokens() when replacing an existing value is intentional',
  })
}

function tokenRestorationMeta(
  node: TokenNode,
  graph: TokenGraph,
): import('../internal/handle').VanityHandleMeta {
  const result = graph.results.get(node.key)!
  const axes: Record<string, Record<string, {
    value?: string | number
    runtime?: import('../internal/handle').VanityHandleRuntimeAddress
  }>> = {}
  const cases: {
    when: Readonly<Record<string, string>>
    value?: string | number
    runtime?: import('../internal/handle').VanityHandleRuntimeAddress
  }[] = []

  for (const branch of node.branches) {
    if (branch.kind === 'axis') {
      axes[branch.axis] ??= {}
      axes[branch.axis]![branch.mode] = {
        ...(branch.handle.$val === undefined ? {} : { value: branch.handle.$val }),
        ...(branch.handle[VANITY_RUNTIME_ADDRESS] === undefined ? {} : { runtime: branch.handle[VANITY_RUNTIME_ADDRESS] }),
      }
    }
    else {
      cases.push({
        when: branch.when,
        ...(branch.handle.$val === undefined ? {} : { value: branch.handle.$val }),
        ...(branch.handle[VANITY_RUNTIME_ADDRESS] === undefined ? {} : { runtime: branch.handle[VANITY_RUNTIME_ADDRESS] }),
      })
    }
  }

  return {
    name: node.name,
    path: node.key,
    mode: result.mode,
    reference: node.contract.reference,
    emit: node.contract.emit,
    mutable: node.contract.mutable,
    type: node.contract.type,
    ...(node.definition.kind === 'none' ? {} : { value: result.emitted }),
    ...(node.meta.description === undefined ? {} : { description: node.meta.description }),
    ...(node.meta.deprecated === undefined ? {} : { deprecated: node.meta.deprecated }),
    ...(node.contract.metadata === undefined ? {} : { metadata: node.contract.metadata }),
    ...(node.contract.register === undefined ? {} : { register: serializableRegistration(node, graph) }),
    ...(runtimeValidationOf(node, graph) === undefined ? {} : { validate: runtimeValidationOf(node, graph) }),
    ...(node.handle[VANITY_RUNTIME_ADDRESS] === undefined ? {} : { runtime: node.handle[VANITY_RUNTIME_ADDRESS] }),
    ...(Object.keys(axes).length === 0 ? {} : { axes }),
    ...(cases.length === 0 ? {} : { cases }),
  }
}

function hydratePartialGraph(
  prefix: string,
  nodes: Map<string, TokenNode>,
  options: RuntimeBuildOptions,
  file?: string,
): void {
  if (nodes.size === 0)
    return
  const unresolved: TokenGraph = {
    prefix,
    root: options.root ?? ':root',
    nodes,
    results: new Map(),
    file,
    ...(options.serializeValue === undefined ? {} : { serializeValue: options.serializeValue }),
    ...(options.support === undefined ? {} : { support: options.support }),
    ...(options.policies === undefined ? {} : { policies: options.policies }),
    ...(options.axes === undefined ? {} : { axes: options.axes }),
    ...(options.phaseLayers === undefined ? {} : { phaseLayers: options.phaseLayers }),
    ...(options.dtcgCodecIds === undefined ? {} : { dtcgCodecIds: options.dtcgCodecIds }),
  }
  const { results, diagnostics } = resolveGraph(unresolved)
  if (diagnostics.length > 0)
    throw new VanityError(diagnostics)
  hydrateGraphHandles({ ...unresolved, results })
}

function hydrateGraphHandles(graph: TokenGraph): void {
  for (const node of graph.nodes.values()) {
    rememberTokenFold(
      node.handle,
      () => tokenInspectionOf(graph, node.handle).semantic.fold,
    )
    const result = graph.results.get(node.key)!
    updateHandle(node.handle, {
      mode: result.mode,
      value: node.definition.kind === 'none' ? undefined : result.emitted,
      description: node.meta.description,
      deprecated: node.meta.deprecated,
      metadata: node.contract.metadata,
    })

    for (const branch of node.branches)
      branch.handle.$val = serializeBranch(branch.definition, graph)
  }
}

function serializeBranch(definition: VanityLeafDefinition, graph: TokenGraph): string | number | undefined {
  if (definition.kind === 'none')
    return undefined
  if (definition.kind === 'literal')
    return definition.value
  if (definition.kind === 'value')
    return cssOf(graph, definition.value)

  const base = checkResolver(graph, 'light')
  const resolver: VanityResolver = {
    ...base,
    refTraits: (handle) => {
      const node = nodeOf(handle)
      const result = node ? graph.results.get(node.key) : undefined
      return {
        cssLive: (result?.traits.cssLive ?? false) || node?.contract.reference === 'var',
        volatile: (result?.traits.volatile ?? false) || node?.contract.mutable === true,
        conditional: result?.traits.conditional ?? false,
      }
    },
    serializeRef: (handle) => {
      const node = nodeOf(handle)
      if (!node)
        return handle.var
      return node.contract.reference === 'var' ? handle.var : graph.results.get(node.key)!.emitted
    },
  }

  if (definition.kind === 'contrast')
    return serializeContrastPick(definition.expr, resolver)

  const traits = exprTraits(definition.expr, resolver)
  return traits.cssLive || traits.volatile
    ? serializeExpr(definition.expr, resolver)
    : formatOklch(foldExpr(definition.expr, 'light', resolver))
}

function buildRuntimeContract(graph: TokenGraph): VanityRuntimeContract {
  const axisOrder = [...(graph.axes?.order ?? [])]
  const rootPaths = runtimeRootPaths(graph)
  const axes = Object.fromEntries(axisOrder.map((axis) => {
    const definition = graph.axes!.definitions[axis]!
    const runtimeArms: { mode: string, arm: VanityAxisTriggerArm | undefined }[] = definition.modeOrder.map((mode: string) => ({
      mode,
      arm: [...definition.modes[mode]!.arms]
        .filter(arm => arm.runtime !== undefined)
        .sort((left, right) => right.priority - left.priority)[0],
    }))
    const names = new Set<string>(runtimeArms.flatMap(entry => entry.arm?.runtime?.name ?? []))
    let attribute: import('../system/live').VanityRuntimeAxisContract['attribute']
    if (names.size === 1) {
      const name = [...names][0]!
      const values: Record<string, string | null> = {}
      for (const { mode, arm } of runtimeArms) {
        if (arm?.runtime?.name === name)
          values[mode] = arm.runtime.value
        else if (mode === definition.defaultMode && definition.modes[mode]!.arms.length === 0)
          values[mode] = null
      }
      if (Object.keys(values).length > 0)
        attribute = { name, values: Object.freeze(values) }
    }
    return [axis, Object.freeze({
      ...(definition.defaultMode === undefined ? {} : { defaultMode: definition.defaultMode }),
      modes: Object.freeze([...definition.modeOrder]),
      ...(attribute === undefined ? {} : { attribute: Object.freeze(attribute) }),
      ...(definition.control === undefined
        ? {}
        : {
            control: Object.freeze({
              id: definition.control.id,
              ...(definition.control.project === undefined
                ? {}
                : {
                    projections: Object.freeze(Object.fromEntries(definition.modeOrder.map((mode: string) => [
                      mode,
                      Object.freeze(definition.control!.project!(mode)),
                    ]))),
                  }),
            }),
          }),
    })]
  }))

  const tokens: VanityRuntimeTokenContract[] = []
  for (const node of graph.nodes.values()) {
    const result = graph.results.get(node.key)!
    const branches = node.branches.map((branch) => {
      const address: Exclude<VanitySemanticTokenAddress, { readonly kind: 'base' }> = branch.kind === 'axis'
        ? { kind: 'axis', axis: branch.axis, mode: branch.mode }
        : { kind: 'case', when: orderedWhen(branch.when, axisOrder) }
      return Object.freeze({
        address,
        ...(usesMutableSlots(node) ? { slot: slotOfBranch(graph.prefix, node, branch) } : {}),
        ...(branch.handle.$val === undefined ? {} : { value: branch.handle.$val }),
      })
    })
    const validation = runtimeValidationOf(node, graph)
    tokens.push(Object.freeze({
      token: Object.freeze(node.key.split('.')),
      name: node.name as `--${string}`,
      rootPath: rootPaths.get(node)!,
      root: node.root,
      ...(node.scopes === undefined ? {} : { scopes: node.scopes }),
      type: node.contract.type,
      reference: node.contract.reference,
      emit: node.contract.emit,
      mutable: node.contract.mutable,
      ...(node.definition.kind === 'none' ? {} : { value: result.emitted }),
      ...(node.meta.description === undefined ? {} : { description: node.meta.description }),
      ...(node.meta.deprecated === undefined ? {} : { deprecated: node.meta.deprecated }),
      ...(node.contract.metadata === undefined ? {} : { metadata: node.contract.metadata }),
      ...(validation === undefined ? {} : { validation }),
      ...(usesMutableSlots(node) ? { baseSlot: privateAddress(graph.prefix, node.key, 'base') } : {}),
      branches: Object.freeze(branches),
    }))
  }

  const rootMap = new Map<string, {
    selector: string
    scopes?: readonly string[]
    axes: Set<string>
  }>()
  rootMap.set('$system', { selector: graph.root, axes: new Set() })
  // A native element-local scheme remains operational even when every color
  // was authored directly with lightDark() rather than token axis branches.
  // Its explicit data-scheme arm still belongs to the system root.
  for (const axis of axisOrder) {
    if (graph.axes?.definitions[axis]?.native?.kind === 'scheme')
      rootMap.get('$system')!.axes.add(axis)
  }
  for (const token of tokens) {
    const node = graph.nodes.get(token.token.join('.'))!
    const selector = node.runtimeRoot ?? token.root
    const existing = rootMap.get(token.rootPath)
    if (existing && existing.selector !== selector) {
      throw new TypeError(
        `[vanity] runtime root path '${token.rootPath}' resolves to both '${existing.selector}' and '${selector}'`,
      )
    }
    const root = existing ?? {
      selector,
      ...(token.scopes === undefined ? {} : { scopes: token.scopes }),
      axes: new Set<string>(),
    }
    for (const branch of token.branches) {
      if (branch.address.kind === 'axis')
        root.axes.add(branch.address.axis)
      else
        Object.keys(branch.address.when).forEach(axis => root.axes.add(axis))
    }
    rootMap.set(token.rootPath, root)
  }
  const roots = [...rootMap.entries()]
    .sort(([left], [right]) => left === '$system' ? -1 : right === '$system' ? 1 : left.localeCompare(right))
    .map(([path, root]) => Object.freeze({
      path,
      selector: root.selector,
      ...(root.scopes === undefined ? {} : { scopes: root.scopes }),
      axes: Object.freeze(axisOrder.filter(axis => root.axes.has(axis))),
    }))

  return sealRuntimeContract({
    protocol: 2,
    prefix: graph.prefix,
    root: graph.root,
    axisOrder: Object.freeze(axisOrder),
    axes: Object.freeze(axes),
    roots: Object.freeze(roots),
    tokens: Object.freeze(tokens),
  })
}

function runtimeRootPaths(graph: TokenGraph): Map<TokenNode, string> {
  const paths = new Map<TokenNode, string>()
  const unnamed = new Map<string, TokenNode[]>()
  for (const node of graph.nodes.values()) {
    if (node.root === graph.root) {
      paths.set(node, '$system')
    }
    else if (node.modulePath && node.modulePath.length > 0) {
      paths.set(node, node.modulePath.join('.'))
    }
    else {
      const key = `${node.root}\0${node.runtimeRoot ?? ''}\0${JSON.stringify(node.scopes ?? [])}`
      const group = unnamed.get(key) ?? []
      group.push(node)
      unnamed.set(key, group)
    }
  }
  const used = new Set(paths.values())
  let anonymous = 0
  for (const nodes of unnamed.values()) {
    let path: string
    do path = `$root${anonymous++}`
    while (used.has(path))
    used.add(path)
    nodes.forEach(node => paths.set(node, path))
  }
  return paths
}

function collectRuntimeSchemas(graph: TokenGraph): Readonly<Record<string, import('./types').VanityStandardSchemaV1>> {
  const schemas: Record<string, import('./types').VanityStandardSchemaV1> = {}
  for (const node of graph.nodes.values()) {
    const validate = node.contract.validate as import('./types').VanityTokenValidation | undefined
    if (!validate?.schema)
      continue
    const existing = schemas[validate.id]
    if (existing && existing['~standard'].vendor !== validate.schema['~standard'].vendor)
      throw new TypeError(`[vanity] runtime validation id '${validate.id}' is claimed by multiple Standard Schema vendors`)
    schemas[validate.id] ??= validate.schema
  }
  return Object.freeze(schemas)
}

function runtimeValidationOf(
  node: TokenNode,
  graph: TokenGraph,
): import('../system/live').VanityRuntimeValidationContract | undefined {
  const validate = node.contract.validate as import('./types').VanityTokenValidation | undefined
  if (!validate)
    return undefined
  const fallback = validate.fallback === undefined
    ? undefined
    : serializeBranch(classifyLeafValue(validate.fallback, `${node.key}.validate.fallback`), graph)
  return Object.freeze({
    id: validate.id,
    runtime: validate.runtime ?? 'dev',
    onInvalid: validate.onInvalid ?? 'throw',
    ...(fallback === undefined ? {} : { fallback: String(fallback) }),
  })
}

function serializableRegistration(node: TokenNode, graph: TokenGraph): unknown {
  if (node.contract.register === true)
    return true
  const plan = planTokenEmission(node, graph).registration
  return plan === undefined
    ? undefined
    : Object.freeze({
        syntax: plan.syntax,
        inherits: plan.inherits,
        ...(plan.initialValue === undefined ? {} : { initialVal: plan.initialValue }),
      })
}

function attachRuntimeAddresses(graph: TokenGraph): void {
  const contract = graph.runtime!
  const tokensByPath = indexRuntimeTokens(contract)
  for (const node of graph.nodes.values()) {
    const token = tokensByPath.get(node.key)!
    if (!token.mutable || !token.baseSlot)
      continue
    setRuntimeAddress(node.handle, Object.freeze({
      system: contract.system,
      token: token.token,
      address: Object.freeze({ kind: 'base' as const }),
      slot: token.baseSlot,
    }))
    for (const branch of node.branches) {
      const address: Exclude<VanitySemanticTokenAddress, { readonly kind: 'base' }> = branch.kind === 'axis'
        ? { kind: 'axis', axis: branch.axis, mode: branch.mode }
        : { kind: 'case', when: orderedWhen(branch.when, contract.axisOrder) }
      const runtimeBranch = token.branches.find(candidate => sameSemanticAddress(candidate.address, address))!
      setRuntimeAddress(branch.handle, Object.freeze({
        system: contract.system,
        token: token.token,
        address,
        slot: runtimeBranch.slot!,
      }))
    }
  }
}

const runtimeTokenIndexes = new WeakMap<VanityRuntimeContract, ReadonlyMap<string, VanityRuntimeTokenContract>>()

function indexRuntimeTokens(
  contract: VanityRuntimeContract,
): ReadonlyMap<string, VanityRuntimeTokenContract> {
  let index = runtimeTokenIndexes.get(contract)
  if (index === undefined) {
    index = new Map(contract.tokens.map(token => [token.token.join('.'), token]))
    runtimeTokenIndexes.set(contract, index)
  }
  return index
}

function orderedWhen(
  when: Readonly<Record<string, string>>,
  axisOrder: readonly string[],
): Readonly<Record<string, string>> {
  const rank = new Map(axisOrder.map((axis, index) => [axis, index]))
  return Object.freeze(Object.fromEntries(Object.entries(when).sort(([left], [right]) =>
    (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER)
    || left.localeCompare(right))))
}

function sameSemanticAddress(left: VanitySemanticTokenAddress, right: VanitySemanticTokenAddress): boolean {
  if (left.kind !== right.kind)
    return false
  if (left.kind === 'base')
    return true
  if (left.kind === 'axis' && right.kind === 'axis')
    return left.axis === right.axis && left.mode === right.mode
  return left.kind === 'case' && right.kind === 'case'
    && JSON.stringify(left.when) === JSON.stringify(right.when)
}

/** Paths contributed by a module after this system finalized it. */
export function tokenModulePaths(value: unknown, owner?: object): readonly string[] | undefined {
  if (!isTokenBuilder(value))
    return undefined
  const ownerGraph = owner ? graphOf(owner) : undefined
  const paths: string[] = []
  for (const contribution of (value as RuntimeTokenBuilder).contributions) {
    if (ownerGraph?.contributions && !ownerGraph.contributions.has(contribution))
      return undefined
    const contributionPaths = CONTRIBUTION_PATHS.get(contribution)
    if (!contributionPaths)
      return undefined
    paths.push(...contributionPaths)
  }
  return Object.freeze([...new Set(paths)])
}

function walkInto(
  group: object,
  path: string[],
  prefix: string,
  nodes: Map<string, TokenNode>,
  tree: Record<string, unknown>,
  derived: boolean,
  emission: {
    readonly root: string
    readonly runtimeRoot?: string
    readonly scopes?: readonly string[]
    readonly layer?: string
  },
  tokenPolicy: VanityTokenPolicy | undefined,
  axes: VanityAxisRegistry<any> | undefined,
  added: string[],
  file?: string,
  moduleId?: symbol,
  modulePath?: readonly string[],
): void {
  const groupEmission = tokenPolicy === undefined
    ? emission
    : emissionForGroup(group, emission, path, file)

  for (const [key, raw] of Object.entries(group)) {
    if (tokenPolicy !== undefined && (key === '$description' || key === '$root'))
      continue
    if (tokenPolicy !== undefined && key === '$axes') {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        message: `${path.join('.') || 'the token root'}.$axes is not part of the canonical token language`,
        path: [...path, key].join('.'),
        file,
        fix: 'author axes on each token with de.token({ axes }); the transposed bulk form remains deliberately deferred',
      })
    }
    const leafPath = [...path, key]
    const keyPath = leafPath.join('.')

    if (isGroup(raw)) {
      const existing = tree[key]

      if (existing !== undefined && !isGroup(existing))
        duplicateToken(keyPath, file)

      const child = existing as Record<string, unknown> | undefined ?? {}
      tree[key] = child
      walkInto(
        raw,
        leafPath,
        prefix,
        nodes,
        child,
        derived,
        groupEmission,
        tokenPolicy,
        axes,
        added,
        file,
        moduleId,
        modulePath,
      )
      continue
    }

    if (key in tree)
      duplicateToken(keyPath, file)

    const node = createNode(leafPath, prefix, raw, derived, groupEmission, tokenPolicy, axes, moduleId, modulePath)
    nodes.set(node.key, node)
    tree[key] = node.handle
    added.push(node.key)
  }
}

function emissionForGroup(
  group: object,
  inherited: {
    readonly root: string
    readonly runtimeRoot?: string
    readonly scopes?: readonly string[]
    readonly layer?: string
  },
  path: readonly string[],
  file?: string,
): {
  readonly root: string
  readonly runtimeRoot?: string
  readonly scopes?: readonly string[]
  readonly layer?: string
} {
  const authored = (group as { readonly $root?: unknown }).$root
  if (authored === undefined)
    return inherited
  if (typeof authored !== 'string' || authored.trim().length === 0) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_INVALID_ROOT',
      message: `${path.join('.') || 'the token root'}.$root must be a non-empty selector`,
      path: [...path, '$root'].join('.'),
      file,
    })
  }

  const root = authored.includes('&')
    ? authored.replaceAll('&', `:is(${inherited.root})`)
    : authored
  const reason = checkSelector(root)
  if (reason) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_INVALID_ROOT',
      message: `${path.join('.') || 'the token root'}.$root does not parse: ${reason}`,
      path: [...path, '$root'].join('.'),
      file,
      fix: 'use an absolute selector, or anchor a relative selector with &',
    })
  }
  return {
    root,
    ...(root !== ':scope' || inherited.runtimeRoot === undefined
      ? {}
      : { runtimeRoot: inherited.runtimeRoot }),
    ...(inherited.scopes === undefined ? {} : { scopes: inherited.scopes }),
    ...(inherited.layer === undefined ? {} : { layer: inherited.layer }),
  }
}

function isGroup(value: unknown): value is object {
  return typeof value === 'object' && value !== null
    && !isColorValue(value) && !isContrastValue(value) && !isCssValue(value) && !isConfiguredToken(value)
}

/**
 * Runtime backstop for JavaScript and escaped TypeScript. The public builder
 * catches unknown names at the cursor; this proxy preserves the same exact
 * failure (with a fix) when the type system has been bypassed.
 */
function refsProxy(tree: Record<string, unknown>, path: string[], context: string, file?: string): Record<string, unknown> {
  return new Proxy(tree, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || prop in target) {
        const value = Reflect.get(target, prop, receiver)

        return typeof value === 'object' && value !== null && typeof prop === 'string'
          ? refsProxy(value as Record<string, unknown>, [...path, prop], context, file)
          : value
      }

      const refPath = [...path, prop].join('.')
      const suggestion = didYouMean(prop, Object.keys(target))

      throw new VanityError({
        code: 'VANITY_TOKENS_UNKNOWN_REF',
        message: `${refPath} is not a token in this graph${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
        detail: [`while deriving ${context}`],
        path: refPath,
        file,
        fix: suggestion ? `reference ${[...path, suggestion].join('.')}` : 'reference an existing token',
      })
    },
  })
}

function createNode(
  path: string[],
  prefix: string,
  raw: unknown,
  derived: boolean,
  emission: {
    readonly root: string
    readonly runtimeRoot?: string
    readonly scopes?: readonly string[]
    readonly layer?: string
  },
  tokenPolicy: VanityTokenPolicy | undefined,
  axes: VanityAxisRegistry<any> | undefined,
  moduleId?: symbol,
  modulePath?: readonly string[],
): TokenNode {
  const key = path.join('.')
  const normalized = normalizeToken(raw, key, tokenPolicy, axes)
  const name = tokenName(prefix, path)
  const handle = createHandle({
    name,
    path: key,
    mode: 'static',
    reference: normalized.contract.reference,
    emit: normalized.contract.emit,
    mutable: normalized.contract.mutable,
    type: normalized.contract.type,
    description: normalized.meta.description,
    deprecated: normalized.meta.deprecated,
    metadata: normalized.contract.metadata,
    register: normalized.contract.register,
    validate: normalized.contract.validate,
  })
  wireCaseBranches(handle)
  Object.assign(handle, handleColorMethods(handle))

  const node: TokenNode = {
    key,
    name,
    handle,
    derived,
    root: emission.root,
    ...(emission.runtimeRoot === undefined ? {} : { runtimeRoot: emission.runtimeRoot }),
    ...(emission.scopes === undefined ? {} : { scopes: emission.scopes }),
    ...(moduleId === undefined ? {} : { moduleId }),
    ...(modulePath === undefined ? {} : { modulePath }),
    ...(emission.layer === undefined ? {} : { layer: emission.layer }),
    definition: { kind: 'none' },
    meta: normalized.meta,
    contract: normalized.contract,
    branches: normalized.branches.map((branch) => {
      const branchHandle = createBranchHandle()
      if (branch.kind === 'axis')
        attachAxisBranch(handle, branch.axis, branch.mode, branchHandle)
      else
        attachCaseBranch(handle, branch.when, branchHandle)
      return { ...branch, handle: branchHandle }
    }),
  }

  Object.defineProperty(handle, NODE, { value: node })
  node.definition = derived && !isConfiguredToken(raw) && raw !== null
    ? classifyLeaf(normalized.rawVal, node)
    : normalized.definition

  if (node.definition.kind === 'literal')
    handle.$val = node.definition.value

  return node
}

interface NormalizedToken {
  readonly rawVal: unknown
  readonly definition: VanityLeafDefinition
  readonly contract: TokenContract
  readonly meta: { description?: string, deprecated?: string }
  readonly branches: readonly (
    | { readonly kind: 'axis', readonly axis: string, readonly mode: string, readonly definition: VanityLeafDefinition }
    | { readonly kind: 'case', readonly when: Readonly<Record<string, string>>, readonly definition: VanityLeafDefinition }
  )[]
}

function normalizeToken(
  raw: unknown,
  key: string,
  policy: VanityTokenPolicy | undefined,
  axes: VanityAxisRegistry<any> | undefined,
): NormalizedToken {
  if (policy === undefined) {
    return {
      rawVal: raw,
      definition: classifyLeafValue(raw, key),
      contract: {
        canonical: false,
        reference: 'var',
        emit: true,
        mutable: isColorValue(raw) && raw.markedLive,
        type: inferTokenType(raw),
        inference: {
          reference: 'engine-default',
          emit: 'engine-default',
          reasons: ['compatibility-policy'],
        },
      },
      meta: isColorValue(raw) || isContrastValue(raw) ? raw.meta : {},
      branches: [],
    }
  }

  if (raw === null) {
    return {
      rawVal: undefined,
      definition: { kind: 'none' },
      contract: {
        canonical: true,
        reference: 'var',
        emit: false,
        mutable: false,
        type: 'unknown',
        inference: {
          reference: 'capability',
          emit: 'capability',
          reasons: ['null-integration'],
        },
      },
      meta: {},
      branches: [],
    }
  }

  const configured = isConfiguredToken(raw)
  const config = configured ? raw.config : undefined
  const authoredVal = configured ? Object.hasOwn(config!, 'val') : true
  let hasVal = authoredVal
  let rawVal = configured ? config!.val : raw
  let inferredFromDefault = false

  if (configured && !hasVal && config!.axes !== undefined) {
    const axisEntries = Object.entries(config!.axes)
    const candidates = axisEntries.flatMap(([axis, modes]) => {
      const definition = requireAxis(axes, axis, key)
      const mode = definition.defaultMode
      return mode !== undefined && Object.hasOwn(modes, mode) && modes[mode] !== null
        ? [modes[mode]]
        : []
    })
    const comparable = candidates.length > 0
      && candidates.every(candidate => sameAuthoredValue(candidate, candidates[0]))
    if (candidates.length > 1 && !comparable) {
      invalidTrait(
        key,
        'val',
        'add an explicit val because this token has different default-mode candidates across axes',
      )
    }
    if (candidates.length > 0 && candidates.length === axisEntries.length && comparable) {
      hasVal = true
      rawVal = candidates[0]
      inferredFromDefault = true
    }
  }
  const conditional = configured && (config!.mutable === true || config!.axes !== undefined || config!.cases !== undefined)
  const reference = configured
    ? config!.reference ?? (conditional || !hasVal ? 'var' : policy.reference)
    : policy.reference
  const emit = configured
    ? config!.emit ?? (conditional ? true : hasVal ? policy.emit : false)
    : policy.emit
  const inference: TokenContract['inference'] = {
    reference: configured && config!.reference !== undefined
      ? 'explicit'
      : conditional || (configured && !hasVal) ? 'capability' : 'engine-default',
    emit: configured && config!.emit !== undefined
      ? 'explicit'
      : conditional || (configured && !hasVal) ? 'capability' : 'engine-default',
    reasons: [
      ...(conditional ? ['conditional-binding'] : []),
      ...(configured && !hasVal ? ['no-default-address'] : []),
      ...(inferredFromDefault ? ['axis-default-inference'] : []),
      ...(!conditional && (!configured || hasVal) ? ['engine-policy'] : []),
    ],
  }

  if (conditional && reference !== 'var')
    invalidTrait(key, 'reference', 'use reference: \'var\' because mutable/axes/cases need a public binding')
  if (conditional && emit !== true)
    invalidTrait(key, 'emit', 'use emit: true because mutable/axes/cases need a public binding')
  if (hasVal && reference === 'var' && emit === false)
    invalidTrait(key, 'emit', 'use reference: \'val\' for a known nonemitted value')

  const type = configured ? raw.type : inferTokenType(rawVal)
  const valueMeta = isColorValue(rawVal) || isContrastValue(rawVal) ? rawVal.meta : {}
  const description = config?.description ?? valueMeta.description
  const deprecated = config?.deprecated === undefined
    ? valueMeta.deprecated
    : typeof config.deprecated === 'string'
      ? config.deprecated
      : config.deprecated.reason ?? config.deprecated.use
  const meta = {
    ...(description === undefined ? {} : { description }),
    ...(deprecated === undefined ? {} : { deprecated }),
  }
  const branches: NormalizedToken['branches'][number][] = []
  const authoredAxes = new Map<string, Record<string, unknown | null>>()

  for (const [axis, modes] of Object.entries(config?.axes ?? {})) {
    const definition = requireAxis(axes, axis, key)
    const authored = { ...modes }
    for (const mode of Object.keys(authored)) {
      if (!(mode in definition.modes))
        invalidTrait(key, `axes.${axis}.${mode}`, `use one of the declared modes: ${definition.modeOrder.join(', ')}`)
    }

    if (hasVal && definition.defaultMode !== undefined && !(definition.defaultMode in authored))
      authored[definition.defaultMode] = rawVal

    authoredAxes.set(axis, authored)
  }

  const caseAxes = new Set<string>()
  const caseAddresses = new Set<string>()
  for (const entry of config?.cases ?? []) {
    const entries = Object.entries(entry.when)
    if (entries.length < 2)
      invalidTrait(key, 'cases.when', 'a sparse case intersects at least two declared axes; use an axis mode for one dimension')
    const normalizedWhen: Record<string, string> = {}
    for (const axis of axes?.order ?? []) {
      if (!(axis in entry.when))
        continue
      const mode = entry.when[axis]!
      const definition = requireAxis(axes, axis, key)
      if (!(mode in definition.modes))
        invalidTrait(key, `cases.when.${axis}`, `use one of the declared modes: ${definition.modeOrder.join(', ')}`)
      normalizedWhen[axis] = mode
      caseAxes.add(axis)
    }
    for (const axis of Object.keys(entry.when)) {
      if (!(axis in normalizedWhen))
        requireAxis(axes, axis, key)
    }
    const address = Object.entries(normalizedWhen).map(([axis, mode]) => `${axis}:${mode}`).join('|')
    if (caseAddresses.has(address))
      invalidTrait(key, 'cases', `remove the duplicate case ${address}`)
    caseAddresses.add(address)
  }

  const usedAxes = new Set([...authoredAxes.keys(), ...caseAxes])
  if (!hasVal && usedAxes.size > 1)
    invalidTrait(key, 'val', 'a token varying across multiple independent axes needs a base val before sparse overrides')

  if (!hasVal && authoredAxes.size === 1) {
    const [axis, authored] = [...authoredAxes][0]!
    const definition = requireAxis(axes, axis, key)
    const missing = definition.modeOrder.filter(mode => !(mode in authored))
    if (missing.length > 0) {
      invalidTrait(
        key,
        `axes.${axis}`,
        `author every mode when no base val exists; missing: ${missing.join(', ')}`,
      )
    }
  }

  for (const [axis, modes] of authoredAxes) {
    for (const [mode, val] of Object.entries(modes)) {
      if (val === null && config?.mutable !== true)
        invalidTrait(key, `axes.${axis}.${mode}`, 'null reserves a runtime address and therefore requires mutable: true')
      assertBranchType(type, val, key, `axes.${axis}.${mode}`)
      branches.push({
        kind: 'axis',
        axis,
        mode,
        definition: val === null ? { kind: 'none' } : classifyLeafValue(val, `${key}.$axes.${axis}.${mode}`),
      })
    }
  }

  for (const entry of config?.cases ?? []) {
    if (entry.val === null && config?.mutable !== true)
      invalidTrait(key, 'cases.val', 'null reserves a runtime address and therefore requires mutable: true')
    assertBranchType(type, entry.val, key, 'cases.val')
    const orderedWhen = Object.freeze(Object.fromEntries((axes?.order ?? Object.keys(entry.when))
      .filter(axis => axis in entry.when)
      .map(axis => [axis, entry.when[axis]!]),
    ))
    branches.push({
      kind: 'case',
      when: orderedWhen,
      definition: entry.val === null ? { kind: 'none' } : classifyLeafValue(entry.val, `${key}.$case`),
    })
  }

  return {
    rawVal,
    definition: hasVal ? classifyLeafValue(rawVal, key) : { kind: 'none' },
    contract: {
      canonical: true,
      reference,
      emit,
      mutable: config?.mutable === true,
      type,
      inference,
      ...(config?.register === undefined ? {} : { register: config.register }),
      ...(config?.validate === undefined ? {} : { validate: config.validate }),
      ...(config?.metadata === undefined ? {} : { metadata: config.metadata }),
    },
    meta,
    branches,
  }
}

function sameAuthoredValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right))
    return true
  if (isCssValue(left) && isCssValue(right))
    return left.css === right.css
  return false
}

function requireAxis(
  axes: VanityAxisRegistry<any> | undefined,
  axis: string,
  token: string,
): import('../system/axes').VanityAxisDefinition {
  const definition = axes?.definitions[axis]
  if (!definition)
    invalidTrait(token, `axes.${axis}`, 'declare this axis on the engine before defining tokens')
  return definition
}

function assertBranchType(
  expected: import('../values/types').VanityCssDataType,
  value: unknown,
  token: string,
  field: string,
): void {
  if (value === null || expected === 'unknown' || expected === 'declaration')
    return
  const actual = inferTokenType(value)
  if (actual !== 'unknown' && actual !== expected) {
    invalidTrait(
      token,
      field,
      `use a ${expected} value; this branch is ${actual}`,
    )
  }
}

function invalidTrait(path: string, field: string, fix: string): never {
  throw new VanityError({
    code: 'VANITY_TOKENS_INVALID_COLOR',
    message: `${path}.${field} conflicts with this token's independent traits`,
    path: `${path}.${field}`,
    fix,
  })
}

function inferTokenType(raw: unknown): import('../values/types').VanityCssDataType {
  if (isColorValue(raw) || isContrastValue(raw))
    return 'color'
  if ((typeof raw === 'object' || typeof raw === 'function') && raw !== null && 'type' in raw && typeof raw.type === 'string')
    return raw.type as import('../values/types').VanityCssDataType
  if (typeof raw === 'number')
    return Number.isInteger(raw) ? 'integer' : 'number'
  return 'unknown'
}

function duplicateToken(path: string, file?: string): never {
  throw new VanityError({
    code: 'VANITY_TOKENS_DUPLICATE',
    message: `${path} is already defined by an earlier token stage`,
    path,
    file,
    fix: 'give the new token a distinct name',
  })
}

function classifyLeafValue(raw: unknown, key: string): VanityLeafDefinition {
  if (raw === null)
    return { kind: 'none' }

  if (typeof raw === 'function' && nodeOf(raw as VanityRuntimeHandle))
    return { kind: 'color', expr: { kind: 'ref', handle: raw as VanityRuntimeHandle }, markedLive: false }

  if (isContrastValue(raw))
    return { kind: 'contrast', expr: raw.expr }

  if (isColorValue(raw))
    return { kind: 'color', expr: raw.expr, markedLive: raw.markedLive }

  if (typeof raw === 'string' || typeof raw === 'number')
    return { kind: 'literal', value: raw }

  if (isCssValue(raw))
    return { kind: 'value', value: raw }

  throw new VanityError({
    code: 'VANITY_TOKENS_INVALID_COLOR',
    message: `${key} is not a token value — expected a string, number, color, or derivation`,
    path: key,
  })
}

/** Classify what a derivation returned; a returned handle is an alias — a plain graph edge. */
function classifyLeaf(result: unknown, node: TokenNode): VanityLeafDefinition {
  if (typeof result === 'function' && nodeOf(result as VanityRuntimeHandle))
    return { kind: 'color', expr: { kind: 'ref', handle: result as VanityRuntimeHandle }, markedLive: false }

  if (isColorValue(result) || isContrastValue(result))
    node.meta = { ...result.meta, ...node.meta }

  return classifyLeafValue(result, node.key)
}

// ─── Resolution ──────────────────────────────────────────────────────────────

export type VanityOverride = VanityLeafDefinition

export function resolveGraph(
  graph: TokenGraph,
  overrides?: Map<string, VanityOverride>,
  context?: string,
): { results: Map<string, NodeResult>, diagnostics: VanityDiagnostic[] } {
  const results = new Map<string, NodeResult>()
  const stack: string[] = []
  const diagnostics: VanityDiagnostic[] = []
  let authoredValues: ReturnType<typeof createAuthoredValueFolder>

  const resolver: VanityResolver = {
    foldRef: (handle, scheme) => foldNode(requireNode(handle), scheme),
    foldValue: (value, scheme) => authoredValues.foldValue(value, scheme),
    serializeValue: value => authoredValues.serializeValue(value),
    refTraits: (handle) => {
      const referenced = requireNode(handle)
      const traits = resolve(referenced).traits
      return {
        cssLive: traits.cssLive || (referenced.contract.canonical && referenced.contract.reference === 'var'),
        volatile: traits.volatile || (referenced.contract.canonical && referenced.contract.mutable),
        conditional: traits.conditional,
      }
    },
    serializeRef: (handle) => {
      const referenced = requireNode(handle)
      return referenced.contract.reference === 'var'
        ? referenced.handle.var
        : resolve(referenced).emitted
    },
    invalidColor: (detail) => {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        message: `${stack[stack.length - 1] ?? 'a token'} cannot resolve: ${detail}`,
        path: stack[stack.length - 1],
        file: graph.file,
        fix: 'give it a color value, or reference a color token',
      })
    },
  }

  function requireNode(handle: VanityRuntimeHandle): TokenNode {
    const node = nodeOf(handle)

    if (node && graph.nodes.get(node.key) === node)
      return node

    const moduleRef = (handle as unknown as {
      readonly [VANITY_MODULE_TOKEN_REF]?: {
        readonly module: symbol
        readonly path: readonly string[]
      }
    })[VANITY_MODULE_TOKEN_REF]
    const owner = graph.nodes.get(stack[stack.length - 1] ?? '')
    if (moduleRef !== undefined && owner?.moduleId === moduleRef.module) {
      const rebound = graph.nodes.get([
        ...(owner.modulePath ?? []),
        ...moduleRef.path,
      ].join('.'))
      if (rebound)
        return rebound
    }

    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_OVERRIDE',
      message: moduleRef === undefined
        ? 'a referenced token does not belong to this graph'
        : 'a module-relative token reference was used outside its owning mounted module',
      file: graph.file,
      fix: moduleRef === undefined
        ? undefined
        : 'use the mounted open-system handle for cross-module references',
    })
  }

  function definitionOf(node: TokenNode): VanityLeafDefinition {
    return overrides?.get(node.key) ?? node.definition
  }

  function guardCycles<R>(node: TokenNode, compute: () => R): R {
    if (stack.includes(node.key)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_CYCLE',
        message: `token derivation cycle: ${[...stack.slice(stack.indexOf(node.key)), node.key].join(' → ')}`,
        path: node.key,
        file: graph.file,
        fix: 'break the loop — one of these derivations must resolve to a value',
      })
    }

    stack.push(node.key)

    try {
      return compute()
    }
    finally {
      stack.pop()
    }
  }

  authoredValues = createAuthoredValueFolder(
    graph,
    () => resolver,
    definitionOf,
    guardCycles,
  )

  function foldNode(node: TokenNode, scheme: VanityScheme): VanityOklch {
    const css = authoredValues.foldDefault(node, scheme)
    const parsed = parseColor(css)

    if (!parsed)
      return resolver.invalidColor(`${node.key} holds '${css}', which is not a color`)

    return parsed
  }

  function resolve(node: TokenNode): NodeResult {
    const memoized = results.get(node.key)

    if (memoized)
      return memoized

    const result = guardCycles(node, () => computeResult(node))
    results.set(node.key, result)
    return result
  }

  function computeResult(node: TokenNode): NodeResult {
    const definition = definitionOf(node)
    // A theme override changes a token's value, never its liveness: a live
    // token stays a runtime input, so its live derivations stay live.
    const originallyLive = node.definition.kind === 'color' && node.definition.markedLive

    if (definition.kind === 'none') {
      return {
        traits: { cssLive: false, volatile: node.contract.mutable, conditional: false },
        mode: node.contract.mutable ? 'live' : 'static',
        emitted: '',
      }
    }

    if (definition.kind === 'literal') {
      return {
        traits: { cssLive: false, volatile: originallyLive, conditional: false },
        mode: node.derived ? 'derived' : 'static',
        emitted: String(definition.value),
      }
    }

    if (definition.kind === 'value') {
      const valueNode = valueNodeOf(definition.value)
      const reactive = valueNode.dependencies.length > 0
      return {
        traits: { cssLive: reactive, volatile: reactive, conditional: false },
        mode: node.derived || reactive ? 'derived' : 'static',
        emitted: cssOf(graph, definition.value),
      }
    }

    if (definition.kind === 'contrast')
      return contrastResult(node, definition.expr)

    const { expr } = definition
    const markedLive = definition.markedLive || originallyLive
    const inner = exprTraits(expr, resolver)
    const traits = { ...inner, volatile: inner.volatile || markedLive }

    const mode: VanityTokenMode = markedLive
      ? 'live'
      : node.derived
        ? 'derived'
        : traits.conditional ? 'scheme' : traits.volatile ? 'derived' : 'static'

    if (node.contract.canonical && graph.support) {
      const missing = [...colorRequirements(expr)].filter(feature => !graph.support!.features.has(feature))
      if (missing.length > 0) {
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_COLOR',
          message: `${node.key} requires ${missing.join(', ')}, outside CSS support target "${graph.support.id}"`,
          path: node.key,
          file: graph.file,
          fix: 'author the referenced inputs with reference: \'val\', or choose a support target with a proven equivalent',
        })
      }
    }

    // A pure alias keeps the graph edge visible: always the `var()` reference.
    if (expr.kind === 'ref')
      return { traits, mode: 'derived', emitted: resolver.serializeRef?.(expr.handle) ?? expr.handle.var }

    const emitted = inner.cssLive || inner.volatile
      ? serializeExpr(expr, resolver)
      : formatOklch(foldExpr(expr, 'light', resolver))

    return { traits, mode, emitted }
  }

  function contrastResult(node: TokenNode, expr: Extract<VanityColorExpr, { kind: 'contrast' }>): NodeResult {
    const traits = exprTraits(expr.target, resolver)
    const emitted = serializeContrastPick(expr, resolver)

    if (traits.volatile) {
      // The guarantee cannot be total over a live target, so keep the checked
      // authored-default pick. Chromium's experimental `contrast-color()`
      // implementation has made that result follow `color-scheme` even when
      // the target itself is scheme-invariant; that breaks an opaque
      // background/foreground pairing. Revisit a native upgrade once that
      // implementation is interoperable with the CSS Color 5 contract.
      return { traits, mode: 'derived', emitted }
    }

    const schemes: VanityScheme[] = traits.cssLive ? ['light', 'dark'] : ['light']

    for (const scheme of schemes) {
      const target = foldExpr(expr.target, scheme, resolver)
      const pick = pickLegible(target)

      if (Math.abs(pick.lc) < expr.contrast) {
        const where = traits.cssLive ? ` in scheme "${scheme}"` : ''
        diagnostics.push({
          code: 'VANITY_TOKENS_CONTRAST',
          message: `${node.key} / ${describeTarget(expr.target)} fails APCA Lc ${expr.contrast}${where}${context ? ` (${context})` : ''}`,
          detail: [`target (${scheme}) → ${formatOklch(target)}; best pairing ${pick.keyword} = Lc ${Math.abs(pick.lc).toFixed(1)}`],
          path: node.key,
          file: graph.file,
          fix: expr.explicitContrast
            ? 'adjust the target color — even the accepted threshold fails'
            : `adjust the target color, or accept explicitly: legibleOn(…, { contrast: ${Math.floor(Math.abs(pick.lc))} })`,
        })
      }
    }

    return { traits, mode: 'derived', emitted }
  }

  for (const node of graph.nodes.values())
    resolve(node)

  return { results, diagnostics }
}

/**
 * Build-plane representative projection shared by derivation fallback,
 * authored checks, and introspection. Live emission remains untouched: only
 * this folder replaces token var nodes with defaults owned by the graph.
 */
function createAuthoredValueFolder(
  graph: TokenGraph,
  resolver: () => VanityResolver,
  definitionOf: (node: TokenNode) => VanityLeafDefinition,
  guard: <Result>(node: TokenNode, compute: () => Result) => Result = (_node, compute) => compute(),
) {
  function serializeValue(value: import('../values/types').VanitySelfValue): string {
    const context = createSerializeContext(
      graph.support ?? VANITY_DEFAULT_CSS_SUPPORT,
      (reference) => {
        if (reference.kind === 'token' && reference.path !== undefined) {
          const referenced = graph.nodes.get(reference.path)
          if (!referenced)
            return resolver().invalidColor(`${reference.path} does not belong to this token graph`)
          return referenced.name
        }
        if (reference.name !== undefined)
          return reference.name
        return resolver().invalidColor('a reference has no final custom-property name')
      },
      undefined,
      graph.policies,
    )
    return context.serialize(value)
  }

  function foldValue(value: VanityCssValue, scheme: VanityScheme): string {
    const context = createSerializeContext(
      graph.support ?? VANITY_DEFAULT_CSS_SUPPORT,
      reference => reference.name ?? resolver().invalidColor('a reference has no custom-property name'),
      (reference) => {
        if (reference.kind !== 'token' || reference.path === undefined) {
          return resolver().invalidColor(
            `${reference.name ?? 'a custom property'} has no authored default value in this token graph`,
          )
        }

        const referenced = graph.nodes.get(reference.path)
        if (!referenced)
          return resolver().invalidColor(`${reference.path} does not belong to this token graph`)

        return foldDefault(referenced, scheme)
      },
      graph.policies,
    )

    return foldNumericCalculations(context.serialize(value))
  }

  function foldDefault(node: TokenNode, scheme: VanityScheme): string {
    return guard(node, () => {
      const definition = definitionOf(node)

      if (definition.kind === 'none')
        return resolver().invalidColor(`${node.key} has no authored default value`)
      if (definition.kind === 'literal')
        return String(definition.value)
      if (definition.kind === 'value')
        return foldValue(definition.value, scheme)

      return formatOklch(foldExpr(definition.expr, scheme, resolver()))
    })
  }

  return { foldDefault, foldValue, serializeValue }
}

/**
 * CSS parsers intentionally preserve `calc()`, but a build-plane color
 * representative needs numeric authored defaults. Reduce only the closed,
 * unitless arithmetic grammar; anything with a unit, function, or unresolved
 * reference remains untouched and is diagnosed by the owning color fold.
 */
function foldNumericCalculations(css: string): string {
  let folded = css

  while (true) {
    const start = folded.lastIndexOf('calc(')
    if (start < 0)
      return folded

    let depth = 1
    let end = start + 5
    for (; end < folded.length && depth > 0; end++) {
      if (folded[end] === '(')
        depth++
      else if (folded[end] === ')')
        depth--
    }

    if (depth !== 0)
      return folded

    const expression = folded.slice(start + 5, end - 1)
    const value = evaluateNumericExpression(expression)
    if (value === undefined)
      return folded

    folded = `${folded.slice(0, start)}${formatNumber(value)}${folded.slice(end)}`
  }
}

function evaluateNumericExpression(expression: string): number | undefined {
  let cursor = 0
  const whitespace = () => {
    while (/\s/.test(expression[cursor] ?? ''))
      cursor++
  }
  const consume = (character: string): boolean => {
    whitespace()
    if (expression[cursor] !== character)
      return false
    cursor++
    return true
  }
  function primary(): number | undefined {
    whitespace()
    if (consume('+'))
      return primary()
    if (consume('-')) {
      const value = primary()
      return value === undefined ? undefined : -value
    }
    if (consume('(')) {
      const value = sum()
      return value === undefined || !consume(')') ? undefined : value
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(expression.slice(cursor))
    if (!match)
      return undefined
    cursor += match[0].length
    return Number(match[0])
  }
  function product(): number | undefined {
    let value = primary()
    if (value === undefined)
      return undefined
    while (true) {
      if (consume('*')) {
        const right = primary()
        if (right === undefined)
          return undefined
        value *= right
      }
      else if (consume('/')) {
        const right = primary()
        if (right === undefined || right === 0)
          return undefined
        value /= right
      }
      else {
        return value
      }
    }
  }
  function sum(): number | undefined {
    let value = product()
    if (value === undefined)
      return undefined
    while (true) {
      if (consume('+')) {
        const right = product()
        if (right === undefined)
          return undefined
        value += right
      }
      else if (consume('-')) {
        const right = product()
        if (right === undefined)
          return undefined
        value -= right
      }
      else {
        return value
      }
    }
  }

  const value = sum()
  whitespace()
  return value !== undefined && cursor === expression.length && Number.isFinite(value)
    ? value
    : undefined
}

function describeTarget(target: VanityColorExpr): string {
  return target.kind === 'ref' ? nodeOf(target.handle)?.key ?? 'its target' : 'its target'
}

// ─── Checks ──────────────────────────────────────────────────────────────────

function runChecks(checks: readonly unknown[], graph: TokenGraph): VanityDiagnostic[] {
  const diagnostics: VanityDiagnostic[] = []

  for (const entry of checks) {
    if (!(entry instanceof TextContrastCheck))
      continue

    const text = toExpr(entry.text)
    const background = toExpr(entry.background)

    for (const scheme of ['light', 'dark'] as const) {
      const resolver = checkResolver(graph, scheme)
      const textColor = foldExpr(text, scheme, resolver)
      const backgroundColor = foldExpr(background, scheme, resolver)
      const { algorithm, min } = entry.level
      const measured = algorithm === 'apca'
        ? Math.abs(apcaContrast(textColor, backgroundColor))
        : wcagContrast(textColor, backgroundColor)

      record({
        kind: 'contrast',
        file: graph.file,
        pairing: `${describeTarget(text)} on ${describeTarget(background)}`,
        scheme,
        algorithm,
        measured: Math.round(measured * 10) / 10,
        min,
        accepted: false,
      })

      if (measured < min) {
        diagnostics.push({
          code: 'VANITY_TOKENS_CONTRAST',
          message: `${describeTarget(text)} / ${describeTarget(background)} fails ${algorithm === 'apca' ? `APCA Lc ${min}` : `WCAG 2 ${min}:1`} in scheme "${scheme}"`,
          detail: [`text (${scheme}) → ${formatOklch(textColor)} on ${formatOklch(backgroundColor)} = ${algorithm === 'apca' ? `Lc ${measured.toFixed(1)}` : `${measured.toFixed(2)}:1`}`],
          file: graph.file,
          fix: 'adjust one endpoint of the pairing, or relax the check level deliberately',
        })
      }
    }
  }

  return diagnostics
}

/** Checks run after the graph resolved cleanly, so folding here needs no cycle guard. */
function checkResolver(graph: TokenGraph, scheme: VanityScheme): VanityResolver {
  let resolver: VanityResolver
  const authoredValues = createAuthoredValueFolder(graph, () => resolver, node => node.definition)

  resolver = {
    foldRef: (handle) => {
      const node = nodeOf(handle)
      if (!node)
        return resolver.invalidColor('a referenced token does not belong to this graph')
      const css = authoredValues.foldDefault(node, scheme)
      const parsed = parseColor(css)
      if (!parsed)
        return resolver.invalidColor(`${node.key} holds '${css}', which is not a color`)
      return parsed
    },
    foldValue: value => authoredValues.foldValue(value, scheme),
    serializeValue: value => authoredValues.serializeValue(value),
    refTraits: (handle) => {
      const result = graph.results.get(nodeOf(handle)!.key)
      return result?.traits ?? { cssLive: false, volatile: false, conditional: false }
    },
    invalidColor: (detail) => {
      throw new VanityError({ code: 'VANITY_TOKENS_INVALID_COLOR', message: `a check cannot resolve: ${detail}`, file: graph.file })
    },
  }

  return resolver
}

// ─── Introspection ───────────────────────────────────────────────────────────

/**
 * Record the resolved graph for the manifest ([spec-introspection.md §2]):
 * every token with its per-scheme built values and graph edges, plus the
 * contrast results `legibleOn` pairings measured — passes and consciously-
 * accepted thresholds included. Runs only under an open collector.
 */
function recordGraph(graph: TokenGraph): void {
  const resolvers = { light: checkResolver(graph, 'light'), dark: checkResolver(graph, 'dark') } as const
  const runtimeTokensByPath = graph.runtime === undefined ? undefined : indexRuntimeTokens(graph.runtime)

  const schemeValue = (node: TokenNode, scheme: VanityScheme): string => {
    const definition = node.definition

    if (definition.kind === 'literal')
      return String(definition.value)

    if (definition.kind === 'value')
      return cssOf(graph, definition.value)

    if (definition.kind === 'none')
      return ''

    if (definition.kind === 'contrast')
      return pickLegible(foldExpr(definition.expr.target, scheme, resolvers[scheme])).keyword

    return formatOklch(foldExpr(definition.expr, scheme, resolvers[scheme]))
  }

  const previewOf = (node: TokenNode): import('../internal/inspect').VanityTokenPreviewRecord => {
    const definition = node.definition
    if (definition.kind === 'none')
      return { status: 'unavailable', reason: 'no authored default value' }
    if (definition.kind === 'literal') {
      const value = String(definition.value)
      return { status: 'available', light: value, dark: value }
    }
    if (definition.kind === 'value') {
      const valueNode = valueNodeOf(definition.value)
      if (valueNode.dependencies.length > 0)
        return { status: 'unavailable', reason: 'runtime dependency' }
      if (valueNode.kind !== 'literal')
        return { status: 'unavailable', reason: 'no proven fold evaluator for this expression' }
      const value = cssOf(graph, definition.value)
      return { status: 'available', light: value, dark: value }
    }

    try {
      return {
        status: 'available',
        light: schemeValue(node, 'light'),
        dark: schemeValue(node, 'dark'),
      }
    }
    catch (error) {
      return {
        status: 'unavailable',
        reason: error instanceof Error ? error.message : 'color expression cannot be previewed',
      }
    }
  }

  for (const node of graph.nodes.values()) {
    const result = graph.results.get(node.key)!
    const refs = new Set<string>()

    if (node.definition.kind === 'value') {
      for (const reference of valueNodeOf(node.definition.value).dependencies) {
        if (reference.path)
          refs.add(reference.path)
      }
    }
    else if (node.definition.kind !== 'literal' && node.definition.kind !== 'none') {
      collectRefs(node.definition.expr, refs)
    }

    for (const branch of node.branches) {
      if (branch.definition.kind === 'value') {
        for (const reference of valueNodeOf(branch.definition.value).dependencies) {
          if (reference.path)
            refs.add(reference.path)
        }
      }
      else if (branch.definition.kind !== 'literal' && branch.definition.kind !== 'none') {
        collectRefs(branch.definition.expr, refs)
      }
    }

    const requirements = new Set(node.definition.kind === 'value'
      ? [...collectNodeRequirements(valueNodeOf(node.definition.value))]
      : node.definition.kind === 'literal' || node.definition.kind === 'none' ? [] : [...colorRequirements(node.definition.expr)])
    for (const branch of node.branches) {
      if (branch.definition.kind === 'value')
        collectNodeRequirements(valueNodeOf(branch.definition.value)).forEach(requirement => requirements.add(requirement))
      else if (branch.definition.kind !== 'literal' && branch.definition.kind !== 'none')
        colorRequirements(branch.definition.expr).forEach(requirement => requirements.add(requirement))
    }
    const preview = previewOf(node)
    const plan = planTokenEmission(node, graph)
    const runtimeToken = runtimeTokensByPath?.get(node.key)
    const emission: import('../internal/inspect').VanityTokenEmissionRecord[] = []
    if (Object.keys(plan.baseVars).length > 0) {
      emission.push({
        kind: 'base',
        root: node.root,
        ...(node.scopes === undefined ? {} : { scopes: node.scopes }),
        ...(phaseLayer(graph, node, 'base') === undefined ? {} : { layer: phaseLayer(graph, node, 'base') }),
      })
    }
    if (plan.native !== undefined) {
      emission.push({
        kind: 'native',
        root: node.root,
        ...(node.scopes === undefined ? {} : { scopes: node.scopes }),
        layer: phaseLayer(graph, node, 'base'),
        axis: plan.native.axis,
        locality: plan.native.locality,
        mechanism: 'native',
      })
    }
    emission.push(...plan.axisDeclarations.map(entry => ({
      kind: 'axis' as const,
      root: entry.root,
      layer: phaseLayer(graph, node, 'axis', entry.axis),
      axis: entry.axis,
      mode: entry.mode,
      mechanism: entry.mechanism,
      locality: entry.locality,
      placement: entry.placement,
      priority: entry.priority,
      ...(entry.media === undefined ? {} : { media: entry.media }),
      ...(entry.supports === undefined ? {} : { supports: entry.supports }),
      ...(entry.container === undefined ? {} : { container: entry.container }),
      ...(entry.scopes === undefined ? {} : { scopes: entry.scopes }),
    })))
    emission.push(...plan.caseDeclarations.map(entry => ({
      kind: 'case' as const,
      root: entry.root,
      layer: phaseLayer(graph, node, 'case'),
      when: entry.when,
      priority: entry.priority,
      ...(entry.media === undefined ? {} : { media: entry.media }),
      ...(entry.supports === undefined ? {} : { supports: entry.supports }),
      ...(entry.container === undefined ? {} : { container: entry.container }),
      ...(entry.scopes === undefined ? {} : { scopes: entry.scopes }),
    })))

    const declarations: import('../internal/inspect').VanityTokenDeclarationRecord[] = []
    for (const [name, val] of Object.entries(plan.baseVars)) {
      declarations.push({
        kind: name === node.name ? 'base' : 'slot',
        ...(name === node.name ? {} : { name: name as `--${string}` }),
        val,
        context: {
          root: node.root,
          selectors: [],
          atRules: [...(node.scopes ?? []).map(scope => `@scope ${scope}`)],
          ...(phaseLayer(graph, node, 'base') === undefined ? {} : { layer: phaseLayer(graph, node, 'base') }),
        },
      })
    }
    for (const entry of plan.axisDeclarations) {
      declarations.push({
        kind: 'axis',
        ...(entry.name === node.name ? {} : { name: entry.name as `--${string}` }),
        val: entry.value || null,
        axis: entry.axis,
        mode: entry.mode,
        context: declarationContext(node.root, entry.root, phaseLayer(graph, node, 'axis', entry.axis), entry),
      })
    }
    for (const entry of plan.caseDeclarations) {
      declarations.push({
        kind: 'case',
        ...(entry.name === node.name ? {} : { name: entry.name as `--${string}` }),
        val: entry.value || null,
        when: entry.when,
        context: declarationContext(node.root, entry.root, phaseLayer(graph, node, 'case'), entry),
      })
    }
    if (plan.upgrade !== undefined) {
      declarations.push({
        kind: 'override',
        val: plan.upgrade,
        context: {
          root: node.root,
          selectors: [],
          atRules: [
            ...(node.scopes ?? []).map(scope => `@scope ${scope}`),
            `@supports ${CONTRAST_COLOR_SUPPORT}`,
          ],
          ...(phaseLayer(graph, node, 'base') === undefined ? {} : { layer: phaseLayer(graph, node, 'base') }),
        },
      })
    }

    const dependencies = dependencyRecords(node, graph, refs)
    const expression = expressionRecord(node.definition, result, graph)
    const portability = portabilityOf(node, graph)
    const fold = foldRecord(node, result, preview)
    const supportPath = valueSupportPath(node.definition, graph, result)

    record({
      kind: 'token',
      file: graph.file,
      ...diagnosticSource(node.key),
      path: node.key,
      var: node.name,
      root: node.root,
      ...(node.scopes === undefined ? {} : { scopes: node.scopes }),
      ...(node.modulePath === undefined ? {} : { module: node.modulePath }),
      ...(node.layer === undefined ? {} : { layer: node.layer }),
      mode: result.mode,
      light: preview.status === 'available' ? preview.light : result.emitted,
      dark: preview.status === 'available' ? preview.dark : result.emitted,
      css: result.emitted,
      requirements: [...requirements],
      preview,
      ...(result.supportsUpgrade === undefined ? {} : { upgrade: result.supportsUpgrade }),
      refs: [...refs],
      ...(emission.length === 0 ? {} : { emission }),
      ...(runtimeToken?.mutable !== true || runtimeToken.baseSlot === undefined
        ? {}
        : {
            runtime: {
              type: runtimeToken.type,
              ...(runtimeToken.validation === undefined ? {} : { validation: runtimeToken.validation }),
              addresses: [
                ...(runtimeToken.baseSlot === undefined ? [] : [{ address: { kind: 'base' as const }, slot: runtimeToken.baseSlot }]),
                ...runtimeToken.branches.flatMap(branch => branch.slot === undefined ? [] : [{ address: branch.address, slot: branch.slot }]),
              ],
            },
          }),
      semantic: {
        type: node.contract.type,
        reference: node.contract.reference,
        emit: node.contract.emit,
        mutable: node.contract.mutable,
        hasDefault: node.definition.kind !== 'none',
        expression,
        inference: node.contract.inference,
        fold,
        dependencies,
        support: {
          ...(graph.support === undefined ? {} : { target: graph.support.id }),
          requirements: [...requirements],
          ...supportPath,
          ...(result.supportsUpgrade === undefined ? {} : { enhancement: result.supportsUpgrade }),
        },
        declarations,
        branches: node.branches.map((branch) => {
          const val = serializeBranch(branch.definition, graph) ?? null
          return {
            address: branch.kind === 'axis'
              ? { kind: 'axis' as const, axis: branch.axis, mode: branch.mode }
              : { kind: 'case' as const, when: branch.when },
            val,
            ...(opaqueProfileOf(branch.definition)?.encodable !== true
              ? {}
              : { expression: expressionRecord(branch.definition, { ...result, emitted: String(val ?? '') }, graph) }),
          }
        }),
        ...(plan.registration === undefined
          ? {}
          : {
              registration: {
                syntax: plan.registration.syntax,
                inherits: plan.registration.inherits,
                ...(plan.registration.initialValue === undefined ? {} : { initialVal: plan.registration.initialValue }),
              },
            }),
        portability,
        metadata: node.contract.metadata ?? {},
      },
      ...(node.meta.description === undefined ? {} : { description: node.meta.description }),
      ...(node.meta.deprecated === undefined ? {} : { deprecated: node.meta.deprecated }),
    })

    if (node.definition.kind === 'contrast') {
      const { expr } = node.definition

      for (const scheme of ['light', 'dark'] as const) {
        const pick = pickLegible(foldExpr(expr.target, scheme, resolvers[scheme]))

        record({
          kind: 'contrast',
          file: graph.file,
          ...diagnosticSource(node.key),
          pairing: node.key,
          scheme,
          algorithm: 'apca',
          measured: Math.round(Math.abs(pick.lc) * 10) / 10,
          min: expr.contrast,
          accepted: expr.explicitContrast,
        })
      }
    }
  }
}

function declarationContext(
  root: string,
  selector: string,
  layer: string | undefined,
  entry: {
    readonly media?: string
    readonly supports?: string
    readonly container?: string
    readonly scopes?: readonly string[]
  },
): import('../internal/inspect').VanityTokenDeclarationRecord['context'] {
  return {
    root,
    selectors: selector === root ? [] : [selector],
    atRules: [
      ...(entry.scopes ?? []).map(scope => `@scope ${scope}`),
      ...(entry.media === undefined ? [] : [`@media ${entry.media}`]),
      ...(entry.supports === undefined ? [] : [`@supports ${entry.supports}`]),
      ...(entry.container === undefined ? [] : [`@container ${entry.container}`]),
    ],
    ...(layer === undefined ? {} : { layer }),
  }
}

function dependencyRecords(
  node: TokenNode,
  graph: TokenGraph,
  refs: ReadonlySet<string>,
): import('../internal/inspect').VanityTokenDependencyRecord[] {
  const records: import('../internal/inspect').VanityTokenDependencyRecord[] = []
  const values = [node.definition, ...node.branches.map(branch => branch.definition)]
    .filter((definition): definition is Extract<VanityLeafDefinition, { kind: 'value' }> => definition.kind === 'value')
  for (const definition of values) {
    records.push(...valueNodeOf(definition.value).dependencies.map(reference => ({
      kind: reference.kind,
      ...(reference.path === undefined ? {} : { path: reference.path }),
      ...(reference.name === undefined ? {} : { name: reference.name }),
      type: reference.type,
      resolution: reference.resolution,
      ...(reference.extension === undefined ? {} : { extension: reference.extension }),
    })).filter(candidate => !records.some(existing => existing.kind === candidate.kind
      && existing.path === candidate.path && existing.name === candidate.name)))
  }

  for (const path of refs) {
    if (records.some(record => record.path === path))
      continue
    const dependency = graph.nodes.get(path)
    records.push({
      kind: 'token' as const,
      path,
      ...(dependency === undefined ? {} : { name: dependency.name as `--${string}` }),
      type: dependency?.contract.type ?? 'unknown',
      resolution: 'system' as const,
    })
  }
  return records
}

function expressionRecord(
  definition: VanityLeafDefinition,
  result: NodeResult,
  graph: TokenGraph,
): import('../internal/inspect').VanityTokenExpressionRecord {
  if (definition.kind === 'none')
    return { kind: 'none', type: 'unknown' }
  if (definition.kind === 'literal') {
    return {
      kind: 'literal',
      type: typeof definition.value === 'number' ? (Number.isInteger(definition.value) ? 'integer' : 'number') : 'unknown',
      detail: { val: definition.value },
    }
  }
  if (definition.kind === 'value')
    return expressionNodeRecord(valueNodeOf(definition.value), result.emitted)
  return colorExpressionRecord(definition.expr, result.emitted, graph)
}

function expressionNodeRecord(
  node: VanityExpressionNode,
  css?: string,
): import('../internal/inspect').VanityTokenExpressionRecord {
  const children = nodeChildren(node).map(child => expressionNodeRecord(child))
  const detail: Record<string, string | number | boolean | null> = {}
  switch (node.kind) {
    case 'literal':
      detail.val = node.value
      break
    case 'function':
      detail.name = node.name
      detail.separator = node.separator
      break
    case 'operation':
      detail.operator = node.operator
      detail.parenthesize = node.parenthesize
      break
    case 'var':
      detail.referenceKind = node.reference.kind
      if (node.reference.path)
        detail.path = node.reference.path
      if (node.reference.name)
        detail.name = node.reference.name
      break
    case 'raw':
      detail.syntax = node.syntax
      break
    case 'plugin':
      break
    case 'composite':
      detail.parts = node.parts.length
      break
  }
  return {
    kind: node.kind,
    type: node.type,
    ...(css === undefined || (node.kind !== 'plugin' && node.kind !== 'raw') ? {} : { css }),
    ...(node.source === undefined ? {} : { source: node.source }),
    ...(node.extension === undefined ? {} : { extension: node.extension }),
    ...(Object.keys(detail).length === 0 ? {} : { detail }),
    ...(children.length === 0 ? {} : { children }),
  }
}

function nodeChildren(node: VanityExpressionNode): readonly VanityExpressionNode[] {
  switch (node.kind) {
    case 'function':
    case 'plugin': return [...node.values, ...(node.fallback === undefined ? [] : [node.fallback])]
    case 'operation': return [node.left, node.right]
    case 'var': return node.valueFallback === undefined ? [] : [node.valueFallback]
    case 'composite': return node.parts.filter((part): part is VanityExpressionNode => typeof part !== 'string')
    case 'literal':
    case 'raw': return node.fallback === undefined ? [] : [node.fallback]
  }
}

function colorExpressionRecord(
  expr: VanityColorExpr,
  css: string | undefined,
  graph: TokenGraph,
): import('../internal/inspect').VanityTokenExpressionRecord {
  const children: import('../internal/inspect').VanityTokenExpressionRecord[] = []
  const detail: Record<string, string | number | boolean | null> = { operation: expr.kind }
  switch (expr.kind) {
    case 'oklch':
      detail.l = expr.l
      detail.c = expr.c
      detail.h = expr.h
      if (expr.alpha !== undefined)
        detail.alpha = expr.alpha
      break
    case 'parse':
      detail.authored = expr.css
      break
    case 'value':
      return expressionNodeRecord(valueNodeOf(expr.value), css)
    case 'ref':
      detail.path = nodeOf(expr.handle)?.key ?? expr.handle.path
      break
    case 'alpha':
      detail.amount = expr.amount
      children.push(colorExpressionRecord(expr.input, undefined, graph))
      break
    case 'adjust':
      detail.channel = expr.channel
      detail.delta = expr.delta
      children.push(colorExpressionRecord(expr.input, undefined, graph))
      break
    case 'channels':
      detail.channels = Object.keys(expr.channels).join(',')
      children.push(colorExpressionRecord(expr.input, undefined, graph))
      break
    case 'relative':
      detail.function = expr.function
      detail.channels = expr.channelNames.join(',')
      if (expr.space !== undefined)
        detail.space = expr.space
      children.push(colorExpressionRecord(expr.input, undefined, graph))
      break
    case 'mix':
      detail.amount = expr.amount
      detail.space = expr.space
      if (expr.hue !== undefined)
        detail.hue = expr.hue
      children.push(colorExpressionRecord(expr.input, undefined, graph), colorExpressionRecord(expr.other, undefined, graph))
      break
    case 'scheme':
      children.push(colorExpressionRecord(expr.light, undefined, graph), colorExpressionRecord(expr.dark, undefined, graph))
      break
    case 'contrast':
      detail.contrast = expr.contrast
      detail.explicitContrast = expr.explicitContrast
      children.push(colorExpressionRecord(expr.target, undefined, graph))
      return { kind: 'contrast', type: 'color', detail, children }
  }
  return {
    kind: 'color',
    type: 'color',
    detail,
    ...(children.length === 0 ? {} : { children }),
  }
}

function foldRecord(
  node: TokenNode,
  result: NodeResult,
  preview: import('../internal/inspect').VanityTokenPreviewRecord,
): import('../internal/inspect').VanityTokenSemanticRecord['fold'] {
  if (node.definition.kind === 'none')
    return { status: 'unavailable', reason: 'no authored default value' }
  if (node.definition.kind === 'literal')
    return { status: 'folded', val: node.definition.value }
  if (node.definition.kind === 'value') {
    const expression = valueNodeOf(node.definition.value)
    if (expression.kind === 'literal')
      return { status: 'folded', val: expression.value }
    return {
      status: 'preserved',
      reason: expression.dependencies.length > 0 ? 'runtime dependency' : `native ${expression.kind} expression retained`,
    }
  }
  if (node.definition.expr.kind === 'ref')
    return { status: 'preserved', reason: 'token aliases remain visible as graph edges' }
  if (result.traits.cssLive || result.traits.volatile || result.traits.conditional)
    return { status: 'preserved', reason: 'browser-reactive color semantics' }
  if (preview.status === 'available')
    return { status: 'folded', val: preview.light }
  return { status: 'unavailable', reason: preview.reason }
}

function portabilityOf(
  token: TokenNode,
  graph: TokenGraph,
): import('../internal/inspect').VanityTokenSemanticRecord['portability'] {
  const profiles = [token.definition, ...token.branches.map(branch => branch.definition)]
    .flatMap((definition) => {
      const profile = opaqueProfileOf(definition)
      return profile === undefined ? [] : [profile]
    })
  const nested = profiles.find(profile => !profile.encodable)
  if (nested) {
    return {
      status: 'nonportable',
      extension: nested.extensions[0],
      reason: `opaque extension '${nested.extensions[0]!.id}' is nested in a core/mixed expression; authored codecs currently encode complete plugin-owned values`,
    }
  }
  const opaque = [...new Map(profiles.flatMap(profile => profile.extensions)
    .map(extension => [`${extension.id}@${extension.version}`, extension] as const)).values()]
  if (opaque.length === 0)
    return { status: 'portable' }
  const missing = opaque.find(extension => !graph.dtcgCodecIds?.has(extension.id))
  if (!missing) {
    return {
      status: 'codec',
      ...(opaque.length === 1 ? { extension: opaque[0] } : { reason: `uses codecs for ${opaque.map(extension => `'${extension.id}'`).join(', ')}` }),
    }
  }
  return {
    status: 'nonportable',
    extension: missing,
    reason: `extension '${missing.id}' has opaque serializer semantics and no authored-interchange codec`,
  }
}

function opaqueProfileOf(
  definition: VanityLeafDefinition,
): { readonly extensions: readonly import('../values/protocol').VanityExtensionIdentity[], readonly encodable: boolean } | undefined {
  if (definition.kind !== 'value')
    return undefined
  const node = valueNodeOf(definition.value)
  const extensions = findOpaquePlugins(node)
  if (extensions.length === 0)
    return undefined
  const owner = node.kind === 'plugin' ? node.extension : undefined
  return {
    extensions,
    encodable: owner !== undefined && extensions.every(extension => extension.id === owner.id),
  }
}

function valueSupportPath(
  definition: VanityLeafDefinition,
  graph: TokenGraph,
  result: NodeResult,
): Pick<import('../internal/inspect').VanityTokenSemanticRecord['support'], 'fallback' | 'enhancement'> {
  if (definition.kind !== 'value')
    return {}
  const node = valueNodeOf(definition.value)
  if (node.fallback === undefined || graph.support === undefined
    || node.requirements.every(requirement => graph.support!.features.has(requirement))) {
    return {}
  }
  const features = new Set([...graph.support.features, ...collectNodeRequirements(node)])
  const context = createSerializeContext(
    { id: `${graph.support.id}+manifest-enhancement`, features },
    reference => reference.name ?? (reference.path === undefined ? '' : graph.nodes.get(reference.path)?.name ?? ''),
  )
  try {
    return { fallback: result.emitted, enhancement: serializeNode(node, context) }
  }
  catch {
    return { fallback: result.emitted }
  }
}

function findOpaquePlugins(
  node: VanityExpressionNode,
): import('../values/protocol').VanityExtensionIdentity[] {
  const found: import('../values/protocol').VanityExtensionIdentity[] = node.kind === 'plugin' && node.extension !== undefined
    ? [node.extension]
    : []
  for (const child of nodeChildren(node)) {
    found.push(...findOpaquePlugins(child))
  }
  return found
}

// ─── Emission ────────────────────────────────────────────────────────────────

function emitGraph(graph: TokenGraph): void {
  if (graph.nodes.size === 0)
    return

  interface EmissionGroup {
    readonly root: string
    readonly layer?: string
    readonly media?: string
    readonly supports?: string
    readonly container?: string
    readonly scopes?: readonly string[]
    readonly vars: Record<string, string>
    readonly upgrades: Record<string, string>
    hasSchemePairs: boolean
  }

  const baseGroups = new Map<string, EmissionGroup>()
  const conditionalGroups = new Map<string, EmissionGroup>()
  let hasSchemePairs = false

  // The former nested contract emitter kept a reopened top-level group in its
  // original position. Preserve that public declaration order while grouping
  // by root/layer for modular emission.
  const topOrder = new Map<string, number>()
  for (const node of graph.nodes.values()) {
    const top = node.key.split('.')[0]!
    if (!topOrder.has(top))
      topOrder.set(top, topOrder.size)
  }
  const orderedNodes = [...graph.nodes.values()].map((node, index) => ({ node, index })).sort((a, b) => {
    const group = topOrder.get(a.node.key.split('.')[0]!)! - topOrder.get(b.node.key.split('.')[0]!)!
    return group === 0 ? a.index - b.index : group
  })

  const plans = orderedNodes.map(({ node }) => planTokenEmission(node, graph))

  for (const plan of plans) {
    const { node } = plan
    if (plan.registration)
      createGlobalVar(node.name, plan.registration as Parameters<typeof createGlobalVar>[1])

    if (node.layer !== undefined && graph.phaseLayers && node.layer !== graph.phaseLayers.root)
      globalLayer(node.layer)

    if (Object.keys(plan.baseVars).length > 0) {
      const layer = phaseLayer(graph, node, 'base')
      const group = emissionGroup(baseGroups, {
        root: node.root,
        layer,
        ...(node.scopes === undefined ? {} : { scopes: node.scopes }),
      })
      Object.assign(group.vars, plan.baseVars)
      if (plan.upgrade !== undefined)
        group.upgrades[node.name] = plan.upgrade
      if (Object.values(plan.baseVars).some(value => value.includes('light-dark('))) {
        hasSchemePairs = true
        group.hasSchemePairs = true
      }
    }
  }

  for (const axis of graph.axes?.order ?? []) {
    const entries = plans.flatMap(plan => plan.axisDeclarations.filter(entry => entry.axis === axis))
      .sort((a, b) => a.priority - b.priority || a.modeOrder - b.modeOrder || a.tokenOrder - b.tokenOrder)
    for (const entry of entries) {
      const layer = phaseLayer(graph, entry.node, 'axis', axis)
      const group = emissionGroup(conditionalGroups, {
        root: entry.root,
        layer,
        ...(entry.media === undefined ? {} : { media: entry.media }),
        ...(entry.supports === undefined ? {} : { supports: entry.supports }),
        ...(entry.container === undefined ? {} : { container: entry.container }),
        ...(entry.scopes === undefined ? {} : { scopes: entry.scopes }),
      })
      group.vars[entry.name] = entry.value
    }
  }

  const cases = plans.flatMap(plan => plan.caseDeclarations)
    .sort((a, b) => a.priority - b.priority || a.tokenOrder - b.tokenOrder)
  for (const entry of cases) {
    const layer = phaseLayer(graph, entry.node, 'case')
    const group = emissionGroup(conditionalGroups, {
      root: entry.root,
      layer,
      ...(entry.media === undefined ? {} : { media: entry.media }),
      ...(entry.supports === undefined ? {} : { supports: entry.supports }),
      ...(entry.container === undefined ? {} : { container: entry.container }),
      ...(entry.scopes === undefined ? {} : { scopes: entry.scopes }),
    })
    group.vars[entry.name] = entry.value
  }

  const schemeRoots = new Set<string>()
  for (const group of [...baseGroups.values(), ...conditionalGroups.values()]) {
    if (group.hasSchemePairs && !schemeRoots.has(group.root)) {
      schemeRoots.add(group.root)
      globalStyle(group.root, { colorScheme: 'light dark' })
    }

    emitGroup(group)
  }

  if (hasSchemePairs) {
    // Match the system root's specificity so an explicit application choice
    // can override the root's `light dark` preference. A loose attribute rule
    // loses to roots such as `#app`, leaving `light-dark()` stuck in its
    // preference-driven state even while `data-scheme="light"` is present.
    for (const root of schemeRoots) {
      globalStyle(`:is(${root})[data-scheme='light']`, { colorScheme: 'light' })
      globalStyle(`:is(${root})[data-scheme='dark']`, { colorScheme: 'dark' })
    }
  }

  function emitGroup(group: EmissionGroup): void {
    let rule: Record<string, unknown> = { vars: group.vars }
    if (Object.keys(group.upgrades).length > 0) {
      rule = {
        ...rule,
        '@supports': {
          [CONTRAST_COLOR_SUPPORT]: { vars: group.upgrades },
        },
      }
    }
    if (group.container !== undefined)
      rule = { '@container': { [group.container]: rule } }
    if (group.supports !== undefined)
      rule = { '@supports': { [group.supports]: rule } }
    if (group.media !== undefined)
      rule = { '@media': { [group.media]: rule } }
    for (const scope of [...group.scopes ?? []].reverse())
      rule = { '@scope': { [scope]: rule } }
    if (group.layer !== undefined)
      rule = { '@layer': { [group.layer]: rule } }

    globalStyle(group.root, rule)
  }
}

interface PlannedConditionalDeclaration {
  readonly node: TokenNode
  readonly axis: string
  readonly mode?: string
  readonly when?: Readonly<Record<string, string>>
  readonly mechanism?: VanityAxisTriggerArm['mechanism']
  readonly locality?: VanityAxisTriggerArm['locality']
  readonly placement?: VanityAxisTriggerArm['placement']
  readonly name: string
  readonly value: string
  readonly root: string
  readonly media?: string
  readonly supports?: string
  readonly container?: string
  readonly scopes?: readonly string[]
  readonly priority: number
  readonly modeOrder: number
  readonly tokenOrder: number
}

interface PlannedTokenEmission {
  readonly node: TokenNode
  readonly baseVars: Readonly<Record<string, string>>
  readonly axisDeclarations: readonly PlannedConditionalDeclaration[]
  readonly caseDeclarations: readonly PlannedConditionalDeclaration[]
  readonly registration?: {
    readonly syntax: '*' | string
    readonly inherits: boolean
    readonly initialValue?: string
  }
  readonly native?: {
    readonly axis: string
    readonly locality: 'element' | 'root'
  }
  readonly upgrade?: string
}

function planTokenEmission(node: TokenNode, graph: TokenGraph): PlannedTokenEmission {
  const result = graph.results.get(node.key)!
  const baseVars: Record<string, string> = {}
  const axisDeclarations: PlannedConditionalDeclaration[] = []
  const caseDeclarations: PlannedConditionalDeclaration[] = []
  const axes = graph.axes
  const branchAxes = new Map<string, Map<string, TokenBranch & { kind: 'axis' }>>()
  const cases: (TokenBranch & { kind: 'case' })[] = []
  for (const branch of node.branches) {
    if (branch.kind === 'axis') {
      branchAxes.set(branch.axis, branchAxes.get(branch.axis) ?? new Map())
      branchAxes.get(branch.axis)!.set(branch.mode, branch)
    }
    else {
      cases.push(branch)
    }
  }

  const usedAxisOrder = axes?.order.filter(axis => branchAxes.has(axis) || cases.some(branch => axis in branch.when)) ?? []
  const native = nativeSchemePlan(node, graph, branchAxes, usedAxisOrder)
  // Ordinary token branches compose most faithfully by declaring the public
  // property in ordered layers: descendant and absolute triggers then compute
  // where their selector matches. Private stages are only needed for mutable
  // multi-axis fallback chains, whose bindings are constrained to the token's
  // effective root so var() substitution cannot freeze a downstream trigger.
  const needsStages = usesMutableSlots(node) && usedAxisOrder.length > 1
  let priorExpression: string | undefined

  if (usesMutableSlots(node)) {
    const baseSlot = privateAddress(graph.prefix, node.key, 'base')
    if (node.definition.kind !== 'none')
      baseVars[baseSlot] = result.emitted
    priorExpression = `var(${baseSlot})`
    for (const branch of node.branches) {
      if (branch.definition.kind === 'none')
        continue
      baseVars[slotOfBranch(graph.prefix, node, branch)] = serializeBranch(branch.definition, graph)!.toString()
    }
  }
  else if (node.definition.kind !== 'none') {
    priorExpression = result.emitted
  }

  if (priorExpression === undefined && usedAxisOrder.length === 1) {
    const axis = usedAxisOrder[0]!
    const definition = axes?.definitions[axis]
    const defaultBranch = definition?.defaultMode === undefined
      ? undefined
      : branchAxes.get(axis)?.get(definition.defaultMode)
    if (defaultBranch) {
      priorExpression = branchExpression(node, defaultBranch, graph, undefined)
    }
  }

  for (const axis of usedAxisOrder) {
    const definition = axes!.definitions[axis]!
    const stageName = needsStages ? privateAddress(graph.prefix, node.key, `stage:${axis}`) : node.name
    const nativeForAxis = native?.axis === axis ? native : undefined
    const incoming = priorExpression

    if (nativeForAxis) {
      const light = nativeSourceExpression(node, nativeForAxis.light, graph, incoming)
      const dark = nativeSourceExpression(node, nativeForAxis.dark, graph, incoming)
      const nativeExpression = `light-dark(${light}, ${dark})`
      if (needsStages) {
        baseVars[stageName] = nativeExpression
        priorExpression = `var(${stageName})`
      }
      else {
        priorExpression = nativeExpression
      }
    }
    else if (needsStages && incoming !== undefined) {
      baseVars[stageName] = incoming
      priorExpression = `var(${stageName})`
    }

    const branches = branchAxes.get(axis)
    if (!branches && !nativeForAxis)
      continue
    for (const mode of definition.modeOrder) {
      const branch = branches?.get(mode)
      const nativeSource = nativeForAxis === undefined
        ? undefined
        : mode === definition.native?.light
          ? nativeForAxis.light
          : mode === definition.native?.dark
            ? nativeForAxis.dark
            : undefined
      if (!branch && !nativeSource)
        continue
      const trigger = definition.modes[mode]!
      const isTriggerlessDefault = definition.defaultMode === mode && trigger.arms.length === 0
      if (isTriggerlessDefault)
        continue
      const value = branch
        ? branchExpression(node, branch, graph, incoming)
        : nativeSourceExpression(node, nativeSource!, graph, incoming)
      for (const arm of trigger.arms) {
        if (nativeForAxis && arm.mechanism !== 'selector')
          continue
        assertMutablePlacement(node, arm)
        const resolved = resolveArm(node.root, arm, graph.root)
        axisDeclarations.push({
          node,
          axis,
          mode,
          mechanism: arm.mechanism,
          locality: arm.locality,
          placement: arm.placement,
          name: stageName,
          value,
          root: resolved.selector,
          ...(resolved.media === undefined ? {} : { media: resolved.media }),
          ...(resolved.supports === undefined ? {} : { supports: resolved.supports }),
          ...(resolved.container === undefined ? {} : { container: resolved.container }),
          ...((node.scopes?.length ?? 0) + (resolved.scopes?.length ?? 0) === 0
            ? {}
            : { scopes: [...node.scopes ?? [], ...resolved.scopes ?? []] }),
          priority: arm.priority,
          modeOrder: definition.modeOrder.indexOf(mode),
          tokenOrder: [...graph.nodes.keys()].indexOf(node.key),
        })
      }
    }
  }

  if (node.contract.emit && priorExpression !== undefined)
    baseVars[node.name] = priorExpression

  for (const branch of cases) {
    const arms = caseArms(node, branch, graph)
    const fallback = priorExpression
    const value = branchExpression(node, branch, graph, fallback)
    for (const arm of arms) {
      caseDeclarations.push({
        node,
        axis: '$case',
        when: branch.when,
        name: node.name,
        value,
        root: arm.selector,
        ...(arm.media === undefined ? {} : { media: arm.media }),
        ...(arm.supports === undefined ? {} : { supports: arm.supports }),
        ...(arm.container === undefined ? {} : { container: arm.container }),
        ...(arm.scopes === undefined ? {} : { scopes: arm.scopes }),
        priority: arm.priority,
        modeOrder: 0,
        tokenOrder: [...graph.nodes.keys()].indexOf(node.key),
      })
    }
  }

  const registration = registrationOf(node, graph, result.emitted, native)
  return {
    node,
    baseVars,
    axisDeclarations,
    caseDeclarations,
    ...(registration === undefined ? {} : { registration }),
    ...(native === undefined ? {} : { native: { axis: native.axis, locality: native.definition.native!.locality } }),
    ...(result.supportsUpgrade === undefined ? {} : { upgrade: result.supportsUpgrade }),
  }
}

function nativeSchemePlan(
  node: TokenNode,
  graph: TokenGraph,
  branches: ReadonlyMap<string, ReadonlyMap<string, TokenBranch & { kind: 'axis' }>>,
  usedAxisOrder: readonly string[],
): {
  readonly axis: string
  readonly definition: VanityAxisDefinition
  readonly light: NativeSchemeSource
  readonly dark: NativeSchemeSource
} | undefined {
  for (const axis of usedAxisOrder) {
    const definition = graph.axes!.definitions[axis]!
    const native = definition.native
    if (native?.kind !== 'scheme')
      continue
    // CSS light-dark() is a <color> function. Other data types use the same
    // scheme vocabulary through its selector/media trigger arms.
    if (node.contract.type !== 'color')
      continue
    if (axis !== usedAxisOrder[0])
      continue
    const light = branches.get(axis)?.get(native.light)
      ?? (definition.defaultMode === native.light && node.definition.kind !== 'none'
        ? { kind: 'base' as const, definition: node.definition }
        : undefined)
    const dark = branches.get(axis)?.get(native.dark)
      ?? (definition.defaultMode === native.dark && node.definition.kind !== 'none'
        ? { kind: 'base' as const, definition: node.definition }
        : undefined)
    if (!light || !dark)
      continue
    if (node.branches.some(branch => branch.kind === 'case' && axis in branch.when)
      && native.locality === 'element') {
      invalidTrait(
        node.key,
        'cases',
        'an element-local native scheme cannot expose its used mode to a cross-axis selector; choose scheme({ locality: \'root\' })',
      )
    }
    if (!graph.support?.features.has('light-dark')) {
      if (native.locality === 'element' && native.fallback === 'diagnose') {
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_COLOR',
          message: `${node.key} requests element-local scheme selection, but support target '${graph.support?.id ?? 'unknown'}' lacks light-dark()`,
          path: `${node.key}.axes.${axis}`,
          fix: 'use a support target with light-dark(), choose root locality, or acknowledge fallback: \'document\'',
        })
      }
      return undefined
    }
    return { axis, definition, light, dark }
  }
  return undefined
}

type NativeSchemeSource = (TokenBranch & { kind: 'axis' }) | {
  readonly kind: 'base'
  readonly definition: VanityLeafDefinition
}

function nativeSourceExpression(
  node: TokenNode,
  source: NativeSchemeSource,
  graph: TokenGraph,
  fallback: string | undefined,
): string {
  if (source.kind !== 'base')
    return branchExpression(node, source, graph, fallback)
  if (usesMutableSlots(node)) {
    const slot = privateAddress(graph.prefix, node.key, 'base')
    return `var(${slot})`
  }
  return graph.results.get(node.key)!.emitted
}

function branchExpression(
  node: TokenNode,
  branch: TokenBranch,
  graph: TokenGraph,
  fallback: string | undefined,
): string {
  if (usesMutableSlots(node)) {
    const slot = slotOfBranch(graph.prefix, node, branch)
    return fallback === undefined ? `var(${slot})` : `var(${slot}, ${fallback})`
  }
  const value = serializeBranch(branch.definition, graph)
  if (value === undefined) {
    if (fallback === undefined)
      return ''
    return fallback
  }
  return String(value)
}

function registrationOf(
  node: TokenNode,
  graph: TokenGraph,
  emittedBase: string,
  native: ReturnType<typeof nativeSchemePlan>,
): PlannedTokenEmission['registration'] | undefined {
  const authored = node.contract.register
  if (authored === undefined || authored === false)
    return undefined
  const config = authored === true ? {} : authored as import('./types').VanityTokenRegistration
  const syntax = config.syntax ?? propertySyntax(node.contract.type)
  const inherits = config.inherits ?? true

  if (native?.definition.native?.locality === 'element' && syntax !== '*') {
    invalidTrait(
      node.key,
      'register.syntax',
      'use syntax: \'*\' to preserve element-local light-dark() token streams, or choose scheme({ locality: \'root\' })',
    )
  }

  let initialValue: string | undefined
  if (config.initialVal !== undefined) {
    assertBranchType(node.contract.type, config.initialVal, node.key, 'register.initialVal')
    initialValue = serializeRegistrationValue(config.initialVal, graph, node.key)
  }
  else if (syntax !== '*' && node.definition.kind !== 'none' && isComputationallyIndependent(emittedBase)) {
    initialValue = emittedBase
  }

  if (syntax !== '*' && initialValue === undefined) {
    invalidTrait(
      node.key,
      'register.initialVal',
      `typed @property syntax '${syntax}' requires a computationally independent initialVal`,
    )
  }
  if (initialValue !== undefined && !isComputationallyIndependent(initialValue)) {
    invalidTrait(
      node.key,
      'register.initialVal',
      'use a computationally independent initial value without var(), environment dependencies, or relative units',
    )
  }

  return { syntax, inherits, ...(initialValue === undefined ? {} : { initialValue }) }
}

function propertySyntax(type: import('../values/types').VanityCssDataType): string {
  const syntax: Partial<Record<import('../values/types').VanityCssDataType, string>> = {
    'color': '<color>',
    'length': '<length>',
    'length-percentage': '<length-percentage>',
    'percentage': '<percentage>',
    'number': '<number>',
    'integer': '<integer>',
    'angle': '<angle>',
    'time': '<time>',
    'frequency': '<frequency>',
    'resolution': '<resolution>',
    'flex': '<flex>',
    'custom-ident': '<custom-ident>',
  }
  return syntax[type] ?? '*'
}

function serializeRegistrationValue(value: unknown, graph: TokenGraph, key: string): string {
  return String(serializeBranch(classifyLeafValue(value, `${key}.register.initialVal`), graph))
}

function isComputationallyIndependent(value: string): boolean {
  return !/\b(?:var|env)\(/.test(value)
    && !/(?:^|[^-\w.])-?(?:\d+(?:\.\d+)?|\.\d+)(?:em|rem|ex|cap|ch|ic|lh|rlh|vw|vh|vi|vb|vmin|vmax|cqw|cqh|cqi|cqb|cqmin|cqmax)\b/i.test(value)
    && !/\bcurrentColor\b/i.test(value)
}

function slotOfBranch(prefix: string, node: TokenNode, branch: TokenBranch): string {
  return branch.kind === 'axis'
    ? privateAddress(prefix, node.key, `axis:${branch.axis}:${branch.mode}`)
    : privateAddress(prefix, node.key, `case:${Object.entries(branch.when).map(([axis, mode]) => `${axis}:${mode}`).join('|')}`)
}

function usesMutableSlots(node: TokenNode): boolean {
  return node.contract.canonical && node.contract.mutable
}

function privateAddress(prefix: string, token: string, address: string): string {
  let hash = 2166136261
  for (const char of `${token}\0${address}`) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `--${prefix}-v-${(hash >>> 0).toString(36)}`
}

function phaseLayer(
  graph: TokenGraph,
  node: TokenNode,
  kind: 'base' | 'axis' | 'case',
  axis?: string,
): string | undefined {
  if (!graph.phaseLayers)
    return node.layer
  const phase = kind === 'base'
    ? graph.phaseLayers.base
    : kind === 'case'
      ? graph.phaseLayers.cases
      : graph.phaseLayers.axes[axis!]!
  const suffix = node.layer?.startsWith(`${graph.phaseLayers.root}.`)
    ? node.layer.slice(graph.phaseLayers.root.length + 1)
    : undefined
  return suffix ? `${phase}.${suffix}` : phase
}

function emissionGroup(
  groups: Map<string, {
    readonly root: string
    readonly layer?: string
    readonly media?: string
    readonly supports?: string
    readonly container?: string
    readonly scopes?: readonly string[]
    readonly vars: Record<string, string>
    readonly upgrades: Record<string, string>
    hasSchemePairs: boolean
  }>,
  context: {
    readonly root: string
    readonly layer?: string
    readonly media?: string
    readonly supports?: string
    readonly container?: string
    readonly scopes?: readonly string[]
  },
) {
  const key = JSON.stringify([
    context.root,
    context.layer,
    context.media,
    context.supports,
    context.container,
    context.scopes,
  ])
  let group = groups.get(key)
  if (!group) {
    group = { ...context, vars: {}, upgrades: {}, hasSchemePairs: false }
    groups.set(key, group)
  }
  return group
}

function resolveArm(root: string, arm: VanityAxisTriggerArm, systemRoot = root): {
  readonly selector: string
  readonly media?: string
  readonly supports?: string
  readonly container?: string
  readonly scopes?: readonly string[]
} {
  const anchor = arm.anchor === 'system-root' ? systemRoot : root
  const selector = arm.placement === 'absolute'
    ? arm.selector!
    : arm.selector === undefined ? anchor : arm.selector.replaceAll('&', `:is(${anchor})`)
  return {
    selector,
    ...(arm.media === undefined ? {} : { media: arm.media }),
    ...(arm.supports === undefined ? {} : { supports: arm.supports }),
    ...(arm.container === undefined ? {} : { container: arm.container }),
    ...(arm.scopes === undefined ? {} : { scopes: arm.scopes }),
  }
}

function assertMutablePlacement(node: TokenNode, arm: VanityAxisTriggerArm): void {
  if (!node.contract.mutable)
    return
  if (arm.placement === 'descendant' || arm.placement === 'absolute') {
    invalidTrait(
      node.key,
      'axes',
      `mutable bindings must compute on their effective root; '${arm.placement}' placement would move slot substitution elsewhere`,
    )
  }
}

function caseArms(
  node: TokenNode,
  branch: TokenBranch & { kind: 'case' },
  graph: TokenGraph,
): readonly {
  readonly selector: string
  readonly media?: string
  readonly supports?: string
  readonly container?: string
  readonly scopes?: readonly string[]
  readonly priority: number
}[] {
  let combinations: readonly {
    readonly selectors: readonly string[]
    readonly media?: string
    readonly supports?: string
    readonly container?: string
    readonly scopes?: readonly string[]
    readonly priority: number
  }[] = [{
    selectors: [],
    ...(node.scopes === undefined ? {} : { scopes: node.scopes }),
    priority: 0,
  }]

  for (const [axis, mode] of Object.entries(branch.when)) {
    const definition = graph.axes?.definitions[axis]
    const trigger = definition?.modes[mode]
    if (!definition || !trigger)
      invalidTrait(node.key, `cases.when.${axis}`, 'reference a declared axis mode')
    if (trigger.arms.length === 0) {
      invalidTrait(
        node.key,
        `cases.when.${axis}`,
        `mode '${mode}' has no trigger, so its intersection cannot be selected; give defaultMode() an explicit condition`,
      )
    }
    combinations = combinations.flatMap(existing => trigger.arms.map((arm: VanityAxisTriggerArm) => {
      assertMutablePlacement(node, arm)
      const resolved = resolveArm(node.root, arm, graph.root)
      return {
        selectors: [...existing.selectors, resolved.selector],
        media: combineQuery(existing.media, resolved.media),
        supports: combineQuery(existing.supports, resolved.supports),
        container: combineQuery(existing.container, resolved.container),
        scopes: [...existing.scopes ?? [], ...resolved.scopes ?? []],
        priority: existing.priority + arm.priority,
      }
    }))
  }

  return combinations.map(combination => ({
    selector: combination.selectors.length === 1
      ? combination.selectors[0]!
      : combination.selectors.map(selector => `:is(${selector})`).join(''),
    ...(combination.media === undefined ? {} : { media: combination.media }),
    ...(combination.supports === undefined ? {} : { supports: combination.supports }),
    ...(combination.container === undefined ? {} : { container: combination.container }),
    ...(combination.scopes === undefined ? {} : { scopes: combination.scopes }),
    priority: combination.priority,
  }))
}

function combineQuery(left: string | undefined, right: string | undefined): string | undefined {
  if (left === undefined)
    return right
  if (right === undefined)
    return left
  return `${left} and ${right}`
}
