/**
 * The vanity Vite plugin — evaluates `*.css.ts` at build time and emits
 * static CSS ([patterns.md §1], [workspace.md §3]). App code never
 * sees an authoring call: a style module's exports arrive as serialized
 * classes, ports, recipes, and metadata, and its CSS arrives as a virtual
 * `.vanity.css` module the bundler treats like any stylesheet.
 *
 * The pipeline is the substrate's proven integration model (the one its
 * webpack/esbuild/next plugins ship on): esbuild bundles the style module
 * with debug names and file scopes injected, and the bundle is evaluated
 * in-process against the css adapter. The substrate's newer vite-node
 * compiler is not reusable here — its file filter is hardcoded to `*.css.ts`
 * at every level. If that filter ever becomes configurable upstream, this
 * plugin can move over without a public change.
 *
 * **HMR is in-place, never stacked.** Each style file's CSS lives behind a
 * stable* virtual id (`/path/File.css.ts.vanity.css`) whose content is
 * served from an in-memory store — so when a save changes the CSS, the same
 * id delivers the new text and Vite's client replaces the existing style tag
 * instead of appending a second one. Style modules self-accept in dev (an
 * edit that only moves declarations swaps CSS with no reload); when the
 * export shape* changes, importers hold stale bindings, so the plugin sends
 * one full reload instead. Files a style module bundles in (tokens, shared
 * styles) are watched and mapped back to their dependents, so editing a
 * token file hot-updates every style module built on it.
 *
 * **The manifest rides the same evaluation** ([spec-introspection.md §2]):
 * each pass drains the inspection channel, and the projection lands in
 * `.vanity/manifest.json` — debounced in dev, once per build — plus the live
 * `/__vanity/` endpoints (`manifest.json`, and the DevTools view over it).
 *
 * Two deliberate deviations from the substrate's `processVanillaFile`:
 *
 * - **Substrate imports resolve from vanity, not the user's app.** The seam
 *   rule means users never install `@vanilla-extract/*` themselves, so the
 *   bundle's externals are rewritten to absolute paths resolved from here —
 *   under strict package isolation (pnpm) a bare specifier would not resolve
 *   from the evaluated file's directory.
 * - **The adapter binds in-process**, not through a `require` inside the
 *   evaluated source, guaranteeing the bundle and the plugin share one css
 *   instance ([bundling section] on how instance identity is pinned).
 *
 * The plugin composes two layers:
 * 1. The `*.css.ts` processor described above.
 * 2. The vanilla-extract plugin itself, for any `*.css.ts` files that coexist.
 */

import type { Plugin, PluginOption, ResolvedConfig, ViteDevServer } from 'vite'
import type { autoImportDelegateHooks } from './compiler/auto-imports/autoImportDelegate'
import type { EvaluatedSystem, NormalizedSystemSource } from './compiler/core/systems'
import type { StyleAutoImportInjection } from './compiler/core/transform'
import type {
  VanityAppAutoImports,
  VanityConfig,
} from './config'
import type { VanityInspectRecord } from './introspect/records'
import type { VanityPortableSystem } from './system/contract'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, resolve } from 'node:path'
import { pid } from 'node:process'
import autoImportVite from 'unplugin-auto-import/vite'
import { isPackageSpecifier, resolveAppAutoImports } from './compiler/auto-imports/applicationImports'
import {
  getAppAutoImportsForSystem,
  getAutoImportRoles,
  planStyleAutoImports,
} from './compiler/auto-imports/autoImportPlan'
import { writeAutoImportDeclarationFiles, writeAutoImportDeclarations } from './compiler/auto-imports/autoImportWriter'
import { normalizePath } from './compiler/core/path'
import {
  assertFreshPortablePair,
  assertNamespaceOwnership,
  getRuntimeIdentity,
  normalizeSystemSources,
  resolveConfiguredSystemImport,
} from './compiler/core/systems'
import { transformStyleModule } from './compiler/core/transform'
import { resolveCssVirtualAlias } from './compiler/hmr/state'
import { handleHotUpdate } from './compiler/hmr/update'
import { vanityViteHost } from './compiler/hosts/viteHost'
import { buildStyleModule, convertViteAliasesToEsbuild } from './compiler/modules/build'
import { executeBundle } from './compiler/modules/evaluate'
import {
  getStyleAutoImportAliases,
} from './compiler/modules/source'
import { getExportModuleFilesFromFile } from './compiler/projection/exportNames'
import { buildRuntimeSystemModule } from './compiler/projection/runtimeModule'
import { reportDiagnostics, VanityError } from './diagnostics'
import { renderDevtoolsPage } from './introspect/devtools'
import { buildManifest } from './introspect/manifest'
import { collectInspection } from './introspect/records'
import { substrate } from './substrate'
import {
  assertPortableSystem,
  getSystemContract,
  serializePortableSystem,
} from './system/contract'

export {
  applyDebugNames,
  styleAutoImportDeclarations,
  styleExportNames,
} from './compiler/modules/source'

export type {
  VanityAppAutoImports,
  VanityAppAutoImportsOptions,
  VanityAppAutoImportSource,
  VanityCompilerMode,
  VanityCompilerOptions,
  VanityConfig,
  VanityIdentifierMode,
  VanityStyleAutoImports,
  VanityStyleAutoImportsOptions,
  VanitySystemSource,
} from './config'

