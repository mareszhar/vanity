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
  VanitySystemMap,
} from './system'
import { VanityError } from '../diagnostics'
import { introspectSystem, normalizeSourceId } from './system'

/** Stable manifest format discriminator: `manifest.format === VANITY_MANIFEST_FORMAT`. */
export const VANITY_MANIFEST_FORMAT = 'vanity.manifest/4' as const
/** Current manifest schema version: `manifest.version === VANITY_MANIFEST_VERSION`. */
export const VANITY_MANIFEST_VERSION = 4 as const
/** Published JSON Schema identifier: `manifest.$schema === VANITY_MANIFEST_SCHEMA`. */
export const VANITY_MANIFEST_SCHEMA = 'https://schemas.mszr.dev/vanity/manifest-4.schema.json' as const

/** Source location attached to a manifest record. */
export type VanityManifestSource = VanityDeclaredAt
/** Token declaration record used by a manifest module. */
export type VanityManifestDeclaration = VanityIntrospectionDeclaration
/** Token dependency record used by a manifest module. */
export type VanityManifestDependency = VanityIntrospectionDependency
/** Serialized token expression used by a manifest module. */
export type VanityManifestExpression = VanityIntrospectionExpression
/** Introspected token record embedded in a manifest system map. */
export type VanityManifestToken = VanityIntrospectedToken

/** Manifest record for a recipe or anatomy definition. */
export interface VanityManifestRecipe extends VanitySemanticEntry {
  /** Recipe or anatomy discriminator. */
  readonly kind: 'recipe' | 'anatomy'
  /** Public recipe or anatomy name. */
  readonly name: string
  /** Named anatomy parts, when this is an anatomy. */
  readonly parts?: readonly string[]
  /** Variant names and their accepted values. */
  readonly variants: Readonly<Record<string, readonly string[]>>
  /** Boolean toggle names. */
  readonly toggles: readonly string[]
  /** Default variant and toggle values. */
  readonly defaults: Readonly<Record<string, string | boolean>>
  /** Ports published by the recipe or anatomy. */
  readonly ports: Readonly<Record<string, string>>
}

/** Manifest record for a component-owned custom-property port. */
export interface VanityManifestPort extends VanitySemanticEntry {
  /** Port discriminator. */
  readonly kind: 'port'
  /** Public port name. */
  readonly name: string
  /** CSS variable expression including its default. */
  readonly var: string
  /** CSS data type accepted by the port. */
  readonly type: import('../values/types').VanityCssDataType
  /** Default value serialized into the port metadata. */
  readonly default: string | number
  /** Runtime validation metadata, when configured. */
  readonly validation?: import('../ports/types').VanityPortValidationMeta
}

/** Manifest record for an explicit authoring escape hatch. */
export interface VanityManifestEscape extends VanitySemanticEntry {
  /** Escape discriminator. */
  readonly kind: 'escape'
  /** Escape form used by the author. */
  readonly form: VanityEscapeForm
  /** Normalized escaped value or selector detail. */
  readonly detail: string
  /** Author-provided reason for the escape. */
  readonly reason?: string
  /** Layer receiving the escaped output. */
  readonly layer?: string
}

/** Manifest record for a contrast guarantee or check. */
export interface VanityManifestContrast extends VanitySemanticEntry {
  /** Contrast discriminator. */
  readonly kind: 'contrast'
  /** Token or color pairing being measured. */
  readonly pairing: string
  /** Color scheme used for the measurement. */
  readonly scheme: 'light' | 'dark'
  /** Contrast algorithm used by the check. */
  readonly algorithm: 'apca' | 'wcag2'
  /** Measured contrast value. */
  readonly measured: number
  /** Minimum accepted contrast value. */
  readonly min: number
  /** Whether the measured value satisfies the guarantee. */
  readonly accepted: boolean
}

/** Manifest record for one emitted style class. */
export interface VanityManifestStyle extends VanitySemanticEntry {
  /** Style discriminator. */
  readonly kind: 'style'
  /** Emitted class name. */
  readonly class: string
  /** Optional author-provided style name. */
  readonly name?: string
  /** Semantic token paths referenced by the style. */
  readonly tokens: readonly string[]
}

/** Build-time records grouped by one source module. */
export interface VanityManifestModule extends VanitySemanticEntry {
  /** Module discriminator. */
  readonly kind: 'module'
  /** Package-relative source id. */
  readonly source: string
  /** Recipes and anatomies declared by the module. */
  readonly recipes: Readonly<Record<string, VanityManifestRecipe>>
  /** Ports declared by the module. */
  readonly ports: Readonly<Record<string, VanityManifestPort>>
  /** Styles declared by the module. */
  readonly styles: Readonly<Record<string, VanityManifestStyle>>
  /** Explicit escapes recorded while compiling the module. */
  readonly escapes: readonly VanityManifestEscape[]
  /** Contrast checks recorded while compiling the module. */
  readonly contrast: readonly VanityManifestContrast[]
  /** References in emitted CSS, excluding graph-internal references. */
  readonly tokenUsage: Readonly<Record<string, number>>
}

/** Versioned build manifest combining semantic system data and module evidence. */
export interface VanityManifest {
  /** Published JSON Schema identifier. */
  readonly $schema: typeof VANITY_MANIFEST_SCHEMA
  /** Manifest wire-format discriminator. */
  readonly format: typeof VANITY_MANIFEST_FORMAT
  /** Current manifest schema version. */
  readonly version: typeof VANITY_MANIFEST_VERSION
  /** Byte-for-byte semantic equality with `ds.introspect()`. */
  readonly system: VanitySystemMap
  /** Additional system maps, keyed by compatibility identity. */
  readonly systems: Readonly<Record<string, VanitySystemMap>>
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
  if (!primary) {
    throw new VanityError({
      code: 'VANITY_MANIFEST_INVALID',
      message: 'Manifest v4 requires a consolidated system record',
      path: ['records'],
      fix: 'consolidate a system before building its manifest',
    })
  }

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
