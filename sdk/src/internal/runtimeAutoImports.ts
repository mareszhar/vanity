import type {
  VanityRuntimeAutoImportPreset,
  VanityRuntimeAutoImportPresetName,
} from './appImports'
import { resolve } from 'node:path'
import { normalizePath } from '@vanilla-extract/integration'
import { vanityRuntimeAutoImportPresets } from './appImports'
import { selectAutoImportNames } from './autoImportNames'
import { exportNamesFromFile } from './exportNames'

interface VanityRuntimeAutoImportSourceBase {
  /** Package specifier, project-relative file path, or adapter-resolved alias. */
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

/** Object form for configuring built-in runtime groups and application barrels. */
export interface VanityRuntimeAutoImportsOptions {
  /** Built-in runtime groups supplied by Vanity; `vue` also enables Vue helpers. */
  presets?: readonly VanityRuntimeAutoImportPresetName[]
  /** Application barrels; all named value exports are used unless filtered. */
  sources?: readonly (string | VanityRuntimeAutoImportSource)[]
}

/**
 * Controls runtime-facing imports in application and SSR modules.
 *
 * - A string names one application barrel or package source.
 * - An array selects built-in presets such as `core` or `vue`.
 * - An object combines `presets` with filtered `sources`.
 *
 * This affects the application lane only; it does not inject names into
 * evaluated `*.css.ts` modules.
 */
export type VanityRuntimeAutoImports
  = string
    | readonly VanityRuntimeAutoImportPresetName[]
    | VanityRuntimeAutoImportsOptions

export interface NormalizedRuntimeAutoImports {
  readonly presets: readonly VanityRuntimeAutoImportPreset[]
  readonly sources: readonly VanityRuntimeAutoImportSource[]
}

export interface ResolvedRuntimeAutoImportSource {
  readonly from: string
  readonly imports: readonly string[]
}

export interface ResolvedRuntimeAutoImports {
  readonly sources: readonly ResolvedRuntimeAutoImportSource[]
  readonly names: readonly string[]
  readonly vueTemplates: boolean
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

/**
 * Resolve every application source through the same static export discovery
 * used by preparation. Adapters may provide a local-path resolver for host
 * aliases; package specifiers remain package specifiers in the result.
 */
export function resolveRuntimeAutoImports(
  value: VanityRuntimeAutoImports,
  root: string,
  resolveLocal: (source: string) => string = source => resolveLocalRuntimeSource(source, root),
): ResolvedRuntimeAutoImports {
  const normalized = normalizeRuntimeAutoImports(value)
  const sources: ResolvedRuntimeAutoImportSource[] = normalized.presets.map(preset => ({
    from: preset.from,
    imports: [...preset.imports],
  }))

  for (const source of normalized.sources) {
    const from = isPackageSpecifier(source.from) ? source.from : normalizePath(resolveLocal(source.from))
    const names = exportNamesFromFile(from, root)
    sources.push({
      from,
      imports: selectAutoImportNames(
        names,
        source,
        `[vanity] app.runtimeAutoImports source '${source.from}'`,
      ),
    })
  }

  return {
    sources,
    names: sources.flatMap(source => source.imports).sort(),
    vueTemplates: normalized.presets.some(preset => preset.from === '@mszr/vanity/vue'),
  }
}

export function isPackageSpecifier(value: string): boolean {
  return !value.startsWith('.')
    && !value.startsWith('/')
    && !value.startsWith('~')
    && !/^[a-z]:[\\/]/i.test(value)
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

function resolveLocalRuntimeSource(source: string, root: string): string {
  if (source.startsWith('~')) {
    throw new Error(
      `[vanity] app.runtimeAutoImports cannot resolve '${source}' outside a framework alias; `
      + 'use a project-relative or absolute path',
    )
  }

  return resolve(root, source)
}