/** Shared host-neutral configuration accepted by `vanityPlugin`. */
export type VanityViteOptions = VanityConfig

/** `*.css.ts` (and variants) — vanity's authoring file extension. */
const styleFileFilter = /\.css\.(?:js|cjs|mjs|jsx|ts|tsx)(?:\?used)?$/

/** The stable virtual stylesheet a compiled style module imports; content lives in the store. */
const virtualExt = '.vanity.css'
const runtimeVirtualPrefix = '\0vanity:system-runtime:'
const cascadeUrl = '/__vanity/cascade.css'
const cascadeFileName = 'assets/vanity-cascade.css'

/**
 * Compile Vanity style modules and maintain CSS, portable data, and Manifest v4.
 *
 * @param options Shared compiler and module-role routing configuration. The
 * same object can come from `defineVanityConfig` or a local `vanity.config.ts`.
 *
 * @example
 * ```ts
 * import { vanityPlugin } from '@mszr/vanity/vite'
 * import vanityConfig from './vanity.config.ts'
 *
 * export default defineConfig({ plugins: [vanityPlugin(vanityConfig)] })
 * ```
 */
export function vanityPlugin(options: VanityViteOptions = {}): PluginOption[] {
  const compiler = options.compiler ?? {}
  const autoImports = getAutoImportRoles(options)
  const styleImportSources = autoImports.style
  const nativeTypeHost = (options as VanityViteOptions & { [vanityViteHost]?: 'nuxt' })[vanityViteHost]
  const appAutoImports = nativeTypeHost === 'nuxt' || autoImports.app === undefined
    ? undefined
    : getAppAutoImportsForSystem(autoImports.app, compiler.system)
  let config: ResolvedConfig
  let server: ViteDevServer | undefined
  let clientServer: ViteDevServer | undefined
  let systemSources: NormalizedSystemSource[] = []
  let cascadeCss = ''

  /** Stable virtual id → the CSS it currently serves. */
  const cssByVirtualId = new Map<string, string>()
  /** Style module → its last successful CSS virtual ids (last-good on failure). */
  const cssVirtualIdsByEntry = new Map<string, Set<string>>()
  /** Style module → its sorted top-level exports, for shape comparison. */
  const exportSignatures = new Map<string, string>()
  /** Bundled dependency → the style modules built on it, for HMR fan-out. */
  const dependentsByFile = new Map<string, Set<string>>()
  /** Style module → its current bundle inputs, so removed imports stop fanning out. */
  const dependenciesByEntry = new Map<string, Set<string>>()
  /** Entries whose latest transform failed, including before Vite had a healthy node. */
  const failedStyleEntries = new Set<string>()
  /** Root-relative style module → what it recorded, replaced per evaluation. */
  const recordsByFile = new Map<string, VanityInspectRecord[]>()
  /** Full plain-system entry → its last successfully validated portable data. */
  const systemsByEntry = new Map<string, EvaluatedSystem>()
  /** compatibility + runtime identity → one portable runtime virtual module. */
  const systemsByRuntimeId = new Map<string, EvaluatedSystem>()
  /** Runtime virtual module ids already resolved by a browser or SSR graph. */
  const runtimeVirtualIds = new Set<string>()
  /** Attempted system dependency → configured entries, including failed attempts. */
  const systemDependentsByFile = new Map<string, Set<string>>()
  /** Namespace owner key → last-good systems, recomputed after successful updates. */
  const namespaceOwners = new Map<string, Map<string, VanityPortableSystem>>()
  /** `.css.ts` entries claimed by Vanity rather than raw vanilla-extract. */
  const vanityOwnedStyleModules = new Set<string>()
  /** Style module → configured build-time systems it imports. */
  const systemsByStyleEntry = new Map<string, Set<string>>()
  /** Configured build-time system → style modules that import it. */
  const styleEntriesBySystem = new Map<string, Set<string>>()
  /** Local source graph files whose exports can change an auto-import declaration. */
  let appAutoImportSourceFiles = new Set<string>()

  /** The manifest as last written, so unchanged builds skip the write. */
  let writtenManifest: string | undefined
  let manifestTimer: ReturnType<typeof setTimeout> | undefined
  const reportedFailures = new WeakSet<object>()
  const reportFailure = (error: unknown): void => {
    if (typeof error === 'object' && error !== null) {
      if (reportedFailures.has(error))
        return
      reportedFailures.add(error)
    }
    if (
      error instanceof VanityError
      || (typeof error === 'object' && error !== null
        && 'name' in error && error.name === 'VanityError'
        && 'diagnostics' in error && Array.isArray(error.diagnostics))
    ) {
      reportDiagnostics(compiler.diagnostics, error.diagnostics as import('./diagnostics').VanityDiagnostic[])
      return
    }
    reportDiagnostics(compiler.diagnostics, {
      code: 'VANITY_VITE_BUILD_FAILED',
      message: error instanceof Error ? error.message : String(error),
    })
  }

  const serializeManifestJson = (): string => {
    const records = [...recordsByFile.keys()].sort().flatMap(file => recordsByFile.get(file)!)
    const css = [...cssByVirtualId.values()].join('\n')
    return `${JSON.stringify(buildManifest(records, css, { root: config.root }), null, 2)}\n`
  }

  const writeManifest = async (): Promise<void> => {
    // A failed first evaluation has no trustworthy canonical system map.
    // Preserve the original compiler diagnostic instead of masking it with a
    // secondary manifest-construction failure; last-good artifacts remain.
    if (![...recordsByFile.values()].flat().some(record =>
      record.kind === 'system' && record.portable !== undefined)) {
      return
    }
    const json = serializeManifestJson()

    if (json === writtenManifest)
      return

    const path = join(config.root, '.vanity', 'manifest.json')
    await writeIfChanged(path, json)
    writtenManifest = json
  }

  const getArtifactDirectory = () => resolve(
    config.root,
    compiler.artifactDirectory ?? '.vanity',
  )

  const rememberSystemDependencies = (source: NormalizedSystemSource, files: Iterable<string>): void => {
    for (const dependency of source.dependencies) {
      const dependents = systemDependentsByFile.get(dependency)
      dependents?.delete(source.entry)
      if (dependents?.size === 0)
        systemDependentsByFile.delete(dependency)
    }

    source.dependencies = new Set([...files].map(normalizePath))
    source.dependencies.add(source.entry)
    if (source.artifact)
      source.dependencies.add(source.artifact)

    for (const dependency of source.dependencies) {
      const dependents = systemDependentsByFile.get(dependency) ?? new Set<string>()
      dependents.add(source.entry)
      systemDependentsByFile.set(dependency, dependents)
    }
  }

  const registerSystem = async (
    source: NormalizedSystemSource,
    evaluated: EvaluatedSystem,
  ): Promise<EvaluatedSystem> => {
    assertNamespaceOwnership(source.entry, evaluated.portable, namespaceOwners)
    systemsByEntry.set(source.entry, evaluated)

    const runtimeId = getRuntimeIdentity(evaluated.portable)
    const duplicate = systemsByRuntimeId.get(runtimeId)
    if (duplicate && duplicate.portable.identities.css !== evaluated.portable.identities.css) {
      // Equal runtime semantics with distinct CSS is valid only while CSS owns
      // a distinct namespace. Same-namespace conflicts were rejected above.
    }
    systemsByRuntimeId.set(runtimeId, duplicate ?? evaluated)

    const artifact = join(
      getArtifactDirectory(),
      'systems',
      `${evaluated.portable.identities.compatibility}.json`,
    )
    await writeIfChanged(artifact, serializePortableSystem(evaluated.portable))
    return evaluated
  }

  const evaluateConfiguredSystem = async (
    source: NormalizedSystemSource,
  ): Promise<EvaluatedSystem> => {
    let bundled: Awaited<ReturnType<typeof buildStyleModule>>
    try {
      bundled = await buildStyleModule({
        filePath: source.entry,
        root: config.root,
        alias: convertViteAliasesToEsbuild(config),
      })
      rememberSystemDependencies(source, bundled.watchFiles)
    }
    catch (error) {
      rememberSystemDependencies(source, buildFailureFiles(error, config.root))
      const failure = createStyleBuildError(error, source.entry, config.root)
      reportFailure(failure)
      throw failure
    }

    const inProcess = evaluateSystemModule(bundled.source, source.entry)
    let portable = inProcess.portable

    if (source.artifact) {
      const parsed: unknown = JSON.parse(await readFile(source.artifact, 'utf-8'))
      assertPortableSystem(parsed)
      const owner = source.packageName ?? substrate.backend.getPackageName(dirname(source.entry)) ?? source.entry
      assertFreshPortablePair(source, inProcess.portable, parsed, owner)
      portable = parsed
    }

    return registerSystem(source, {
      portable,
      exportNames: inProcess.exportNames,
      contractExport: source.exportName ?? inProcess.contractExport,
      buildExports: inProcess.buildExports,
    })
  }

  const ensureConfiguredSystem = async (source: NormalizedSystemSource): Promise<EvaluatedSystem> =>
    systemsByEntry.get(source.entry) ?? evaluateConfiguredSystem(source)

  /** Dev regenerates on change, debounced across a save's fan-out of transforms. */
  const scheduleManifest = (): void => {
    clearTimeout(manifestTimer)
    manifestTimer = setTimeout(() => void writeManifest().catch(() => {}), 50)
  }

  const getIdentifierOption = () =>
    compiler.identifiers ?? (config.mode === 'production' ? 'short' : 'debug')

  const rememberDependencies = (
    entry: string,
    files: Iterable<string>,
    preserveKnown: boolean,
  ): Set<string> => {
    const previous = dependenciesByEntry.get(entry) ?? new Set<string>()
    const next = new Set(preserveKnown ? previous : [])

    for (const file of files) {
      const normalized = normalizePath(file)
      if (!normalized.includes('node_modules') && normalized !== entry)
        next.add(normalized)
    }

    if (!preserveKnown) {
      for (const removed of previous) {
        if (next.has(removed))
          continue
        const dependents = dependentsByFile.get(removed)
        dependents?.delete(entry)
        if (dependents?.size === 0)
          dependentsByFile.delete(removed)
      }
    }

    dependenciesByEntry.set(entry, next)
    for (const dependency of next) {
      const dependents = dependentsByFile.get(dependency) ?? new Set()
      dependents.add(entry)
      dependentsByFile.set(dependency, dependents)
    }

    return next
  }

  const rememberStyleSystems = (entry: string, systems: Iterable<string>): void => {
    const previous = systemsByStyleEntry.get(entry) ?? new Set<string>()
    const next = new Set([...systems].map(normalizePath))

    for (const removed of previous) {
      if (next.has(removed))
        continue
      const dependents = styleEntriesBySystem.get(removed)
      dependents?.delete(entry)
      if (dependents?.size === 0)
        styleEntriesBySystem.delete(removed)
    }

    systemsByStyleEntry.set(entry, next)
    for (const system of next) {
      const dependents = styleEntriesBySystem.get(system) ?? new Set<string>()
      dependents.add(entry)
      styleEntriesBySystem.set(system, dependents)
    }
  }

  /** The auto-import shim's last written content, so unchanged runs skip the write. */
  let shimContent: string | undefined
  /** The system module's own source and import graph — files upstream of the system never get the shim. */
  let systemSource: string | undefined
  let systemDeps = new Set<string>()

  /**
   * Resolve the auto-import inject shim ([spec-vue.md §4]): a one-line
   * module re-exporting the system's names, handed to esbuild's `inject` so
   * unbound identifiers resolve to the system while explicit imports stay
   * untouched. Re-detected per transform, so a new system export is picked up
   * by the next save. The system module and everything it imports are skipped:
   * a file upstream of the system cannot use the system's bindings — injecting
   * there would only manufacture a cycle.
   */
  const injectShimFor = async (filePath: string): Promise<StyleAutoImportInjection | undefined> => {
    if (styleImportSources.length === 0)
      return undefined

    const stylePlan = await planStyleAutoImports(styleImportSources, compiler.system, config.root)
    if (stylePlan === undefined)
      return undefined

    const { sources, names } = stylePlan
    const sourceTexts = new Map(await Promise.all(sources.map(async source =>
      [source.file, await readFile(source.file, 'utf-8')] as const,
    )))
    const source = [...sourceTexts.values()].join('\n')

    if (nativeTypeHost !== 'nuxt')
      await writeAutoImportDeclarationFiles([stylePlan.declaration, stylePlan.bridge])

    if (source !== systemSource) {
      const bundles = await Promise.all(sources.map(source => buildStyleModule({
        filePath: source.file,
        root: config.root,
        alias: convertViteAliasesToEsbuild(config),
      })))

      systemSource = source
      systemDeps = new Set([
        ...sources.map(source => source.file),
        ...bundles.flatMap(bundle => bundle.watchFiles.map(normalizePath)),
      ])
    }

    if (systemDeps.has(filePath))
      return undefined

    const ambientAliases = new Map(sources.flatMap(source =>
      [...getStyleAutoImportAliases(sourceTexts.get(source.file)!, source.file, source.imports)],
    ))

    const shim = join(config.root, 'node_modules', '.vanity', 'vanity-style-auto-imports.mjs')
    const content = names.length === 0
      ? 'export {}\n'
      : `${sources.map(source => `export { ${source.imports.join(', ')} } from '${source.from}'`).join('\n')}\n`
    if (content !== shimContent) {
      await mkdir(dirname(shim), { recursive: true })
      await writeFile(shim, content)
      shimContent = content
    }

    return names.length === 0 ? undefined : { aliases: ambientAliases, path: shim }
  }

  const rememberAppAutoImportSourceFiles = (plan: Awaited<ReturnType<typeof writeAutoImportDeclarations>>['plan']): void => {
    const files = new Set<string>()

    for (const source of plan.app?.sources ?? []) {
      if (isPackageSpecifier(source.from))
        continue

      for (const file of getExportModuleFilesFromFile(source.from, config.root))
        files.add(normalizePath(file))
    }

    appAutoImportSourceFiles = files
  }

  const cssTsPlugin: Plugin = {
    name: 'vanity-css-ts',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      config = resolvedConfig
      systemSources = normalizeSystemSources(compiler.system, config.root)
    },

    configureServer(devServer) {
      server = devServer

      // Nuxt creates distinct browser and SSR Vite servers from the same
      // plugin instance. The latter configures last, so a single `server`
      // reference silently routes CSS updates/full reloads to an HMR channel
      // no browser listens to. Plain Vite's consumer is `client` too.
      if (devServer.config.build.ssr !== true)
        clientServer = devServer

      // The manifest, live — what the DevTools tab (and any tool) reads.
      devServer.middlewares.use('/__vanity', (req, res, next) => {
        const [path] = (req.url ?? '/').split('?')

        if (path === '/cascade.css') {
          res.setHeader('Content-Type', 'text/css')
          res.end(cascadeCss)
          return
        }

        if (path === '/manifest.json') {
          res.setHeader('Content-Type', 'application/json')
          res.end(serializeManifestJson())
          return
        }

        if (path === '/' || path === '/index.html') {
          res.setHeader('Content-Type', 'text/html')
          res.end(renderDevtoolsPage(config.root))
          return
        }

        next()
      })

      for (const source of systemSources)
        devServer.watcher.add([source.entry, ...(source.artifact ? [source.artifact] : [])])
    },

    async buildStart() {
      if (nativeTypeHost !== 'nuxt') {
        const result = await writeAutoImportDeclarations(options, { root: config.root })
        rememberAppAutoImportSourceFiles(result.plan)
      }

      for (const source of systemSources) {
        const system = await ensureConfiguredSystem(source)
        for (const dependency of source.dependencies) {
          this.addWatchFile(dependency)
          server?.watcher.add(dependency)
        }
        recordsByFile.set(source.entry, [createSystemRecordFromPortable(system.portable)])
      }

      cascadeCss = renderCascadePrelude(
        compiler.layerOrder
        ?? [...new Set([...systemsByEntry.values()].map(system => system.portable.layerRoot))],
      )
      // `emitFile()` belongs to Rollup's build graph. Vite invokes buildStart
      // in serve mode too, where the cascade is served by /__vanity instead.
      if (cascadeCss && config.command === 'build' && config.build.ssr !== true) {
        this.emitFile({
          type: 'asset',
          fileName: cascadeFileName,
          source: cascadeCss,
        })
      }
    },

    transformIndexHtml: {
      order: 'pre',
      handler() {
        if (!cascadeCss || config.build.ssr === true)
          return undefined
        const href = server
          ? cascadeUrl
          : `${config.base}${config.base.endsWith('/') ? '' : '/'}${cascadeFileName}`
        return [{
          tag: 'link',
          // The asset is emitted by this plugin rather than resolved from the
          // source tree. Vite removes this sentinel after skipping its
          // pre-output URL resolver, avoiding a false missing-file warning.
          attrs: { 'rel': 'stylesheet', 'href': href, 'vite-ignore': '' },
          injectTo: 'head-prepend',
        }]
      },
    },

    // Builds write the manifest once, beside the emitted CSS.
    async buildEnd() {
      if (!server)
        await writeManifest()
    },

    async transform(_code, id, transformOptions) {
      const [validId] = id.split('?')
      if (!styleFileFilter.test(validId))
        return null
      return transformStyleModule(_code, id, transformOptions, {
        root: config.root,
        styleFileFilter,
        virtualExtension: virtualExt,
        server,
        clientServer,
        systemSources,
        namespaceOwners,
        recordsByFile,
        cssByVirtualId,
        cssVirtualIdsByEntry,
        exportSignatures,
        failedStyleEntries,
        setStyleModuleOwnership: (filePath, owned) => {
          if (owned)
            vanityOwnedStyleModules.add(filePath)
          else
            vanityOwnedStyleModules.delete(filePath)
        },
        ensureConfiguredSystem,
        injectShimFor,
        buildStyleModule,
        alias: convertViteAliasesToEsbuild(config),
        rememberStyleSystems,
        rememberDependencies,
        addWatchFile: file => this.addWatchFile(file),
        buildFailureFiles,
        createStyleBuildError,
        reportFailure,
        getIdentifierOption,
        scheduleManifest,
      })
    },

    async handleHotUpdate({ file, server: devServer, modules }) {
      return handleHotUpdate({ file, server: devServer, modules }, {
        root: config.root,
        runtimeVirtualPrefix,
        systemSources,
        systemDependentsByFile,
        systemsByEntry,
        recordsByFile,
        dependentsByFile,
        styleEntriesBySystem,
        runtimeVirtualIds,
        failedStyleEntries,
        refreshAppAutoImports: nativeTypeHost !== 'nuxt' && appAutoImports !== undefined
          && appAutoImportSourceFiles.size > 0
          ? async () => {
            const normalizedFile = normalizePath(file)
            if (!appAutoImportSourceFiles.has(normalizedFile))
              return
            const result = await writeAutoImportDeclarations(options, { root: config.root })
            rememberAppAutoImportSourceFiles(result.plan)
          }
          : undefined,
        evaluateConfiguredSystem,
        createSystemRecord: createSystemRecordFromPortable,
      })
    },

    async resolveId(source, importer, resolveOptions) {
      const [validId, query] = source.split('?')

      if (validId.startsWith(runtimeVirtualPrefix))
        return validId

      const systemSource = resolveConfiguredSystemImport(
        validId,
        importer,
        systemSources,
        config.root,
      )
      if (systemSource) {
        const evaluated = await ensureConfiguredSystem(systemSource)
        const target = resolveOptions?.ssr || config.build.ssr === true ? 'ssr' : 'browser'
        const runtimeId = getRuntimeIdentity(evaluated.portable)
        const id = `${runtimeVirtualPrefix}${target}:${runtimeId}`
        systemsByRuntimeId.set(runtimeId, evaluated)
        runtimeVirtualIds.add(id)
        return id
      }

      if (!validId.endsWith(virtualExt))
        return null

      const absoluteId = getAbsoluteVirtualId(validId, config.root)

      if (!resolveCssVirtualAlias(absoluteId, config.root, virtualExt, cssByVirtualId, namespaceOwners))
        return null

      // Keep the query — Vite's HMR timestamps ride it.
      return query ? `${absoluteId}?${query}` : absoluteId
    },

    load(id) {
      const [validId] = id.split('?')

      if (validId.startsWith(runtimeVirtualPrefix)) {
        const payload = validId.slice(runtimeVirtualPrefix.length)
        const separator = payload.indexOf(':')
        const target = payload.slice(0, separator) as 'browser' | 'ssr'
        const runtimeId = payload.slice(separator + 1)
        const system = systemsByRuntimeId.get(runtimeId)
        if (!system) {
          throw new VanityError({
            code: 'VANITY_VITE_BUILD_FAILED',
            message: `missing portable runtime system '${runtimeId}'`,
            path: ['runtime', runtimeId],
            fix: 'build the system entry before requesting its generated runtime module',
          })
        }
        return buildRuntimeSystemModule(system, target)
      }

      if (!validId.endsWith(virtualExt))
        return null

      const absoluteId = getAbsoluteVirtualId(validId, config.root)
      const resolved = resolveCssVirtualAlias(absoluteId, config.root, virtualExt, cssByVirtualId, namespaceOwners)
      return resolved === undefined ? null : cssByVirtualId.get(resolved) ?? null
    },
  }

  // vanilla-extract 5.2's compiler still uses Vite 7's `server.hmr: false`.
  // Vite 8 moved its transport switch to `server.ws`, so two compilers can
  // otherwise open the same default WebSocket during parallel builds. Carry
  // one private plugin into that compiler to keep its middleware-only server
  // transportless on both generations.
  const substrateCompilerTransport: Plugin = {
    name: 'vanity:substrate-compiler-transport',
    config(compilerConfig) {
      if (compilerConfig.logLevel !== 'silent' || compilerConfig.server?.hmr !== false)
        return
      compilerConfig.server.ws = false
    },
  }

  const substratePlugins = substrate.backend.createVitePlugins({
    identifiers: compiler.identifiers,
    unstable_mode: compiler.unstableMode,
    unstable_pluginFilter: ({ name }: { name: string }) =>
      name === 'vite-tsconfig-paths' || name === substrateCompilerTransport.name,
  }) as Plugin[]
  const wrappedSubstratePlugins = substratePlugins.map((plugin) => {
    if (plugin.name !== 'vite-plugin-vanilla-extract' || plugin.transform === undefined)
      return plugin

    const substrateTransform = typeof plugin.transform === 'object'
      ? plugin.transform.handler
      : plugin.transform

    return {
      ...plugin,
      // Its transform already initializes and memoizes the compiler. Avoid an
      // eager private Vite server in projects that contain only Vanity styles.
      buildStart: undefined,
      async transform(code, id, transformOptions) {
        const [validId] = id.split('?')
        if (vanityOwnedStyleModules.has(normalizePath(validId)))
          return null
        return substrateTransform.call(this, code, id, transformOptions)
      },
    } satisfies Plugin
  })

  const applicationPlugins = appAutoImports === undefined
    ? []
    : normalizeAutoImportPlugins(createApplicationAutoImportPlugin(appAutoImports))

  return [cssTsPlugin, substrateCompilerTransport, ...wrappedSubstratePlugins, ...applicationPlugins]
}

