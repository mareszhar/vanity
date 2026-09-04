import type { VanityDiagnosticCode } from '../diagnostics'
import type {
  VanityPolicies,
  VanityPolicyJson,
  VanityResolvedPolicies,
} from '../values/policies'
import type { VanityCssSupportTarget } from '../values/protocol'
import { VanityError } from '../diagnostics'
import { VANITY_DEFAULT_CSS_SUPPORT } from '../values/protocol'

export type {
  VanityConstructorPolicies,
  VanityConstructorPolicy,
  VanityConstructorRestriction,
  VanityPolicies,
  VanityPolicyJson,
  VanityResolvedPolicies,
  VanityTokenPolicies,
} from '../values/policies'

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
  if (Object.hasOwn(current, key)) {
    throwPolicyError(
      'VANITY_POLICY_CONFLICT',
      `addPolicy() cannot replace existing policy '${key}'`,
      key,
      'use overwritePolicy() when replacing an existing policy',
    )
  }
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
  if (!Object.hasOwn(current, key)) {
    throwPolicyError(
      'VANITY_POLICY_CONFLICT',
      `overwritePolicy() cannot replace unknown policy '${key}'`,
      key,
      'use addPolicy() when introducing a new policy',
    )
  }
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
  if (!Object.hasOwn(current, key)) {
    throwPolicyError(
      'VANITY_POLICY_MISSING',
      `expected policy '${key}' is unavailable`,
      key,
      'add the policy before calling expectPolicy()',
    )
  }
}

export function expectPolicies(current: VanityPolicies, patch: VanityPolicies): void {
  for (const key of Object.keys(patch)) {
    if (!Object.hasOwn(current, key)) {
      throwPolicyError(
        'VANITY_POLICY_MISSING',
        `expected policy '${key}' is unavailable`,
        key,
        'add the policy before calling expectPolicies()',
      )
    }
    if (isPlainRecord(patch[key]) && isPlainRecord(current[key]))
      expectPolicyLeaves(current[key] as Record<string, unknown>, patch[key] as Record<string, unknown>, [key])
  }
}

function validatePolicies(policies: VanityPolicies): void {
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
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        'layerOrder policy needs at least one non-empty, unique layer name',
        'layerOrder',
        'provide a non-empty layerOrder array with each layer named exactly once',
      )
    }
  }

  if (policies.support !== undefined)
    validateSupportPolicy(policies.support)

  if (policies.tokens !== undefined) {
    if (!isPlainRecord(policies.tokens)) {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        'tokens policy must be a plain object',
        'tokens',
        'provide an object containing only reference and emit',
      )
    }
    for (const key of Object.keys(policies.tokens)) {
      if (!TOKEN_POLICY_KEYS.has(key)) {
        throwPolicyError(
          'VANITY_POLICY_INVALID',
          `unknown tokens policy '${key}'`,
          ['tokens', key],
          'use the reference or emit policy key',
        )
      }
    }
    if (policies.tokens.reference !== undefined && !['var', 'val'].includes(policies.tokens.reference as string)) {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        'tokens.reference policy must be \'var\' or \'val\'',
        ['tokens', 'reference'],
        'set reference to \'var\' or \'val\'',
      )
    }
    if (policies.tokens.emit !== undefined && typeof policies.tokens.emit !== 'boolean') {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        'tokens.emit policy must be boolean',
        ['tokens', 'emit'],
        'set emit to true or false',
      )
    }
  }

  if (policies.plugins !== undefined) {
    if (!isPlainRecord(policies.plugins)) {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        'plugins policy must be a plain object',
        'plugins',
        'provide an object keyed by plugin id',
      )
    }
    for (const [id, value] of Object.entries(policies.plugins))
      validateJsonValue(value, ['plugins', id])
  }

  if (policies.constructors !== undefined) {
    if (!isPlainRecord(policies.constructors)) {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        'constructors policy must be a plain object',
        'constructors',
        'provide an object keyed by constructor name',
      )
    }
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
    if (mode === 'add') {
      throwPolicyError(
        'VANITY_POLICY_CONFLICT',
        `addPolicies() cannot replace existing policy '${nextPath.join('.')}'`,
        nextPath,
        'use overwritePolicies() when replacing an existing policy',
      )
    }
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
    if (!Object.hasOwn(current, key)) {
      throwPolicyError(
        'VANITY_POLICY_MISSING',
        `expected policy '${nextPath.join('.')}' is unavailable`,
        nextPath,
        'add the complete policy shape before calling expectPolicies()',
      )
    }
    if (isPlainRecord(value) && isPlainRecord(current[key]))
      expectPolicyLeaves(current[key] as Record<string, unknown>, value, nextPath)
  }
}

