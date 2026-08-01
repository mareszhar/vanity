/**
 * Portable semantic kernel behind public `createEngine()` revisions.
 * The internal default engine and every public engine revision share this kernel.
 */

import type { VanityCssSupportTarget, VanityExtensionIdentity } from '../values/protocol'
import type { VanitySelfValue, VanityValue } from '../values/types'
import { addFunctionSerializer } from '@vanilla-extract/css/functionSerializer'
import {
  createSerializeContext,
  isNodeValue,
  normalizeExtension,
  serializeNode,
  VANITY_DEFAULT_CSS_SUPPORT,
  VANITY_NODE,
} from '../values/protocol'

export const VANITY_IR_PROTOCOL = 1 as const

export interface VanityEngineKernelOptions {
  readonly support?: VanityCssSupportTarget
  readonly policies?: Readonly<Record<string, unknown>>
  readonly extensions?: readonly VanityExtensionIdentity[]
  /** Compatible parent revisions retained by an immutable extension link. */
  readonly ancestors?: readonly string[]
}

export interface VanityEngineKernel<Constructors extends object> {
  readonly protocol: typeof VANITY_IR_PROTOCOL
  readonly signature: string
  readonly compatibleSignatures: readonly string[]
  readonly support: VanityCssSupportTarget
  readonly policies: Readonly<Record<string, unknown>>
  readonly extensions: readonly VanityExtensionIdentity[]
  readonly constructors: Constructors
  serialize: <Type extends import('../values/types').VanityCssDataType>(value: VanitySelfValue<Type>) => string
  serializeValue: (
    value: VanityValue,
    resolveReference?: import('../values/protocol').VanitySerializeContext['resolveReference'],
  ) => string
  compatibleWith: (other: Pick<VanityEngineKernel<Record<string, unknown>>, 'signature'>) => boolean
  extend: <Added extends object>(
    identity: VanityExtensionIdentity,
    added: Added,
  ) => VanityEngineKernel<Constructors & Added>
}

export function createEngineKernel<const Constructors extends object>(
  constructors: Constructors,
  options: VanityEngineKernelOptions = {},
): VanityEngineKernel<Constructors> {
  const support = options.support ?? VANITY_DEFAULT_CSS_SUPPORT
  const policies = deepFreeze(normalize(options.policies ?? {}))
  const extensions = Object.freeze((options.extensions ?? []).map(normalizeExtension))
  assertUniqueExtensionIds(extensions)
  const frozenConstructors = Object.freeze(
    serializableConstructors(constructors) as Constructors,
  )
  const signature = semanticSignature({ support, policies, extensions })
  const compatibleSignatures = Object.freeze([
    signature,
    ...new Set(options.ancestors ?? []),
  ])
  const context = createSerializeContext(support, undefined, undefined, policies)

  return Object.freeze({
    protocol: VANITY_IR_PROTOCOL,
    signature,
    compatibleSignatures,
    support,
    policies,
    extensions,
    constructors: frozenConstructors,
    serialize<Type extends import('../values/types').VanityCssDataType>(value: VanitySelfValue<Type>): string {
      if (!isNodeValue(value))
        throw new TypeError('[vanity] this value does not belong to the portable vanity expression protocol')
      requireExtensions(value[VANITY_NODE], extensions)
      return serializeNode(value[VANITY_NODE], context)
    },
    serializeValue(value: VanityValue, resolveReference?: import('../values/protocol').VanitySerializeContext['resolveReference']): string {
      if (!isNodeValue(value))
        throw new TypeError('[vanity] this value does not belong to the portable vanity expression protocol')
      requireExtensions(value[VANITY_NODE], extensions)
      return serializeNode(value[VANITY_NODE], createSerializeContext(support, resolveReference, undefined, policies))
    },
    compatibleWith(other: Pick<VanityEngineKernel<Record<string, unknown>>, 'signature'>): boolean {
      return signature === other.signature
    },
    extend<Added extends object>(identity: VanityExtensionIdentity, added: Added) {
      const normalized = normalizeExtension(identity)
      const collision = Object.keys(added).find(key => key in frozenConstructors)
      if (collision) {
        throw new TypeError(
          `[vanity] extension "${normalized.id}" cannot define '${collision}' because that engine member already exists`,
        )
      }
      const existing = extensions.find(extension => extension.id === normalized.id)
      if (existing) {
        throw new TypeError(
          `[vanity] extension id "${normalized.id}" is already installed at version ${existing.version}`,
        )
      }
      return createEngineKernel(
        { ...frozenConstructors, ...added } as Constructors & Added,
        {
          support,
          policies,
          extensions: [...extensions, normalized],
          ancestors: compatibleSignatures,
        },
      )
    },
  })
}

/**
 * Constructors are shared by an engine and every system finalized from it.
 * Prepare their app-plane stubs before freezing the engine kernel so systems
 * can preserve exact constructor identity instead of wrapping them later.
 */
