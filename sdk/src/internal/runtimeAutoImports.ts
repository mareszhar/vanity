import type {
  VanityRuntimeAutoImportPreset,
  VanityRuntimeAutoImportPresetName,
} from './appImports'
import { vanityRuntimeAutoImportPresets } from './appImports'

interface VanityRuntimeAutoImportSourceBase {
  /** A package specifier, file path, or adapter alias. */
  from: string
}

interface VanityRuntimeAutoImportSourcePlain extends VanityRuntimeAutoImportSourceBase {
  include?: never
  exclude?: never
}

interface VanityRuntimeAutoImportSourceWithInclude extends VanityRuntimeAutoImportSourceBase {
  /** Restrict the source to these named runtime exports. */
  include: readonly string[]
  exclude?: never
}

interface VanityRuntimeAutoImportSourceWithExclude extends VanityRuntimeAutoImportSourceBase {
  include?: never
  /** Omit these named runtime exports. */
  exclude: readonly string[]
}

export type VanityRuntimeAutoImportSource
  = VanityRuntimeAutoImportSourcePlain
    | VanityRuntimeAutoImportSourceWithInclude
    | VanityRuntimeAutoImportSourceWithExclude

export interface VanityRuntimeAutoImportsOptions {
  /** Built-in runtime groups supplied by Vanity; `vue` adds the Vue adapter. */
  presets?: readonly VanityRuntimeAutoImportPresetName[]
  /** Application barrels; all named value exports are used by default. */
  sources?: readonly (string | VanityRuntimeAutoImportSource)[]
}

/**
 * Application-lane imports: a string names one source, an array selects
 * built-in presets, and the object form combines presets with sources.
 */
export type VanityRuntimeAutoImports
  = string
    | readonly VanityRuntimeAutoImportPresetName[]
    | VanityRuntimeAutoImportsOptions

export interface NormalizedRuntimeAutoImports {
  readonly presets: readonly VanityRuntimeAutoImportPreset[]
  readonly sources: readonly VanityRuntimeAutoImportSource[]
}

/**
 * Expand the public shorthand once. Adapters only resolve and render the
 * resulting sources; they do not interpret the public union independently.
 */
export function normalizeRuntimeAutoImports(
  value: VanityRuntimeAutoImports,
): NormalizedRuntimeAutoImports {
  const config: VanityRuntimeAutoImportsOptions = typeof value === 'string'
    ? { sources: [value] }
    : isRuntimeAutoImportsOptions(value)
      ? value
      : { presets: value }
  const sources = (config.sources ?? []).map(source => typeof source === 'string' ? { from: source } : source)

  for (const source of sources)
    assertRuntimeAutoImportSourceFilters(source)

  return {
    presets: (config.presets ?? []).flatMap((name) => {
      const preset = vanityRuntimeAutoImportPresets[name]

      if (preset === undefined)
        throw new TypeError(`[vanity] unknown app.runtimeAutoImports preset '${name}'`)

      return preset
    }),
    sources,
  }
}

export function isPackageSpecifier(value: string): boolean {
  return !value.startsWith('.')
    && !value.startsWith('/')
    && !value.startsWith('~')
    && !/^[a-z]:[\\/]/i.test(value)
}

export function runtimeAutoImportIgnore(
  source: VanityRuntimeAutoImportSource,
): ((name: string) => boolean) | undefined {
  assertRuntimeAutoImportSourceFilters(source)

  if (source.include === undefined && source.exclude === undefined)
    return undefined

  return source.include !== undefined
    ? name => !source.include.includes(name)
    : name => source.exclude.includes(name)
}

function assertRuntimeAutoImportSourceFilters(
  source: {
    from: string
    include?: readonly string[]
    exclude?: readonly string[]
  },
): void {
  if (source.include !== undefined && source.exclude !== undefined) {
    throw new TypeError(
      `[vanity] app.runtimeAutoImports source '${source.from}' cannot use both include and exclude`,
    )
  }
}

function isRuntimeAutoImportsOptions(
  value: VanityRuntimeAutoImports,
): value is VanityRuntimeAutoImportsOptions {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
