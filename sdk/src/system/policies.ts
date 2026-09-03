import type { VanityCssSupportTarget } from '../values/protocol'
import type { VanityLengthUnit } from '../values/units'
import { VANITY_DEFAULT_CSS_SUPPORT } from '../values/protocol'

export type VanityPolicyJson
  = | string
    | number
    | boolean
    | null
    | readonly VanityPolicyJson[]
    | { readonly [key: string]: VanityPolicyJson }

export interface VanityConstructorRestriction {
  readonly level: 'forbid' | 'discourage'
  readonly use?: string
  readonly reason?: string
  readonly enforce?: 'prospective' | 'retroactive'
}

export interface VanityConstructorPolicy {
  readonly unitless?: VanityLengthUnit
  readonly restrict?: VanityConstructorRestriction
  readonly description?: string
}

export type VanityConstructorPolicies = Readonly<Record<string, VanityConstructorPolicy>>

export interface VanityTokenPolicies {
  readonly reference?: 'var' | 'val'
  readonly emit?: boolean
}

/** Authored policy. Omitted known leaves are resolved by `resolvePolicies`. */
export interface VanityPolicies {
  readonly constructors?: VanityConstructorPolicies
  readonly support?: VanityCssSupportTarget
  readonly layerOrder?: readonly string[]
  readonly tokens?: VanityTokenPolicies
  readonly plugins?: Readonly<Record<string, VanityPolicyJson>>
  readonly [customPolicy: string]: unknown
}

/** Canonical policy used by bound constructors, resolution, and contracts. */
export interface VanityResolvedPolicies extends Omit<VanityPolicies, 'constructors' | 'support' | 'layerOrder' | 'tokens' | 'plugins'> {
  readonly constructors: VanityConstructorPolicies
  readonly support: VanityCssSupportTarget
  readonly layerOrder: readonly string[]
  readonly tokens: {
    readonly reference: 'var' | 'val'
    readonly emit: boolean
  }
  readonly plugins: Readonly<Record<string, VanityPolicyJson>>
}

const KNOWN_POLICY_GROUPS = new Set(['constructors', 'support', 'layerOrder', 'tokens', 'plugins'])
const TOKEN_POLICY_KEYS = new Set(['reference', 'emit'])

export function createPolicyState(): VanityPolicies {
  return Object.freeze({})
}

export function resolvePolicies(
  authored: VanityPolicies = createPolicyState(),
  defaults: {
    readonly support?: VanityCssSupportTarget
    readonly layerOrder?: readonly string[]
  } = {},
): VanityResolvedPolicies {
  validatePolicies(authored)
  const custom = Object.fromEntries(Object.entries(authored)
    .filter(([name]) => !KNOWN_POLICY_GROUPS.has(name))
    .sort(([left], [right]) => left.localeCompare(right)))
  return freezeDeep({
    ...custom,
    constructors: authored.constructors ?? {},
    support: authored.support ?? defaults.support ?? VANITY_DEFAULT_CSS_SUPPORT,
    layerOrder: Object.freeze([...(authored.layerOrder ?? defaults.layerOrder ?? [])]),
    tokens: {
      reference: authored.tokens?.reference ?? 'var',
      emit: authored.tokens?.emit ?? true,
    },
    plugins: authored.plugins ?? {},
  }) as VanityResolvedPolicies
}

export function addPolicy(
  current: VanityPolicies,
  key: string,
  value: unknown,
): VanityPolicies {
  if (Object.hasOwn(current, key))
    throw new TypeError(`[vanity] addPolicy() cannot replace existing policy '${key}'; use overwritePolicy()`)
  return addPolicies(current, { [key]: value })
}

export function addPolicies(
  current: VanityPolicies,
  patch: VanityPolicies,
): VanityPolicies {
  validatePolicies(patch)
  return mergePolicies(current, patch, 'add')
}

export function overwritePolicy(
  current: VanityPolicies,
  key: string,
  value: unknown,
): VanityPolicies {
  if (!Object.hasOwn(current, key))
    throw new TypeError(`[vanity] overwritePolicy() cannot replace unknown policy '${key}'; use addPolicy()`)
  validatePolicies({ [key]: value } as VanityPolicies)
  return Object.freeze({ ...current, [key]: value })
}

