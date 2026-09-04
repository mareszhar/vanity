/**
 * `defineTokens` — the token module in plain TS ([spec-tokens.md §1 and §5]).
 *
 * The walk builds a handle for every leaf, derivations then run once against
 * the finished handle tree (so references are ordinary property accesses), and
 * one resolution pass classifies liveness, folds or serializes every value,
 * runs the checks, and emits a single `:root` declaration through the
 * configured substrate — which is never re-exported.
 */

import type { VanityDiagnosticCode } from '../diagnostics'
import type { VanityRuntimeContract, VanityRuntimeTokenContract } from '../runtime/contract'
import type { VanityAxisDefinition, VanityAxisRegistry, VanityAxisTriggerArm } from '../system/axes'
import type { VanityResolvedPolicies } from '../values/policies'
import type { VanityCssSupportTarget, VanityExpressionNode } from '../values/protocol'
import type { VanityCssValue, VanityValue } from '../values/types'
import type { VanityTokenBuilder } from './builder'
import type { VanityColorExpr } from './color'
import type { VanityExprTraits, VanityResolver, VanityScheme } from './expressions'
import type { VanityHandleErrorInput, VanityHandleOptions, VanityInternalTokenBranchHandle, VanityInternalTokenHandle, VanitySemanticTokenAddress } from './handle'
import type {
  VanityDefaultTokenPolicy,
  VanityGraphInput,
  VanityTokenModule,
  VanityTokenModuleOptions,
  VanityTokenModuleRequirement,
  VanityTokenPolicy,
  VanityTokens,
  VanityTokensOptions,
} from './types'
import { getStyleModuleFile } from '../css/context'
import { emitTokenCss } from '../css/tokens'
import { checkSelector } from '../css/validation'
import { didYouMean, getDiagnosticSource, VanityError } from '../diagnostics'
import { collectInspection, isInspecting, record } from '../introspect/records'
import { sealRuntimeContract } from '../runtime/contract'
import { substrate } from '../substrate'
import {
  collectNodeRequirements,
  createSerializeContext,
  getConstructorUsagesOfValue,
  serializeNode,
  getNode as valueNodeOf,
} from '../values/protocol'
import { serializeCssText } from '../values/serialize'
import { isCssValue } from '../values/types'
import { getColorRequirements, handleColorMethods, isColorValue, isContrastValue } from './color'
import { createTokenFactory, isConfiguredToken } from './config'
import { attachTokenDeclarationGetters } from './declarations'
import { collectRefs, foldExpr, getExpressionTraits, serializeContrastPick, serializeExpr } from './expressions'
import { rememberTokenFold } from './fold'
import {
  attachAxisBranch,
  attachCaseBranch,
  attachCaseBranches,
  createBranchHandle,
  createHandle,
  readHandlePath,
  readHandleVar,
  setRuntimeAddress,
  updateHandle,
  VANITY_RUNTIME_ADDRESS,
} from './handle'
import { formatOklch, pickLegible } from './math'
import { getTokenName } from './names'
import { createTokenCheckResolver, resolveGraph, runTokenChecks } from './resolve'

const TOKEN_HANDLE_OPTIONS: VanityHandleOptions = {
  serializeFallback: value => serializeCssText(value as Parameters<typeof serializeCssText>[0]),
  handleError: (input: VanityHandleErrorInput): never => {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_DEFINITION',
      message: input.message,
      path: input.path,
      fix: input.fix,
    })
  },
}

const GRAPH = Symbol.for('vanity.graph')
export const TOKEN_MODULE = Symbol.for('vanity.tokenModule')
export const VANITY_MODULE_TOKEN_REF = Symbol.for('vanity.moduleTokenRef')
const NODE = Symbol.for('vanity.node')

const CONTRAST_COLOR_SUPPORT = '(color: contrast-color(red))'

// ─── Resolved module structures ─────────────────────────────────────────────

export type VanityLeafDefinition
  = | { kind: 'none' }
    | { kind: 'literal', value: string | number }
    | { kind: 'value', value: VanityCssValue }
    | { kind: 'color', expr: VanityColorExpr }
    | { kind: 'contrast', expr: Extract<VanityColorExpr, { kind: 'contrast' }> }

export interface TokenNode {
  /** The dot path: `color.brand`. */
  key: string
  /** The emitted custom-property name: `--vanity-color-brand`. */
  name: string
  handle: VanityInternalTokenHandle
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
    readonly reference: 'explicit' | 'policy' | 'capability'
    readonly emit: 'explicit' | 'policy' | 'capability'
    readonly reasons: readonly string[]
  }
}

type TokenBranch
  = {
    readonly kind: 'axis'
    readonly axis: string
    readonly mode: string
    readonly definition: VanityLeafDefinition
    readonly handle: VanityInternalTokenBranchHandle
  }
  | {
    readonly kind: 'case'
    readonly when: Readonly<Record<string, string>>
    readonly definition: VanityLeafDefinition
    readonly handle: VanityInternalTokenBranchHandle
  }

export interface NodeResult {
  traits: VanityExprTraits
  emitted: string
  /** The `contrast-color()` upgrade a live-guarantee pairing declares under `@supports`. */
  supportsUpgrade?: string
}

export interface TokenGraph {
  prefix: string
  root: string
  nodes: Map<string, TokenNode>
  results: Map<string, NodeResult>
  /** System-bound serializer; absent only on the low-level graph helper. */
  serializeValue?: (value: VanityCssValue) => string
  support?: VanityCssSupportTarget
  policies?: VanityResolvedPolicies
  axes?: VanityAxisRegistry<any>
  phaseLayers?: VanityTokenPhaseLayers
  contributions?: ReadonlySet<object>
  file?: string
  runtime?: VanityRuntimeContract
  runtimeSchemas?: Readonly<Record<string, import('./types').VanityStandardSchemaV1>>
  /** Installed authored-interchange codecs, keyed by extension id. */
  dtcgCodecIds?: ReadonlySet<string>
}

export function getTokenGraph(tokens: object): TokenGraph | undefined {
  return (tokens as { [GRAPH]?: TokenGraph })[GRAPH]
}

/** Built-in constructor provenance per token, used by system policy borders. */
export function getConstructorUsages(tokens: object): Readonly<Record<string, readonly string[]>> {
  const graph = getTokenGraph(tokens)
  if (!graph) {
    throwTokenModuleError(
      'VANITY_TOKENS_INVALID_DEFINITION',
      'constructor-usage inspection needs a resolved token module',
      ['tokens'],
      'pass tokens returned by a finalized token module',
    )
  }
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
    getConstructorUsagesOfValue(definition.value).forEach(name => usages.add(name))
    collectNodeConstructorUsages(valueNodeOf(definition.value), usages)
    return
  }
  if (definition.kind === 'color' || definition.kind === 'contrast') {
    getConstructorUsagesOfValue(definition.expr).forEach(name => usages.add(name))
    collectColorConstructorUsages(definition.expr, usages)
  }
}

