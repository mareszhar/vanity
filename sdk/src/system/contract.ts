/** Pure in-process system contract and its validated data-only compiler projection. */

import type { VanityTokenRecord } from '../introspect/records'
import type { VanityRuntimeContract } from '../runtime/contract'
import type { VanityHandleMeta } from '../tokens/handle'
import type {
  VanityPolicyJson,
  VanityResolvedPolicies,
} from '../values/policies'
import type { VanityAxisRegistryDescription } from './axes'
import type { VanityConditionArm, VanityConditionAst } from './conditions'
import { VanityError } from '../diagnostics'
import { assertPortableSystemShape } from './contractValidation'

export const VANITY_PORTABLE_SYSTEM_FORMAT = 'vanity.system/2' as const
export const VANITY_IN_PROCESS_SYSTEM = Symbol.for('vanity.inProcessSystem')

/** Deterministic identities for the contract's compatibility, CSS, runtime, and docs projections. */
export interface VanitySystemIdentities {
  /** Identity of the authoring capability and policy projection. */
  readonly compatibility: `vanity-compatibility-1-${string}`
  /** Identity of the emitted CSS projection. */
  readonly css: `vanity-css-1-${string}`
  /** Identity of the runtime projection. */
  readonly runtime: `vanity-runtime-schema-1-${string}`
  /** Identity of the introspection and documentation projection. */
  readonly docs: `vanity-docs-1-${string}`
}

/** Provenance for an additive refinement or replacement of named system data. */
export interface VanityOverwriteProvenance {
  /** System facet that received the operation. */
  readonly kind: 'tokens' | 'axis' | 'conditions' | 'consts' | 'rules'
  /** Additive token refinements remain distinguishable from intentional replacement. */
  readonly operation: 'augment' | 'overwrite'
  /** Paths affected by the operation. */
  readonly paths: readonly string[]
  /** Optional source label supplied by the authoring integration. */
  readonly source?: string
}

/** Identifies which built-in, system, plugin, or extension owns a capability. */
export type VanityCapabilityOrigin
  = | { readonly kind: 'builtin' }
    | { readonly kind: 'system' }
    | { readonly kind: 'plugin', readonly id: string }
    | { readonly kind: 'extension', readonly id: string, readonly version: string }

/** Constructor capability recorded in the portable contract. */
export interface VanityPortableConstructor {
  /** Public constructor name. */
  readonly name: string
  /** Capability owner used for diagnostics and portability checks. */
  readonly origin: VanityCapabilityOrigin
}

/** Extension identity carried by a portable system contract. */
export interface VanityPortableExtension {
  /** Stable extension id. */
  readonly id: string
  /** Extension release version. */
  readonly version: string
  /** Optional deterministic extension fingerprint. */
  readonly fingerprint?: string
}

/** Value and constructor capabilities required to interpret a portable system. */
export interface VanityPortableCapabilities {
  /** Deterministic capability signature. */
  readonly signature: string
  /** CSS feature target used when serializing values. */
  readonly supportTarget: string
  /** Constructors available to the system. */
  readonly constructors: readonly VanityPortableConstructor[]
  /** Extensions available to the system. */
  readonly extensions: readonly VanityPortableExtension[]
}

type VanityJsonify<Value> = Value extends readonly (infer Item)[]
  ? readonly VanityJsonify<Item>[]
  : Value extends object
    ? { readonly [Key in keyof Value]: VanityJsonify<Value[Key]> }
    : Value

/**
 * JSON-normalized policy projection carried by the portable system contract.
 * The support target is runtime capability data and is represented by
 * `capabilities.supportTarget`, so it is intentionally not serialized here.
 */
export interface VanityPortablePolicies {
  /** Constructor restrictions and unit defaults. */
  readonly constructors: VanityJsonify<VanityResolvedPolicies['constructors']>
  /** Deterministic cascade-layer order. */
  readonly layerOrder: VanityJsonify<VanityResolvedPolicies['layerOrder']>
  /** Token reference and emission defaults. */
  readonly tokens: VanityJsonify<VanityResolvedPolicies['tokens']>
  /** JSON-safe plugin policies keyed by plugin id. */
  readonly plugins: VanityJsonify<VanityResolvedPolicies['plugins']>
  /** Extension policy values owned outside the core groups. */
  readonly [customPolicy: string]: VanityPolicyJson
}

