/** Compiler-owned bundling of a Vanity style module for evaluation. */

import type { Loader } from 'esbuild'
import type { ResolvedConfig } from 'vite'
import type { NormalizedSystemSource } from '../core/systems'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { build as esbuild } from 'esbuild'
import { substrate } from '../../substrate'
import { resolveConfiguredSystemImport } from '../core/systems'
import { normalizePath } from '../path'
import {
  applyDebugNamesWithAliases,
  applySourceLocations,
} from './source'

const styleSourceFilter = /\.css\.(?:js|cjs|mjs|jsx|ts|tsx)$/
const authoringSourceFilter = /\.[cm]?[jt]sx?$/

/** Pin one substrate module family before any style-module bundle is run. */
substrate.modules.initialize()

export interface BundleExternalModule {
  readonly id: string
  readonly source: NormalizedSystemSource
  readonly exports: Record<string, unknown>
}

export interface BundleStyleModuleParams {
  readonly filePath: string
  readonly root: string
  readonly alias: Record<string, string>
  /** The auto-import shim module, if the system option is configured. */
  readonly inject?: string
  /** Alias provenance declared by the configured style auto-import barrel. */
  readonly ambientAliases?: ReadonlyMap<string, string>
  /** Already-evaluated configured systems imported by this style module. */
  readonly externalModules?: readonly BundleExternalModule[]
}

export interface BuiltStyleModule {
  readonly source: string
  readonly watchFiles: string[]
  readonly externalSystemEntries: string[]
}

/**
 * Bundle one style module for evaluation: esbuild inlines its import graph,
 * every `*.css.ts` file gets port labels and a file scope, and the substrate
 * stays external (as absolute paths) so the evaluated bundle shares the css
 * adapter instance with this plugin. vanity itself is bundled in — it ships
 * ESM-only, and the evaluation sandbox is CommonJS.
 */
export async function buildStyleModule({
  filePath,
  root,
  alias,
  inject,
  ambientAliases,
  externalModules = [],
}: BundleStyleModuleParams): Promise<BuiltStyleModule> {
  const packageName = substrate.modules.getPackageName(root)
  const usedExternalEntries = new Set<string>()

  const result = await esbuild({
    entryPoints: [filePath],
    metafile: true,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    absWorkingDir: root,
    alias,
    inject: inject === undefined ? [] : [inject],
    plugins: [
      {
        name: 'vanity-configured-system-externals',
        setup(build) {
          if (externalModules.length === 0)
            return
          build.onResolve({ filter: /.*/ }, (args) => {
            const source = applyBundleAlias(args.path, alias)
            const matched = resolveConfiguredSystemImport(
              source,
              args.importer || undefined,
              externalModules.map(module => module.source),
              root,
            )
            if (!matched)
              return undefined
            const external = externalModules.find(module => module.source.entry === matched.entry)!
            usedExternalEntries.add(matched.entry)
            return { path: external.id, external: true }
          })
        },
      },
      {
        name: 'vanity-substrate-externals',
        setup(build) {
          build.onResolve({ filter: /^(?:@vanilla-extract\/|lightningcss$)/ }, args => ({
            path: substrate.modules.resolveModule(args.path),
            external: true,
          }))
        },
      },
      {
        name: 'vanity-authoring-source',
        setup(build) {
          build.onLoad({ filter: authoringSourceFilter }, async ({ path }) => {
            const normalizedPath = normalizePath(path)
            const normalizedRoot = `${normalizePath(root).replace(/\/$/, '')}/`

            // Only compiler-owned app source receives provenance metadata.
            // Dependencies keep their native loader/transform pipeline and
            // cannot pollute the app's diagnostic source universe.
            if (!normalizedPath.startsWith(normalizedRoot))
              return undefined

            const original = await readFile(path, 'utf-8')
            const isStyleModule = styleSourceFilter.test(path)
            const named = isStyleModule
              ? applyDebugNamesWithAliases(original, path, ambientAliases)
              : original
            const located = applySourceLocations(named, path, root, ambientAliases)

            const source = isStyleModule
              ? substrate.modules.addFileScope({
                  source: located,
                  filePath: path,
                  rootPath: root,
                  packageName,
                })
              : located

            return {
              contents: source,
              loader: getSourceLoader(path),
              resolveDir: dirname(path),
            }
          })
        },
      },
    ],
  })

  const { outputFiles, metafile } = result

  if (!outputFiles || outputFiles.length !== 1)
    throw new Error(`Invalid style-module compilation for ${filePath}`)

  return {
    source: outputFiles[0].text,
    watchFiles: Object.keys(metafile.inputs).map(file => join(root, file)),
    externalSystemEntries: [...usedExternalEntries].sort(),
  }
}

function applyBundleAlias(source: string, aliases: Readonly<Record<string, string>>): string {
  for (const [find, replacement] of Object.entries(aliases)) {
    if (source === find)
      return replacement
    if (source.startsWith(`${find}/`))
      return `${replacement.replace(/\/$/, '')}${source.slice(find.length)}`
  }
  return source
}

function getSourceLoader(path: string): Loader {
  if (/\.tsx$/i.test(path))
    return 'tsx'
  if (/\.(?:ts|mts|cts)$/i.test(path))
    return 'ts'
  if (/\.jsx$/i.test(path))
    return 'jsx'
  return 'js'
}

/** The string-keyed subset of the resolved Vite aliases, for esbuild's resolver. */
export function convertViteAliasesToEsbuild(config: ResolvedConfig): Record<string, string> {
  const entries = config.resolve.alias
    .filter(entry => typeof entry.find === 'string' && typeof entry.replacement === 'string')
    .map(entry => [entry.find, entry.replacement])

  return Object.fromEntries(entries)
}
