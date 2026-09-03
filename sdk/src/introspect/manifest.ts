/** Manifest v4: the canonical system map plus build-module provenance. */

import type {
  VanityEscapeForm,
  VanityInspectRecord,
  VanityPortRecord,
  VanityRecipeRecord,
  VanitySourceRecord,
  VanityStyleRecord,
} from './records'
import type {
  VanityDeclaredAt,
  VanityIntrospectedToken,
  VanityIntrospectionDeclaration,
  VanityIntrospectionDependency,
  VanityIntrospectionExpression,
  VanitySemanticEntry,
  VanitySystemMapV2,
} from './system'
import { introspectSystem, normalizeSourceId } from './system'

/** Stable manifest format discriminator: `manifest.format === VANITY_MANIFEST_FORMAT`. */
export const VANITY_MANIFEST_FORMAT = 'vanity.manifest/4' as const
/** Current manifest schema version: `manifest.version === VANITY_MANIFEST_VERSION`. */
export const VANITY_MANIFEST_VERSION = 4 as const
/** Published JSON Schema identifier: `manifest.$schema === VANITY_MANIFEST_SCHEMA`. */
export const VANITY_MANIFEST_SCHEMA = 'https://schemas.mszr.dev/vanity/manifest-4.schema.json' as const

export type VanityManifestSource = VanityDeclaredAt
export type VanityManifestDeclaration = VanityIntrospectionDeclaration
export type VanityManifestDependency = VanityIntrospectionDependency
export type VanityManifestExpression = VanityIntrospectionExpression
export type VanityManifestToken = VanityIntrospectedToken

export interface VanityManifestRecipe extends VanitySemanticEntry {
  readonly kind: 'recipe' | 'anatomy'
  readonly name: string
  readonly parts?: readonly string[]
  readonly variants: Readonly<Record<string, readonly string[]>>
  readonly toggles: readonly string[]
  readonly defaults: Readonly<Record<string, string | boolean>>
  readonly ports: Readonly<Record<string, string>>
}

export interface VanityManifestPort extends VanitySemanticEntry {
  readonly kind: 'port'
  readonly name: string
  readonly var: string
  readonly type: import('../values/types').VanityCssDataType
  readonly default: string | number
  readonly validation?: import('../ports/types').VanityPortValidationMeta
}

export interface VanityManifestEscape extends VanitySemanticEntry {
  readonly kind: 'escape'
  readonly form: VanityEscapeForm
  readonly detail: string
  readonly reason?: string
  readonly layer?: string
}

export interface VanityManifestContrast extends VanitySemanticEntry {
  readonly kind: 'contrast'
  readonly pairing: string
  readonly scheme: 'light' | 'dark'
  readonly algorithm: 'apca' | 'wcag2'
  readonly measured: number
  readonly min: number
  readonly accepted: boolean
}

export interface VanityManifestStyle extends VanitySemanticEntry {
  readonly kind: 'style'
  readonly class: string
  readonly name?: string
  readonly tokens: readonly string[]
}

export interface VanityManifestModule extends VanitySemanticEntry {
  readonly kind: 'module'
  readonly source: string
  readonly recipes: Readonly<Record<string, VanityManifestRecipe>>
  readonly ports: Readonly<Record<string, VanityManifestPort>>
  readonly styles: Readonly<Record<string, VanityManifestStyle>>
  readonly escapes: readonly VanityManifestEscape[]
  readonly contrast: readonly VanityManifestContrast[]
  /** References in emitted CSS, excluding graph-internal references. */
  readonly tokenUsage: Readonly<Record<string, number>>
}

export interface VanityManifest {
  readonly $schema: typeof VANITY_MANIFEST_SCHEMA
  readonly format: typeof VANITY_MANIFEST_FORMAT
  readonly version: typeof VANITY_MANIFEST_VERSION
  /** Byte-for-byte semantic equality with `ds.introspect()`. */
  readonly system: VanitySystemMapV2
  /** Additional system maps, keyed by compatibility identity. */
  readonly systems: Readonly<Record<string, VanitySystemMapV2>>
  /** Style/build records grouped under package-relative source IDs. */
  readonly modules: Readonly<Record<string, VanityManifestModule>>
}

interface MutableModule {
  source: string
  recipes: Record<string, VanityManifestRecipe>
  ports: Record<string, VanityManifestPort>
  styles: Record<string, VanityManifestStyle>
  escapes: VanityManifestEscape[]
  contrast: VanityManifestContrast[]
  tokenUsage: Record<string, number>
}