function validateConstructorPolicy(name: string, value: unknown): void {
  if (!isPlainRecord(value)) {
    throwPolicyError(
      'VANITY_POLICY_INVALID',
      `constructor policy '${name}' must be a plain object`,
      ['constructors', name],
      'provide a constructor policy object',
    )
  }
  assertKnownKeys(value, ['unitless', 'restrict', 'description'], `constructor policy '${name}'`)
  if (value.unitless !== undefined && typeof value.unitless !== 'string') {
    throwPolicyError(
      'VANITY_POLICY_INVALID',
      `constructor policy '${name}.unitless' must be a unit name`,
      ['constructors', name, 'unitless'],
      'set unitless to a CSS unit name such as rem',
    )
  }
  if (value.description !== undefined && typeof value.description !== 'string') {
    throwPolicyError(
      'VANITY_POLICY_INVALID',
      `constructor policy '${name}.description' must be a string`,
      ['constructors', name, 'description'],
      'set description to a human-readable string',
    )
  }
  if (value.restrict !== undefined) {
    if (!isPlainRecord(value.restrict) || !['forbid', 'discourage'].includes(String(value.restrict.level))) {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        `constructor policy '${name}.restrict.level' must be 'forbid' or 'discourage'`,
        ['constructors', name, 'restrict', 'level'],
        'set level to \'forbid\' or \'discourage\'',
      )
    }
    assertKnownKeys(value.restrict, ['level', 'use', 'reason', 'enforce'], `constructor policy '${name}.restrict'`)
    if (value.restrict.enforce !== undefined && !['prospective', 'retroactive'].includes(String(value.restrict.enforce))) {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        `constructor policy '${name}.restrict.enforce' must be 'prospective' or 'retroactive'`,
        ['constructors', name, 'restrict', 'enforce'],
        'set enforce to \'prospective\' or \'retroactive\'',
      )
    }
    if (value.restrict.use !== undefined && typeof value.restrict.use !== 'string') {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        `constructor policy '${name}.restrict.use' must be a string`,
        ['constructors', name, 'restrict', 'use'],
        'name the replacement constructor as a string',
      )
    }
    if (value.restrict.reason !== undefined && typeof value.restrict.reason !== 'string') {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        `constructor policy '${name}.restrict.reason' must be a string`,
        ['constructors', name, 'restrict', 'reason'],
        'describe why the constructor should be avoided',
      )
    }
  }
}

function validateSupportPolicy(value: VanityCssSupportTarget): void {
  if (!isPlainRecord(value) || typeof value.id !== 'string' || value.id.trim().length === 0) {
    throwPolicyError(
      'VANITY_POLICY_INVALID',
      'support policy needs a stable non-empty id and feature set',
      'support',
      'provide support: { id, features } with a non-empty id',
    )
  }
  assertKnownKeys(value, ['id', 'features'], 'support policy')
  if (value.features === undefined || typeof value.features !== 'object'
    || typeof value.features[Symbol.iterator] !== 'function') {
    throwPolicyError(
      'VANITY_POLICY_INVALID',
      'support policy features must be an iterable feature set',
      ['support', 'features'],
      'provide an iterable collection of CSS feature names',
    )
  }
  for (const feature of value.features) {
    if (typeof feature !== 'string') {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        'support policy features must contain strings',
        ['support', 'features'],
        'replace each feature entry with its string name',
      )
    }
  }
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedKeys = new Set(allowed)
  const unknown = Object.keys(value).find(key => !allowedKeys.has(key))
  if (unknown !== undefined) {
    throwPolicyError(
      'VANITY_POLICY_INVALID',
      `${label} contains unknown key '${unknown}'`,
      [label, unknown],
      `remove '${unknown}' or use one of: ${allowed.join(', ')}`,
    )
  }
}

function validateJsonValue(value: unknown, path: readonly string[], ancestors = new WeakSet<object>()): asserts value is VanityPolicyJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        `policy '${path.join('.')}' must contain finite numbers`,
        path,
        'replace the non-finite number with a finite JSON number',
      )
    }
    return
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throwPolicyError(
        'VANITY_POLICY_INVALID',
        `policy '${path.join('.')}' cannot contain cycles`,
        path,
        'remove the circular reference from the policy value',
      )
    }
    ancestors.add(value)
    value.forEach((child, index) => validateJsonValue(child, [...path, String(index)], ancestors))
    ancestors.delete(value)
    return
  }
  if (typeof value !== 'object' || value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throwPolicyError(
      'VANITY_POLICY_INVALID',
      `policy '${path.join('.')}' must contain deterministic JSON values`,
      path,
      'use only JSON-compatible strings, numbers, booleans, arrays, and objects',
    )
  }
  if (!isPlainRecord(value)) {
    throwPolicyError(
      'VANITY_POLICY_INVALID',
      `policy '${path.join('.')}' must contain plain deterministic JSON objects`,
      path,
      'replace the class instance with a plain object',
    )
  }
  if (ancestors.has(value)) {
    throwPolicyError(
      'VANITY_POLICY_INVALID',
      `policy '${path.join('.')}' cannot contain cycles`,
      path,
      'remove the circular reference from the policy value',
    )
  }
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

function throwPolicyError(
  code: Extract<VanityDiagnosticCode, `VANITY_POLICY_${string}`>,
  message: string,
  path: string | readonly string[],
  fix: string,
): never {
  throw new VanityError({ code, message, path, fix })
}
