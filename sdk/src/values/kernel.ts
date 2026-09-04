/**
 * Immutable value capabilities shared by systems and portable token modules.
 *
 * The kernel deliberately contains no system policy. Policy-dependent work
 * receives a `VanityValueOperationContext` from the owning system instead.
 */

import type { VanityResolvedPolicies } from './policies'
import type { VanityExtensionIdentity, VanitySerializeContext } from './protocol'
import type { VanityValue } from './types'
import { throwValueError } from './error'
import {
  createSerializeContext,
  isNodeValue,
  normalizeExtension,
  serializeNode,
  VANITY_NODE,
} from './protocol'

export const VANITY_VALUE_PROTOCOL_VERSION = 1 as const

/** Optional extension capabilities used to create an immutable value kernel. */
export interface VanityValueKernelOptions {
  /** Value extensions available to the kernel. */
  readonly extensions?: readonly VanityExtensionIdentity[]
  /** Compatible parent revisions retained by an immutable extension link. */
  readonly compatibleSignatures?: readonly string[]
  /** Constructor names contributed by each extension, for portable ownership records. */
  readonly constructorExtensions?: Readonly<Record<string, VanityExtensionIdentity>>
}

/** Immutable extension lookup registry carried by a value kernel. */
export interface VanityValueExtensionRegistry extends ReadonlyArray<VanityExtensionIdentity> {
  /** All normalized extension identities in registration order. */
  readonly all: readonly VanityExtensionIdentity[]
  /** Find one installed extension by stable id. */
  get: (id: string) => VanityExtensionIdentity | undefined
  /** Test whether an extension id is installed. */
  has: (id: string) => boolean
}

/** Immutable value capabilities shared by system resolution and portable modules. */
export interface VanityValueKernel<Constructors extends object = object> {
  /** Value expression protocol revision. */
  readonly protocol: typeof VANITY_VALUE_PROTOCOL_VERSION
  /** Deterministic constructor/extension capability signature. */
  readonly signature: string
  /** Compatible signatures retained across immutable extension links. */
  readonly compatibleSignatures: ReadonlySet<string>
  /** Value constructors available to this kernel. */
  readonly constructors: Constructors
  /** Installed extension identities and lookup helpers. */
  readonly extensions: VanityValueExtensionRegistry
  /** Constructor ownership records for portable contracts. */
  readonly constructorExtensions: Readonly<Record<string, VanityExtensionIdentity>>
}

/** Inputs required when a value operation depends on system policy. */
export interface VanityValueOperationContext {
  readonly values: VanityValueKernel
  readonly policies: VanityResolvedPolicies
}

export function createValueKernel<const Constructors extends object>(
  constructors: Constructors,
  options: VanityValueKernelOptions = {},
): VanityValueKernel<Constructors> {
  const extensions = createValueExtensionRegistry(options.extensions ?? [])
  const frozenConstructors = Object.freeze({ ...constructors }) as Constructors
  const signature = getValueCapabilitySignature(frozenConstructors, extensions.all)
  const compatibleSignatures = new Set<string>([
    signature,
    ...(options.compatibleSignatures ?? []),
  ])

  const kernel = {
    protocol: VANITY_VALUE_PROTOCOL_VERSION,
    signature,
    compatibleSignatures,
    constructors: frozenConstructors,
    extensions,
    constructorExtensions: Object.freeze({ ...(options.constructorExtensions ?? {}) }),
  } as VanityValueKernel<Constructors>
  return Object.freeze(kernel)
}

/** Extend value capabilities without mutating the source kernel. */
export function extendValueKernel<Constructors extends object, Added extends object>(
  kernel: VanityValueKernel<Constructors>,
  identity: VanityExtensionIdentity,
  added: Added,
): VanityValueKernel<Constructors & Added> {
  const normalized = normalizeExtension(identity)
  const collision = Object.keys(added).find(key => key in kernel.constructors)
  if (collision) {
    throwValueError(
      'VANITY_VALUE_INVALID',
      `extension "${normalized.id}" cannot define '${collision}' because that value constructor already exists`,
      ['extension', collision],
      'choose a constructor name that is not already installed',
    )
  }
  if (kernel.extensions.has(normalized.id)) {
    const existing = kernel.extensions.get(normalized.id)!
    throwValueError(
      'VANITY_VALUE_INVALID',
      `extension id "${normalized.id}" is already installed at version ${existing.version}`,
      ['extension', normalized.id],
      'install each extension id only once, or use a distinct id for a different capability',
    )
  }

  return createValueKernel(
    { ...kernel.constructors, ...added } as Constructors & Added,
    {
      extensions: [...kernel.extensions.all, normalized],
      compatibleSignatures: [kernel.signature, ...kernel.compatibleSignatures],
      constructorExtensions: {
        ...kernel.constructorExtensions,
        ...Object.fromEntries(Object.keys(added).map(name => [name, normalized])),
      },
    },
  )
}

