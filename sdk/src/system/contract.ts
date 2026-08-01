/** Pure in-process system contract and its validated data-only compiler projection. */

import type { VanityHandleMeta } from '../internal/handle'
import type { VanityTokenRecord } from '../internal/inspect'
import type { VanityAxisRegistryDescription } from './axes'
import type { VanityConditionArm, VanityConditionAst } from './conditions'
import type { VanityRuntimeContract } from './live'

export const VANITY_PORTABLE_SYSTEM_FORMAT = 'vanity.system/1' as const
export const VANITY_IN_PROCESS_SYSTEM = Symbol.for('vanity.inProcessSystem')

export interface VanitySystemIdentities {
  readonly compatibility: `vanity-compatibility-1-${string}`
  readonly css: `vanity-css-1-${string}`
  readonly runtime: `vanity-runtime-schema-1-${string}`
  readonly docs: `vanity-docs-1-${string}`
}

export interface VanityOverwriteProvenance {
  readonly kind: 'tokens' | 'axis' | 'conditions' | 'consts' | 'rules'
  /** Additive token refinements remain distinguishable from intentional replacement. */
  readonly operation: 'augment' | 'overwrite'
  readonly paths: readonly string[]
  readonly source?: string
}

export interface VanityPortableSystemV1 {
  readonly format: typeof VANITY_PORTABLE_SYSTEM_FORMAT
  readonly source?: string
  readonly prefix: string
  readonly root: string
  readonly tokenLayer?: string
  readonly layerRoot: string
  readonly layers: readonly string[]
  readonly engine: {
    readonly signature: string
    readonly supportTarget: string
    readonly policies: Readonly<Record<string, unknown>>
    readonly constructors: readonly string[]
    readonly extensions: readonly {
      readonly id: string
      readonly version: string
      readonly fingerprint?: string
    }[]
  }
  readonly conditions: Readonly<Record<string, string>>
  readonly conditionArms: Readonly<Record<string, readonly VanityConditionArm[]>>
  readonly conditionAsts: Readonly<Record<string, VanityConditionAst>>
  readonly axes?: VanityAxisRegistryDescription
  readonly tokens: readonly VanityHandleMeta[]
  readonly tokenRecords: readonly VanityTokenRecord[]
  readonly runtime: VanityRuntimeContract
  readonly consts: Readonly<Record<string, unknown>>
  readonly utilities: readonly string[]
  readonly ruleGroups: readonly {
    readonly name: string
    readonly description?: string
    readonly layer?: string
    readonly order?: number
    readonly selectors: readonly string[]
    readonly fingerprint: string
  }[]
  readonly plugins: readonly string[]
  readonly owners: Readonly<Record<string, { readonly kind: 'plugin', readonly id: string }>>
  readonly audits: Readonly<Record<string, 'off' | 'warn' | 'error'>>
  readonly overwrites: readonly VanityOverwriteProvenance[]
  readonly identities: VanitySystemIdentities
}

export interface VanityInProcessSystemContract {
  readonly portable: VanityPortableSystemV1
  /** Compiler-only emission closure. Never copied into portable data. */
  readonly emit: () => void
}

export interface VanitySystemContractInput {
  readonly source?: string
  readonly prefix: string
  readonly root: string
  readonly tokenLayer?: string
  readonly layers: readonly string[]
  readonly engine: VanityPortableSystemV1['engine']
  readonly conditions: Readonly<Record<string, string>>
  readonly conditionArms: Readonly<Record<string, readonly VanityConditionArm[]>>
  readonly conditionAsts: Readonly<Record<string, VanityConditionAst>>
  readonly axes?: VanityAxisRegistryDescription
  readonly tokens: readonly VanityHandleMeta[]
  readonly tokenRecords: readonly VanityTokenRecord[]
  readonly runtime: VanityRuntimeContract
  readonly consts?: Readonly<Record<string, unknown>>
  readonly utilities?: readonly string[]
  readonly ruleGroups?: VanityPortableSystemV1['ruleGroups']
  readonly plugins?: readonly string[]
  readonly owners?: Readonly<Record<string, { readonly kind: 'plugin', readonly id: string }>>
  readonly audits?: Readonly<Record<string, 'off' | 'warn' | 'error'>>
  readonly overwrites?: readonly VanityOverwriteProvenance[]
  readonly emit: () => void
}