export interface VanityManifestBuildOptions {
  /** Project root used only to normalize accidental absolute compiler sources. */
  readonly root?: string
}

/**
 * Build one stable Manifest v4 from collected semantic records and emitted CSS.
 *
 * @example
 * `const manifest = buildManifest(records, css, { root: process.cwd() })`
 */
export function buildManifest(
  records: readonly VanityInspectRecord[],
  css: string,
  options: VanityManifestBuildOptions = {},
): VanityManifest {
  const portableSystems = records
    .filter((record): record is Extract<VanityInspectRecord, { kind: 'system' }> & {
      portable: NonNullable<Extract<VanityInspectRecord, { kind: 'system' }>['portable']>
    } =>
      record.kind === 'system' && record.portable !== undefined)
    .map(record => record.portable)
    .filter((portable, index, all) =>
      all.findIndex(candidate => candidate.identities.compatibility === portable.identities.compatibility) === index)

  const primary = portableSystems[0]
  if (!primary)
    throw new TypeError('[vanity] Manifest v4 requires a consolidated system record')

  const system = introspectSystem(primary)
  const modules = new Map<string, MutableModule>()
  const getModule = (rawFile: string | undefined): MutableModule => {
    const source = getSourceId(rawFile, options.root)
    let found = modules.get(source)
    if (!found) {
      found = {
        source,
        recipes: {},
        ports: {},
        styles: {},
        escapes: [],
        contrast: [],
        tokenUsage: {},
      }
      modules.set(source, found)
    }
    return found
  }
  const pathsByVar = new Map(primary.tokenRecords.map(token => [token.var, token.path]))

  for (const record of records) {
    switch (record.kind) {
      case 'recipe':
      case 'anatomy': {
        if (record.name !== undefined) {
          const target = getModule(record.file)
          target.recipes[record.name] = createRecipeEntry(record, target.source)
        }
        break
      }
      case 'port': {
        const target = getModule(record.file)
        const name = getPortKey(record)
        target.ports[name] = createPortEntry(record, name, target.source, system.id)
        break
      }
      case 'style': {
        const target = getModule(record.file)
        target.styles[record.class] = createStyleEntry(record, target.source, system.id, pathsByVar)
        break
      }
      case 'escape': {
        const target = getModule(record.file)
        target.escapes.push({
          id: `escape:${target.source}:${record.form}:${record.line ?? 0}:${record.column ?? 0}:${record.detail}`,
          kind: 'escape',
          owner: { kind: 'module', id: `module:${target.source}` },
          ...getSource(record, options.root),
          form: record.form,
          detail: record.detail,
          ...(record.reason === undefined ? {} : { reason: record.reason }),
          ...(record.layer === undefined ? {} : { layer: record.layer }),
        })
        break
      }
      case 'contrast': {
        const target = getModule(record.file)
        target.contrast.push({
          id: `contrast:${target.source}:${record.pairing}:${record.scheme}:${record.algorithm}:${record.line ?? 0}:${record.column ?? 0}`,
          kind: 'contrast',
          owner: { kind: 'module', id: `module:${target.source}` },
          ...getSource(record, options.root),
          pairing: record.pairing,
          scheme: record.scheme,
          algorithm: record.algorithm,
          measured: record.measured,
          min: record.min,
          accepted: record.accepted,
        })
        break
      }
    }
  }

  // The global usage count is preserved semantically in the synthetic
  // project module: CSS has been concatenated by this point, so attributing it
  // to a source file would invent provenance.
  const project = getModule('$project')
  const internal = new Map<string, number>()
  const cssReferences = countAllVarRefs(css)
  for (const token of primary.tokenRecords) {
    for (const [name, count] of countAllVarRefs(`${token.css} ${token.upgrade ?? ''}`)) {
      const path = pathsByVar.get(name)
      if (path !== undefined)
        internal.set(path, (internal.get(path) ?? 0) + count)
    }
  }
  for (const token of primary.tokenRecords) {
    project.tokenUsage[token.path] = Math.max(
      0,
      (cssReferences.get(token.var) ?? 0) - (internal.get(token.path) ?? 0),
    )
  }

  return normalizeDeep({
    $schema: VANITY_MANIFEST_SCHEMA,
    format: VANITY_MANIFEST_FORMAT,
    version: VANITY_MANIFEST_VERSION,
    system,
    systems: Object.fromEntries(portableSystems
      .slice(1)
      .sort((left, right) =>
        left.identities.compatibility.localeCompare(right.identities.compatibility))
      .map(portable => [
        portable.identities.compatibility,
        introspectSystem(portable),
      ])),
    modules: Object.fromEntries([...modules.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, entry]) => [
      id,
      {
        id: `module:${id}`,
        kind: 'module',
        owner: { kind: 'system', id: system.id },
        ...(id === '$project' ? {} : { declaredAt: { file: id } }),
        source: entry.source,
        recipes: entry.recipes,
        ports: entry.ports,
        styles: entry.styles,
        escapes: [...entry.escapes].sort((left, right) => left.id.localeCompare(right.id)),
        contrast: [...entry.contrast].sort((left, right) => left.id.localeCompare(right.id)),
        tokenUsage: entry.tokenUsage,
      },
    ])),
  }) as VanityManifest
}