/** JSON-safe compiler contract consumed by introspection, runtimes, and integrations. */
export interface VanityPortableSystem {
  /** Portable wire-format discriminator. */
  readonly format: typeof VANITY_PORTABLE_SYSTEM_FORMAT
  /** Optional source file or package that declared the system. */
  readonly source?: string
  /** Custom-property and class-name prefix. */
  readonly prefix: string
  /** Root selector for root-scoped output. */
  readonly root: string
  /** Layer receiving token declarations when configured. */
  readonly tokenLayer?: string
  /** Root layer name derived from the prefix. */
  readonly layerRoot: string
  /** Complete deterministic cascade-layer order. */
  readonly layers: readonly string[]
  /** Value and constructor capabilities needed to read this contract. */
  readonly capabilities: VanityPortableCapabilities
  /** JSON-normalized system policies. */
  readonly policies: VanityPortablePolicies
  /** Readable condition strings keyed by condition name. */
  readonly conditions: Readonly<Record<string, string>>
  /** Condition trigger arms keyed by condition name. */
  readonly conditionArms: Readonly<Record<string, readonly VanityConditionArm[]>>
  /** Condition ASTs keyed by condition name. */
  readonly conditionAsts: Readonly<Record<string, VanityConditionAst>>
  /** Environmental-axis metadata, when the system declares axes. */
  readonly axes?: VanityAxisRegistryDescription
  /** Resolved token handle metadata. */
  readonly tokens: readonly VanityHandleMeta[]
  /** Semantic token records used by introspection and diagnostics. */
  readonly tokenRecords: readonly VanityTokenRecord[]
  /** Runtime root, axis, and mutable-token contract. */
  readonly runtime: VanityRuntimeContract
  /** JSON-safe constants exposed by the system. */
  readonly consts: Readonly<Record<string, unknown>>
  /** Dot paths of public utilities exposed by the system. */
  readonly utilities: readonly string[]
  /** Named rule groups and their selector fingerprints. */
  readonly ruleGroups: readonly {
    /** Stable rule-group name. */
    readonly name: string
    /** Optional human-readable rule-group description. */
    readonly description?: string
    /** Cascade layer receiving the group's rules. */
    readonly layer?: string
    /** Deterministic order within its layer. */
    readonly order?: number
    /** Selectors emitted by the rule group. */
    readonly selectors: readonly string[]
    /** Fingerprint of the group's normalized rules. */
    readonly fingerprint: string
  }[]
  /** Plugin ids mounted into the system. */
  readonly plugins: readonly string[]
  /** Ownership records for plugin-defined members. */
  readonly owners: Readonly<Record<string, { readonly kind: 'plugin', readonly id: string }>>
  /** Resolved audit level for each audit category. */
  readonly audits: Readonly<Record<string, 'off' | 'warn' | 'error'>>
  /** Ordered overwrite and augmentation provenance. */
  readonly overwrites: readonly VanityOverwriteProvenance[]
  /** Deterministic projection identities for consumers and cache keys. */
  readonly identities: VanitySystemIdentities
}

/** In-process contract pairing the portable data with its emission closure. */
export interface VanityInProcessSystemContract {
  /** Data-only contract safe to serialize or hand to another consumer. */
  readonly portable: VanityPortableSystem
  /** Compiler-only emission closure. Never copied into portable data. */
  readonly emit: () => void
}

type VanitySystemContractOptionalKey
  = | 'source'
    | 'tokenLayer'
    | 'axes'
    | 'consts'
    | 'utilities'
    | 'ruleGroups'
    | 'plugins'
    | 'owners'
    | 'audits'
    | 'overwrites'

export type VanitySystemContractInput = Omit<
  VanityPortableSystem,
  'format' | 'layerRoot' | 'identities' | VanitySystemContractOptionalKey
> & Partial<Pick<VanityPortableSystem, VanitySystemContractOptionalKey>> & {
  readonly emit: () => void
}

export function createSystemContract(input: VanitySystemContractInput): VanityInProcessSystemContract {
  const normalized = normalizeJson({
    format: VANITY_PORTABLE_SYSTEM_FORMAT,
    ...(input.source === undefined ? {} : { source: input.source }),
    prefix: input.prefix,
    root: input.root,
    ...(input.tokenLayer === undefined ? {} : { tokenLayer: input.tokenLayer }),
    layerRoot: input.prefix,
    layers: input.layers,
    capabilities: input.capabilities,
    policies: input.policies,
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
  }) as Omit<VanityPortableSystem, 'identities'>

  const identities = getSystemIdentities(normalized)
  const portable = freezeDeep({
    ...normalized,
    identities,
  }) as VanityPortableSystem

  // This object was normalized from the typed in-process input immediately
  // above and its identities were derived from those exact normalized bytes.
  // Re-running the external trust-boundary validator here would traverse and
  // hash a large resolved token structure a second time during every consolidation.
  return Object.freeze({ portable, emit: input.emit })
}

export function getSystemContract(value: unknown): VanityInProcessSystemContract | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    return undefined
  return (value as { readonly [VANITY_IN_PROCESS_SYSTEM]?: VanityInProcessSystemContract })[VANITY_IN_PROCESS_SYSTEM]
}