export function createInProcessSystemContract(input: VanitySystemContractInput): VanityInProcessSystemContract {
  const normalized = normalizeJson({
    format: VANITY_PORTABLE_SYSTEM_FORMAT,
    ...(input.source === undefined ? {} : { source: input.source }),
    prefix: input.prefix,
    root: input.root,
    ...(input.tokenLayer === undefined ? {} : { tokenLayer: input.tokenLayer }),
    layerRoot: input.prefix,
    layers: input.layers,
    engine: input.engine,
    conditions: input.conditions,
    conditionArms: input.conditionArms,
    conditionAsts: input.conditionAsts,
    ...(input.axes === undefined ? {} : { axes: input.axes }),
    tokens: input.tokens,
    tokenRecords: input.tokenRecords,
    runtime: input.runtime,
    consts: input.consts ?? {},
    utilities: input.utilities ?? [],
    ruleGroups: input.ruleGroups ?? [],
    plugins: input.plugins ?? [],
    owners: input.owners ?? {},
    audits: input.audits ?? {},
    overwrites: input.overwrites ?? [],
  }) as Omit<VanityPortableSystemV1, 'identities'>

  const identities = systemIdentitiesOf(normalized)
  const portable = deepFreeze({
    ...normalized,
    identities,
  }) as VanityPortableSystemV1

  // This object was normalized from the typed in-process input immediately
  // above and its identities were derived from those exact normalized bytes.
  // Re-running the external trust-boundary validator here would traverse and
  // hash a large token graph a second time during every consolidation.
  return Object.freeze({ portable, emit: input.emit })
}

export function systemContractOf(value: unknown): VanityInProcessSystemContract | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    return undefined
  return (value as { readonly [VANITY_IN_PROCESS_SYSTEM]?: VanityInProcessSystemContract })[VANITY_IN_PROCESS_SYSTEM]
}

export function assertPortableSystem(value: unknown): asserts value is VanityPortableSystemV1 {
  if (!value || typeof value !== 'object')
    throw new TypeError('[vanity] portable system artifact must be an object')

  // This is also the trust-boundary walk: functions, class instances,
  // non-finite numbers, and cycles are rejected even if the top-level
  // discriminator looks plausible.
  const normalized = normalizeJson(value)
  const candidate = normalized as Partial<VanityPortableSystemV1>
  if (candidate.format !== VANITY_PORTABLE_SYSTEM_FORMAT)
    throw new TypeError(`[vanity] unsupported portable system format '${String(candidate.format)}'`)
  if (
    typeof candidate.prefix !== 'string'
    || typeof candidate.root !== 'string'
    || typeof candidate.layerRoot !== 'string'
    || !Array.isArray(candidate.layers)
    || !Array.isArray(candidate.tokens)
    || !Array.isArray(candidate.tokenRecords)
    || !Array.isArray(candidate.overwrites)
    || !candidate.engine
    || typeof candidate.engine.signature !== 'string'
    || typeof candidate.engine.supportTarget !== 'string'
    || !Array.isArray(candidate.engine.constructors)
    || !candidate.conditions
    || !candidate.conditionArms
    || !candidate.conditionAsts
    || !candidate.consts
    || !Array.isArray(candidate.utilities)
    || !Array.isArray(candidate.ruleGroups)
    || !candidate.owners
    || !candidate.audits
    || !candidate.runtime
    || candidate.runtime.protocol !== 2
    || !Array.isArray(candidate.runtime.roots)
    || !Array.isArray(candidate.runtime.tokens)
    || !candidate.identities
  ) {
    throw new TypeError('[vanity] portable system artifact is missing required system fields')
  }
  if (
    candidate.tokens.some(token =>
      typeof token.path !== 'string'
      || typeof token.name !== 'string'
      || !token.name.startsWith('--'))
    || candidate.tokenRecords.some(token =>
      typeof token.path !== 'string'
      || typeof token.var !== 'string')
  ) {
    throw new TypeError('[vanity] portable system artifact contains malformed token records')
  }
  const identityKinds = ['compatibility', 'css', 'runtime', 'docs'] as const
  if (Object.keys(candidate.identities).sort().join('\0') !== [...identityKinds].sort().join('\0'))
    throw new TypeError('[vanity] portable system artifact must contain exactly four projection identities')
  for (const kind of identityKinds) {
    const id = candidate.identities[kind]
    if (typeof id !== 'string' || !id.startsWith(`vanity-${kind === 'runtime' ? 'runtime-schema' : kind}-1-`))
      throw new TypeError(`[vanity] portable system artifact has an invalid ${kind} identity`)
  }

  const portable = normalized as VanityPortableSystemV1
  const { identities: actual, ...body } = portable
  const expected = systemIdentitiesOf(body)
  for (const kind of identityKinds) {
    if (actual[kind] !== expected[kind]) {
      throw new TypeError(
        `[vanity] portable system artifact ${kind} identity does not match its normalized projection`,
      )
    }
  }
}

