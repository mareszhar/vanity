import type {
  CompiledStyleDefinition,
  ContractDefinition,
  PortableContract,
} from './types.ts'
import { fingerprint } from './hash.ts'

export const BUILD_PLANE_SENTINEL = 'BUILD_PLANE_SENTINEL'

function normalizeDefinition(definition: ContractDefinition) {
  return {
    ...definition,
    policies: Object.fromEntries(Object.entries(definition.policies).sort(([a], [b]) => a.localeCompare(b))),
    extensions: definition.extensions.map(extension => ({
      id: extension.id,
      version: extension.version,
      options: Object.fromEntries(Object.entries(extension.options ?? {}).sort(([a], [b]) => a.localeCompare(b))),
    })),
    tokens: definition.tokens.map(token => ({ ...token })),
    runtimePorts: [...definition.runtimePorts].sort(),
  }
}

export function consolidate(definition: ContractDefinition) {
  if (definition.tokens.length === 0)
    throw new Error('[projection] consolidate() requires at least one token')

  const names = new Set<string>()
  for (const token of definition.tokens) {
    if (names.has(token.name))
      throw new Error(`[projection] duplicate token '${token.name}'`)
    if (token.value.length === 0)
      throw new Error(`[projection] token '${token.name}' has an empty value`)
    names.add(token.name)
  }

  const normalized = normalizeDefinition(definition)
  const identities = {
    compatibility: fingerprint({
      name: normalized.name,
      prefix: normalized.prefix,
      layerRoot: normalized.layerRoot,
      policies: normalized.policies,
      extensions: normalized.extensions,
      tokenShape: normalized.tokens.map(({ name, mutable }) => ({ name, mutable: Boolean(mutable) })),
      runtimePorts: normalized.runtimePorts,
    }),
    css: fingerprint({
      prefix: normalized.prefix,
      layerRoot: normalized.layerRoot,
      tokens: normalized.tokens.map(({ name, value }) => ({ name, value })),
    }),
    runtime: fingerprint({
      mutableTokens: normalized.tokens.filter(token => token.mutable).map(token => token.name),
      ports: normalized.runtimePorts,
    }),
    docs: fingerprint({
      tokens: normalized.tokens.map(({ name, description, provenance }) => ({
        name,
        description: description ?? '',
        provenance: provenance ?? '',
      })),
    }),
  }

  const portable: PortableContract = {
    format: 1,
    name: normalized.name,
    prefix: normalized.prefix,
    layerRoot: normalized.layerRoot,
    policies: normalized.policies,
    extensions: normalized.extensions,
    tokens: normalized.tokens,
    runtimePorts: normalized.runtimePorts,
    identities,
  }

  const instance = Symbol(normalized.name)

  return Object.freeze({
    instance,
    plane: 'contract' as const,
    identities,
    compatibilityId: identities.compatibility,
    runtimeSchemaId: identities.runtime,
    tokens: Object.freeze(Object.fromEntries(normalized.tokens.map(token => [token.name, token.value]))),
    ref(name: string) {
      if (!names.has(name))
        throw new Error(`[projection] unknown token '${name}'`)
      return `var(--${normalized.prefix}-${name})`
    },
    style(className: string, declarations: Record<string, string>, layer = 'components'): string {
      if (!/^[a-z][a-z0-9-]*$/i.test(className))
        throw new Error(`[projection] invalid class name '${className}'`)

      // This closure is deliberately build-only. Browser-bundle assertions prove
      // that neither it nor its sentinel crosses the portable boundary.
      const extensionProbe = definition.extensions.map(extension => extension.utility(className)).join('|')
      if (extensionProbe.includes('THROW_BUILD_ERROR'))
        throw new Error('[projection] extension rejected the style')

      return {
        format: 1,
        className,
        declarations: { ...declarations },
        layer,
        contract: portable,
      } as CompiledStyleDefinition as unknown as string
    },
    introspect() {
      return portable
    },
    buildPlaneMarker() {
      return BUILD_PLANE_SENTINEL
    },
    snapshot(values: Record<string, string> = {}) {
      return JSON.stringify({ schema: identities.runtime, values })
    },
    toPortable() {
      return portable
    },
  })
}
