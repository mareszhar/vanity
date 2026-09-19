/** Compiler-owned bundling of a Vanity style module for evaluation. */

import type { Loader, PluginBuild } from 'esbuild'
import type { ResolvedConfig } from 'vite'
import type { NormalizedSystemSource } from '../core/systems'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, resolve } from 'node:path'
import { build as esbuild } from 'esbuild'
import { VanityError } from '../../diagnostics'
import { substrate } from '../../substrate'
import { normalizePath } from '../core/path'
import { normalizeModuleIdentity } from '../projection/exportNames'
import {
  applyDebugNamesWithAliases,
  applySourceLocations,
  containsVanityAuthoring,
  getStyleAutoImportAliases,
  readValueImportBindings,
} from './source'

const styleSourceFilter = /\.css\.(?:js|cjs|mjs|jsx|ts|tsx)$/
const authoringSourceFilter = /\.[cm]?[jt]sx?$/

/** Pin one substrate module family before any style-module bundle is run. */
substrate.backend.initialize()
const require = createRequire(import.meta.url)

export interface BundleExternalModule {
  readonly id: string
  /** Canonical module whose namespace is supplied at the external id. */
  readonly moduleFile: string
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
  /**
   * Static re-export graph files to expose as namespaces from one evaluation.
   * Configured system entries use this so a barrel and its leaf share one
   * system instance without making their module exports interchangeable.
   */
  readonly namespaceFiles?: readonly string[]
  /** Preserve source metadata already embedded in a build-JS/portable pair. */
  readonly preserveAuthoredSource?: boolean
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
  namespaceFiles,
  preserveAuthoredSource = false,
}: BundleStyleModuleParams): Promise<BuiltStyleModule> {
  const normalizedEntry = normalizeExistingPath(filePath)
  const normalizedRoot = normalizeExistingPath(root)
  const vanityPackageRoot = normalizeExistingPath(dirname(require.resolve('@mszr/vanity/package.json')))
  const injectedPath = inject === undefined ? undefined : normalizeExistingPath(inject)
  const exposedFiles = namespaceFiles === undefined
    ? undefined
    : [...new Set([
        normalizedEntry,
        ...namespaceFiles.map(normalizeExistingPath),
      ])]
  const usedExternalEntries = new Set<string>()
  const resolvingRequests = new Set<string>()
  const systemResolverSentinel = {}

  const result = await esbuild({
    ...(exposedFiles === undefined
      ? { entryPoints: [filePath] }
      : {
          stdin: {
            contents: createNamespaceEntrySource(exposedFiles),
            loader: 'js',
            resolveDir: root,
            sourcefile: `${filePath}.vanity-namespaces.mjs`,
          },
        }),
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
          build.onResolve({ filter: /.*/ }, async (args) => {
            const source = applyBundleAlias(args.path, alias)
            const requestKey = `configured\0${args.path}\0${args.importer}\0${args.namespace}\0${args.resolveDir}\0${args.kind}`
            if (args.pluginData === systemResolverSentinel || resolvingRequests.has(requestKey))
              return undefined
            resolvingRequests.add(requestKey)

            // Ask esbuild to resolve the request with the same aliases,
            // extensions, package exports, and symlink policy as the bundle.
            // Passing our own plugin name prevents this callback from
            // recursively resolving itself.
            try {
              const resolved = await build.resolve(source, {
                pluginName: 'vanity-configured-system-externals',
                ...(args.importer ? { importer: args.importer } : {}),
                ...(args.namespace ? { namespace: args.namespace } : {}),
                ...(args.resolveDir ? { resolveDir: args.resolveDir } : {}),
                kind: args.kind,
                pluginData: systemResolverSentinel,
                ...(args.with === undefined ? {} : { with: args.with }),
              })
              if (resolved.errors.length > 0 || !isAbsolute(resolved.path))
                return undefined
              // The auto-import shim is an implementation detail of this
              // bundle. It re-exports the configured system, but externalizing
              // the shim itself makes esbuild reject its injected path; only
              // the shim's resolved system imports should become externals.
              if (injectedPath !== undefined
                && normalizeExistingPath(resolved.path) === injectedPath) {
                return undefined
              }

              const resolvedModule = normalizeExistingPath(resolved.path)
              // The configured-system namespace table was built from this
              // same resolved graph. Matching the physical module directly
              // avoids reparsing every configured re-export graph for every
              // unrelated import in a style bundle.
              const external = externalModules.find(module => module.moduleFile === resolvedModule)
              if (external === undefined)
                return undefined
              usedExternalEntries.add(external.source.entry)
              return { path: external.id, external: true }
            }
            finally {
              resolvingRequests.delete(requestKey)
            }
          })
        },
      },
      {
        name: 'vanity-substrate-externals',
        setup(build) {
          build.onResolve({ filter: /^(?:@vanilla-extract\/|lightningcss$)/ }, args => ({
            path: substrate.backend.resolveModule(args.path),
            external: true,
          }))
        },
      },
      {
        name: 'vanity-authoring-source',
        setup(build) {
          const isVanityImplementation = (file: string): boolean => {
            const normalized = normalizePath(file)
            return normalized === vanityPackageRoot || normalized.startsWith(`${vanityPackageRoot}/`)
          }

          build.onLoad({ filter: authoringSourceFilter }, async ({ path }) => {
            const normalizedPath = normalizePath(path)
            const canonicalPath = normalizeExistingPath(normalizedPath)
            const isProjectSource = canonicalPath === normalizedRoot
              || canonicalPath.startsWith(`${normalizedRoot}/`)
            if (isVanityImplementation(canonicalPath) && !isProjectSource)
              return undefined

            const original = await readFile(path, 'utf-8')
            const isStyleModule = styleSourceFilter.test(path)
            const authoringAliases = isStyleModule
              ? await resolveStyleAuthoringAliases(
                  original,
                  path,
                  ambientAliases,
                  alias,
                  build,
                  systemResolverSentinel,
                )
              : ambientAliases
            const isVanityAuthoring = containsVanityAuthoring(original, path, authoringAliases)
            if (!isStyleModule && !isVanityAuthoring && canonicalPath !== normalizedEntry)
              return undefined

            const named = isStyleModule && isVanityAuthoring
              ? applyDebugNamesWithAliases(original, path, authoringAliases)
              : original
            const located = isVanityAuthoring && !(preserveAuthoredSource && !isStyleModule)
              ? applySourceLocations(named, path, root, authoringAliases)
              : named

            const source = isStyleModule
              ? substrate.backend.addFileScope({
                  source: located,
                  filePath: path,
                  rootPath: root,
                  packageName: getPackageName(dirname(path), root),
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

  if (!outputFiles || outputFiles.length !== 1) {
    throw new VanityError({
      code: 'VANITY_COMPILER_INVALID_INPUT',
      message: `invalid style-module compilation for ${filePath}`,
      path: [filePath],
      fix: 'check the style-module source and compiler configuration, then rebuild it',
    })
  }

  return {
    source: outputFiles[0].text,
    // Dependency ownership is derived from the resolved graph, not from the
    // authoring loader. This keeps JSON and other data inputs visible while
    // stopping the Vanity implementation graph at its package boundary.
    watchFiles: collectRelevantInputs(metafile.inputs, root, normalizedEntry, vanityPackageRoot),
    externalSystemEntries: [...usedExternalEntries].sort(),
  }
}

/** Build one bundle that evaluates every graph module once and returns each namespace. */
function createNamespaceEntrySource(files: readonly string[]): string {
  const imports = files.map((file, index) =>
    `import * as __vanityModule${index} from ${JSON.stringify(file)}\n`).join('')
  const entries = files.map((file, index) =>
    `${JSON.stringify(file)}: __vanityModule${index}`).join(',\n')
  return `${imports}export const __vanityEntry = __vanityModule0
export const __vanityModules = {
${entries}
}
`
}

interface MetafileImport {
  readonly external?: boolean
  readonly path: string
}

interface MetafileInput {
  readonly imports?: readonly MetafileImport[]
}

/**
 * Select consumer dependencies from esbuild's resolved graph.
 *
 * Authoring instrumentation intentionally only handles source modules that
 * need labels/scopes. Watch ownership is broader: data files and ordinary
 * user helpers still affect the compiled style. Once traversal enters the
 * Vanity package itself, its implementation dependencies are no longer
 * consumer inputs; a direct import from a user module remains observable
 * because traversal reaches that package from a user-owned importer.
 */
function collectRelevantInputs(
  inputs: Readonly<Record<string, MetafileInput>>,
  root: string,
  entry: string,
  vanityPackageRoot: string,
): string[] {
  const byPath = new Map<string, MetafileInput>()
  for (const [file, input] of Object.entries(inputs)) {
    if (file.startsWith('<'))
      continue
    byPath.set(normalizeInputPath(file, root), input)
  }

  const relevant = new Set<string>()
  const visited = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current))
      continue
    visited.add(current)

    if (isWithin(current, vanityPackageRoot))
      continue
    relevant.add(current)

    for (const dependency of byPath.get(current)?.imports ?? []) {
      if (dependency.external)
        continue
      const resolved = findMetafileInput(dependency.path, current, root, byPath)
      if (resolved !== undefined && !visited.has(resolved))
        queue.push(resolved)
    }
  }

  return [...relevant].sort()
}

function findMetafileInput(
  imported: string,
  importer: string,
  root: string,
  inputs: ReadonlyMap<string, MetafileInput>,
): string | undefined {
  const candidates = isAbsolute(imported)
    ? [imported]
    : [resolve(root, imported), resolve(dirname(importer), imported)]

  for (const candidate of candidates) {
    const normalized = normalizeInputPath(candidate, root)
    if (inputs.has(normalized))
      return normalized
  }
  return undefined
}

function normalizeInputPath(file: string, root: string): string {
  return normalizeExistingPath(isAbsolute(file) ? file : resolve(root, file))
}

function isWithin(file: string, directory: string): boolean {
  return file === directory || file.startsWith(`${directory}/`)
}

function normalizeExistingPath(file: string): string {
  return normalizeModuleIdentity(file.replace(/[?#].*$/, ''))
}

function getPackageName(file: string, root: string): string {
  try {
    return substrate.backend.getPackageName(file)
  }
  catch {
    try {
      return substrate.backend.getPackageName(root)
    }
    catch {
      return 'vanity'
    }
  }
}

async function resolveStyleAuthoringAliases(
  source: string,
  filePath: string,
  ambientAliases: ReadonlyMap<string, string> | undefined,
  aliases: Readonly<Record<string, string>>,
  resolver: Pick<PluginBuild, 'resolve'>,
  resolverSentinel: object,
): Promise<ReadonlyMap<string, string> | undefined> {
  const bindings = readValueImportBindings(source, filePath)
  if (bindings.length === 0 && ambientAliases === undefined)
    return undefined

  const authoringAliases = new Map(ambientAliases ?? [])
  for (const binding of bindings) {
    const resolved = await resolver.resolve(applyBundleAlias(binding.source, aliases), {
      pluginName: 'vanity-authoring-source',
      importer: filePath,
      resolveDir: dirname(filePath),
      kind: 'import-statement',
      pluginData: resolverSentinel,
    })
    if (resolved.errors.length > 0 || !isAbsolute(resolved.path))
      continue

    try {
      const target = await readFile(resolved.path, 'utf-8')
      const mapped = getStyleAutoImportAliases(target, resolved.path, [binding.imported])
        .get(binding.imported)
      if (mapped !== undefined)
        authoringAliases.set(binding.local, mapped)
    }
    catch {
      // esbuild remains the authority for the import's actual error. This
      // optional provenance lookup must not turn a valid unresolved graph
      // into a second, less actionable compiler error.
    }
  }

  return authoringAliases
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
