/** Manifest v5: the canonical system map plus build-module provenance. */

import type { VanityDeclarationComponent } from '../css/declaration'
import type { VanityArm } from '../css/rule'
import type { VanityValueSourceSpan } from '../diagnostics'
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
import { createHash } from 'node:crypto'
import { getArmKey } from '../css/rule'
import { serializeDeclarationNumber } from '../css/validation'
import { VanityError } from '../diagnostics'
import { introspectSystem, normalizeSourceId } from './system'

/** Stable manifest format discriminator: `manifest.format === VANITY_MANIFEST_FORMAT`. */
export const VANITY_MANIFEST_FORMAT = 'vanity.manifest/5' as const
/** Current manifest schema version: `manifest.version === VANITY_MANIFEST_VERSION`. */
export const VANITY_MANIFEST_VERSION = 5 as const
/** Published JSON Schema identifier: `manifest.$schema === VANITY_MANIFEST_SCHEMA`. */
export const VANITY_MANIFEST_SCHEMA = 'https://schemas.mszr.dev/vanity/manifest-5.schema.json' as const

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
  readonly classes: NonNullable<VanityRecipeRecord['classes']>
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
  readonly style?: string
  readonly property?: string
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
  /** Whether the threshold was consciously accepted at the definition site. */
  readonly accepted: boolean
  readonly evidence?: import('../evidence').VanityEvidence
  readonly samples?: number
  readonly step?: Readonly<Record<string, string>>
  readonly worst?: Readonly<Record<string, string | number>>
  readonly profile?: 'development' | 'production' | 'both'
  readonly note?: string
  readonly tokens?: readonly string[]
  readonly environment?: Readonly<Record<string, string>>
  /** The pick used a representative target because exact folding was declined. */
  readonly fallback?: string
}

/** One emitted declaration; origins and evidence remain on its classified components. */
export interface VanityManifestStyleDeclaration {
  readonly id: string
  readonly property: string
  readonly value: string
  readonly condition: readonly string[]
  readonly arm: VanityArm & { selector: string, ordinal: number }
  readonly layer: string
  readonly components: readonly VanityDeclarationComponent[]
  readonly tokens: readonly string[]
  readonly source?: VanityValueSourceSpan
  readonly editable: boolean
  readonly reason?: string
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
  readonly declarations: readonly VanityManifestStyleDeclaration[]
  readonly exports: readonly string[]
  readonly layer: string
}

/** Build-time records grouped by one source module. */
export interface VanityManifestModule extends VanitySemanticEntry {
  /** Module discriminator. */
  readonly kind: 'module'
  /** Package-relative source id. */
  readonly source: string
  /** Project-declared surface layer, when configured. */
  readonly layer?: 'primitive' | 'pattern' | 'feature'
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
 * Build one stable Manifest v5 from collected semantic records and emitted CSS.
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
      message: 'Manifest v5 requires a consolidated system record',
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

  for (const record of [...records, ...portableSystems.flatMap(system => system.checks ?? [])]) {
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
        target.styles[record.class] = createStyleEntry(record, target.source)
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
          ...(record.style === undefined ? {} : { style: record.style }),
          ...(record.property === undefined ? {} : { property: record.property }),
        })
        break
      }
      case 'contrast': {
        const target = getModule(record.file)
        target.contrast.push({
          id: `contrast:${target.source}:${record.pairing}:${record.scheme}:${record.algorithm}:${record.min}:${record.line ?? 0}:${record.column ?? 0}${record.profile ? `:${record.profile}` : ''}${record.environment ? `:${JSON.stringify(record.environment)}` : ''}`,
          kind: 'contrast',
          owner: { kind: 'module', id: `module:${target.source}` },
          ...getSource(record, options.root),
          pairing: record.pairing,
          scheme: record.scheme,
          algorithm: record.algorithm,
          measured: record.measured,
          min: record.min,
          accepted: record.accepted,
          ...(record.evidence === undefined ? {} : { evidence: record.evidence }),
          ...(record.samples === undefined ? {} : { samples: record.samples }),
          ...(record.step === undefined ? {} : { step: record.step }),
          ...(record.worst === undefined ? {} : { worst: record.worst }),
          ...(record.profile === undefined ? {} : { profile: record.profile }),
          ...(record.note === undefined ? {} : { note: record.note }),
          ...(record.tokens === undefined ? {} : { tokens: record.tokens }),
          ...(record.environment === undefined ? {} : { environment: record.environment }),
          ...(record.fallback === undefined ? {} : { fallback: record.fallback }),
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
        contrast: [...new Map(entry.contrast.map(contrast => [contrast.id, contrast])).values()].sort((left, right) => left.id.localeCompare(right.id)),
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
    classes: record.classes!,
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
): VanityManifestStyle {
  const declarations = createStyleDeclarations(record, moduleId)
  return {
    id: `style:${record.class}`,
    kind: 'style',
    owner: { kind: 'module', id: `module:${moduleId}` },
    ...getSource(record),
    class: record.class,
    ...(record.name === undefined ? {} : { name: record.name }),
    tokens: [...new Set(declarations.flatMap(declaration => declaration.tokens))],
    declarations,
    exports: record.exports ?? [],
    layer: record.layer!,
  }
}

function createStyleDeclarations(record: VanityStyleRecord, moduleId: string): VanityManifestStyleDeclaration[] {
  const ordinals = new Map<string, number>()
  return (record.emittedDeclarations ?? []).map((declaration) => {
    const armId = createHash('sha256').update(JSON.stringify([getArmKey(declaration.arm), declaration.arm.ordinal])).digest('hex').slice(0, 16)
    const key = `${armId}:${declaration.property}`
    const ordinal = ordinals.get(key) ?? 0
    ordinals.set(key, ordinal + 1)
    return {
      id: `declaration:${moduleId}:${record.class}:${key}:${ordinal}`,
      property: declaration.property,
      value: typeof declaration.value === 'number' ? serializeDeclarationNumber(declaration.property, declaration.value) : declaration.value,
      condition: declaration.conditionPath ?? [],
      arm: declaration.arm,
      layer: declaration.layer,
      components: declaration.components,
      tokens: [...new Set(declaration.components.flatMap(component => component.tokens))],
      ...(declaration.source === undefined ? {} : { source: declaration.source }),
      editable: declaration.editable === true,
      ...(declaration.editable === true ? {} : { reason: declaration.reason ?? 'no independently authored value span is available' }),
    }
  })
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