function collectNodeConstructorUsages(node: VanityExpressionNode, usages: Set<string>): void {
  const helper = node.source?.helper
  if (helper)
    usages.add(helper.split('.')[0]!)
  getNodeChildren(node).forEach(child => collectNodeConstructorUsages(child, usages))
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
        const values: readonly unknown[] = channel && typeof channel === 'object' && Object.hasOwn(channel, 'operations')
          ? (channel as { readonly operations: readonly { readonly value: unknown }[] }).operations.map(operation => operation.value)
          : [channel]
        values.forEach((value) => {
          if (value && typeof value === 'object' && Object.hasOwn(value, 'type'))
            collectNodeConstructorUsages(valueNodeOf(value as VanityValue), usages)
        })
      })
      return
    case 'relative':
      usages.add(expr.function)
      collectColorConstructorUsages(expr.input, usages)
      ;[...expr.channels, expr.alpha].forEach((channel) => {
        const values: readonly unknown[] = channel && typeof channel === 'object' && Object.hasOwn(channel, 'operations')
          ? (channel as { readonly operations: readonly { readonly value: unknown }[] }).operations.map(operation => operation.value)
          : [channel]
        values.forEach((value) => {
          if (value && (typeof value === 'object' || typeof value === 'function') && Object.hasOwn(value, 'type'))
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

export function getRuntimeContract(tokens: object): VanityRuntimeContract | undefined {
  return getTokenGraph(tokens)?.runtime
}

export function getRuntimeSchemas(tokens: object): Readonly<Record<string, import('./types').VanityStandardSchemaV1>> {
  return getTokenGraph(tokens)?.runtimeSchemas ?? {}
}

/** Data-only token restoration table used by compiler-owned runtime projection. */
export function getTokenRestorations(tokens: object): readonly import('./handle').VanityHandleMeta[] {
  const graph = getTokenGraph(tokens)
  if (!graph) {
    throwTokenModuleError(
      'VANITY_TOKENS_INVALID_DEFINITION',
      'token restoration needs a resolved token module',
      ['tokens'],
      'pass tokens returned by a finalized token module',
    )
  }
  return Object.freeze([...graph.nodes.values()].map(node => Object.freeze(createTokenRestorationMeta(node, graph))))
}

/** Emit a resolved graph. Consolidation itself always uses `emitCss: false`. */
export function emitTokenGraph(tokens: object): void {
  const graph = getTokenGraph(tokens)
  if (!graph) {
    throwTokenModuleError(
      'VANITY_TOKENS_INVALID_DEFINITION',
      'system emission needs a resolved token module',
      ['tokens'],
      'pass tokens returned by a finalized token module',
    )
  }
  if (isInspecting())
    recordGraph(graph)
  emitTokenCss(graph)
}

const TOKEN_INSPECTION_CACHE = new WeakMap<TokenGraph, ReadonlyMap<string, import('../introspect/records').VanityTokenRecord>>()

export function getTokenInspections(graph: TokenGraph): readonly import('../introspect/records').VanityTokenRecord[] {
  let cached = TOKEN_INSPECTION_CACHE.get(graph)
  if (!cached) {
    const { records } = collectInspection(() => recordGraph(graph))
    const next = new Map<string, import('../introspect/records').VanityTokenRecord>()
    for (const record of records) {
      if (record.kind === 'token')
        next.set(record.path, record)
    }
    cached = next
    TOKEN_INSPECTION_CACHE.set(graph, cached)
  }
  return Object.freeze([...cached.values()])
}

/** Build-time semantic record used by `ds.explain()` and authored interchange. */
export function getTokenInspection(
  graph: TokenGraph,
  handle: VanityInternalTokenHandle,
): import('../introspect/records').VanityTokenRecord {
  const node = getNode(handle)
  if (!node || graph.nodes.get(node.key) !== node) {
    throwTokenModuleError(
      'VANITY_TOKENS_UNKNOWN_REF',
      'explain() needs a token handle owned by this system',
      ['token'],
      'pass a token handle created by this system',
    )
  }

  getTokenInspections(graph)
  const cached = TOKEN_INSPECTION_CACHE.get(graph)!
  const token = cached.get(node.key)
  if (!token) {
    throwTokenModuleError(
      'VANITY_TOKENS_UNKNOWN_REF',
      `no explanation record exists for ${node.key}`,
      [node.key],
      'explain a token that is present in the finalized system',
    )
  }
  return token
}

export function serializeTokenCss(graph: TokenGraph, value: VanityCssValue): string {
  return graph.serializeValue?.(value) ?? value.css
}

export function getNode(handle: VanityInternalTokenHandle): TokenNode | undefined {
  return (handle as unknown as { [NODE]?: TokenNode })[NODE]
}

/**
 * Whether a graph handle names a color or a plain value — build-time
 * knowledge for surfaces that infer a type from a token default (ports).
 * Undefined for handles outside a resolved graph.
 */
// ─── defineTokens ────────────────────────────────────────────────────────────

export type TokenDerivation = (m: Record<string, unknown>) => object
export type TokenContribution
  = {
    readonly kind: 'seed'
    readonly graph: VanityGraphInput
    readonly emission: VanityTokenModuleOptions
    readonly moduleId?: symbol
    readonly modulePath?: readonly string[]
  }
  | {
    readonly kind: 'derive'
    readonly derive: TokenDerivation
    readonly emission: VanityTokenModuleOptions
    readonly moduleId?: symbol
    readonly modulePath?: readonly string[]
  }
  | { readonly kind: 'patch', readonly mode: 'augment' | 'overwrite', readonly graph: VanityGraphInput }
  | { readonly kind: 'patch-stage', readonly mode: 'augment' | 'overwrite', readonly derive: TokenDerivation }

const CONTRIBUTION_PATHS = new WeakMap<object, readonly string[]>()

export interface TokenModule {
  readonly [TOKEN_MODULE]: true
  readonly contributions: readonly TokenContribution[]
  readonly requirement?: VanityTokenModuleRequirement
  readonly tokenPolicy?: VanityTokenPolicy
  readonly derivationEmission: VanityTokenModuleOptions
}

export interface TokenResolutionOptions extends VanityTokensOptions<object, string> {
  readonly root?: string
  readonly layer?: string
  readonly layers?: readonly string[]
  readonly serializeValue?: (value: VanityCssValue) => string
  readonly support?: VanityCssSupportTarget
  readonly policies?: VanityResolvedPolicies
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
export function isTokenModule(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && (value as Partial<TokenModule>)[TOKEN_MODULE] === true
}

/**
 * Low-level graph helper used to verify graph semantics without a system.
 * Product authoring starts from `createSystem().defineTokens()`.
 */
export function defineTokens<const T extends VanityGraphInput = Record<never, never>>(seed?: T): VanityTokenBuilder<T> {
  const graph = seed ?? {} as T
  return createTokenModule([{ kind: 'seed', graph, emission: {} }], undefined, undefined, {}) as unknown as VanityTokenBuilder<T>
}

/** Canonical, system-portable module used by the token builder. */
export function definePortableTokenModule<
  const T extends VanityGraphInput = Record<never, never>,
  const Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
>(
  seed?: T,
  tokenPolicy: Policy = Object.freeze({ reference: 'var', emit: true }) as Policy,
): VanityTokenModule<T, Policy> {
  const graph = freezeTokenGroup(seed ?? {} as T) as T
  return createTokenModule(
    [{ kind: 'seed', graph, emission: {} }],
    undefined,
    tokenPolicy,
  ) as unknown as VanityTokenModule<T, Policy>
}

/** Create the canonical unfinished module bound to one semantic system. */
export function defineTokenModule<
  const T extends VanityGraphInput = Record<never, never>,
  const Policy extends VanityTokenPolicy = VanityTokenPolicy,
>(
  requirement: VanityTokenModuleRequirement,
  tokenPolicy: Policy,
  seed?: T,
  options: VanityTokenModuleOptions = {},
): VanityTokenModule<T, Policy> {
  validateModuleOptions(options)
  const graph = freezeTokenGroup(seed ?? {} as T) as T
  const emission = Object.freeze({ ...options })
  return createTokenModule([{ kind: 'seed', graph, emission }], requirement, tokenPolicy, emission) as unknown as VanityTokenModule<T, Policy>
}

export function createTokenModule(
  contributions: readonly TokenContribution[],
  requirement?: VanityTokenModuleRequirement,
  tokenPolicy?: VanityTokenPolicy,
  derivationEmission: VanityTokenModuleOptions = {},
): TokenModule {
  const frozenContributions = Object.freeze([...contributions])
  const frozenDerivationEmission = Object.freeze({ ...derivationEmission })
  const module: TokenModule = {
    [TOKEN_MODULE]: true as const,
    contributions: frozenContributions,
    requirement,
    tokenPolicy,
    derivationEmission: frozenDerivationEmission,
  }
  return Object.freeze(module)
}

/** Resolve an inert module at the owning system boundary. */
export function freezeTokenGroup(group: object): object {
  return Object.freeze(Object.fromEntries(Object.entries(group).map(([key, value]) => [
    key,
    isGroup(value) ? freezeTokenGroup(value) : value,
  ])))
}

function validateModuleOptions(options: VanityTokenModuleOptions): void {
  if (options.root !== undefined) {
    if (options.root.includes('&') || checkSelector(options.root)) {
      throwTokenModuleError(
        'VANITY_TOKENS_INVALID_CONFIG',
        `token module root '${options.root}' is not a valid absolute CSS selector`,
        'root',
        'use an absolute selector without \'&\'',
      )
    }
  }
  if (options.runtimeRoot !== undefined && checkSelector(options.runtimeRoot)) {
    throwTokenModuleError(
      'VANITY_TOKENS_INVALID_CONFIG',
      `token module runtime root '${options.runtimeRoot}' is not a valid CSS selector`,
      'runtimeRoot',
      'use a valid CSS selector for the runtime root',
    )
  }
  for (const scope of options.scopes ?? []) {
    if (scope.trim().length === 0) {
      throwTokenModuleError(
        'VANITY_TOKENS_INVALID_CONFIG',
        'a token module @scope prelude cannot be empty',
        'scopes',
        'remove the empty scope or provide a valid @scope prelude',
      )
    }
  }
  if (options.layer !== undefined && !isLayerPath(options.layer)) {
    throwTokenModuleError(
      'VANITY_TOKENS_INVALID_CONFIG',
      `token module layer '${options.layer}' is not a valid dotted CSS layer path`,
      'layer',
      'use a dotted CSS layer path such as tokens.components',
    )
  }
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

export function buildTokens<T extends object, Prefix extends string = 'vanity'>(
  contributions: readonly TokenContribution[],
  tokenPolicy: VanityTokenPolicy | undefined,
  options: TokenResolutionOptions = {},
): VanityTokens<T, Prefix> {
  const prefix = options.prefix ?? 'vanity'
  const defaultRoot = options.root ?? ':root'
  const defaultLayer = options.layer
  const file = getStyleModuleFile()?.filePath
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
    const additions = contribution.derive(createRefsProxy(
      tree,
      [],
      `${contribution.kind === 'patch-stage' ? 'patch' : 'derivation'} stage ${stageIndex}`,
      file,
    ))

    if (!isGroup(additions)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_DEFINITION',
        message: `${contribution.kind === 'patch-stage' ? 'patch' : 'derivation'} stage ${stageIndex} did not return a token group`,
        path: `tokens.${contribution.kind}.${stageIndex}`,
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

  diagnostics.push(...runTokenChecks(options.checks?.(tree as VanityTokens<T, Prefix>) ?? [], resolved))

  if (diagnostics.length > 0)
    throw new VanityError(diagnostics)

  hydrateGraphHandles(resolved)
  attachTokenDeclarationGetters(tree, { file })
  resolved.runtime = buildRuntimeContract(resolved)
  resolved.runtimeSchemas = collectRuntimeSchemas(resolved)
  attachRuntimeAddresses(resolved)

  for (const node of nodes.values()) {
    substrate.modules.registerFunctionSerialization(node.handle as unknown as (...args: unknown[]) => unknown, {
      importPath: '@mszr/vanity/runtime',
      importName: 'restoreToken',
      args: [createTokenRestorationMeta(node, resolved) as any],
    })
  }

  if (options.emitCss !== false)
    emitTokenCss(resolved)

  Object.defineProperty(tree, GRAPH, { value: resolved })

  if (options.emitCss !== false && isInspecting())
    recordGraph(resolved)

  return tree as VanityTokens<T, Prefix>
}

function applyTokenPatch(
  contribution: Extract<TokenContribution, { kind: 'patch' }>,
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
      if (!normalizedReplacement) {
        throwTokenModuleError(
          'VANITY_TOKENS_INVALID_OVERRIDE',
          `${contribution.mode}Tokens() did not produce a token at '${key}'`,
          key,
          `return a token value for '${key}' from the ${contribution.mode}Tokens() input`,
        )
      }
      const replacement = filterPatchBranches(normalizedReplacement, resolvedRaw)

      const next = mergePatchedNode(current, replacement, contribution.mode, patchesBase, file)
      nodes.set(key, next)

      // The public preview tree retains the same resolved handle semantics.
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
      const key = getTokenBranchKey(branch)
      return branch.kind === 'axis' ? axisSlots.has(key) : raw.config.cases !== undefined
    }),
  }
}

function resolvePatchValue(
  raw: unknown,
  current: TokenNode,
  axes: VanityAxisRegistry<any> | undefined,
): unknown {
  if (typeof raw !== 'function' || getNode(raw as VanityInternalTokenHandle))
    return raw

  const token = createTokenFactory(axes)
  const createConfiguredPatch = (config: import('./types').VanityTokenConfig): unknown => {
    const value = (token as any)(config)
    return new Proxy(value, {
      get(target, key, receiver) {
        if (typeof key !== 'string' || axes?.definitions[key] === undefined)
          return Reflect.get(target, key, receiver)
        return (input: unknown) => createConfiguredPatch({
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
        return (value: unknown) => createConfiguredPatch({ val: value })
      if (typeof key === 'string' && axes?.definitions[key] !== undefined) {
        return (input: unknown) => createConfiguredPatch({
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
  if (!input || typeof input !== 'object') {
    throwTokenModuleError(
      'VANITY_TOKENS_INVALID_AXES',
      'an axis patch needs a mode-value object or mode callback',
      'axes',
      'provide an object keyed by mode or a callback that receives the mode map',
    )
  }
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
    assertPatchSlotAvailable(current.key, 'val', file)

  const currentBranches = new Map(current.branches.map(branch => [getTokenBranchKey(branch), branch]))
  const replacementBranches = new Map(replacement.branches.map(branch => [getTokenBranchKey(branch), branch]))
  for (const [address, branch] of replacementBranches) {
    const existing = currentBranches.get(address)
    if (mode === 'augment' && existing?.definition.kind !== undefined && existing.definition.kind !== 'none')
      assertPatchSlotAvailable(current.key, address, file)
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
    ...current.branches.map(branch => replacementBranches.get(getTokenBranchKey(branch)) ?? branch),
    ...replacement.branches.filter(branch => !currentBranches.has(getTokenBranchKey(branch))),
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
    assertValidTrait(current.key, 'val', `preserve the established ${currentType} data type`)

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

function getTokenBranchKey(branch: TokenBranch): string {
  return branch.kind === 'axis'
    ? `axis:${branch.axis}:${branch.mode}`
    : `case:${Object.entries(branch.when).map(([axis, mode]) => `${axis}:${mode}`).join('|')}`
}

function assertPatchSlotAvailable(token: string, slot: string, file?: string): never {
  throw new VanityError({
    code: 'VANITY_TOKENS_INVALID_OVERRIDE',
    message: `augmentTokens() cannot fill '${token}.${slot}' because that slot already has a value`,
    path: `${token}.${slot}`,
    file,
    fix: 'use overwriteTokens() when replacing an existing value is intentional',
  })
}

function createTokenRestorationMeta(
  node: TokenNode,
  graph: TokenGraph,
): import('./handle').VanityHandleMeta {
  const result = graph.results.get(node.key)!
  const axes: Record<string, Record<string, {
    value?: string | number
    runtime?: import('./handle').VanityHandleRuntimeAddress
  }>> = {}
  const cases: {
    when: Readonly<Record<string, string>>
    value?: string | number
    runtime?: import('./handle').VanityHandleRuntimeAddress
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
    reference: node.contract.reference,
    emit: node.contract.emit,
    mutable: node.contract.mutable,
    type: node.contract.type,
    ...(node.definition.kind === 'none' ? {} : { value: result.emitted }),
    ...(node.meta.description === undefined ? {} : { description: node.meta.description }),
    ...(node.meta.deprecated === undefined ? {} : { deprecated: node.meta.deprecated }),
    ...(node.contract.metadata === undefined ? {} : { metadata: node.contract.metadata }),
    ...(node.contract.register === undefined ? {} : { register: getSerializableRegistration(node, graph) }),
    ...(getRuntimeValidation(node, graph) === undefined ? {} : { validate: getRuntimeValidation(node, graph) }),
    ...(node.handle[VANITY_RUNTIME_ADDRESS] === undefined ? {} : { runtime: node.handle[VANITY_RUNTIME_ADDRESS] }),
    ...(Object.keys(axes).length === 0 ? {} : { axes }),
    ...(cases.length === 0 ? {} : { cases }),
  }
}

function hydratePartialGraph(
  prefix: string,
  nodes: Map<string, TokenNode>,
  options: TokenResolutionOptions,
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
      () => getTokenInspection(graph, node.handle).semantic.fold,
    )
    const result = graph.results.get(node.key)!
    updateHandle(node.handle, {
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
    return serializeTokenCss(graph, definition.value)

  const base = createTokenCheckResolver(graph, 'light')
  const resolver: VanityResolver = {
    ...base,
    getRefTraits: (handle) => {
      const node = getNode(handle)
      const result = node ? graph.results.get(node.key) : undefined
      return {
        cssLive: (result?.traits.cssLive ?? false) || node?.contract.reference === 'var',
        volatile: (result?.traits.volatile ?? false) || node?.contract.mutable === true,
        conditional: result?.traits.conditional ?? false,
      }
    },
    serializeRef: (handle) => {
      const node = getNode(handle)
      if (!node)
        return readHandleVar(handle)
      return node.contract.reference === 'var' ? readHandleVar(handle) : graph.results.get(node.key)!.emitted
    },
  }

  if (definition.kind === 'contrast')
    return serializeContrastPick(definition.expr, resolver)

  const traits = getExpressionTraits(definition.expr, resolver)
  return traits.cssLive || traits.volatile
    ? serializeExpr(definition.expr, resolver)
    : formatOklch(foldExpr(definition.expr, 'light', resolver))
}

function buildRuntimeContract(graph: TokenGraph): VanityRuntimeContract {
  const axisOrder = [...(graph.axes?.order ?? [])]
  const rootPaths = getRuntimeRootPaths(graph)
  const axes = Object.fromEntries(axisOrder.map((axis) => {
    const definition = graph.axes!.definitions[axis]!
    const runtimeArms: { mode: string, arm: VanityAxisTriggerArm | undefined }[] = definition.modeOrder.map((mode: string) => ({
      mode,
      arm: [...definition.modes[mode]!.arms]
        .filter(arm => arm.runtime !== undefined)
        .sort((left, right) => right.priority - left.priority)[0],
    }))
    const names = new Set<string>(runtimeArms.flatMap(entry => entry.arm?.runtime?.name ?? []))
    let attribute: import('../runtime/contract').VanityRuntimeAxisContract['attribute']
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
        : { kind: 'case', when: orderWhen(branch.when, axisOrder) }
      return Object.freeze({
        address,
        ...(hasMutableSlots(node) ? { slot: getBranchSlot(graph.prefix, node, branch) } : {}),
        ...(branch.handle.$val === undefined ? {} : { value: branch.handle.$val }),
      })
    })
    const validation = getRuntimeValidation(node, graph)
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
      ...(hasMutableSlots(node) ? { baseSlot: createPrivateAddress(graph.prefix, node.key, 'base') } : {}),
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
      throwTokenModuleError(
        'VANITY_TOKENS_INVALID_CONFIG',
        `runtime root path '${token.rootPath}' resolves to both '${existing.selector}' and '${selector}'`,
        ['runtimeRoot', token.rootPath],
        'use one selector for every token module mounted at this runtime root path',
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

function getRuntimeRootPaths(graph: TokenGraph): Map<TokenNode, string> {
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
    if (existing && existing['~standard'].vendor !== validate.schema['~standard'].vendor) {
      throwTokenModuleError(
        'VANITY_TOKENS_INVALID_CONFIG',
        `runtime validation id '${validate.id}' is claimed by multiple Standard Schema vendors`,
        ['validate', 'id'],
        'use one validation id per Standard Schema vendor',
      )
    }
    schemas[validate.id] ??= validate.schema
  }
  return Object.freeze(schemas)
}

function getRuntimeValidation(
  node: TokenNode,
  graph: TokenGraph,
): import('../runtime/contract').VanityRuntimeValidationContract | undefined {
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

function getSerializableRegistration(node: TokenNode, graph: TokenGraph): unknown {
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
  const tokensByPath = getRuntimeTokenIndex(contract)
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
        : { kind: 'case', when: orderWhen(branch.when, contract.axisOrder) }
      const runtimeBranch = token.branches.find(candidate => isSameSemanticAddress(candidate.address, address))!
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

function getRuntimeTokenIndex(
  contract: VanityRuntimeContract,
): ReadonlyMap<string, VanityRuntimeTokenContract> {
  let index = runtimeTokenIndexes.get(contract)
  if (index === undefined) {
    index = new Map(contract.tokens.map(token => [token.token.join('.'), token]))
    runtimeTokenIndexes.set(contract, index)
  }
  return index
}

function orderWhen(
  when: Readonly<Record<string, string>>,
  axisOrder: readonly string[],
): Readonly<Record<string, string>> {
  const rank = new Map(axisOrder.map((axis, index) => [axis, index]))
  return Object.freeze(Object.fromEntries(Object.entries(when).sort(([left], [right]) =>
    (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER)
    || left.localeCompare(right))))
}

function isSameSemanticAddress(left: VanitySemanticTokenAddress, right: VanitySemanticTokenAddress): boolean {
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
export function getTokenModulePaths(value: unknown, owner?: object): readonly string[] | undefined {
  if (!isTokenModule(value))
    return undefined
  const ownerGraph = owner ? getTokenGraph(owner) : undefined
  const paths: string[] = []
  for (const contribution of (value as TokenModule).contributions) {
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
    : getGroupEmission(group, emission, path, file)

  for (const [key, raw] of Object.entries(group)) {
    if (tokenPolicy !== undefined && (key === '$description' || key === '$root'))
      continue
    if (tokenPolicy !== undefined && key === '$axes') {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_AXES',
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
        throwDuplicateToken(keyPath, file)

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

    if (Object.hasOwn(tree, key))
      throwDuplicateToken(keyPath, file)

    const node = createNode(leafPath, prefix, raw, derived, groupEmission, tokenPolicy, axes, moduleId, modulePath)
    nodes.set(node.key, node)
    tree[key] = node.handle
    added.push(node.key)
  }
}

function getGroupEmission(
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
      fix: 'use an absolute selector, or anchor a relative selector with &',
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
function createRefsProxy(tree: Record<string, unknown>, path: string[], context: string, file?: string): Record<string, unknown> {
  return new Proxy(tree, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || Object.hasOwn(target, prop)) {
        const value = Reflect.get(target, prop, receiver)

        return typeof value === 'object' && value !== null && typeof prop === 'string'
          ? createRefsProxy(value as Record<string, unknown>, [...path, prop], context, file)
          : value
      }

      const refPath = [...path, prop].join('.')
      const suggestion = didYouMean(prop, Object.keys(target))

      throw new VanityError({
        code: 'VANITY_TOKENS_UNKNOWN_REF',
        message: `${refPath} is not a token in this module${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
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
  const name = getTokenName(prefix, path)
  const handle = createHandle({
    name,
    path: key,
    reference: normalized.contract.reference,
    emit: normalized.contract.emit,
    mutable: normalized.contract.mutable,
    type: normalized.contract.type,
    description: normalized.meta.description,
    deprecated: normalized.meta.deprecated,
    metadata: normalized.contract.metadata,
    register: normalized.contract.register,
    validate: normalized.contract.validate,
  }, TOKEN_HANDLE_OPTIONS)
  attachCaseBranches(handle, TOKEN_HANDLE_OPTIONS)
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
        mutable: false,
        type: inferTokenType(raw),
        inference: {
          reference: 'policy',
          emit: 'policy',
          reasons: ['compatibility-policy'],
        },
      },
      meta: {},
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
      && candidates.every(candidate => isSameAuthoredValue(candidate, candidates[0]))
    if (candidates.length > 1 && !comparable) {
      assertValidTrait(
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
      : conditional || (configured && !hasVal) ? 'capability' : 'policy',
    emit: configured && config!.emit !== undefined
      ? 'explicit'
      : conditional || (configured && !hasVal) ? 'capability' : 'policy',
    reasons: [
      ...(conditional ? ['conditional-binding'] : []),
      ...(configured && !hasVal ? ['no-default-address'] : []),
      ...(inferredFromDefault ? ['axis-default-inference'] : []),
      ...(!conditional && (!configured || hasVal) ? ['policy'] : []),
    ],
  }

  if (conditional && reference !== 'var')
    assertValidTrait(key, 'reference', 'use reference: \'var\' because mutable/axes/cases need a public binding')
  if (conditional && emit !== true)
    assertValidTrait(key, 'emit', 'use emit: true because mutable/axes/cases need a public binding')
  if (hasVal && reference === 'var' && emit === false)
    assertValidTrait(key, 'emit', 'use reference: \'val\' for a known nonemitted value')

  const type = configured ? raw.type : inferTokenType(rawVal)
  const description = config?.description
  const deprecated = config?.deprecated === undefined
    ? undefined
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
      if (!Object.hasOwn(definition.modes, mode))
        assertValidTrait(key, `axes.${axis}.${mode}`, `use one of the declared modes: ${definition.modeOrder.join(', ')}`)
    }

    if (hasVal && definition.defaultMode !== undefined && !Object.hasOwn(authored, definition.defaultMode))
      authored[definition.defaultMode] = rawVal

    authoredAxes.set(axis, authored)
  }

  const caseAxes = new Set<string>()
  const caseAddresses = new Set<string>()
  for (const entry of config?.cases ?? []) {
    const entries = Object.entries(entry.when)
    if (entries.length < 2)
      assertValidTrait(key, 'cases.when', 'a sparse case intersects at least two declared axes; use an axis mode for one dimension')
    const normalizedWhen: Record<string, string> = {}
    for (const axis of axes?.order ?? []) {
      if (!Object.hasOwn(entry.when, axis))
        continue
      const mode = entry.when[axis]!
      const definition = requireAxis(axes, axis, key)
      if (!Object.hasOwn(definition.modes, mode))
        assertValidTrait(key, `cases.when.${axis}`, `use one of the declared modes: ${definition.modeOrder.join(', ')}`)
      normalizedWhen[axis] = mode
      caseAxes.add(axis)
    }
    for (const axis of Object.keys(entry.when)) {
      if (!Object.hasOwn(normalizedWhen, axis))
        requireAxis(axes, axis, key)
    }
    const address = Object.entries(normalizedWhen).map(([axis, mode]) => `${axis}:${mode}`).join('|')
    if (caseAddresses.has(address))
      assertValidTrait(key, 'cases', `remove the duplicate case ${address}`)
    caseAddresses.add(address)
  }

  const usedAxes = new Set([...authoredAxes.keys(), ...caseAxes])
  if (!hasVal && usedAxes.size > 1)
    assertValidTrait(key, 'val', 'a token varying across multiple independent axes needs a base val before sparse overrides')

  if (!hasVal && authoredAxes.size === 1) {
    const [axis, authored] = [...authoredAxes][0]!
    const definition = requireAxis(axes, axis, key)
    const missing = definition.modeOrder.filter(mode => !Object.hasOwn(authored, mode))
    if (missing.length > 0) {
      assertValidTrait(
        key,
        `axes.${axis}`,
        `author every mode when no base val exists; missing: ${missing.join(', ')}`,
      )
    }
  }

  for (const [axis, modes] of authoredAxes) {
    for (const [mode, val] of Object.entries(modes)) {
      if (val === null && config?.mutable !== true)
        assertValidTrait(key, `axes.${axis}.${mode}`, 'null reserves a runtime address and therefore requires mutable: true')
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
      assertValidTrait(key, 'cases.val', 'null reserves a runtime address and therefore requires mutable: true')
    assertBranchType(type, entry.val, key, 'cases.val')
    const orderWhen = Object.freeze(Object.fromEntries((axes?.order ?? Object.keys(entry.when))
      .filter(axis => Object.hasOwn(entry.when, axis))
      .map(axis => [axis, entry.when[axis]!]),
    ))
    branches.push({
      kind: 'case',
      when: orderWhen,
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

function isSameAuthoredValue(left: unknown, right: unknown): boolean {
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
    assertValidTrait(token, `axes.${axis}`, 'declare this axis on the system before defining tokens')
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
    assertValidTrait(
      token,
      field,
      `use a ${expected} value; this branch is ${actual}`,
    )
  }
}

function assertValidTrait(path: string, field: string, fix: string): never {
  throw new VanityError({
    code: 'VANITY_TOKENS_TRAIT_CONFLICT',
    message: `${path}.${field} conflicts with this token's independent traits`,
    path: `${path}.${field}`,
    fix,
  })
}

function inferTokenType(raw: unknown): import('../values/types').VanityCssDataType {
  if (isColorValue(raw) || isContrastValue(raw))
    return 'color'
  if ((typeof raw === 'object' || typeof raw === 'function') && raw !== null && Object.hasOwn(raw, 'type')) {
    const type = (raw as { readonly type?: unknown }).type
    if (typeof type === 'string')
      return type as import('../values/types').VanityCssDataType
  }
  if (typeof raw === 'number')
    return Number.isInteger(raw) ? 'integer' : 'number'
  return 'unknown'
}

function throwDuplicateToken(path: string, file?: string): never {
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

  if (typeof raw === 'function' && getNode(raw as VanityInternalTokenHandle))
    return { kind: 'color', expr: { kind: 'ref', handle: raw as VanityInternalTokenHandle } }

  if (isContrastValue(raw))
    return { kind: 'contrast', expr: raw.expr }

  if (isColorValue(raw))
    return { kind: 'color', expr: raw.expr }

  if (typeof raw === 'string' || typeof raw === 'number')
    return { kind: 'literal', value: raw }

  if (isCssValue(raw))
    return { kind: 'value', value: raw }

  throw new VanityError({
    code: 'VANITY_TOKENS_INVALID_DEFINITION',
    message: `${key} is not a token value — expected a string, number, color, or derivation`,
    path: key,
  })
}

/** Classify what a derivation returned; a returned handle is an alias — a plain graph edge. */
function classifyLeaf(result: unknown, node: TokenNode): VanityLeafDefinition {
  if (typeof result === 'function' && getNode(result as VanityInternalTokenHandle))
    return { kind: 'color', expr: { kind: 'ref', handle: result as VanityInternalTokenHandle } }

  return classifyLeafValue(result, node.key)
}

// ─── Introspection ───────────────────────────────────────────────────────────

/**
 * Record the resolved graph for the manifest ([spec-introspection.md §5]):
 * every token with its per-scheme built values and graph edges, plus the
 * contrast results `legibleOn` pairings measured — passes and consciously-
 * accepted thresholds included. Runs only under an open collector.
 */
function recordGraph(graph: TokenGraph): void {
  const resolvers = { light: createTokenCheckResolver(graph, 'light'), dark: createTokenCheckResolver(graph, 'dark') } as const
  const runtimeTokensByPath = graph.runtime === undefined ? undefined : getRuntimeTokenIndex(graph.runtime)

  const getSchemeValue = (node: TokenNode, scheme: VanityScheme): string => {
    const definition = node.definition

    if (definition.kind === 'literal')
      return String(definition.value)

    if (definition.kind === 'value')
      return serializeTokenCss(graph, definition.value)

    if (definition.kind === 'none')
      return ''

    if (definition.kind === 'contrast')
      return pickLegible(foldExpr(definition.expr.target, scheme, resolvers[scheme])).keyword

    return formatOklch(foldExpr(definition.expr, scheme, resolvers[scheme]))
  }

  const previewOf = (node: TokenNode): import('../introspect/records').VanityTokenPreviewRecord => {
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
      const value = serializeTokenCss(graph, definition.value)
      return { status: 'available', light: value, dark: value }
    }

    try {
      return {
        status: 'available',
        light: getSchemeValue(node, 'light'),
        dark: getSchemeValue(node, 'dark'),
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
      : node.definition.kind === 'literal' || node.definition.kind === 'none' ? [] : [...getColorRequirements(node.definition.expr)])
    for (const branch of node.branches) {
      if (branch.definition.kind === 'value')
        collectNodeRequirements(valueNodeOf(branch.definition.value)).forEach(requirement => requirements.add(requirement))
      else if (branch.definition.kind !== 'literal' && branch.definition.kind !== 'none')
        getColorRequirements(branch.definition.expr).forEach(requirement => requirements.add(requirement))
    }
    const preview = previewOf(node)
    const plan = planTokenEmission(node, graph)
    const runtimeToken = runtimeTokensByPath?.get(node.key)
    const emission: import('../introspect/records').VanityTokenEmissionRecord[] = []
    if (Object.keys(plan.baseVars).length > 0) {
      emission.push({
        kind: 'base',
        root: node.root,
        ...(node.scopes === undefined ? {} : { scopes: node.scopes }),
        ...(getPhaseLayer(graph, node, 'base') === undefined ? {} : { layer: getPhaseLayer(graph, node, 'base') }),
      })
    }
    if (plan.native !== undefined) {
      emission.push({
        kind: 'native',
        root: node.root,
        ...(node.scopes === undefined ? {} : { scopes: node.scopes }),
        layer: getPhaseLayer(graph, node, 'base'),
        axis: plan.native.axis,
        locality: plan.native.locality,
        mechanism: 'native',
      })
    }
    emission.push(...plan.axisDeclarations.map(entry => ({
      kind: 'axis' as const,
      root: entry.root,
      layer: getPhaseLayer(graph, node, 'axis', entry.axis),
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
      layer: getPhaseLayer(graph, node, 'case'),
      when: entry.when,
      priority: entry.priority,
      ...(entry.media === undefined ? {} : { media: entry.media }),
      ...(entry.supports === undefined ? {} : { supports: entry.supports }),
      ...(entry.container === undefined ? {} : { container: entry.container }),
      ...(entry.scopes === undefined ? {} : { scopes: entry.scopes }),
    })))

    const declarations: import('../introspect/records').VanityTokenDeclarationRecord[] = []
    for (const [name, val] of Object.entries(plan.baseVars)) {
      declarations.push({
        kind: name === node.name ? 'base' : 'slot',
        ...(name === node.name ? {} : { name: name as `--${string}` }),
        val,
        context: {
          root: node.root,
          selectors: [],
          atRules: [...(node.scopes ?? []).map(scope => `@scope ${scope}`)],
          ...(getPhaseLayer(graph, node, 'base') === undefined ? {} : { layer: getPhaseLayer(graph, node, 'base') }),
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
        context: getDeclarationContext(node.root, entry.root, getPhaseLayer(graph, node, 'axis', entry.axis), entry),
      })
    }
    for (const entry of plan.caseDeclarations) {
      declarations.push({
        kind: 'case',
        ...(entry.name === node.name ? {} : { name: entry.name as `--${string}` }),
        val: entry.value || null,
        when: entry.when,
        context: getDeclarationContext(node.root, entry.root, getPhaseLayer(graph, node, 'case'), entry),
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
          ...(getPhaseLayer(graph, node, 'base') === undefined ? {} : { layer: getPhaseLayer(graph, node, 'base') }),
        },
      })
    }

    const dependencies = getDependencyRecords(node, graph, refs)
    const expression = getExpressionRecord(node.definition, result, graph)
    const portability = getPortability(node, graph)
    const fold = foldRecord(node, result, preview)
    const supportPath = getValueSupportPath(node.definition, graph, result)

    record({
      kind: 'token',
      file: graph.file,
      ...getDiagnosticSource(node.key),
      path: node.key,
      var: node.name,
      root: node.root,
      ...(node.scopes === undefined ? {} : { scopes: node.scopes }),
      ...(node.modulePath === undefined ? {} : { module: node.modulePath }),
      ...(node.layer === undefined ? {} : { layer: node.layer }),
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
            ...(getOpaqueProfile(branch.definition)?.encodable !== true
              ? {}
              : { expression: getExpressionRecord(branch.definition, { ...result, emitted: String(val ?? '') }, graph) }),
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
          ...getDiagnosticSource(node.key),
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

function getDeclarationContext(
  root: string,
  selector: string,
  layer: string | undefined,
  entry: {
    readonly media?: string
    readonly supports?: string
    readonly container?: string
    readonly scopes?: readonly string[]
  },
): import('../introspect/records').VanityTokenDeclarationRecord['context'] {
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

function getDependencyRecords(
  node: TokenNode,
  graph: TokenGraph,
  refs: ReadonlySet<string>,
): import('../introspect/records').VanityTokenDependencyRecord[] {
  const records: import('../introspect/records').VanityTokenDependencyRecord[] = []
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

function getExpressionRecord(
  definition: VanityLeafDefinition,
  result: NodeResult,
  graph: TokenGraph,
): import('../introspect/records').VanityTokenExpressionRecord {
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
    return getExpressionNodeRecord(valueNodeOf(definition.value), result.emitted)
  return getColorExpressionRecord(definition.expr, result.emitted, graph)
}

function getExpressionNodeRecord(
  node: VanityExpressionNode,
  css?: string,
): import('../introspect/records').VanityTokenExpressionRecord {
  const children = getNodeChildren(node).map(child => getExpressionNodeRecord(child))
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

function getNodeChildren(node: VanityExpressionNode): readonly VanityExpressionNode[] {
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

function getColorExpressionRecord(
  expr: VanityColorExpr,
  css: string | undefined,
  graph: TokenGraph,
): import('../introspect/records').VanityTokenExpressionRecord {
  const children: import('../introspect/records').VanityTokenExpressionRecord[] = []
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
      return getExpressionNodeRecord(valueNodeOf(expr.value), css)
    case 'ref':
      detail.path = getNode(expr.handle)?.key ?? readHandlePath(expr.handle)
      break
    case 'alpha':
      detail.amount = expr.amount
      children.push(getColorExpressionRecord(expr.input, undefined, graph))
      break
    case 'adjust':
      detail.channel = expr.channel
      detail.delta = expr.delta
      children.push(getColorExpressionRecord(expr.input, undefined, graph))
      break
    case 'channels':
      detail.channels = Object.keys(expr.channels).join(',')
      children.push(getColorExpressionRecord(expr.input, undefined, graph))
      break
    case 'relative':
      detail.function = expr.function
      detail.channels = expr.channelNames.join(',')
      if (expr.space !== undefined)
        detail.space = expr.space
      children.push(getColorExpressionRecord(expr.input, undefined, graph))
      break
    case 'mix':
      detail.amount = expr.amount
      detail.space = expr.space
      if (expr.hue !== undefined)
        detail.hue = expr.hue
      children.push(getColorExpressionRecord(expr.input, undefined, graph), getColorExpressionRecord(expr.other, undefined, graph))
      break
    case 'scheme':
      children.push(getColorExpressionRecord(expr.light, undefined, graph), getColorExpressionRecord(expr.dark, undefined, graph))
      break
    case 'contrast':
      detail.contrast = expr.contrast
      detail.explicitContrast = expr.explicitContrast
      children.push(getColorExpressionRecord(expr.target, undefined, graph))
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
  preview: import('../introspect/records').VanityTokenPreviewRecord,
): import('../introspect/records').VanityTokenSemanticRecord['fold'] {
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

function getPortability(
  token: TokenNode,
  graph: TokenGraph,
): import('../introspect/records').VanityTokenSemanticRecord['portability'] {
  const profiles = [token.definition, ...token.branches.map(branch => branch.definition)]
    .flatMap((definition) => {
      const profile = getOpaqueProfile(definition)
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

function getOpaqueProfile(
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

function getValueSupportPath(
  definition: VanityLeafDefinition,
  graph: TokenGraph,
  result: NodeResult,
): Pick<import('../introspect/records').VanityTokenSemanticRecord['support'], 'fallback' | 'enhancement'> {
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
  for (const child of getNodeChildren(node)) {
    found.push(...findOpaquePlugins(child))
  }
  return found
}

export interface PlannedConditionalDeclaration {
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

export interface PlannedTokenEmission {
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

export function planTokenEmission(node: TokenNode, graph: TokenGraph): PlannedTokenEmission {
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

  const usedAxisOrder = axes?.order.filter(axis => branchAxes.has(axis) || cases.some(branch => Object.hasOwn(branch.when, axis))) ?? []
  const native = planNativeScheme(node, graph, branchAxes, usedAxisOrder)
  // Ordinary token branches compose most faithfully by declaring the public
  // property in ordered layers: descendant and absolute triggers then compute
  // where their selector matches. Private stages are only needed for mutable
  // multi-axis fallback chains, whose bindings are constrained to the token's
  // effective root so var() substitution cannot freeze a downstream trigger.
  const needsStages = hasMutableSlots(node) && usedAxisOrder.length > 1
  let priorExpression: string | undefined

  if (hasMutableSlots(node)) {
    const baseSlot = createPrivateAddress(graph.prefix, node.key, 'base')
    if (node.definition.kind !== 'none')
      baseVars[baseSlot] = result.emitted
    priorExpression = `var(${baseSlot})`
    for (const branch of node.branches) {
      if (branch.definition.kind === 'none')
        continue
      baseVars[getBranchSlot(graph.prefix, node, branch)] = serializeBranch(branch.definition, graph)!.toString()
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
      priorExpression = serializeBranchExpression(node, defaultBranch, graph, undefined)
    }
  }

  for (const axis of usedAxisOrder) {
    const definition = axes!.definitions[axis]!
    const stageName = needsStages ? createPrivateAddress(graph.prefix, node.key, `stage:${axis}`) : node.name
    const nativeForAxis = native?.axis === axis ? native : undefined
    const incoming = priorExpression

    if (nativeForAxis) {
      const light = serializeNativeSourceExpression(node, nativeForAxis.light, graph, incoming)
      const dark = serializeNativeSourceExpression(node, nativeForAxis.dark, graph, incoming)
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
        ? serializeBranchExpression(node, branch, graph, incoming)
        : serializeNativeSourceExpression(node, nativeSource!, graph, incoming)
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
    const arms = getCaseArms(node, branch, graph)
    const fallback = priorExpression
    const value = serializeBranchExpression(node, branch, graph, fallback)
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

  const registration = getRegistration(node, graph, result.emitted, native)
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

function planNativeScheme(
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
    if (node.branches.some(branch => branch.kind === 'case' && Object.hasOwn(branch.when, axis))
      && native.locality === 'element') {
      assertValidTrait(
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

function serializeNativeSourceExpression(
  node: TokenNode,
  source: NativeSchemeSource,
  graph: TokenGraph,
  fallback: string | undefined,
): string {
  if (source.kind !== 'base')
    return serializeBranchExpression(node, source, graph, fallback)
  if (hasMutableSlots(node)) {
    const slot = createPrivateAddress(graph.prefix, node.key, 'base')
    return `var(${slot})`
  }
  return graph.results.get(node.key)!.emitted
}

function serializeBranchExpression(
  node: TokenNode,
  branch: TokenBranch,
  graph: TokenGraph,
  fallback: string | undefined,
): string {
  if (hasMutableSlots(node)) {
    const slot = getBranchSlot(graph.prefix, node, branch)
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

function getRegistration(
  node: TokenNode,
  graph: TokenGraph,
  emittedBase: string,
  native: ReturnType<typeof planNativeScheme>,
): PlannedTokenEmission['registration'] | undefined {
  const authored = node.contract.register
  if (authored === undefined || authored === false)
    return undefined
  const config = authored === true ? {} : authored as import('./types').VanityTokenRegistration
  const syntax = config.syntax ?? getPropertySyntax(node.contract.type)
  const inherits = config.inherits ?? true

  if (native?.definition.native?.locality === 'element' && syntax !== '*') {
    assertValidTrait(
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
    assertValidTrait(
      node.key,
      'register.initialVal',
      `typed @property syntax '${syntax}' requires a computationally independent initialVal`,
    )
  }
  if (initialValue !== undefined && !isComputationallyIndependent(initialValue)) {
    assertValidTrait(
      node.key,
      'register.initialVal',
      'use a computationally independent initial value without var(), environment dependencies, or relative units',
    )
  }

  return { syntax, inherits, ...(initialValue === undefined ? {} : { initialValue }) }
}

function getPropertySyntax(type: import('../values/types').VanityCssDataType): string {
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

function getBranchSlot(prefix: string, node: TokenNode, branch: TokenBranch): string {
  return branch.kind === 'axis'
    ? createPrivateAddress(prefix, node.key, `axis:${branch.axis}:${branch.mode}`)
    : createPrivateAddress(prefix, node.key, `case:${Object.entries(branch.when).map(([axis, mode]) => `${axis}:${mode}`).join('|')}`)
}

function hasMutableSlots(node: TokenNode): boolean {
  return node.contract.canonical && node.contract.mutable
}

function createPrivateAddress(prefix: string, token: string, address: string): string {
  let hash = 2166136261
  for (const char of `${token}\0${address}`) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `--${prefix}-v-${(hash >>> 0).toString(36)}`
}

export function getPhaseLayer(
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
    assertValidTrait(
      node.key,
      'axes',
      `mutable bindings must compute on their effective root; '${arm.placement}' placement would move slot substitution elsewhere`,
    )
  }
}

function getCaseArms(
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
      assertValidTrait(node.key, `cases.when.${axis}`, 'reference a declared axis mode')
    if (trigger.arms.length === 0) {
      assertValidTrait(
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

function throwTokenModuleError(
  code: Extract<VanityDiagnosticCode, `VANITY_TOKENS_${string}`>,
  message: string,
  path: string | readonly string[],
  fix: string,
): never {
  throw new VanityError({ code, message, path, fix })
}
