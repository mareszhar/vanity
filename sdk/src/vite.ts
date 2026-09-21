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
 * stable* virtual id (`.vanity/virtual/style/<up-count>/<root-relative path>.vanity.css`,
 * under the build root wherever the style source itself sits) whose content
 * is served from an in-memory store — so when a save changes the CSS, the
 * same id delivers the new text and Vite's client replaces the existing style
 * tag instead of appending a second one. Style modules self-accept in dev (an
 * edit that only moves declarations swaps CSS with no reload); when the
 * export shape* changes, importers hold stale bindings, so the plugin sends
 * one full reload instead. Files a style module bundles in (tokens, shared
 * styles) are watched and mapped back to their dependents, so editing a
 * token file hot-updates every style module built on it.
 *
 * **The manifest rides the same evaluation** ([spec-introspection.md §5]):
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

import type { ModuleNode, Plugin, PluginOption, ResolvedConfig, ViteDevServer } from 'vite'
import type { autoImportDelegateHooks } from './compiler/auto-imports/autoImportDelegate'
import type { PreparedSystem } from './compiler/core/registration'
import type {
  EvaluatedSystem,
  NormalizedSystemSource,
  ResolvedConfiguredSystemImport,
} from './compiler/core/systems'
import type { StyleAutoImportInjection } from './compiler/core/transform'
import type { RuntimeNamespaceHmrRecord } from './compiler/hmr/update'
import type {
  VanityAppAutoImports,
  VanityConfig,
} from './config'
import type { VanityInspectRecord } from './introspect/records'
import type { VanityPortableSystem } from './system/contract'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, posix, resolve } from 'node:path'
import autoImportVite from 'unplugin-auto-import/vite'
import { isPackageSpecifier, resolveAppAutoImports } from './compiler/auto-imports/applicationImports'
import {
  getAppAutoImportsForSystem,
  getAutoImportRoles,
  planStyleAutoImports,
} from './compiler/auto-imports/autoImportPlan'
import { writeAutoImportDeclarationFiles, writeAutoImportDeclarations } from './compiler/auto-imports/autoImportWriter'
import {
  rememberStyleDependencies,
  rememberStyleSystems,
  rememberSystemDependencies,
} from './compiler/core/ownership'
import { getRootRelativeModulePath, normalizePath } from './compiler/core/path'
import {
  createSystemRecordFromPortable,
  createSystemRegistrationQueue,
} from './compiler/core/registration'
import {
  assertFreshPortablePair,
  clearConfiguredSystemResolutionCache,
  createConfiguredSystemResolutionCache,
  findConfiguredSystemInModuleGraph,
  getConfiguredSystemModuleFiles,
  getRuntimeIdentity,
  normalizeSystemSources,
  resolveConfiguredSystemImport,
} from './compiler/core/systems'
import { transformStyleModule } from './compiler/core/transform'
import { handleHotUpdate } from './compiler/hmr/update'
import {
  createViteHmrHost,
  createVitePendingCssResponseCache,
  resolveViteVirtualId,
} from './compiler/hosts/viteHmr'
import { vanityViteHost } from './compiler/hosts/viteHost'
import { buildStyleModule, convertViteAliasesToEsbuild } from './compiler/modules/build'
import { executeBundle } from './compiler/modules/evaluate'
import {
  containsVanityAuthoring,
  getStyleAutoImportAliases,
} from './compiler/modules/source'
import {
  getExportModuleFilesFromFile,
  normalizeModuleIdentity,
} from './compiler/projection/exportNames'
import {
  buildRuntimeSystemModule,
  buildRuntimeSystemNamespaceModule,
  getRuntimeSystemNamespaceProjection,
} from './compiler/projection/runtimeModule'
import { emitSystemCss } from './compiler/projection/systemCss'
import { writeFileArtifacts } from './compiler/publication'
import { reportDiagnostics, VanityError } from './diagnostics'
import { renderDevtoolsPage } from './introspect/devtools'
import { buildManifest } from './introspect/manifest'
import { collectInspection } from './introspect/records'
import { substrate } from './substrate'
import {
  assertPortableSystem,
  getSystemContract,
} from './system/contract'