function createApplicationAutoImportPlugin(
  value: VanityAppAutoImports,
): Plugin {
  let delegate: AutoImportPlugin | undefined
  let delegateRoot: string | undefined

  const createDelegate = (root: string): AutoImportPlugin => {
    const normalizedRoot = normalizePath(resolve(root))

    if (delegate !== undefined && delegateRoot === normalizedRoot)
      return delegate

    const options = createViteAppAutoImports(value, normalizedRoot)
    delegate = autoImportVite({
      imports: options.imports,
      // Vanity owns the declaration plan and renderer. Unplugin remains the
      // source transformer, but never becomes a second declaration authority.
      dts: false,
      // Compiler authoring modules have their own role. Keeping application
      // imports out of `*.css.ts` prevents app presets from
      // leaking into code that Vanity evaluates in-process.
      exclude: [styleFileFilter],
      vueTemplate: true,
    }) as AutoImportPlugin
    delegateRoot = normalizedRoot
    return delegate
  }

  return {
    name: 'vanity:app-auto-imports',
    enforce: 'post',
    config(config, env) {
      // An omitted root defaults to cwd. Defer construction until
      // `configResolved` so an adapter-controlled root cannot split path
      // resolution between filtered and unfiltered sources.
      if (config.root === undefined)
        return

      return invokePluginHook(createDelegate(config.root), 'config', this, config, env)
    },
    configResolved(config) {
      return invokePluginHook(createDelegate(config.root), 'configResolved', this, config)
    },
    transform(code, id, options) {
      if (delegate === undefined || delegate.transformInclude?.call(this, id) !== true)
        return

      return invokePluginHook(delegate, 'transform', this, code, id, options)
    },
    buildStart(options) {
      return invokePluginHook(delegate, 'buildStart', this, options)
    },
    buildEnd(error) {
      return invokePluginHook(delegate, 'buildEnd', this, error)
    },
    handleHotUpdate(context) {
      return invokePluginHook(delegate, 'handleHotUpdate', this, context)
    },
  }
}

