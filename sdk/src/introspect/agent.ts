import type { VanityManifest } from './manifest'
import { createManifestModules } from './manifest'

/** Compact manifest context supplied to human or automated tooling. */
export interface VanityAgentContext {
  readonly manifestVersion: VanityManifest['version']
  readonly identities: VanityManifest['system']['identities']
  readonly system: {
    readonly root: string
    readonly tokenLayer?: string
    readonly layers: readonly string[]
  }
  readonly environment: {
    readonly axes: readonly {
      readonly name: string
      readonly modes: readonly string[]
      readonly defaultMode?: string
    }[]
    readonly conditions: Readonly<Record<string, string>>
  }
  readonly tokens: readonly {
    readonly path: string
    readonly type: string
    readonly reference: 'val' | 'var'
    readonly mutable: boolean
    readonly dependencies: readonly string[]
    readonly contexts: readonly string[]
    readonly description?: string
  }[]
  readonly modules: readonly {
    readonly source: string
    readonly recipes: readonly string[]
    readonly ports: readonly string[]
  }[]
  readonly policy: {
    readonly rawAssertions: number
    readonly aliasEscapes: number
    readonly nonportableTokens: readonly string[]
    readonly overwrites: number
  }
}

/** Bounded machine context derived entirely from Manifest v4. */
export function buildAgentContext(manifest: VanityManifest): VanityAgentContext {
  const modules = createManifestModules(manifest)
  return Object.freeze({
    manifestVersion: manifest.version,
    identities: manifest.system.identities,
    system: Object.freeze({
      root: manifest.system.root,
      ...(manifest.system.tokenLayer === undefined ? {} : { tokenLayer: manifest.system.tokenLayer }),
      layers: Object.freeze(manifest.system.layers.map(layer => layer.name)),
    }),
    environment: Object.freeze({
      axes: Object.freeze(Object.values(manifest.system.axes).map(axis => Object.freeze({
        name: axis.name,
        modes: Object.freeze([...axis.modeOrder]),
        ...(axis.defaultMode === undefined ? {} : { defaultMode: axis.defaultMode }),
      }))),
      conditions: Object.freeze(Object.fromEntries(Object.entries(manifest.system.conditions)
        .map(([name, condition]) => [name, condition.readable]))),
    }),
    tokens: Object.freeze(Object.entries(manifest.system.tokens).map(([path, token]) => Object.freeze({
      path,
      type: token.type,
      reference: token.reference,
      mutable: token.mutable,
      dependencies: Object.freeze(token.dependencies.flatMap(edge => edge.path ?? [])),
      contexts: Object.freeze([...new Set<string>(token.declarations.map(declaration => [
        `root ${declaration.context.root}`,
        declaration.context.layer === undefined ? undefined : `@layer ${declaration.context.layer}`,
        ...declaration.context.atRules,
        ...declaration.context.selectors,
      ].filter((part): part is string => part !== undefined).join(' ')))]),
      ...(token.description === undefined ? {} : { description: token.description }),
    }))),
    modules: Object.freeze(modules.filter(module => module.source !== '$project').map(module => Object.freeze({
      source: module.source,
      recipes: Object.freeze(Object.keys(module.recipes)),
      ports: Object.freeze(Object.keys(module.ports)),
    }))),
    policy: Object.freeze({
      rawAssertions: modules.flatMap(module => module.escapes)
        .filter(escape => escape.form === 'raw' || escape.form === 'unsafe')
        .length,
      aliasEscapes: modules.flatMap(module => module.escapes)
        .filter(escape => escape.form === 'class.standard')
        .length,
      nonportableTokens: Object.freeze(Object.entries(manifest.system.tokens)
        .filter(([, token]) => token.portability.status === 'nonportable')
        .map(([path]) => path)),
      overwrites: manifest.system.overwrites.length,
    }),
  })
}

/** Human orientation for an agent prompt; facts remain manifest-sourced. */
export function generateAgentContext(manifest: VanityManifest): string {
  const context = buildAgentContext(manifest)
  const lines = [
    '# vanity system context',
    '',
    `Manifest v${context.manifestVersion}; system ${context.identities.compatibility}; root ${context.system.root}.`,
    `Cascade layers: ${context.system.layers.join(' → ') || '(none)'}.`,
  ]
  if (context.environment.axes.length > 0) {
    lines.push('', 'Environmental axes:')
    for (const axis of context.environment.axes)
      lines.push(`- ${axis.name}: ${axis.modes.join(', ')}${axis.defaultMode === undefined ? '' : ` (default ${axis.defaultMode})`}`)
  }
  lines.push('', 'Token vocabulary:')
  for (const token of context.tokens) {
    const contexts = token.contexts.length === 0 ? '' : `; emits ${token.contexts.join(' | ')}`
    lines.push(`- ${token.path}: <${token.type}>, ${token.reference}${token.mutable ? ', runtime-mutable' : ''}${token.description ? ` — ${token.description}` : ''}${contexts}`)
  }
  if (context.modules.some(module => module.recipes.length + module.ports.length > 0)) {
    lines.push('', 'Published component contracts:')
    for (const module of context.modules) {
      if (module.recipes.length + module.ports.length > 0)
        lines.push(`- ${module.source}: recipes/anatomies ${module.recipes.join(', ') || 'none'}; ports ${module.ports.join(', ') || 'none'}`)
    }
  }
  lines.push('', 'Authoring policy:')
  lines.push('- Prefer declared tokens, conditions, recipes, anatomies, and ports; emitted contexts above are the cascade contract.')
  lines.push(`- Raw assertions: ${context.policy.rawAssertions}; aliases-only escapes: ${context.policy.aliasEscapes}; overwrite/augment history: ${context.policy.overwrites}.`)
  lines.push(`- Nonportable authored-interchange values: ${context.policy.nonportableTokens.join(', ') || 'none'}.`)
  return lines.join('\n')
}