export function portableSystemJson(value: VanityPortableSystemV1): string {
  assertPortableSystem(value)
  return `${JSON.stringify(value, null, 2)}\n`
}

function systemIdentitiesOf(
  normalized: Omit<VanityPortableSystemV1, 'identities'>,
): VanitySystemIdentities {
  const compatibilityProjection = {
    engine: normalized.engine,
    prefix: normalized.prefix,
    root: normalized.root,
    layers: normalized.layers,
    conditions: Object.keys(normalized.conditions),
    conditionArms: normalized.conditionArms,
    conditionAsts: normalized.conditionAsts,
    axes: normalized.axes,
    plugins: normalized.plugins,
    utilities: normalized.utilities,
    ruleGroups: normalized.ruleGroups,
    tokens: normalized.tokens.map(token => ({
      path: token.path,
      type: token.type,
      reference: token.reference,
      emit: token.emit,
      mutable: token.mutable,
      axes: Object.keys(token.axes ?? {}).sort(),
      cases: token.cases?.map(entry => entry.when) ?? [],
    })),
    overwrites: normalized.overwrites,
  }
  const cssProjection = {
    prefix: normalized.prefix,
    root: normalized.root,
    tokenLayer: normalized.tokenLayer,
    layers: normalized.layers,
    conditions: normalized.conditionArms,
    conditionAsts: normalized.conditionAsts,
    axes: normalized.axes,
    ruleGroups: normalized.ruleGroups,
    tokens: normalized.tokenRecords.map(token => ({
      path: token.path,
      var: token.var,
      root: token.root,
      layer: token.layer,
      css: token.css,
      upgrade: token.upgrade,
      declarations: token.semantic.declarations,
      branches: token.semantic.branches,
      registration: token.semantic.registration,
    })),
  }
  const runtimeProjection = {
    contract: {
      protocol: normalized.runtime.protocol,
      system: normalized.runtime.system,
      prefix: normalized.runtime.prefix,
      root: normalized.runtime.root,
      axisOrder: normalized.runtime.axisOrder,
      axes: normalized.runtime.axes,
      roots: normalized.runtime.roots,
      tokens: normalized.runtime.tokens.map(token => ({
        token: token.token,
        name: token.name,
        rootPath: token.rootPath,
        root: token.root,
        scopes: token.scopes,
        type: token.type,
        reference: token.reference,
        emit: token.emit,
        mutable: token.mutable,
        validation: token.validation,
        baseSlot: token.baseSlot,
        branches: token.branches.map(branch => ({
          address: branch.address,
          slot: branch.slot,
        })),
      })),
    },
    consts: normalized.consts,
    tokens: normalized.tokens.map(runtimeTokenProjection),
  }
  const docsProjection = {
    source: normalized.source,
    consts: normalized.consts,
    utilities: normalized.utilities,
    ruleGroups: normalized.ruleGroups,
    plugins: normalized.plugins,
    owners: normalized.owners,
    audits: normalized.audits,
    overwrites: normalized.overwrites,
    tokens: normalized.tokenRecords.map(token => ({
      path: token.path,
      description: token.description,
      deprecated: token.deprecated,
      metadata: token.semantic.metadata,
    })),
  }
  return Object.freeze({
    compatibility: identity('compatibility', compatibilityProjection),
    css: identity('css', cssProjection),
    runtime: identity('runtime-schema', runtimeProjection),
    docs: identity('docs', docsProjection),
  })
}