interface AutoImportPlugin extends Plugin {
  transformInclude?: (id: string) => boolean
}

function normalizeAutoImportPlugins(value: PluginOption): Plugin[] {
  const plugins: Plugin[] = []

  const collect = (option: PluginOption): void => {
    if (Array.isArray(option)) {
      for (const nested of option)
        collect(nested)
      return
    }

    if (option !== false && option !== undefined && option !== null && typeof option === 'object')
      plugins.push(option as Plugin)
  }

  collect(value)
  return plugins
}

interface ViteAppAutoImports {
  imports: Array<{ from: string, imports: string[] }>
}

function createViteAppAutoImports(
  value: VanityAppAutoImports,
  root: string,
): ViteAppAutoImports {
  const resolved = resolveAppAutoImports(value, root)
  return {
    imports: resolved.sources.map(source => ({
      from: source.from,
      imports: [...source.imports],
    })),
  }
}

type AutoImportDelegateHook = Extract<typeof autoImportDelegateHooks[number], keyof AutoImportPlugin>

type PluginHookFunction<Hook> = Hook extends (...args: infer Arguments) => infer Result
  ? (...args: Arguments) => Result
  : Hook extends { handler: (...args: infer Arguments) => infer Result }
    ? (...args: Arguments) => Result
    : never

