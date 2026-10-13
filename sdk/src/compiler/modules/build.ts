/** Compiler-owned bundling of a Vanity style module for evaluation. */

import type { Loader, PluginBuild } from 'esbuild'
import type { SourceMapPayload } from 'node:module'
import type { NormalizedSystemSource } from '../core/systems'
import type { ModuleInputs } from './graph'
import type { ResolvedStyleImport, StyleModuleHost } from './resolution'
import { readFile } from 'node:fs/promises'
import { createRequire, isBuiltin } from 'node:module'
import { dirname, isAbsolute, resolve } from 'node:path'
import { build as esbuild } from 'esbuild'
import { VanityError } from '../../diagnostics'
import { substrate } from '../../substrate'
import { normalizePath } from '../core/path'
import { normalizeModuleIdentity } from '../projection/exportNames'
import { findModuleInput, getModuleInputs } from './graph'
import { getImportedPackageName, getResolvedPackage, isBrowserDisabledPackageRequest } from './resolution'
import {
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

export interface BundleStyleModuleParams extends StyleModuleHost {
  readonly filePath: string
  readonly root: string
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
  readonly sourceMap: SourceMapPayload
  readonly clientImports: readonly ResolvedStyleImport[]
  readonly inputs: ModuleInputs
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
  resolve: resolveImport,
  load: loadImport,
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
  const clientImports: ResolvedStyleImport[] = []
  const packages = new Map<string, ReturnType<typeof getResolvedPackage>>()
  const systemResolverSentinel = {}
  const isVanityImplementation = (file: string): boolean => {
    const normalized = normalizePath(file)
    return normalized === vanityPackageRoot || normalized.startsWith(`${vanityPackageRoot}/`)
  }

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
    sourcemap: 'external',
    outfile: `${filePath}.vanity.cjs`,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    absWorkingDir: root,
    inject: inject === undefined ? [] : [inject],
    plugins: [
      {
        name: 'vanity-host-resolution',
        setup(build) {
          build.onResolve({ filter: /.*/ }, async (args) => {
            if (args.pluginData === systemResolverSentinel)
              return undefined
            if (/^(?:@vanilla-extract\/|lightningcss$)/.test(args.path))
              return { path: substrate.backend.resolveModule(args.path), external: true }
            const importer = args.importer || resolve(root, 'package.json')
            // CSSTree's Node ESM entry reads its data with import.meta.url.
            // Keep the SDK's compiler dependency native in the CommonJS
            // evaluation sandbox; authored imports still use the host rules.
            if (isVanityImplementation(importer) && /^css-tree(?:\/|$)/.test(args.path))
              return { path: require.resolve(args.path), external: true }
            const resolveNodeImport = (request: string) => build.resolve(request, {
              importer: importer.replace(/[?#].*$/, ''),
              resolveDir: args.resolveDir || dirname(importer),
              namespace: 'file',
              kind: args.kind,
              pluginData: systemResolverSentinel,
            })
            let resolved: { path: string, external?: boolean, namespace?: string }
            if (args.kind === 'entry-point' || isVanityImplementation(importer)) {
              const node = await resolveNodeImport(args.path)
              if (node.errors.length > 0)
                return { errors: node.errors }
              resolved = { path: node.path, external: node.external }
            }
            else {
              try {
                let answer: Awaited<ReturnType<StyleModuleHost['resolve']>>
                try {
                  answer = await resolveImport(args.path, importer)
                }
                catch (error) {
                  // Supported hosts disagree on disabled exports: some return
                  // a stub or a file, others throw before producing an answer.
                  // Only the named package's own metadata authorizes recovery.
                  if (getImportedPackageName(args.path) === undefined)
                    throw error
                  const node = await resolveNodeImport(args.path)
                  if (node.errors.length > 0 || !isBrowserDisabledPackageRequest(args.path, node.path, await getResolvedPackage(node.path, packages)))
                    throw error
                  answer = { id: node.path, external: node.external }
                }
                if (answer == null)
                  throw new Error('the host returned no resolution')
                const stub = answer.id.startsWith('__vite-browser-external')
                if (stub && isBuiltin(args.path))
                  return { path: args.path, external: true }
                const packageName = getImportedPackageName(args.path)
                const pkg = await getResolvedPackage(answer.id, packages)
                const nativeExternal = answer.external && !isAbsolute(answer.id) && !answer.id.startsWith('\0')
                if (nativeExternal || (packageName !== undefined && (packageName === pkg?.metadata.name || stub))) {
                  const node = await resolveNodeImport(nativeExternal ? answer.id : args.path)
                  const disabled = stub && node.errors.length === 0 && isBrowserDisabledPackageRequest(args.path, node.path, await getResolvedPackage(node.path, packages))
                  if (node.errors.length === 0 && (!stub || disabled)) {
                    resolved = { path: node.path, external: node.external }
                  }
                  else if (!stub) {
                    throw new Error(node.errors.map(error => error.text).join('; '))
                  }
                  else {
                    throw new Error('the client resolver selected an empty browser module. Import the package by name in the style module.')
                  }
                }
                else {
                  if (stub)
                    throw new Error('the client resolver selected an empty browser module. Import the package by name in the style module.')
                  resolved = { path: answer.id, ...(!isAbsolute(answer.id) || /[?#]/.test(answer.id) ? { namespace: 'vanity-host' } : {}) }
                  clientImports.push({ specifier: args.path, importer, file: answer.id })
                }
              }
              catch (error) {
                return { errors: [{ text: `Cannot resolve '${args.path}' imported by '${importer}': ${error instanceof Error ? error.message : String(error)}` }] }
              }
            }
            if (isAbsolute(resolved.path) && normalizeExistingPath(resolved.path) !== injectedPath) {
              const external = externalModules.find(module => module.moduleFile === normalizeExistingPath(resolved.path))
              if (external !== undefined) {
                usedExternalEntries.add(external.source.entry)
                return { path: external.id, external: true }
              }
            }
            return resolved
          })
        },
      },
      {
        name: 'vanity-authoring-source',
        setup(build) {
          build.onLoad({ filter: /.*/ }, async ({ path, namespace }) => {
            const normalizedPath = normalizePath(path)
            const canonicalPath = isAbsolute(normalizedPath) ? normalizeExistingPath(normalizedPath) : normalizedPath
            const isProjectSource = canonicalPath === normalizedRoot
              || canonicalPath.startsWith(`${normalizedRoot}/`)
            if (isVanityImplementation(canonicalPath) && !isProjectSource)
              return undefined

            if (namespace !== 'vanity-host' && !authoringSourceFilter.test(path))
              return undefined
            const loaded = namespace === 'vanity-host' ? await loadImport(path) : undefined
            if (namespace === 'vanity-host' && loaded == null && !isAbsolute(path))
              throw new Error(`Host did not load virtual module '${path}'`)
            const original = loaded == null ? await readFile(path.replace(/[?#].*$/, ''), 'utf-8') : typeof loaded === 'string' ? loaded : loaded.code
            const isStyleModule = styleSourceFilter.test(path)
            const authoringAliases = isStyleModule
              ? await resolveStyleAuthoringAliases(
                  original,
                  path,
                  ambientAliases,
                  build,
                )
              : ambientAliases
            const isVanityAuthoring = containsVanityAuthoring(original, path, authoringAliases)
            if (namespace !== 'vanity-host' && !isStyleModule && !isVanityAuthoring && canonicalPath !== normalizedEntry)
              return undefined

            const located = isVanityAuthoring && !(preserveAuthoredSource && !isStyleModule)
              ? applySourceLocations(original, path, normalizedRoot, authoringAliases, isStyleModule)
              : original

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
              resolveDir: isAbsolute(path) ? dirname(path.replace(/[?#].*$/, '')) : root,
            }
          })
        },
      },
    ],
  })

  const { outputFiles, metafile } = result

  const compiled = outputFiles?.find(file => file.path.endsWith('.cjs'))
  const sourceMap = outputFiles?.find(file => file.path.endsWith('.map'))
  if (compiled === undefined || sourceMap === undefined) {
    throw new VanityError({
      code: 'VANITY_COMPILER_INVALID_INPUT',
      message: `invalid style-module compilation for ${filePath}`,
      path: [filePath],
      fix: 'check the style-module source and compiler configuration, then rebuild it',
    })
  }

  const inputs = getModuleInputs(metafile.inputs, root)
  return {
    source: compiled.text,
    sourceMap: JSON.parse(sourceMap.text) as SourceMapPayload,
    clientImports,
    inputs,
    // Dependency ownership is derived from the resolved graph, not from the
    // authoring loader. This keeps JSON and other data inputs visible while
    // stopping the Vanity implementation graph at its package boundary.
    watchFiles: collectRelevantInputs(inputs, root, normalizedEntry, vanityPackageRoot),
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
  inputs: ModuleInputs,
  root: string,
  entry: string,
  vanityPackageRoot: string,
): string[] {
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
    if (isAbsolute(current))
      relevant.add(current)

    for (const dependency of inputs.get(current)?.imports ?? []) {
      if (dependency.external)
        continue
      const resolved = findModuleInput(dependency.path, current, root, inputs)
      if (resolved !== undefined && !visited.has(resolved))
        queue.push(resolved)
    }
  }

  return [...relevant].sort()
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
  resolver: Pick<PluginBuild, 'resolve'>,
): Promise<ReadonlyMap<string, string> | undefined> {
  const bindings = readValueImportBindings(source, filePath)
  if (bindings.length === 0 && ambientAliases === undefined)
    return undefined

  const authoringAliases = new Map(ambientAliases ?? [])
  for (const binding of bindings) {
    const resolved = await resolver.resolve(binding.source, {
      pluginName: 'vanity-authoring-source',
      importer: filePath,
      resolveDir: dirname(filePath),
      kind: 'import-statement',
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

function getSourceLoader(path: string): Loader {
  if (/\.tsx(?:[?#]|$)/i.test(path))
    return 'tsx'
  if (/\.(?:ts|mts|cts)(?:[?#]|$)/i.test(path))
    return 'ts'
  if (/\.jsx(?:[?#]|$)/i.test(path))
    return 'jsx'
  return 'js'
}