/** Check compatibility by capability identity and retained immutable ancestry. */
export function isValueKernelCompatible(
  target: Pick<VanityValueKernel, 'signature' | 'compatibleSignatures'>,
  candidate: Pick<VanityValueKernel, 'signature'>,
): boolean {
  return target.signature === candidate.signature || target.compatibleSignatures.has(candidate.signature)
}

/** Serialize a value after checking its installed extension requirements. */
export function serializeValueWithContext(
  context: VanityValueOperationContext,
  value: VanityValue,
  resolveReference?: VanitySerializeContext['resolveReference'],
): string {
  if (!isNodeValue(value)) {
    throwValueError(
      'VANITY_VALUE_INVALID',
      'this value does not belong to the portable vanity expression protocol',
      ['value'],
      'pass a value created by the portable expression protocol',
    )
  }
  assertValueExtensions(value[VANITY_NODE], context.values.extensions.all)
  return serializeNode(
    value[VANITY_NODE],
    createSerializeContext(context.policies.support, resolveReference, undefined, context.policies),
  )
}

function createValueExtensionRegistry(
  identities: readonly VanityExtensionIdentity[],
): VanityValueExtensionRegistry {
  const normalized = identities.map(normalizeExtension)
  const byId = new Map<string, VanityExtensionIdentity>()
  for (const identity of normalized) {
    if (byId.has(identity.id)) {
      throwValueError(
        'VANITY_VALUE_INVALID',
        `extension id "${identity.id}" is installed more than once`,
        ['extensions', identity.id],
        'register each extension id only once',
      )
    }
    byId.set(identity.id, identity)
  }
  const all = [...byId.values()]
  Object.defineProperties(all, {
    all: { enumerable: false, value: all },
    get: { enumerable: false, value: (id: string) => byId.get(id) },
    has: { enumerable: false, value: (id: string) => byId.has(id) },
  })
  return Object.freeze(all) as VanityValueExtensionRegistry
}

function getValueCapabilitySignature(
  constructors: object,
  extensions: readonly VanityExtensionIdentity[],
): string {
  const semantic = JSON.stringify({
    protocol: VANITY_VALUE_PROTOCOL_VERSION,
    constructors: Object.keys(constructors).sort(),
    extensions: extensions.map(extension => ({
      id: extension.id,
      version: String(extension.version),
      fingerprint: extension.fingerprint ?? '',
    })),
  })
  return `vanity-value-${VANITY_VALUE_PROTOCOL_VERSION}-${hashFNV1a(semantic)}`
}

function hashFNV1a(value: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function assertValueExtensions(
  node: import('./protocol').VanityExpressionNode,
  extensions: readonly VanityExtensionIdentity[],
): void {
  if (node.extension) {
    const installed = extensions.find(extension => extension.id === node.extension!.id)
    if (!installed || String(installed.version) !== String(node.extension.version)
      || (installed.fingerprint ?? '') !== (node.extension.fingerprint ?? '')) {
      throwValueError(
        'VANITY_VALUE_INVALID',
        `value requires extension ${node.extension.id}@${node.extension.version}, which is not compatible with this value capability set`,
        ['value', 'extension'],
        'install the matching extension or provide a compatible fallback value',
      )
    }
  }

  if (node.fallback)
    assertValueExtensions(node.fallback, extensions)

  switch (node.kind) {
    case 'function':
    case 'plugin':
      node.values.forEach(child => assertValueExtensions(child, extensions))
      break
    case 'operation':
      assertValueExtensions(node.left, extensions)
      assertValueExtensions(node.right, extensions)
      break
    case 'var':
      if (node.valueFallback)
        assertValueExtensions(node.valueFallback, extensions)
      break
    case 'composite':
      node.parts.forEach((part) => {
        if (typeof part !== 'string')
          assertValueExtensions(part, extensions)
      })
      break
    case 'literal':
    case 'raw':
      break
  }
}