function identity<Kind extends 'compatibility' | 'css' | 'runtime-schema' | 'docs'>(
  kind: Kind,
  projection: unknown,
): `vanity-${Kind}-1-${string}` {
  return `vanity-${kind}-1-${fnv1a(JSON.stringify(normalizeJson(projection)))}` as const
}

/**
 * Only data that can change app/SSR behavior participates in runtime identity.
 * Build-only token values remain in CSS; documentation never dirties a runtime
 * facade. Value-referenced handles are the exception because their value is
 * returned directly by app-plane handle calls.
 */
export function runtimeTokenProjection(token: VanityHandleMeta): VanityHandleMeta {
  return {
    name: token.name,
    path: token.path,
    mode: token.mode,
    ...(token.reference === undefined ? {} : { reference: token.reference }),
    ...(token.emit === undefined ? {} : { emit: token.emit }),
    ...(token.mutable === undefined ? {} : { mutable: token.mutable }),
    ...(token.type === undefined ? {} : { type: token.type }),
    ...(token.reference === 'val' && token.value !== undefined ? { value: token.value } : {}),
    ...(token.runtime === undefined ? {} : { runtime: token.runtime }),
    ...(token.axes === undefined
      ? {}
      : {
          axes: Object.fromEntries(Object.entries(token.axes).map(([axis, modes]) => [
            axis,
            Object.fromEntries(Object.entries(modes).map(([mode, branch]) => [
              mode,
              {
                ...(token.reference === 'val' && branch.value !== undefined ? { value: branch.value } : {}),
                ...(branch.runtime === undefined ? {} : { runtime: branch.runtime }),
              },
            ])),
          ])),
        }),
    ...(token.cases === undefined
      ? {}
      : {
          cases: token.cases.map(branch => ({
            when: branch.when,
            ...(token.reference === 'val' && branch.value !== undefined ? { value: branch.value } : {}),
            ...(branch.runtime === undefined ? {} : { runtime: branch.runtime }),
          })),
        }),
  }
}

function fnv1a(value: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function normalizeJson(value: unknown, ancestors = new WeakSet<object>()): any {
  if (value === undefined)
    return undefined
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('[vanity] portable system data cannot contain non-finite numbers')
    return Object.is(value, -0) ? 0 : value
  }
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function')
    throw new TypeError(`[vanity] portable system data cannot contain ${typeof value} values`)
  if (Array.isArray(value)) {
    if (ancestors.has(value))
      throw new TypeError('[vanity] portable system data cannot contain cycles')
    ancestors.add(value)
    const result = value.map(child => normalizeJson(child, ancestors))
    ancestors.delete(value)
    return result
  }

  const object = value as Record<string, unknown>
  const prototype = Object.getPrototypeOf(object)
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError('[vanity] portable system data must contain only plain objects and arrays')
  if (ancestors.has(object))
    throw new TypeError('[vanity] portable system data cannot contain cycles')
  ancestors.add(object)
  const result = Object.fromEntries(Object.entries(object)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, normalizeJson(child, ancestors)]))
  ancestors.delete(object)
  return result
}

function deepFreeze<T>(value: T): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || Object.isFrozen(value))
    return value
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child)
  return Object.freeze(value)
}