function invokePluginHook<K extends AutoImportDelegateHook>(
  plugin: AutoImportPlugin | undefined,
  name: K,
  context: unknown,
  ...args: Parameters<PluginHookFunction<NonNullable<AutoImportPlugin[K]>>>
): ReturnType<PluginHookFunction<NonNullable<AutoImportPlugin[K]>>> | undefined {
  const hook = plugin?.[name]
  const handler = typeof hook === 'function'
    ? hook
    : typeof hook === 'object' && hook !== null && 'handler' in hook
      ? (hook as { handler?: unknown }).handler
      : undefined

  if (typeof handler !== 'function')
    return undefined

  return Reflect.apply(handler, context, args) as ReturnType<PluginHookFunction<NonNullable<AutoImportPlugin[K]>>>
}

function evaluateSystemModule(source: string, filePath: string): EvaluatedSystem {
  const { result: exports } = collectInspection(() => executeBundle(source, filePath))
  const contracts = Object.entries(exports)
    .map(([name, value]) => ({ name, value, contract: getSystemContract(value) }))
    .filter((entry): entry is {
      name: string
      value: object
      contract: NonNullable<ReturnType<typeof getSystemContract>>
    } =>
      entry.contract !== undefined)

  if (contracts.length === 0) {
    throw new VanityError({
      code: 'VANITY_VITE_BUILD_FAILED',
      message: `${filePath} does not export a consolidated Vanity system`,
      file: filePath,
      fix: 'export the result of createSystem().addTokens(...).consolidate() from this plain system module',
    })
  }
  if (contracts.length > 1) {
    throw new VanityError({
      code: 'VANITY_VITE_BUILD_FAILED',
      message: `${filePath} exports more than one consolidated Vanity system`,
      file: filePath,
      detail: contracts.map(entry => `contract export: ${entry.name}`),
      fix: 'configure each consolidated system through its own plain system entry',
    })
  }

  const [entry] = contracts
  return {
    portable: entry.contract.portable,
    exportNames: Object.keys(exports).sort(),
    contractExport: entry.name,
    buildExports: exports,
  }
}

