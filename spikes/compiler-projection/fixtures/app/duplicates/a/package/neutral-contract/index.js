import { createHash } from 'node:crypto'

function stableStringify(value) {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function fingerprint(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16)
}

export function consolidate(definition) {
  const extensions = definition.extensions.map(({ id, version, options = {} }) => ({ id, version, options }))
  const tokens = definition.tokens.map(token => ({ ...token }))
  const identities = {
    compatibility: fingerprint({
      name: definition.name,
      prefix: definition.prefix,
      layerRoot: definition.layerRoot,
      policies: definition.policies,
      extensions,
      tokenShape: tokens.map(({ name, mutable }) => ({ name, mutable: Boolean(mutable) })),
      runtimePorts: [...definition.runtimePorts].sort(),
    }),
    css: fingerprint({
      prefix: definition.prefix,
      layerRoot: definition.layerRoot,
      tokens: tokens.map(({ name, value }) => ({ name, value })),
    }),
    runtime: fingerprint({
      mutableTokens: tokens.filter(token => token.mutable).map(token => token.name),
      ports: [...definition.runtimePorts].sort(),
    }),
    docs: fingerprint({
      tokens: tokens.map(({ name, description = '', provenance = '' }) => ({ name, description, provenance })),
    }),
  }
  const portable = {
    format: 1,
    name: definition.name,
    prefix: definition.prefix,
    layerRoot: definition.layerRoot,
    policies: definition.policies,
    extensions,
    tokens,
    runtimePorts: [...definition.runtimePorts].sort(),
    identities,
  }
  const names = new Set(tokens.map(token => token.name))
  return Object.freeze({
    instance: Symbol(definition.name),
    plane: 'contract',
    identities,
    compatibilityId: identities.compatibility,
    runtimeSchemaId: identities.runtime,
    ref(name) {
      if (!names.has(name))
        throw new Error(`unknown token '${name}'`)
      return `var(--${definition.prefix}-${name})`
    },
    style(className, declarations, layer = 'components') {
      definition.extensions.forEach(extension => extension.utility(className))
      return { format: 1, className, declarations: { ...declarations }, layer, contract: portable }
    },
    toPortable() {
      return portable
    },
    snapshot(values = {}) {
      return JSON.stringify({ schema: identities.runtime, values })
    },
  })
}