export {
  applyDebugNames,
  readStyleExportNames,
  renderStyleAutoImportDeclarations,
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
const runtimeNamespaceVirtualPrefix = '\0vanity:system-namespace:'
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
  let systemResolutionCache = createConfiguredSystemResolutionCache()
  const configuredImportResolutionCache = new Map<string, ResolvedConfiguredSystemImport | null>()
  let systemSourcesReady: Promise<void> = Promise.resolve()
  let cascadeCss = ''

  /** Stable virtual id → the CSS it currently serves. */
  const cssByVirtualId = new Map<string, string>()
  /** Every style and accepted system generation that still needs each CSS id. */
  const cssOwnersByVirtualId = new Map<string, Set<string>>()
  /** Style module → its last successful CSS virtual ids (last-good on failure). */
  const cssVirtualIdsByEntry = new Map<string, Set<string>>()
  /** Configured system entry → its accepted semantic CSS virtual id. */
  const systemCssVirtualIdsByEntry = new Map<string, Set<string>>()
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
  /** Application runtime identity → one portable runtime virtual module. */
  const systemsByRuntimeId = new Map<string, EvaluatedSystem>()
  /** Runtime virtual module ids already resolved by a browser or SSR graph. */
  const runtimeVirtualIds = new Set<string>()
  /** Whether a configured graph file contains Vanity's build-time authoring. */
  const systemAuthoringByFile = new Map<string, boolean>()
  /** Module-specific runtime projections, keyed by their stable virtual id. */
  const runtimeNamespaceProjections = new Map<string, {
    readonly system: EvaluatedSystem
    readonly target: 'browser' | 'ssr'
    readonly moduleFile: string
  }>()
  /** Application namespace ids observed for each configured system entry. */
  const runtimeNamespaceIdsByEntry = new Map<string, Map<string, RuntimeNamespaceHmrRecord>>()
  /** Attempted system dependency → configured entries, including failed attempts. */
  const systemDependentsByFile = new Map<string, Set<string>>()
  /** Namespace owner key → last-good systems, recomputed after successful updates. */
  const namespaceOwners = new Map<string, Map<string, VanityPortableSystem>>()
  /** Pending initial evaluations are shared by concurrent style requests. */
  const pendingSystemsByEntry = new Map<string, Promise<EvaluatedSystem>>()
  /** Monotonic attempt generations prevent stale async work from publishing. */
  const systemGenerationsByEntry = new Map<string, number>()
  /** Host-neutral candidate validation and publication serialize per compiler. */
  const registerSystemCandidates = createSystemRegistrationQueue()
  /** Initial eager evaluations may fail while the dev server remains repairable. */
  const systemReadinessFailures = new Map<string, unknown>()
  const pendingCssResponseCache = createVitePendingCssResponseCache()
  /** `.css.ts` entries claimed by Vanity rather than raw vanilla-extract. */
  const vanityOwnedStyleModules = new Set<string>()
  /** Style module → configured build-time systems it imports. */
  const systemsByStyleEntry = new Map<string, Set<string>>()
  /** Configured build-time system → style modules that import it. */
  const styleEntriesBySystem = new Map<string, Set<string>>()
  /** Local source graph files whose exports can change an auto-import declaration. */
  let appAutoImportSourceFiles = new Set<string>()

  const isAuthoredSystemModule = async (moduleFile: string): Promise<boolean> => {
    const normalized = normalizePath(moduleFile)
    const cached = systemAuthoringByFile.get(normalized)
    if (cached !== undefined)
      return cached

    let authored = false
    try {
      authored = containsVanityAuthoring(await readFile(moduleFile, 'utf8'), moduleFile)
    }
    catch {
      // The host has already resolved this module. A source that cannot be
      // read is not eligible for the authoring projection; let the host report
      // its ordinary module error instead.
    }
    systemAuthoringByFile.set(normalized, authored)
    return authored
  }

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
    await writeFileArtifacts([{ file: path, contents: json }])
    writtenManifest = json
  }

  /** Dev regenerates on change, debounced across a save's fan-out of transforms. */
  const scheduleManifest = (): void => {
    clearTimeout(manifestTimer)
    manifestTimer = setTimeout(() => void writeManifest().catch(() => {}), 50)
  }

  const getIdentifierOption = () =>
    compiler.identifiers ?? (config.mode === 'production' ? 'short' : 'debug')

  const getArtifactDirectory = () => resolve(
    config.root,
    compiler.artifactDirectory ?? '.vanity',
  )

  const createHmrHost = (
    activeServer = server,
    activeClientServer = clientServer,
  ) => createViteHmrHost({
    root: config.root,
    base: config.base,
    server: activeServer,
    clientServer: activeClientServer,
  })

  /**
   * Let Vite resolve configured entries before the compiler assigns physical
   * identities. Node remains the fallback for hosts that cannot resolve a
   * source during configuration, while aliases/export conditions/symlinks
   * observed by Vite win whenever it returns a physical module.
   */
  const resolveConfiguredSystemSources = async (): Promise<void> => {
    const values = compiler.system === undefined
      ? []
      : Array.isArray(compiler.system) ? compiler.system : [compiler.system]
    const resolvedEntries = new Map<string, string>()
    const hostResolver = config.createResolver({ asSrc: true })

    for (const value of values) {
      const configuredEntry = typeof value === 'string' ? value : value.entry
      const resolved = await hostResolver(
        configuredEntry,
        join(config.root, 'package.json'),
        false,
        config.build.ssr === true,
      )
      const physical = getPhysicalResolvedPath(resolved)
      if (physical !== undefined)
        resolvedEntries.set(configuredEntry, physical)
    }

    systemSources = normalizeSystemSources(compiler.system, config.root, resolvedEntries)
    systemResolutionCache = createConfiguredSystemResolutionCache()
    configuredImportResolutionCache.clear()
  }

  const sendSystemCssUpdate = (virtualId: string, previous: string | undefined, next: string): void => {
    if (previous === undefined || previous === next || clientServer === undefined)
      return

    createHmrHost().updateCssModule(virtualId)
  }

  const clearRetiredCss = (virtualIds: ReadonlySet<string>): void => {
    if (virtualIds.size === 0)
      return

    createHmrHost().removeCssModules(virtualIds)
  }

  const prepareConfiguredSystem = async (
    source: NormalizedSystemSource,
  ): Promise<PreparedSystem> => {
    const generation = (systemGenerationsByEntry.get(source.entry) ?? 0) + 1
    systemGenerationsByEntry.set(source.entry, generation)
    let dependencies: string[] = []

    try {
      const bundled = await buildStyleModule({
        filePath: source.entry,
        root: config.root,
        alias: convertViteAliasesToEsbuild(config),
        namespaceFiles: [...getConfiguredSystemModuleFiles(source, config.root, systemResolutionCache)],
        preserveAuthoredSource: source.artifact !== undefined,
      })
      dependencies = bundled.watchFiles
      const inProcess = evaluateSystemModule(bundled.source, source.entry)
      let portable = inProcess.portable

      if (source.artifact) {
        const parsed: unknown = JSON.parse(await readFile(source.artifact, 'utf-8'))
        assertPortableSystem(parsed)
        const owner = source.packageName ?? substrate.backend.getPackageName(dirname(source.entry)) ?? source.entry
        assertFreshPortablePair(source, inProcess.portable, parsed, owner)
        portable = parsed
      }

      const projected = emitSystemCss(
        inProcess.contract,
        {
          filePath: source.entry,
          ...(source.packageName === undefined ? {} : { packageName: source.packageName }),
        },
        getIdentifierOption(),
      )

      return {
        source,
        generation,
        dependencies,
        evaluated: {
          portable,
          contract: inProcess.contract,
          exportNames: inProcess.exportNames,
          contractExport: source.exportName ?? inProcess.contractExport,
          buildExports: inProcess.buildExports,
          moduleExports: inProcess.moduleExports,
          records: [...inProcess.records, ...projected.records],
          css: projected.css,
        },
      }
    }
    catch (error) {
      if (systemGenerationsByEntry.get(source.entry) === generation) {
        rememberSystemDependencies(
          source,
          dependencies.length > 0 ? dependencies : buildFailureFiles(error, config.root),
          systemDependentsByFile,
        )
      }
      const failure = createStyleBuildError(error, source.entry, config.root)
      reportFailure(failure)
      throw failure
    }
  }

  const registerSystems = async (
    candidates: readonly PreparedSystem[],
  ): Promise<EvaluatedSystem[]> => {
    const result = await registerSystemCandidates(candidates, {
      root: config.root,
      artifactDirectory: getArtifactDirectory(),
      virtualExtension: virtualExt,
      state: {
        ownership: {
          cssByVirtualId,
          cssOwnersByVirtualId,
          systemCssVirtualIdsByEntry,
          systemsByEntry,
          systemsByRuntimeId,
        },
        namespaceOwners,
        systemGenerationsByEntry,
        systemDependentsByFile,
        readinessFailures: systemReadinessFailures,
        recordsByFile,
      },
    })

    if (result.committed && result.ownershipUpdate !== undefined) {
      scheduleManifest()
      for (const id of result.ownershipUpdate.nextCss.keys())
        pendingCssResponseCache.clear(id)
      for (const [id, contents] of result.ownershipUpdate.pendingCssResponses)
        pendingCssResponseCache.remember(id, contents)
      clearRetiredCss(result.ownershipUpdate.retiredCssIds)
      for (const update of result.ownershipUpdate.cssUpdates)
        sendSystemCssUpdate(update.id, update.previous, update.next)
    }

    return [...result.systems]
  }

  const evaluateConfiguredSystem = async (
    source: NormalizedSystemSource,
  ): Promise<EvaluatedSystem> => {
    const [accepted] = await registerSystems([await prepareConfiguredSystem(source)])
    return accepted!
  }

  const evaluateConfiguredSystems = async (
    sources: readonly NormalizedSystemSource[],
  ): Promise<EvaluatedSystem[]> => {
    const unique = [...new Map(sources.map(source => [source.entry, source])).values()]
    return registerSystems(await Promise.all(unique.map(prepareConfiguredSystem)))
  }

  const ensureConfiguredSystem = (source: NormalizedSystemSource): Promise<EvaluatedSystem> => {
    const accepted = systemsByEntry.get(source.entry)
    if (accepted !== undefined) {
      systemReadinessFailures.delete(source.entry)
      return Promise.resolve(accepted)
    }

    const pending = pendingSystemsByEntry.get(source.entry)
    if (pending !== undefined)
      return pending

    const evaluation = evaluateConfiguredSystem(source)
    pendingSystemsByEntry.set(source.entry, evaluation)
    void evaluation.then(() => {}, () => {}).finally(() => {
      if (pendingSystemsByEntry.get(source.entry) === evaluation)
        pendingSystemsByEntry.delete(source.entry)
    })
    return evaluation
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
      systemReadinessFailures.clear()
      systemSourcesReady = resolveConfiguredSystemSources().then(async () => {
        // Nuxt can render from its SSR environment before a client style
        // module has been requested. Project every configured system during
        // readiness so its semantic CSS already exists for both graphs.
        await Promise.all(systemSources.map(async (source) => {
          try {
            await ensureConfiguredSystem(source)
          }
          catch (error) {
            // Keep readiness itself fulfilled so a dev server can retry the
            // same configured entry after its source is repaired. buildStart
            // still surfaces the original failure for an initial build.
            systemReadinessFailures.set(source.entry, error)
          }
        }))
      })
    },

    configureServer(devServer) {
      server = devServer

      // Nuxt creates distinct browser and SSR Vite servers from the same
      // plugin instance. The latter configures last, so a single `server`
      // reference silently routes CSS updates/full reloads to an HMR channel
      // no browser listens to. Plain Vite's consumer is `client` too.
      if (devServer.config.build.ssr !== true)
        clientServer = devServer

      if (devServer.config.build.ssr !== true)
        pendingCssResponseCache.addMiddleware(devServer, config.root, config.base)

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

      void systemSourcesReady.then(() => {
        for (const source of systemSources)
          devServer.watcher.add([source.entry, ...(source.artifact ? [source.artifact] : [])])
      }, () => {
        // buildStart/transform owns the actionable configuration error; the
        // watcher setup must not create a second unhandled rejection.
      })
    },

    async buildStart() {
      await systemSourcesReady
      if (nativeTypeHost !== 'nuxt') {
        const result = await writeAutoImportDeclarations(options, { root: config.root })
        rememberAppAutoImportSourceFiles(result.plan)
      }

      for (const source of systemSources) {
        if (systemReadinessFailures.has(source.entry)) {
          // A dev server must stay alive so its first source repair can be
          // handled by HMR. A production build has no repair boundary and
          // should fail its buildStart hook with the original diagnostic.
          if (!server)
            throw systemReadinessFailures.get(source.entry)
          continue
        }
        const system = await ensureConfiguredSystem(source)
        for (const dependency of source.dependencies) {
          this.addWatchFile(dependency)
          server?.watcher.add(dependency)
        }
        recordsByFile.set(source.entry, system.records.length > 0
          ? system.records
          : [createSystemRecordFromPortable(system.portable)])
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
      await systemSourcesReady
      const [validId] = id.split('?')
      if (!styleFileFilter.test(validId))
        return null
      return transformStyleModule(_code, id, transformOptions, {
        root: config.root,
        styleFileFilter,
        virtualExtension: virtualExt,
        isDev: server !== undefined,
        host: createHmrHost(),
        systemSources,
        namespaceOwners,
        recordsByFile,
        cssByVirtualId,
        cssVirtualIdsByEntry,
        cssOwnersByVirtualId,
        rememberPendingCssResponse: pendingCssResponseCache.remember,
        clearPendingCssResponse: pendingCssResponseCache.clear,
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
        rememberStyleSystems: (entry, systems) => rememberStyleSystems(
          entry,
          systems,
          systemsByStyleEntry,
          styleEntriesBySystem,
        ),
        rememberDependencies: (entry, files, preserveKnown) => rememberStyleDependencies(
          entry,
          files,
          preserveKnown,
          dependenciesByEntry,
          dependentsByFile,
        ),
        addWatchFile: file => this.addWatchFile(file),
        buildFailureFiles,
        createStyleBuildError,
        reportFailure,
        getIdentifierOption,
        scheduleManifest,
      })
    },

    async handleHotUpdate({ file, server: devServer, modules }) {
      await systemSourcesReady
      const normalizedFile = normalizePath(file)
      const generatedArtifactDirectory = normalizePath(getArtifactDirectory()).replace(/\/$/, '')
      const isConfiguredArtifact = systemSources.some(source => source.artifact === normalizedFile)
      if (
        !isConfiguredArtifact
        && (normalizedFile === normalizePath(join(config.root, '.vanity', 'manifest.json'))
          || normalizedFile.startsWith(`${generatedArtifactDirectory}/`))
      ) {
        // Compiler-owned writes are already published before the accepted
        // generation is swapped. Letting Vite treat their watcher events as
        // ordinary source edits can reload an application in the middle of a
        // system transition, before its namespace projection is retired.
        return []
      }
      // A changed source may add/remove a re-export without changing the
      // configured entry spelling. Re-resolve the next graph generation
      // rather than allowing a cached safe miss or stale owner to linger.
      clearConfiguredSystemResolutionCache(systemResolutionCache)
      systemAuthoringByFile.clear()
      configuredImportResolutionCache.clear()
      return await handleHotUpdate({ file, modules }, {
        host: createHmrHost(devServer, clientServer),
        runtimeVirtualPrefix,
        systemSources,
        systemDependentsByFile,
        systemsByEntry,
        dependentsByFile,
        styleEntriesBySystem,
        runtimeVirtualIds,
        runtimeNamespaceIdsByEntry,
        clearRuntimeNamespaceProjection: (id) => {
          runtimeNamespaceProjections.delete(id)
        },
        getRuntimeNamespaceIdentity: (system, moduleFile) =>
          getRuntimeSystemNamespaceProjection(system, moduleFile)?.identity,
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
        evaluateConfiguredSystems,
      }) as ModuleNode[] | undefined
    },

    watchChange(id) {
      // Import resolution can change when an unresolved package/file appears,
      // even when the current export graph does not include it.
      configuredImportResolutionCache.clear()
      if (systemSources.some(source =>
        source.entry === normalizePath(id)
        || source.dependencies.has(normalizePath(id)))) {
        // Rollup/Vite reports create and delete events here as well as source
        // updates. A re-export graph fact is generation-scoped, so additions,
        // removals, and repairs all invalidate the same safe-hit/miss cache.
        clearConfiguredSystemResolutionCache(systemResolutionCache)
        systemAuthoringByFile.clear()
      }
    },

    async resolveId(source, importer, resolveOptions) {
      await systemSourcesReady
      const [validId, query] = source.split('?')

      if (validId.startsWith(runtimeVirtualPrefix))
        return validId

      // A generated namespace re-exports ordinary bindings from the real
      // source module. Let that edge pass through unchanged; only the
      // module's actual system exports belong on the generated backing.
      if (importer?.startsWith(runtimeNamespaceVirtualPrefix))
        return null

      let systemSource: NormalizedSystemSource | undefined
      let resolvedModuleFile: string | undefined
      if (systemSources.length > 0) {
        // Let Vite resolve aliases, export conditions, extensions, and
        // symlinks first. The compiler fallback remains for host requests
        // that do not yield a physical id, while graph facts stay cached for
        // the current configuration generation.
        const resolutionKey = `${validId}\0${importer ?? ''}\0${JSON.stringify(resolveOptions ?? {})}`
        if (configuredImportResolutionCache.has(resolutionKey)) {
          const cached = configuredImportResolutionCache.get(resolutionKey) ?? undefined
          systemSource = cached?.system
          resolvedModuleFile = cached?.moduleFile
        }
        else {
          const resolved = getPhysicalResolvedPath(
            (await this.resolve(validId, importer, { skipSelf: true }))?.id,
          )
          const match: ResolvedConfiguredSystemImport | undefined = resolved === undefined
            ? resolveConfiguredSystemImport(
                validId,
                importer,
                systemSources,
                config.root,
                systemResolutionCache,
              )
            : (() => {
                const system = findConfiguredSystemInModuleGraph(
                  resolved,
                  systemSources,
                  config.root,
                  systemResolutionCache,
                )
                return system === undefined ? undefined : { system, moduleFile: resolved }
              })()
          systemSource = match?.system
          resolvedModuleFile = match?.moduleFile
          configuredImportResolutionCache.set(resolutionKey, match ?? null)
        }
      }
      if (systemSource) {
        const evaluated = await ensureConfiguredSystem(systemSource)
        const target = resolveOptions?.ssr || config.build.ssr === true ? 'ssr' : 'browser'
        const runtimeId = getRuntimeIdentity(evaluated.portable)
        const backingId = `${runtimeVirtualPrefix}${target}:${runtimeId}`
        runtimeVirtualIds.add(backingId)
        const moduleFile = resolvedModuleFile ?? systemSource.entry
        const namespace = getRuntimeSystemNamespaceProjection(evaluated, moduleFile)
        if (namespace === undefined)
          return null
        if (!(await isAuthoredSystemModule(moduleFile)))
          return null
        const id = `${runtimeNamespaceVirtualPrefix}${target}:${runtimeId}:${namespace.identity}:${encodeURIComponent(getRootRelativeModulePath(moduleFile, config.root))}`
        runtimeNamespaceProjections.set(id, { system: evaluated, target, moduleFile })
        const namespaces = runtimeNamespaceIdsByEntry.get(systemSource.entry) ?? new Map()
        namespaces.set(id, {
          id,
          moduleFile,
          identity: namespace.identity,
          runtimeId,
        })
        runtimeNamespaceIdsByEntry.set(systemSource.entry, namespaces)
        return id
      }

      if (!validId.endsWith(virtualExt))
        return null

      const absoluteId = resolveViteVirtualId(validId, config.root, config.base)

      if (absoluteId === undefined || !cssByVirtualId.has(absoluteId))
        return null

      // Keep the query — Vite's HMR timestamps ride it.
      return query ? `${absoluteId}?${query}` : absoluteId
    },

    async load(id) {
      await systemSourcesReady
      const [validId] = id.split('?')

      if (validId.startsWith(runtimeNamespaceVirtualPrefix)) {
        const projection = runtimeNamespaceProjections.get(validId)
        if (projection === undefined) {
          throw new VanityError({
            code: 'VANITY_VITE_BUILD_FAILED',
            message: `missing runtime namespace projection '${validId}'`,
            path: ['runtime', validId],
            fix: 'retry the application module after the configured system has been evaluated',
          })
        }
        const runtimeId = getRuntimeIdentity(projection.system.portable)
        const backingId = `${runtimeVirtualPrefix}${projection.target}:${runtimeId}`
        return buildRuntimeSystemNamespaceModule(
          projection.system,
          projection.moduleFile,
          backingId,
        )
      }

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

      const absoluteId = resolveViteVirtualId(validId, config.root, config.base)
      return absoluteId === undefined ? null : cssByVirtualId.get(absoluteId) ?? null
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
  const { result: exports, records } = collectInspection(() => executeBundle(source, filePath))
  const entryExports = isRecord(exports.__vanityEntry) ? exports.__vanityEntry : exports
  const moduleExports = isRecord(exports.__vanityModules)
    ? new Map(Object.entries(exports.__vanityModules)
        .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
        .map(([file, value]) => [normalizePath(file), value]))
    : new Map([[normalizePath(filePath), entryExports]])
  const contracts = Object.entries(entryExports)
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
  // Count systems, not export names: one system exported under several names is
  // an ordinary alias, while two systems in one entry leaves no way to say which
  // one this configuration means.
  const distinctSystems = new Set(contracts.map(entry => entry.value))
  if (distinctSystems.size > 1) {
    throw new VanityError({
      code: 'VANITY_VITE_BUILD_FAILED',
      message: `${filePath} exports ${distinctSystems.size} different consolidated Vanity systems`,
      file: filePath,
      detail: contracts.map(entry => `system export: ${entry.name}`),
      fix: 'give each consolidated system its own system module and configure them separately',
    })
  }

  const [entry] = contracts
  return {
    portable: entry.contract.portable,
    contract: entry.contract,
    exportNames: Object.keys(entryExports).sort(),
    contractExport: entry.name,
    buildExports: entryExports,
    moduleExports,
    records,
    css: '',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function renderCascadePrelude(roots: readonly string[]): string {
  const unique = [...new Set(roots.filter(root => root.trim().length > 0))]
  return unique.length === 0 ? '' : `@layer ${unique.join(', ')};\n`
}

/**
 * Narrow a host resolution to the physical module it names.
 *
 * The input is resolver output — an absolute path or a virtual id — never a
 * browser URL. Converting between an id and a URL belongs to the host
 * boundary and happens once on each side, so nothing is unwrapped here.
 */
function getPhysicalResolvedPath(resolved: string | undefined): string | undefined {
  if (resolved === undefined || resolved.startsWith('\0'))
    return undefined

  const clean = resolved.replace(/[?#].*$/, '')
  return isAbsolute(clean) ? normalizeModuleIdentity(clean) : undefined
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
