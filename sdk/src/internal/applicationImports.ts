/**
 * Application auto-import policy and resolution. This is intentionally
 * separate from both the compiler and framework adapters: each adapter consumes
 * the same resolved application-module routing without loading another host.
 */

import { resolve } from 'node:path'
import { normalizePath } from '@vanilla-extract/integration'
import { selectAutoImportNames } from './autoImportNames'
import {
  exportModuleFilesFromFile,
  exportNamesFromFile,
  isPackageSpecifier,
  isStyleModuleFile,
} from './exportNames'

export type VanityAppAutoImportPresetName = 'core' | 'vue'

export interface VanityAppAutoImportPreset {
  readonly from: string
  readonly imports: readonly string[]
}

type ExportName<Module> = Extract<keyof Module, string>
interface CheckedPreset<Names extends string> {
  readonly from: string
  readonly imports: readonly Names[]
}

// These checks bind curated application policy to real exports without making
// either entrypoint a runtime dependency of adapter configuration.
const core = {
  from: '@mszr/vanity/runtime',
  imports: ['ports', 'setCustomProperties', 'setCustomProperty'],
} as const satisfies CheckedPreset<ExportName<typeof import('../runtime')>>

const vue = {
  from: '@mszr/vanity/vue',
  imports: ['propsOf', 'useAnatomy', 'usePorts'],
} as const satisfies CheckedPreset<ExportName<typeof import('../vue')>>

/** The framework-agnostic application group used by `autoImports.app`. */
export const vanityCoreAutoImports = [core] as const

/** The Vue application group used by `autoImports.app`. */
export const vanityVueAutoImports = [vue] as const

/** All built-in application groups, keyed by their config name. */
export const vanityAppAutoImportPresets: Record<VanityAppAutoImportPresetName, readonly VanityAppAutoImportPreset[]> = {
  core: vanityCoreAutoImports,
  vue: vanityVueAutoImports,
}

interface VanityAppAutoImportSourceBase {
  /** Package specifier, project-relative file path, or adapter-resolved alias. */
  from: string
}

interface VanityAppAutoImportSourcePlain extends VanityAppAutoImportSourceBase {
  include?: never
  exclude?: never
}

interface VanityAppAutoImportSourceWithInclude extends VanityAppAutoImportSourceBase {
  /** Restrict the source to these named application exports. */
  include: readonly string[]
  exclude?: never
}

interface VanityAppAutoImportSourceWithExclude extends VanityAppAutoImportSourceBase {
  include?: never
  /** Omit these named application exports. */
  exclude: readonly string[]
}

export type VanityAppAutoImportSource
  = VanityAppAutoImportSourcePlain
    | VanityAppAutoImportSourceWithInclude
    | VanityAppAutoImportSourceWithExclude

/** Object form for configuring built-in application groups and barrels. */
export interface VanityAppAutoImportsOptions {
  /** Built-in application groups supplied by Vanity; `vue` also enables Vue helpers. */
  presets?: readonly VanityAppAutoImportPresetName[]
  /** Application barrels; all named value exports are used unless filtered. */
  sources?: readonly (string | VanityAppAutoImportSource)[]
}

/**
 * Controls imports in application and SSR modules.
 *
 * - A string names one application barrel or package source.
 * - An array selects built-in groups such as `core` or `vue`.
 * - An object combines `presets` with filtered `sources`.
 *
 * This affects the application-module role only; it does not inject names
 * into evaluated `*.css.ts` modules.
 */
export type VanityAppAutoImports
  = string
    | readonly VanityAppAutoImportPresetName[]
    | VanityAppAutoImportsOptions

export interface NormalizedAppAutoImports {
  readonly presets: readonly VanityAppAutoImportPreset[]
  readonly sources: readonly VanityAppAutoImportSource[]
}

export interface ResolvedAppAutoImportSource {
  readonly from: string
  readonly imports: readonly string[]
}

export interface ResolvedAppAutoImports {
  readonly sources: readonly ResolvedAppAutoImportSource[]
  readonly names: readonly string[]
  readonly vueTemplates: boolean
}

/**
 * Expand the public shorthand once. Adapters only resolve and render the
 * resulting sources; they do not interpret the public union independently.
 */
export function normalizeAppAutoImports(
  value: VanityAppAutoImports,
): NormalizedAppAutoImports {
  const config: VanityAppAutoImportsOptions = typeof value === 'string'
    ? { sources: [value] }
    : isAppAutoImportsOptions(value)
      ? value
      : { presets: value }
  const sources = (config.sources ?? []).map(source => typeof source === 'string' ? { from: source } : source)

  for (const source of sources)
    assertAppAutoImportSourceFilters(source)

  return {
    presets: (config.presets ?? []).flatMap((name) => {
      const preset = vanityAppAutoImportPresets[name]

      if (preset === undefined)
        throw new TypeError(`[vanity] unknown autoImports.app preset '${name}'`)

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
export function resolveAppAutoImports(
  value: VanityAppAutoImports,
  root: string,
  resolveLocal: (source: string) => string = source => resolveLocalApplicationSource(source, root),
): ResolvedAppAutoImports {
  const normalized = normalizeAppAutoImports(value)
  const sources: ResolvedAppAutoImportSource[] = normalized.presets.map(preset => ({
    from: preset.from,
    imports: [...preset.imports],
  }))

  for (const source of normalized.sources) {
    const from = isPackageSpecifier(source.from) ? source.from : normalizePath(resolveLocal(source.from))
    assertApplicationSourceDoesNotReexportStyleModule(source.from, from, root)
    const names = exportNamesFromFile(from, root)
    sources.push({
      from,
      imports: selectAutoImportNames(
        names,
        source,
        `[vanity] autoImports.app source '${source.from}'`,
      ),
    })
  }

  return {
    sources,
    names: sources.flatMap(source => source.imports).sort(),
    vueTemplates: normalized.presets.some(preset => preset.from === '@mszr/vanity/vue'),
  }
}

export { isPackageSpecifier } from './exportNames'

function assertApplicationSourceDoesNotReexportStyleModule(
  configuredSource: string,
  resolvedSource: string,
  root: string,
): void {
  const styleModule = exportModuleFilesFromFile(resolvedSource, root)
    .find(isStyleModuleFile)
  if (styleModule === undefined)
    return

  throw new Error(
    `[vanity] VANITY_APP_AUTO_IMPORT_STYLE_MODULE: autoImports.app source '${configuredSource}' reaches '${styleModule}', a *.css.ts style module\n`
    + '  why: app and shared barrels must contain application-safe values; style modules are compiler-evaluated\n'
    + `  fix: keep '${styleModule}' out of the barrel and import its emitted handle directly where application code uses it`,
  )
}

function assertAppAutoImportSourceFilters(
  source: {
    from: string
    include?: readonly string[]
    exclude?: readonly string[]
  },
): void {
  if (source.include !== undefined && source.exclude !== undefined) {
    throw new TypeError(
      `[vanity] autoImports.app source '${source.from}' cannot use both include and exclude`,
    )
  }
}

function isAppAutoImportsOptions(
  value: VanityAppAutoImports,
): value is VanityAppAutoImportsOptions {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveLocalApplicationSource(source: string, root: string): string {
  if (source.startsWith('~')) {
    throw new Error(
      `[vanity] autoImports.app cannot resolve '${source}' outside a framework alias; `
      + 'use a project-relative or absolute path',
    )
  }

  return resolve(root, source)
}