export function overwritePolicies(
  current: VanityPolicies,
  patch: VanityPolicies,
): VanityPolicies {
  validatePolicies(patch)
  return mergePolicies(current, patch, 'overwrite')
}

export function expectPolicy(current: VanityPolicies, key: string): void {
  if (!Object.hasOwn(current, key))
    throw new TypeError(`[vanity] expected policy '${key}' is unavailable; add it earlier`)
}

export function expectPolicies(current: VanityPolicies, patch: VanityPolicies): void {
  for (const key of Object.keys(patch)) {
    if (!Object.hasOwn(current, key))
      throw new TypeError(`[vanity] expected policy '${key}' is unavailable; add it earlier`)
    if (isPlainRecord(patch[key]) && isPlainRecord(current[key]))
      expectPolicyLeaves(current[key] as Record<string, unknown>, patch[key] as Record<string, unknown>, [key])
  }
}

export function validatePolicies(policies: VanityPolicies): void {
  for (const key of Object.keys(policies)) {
    if (KNOWN_POLICY_GROUPS.has(key))
      continue
    validateJsonValue(policies[key], [key])
  }

  if (policies.layerOrder !== undefined) {
    if (!Array.isArray(policies.layerOrder)
      || policies.layerOrder.length === 0
      || policies.layerOrder.some(layer => typeof layer !== 'string' || !layer.trim())
      || new Set(policies.layerOrder).size !== policies.layerOrder.length) {
      throw new TypeError('[vanity] layerOrder policy needs at least one non-empty layer name')
    }
  }

  if (policies.support !== undefined)
    validateSupportPolicy(policies.support)

  if (policies.tokens !== undefined) {
    if (!isPlainRecord(policies.tokens))
      throw new TypeError('[vanity] tokens policy must be a plain object')
    for (const key of Object.keys(policies.tokens)) {
      if (!TOKEN_POLICY_KEYS.has(key))
        throw new TypeError(`[vanity] unknown tokens policy '${key}'; use reference or emit`)
    }
    if (policies.tokens.reference !== undefined && !['var', 'val'].includes(policies.tokens.reference as string))
      throw new TypeError('[vanity] tokens.reference policy must be \'var\' or \'val\'')
    if (policies.tokens.emit !== undefined && typeof policies.tokens.emit !== 'boolean')
      throw new TypeError('[vanity] tokens.emit policy must be boolean')
  }

  if (policies.plugins !== undefined) {
    if (!isPlainRecord(policies.plugins))
      throw new TypeError('[vanity] plugins policy must be a plain object')
    for (const [id, value] of Object.entries(policies.plugins))
      validateJsonValue(value, ['plugins', id])
  }

  if (policies.constructors !== undefined) {
    if (!isPlainRecord(policies.constructors))
      throw new TypeError('[vanity] constructors policy must be a plain object')
    for (const [name, value] of Object.entries(policies.constructors))
      validateConstructorPolicy(name, value)
  }
}

function mergePolicies(
  current: VanityPolicies,
  patch: VanityPolicies,
  mode: 'add' | 'overwrite',
): VanityPolicies {
  const merged = mergePolicyRecord(current as Record<string, unknown>, patch as Record<string, unknown>, mode, [])
  return freezeDeep(merged) as VanityPolicies
}

function mergePolicyRecord(
  current: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
  mode: 'add' | 'overwrite',
  path: readonly string[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    const nextPath = [...path, key]
    if (!Object.hasOwn(current, key)) {
      merged[key] = value
      continue
    }
    const existing = current[key]
    if (isPlainRecord(existing) && isPlainRecord(value)) {
      merged[key] = mergePolicyRecord(existing, value, mode, nextPath)
      continue
    }
    if (mode === 'add')
      throw new TypeError(`[vanity] addPolicies() cannot replace existing policy '${nextPath.join('.')}'; use overwritePolicy()`)
    merged[key] = value
  }
  return merged
}

