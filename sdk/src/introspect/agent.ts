import type { VanityManifest } from './manifest'
import { createManifestModules } from './manifest'

/** Primary system vocabulary and build evidence for human or automated tooling. */
export interface VanityAgentContext {
  /** Manifest protocol version from the supplied build snapshot. */
  readonly manifestVersion: VanityManifest['version']
  /** Compatibility, CSS, runtime and documentation identities of the primary system. */
  readonly identities: VanityManifest['system']['identities']
  /** Primary system's CSS root and declared cascade order. */
  readonly system: {
    /** Selector owning the primary system's declarations. */
    readonly root: string
    /** Token layer when token declarations are layered. */
    readonly tokenLayer?: string
    /** Cascade layers in authored precedence order. */
    readonly layers: readonly string[]
  }
  /** Declared axes, mode vocabulary and readable named conditions. */
  readonly environment: {
    /** Declared environmental axes of the primary system. */
    readonly axes: readonly {
      /** Public axis name used by token branches and runtime mode controls. */
      readonly name: string
      /** Declared mode names in selection/cycle order. */
      readonly modes: readonly string[]
      /** Nominal axis default, when declared; distinct from a token's fallback. */
      readonly defaultMode?: string
    }[]
    /** Named conditions mapped to their readable CSS selectors or queries. */
    readonly conditions: Readonly<Record<string, string>>
  }
  /** All primary-system tokens, with traits, dependencies and emission contexts. */
  readonly tokens: readonly {
    /** Semantic token path usable with explain(), without private CSS slot names. */
    readonly path: string
    /** Resolved CSS data type. */
    readonly type: string
    /** Whether styling uses the resolved expression or a custom-property reference. */
    readonly reference: 'val' | 'var'
    /** Whether declared token addresses permit runtime updates. */
    readonly mutable: boolean
    /** Semantic paths of this token's dependencies. */
    readonly dependencies: readonly string[]
    /** Distinct emitted root, layer, at-rule and selector contexts, as readable CSS. */
    readonly contexts: readonly string[]
    /** Author-supplied guidance, when present. */
    readonly description?: string
  }[]
  /** Source modules and their published recipes/anatomies or component ports. */
  readonly modules: readonly {
    /** Module's source path from the manifest. */
    readonly source: string
    /** Published recipe and anatomy names. */
    readonly recipes: readonly string[]
    /** Published component port names. */
    readonly ports: readonly string[]
  }[]
  /** Recorded authoring escapes, interchange limitations and explicit replacements. */
  readonly policy: {
    /** Number of recorded raw and unsafe assertions. */
    readonly rawAssertions: number
    /** Number of standards-form escapes from an aliases-only styling surface. */
    readonly aliasEscapes: number
    /** Token paths that cannot be transferred through authored interchange. */
    readonly nonportableTokens: readonly string[]
    /** Number of recorded overwrite and augmentation entries. */
    readonly overwrites: number
  }
}

/** Machine context derived entirely from Manifest v4, with the complete token vocabulary. */
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