function renderCascadePrelude(roots: readonly string[]): string {
  const unique = [...new Set(roots.filter(root => root.trim().length > 0))]
  return unique.length === 0 ? '' : `@layer ${unique.join(', ')};\n`
}

function createSystemRecordFromPortable(system: VanityPortableSystem): VanityInspectRecord {
  return {
    kind: 'system',
    file: system.source,
    prefix: system.prefix,
    root: system.root,
    ...(system.tokenLayer === undefined ? {} : { tokenLayer: system.tokenLayer }),
    capabilitySignature: system.capabilities.signature,
    supportTarget: system.capabilities.supportTarget,
    layers: [...system.layers],
    conditions: { ...system.conditions },
    conditionArms: { ...system.conditionArms },
    conditionAsts: { ...system.conditionAsts },
    ...(system.axes === undefined ? {} : { axes: system.axes }),
    runtime: {
      protocol: system.runtime.protocol,
      system: system.runtime.system,
      root: system.runtime.root,
    },
    identities: system.identities,
    portable: system,
  }
}

async function writeIfChanged(file: string, contents: string): Promise<boolean> {
  try {
    if (await readFile(file, 'utf-8') === contents)
      return false
  }
  catch {
    // Missing is the ordinary first-write case.
  }

  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${pid}`
  await writeFile(temporary, contents)
  await rename(temporary, file)
  return true
}

/** Files named by an esbuild failure, including note locations. */
function buildFailureFiles(error: unknown, root: string): string[] {
  return buildFailureLocations(error, root).map(location => location.file)
}

interface BuildFailureLocation {
  file: string
  line?: number
  column?: number
  text?: string
}

function buildFailureLocations(error: unknown, root: string): BuildFailureLocation[] {
  if (error === null || typeof error !== 'object' || !('errors' in error) || !Array.isArray(error.errors))
    return []

  const locations = new Map<string, BuildFailureLocation>()
  const visit = (entry: unknown): void => {
    if (entry === null || typeof entry !== 'object')
      return

    if ('location' in entry && entry.location !== null && typeof entry.location === 'object'
      && 'file' in entry.location && typeof entry.location.file === 'string' && entry.location.file.length > 0) {
      const file = entry.location.file
      const normalized = normalizePath(isAbsolute(file) ? file : join(root, file))
      const line = 'line' in entry.location && typeof entry.location.line === 'number' ? entry.location.line : undefined
      const column = 'column' in entry.location && typeof entry.location.column === 'number' ? entry.location.column + 1 : undefined
      const text = 'text' in entry && typeof entry.text === 'string' ? entry.text : undefined
      locations.set(`${normalized}:${line ?? ''}:${column ?? ''}`, {
        file: normalized,
        ...(line === undefined ? {} : { line }),
        ...(column === undefined ? {} : { column }),
        ...(text === undefined ? {} : { text }),
      })
    }

    if ('notes' in entry && Array.isArray(entry.notes))
      entry.notes.forEach(visit)
  }

  error.errors.forEach(visit)
  return [...locations.values()]
}

function createStyleBuildError(error: unknown, entry: string, root: string): unknown {
  if (error instanceof VanityError
    || (error !== null && typeof error === 'object' && 'name' in error
      && error.name === 'VanityError' && 'diagnostics' in error)) {
    return error
  }

  const [primary] = buildFailureLocations(error, root)
  const entryFile = getAuthoredFile(entry, root)
  const primaryFile = primary === undefined ? entryFile : getAuthoredFile(primary.file, root)
  const reason = primary?.text
    ?? (error instanceof Error && error.message.trim().length > 0 ? error.message.split('\n')[0] : 'the authored module could not be evaluated')
  const related = primary !== undefined && normalizePath(primary.file) !== normalizePath(entry)
    ? [{ message: 'style entry that imports this source', file: entryFile }]
    : undefined

  return new VanityError({
    code: 'VANITY_VITE_BUILD_FAILED',
    message: `${primaryFile} could not be compiled: ${reason}`,
    file: primaryFile,
    ...(primary?.line === undefined ? {} : { line: primary.line }),
    ...(primary?.column === undefined ? {} : { column: primary.column }),
    ...(related === undefined ? {} : { related }),
    fix: 'repair the authored TypeScript, import, or style expression; the same dev server will retry it on the next change',
  }, { cause: error })
}

function getAuthoredFile(file: string, root: string): string {
  const relative = normalizePath(posix.relative(normalizePath(root), normalizePath(file)))
  return relative.startsWith('..') ? normalizePath(file) : relative
}

// Vite rewrites absolute module ids to root-relative browser URLs in dev and
// Nuxt serves those URLs beneath its `/_nuxt/` base. Resolve both spellings to
// the one absolute key used by the CSS store. This mirrors the substrate Vite
// plugin's id normalization; without it SSR can render valid-looking
// `<link>`s whose browser requests miss the store and 404, causing a FOUC.
const viteIdPrefix = /^\/?@id\//
const slashPrefixedDrive = /^\/([a-z]:\/)/i
const windowsAbsolutePath = /^[a-z]:\//i

function getAbsoluteVirtualId(filePath: string, root: string): string {
  const unwrapped = filePath
    .replace(viteIdPrefix, '')
    .replace(slashPrefixedDrive, '$1')
  const resolved = posix.isAbsolute(unwrapped) || windowsAbsolutePath.test(unwrapped)
    ? unwrapped
    : filePath

  if (
    windowsAbsolutePath.test(resolved)
    || resolved.startsWith(root)
    || (posix.isAbsolute(resolved) && resolved.split(posix.sep)[1] === root.split(posix.sep)[1])
  ) {
    return normalizePath(resolved)
  }

  return normalizePath(posix.join(root, resolved))
}

// ─── Introspection: manifests and audits derive during the build ─────────────

export { buildAgentContext, generateAgentContext } from './introspect/agent'
export type { VanityAgentContext } from './introspect/agent'
export { audit, formatAuditFindings } from './introspect/audit'
export type { VanityAuditEvidence, VanityAuditFinding } from './introspect/audit'
export { diffManifests, formatManifestDiff } from './introspect/diff'
export type {
  VanityChangeCategory,
  VanityManifestChange,
  VanityManifestDiff,
} from './introspect/diff'
export { buildManifest } from './introspect/manifest'
export {
  VANITY_MANIFEST_FORMAT,
  VANITY_MANIFEST_SCHEMA,
  VANITY_MANIFEST_VERSION,
} from './introspect/manifest'
export type {
  VanityManifest,
  VanityManifestContrast,
  VanityManifestDeclaration,
  VanityManifestDependency,
  VanityManifestEscape,
  VanityManifestExpression,
  VanityManifestModule,
  VanityManifestPort,
  VanityManifestRecipe,
  VanityManifestSource,
  VanityManifestStyle,
  VanityManifestToken,
} from './introspect/manifest'

/** Default Vite plugin export: `import vanityPlugin from '@mszr/vanity/vite'`. */
export default vanityPlugin