function expectPolicyLeaves(
  current: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>>,
  path: readonly string[],
): void {
  for (const [key, value] of Object.entries(expected)) {
    const nextPath = [...path, key]
    if (!Object.hasOwn(current, key))
      throw new TypeError(`[vanity] expected policy '${nextPath.join('.')}' is unavailable; add it earlier`)
    if (isPlainRecord(value) && isPlainRecord(current[key]))
      expectPolicyLeaves(current[key] as Record<string, unknown>, value, nextPath)
  }
}

function validateConstructorPolicy(name: string, value: unknown): void {
  if (!isPlainRecord(value))
    throw new TypeError(`[vanity] constructor policy '${name}' must be a plain object`)
  assertKnownKeys(value, ['unitless', 'restrict', 'description'], `constructor policy '${name}'`)
  if (value.unitless !== undefined && typeof value.unitless !== 'string')
    throw new TypeError(`[vanity] constructor policy '${name}.unitless' must be a unit name`)
  if (value.description !== undefined && typeof value.description !== 'string')
    throw new TypeError(`[vanity] constructor policy '${name}.description' must be a string`)
  if (value.restrict !== undefined) {
    if (!isPlainRecord(value.restrict) || !['forbid', 'discourage'].includes(String(value.restrict.level)))
      throw new TypeError(`[vanity] constructor policy '${name}.restrict.level' must be 'forbid' or 'discourage'`)
    assertKnownKeys(value.restrict, ['level', 'use', 'reason', 'enforce'], `constructor policy '${name}.restrict'`)
    if (value.restrict.enforce !== undefined && !['prospective', 'retroactive'].includes(String(value.restrict.enforce)))
      throw new TypeError(`[vanity] constructor policy '${name}.restrict.enforce' must be 'prospective' or 'retroactive'`)
    if (value.restrict.use !== undefined && typeof value.restrict.use !== 'string')
      throw new TypeError(`[vanity] constructor policy '${name}.restrict.use' must be a string`)
    if (value.restrict.reason !== undefined && typeof value.restrict.reason !== 'string')
      throw new TypeError(`[vanity] constructor policy '${name}.restrict.reason' must be a string`)
  }
}

function validateSupportPolicy(value: VanityCssSupportTarget): void {
  if (!isPlainRecord(value) || typeof value.id !== 'string' || value.id.trim().length === 0)
    throw new TypeError('[vanity] support policy needs a stable non-empty id and feature set')
  assertKnownKeys(value, ['id', 'features'], 'support policy')
  if (value.features === undefined || typeof value.features !== 'object'
    || typeof value.features[Symbol.iterator] !== 'function') {
    throw new TypeError('[vanity] support policy features must be an iterable feature set')
  }
  for (const feature of value.features) {
    if (typeof feature !== 'string')
      throw new TypeError('[vanity] support policy features must contain strings')
  }
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedKeys = new Set(allowed)
  const unknown = Object.keys(value).find(key => !allowedKeys.has(key))
  if (unknown !== undefined)
    throw new TypeError(`[vanity] ${label} contains unknown key '${unknown}'`)
}

function validateJsonValue(value: unknown, path: readonly string[], ancestors = new WeakSet<object>()): asserts value is VanityPolicyJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError(`[vanity] policy '${path.join('.')}' must contain finite numbers`)
    return
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value))
      throw new TypeError(`[vanity] policy '${path.join('.')}' cannot contain cycles`)
    ancestors.add(value)
    value.forEach((child, index) => validateJsonValue(child, [...path, String(index)], ancestors))
    ancestors.delete(value)
    return
  }
  if (typeof value !== 'object' || value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
    throw new TypeError(`[vanity] policy '${path.join('.')}' must contain deterministic JSON values`)
  if (!isPlainRecord(value))
    throw new TypeError(`[vanity] policy '${path.join('.')}' must contain plain deterministic JSON objects`)
  if (ancestors.has(value))
    throw new TypeError(`[vanity] policy '${path.join('.')}' cannot contain cycles`)
  ancestors.add(value)
  for (const [key, child] of Object.entries(value))
    validateJsonValue(child, [...path, key], ancestors)
  ancestors.delete(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object')
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>))
      freezeDeep(child)
  }
  return value
}