export function createManifestModules(manifest: VanityManifest): readonly VanityManifestModule[] {
  return Object.values(manifest.modules)
}

export function getManifestTokenUsage(manifest: VanityManifest): Readonly<Record<string, number>> {
  const usage: Record<string, number> = {}
  for (const module of createManifestModules(manifest)) {
    for (const [path, count] of Object.entries(module.tokenUsage))
      usage[path] = (usage[path] ?? 0) + count
  }
  return usage
}

function createRecipeEntry(record: VanityRecipeRecord, moduleId: string): VanityManifestRecipe {
  return {
    id: `${record.kind}:${moduleId}:${record.name}`,
    kind: record.kind,
    owner: { kind: 'module', id: `module:${moduleId}` },
    ...getSource(record),
    name: record.name!,
    ...(record.parts === undefined ? {} : { parts: record.parts }),
    variants: record.variants,
    toggles: record.toggles,
    defaults: record.defaults,
    ports: record.ports,
  }
}

function createPortEntry(
  record: VanityPortRecord,
  name: string,
  moduleId: string,
  _systemId: string,
): VanityManifestPort {
  const { meta } = record
  return {
    id: `port:${moduleId}:${name}`,
    kind: 'port',
    owner: { kind: 'module', id: `module:${moduleId}` },
    ...getSource(record),
    name,
    var: meta.name,
    type: meta.type,
    default: meta.defaultValue,
    ...(meta.validation === undefined ? {} : { validation: meta.validation }),
    ...(meta.description === undefined ? {} : { description: meta.description }),
    ...(meta.deprecated === undefined ? {} : { deprecated: meta.deprecated }),
  }
}

function createStyleEntry(
  record: VanityStyleRecord,
  moduleId: string,
  _systemId: string,
  pathsByVar: ReadonlyMap<string, string>,
): VanityManifestStyle {
  return {
    id: `style:${record.class}`,
    kind: 'style',
    owner: { kind: 'module', id: `module:${moduleId}` },
    ...getSource(record),
    class: record.class,
    ...(record.name === undefined ? {} : { name: record.name }),
    tokens: record.vars.flatMap(variable => pathsByVar.get(variable) ?? []),
  }
}

function getPortKey(record: VanityPortRecord): string {
  const base = record.file?.split('/').pop()?.replace(/\.css\.\w+$/, '')
  const label = record.label ?? record.meta.name
  return base === undefined ? label : `${base}.${label}`
}

function getSource(record: VanitySourceRecord, root?: string): { declaredAt?: VanityDeclaredAt } {
  if (record.file === undefined)
    return {}
  return {
    declaredAt: {
      file: getSourceId(record.file, root),
      ...(record.line === undefined ? {} : { line: record.line }),
      ...(record.column === undefined ? {} : { column: record.column }),
    },
  }
}

function getSourceId(file: string | undefined, root?: string): string {
  if (file === undefined)
    return '$project'
  const normalizedFile = file.replaceAll('\\', '/')
  const normalizedRoot = root?.replaceAll('\\', '/').replace(/\/$/, '')
  if (normalizedRoot && normalizedFile.startsWith(`${normalizedRoot}/`))
    return normalizedFile.slice(normalizedRoot.length + 1)
  return normalizeSourceId(normalizedFile)
}

/** Occurrences of `var(--name)` / `var(--name,` — the parenthesis keeps prefixes apart. */
export function countVariableReferences(text: string, name: string): number {
  return countAllVarRefs(text).get(name) ?? 0
}

function countAllVarRefs(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const match of text.matchAll(/var\(\s*(--[-\w]+)/g)) {
    const name = match[1]
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return counts
}

function normalizeDeep(value: unknown): unknown {
  if (Array.isArray(value))
    return Object.freeze(value.map(normalizeDeep))
  if (!value || typeof value !== 'object')
    return value
  return Object.freeze(Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, normalizeDeep(child)])))
}