function serializableConstructors<T extends object>(
  value: T,
  path = 'constructor',
  seen = new WeakMap<object, unknown>(),
): T {
  const existing = seen.get(value)
  if (existing !== undefined)
    return existing as T

  if (typeof value === 'function') {
    if (Object.hasOwn(value, '__recipe__'))
      return value

    const wrapper = function (this: unknown, ...args: unknown[]): unknown {
      return Reflect.apply(value, this, args)
    }
    seen.set(value, wrapper)

    addFunctionSerializer(wrapper, {
      importPath: '@mszr/vanity/runtime',
      importName: 'restoreBuildPlane',
      args: [{ name: path }],
    })

    copyConstructorProperties(value, wrapper, path, seen, new Set([
      'name',
      'length',
      'prototype',
      'arguments',
      'caller',
    ]))

    return Object.freeze(wrapper) as T
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = []
    seen.set(value, clone)
    copyConstructorProperties(value, clone, path, seen, new Set(['length']))
    return Object.freeze(clone) as T
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null)
    return value

  const clone = Object.create(prototype) as Record<PropertyKey, unknown>
  seen.set(value, clone)
  copyConstructorProperties(value, clone, path, seen)
  return Object.freeze(clone) as T
}

function copyConstructorProperties(
  source: object,
  target: object,
  path: string,
  seen: WeakMap<object, unknown>,
  skipped = new Set<PropertyKey>(),
): void {
  for (const key of Reflect.ownKeys(source)) {
    if (skipped.has(key))
      continue

    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    if (descriptor === undefined)
      continue

    if ('value' in descriptor && isConstructorContainer(descriptor.value)) {
      descriptor.value = serializableConstructors(
        descriptor.value,
        constructorPropertyPath(path, key),
        seen,
      )
    }

    descriptor.configurable = false
    Object.defineProperty(target, key, descriptor)
  }
}

function isConstructorContainer(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

function constructorPropertyPath(path: string, key: PropertyKey): string {
  return typeof key === 'string'
    ? `${path}.${key}`
    : `${path}[${String(key)}]`
}

function semanticSignature(input: {
  support: VanityCssSupportTarget
  policies: Readonly<Record<string, unknown>>
  extensions: readonly VanityExtensionIdentity[]
}): string {
  const semantic = JSON.stringify({
    protocol: VANITY_IR_PROTOCOL,
    support: {
      id: input.support.id,
      features: [...input.support.features].sort(),
    },
    policies: input.policies,
    extensions: input.extensions.map(extension => ({
      id: extension.id,
      version: String(extension.version),
      fingerprint: extension.fingerprint ?? '',
    })),
  })
  return `vanity-ir-${VANITY_IR_PROTOCOL}-${fnv1a(semantic)}`
}

function fnv1a(value: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function normalize(value: unknown, ancestors = new WeakSet<object>()): any {
  if (Array.isArray(value)) {
    if (ancestors.has(value))
      throw new TypeError('[vanity] engine semantic policies cannot contain cycles')
    ancestors.add(value)
    const result = value.map(child => normalize(child, ancestors))
    ancestors.delete(value)
    return result
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError('[vanity] engine semantic policies must contain only plain deterministic JSON objects')
    if (ancestors.has(value))
      throw new TypeError('[vanity] engine semantic policies cannot contain cycles')
    ancestors.add(value)
    const result = Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, normalize(child, ancestors)]))
    ancestors.delete(value)
    return result
  }
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new TypeError('[vanity] engine semantic policies cannot contain non-finite numbers')
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
    throw new TypeError('[vanity] engine semantic policies must be deterministic JSON values')
  return value
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child)
  }
  return value
}

function assertUniqueExtensionIds(extensions: readonly VanityExtensionIdentity[]): void {
  const seen = new Set<string>()
  for (const extension of extensions) {
    if (seen.has(extension.id))
      throw new TypeError(`[vanity] extension id "${extension.id}" is installed more than once`)
    seen.add(extension.id)
  }
}

function requireExtensions(
  node: import('../values/protocol').VanityExpressionNode,
  extensions: readonly VanityExtensionIdentity[],
): void {
  if (node.extension) {
    const installed = extensions.find(extension => extension.id === node.extension!.id)
    if (!installed || String(installed.version) !== String(node.extension.version)
      || (installed.fingerprint ?? '') !== (node.extension.fingerprint ?? '')) {
      throw new TypeError(
        `[vanity] value requires extension ${node.extension.id}@${node.extension.version}, which is not compatible with this engine`,
      )
    }
  }

  if (node.fallback)
    requireExtensions(node.fallback, extensions)

  switch (node.kind) {
    case 'function':
      node.values.forEach(child => requireExtensions(child, extensions))
      break
    case 'operation':
      requireExtensions(node.left, extensions)
      requireExtensions(node.right, extensions)
      break
    case 'var':
      if (node.valueFallback)
        requireExtensions(node.valueFallback, extensions)
      break
    case 'composite':
      node.parts.forEach((part) => {
        if (typeof part !== 'string')
          requireExtensions(part, extensions)
      })
      break
    case 'plugin':
      node.values.forEach(child => requireExtensions(child, extensions))
      break
    case 'literal':
    case 'raw':
      break
  }
}