export function assertPortableSystem(value: unknown): asserts value is VanityPortableSystem {
  assertPortableSystemShape(value, VANITY_PORTABLE_SYSTEM_FORMAT)
  const normalized = normalizeJson(value)
  const candidate = normalized as VanityPortableSystem
  const identityKinds = ['compatibility', 'css', 'runtime', 'docs'] as const
  if (Object.keys(candidate.identities).sort().join('\0') !== [...identityKinds].sort().join('\0')) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_INCOMPATIBLE',
      message: 'portable system artifact must contain exactly four projection identities',
      path: ['identities'],
      fix: 'regenerate the portable system artifact with the current Vanity version',
    })
  }
  for (const kind of identityKinds) {
    const id = candidate.identities[kind]
    if (typeof id !== 'string' || !id.startsWith(`vanity-${kind === 'runtime' ? 'runtime-schema' : kind}-1-`)) {
      throw new VanityError({
        code: 'VANITY_SYSTEM_INCOMPATIBLE',
        message: `portable system artifact has an invalid ${kind} identity`,
        path: ['identities', kind],
        fix: 'regenerate the portable system artifact with the current Vanity version',
      })
    }
  }

  const portable = normalized as VanityPortableSystem
  const { identities: actual, ...body } = portable
  const expected = getSystemIdentities(body)
  for (const kind of identityKinds) {
    if (actual[kind] !== expected[kind]) {
      throw new VanityError({
        code: 'VANITY_SYSTEM_INCOMPATIBLE',
        message: `portable system artifact ${kind} identity does not match its normalized projection`,
        path: ['identities', kind],
        fix: 'regenerate the portable system artifact without editing its identity fields',
      })
    }
  }
}

export function serializePortableSystem(value: VanityPortableSystem): string {
  assertPortableSystem(value)
  return `${JSON.stringify(value, null, 2)}\n`
}

function getSystemIdentities(
  normalized: Omit<VanityPortableSystem, 'identities'>,
): VanitySystemIdentities {
  const compatibilityProjection = {
    capabilities: normalized.capabilities,
    policies: normalized.policies,
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
    tokens: normalized.tokens.map(projectRuntimeToken),
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
    compatibility: createIdentity('compatibility', compatibilityProjection),
    css: createIdentity('css', cssProjection),
    runtime: createIdentity('runtime-schema', runtimeProjection),
    docs: createIdentity('docs', docsProjection),
  })
}

function createIdentity<Kind extends 'compatibility' | 'css' | 'runtime-schema' | 'docs'>(
  kind: Kind,
  projection: unknown,
): `vanity-${Kind}-1-${string}` {
  return `vanity-${kind}-1-${hashFnv1a(JSON.stringify(normalizeJson(projection)))}` as const
}

/**
 * Only data that can change app/SSR behavior participates in runtime identity.
 * Build-only token values remain in CSS; documentation never dirties a runtime
 * projection. Value-referenced handles are the exception because their value is
 * returned directly by restored application-handle calls.
 */
export function projectRuntimeToken(token: VanityHandleMeta): VanityHandleMeta {
  return {
    name: token.name,
    path: token.path,
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

function hashFnv1a(value: string): string {
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
    if (!Number.isFinite(value)) {
      throw new VanityError({
        code: 'VANITY_SYSTEM_INVALID_DEFINITION',
        message: 'portable system data cannot contain non-finite numbers',
        path: ['portable'],
        fix: 'replace NaN and Infinity with finite JSON numbers',
      })
    }
    return Object.is(value, -0) ? 0 : value
  }
  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    throw new VanityError({
      code: 'VANITY_SYSTEM_INVALID_DEFINITION',
      message: `portable system data cannot contain ${typeof value} values`,
      path: ['portable'],
      fix: 'keep portable system data JSON-compatible',
    })
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new VanityError({
        code: 'VANITY_SYSTEM_INVALID_DEFINITION',
        message: 'portable system data cannot contain cycles',
        path: ['portable'],
        fix: 'remove the cyclic reference before serializing the portable system',
      })
    }
    ancestors.add(value)
    const result = value.map(child => normalizeJson(child, ancestors))
    ancestors.delete(value)
    return result
  }

  const object = value as Record<string, unknown>
  const prototype = Object.getPrototypeOf(object)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_INVALID_DEFINITION',
      message: 'portable system data must contain only plain objects and arrays',
      path: ['portable'],
      fix: 'copy class instances into plain objects before serializing the portable system',
    })
  }
  if (ancestors.has(object)) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_INVALID_DEFINITION',
      message: 'portable system data cannot contain cycles',
      path: ['portable'],
      fix: 'remove the cyclic reference before serializing the portable system',
    })
  }
  ancestors.add(object)
  const result = Object.fromEntries(Object.entries(object)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, normalizeJson(child, ancestors)]))
  ancestors.delete(object)
  return result
}

function freezeDeep<T>(value: T): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || Object.isFrozen(value))
    return value
  for (const child of Object.values(value as Record<string, unknown>))
    freezeDeep(child)
  return Object.freeze(value)
}
