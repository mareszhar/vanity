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

import type { Adapter } from '@vanilla-extract/css'
import type { Loader } from 'esbuild'
import type { CallExpression, Expression, ObjectExpression, ObjectProperty } from 'oxc-parser'
import type { Plugin, PluginOption, ResolvedConfig, ViteDevServer } from 'vite'
import type {
  VanityCompilerOptions,
  VanityConfig,
  VanityIdentifierMode,
  VanityRuntimeAutoImports,
  VanitySystemSource,
} from './config'
import type { autoImportDelegateHooks } from './internal/autoImportDelegate'
import type { VanityInspectRecord } from './internal/inspect'
import type { VanityPortableSystemV1 } from './system/contract'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, posix, resolve } from 'node:path'
import { pid } from 'node:process'
import {
  addFileScope,
  getPackageInfo,
  normalizePath,
  parseFileScope,
  serializeVanillaModule,
  stringifyFileScope,
} from '@vanilla-extract/integration'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import { build as esbuild } from 'esbuild'
import { parseSync, Visitor } from 'oxc-parser'
import autoImportVite from 'unplugin-auto-import/vite'
import { reportDiagnostics, resetDiagnosticSources, VanityError } from './diagnostics'
import { styleAutoImportDeclarations as renderStyleAutoImportDeclarations } from './internal/autoImportDeclarations'
import { planStyleAutoImports } from './internal/autoImportPlan'
import { writeAutoImportDeclarationFiles, writeAutoImportDeclarations } from './internal/autoImportWriter'
import { exportModuleFilesFromFile } from './internal/exportNames'
import { withEmissionFileScope } from './internal/fileScope'
import { collectInspection } from './internal/inspect'
import { isPackageSpecifier, resolveRuntimeAutoImports } from './internal/runtimeAutoImports'
import { transformVanityCss } from './internal/transformCss'
import { vanityViteHost } from './internal/viteHost'
import { devtoolsPage } from './introspect/devtools'
import { buildManifest } from './introspect/manifest'
import {
  assertPortableSystem,
  portableSystemJson,
  runtimeTokenProjection,
  systemContractOf,
} from './system/contract'

export type {
  VanityAppOptions,
  VanityCompilerMode,
  VanityCompilerOptions,
  VanityConfig,
  VanityIdentifierMode,
  VanityRuntimeAutoImports,
  VanityRuntimeAutoImportsOptions,
  VanityRuntimeAutoImportSource,
  VanityStyleAutoImports,
  VanityStyleAutoImportsOptions,
  VanitySystemSource,
} from './config'

/** Shared host-neutral configuration accepted by `vanityPlugin`. */
export type VanityViteOptions = VanityConfig

/** `*.css.ts` (and variants) — vanity's authoring file extension. */
const styleFileFilter = /\.css\.(?:js|cjs|mjs|jsx|ts|tsx)(?:\?used)?$/
const styleSourceFilter = /\.css\.(?:js|cjs|mjs|jsx|ts|tsx)$/
const authoringSourceFilter = /\.[cm]?[jt]sx?$/

/** The stable virtual stylesheet a compiled style module imports; content lives in the store. */
const virtualExt = '.vanity.css'
const runtimeVirtualPrefix = '\0vanity:system-runtime:'
const cascadeUrl = '/__vanity/cascade.css'
const cascadeFileName = 'assets/vanity-cascade.css'

/** In dev a style module accepts itself: a CSS-only edit swaps styles in place, no reload. */
const selfAcceptFooter = '\nif (import.meta.hot) { import.meta.hot.accept() }\n'

/**
 * Compile Vanity style modules and maintain CSS, portable data, and Manifest v3.
 *
 * @param options Shared build-plane and application-plane configuration. The
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
  const app = options.app ?? {}
  const nativeTypeHost = (options as VanityViteOptions & { [vanityViteHost]?: 'nuxt' })[vanityViteHost]
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
  const namespaceOwners = new Map<string, Map<string, VanityPortableSystemV1>>()
  /** `.css.ts` entries claimed by Vanity rather than raw vanilla-extract. */
  const vanityOwnedStyleModules = new Set<string>()
  /** Style module → configured build-plane systems it imports. */
  const systemsByStyleEntry = new Map<string, Set<string>>()
  /** Configured build-plane system → style modules that import it. */
  const styleEntriesBySystem = new Map<string, Set<string>>()
  /** Local source graph files whose exports can change an auto-import declaration. */
  let runtimeAutoImportSourceFiles = new Set<string>()

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

  const manifestJson = (): string => {
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
    const json = manifestJson()

    if (json === writtenManifest)
      return

    const path = join(config.root, '.vanity', 'manifest.json')
    await writeIfChanged(path, json)
    writtenManifest = json
  }

  const artifactDirectory = () => resolve(
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

    const runtimeId = runtimeIdentity(evaluated.portable)
    const duplicate = systemsByRuntimeId.get(runtimeId)
    if (duplicate && duplicate.portable.identities.css !== evaluated.portable.identities.css) {
      // Equal runtime semantics with distinct CSS is valid only while CSS owns
      // a distinct namespace. Same-namespace conflicts were rejected above.
    }
    systemsByRuntimeId.set(runtimeId, duplicate ?? evaluated)

    const artifact = join(
      artifactDirectory(),
      'systems',
      `${evaluated.portable.identities.compatibility}.json`,
    )
    await writeIfChanged(artifact, portableSystemJson(evaluated.portable))
    return evaluated
  }

  const evaluateConfiguredSystem = async (
    source: NormalizedSystemSource,
  ): Promise<EvaluatedSystem> => {
    let bundled: Awaited<ReturnType<typeof bundleStyleModule>>
    try {
      bundled = await bundleStyleModule({
        filePath: source.entry,
        root: config.root,
        alias: viteAliasToEsbuild(config),
      })
      rememberSystemDependencies(source, bundled.watchFiles)
    }
    catch (error) {
      rememberSystemDependencies(source, buildFailureFiles(error, config.root))
      const failure = styleBuildError(error, source.entry, config.root)
      reportFailure(failure)
      throw failure
    }

    const inProcess = evaluateSystemModule(bundled.source, source.entry)
    let portable = inProcess.portable

    if (source.artifact) {
      const parsed: unknown = JSON.parse(await readFile(source.artifact, 'utf-8'))
      assertPortableSystem(parsed)
      assertFreshPortablePair(source, inProcess.portable, parsed)
      portable = parsed
    }

    return registerSystem(source, {
      portable,
      exportNames: inProcess.exportNames,
      contractExport: source.exportName ?? inProcess.contractExport,
      surface: inProcess.surface,
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

  const identOption = () =>
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
    const autoImports = compiler.styleAutoImports

    if (!autoImports)
      return undefined

    const stylePlan = await planStyleAutoImports(autoImports, compiler.system, config.root)
    if (stylePlan === undefined)
      return undefined

    const { from, names } = stylePlan
    const source = await readFile(from, 'utf-8')

    if (nativeTypeHost !== 'nuxt')
      await writeAutoImportDeclarationFiles([stylePlan.declaration, stylePlan.bridge])

    if (source !== systemSource) {
      const { watchFiles } = await bundleStyleModule({
        filePath: from,
        root: config.root,
        alias: viteAliasToEsbuild(config),
      })

      systemSource = source
      systemDeps = new Set([from, ...watchFiles.map(normalizePath)])
    }

    if (systemDeps.has(filePath))
      return undefined

    const ambientAliases = styleAutoImportAliases(source, from, names)

    const shim = join(config.root, 'node_modules', '.vanity', 'style-auto-imports.mjs')
    const content = names.length === 0
      ? 'export {}\n'
      : `export { ${names.join(', ')} } from '${from}'\n`
    if (content !== shimContent) {
      await mkdir(dirname(shim), { recursive: true })
      await writeFile(shim, content)
      shimContent = content
    }

    return names.length === 0 ? undefined : { aliases: ambientAliases, path: shim }
  }

  const rememberRuntimeAutoImportSourceFiles = (plan: Awaited<ReturnType<typeof writeAutoImportDeclarations>>['plan']): void => {
    const files = new Set<string>()

    for (const source of plan.runtime?.sources ?? []) {
      if (isPackageSpecifier(source.from))
        continue

      for (const file of exportModuleFilesFromFile(source.from, config.root))
        files.add(normalizePath(file))
    }

    runtimeAutoImportSourceFiles = files
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
          res.end(manifestJson())
          return
        }

        if (path === '/' || path === '/index.html') {
          res.setHeader('Content-Type', 'text/html')
          res.end(devtoolsPage(config.root))
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
        rememberRuntimeAutoImportSourceFiles(result.plan)
      }

      for (const source of systemSources) {
        const system = await ensureConfiguredSystem(source)
        for (const dependency of source.dependencies) {
          this.addWatchFile(dependency)
          server?.watcher.add(dependency)
        }
        recordsByFile.set(source.entry, [systemRecordFromPortable(system.portable)])
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

      const root = config.root
      const filePath = normalizePath(validId)

      let source: string
      let watchFiles: string[]
      let externalSystems: readonly BundleExternalModule[] = []
      let externalSystemEntries: readonly string[] = []

      try {
        externalSystems = await Promise.all(systemSources.map(async (systemSource, index) => {
          // An auto-import barrel may be the only route from a style module to
          // the configured system. Ensure that route still receives the same
          // evaluated build-plane external as an explicit system import.
          const system = await ensureConfiguredSystem(systemSource)
          return {
            id: `vanity:build-system:${index}`,
            source: systemSource,
            exports: system.buildExports,
          }
        }))
        const injection = await injectShimFor(filePath)
        const bundled = await bundleStyleModule({
          filePath,
          root,
          alias: viteAliasToEsbuild(config),
          inject: injection?.path,
          ambientAliases: injection?.aliases,
          externalModules: externalSystems,
        })
        source = bundled.source
        watchFiles = bundled.watchFiles
        externalSystemEntries = bundled.externalSystemEntries
        rememberStyleSystems(filePath, externalSystemEntries)
      }
      catch (error) {
        failedStyleEntries.add(filePath)
        const failureFiles = buildFailureFiles(error, root)
        const dependencies = rememberDependencies(
          filePath,
          failureFiles,
          true,
        )
        for (const dependency of dependencies)
          this.addWatchFile(dependency)
        const failure = styleBuildError(error, filePath, root)
        reportFailure(failure)
        throw failure
      }

      failedStyleEntries.delete(filePath)
      const dependencies = rememberDependencies(filePath, watchFiles, false)
      for (const dependency of dependencies)
        this.addWatchFile(dependency)

      let evaluated: EvaluatedStyleModule
      try {
        evaluated = evaluateStyleModule(
          source,
          filePath,
          identOption(),
          new Map(externalSystems.map(system => [system.id, system.exports])),
        )
      }
      catch (error) {
        failedStyleEntries.add(filePath)
        const failure = styleBuildError(error, filePath, root)
        reportFailure(failure)
        throw failure
      }
      const { exports, cssByFileScope, unusedCompositionRegex, records } = evaluated

      // `.css.ts` is an ecosystem convention shared with vanilla-extract.
      // A raw vanilla-extract module emits through the temporary substrate
      // adapter above but creates no Vanity inspection records. Leave that
      // source untouched so the bundled vanilla-extract plugin immediately
      // after this one can own its normal transform. Any Vanity authoring
      // primitive records itself, including modules reached through an
      // auto-imported system, so this remains semantic rather than relying on
      // fragile import-text heuristics.
      if (records.length === 0) {
        vanityOwnedStyleModules.delete(filePath)
        rememberDependencies(filePath, [], false)
        recordsByFile.delete(filePath)
        replaceEntryVirtualIds(filePath, new Set(), cssVirtualIdsByEntry, cssByVirtualId)
        return null
      }
      vanityOwnedStyleModules.add(filePath)

      const portableSystems = records.flatMap(record =>
        record.kind === 'system' && record.portable !== undefined
          ? [record.portable]
          : [])

      for (const portable of portableSystems) {
        const configuredOwner = systemSources.find(source =>
          sameAuthoredFile(source.entry, portable.source, root))
        assertNamespaceOwnership(
          configuredOwner?.entry ?? normalizeSystemPath(portable.source ?? filePath, root),
          portable,
          namespaceOwners,
        )
      }

      // Replace each evaluated file's inspection records — the bundle carries
      // its whole import graph, so records for dependencies arrive here too.
      const recordedFiles = new Set<string>()

      for (const record of records)
        recordedFiles.add(record.file ?? normalizePath(filePath))

      for (const file of recordedFiles)
        recordsByFile.set(file, records.filter(record => (record.file ?? normalizePath(filePath)) === file))

      const cssImports: string[] = []
      const nextVirtualIds = new Set<string>()

      for (const [serializedFileScope, css] of cssByFileScope) {
        const fileScope = parseFileScope(serializedFileScope)
        const system = portableSystems.find(portable =>
          !sameAuthoredFile(fileScope.filePath, filePath, root)
          && sameAuthoredFile(fileScope.filePath, portable.source, root))
        const virtualId = system === undefined
          ? `${normalizePath(join(root, fileScope.filePath))}${virtualExt}`
          : normalizePath(join(
              root,
              '.vanity',
              'virtual',
              'system',
              `${system.identities.css}${virtualExt}`,
            ))
        // Provenance in dev: the stylesheet names its style module up front.
        const served = server ? `/* ${fileScope.filePath} · vanity */\n${css}` : css
        const previousCss = cssByVirtualId.get(virtualId)
        const changed = previousCss !== undefined && previousCss !== served

        cssByVirtualId.set(virtualId, served)
        nextVirtualIds.add(virtualId)
        cssImports.push(`import '${virtualId}';`)

        // The id is stable, so update both halves of the HMR contract: mark
        // Vite's file-change walk already invalidated this virtual module via
        // its importer before the style transform runs. At that point its
        // self-accepting metadata is intentionally blank, so `reloadModule`
        // cannot rediscover an update boundary. Notify the client of the
        // known-safe CSS module directly; fetching its stable URL re-runs
        // Vite's CSS wrapper and replaces the existing style tag in place.
        // Dependency fan-out otherwise refreshes the in-memory bytes without
        // ever asking the browser to fetch them.
        if (changed && clientServer) {
          const url = `/${posix.relative(normalizePath(root), virtualId)}`

          for (const virtualModule of clientServer.moduleGraph.getModulesByFile(virtualId) ?? [])
            clientServer.moduleGraph.invalidateModule(virtualModule)

          sendCssUpdate(clientServer, url, Date.now())
        }
      }

      // A configured system is evaluated once and reused by every importing
      // style module. Its CSS therefore emits only on the first build-plane
      // access, but every importer must retain the stable semantic stylesheet
      // edge so a later re-transform cannot orphan or delete that shared CSS.
      for (const entry of externalSystemEntries) {
        const system = systemsByEntry.get(entry)
        if (!system)
          continue
        const virtualId = normalizePath(join(
          root,
          '.vanity',
          'virtual',
          'system',
          `${system.portable.identities.css}${virtualExt}`,
        ))
        if (!cssByVirtualId.has(virtualId) || nextVirtualIds.has(virtualId))
          continue
        nextVirtualIds.add(virtualId)
        cssImports.unshift(`import '${virtualId}';`)
      }

      replaceEntryVirtualIds(filePath, nextVirtualIds, cssVirtualIdsByEntry, cssByVirtualId)

      if (server)
        scheduleManifest()

      let code = serializeVanillaModule(cssImports, exports, unusedCompositionRegex)

      if (server && !transformOptions?.ssr) {
        const signature = Object.keys(exports).sort().join('\0')
        const previous = exportSignatures.get(filePath)
        exportSignatures.set(filePath, signature)

        // Stable export names → values are serialized contracts whose CSS can
        // update in place. Added/removed/renamed exports leave importers with
        // stale bindings, so exactly one full reload restores truth.
        if (previous !== undefined && previous !== signature) {
          const hotServer = clientServer ?? server
          hotServer.hot.send({ type: 'full-reload' })
        }

        code += selfAcceptFooter
      }

      return { code, map: { mappings: '' } }
    },

    async handleHotUpdate({ file, server: devServer, modules }) {
      const normalizedFile = normalizePath(file)
      if (
        nativeTypeHost !== 'nuxt'
        && app.runtimeAutoImports !== undefined
        && runtimeAutoImportSourceFiles.has(normalizedFile)
      ) {
        const result = await writeAutoImportDeclarations(options, { root: config.root })
        rememberRuntimeAutoImportSourceFiles(result.plan)
      }

      const affectedSystems = [...systemDependentsByFile.get(normalizedFile) ?? []]
      const invalidatedRuntimeIdentities = new Set<string>()
      const failures: unknown[] = []

      for (const entry of affectedSystems) {
        const source = systemSources.find(candidate => candidate.entry === entry)
        if (!source)
          continue
        try {
          const previous = systemsByEntry.get(entry)
          const system = await evaluateConfiguredSystem(source)
          recordsByFile.set(source.entry, [systemRecordFromPortable(system.portable)])
          if (
            previous !== undefined
            && runtimeIdentity(previous.portable) !== runtimeIdentity(system.portable)
          ) {
            invalidatedRuntimeIdentities.add(runtimeIdentity(previous.portable))
          }
        }
        catch (error) {
          // Preserve the last-good facade, CSS, artifact, and manifest. The
          // changed entry/style transform reports the fresh compiler error.
          failures.push(error)
        }
      }

      const dependents = dependentsByFile.get(normalizedFile)
      if (!dependents?.size && affectedSystems.length === 0)
        return

      // A bundled dependency changed: every style module built on it
      // re-evaluates, so its fresh CSS lands under the same stable ids.
      const affected = new Set(modules)
      const entries = new Set(dependents ?? [])
      for (const system of affectedSystems) {
        for (const entry of styleEntriesBySystem.get(system) ?? [])
          entries.add(entry)
      }

      for (const id of runtimeVirtualIds) {
        const payload = id.slice(runtimeVirtualPrefix.length)
        const runtimeId = payload.slice(payload.indexOf(':') + 1)
        if (!invalidatedRuntimeIdentities.has(runtimeId))
          continue
        const runtimeModule = devServer.moduleGraph.getModuleById(id)
        if (runtimeModule) {
          devServer.moduleGraph.invalidateModule(runtimeModule)
          affected.add(runtimeModule)
        }
      }

      for (const dependent of entries) {
        const url = `/${posix.relative(normalizePath(config.root), dependent)}`
        let dependentModules = [...devServer.moduleGraph.getModulesByFile(dependent) ?? []]
        const urlModule = await devServer.moduleGraph.getModuleByUrl(url)
        if (urlModule !== undefined && !dependentModules.includes(urlModule))
          dependentModules.push(urlModule)

        // Vite 8's compatibility graph and environment graphs do not always
        // share invalidation state for dependencies bundled outside Vite.
        // Invalidate the concrete environment entry as well as the wrapper.
        for (const environment of Object.values(devServer.environments)) {
          const environmentModule = await environment.moduleGraph.getModuleByUrl(url)
          if (environmentModule !== undefined)
            environment.moduleGraph.invalidateModule(environmentModule)
        }

        // A first-ever failed transform may not have a healthy module-graph
        // node. Materialize one from the attempted entry we track outside
        // Vite's graph so the repaired dependency can invalidate/retry it on
        // this same server.
        if (dependentModules.length === 0 && failedStyleEntries.has(dependent)) {
          dependentModules = [await devServer.moduleGraph.ensureEntryFromUrl(url)]
        }

        for (const dependentModule of dependentModules) {
          // Bundled dependencies are deliberately invisible to Vite's import
          // graph, so its ordinary file walk cannot invalidate this entry for
          // us. Clear the cached transform here before returning the boundary.
          devServer.moduleGraph.invalidateModule(dependentModule)
          affected.add(dependentModule)
        }
      }

      // Vite cannot see bundled import edges and may soft-reuse a last-good
      // transform even after its compatibility graph reports hard
      // invalidation. Recompile each known entry eagerly through the active
      // environment: errors reach the overlay now; a later repair retries on
      // the same server; stable CSS ids keep serving their last-good bytes
      // until the whole evaluation succeeds.
      for (const dependent of entries) {
        try {
          const source = await readFile(dependent, 'utf-8')
          await devServer.environments.client.pluginContainer.transform(source, dependent)
        }
        catch (error) {
          failures.push(error)
        }
      }

      if (failures.length > 0)
        throw failures[0]

      return [...affected]
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
        const runtimeId = runtimeIdentity(evaluated.portable)
        const id = `${runtimeVirtualPrefix}${target}:${runtimeId}`
        systemsByRuntimeId.set(runtimeId, evaluated)
        runtimeVirtualIds.add(id)
        return id
      }

      if (!validId.endsWith(virtualExt))
        return null

      const absoluteId = getAbsoluteVirtualId(validId, config.root)

      if (!resolveCssVirtualAlias(absoluteId, config.root, cssByVirtualId, namespaceOwners))
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
        if (!system)
          throw new Error(`[vanity] missing portable runtime system '${runtimeId}'`)
        return runtimeSystemModule(system, target)
      }

      if (!validId.endsWith(virtualExt))
        return null

      const absoluteId = getAbsoluteVirtualId(validId, config.root)
      const resolved = resolveCssVirtualAlias(absoluteId, config.root, cssByVirtualId, namespaceOwners)
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

  const substratePlugins = vanillaExtractPlugin({
    identifiers: compiler.identifiers,
    unstable_mode: compiler.unstableMode,
    unstable_pluginFilter: ({ name }) =>
      name === 'vite-tsconfig-paths' || name === substrateCompilerTransport.name,
  }).map((plugin) => {
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

  const applicationPlugins = app.runtimeAutoImports === undefined
    ? []
    : normalizeAutoImportPlugins(createApplicationAutoImportPlugin(app.runtimeAutoImports))

  return [cssTsPlugin, substrateCompilerTransport, ...substratePlugins, ...applicationPlugins]
}

function createApplicationAutoImportPlugin(
  value: VanityRuntimeAutoImports,
): Plugin {
  let delegate: AutoImportPlugin | undefined
  let delegateRoot: string | undefined

  const createDelegate = (root: string): AutoImportPlugin => {
    const normalizedRoot = normalizePath(resolve(root))

    if (delegate !== undefined && delegateRoot === normalizedRoot)
      return delegate

    const options = createViteRuntimeAutoImports(value, normalizedRoot)
    delegate = autoImportVite({
      imports: options.imports,
      // Vanity owns the declaration plan and renderer. Unplugin remains the
      // source transformer, but never becomes a second declaration authority.
      dts: false,
      // Compiler authoring modules have their own injection lane. Keeping the
      // application lane out of `*.css.ts` prevents runtime presets from
      // leaking into code that Vanity evaluates in-process.
      exclude: [styleFileFilter],
      vueTemplate: true,
    }) as AutoImportPlugin
    delegateRoot = normalizedRoot
    return delegate
  }

  return {
    name: 'vanity:runtime-auto-imports',
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

interface ViteRuntimeAutoImports {
  imports: Array<{ from: string, imports: string[] }>
}

function createViteRuntimeAutoImports(
  value: VanityRuntimeAutoImports,
  root: string,
): ViteRuntimeAutoImports {
  const resolved = resolveRuntimeAutoImports(value, root)
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

interface NormalizedSystemSource {
  entry: string
  artifact?: string
  packageName?: string
  exportName?: string
  dependencies: Set<string>
}

interface EvaluatedSystem {
  portable: VanityPortableSystemV1
  exportNames: readonly string[]
  contractExport: string
  surface: 'target' | 'legacy'
  /** Compiler-only exports reused while evaluating importing style modules. */
  buildExports: Record<string, unknown>
}

function normalizeSystemSources(
  input: VanityCompilerOptions['system'],
  root: string,
): NormalizedSystemSource[] {
  const values = input === undefined ? [] : Array.isArray(input) ? input : [input]
  return values.map((value) => {
    const source: VanitySystemSource = typeof value === 'string' ? { entry: value } : value
    return {
      entry: normalizeSystemPath(source.entry, root),
      ...(source.artifact === undefined
        ? {}
        : { artifact: normalizeSystemPath(source.artifact, root) }),
      ...(source.packageName === undefined ? {} : { packageName: source.packageName }),
      ...(source.exportName === undefined ? {} : { exportName: source.exportName }),
      dependencies: new Set<string>(),
    }
  })
}

function normalizeSystemPath(file: string, root: string): string {
  return normalizePath(isAbsolute(file) ? file : resolve(root, file))
}

function resolveConfiguredSystemImport(
  source: string,
  importer: string | undefined,
  systems: readonly NormalizedSystemSource[],
  root: string,
): NormalizedSystemSource | undefined {
  if (source.startsWith('\0') || source.startsWith('virtual:'))
    return undefined
  const clean = source.replace(/[?#].*$/, '')
  let resolved: string
  if (isAbsolute(clean)) {
    resolved = normalizePath(clean)
  }
  else if (clean.startsWith('/') && !clean.startsWith('//')) {
    resolved = normalizePath(join(root, clean.slice(1)))
  }
  else if (clean.startsWith('.') && importer) {
    resolved = normalizePath(resolve(dirname(importer.replace(/[?#].*$/, '')), clean))
  }
  else {
    return undefined
  }
  return systems.find(system =>
    system.entry === resolved
    || system.entry.replace(/\.[cm]?[jt]sx?$/, '') === resolved)
}

function evaluateSystemModule(source: string, filePath: string): EvaluatedSystem {
  const { result: exports } = collectInspection(() => executeBundle(source, filePath))
  const contracts = Object.entries(exports)
    .map(([name, value]) => ({ name, value, contract: systemContractOf(value) }))
    .filter((entry): entry is {
      name: string
      value: object
      contract: NonNullable<ReturnType<typeof systemContractOf>>
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
    surface: 'class' in entry.value && !('css' in entry.value) ? 'target' : 'legacy',
    buildExports: exports,
  }
}

function assertFreshPortablePair(
  source: NormalizedSystemSource,
  build: VanityPortableSystemV1,
  portable: VanityPortableSystemV1,
): void {
  const mismatches = (Object.keys(build.identities) as Array<keyof typeof build.identities>)
    .filter(kind => build.identities[kind] !== portable.identities[kind])
  if (mismatches.length === 0)
    return

  const owner = source.packageName ?? getPackageInfo(dirname(source.entry)).name ?? source.entry
  throw new VanityError({
    code: 'VANITY_VITE_BUILD_FAILED',
    message: `the build JS and portable system artifact for package '${owner}' are stale`,
    file: source.artifact,
    detail: mismatches.map(kind =>
      `${kind}: build ${build.identities[kind]} · portable ${portable.identities[kind]}`),
    fix: `rebuild '${owner}' so its system JS and portable JSON are published from the same source state`,
  })
}

function namespaceKey(system: VanityPortableSystemV1): string {
  return `${system.prefix}\0${system.root}\0${system.layerRoot}`
}

function assertNamespaceOwnership(
  owner: string,
  system: VanityPortableSystemV1,
  owners: Map<string, Map<string, VanityPortableSystemV1>>,
): void {
  const key = namespaceKey(system)
  const namespace = owners.get(key) ?? new Map<string, VanityPortableSystemV1>()
  for (const [otherOwner, other] of namespace) {
    if (
      otherOwner !== owner
      && other.identities.css !== system.identities.css
    ) {
      throw new VanityError({
        code: 'VANITY_VITE_BUILD_FAILED',
        message: `two systems claim CSS namespace '${system.prefix}' at '${system.root}' with different output`,
        file: system.source,
        detail: [
          `${otherOwner}: ${other.identities.css}`,
          `${owner}: ${system.identities.css}`,
        ],
        fix: 'give the systems distinct prefix/root ownership, or install semantically identical package builds',
      })
    }
  }
  namespace.set(owner, system)
  owners.set(key, namespace)
}

function runtimeIdentity(system: VanityPortableSystemV1): string {
  return `${system.identities.compatibility}:${system.identities.runtime}`
}

function sameAuthoredFile(left: string, right: string | undefined, root: string): boolean {
  if (right === undefined)
    return false
  const normalizedLeft = normalizeSystemPath(left, root)
  const normalizedRight = normalizeSystemPath(right, root)
  return normalizedLeft === normalizedRight
}

function replaceEntryVirtualIds(
  entry: string,
  next: Set<string>,
  byEntry: Map<string, Set<string>>,
  css: Map<string, string>,
): void {
  const previous = byEntry.get(entry) ?? new Set<string>()
  byEntry.set(entry, next)
  for (const removed of previous) {
    if (next.has(removed))
      continue
    const stillUsed = [...byEntry.entries()].some(([other, ids]) =>
      other !== entry && ids.has(removed))
    if (!stillUsed)
      css.delete(removed)
  }
}

function resolveCssVirtualAlias(
  requested: string,
  root: string,
  css: ReadonlyMap<string, string>,
  namespaces: ReadonlyMap<string, ReadonlyMap<string, VanityPortableSystemV1>>,
): string | undefined {
  if (css.has(requested))
    return requested

  const authored = requested.slice(0, -virtualExt.length)
  for (const owners of namespaces.values()) {
    for (const system of owners.values()) {
      if (!sameAuthoredFile(authored, system.source, root))
        continue
      const semantic = normalizePath(join(
        root,
        '.vanity',
        'virtual',
        'system',
        `${system.identities.css}${virtualExt}`,
      ))
      if (css.has(semantic))
        return semantic
    }
  }
  return undefined
}

function renderCascadePrelude(roots: readonly string[]): string {
  const unique = [...new Set(roots.filter(root => root.trim().length > 0))]
  return unique.length === 0 ? '' : `@layer ${unique.join(', ')};\n`
}

function systemRecordFromPortable(system: VanityPortableSystemV1): VanityInspectRecord {
  return {
    kind: 'system',
    file: system.source,
    prefix: system.prefix,
    root: system.root,
    ...(system.tokenLayer === undefined ? {} : { tokenLayer: system.tokenLayer }),
    engine: system.engine.signature,
    supportTarget: system.engine.supportTarget,
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

function runtimeSystemModule(system: EvaluatedSystem, target: 'browser' | 'ssr'): string {
  const portable = system.portable
  const tokens = portable.tokens.map(runtimeTokenProjection)
  const runtimeContract = {
    ...portable.runtime,
    tokens: portable.runtime.tokens.map(token => ({
      token: token.token,
      name: token.name,
      rootPath: token.rootPath,
      root: token.root,
      ...(token.scopes === undefined ? {} : { scopes: token.scopes }),
      type: token.type,
      reference: token.reference,
      emit: token.emit,
      mutable: token.mutable,
      ...(token.validation === undefined ? {} : { validation: token.validation }),
      ...(token.baseSlot === undefined ? {} : { baseSlot: token.baseSlot }),
      branches: token.branches.map(branch => ({
        address: branch.address,
        ...(branch.slot === undefined ? {} : { slot: branch.slot }),
      })),
    })),
  }
  const buildMembers = system.surface === 'target'
    ? [
        'class',
        'rules',
        'raw',
        'fragment',
        'tdec',
        'keyframes',
        'fontFace',
        'recipe',
        'anatomy',
        'port',
        'atoms',
        'inLayer',
        'tokensOf',
        'namesOf',
        'varsOf',
        'explain',
        'serialize',
      ]
    : [
        'css',
        'globalCss',
        'keyframes',
        'fontFace',
        'tokenOverride',
        'recipe',
        'anatomy',
        'port',
        'defineAtoms',
        'tokensOf',
        'namesOf',
        'varsOf',
        'explain',
        'serialize',
      ]
  const sourceExports = new Set(system.exportNames)
  const lines = [
    `import { restoreBuildPlane, restoreRuntimeFactory, restoreRuntimeProps, restoreRuntimeReconciler, restoreRuntimeStyle, restoreSnapshotFrom, restoreToken } from '@mszr/vanity/runtime';`,
    `const _runtimeContract = ${JSON.stringify(runtimeContract)};`,
    `const _tokenRecords = ${JSON.stringify(tokens)};`,
    `const _t = {};`,
    `for (const _meta of _tokenRecords) {`,
    `  const _parts = _meta.path.split('.');`,
    `  let _target = _t;`,
    `  for (let _index = 0; _index < _parts.length - 1; _index++) _target = _target[_parts[_index]] ||= {};`,
    `  _target[_parts.at(-1)] = restoreToken(_meta);`,
    `}`,
    `const _runtime = restoreRuntimeFactory(_runtimeContract);`,
    `const _snapshotFrom = restoreSnapshotFrom(_runtimeContract);`,
    `const _reconcileRuntimeSnapshot = restoreRuntimeReconciler(_runtimeContract);`,
    `const _runtimeStyle = restoreRuntimeStyle(_runtimeContract);`,
    `const _runtimeProps = restoreRuntimeProps(_runtimeContract);`,
    `const _system = Object.freeze({`,
    `  t: Object.freeze(_t),`,
    `  runtime: _runtime, snapshotFrom: _snapshotFrom,`,
    `  reconcileRuntimeSnapshot: _reconcileRuntimeSnapshot,`,
    `  runtimeStyle: _runtimeStyle, runtimeProps: _runtimeProps,`,
    `  conditions: Object.freeze(${JSON.stringify(portable.conditions)}),`,
    `  layers: Object.freeze(${JSON.stringify(portable.layers)}),`,
    `  consts: Object.freeze(${JSON.stringify(portable.consts)}),`,
    `  plane: ${JSON.stringify(target)},`,
    ...buildMembers.map(name => `  ${name}: restoreBuildPlane({ name: ${JSON.stringify(name)} }),`),
    `  introspect: restoreBuildPlane({ name: "introspect" }),`,
    `});`,
  ]

  const emitted = new Set<string>()
  const exportValue = (name: string, value: string) => {
    if (!/^[$A-Z_][$\w]*$/i.test(name) || emitted.has(name))
      return
    emitted.add(name)
    lines.push(`export const ${name} = ${value};`)
  }

  exportValue(system.contractExport, '_system')
  for (const name of sourceExports) {
    if (name === 'default' || name === system.contractExport)
      continue
    if (name === 't')
      exportValue(name, '_system.t')
    else if (['runtime', 'snapshotFrom', 'reconcileRuntimeSnapshot', 'runtimeStyle', 'runtimeProps', 'conditions', 'layers', 'consts'].includes(name))
      exportValue(name, `_system.${name}`)
    else if (buildMembers.includes(name))
      exportValue(name, `_system.${name}`)
  }
  if (sourceExports.has('default'))
    lines.push('export default _system;')
  lines.push('')
  return lines.join('\n')
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

function styleBuildError(error: unknown, entry: string, root: string): unknown {
  if (error instanceof VanityError
    || (error !== null && typeof error === 'object' && 'name' in error
      && error.name === 'VanityError' && 'diagnostics' in error)) {
    return error
  }

  const [primary] = buildFailureLocations(error, root)
  const entryFile = authoredFile(entry, root)
  const primaryFile = primary === undefined ? entryFile : authoredFile(primary.file, root)
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

function authoredFile(file: string, root: string): string {
  const relative = normalizePath(posix.relative(normalizePath(root), normalizePath(file)))
  return relative.startsWith('..') ? normalizePath(file) : relative
}

function sendCssUpdate(server: ViteDevServer, url: string, timestamp: number): void {
  server.hot.send({
    type: 'update',
    updates: [{
      type: 'js-update',
      timestamp,
      path: url,
      acceptedPath: url,
      explicitImportRequired: false,
      isWithinCircularImport: false,
    }],
  })
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

// ─── Bundling ────────────────────────────────────────────────────────────────

/** Resolves the substrate from vanity's own context — see the module docstring. */
const substrateRequire = createRequire(import.meta.url)

/**
 * The substrate state the sandbox shares with this plugin — the adapter above
 * all — must be one instance, or evaluation silently collects nothing. Two
 * things break instance identity: a host's static `import` can land on a
 * different build than the sandbox's `require`, and each substrate CJS entry
 * picks its dev/prod flavor from `NODE_ENV` *at its own first load* — which
 * `vite build` mutates after plugins load. Requiring every shared entry here,
 * in one breath through the same `require` the bundle uses, pins one flavor
 * family by construction; the sandbox then hits the cache.
 */
const { removeAdapter, setAdapter }
  = substrateRequire('@vanilla-extract/css/adapter') as typeof import('@vanilla-extract/css/adapter')

for (const entry of ['@vanilla-extract/css', '@vanilla-extract/css/fileScope', '@vanilla-extract/css/functionSerializer'])
  substrateRequire(entry)

interface BundleStyleModuleParams {
  filePath: string
  root: string
  alias: Record<string, string>
  /** The auto-import shim module, if the system option is configured. */
  inject?: string
  /** Alias provenance declared by the configured style auto-import barrel. */
  ambientAliases?: ReadonlyMap<string, string>
  /** Already-evaluated configured systems imported by this style module. */
  externalModules?: readonly BundleExternalModule[]
}

interface StyleAutoImportInjection {
  aliases: ReadonlyMap<string, string>
  path: string
}

interface BundleExternalModule {
  readonly id: string
  readonly source: NormalizedSystemSource
  readonly exports: Record<string, unknown>
}

/**
 * Bundle one style module for evaluation: esbuild inlines its import graph,
 * every `*.css.ts` file gets port labels and a file scope, and the
 * substrate stays external (as absolute paths) so the evaluated bundle shares
 * the css adapter instance with this plugin. vanity itself is bundled in —
 * it ships ESM-only, and the evaluation sandbox is CommonJS.
 */
async function bundleStyleModule({
  filePath,
  root,
  alias,
  inject,
  ambientAliases,
  externalModules = [],
}: BundleStyleModuleParams): Promise<{
  source: string
  watchFiles: string[]
  externalSystemEntries: string[]
}> {
  const packageName = getPackageInfo(root).name
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
            path: substrateRequire.resolve(args.path),
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
              ? addFileScope({
                  source: located,
                  filePath: path,
                  rootPath: root,
                  packageName,
                })
              : located

            return {
              contents: source,
              loader: sourceLoader(path),
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

function sourceLoader(path: string): Loader {
  if (/\.tsx$/i.test(path))
    return 'tsx'
  if (/\.(?:ts|mts|cts)$/i.test(path))
    return 'ts'
  if (/\.jsx$/i.test(path))
    return 'jsx'
  return 'js'
}

/** The string-keyed subset of the resolved Vite aliases, for esbuild's resolver. */
function viteAliasToEsbuild(config: ResolvedConfig): Record<string, string> {
  const entries = config.resolve.alias
    .filter(entry => typeof entry.find === 'string' && typeof entry.replacement === 'string')
    .map(entry => [entry.find, entry.replacement])

  return Object.fromEntries(entries)
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

interface EvaluatedStyleModule {
  exports: Record<string, unknown>
  /** Serialized file scope → transformed CSS, in evaluation order. */
  cssByFileScope: Map<string, string>
  unusedCompositionRegex: RegExp | null
  /** What the evaluation recorded for the manifest ([internal/inspect.ts]). */
  records: VanityInspectRecord[]
}

/**
 * Run the bundle against the css adapter and transform what it emitted —
 * the same collection contract as the substrate's `processVanillaFile`,
 * evaluated in-process. The adapter is module-global substrate state, but
 * evaluation and transformation are fully synchronous, so concurrent
 * `transform` hooks cannot interleave inside the bound window.
 */
function evaluateStyleModule(
  source: string,
  filePath: string,
  identOption: VanityIdentifierMode,
  externalModules: ReadonlyMap<string, Record<string, unknown>> = new Map(),
): EvaluatedStyleModule {
  type Css = Parameters<Adapter['appendCss']>[0]
  type Composition = Parameters<Adapter['registerComposition']>[0]

  const cssObjsByFileScope = new Map<string, Css[]>()
  const localClassNames = new Set<string>()
  const composedClassLists: Composition[] = []
  const usedCompositions = new Set<string>()

  const adapter: Adapter = {
    appendCss: (css, fileScope) => {
      const serializedFileScope = stringifyFileScope(fileScope)
      const cssObjs = cssObjsByFileScope.get(serializedFileScope) ?? []
      cssObjs.push(css)
      cssObjsByFileScope.set(serializedFileScope, cssObjs)
    },
    registerClassName: className => void localClassNames.add(className),
    registerComposition: composition => void composedClassLists.push(composition),
    markCompositionUsed: identifier => void usedCompositions.add(identifier),
    onEndFileScope: () => {},
    // Vanity already injects the semantic declaration name. In debug mode,
    // prefer that exact name over vanilla-extract's `file_export` prefix;
    // when no declaration label exists, the `.css.ts` basename remains the
    // useful fallback. This keeps `button.css.ts` / `button` from surfacing as
    // the noisy `button_button` while retaining deterministic scoped hashes.
    getIdentOption: () => identOption === 'short'
      ? 'short'
      : ({ hash, debugId, filePath: scopedFile }: {
          hash: string
          debugId?: string
          filePath: string
          packageName?: string
        }) => {
          const fileLabel = posix.basename(normalizePath(scopedFile)).replace(/\.css\.[^.]+$/, '')
          const semanticLabel = (debugId ?? fileLabel)
            .replaceAll(/[^\w$-]+/g, '_')
            .replace(/^([^a-z_$])/, '_$1')
          return `${semanticLabel || 'style'}__${hash}`
        },
  }

  setAdapter(adapter)

  const cssByFileScope = new Map<string, string>()

  try {
    const { result: exports, records } = collectInspection(() =>
      // CommonJS bundling hoists dependency requires before vanilla-extract's
      // source-level file-scope prologue. Keep those dependencies in the same
      // style evaluation scope so an authoring barrel can safely read bound
      // helpers such as `ds.t` while it is initialized.
      withEmissionFileScope(filePath, () => executeBundle(source, filePath, externalModules)))

    for (const [serializedFileScope, cssObjs] of cssObjsByFileScope) {
      const css = transformVanityCss(cssObjs as any, {
        localClassNames: [...localClassNames],
        composedClassLists,
      })

      cssByFileScope.set(serializedFileScope, css)
    }

    const unusedCompositions = composedClassLists
      .filter(({ identifier }) => !usedCompositions.has(identifier))
      .map(({ identifier }) => identifier)

    return {
      exports,
      cssByFileScope,
      unusedCompositionRegex: unusedCompositions.length > 0
        ? new RegExp(`(${unusedCompositions.join('|')})\\s`, 'g')
        : null,
      records,
    }
  }
  finally {
    removeAdapter()
  }
}

/** Execute the CommonJS bundle; externals are absolute paths, so any `require` works. */
function executeBundle(
  source: string,
  filePath: string,
  externalModules: ReadonlyMap<string, Record<string, unknown>> = new Map(),
): Record<string, unknown> {
  resetDiagnosticSources()
  const module = { exports: {} as Record<string, unknown> }
  const nativeRequire = createRequire(filePath)
  const scopedRequire = (id: string): unknown =>
    externalModules.has(id) ? externalModules.get(id) : nativeRequire(id)

  // eslint-disable-next-line no-new-func
  const run = new Function('require', 'module', 'exports', '__filename', '__dirname', source)
  run(scopedRequire, module, module.exports, filePath, dirname(filePath))

  return module.exports
}

// ─── Export-name detection ───────────────────────────────────────────────────

/**
 * Every statically enumerable value export, read from Oxc's module record.
 * Destructuring, aliases, re-exports, comments, and TypeScript-only exports
 * follow parser semantics instead of source-text guesses.
 */
export function styleExportNames(source: string, fileName = 'system.css.ts'): string[] {
  const parsed = parseSync(fileName, source)

  if (parsed.errors.some(error => error.severity === 'Error'))
    return []

  const names = new Set<string>()

  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      const name = entry.exportName.name

      if (!entry.isType && name !== null && name !== 'default' && entry.exportName.kind === 'Name')
        names.add(name)
    }
  }

  return [...names]
}

/**
 * Exact ambient globals for `styleAutoImports`.
 *
 * The declaration references the authored module instead of reconstructing
 * its types, so generic signatures, literal token paths, and overloads stay
 * identical. Plain Vite writes this text to `.vanity/types/style-auto-imports.d.ts`;
 * Nuxt registers the same text at `.nuxt/vanity-style-auto-imports.d.ts`. Plain
 * Vite also writes a tiny generated `@types/vanity-style-auto-imports` reference
 * bridge so ordinary TypeScript automatic type discovery sees the stable file.
 */
export function styleAutoImportDeclarations(
  from: string,
  names: readonly string[],
  options: { relativeTo?: string } = {},
): string {
  return renderStyleAutoImportDeclarations(from, names, options)
}

// ─── The debug-name transform ────────────────────────────────────────────────

/**
 * Inject declaration names into authoring calls, so emitted identifiers
 * follow the code — rename-symbol renames everything, devtools rules trace
 * back to their export ([spec-ports.md §1], [spec-recipes.md §3]).
 * Oxc identifies declarations and call arguments; edits are insertion-only,
 * so formatting and comments remain byte-for-byte intact around them.
 *
 * Handles module-scope `const` declarations, exported or not (published
 * ports are typically module-local):
 * - `const X = port(value)` → `port(value, { label: 'X' })`;
 *   an existing options object gains the `label` key, an explicit label wins
 * - `const X = class(rule)` / `recipe(…)` / `anatomy(…)` / `keyframes(…)` /
 *   `fontFace(…)` → the call gains `'X'` as its debug id; an explicit id wins
 * - `IDENT.port(...)` and friends — the system-bound forms
 */
export function applyDebugNames(source: string, fileName = 'module.css.ts'): string {
  return applyDebugNamesWithAliases(source, fileName)
}

function applyDebugNamesWithAliases(
  source: string,
  fileName: string,
  ambientAliases?: ReadonlyMap<string, string>,
): string {
  const parsed = parseSync(fileName, source, { range: true })

  if (parsed.errors.some(error => error.severity === 'Error'))
    return source

  const aliases = authoringAliases(parsed.program, undefined, ambientAliases)
  const edits: Array<{ at: number, text: string }> = []

  new Visitor({
    VariableDeclarator(node) {
      if (node.id.type !== 'Identifier' || node.init?.type !== 'CallExpression')
        return

      const callee = authoringCallee(node.init.callee, aliases)

      if (callee === undefined)
        return

      const name = node.id.name
      const args = node.init.arguments

      if (callee === 'port') {
        if (args.length === 1) {
          edits.push({ at: node.init.end - 1, text: `, { label: '${name}' }` })
        }
        else if (args.length >= 2 && args[1].type === 'ObjectExpression' && !hasObjectKey(args[1], 'label')) {
          edits.push({ at: args[1].start + 1, text: ` label: '${name}',` })
        }

        return
      }

      if (args.length === 1)
        edits.push({ at: node.init.end - 1, text: `, '${name}'` })
    },
  }).visit(parsed.program)

  return applyInsertions(source, edits)
}

const authoringNames = new Set([
  'port',
  'class',
  'recipe',
  'anatomy',
  'keyframes',
  'fontFace',
  'atoms',
  // Internal legacy fixtures remain recognizable until the final substrate
  // characterization suite is retired; these names are not public aliases.
  'css',
  'defineAtoms',
])
const sourceAuthoringNames = new Set([
  ...authoringNames,
  'rules',
  'raw',
  'fragment',
  'tdec',
  'globalCss',
  'createSystem',
  'consolidate',
  'defineTokens',
  'addTokens',
  'add',
  'theme',
  'tokenOverride',
  'derive',
  'compose',
  'build',
])
const tokenBuilderMethodNames = new Set(['add', 'derive', 'compose', 'build'])

/**
 * Resolve the configured barrel's exported local names back to authoring
 * members. This is deliberately syntactic: the barrel is already read as
 * source to discover its exports, and executing it here would change the
 * compiler's configuration-time behavior.
 */
function styleAutoImportAliases(
  source: string,
  fileName: string,
  names: readonly string[],
): Map<string, string> {
  const parsed = parseSync(fileName, source)

  if (parsed.errors.some(error => error.severity === 'Error'))
    return new Map()

  const aliases = authoringAliases(parsed.program, sourceAuthoringNames)
  const selected = new Set(names)
  const exportedAliases = new Map<string, string>()

  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      const exported = entry.exportName.name

      if (
        entry.isType
        || entry.exportName.kind !== 'Name'
        || exported === null
        || !selected.has(exported)
        || entry.localName.kind !== 'Name'
        || entry.localName.name === null
      ) {
        continue
      }

      const member = aliases.get(entry.localName.name)
      if (member !== undefined)
        exportedAliases.set(exported, member)
    }
  }

  return exportedAliases
}

function authoringAliases(
  program: Parameters<Visitor['visit']>[0],
  names = authoringNames,
  ambientAliases?: ReadonlyMap<string, string>,
): Map<string, string> {
  const aliases = new Map([...names].map(name => [name, name]))

  if (ambientAliases !== undefined) {
    for (const [local, imported] of ambientAliases) {
      if (names.has(imported))
        aliases.set(local, imported)
    }
  }

  new Visitor({
    ImportSpecifier(node) {
      const imported = node.imported.type === 'Identifier' ? node.imported.name : String(node.imported.value)

      if (names.has(imported))
        aliases.set(node.local.name, imported)
    },
    VariableDeclarator(node) {
      if (node.id.type === 'Identifier' && node.init?.type === 'MemberExpression') {
        const property = node.init.property
        const member = property.type === 'Identifier'
          ? property.name
          : property.type === 'Literal' && typeof property.value === 'string' ? property.value : undefined

        if (member !== undefined && names.has(member))
          aliases.set(node.id.name, member)

        return
      }

      if (node.id.type !== 'ObjectPattern')
        return

      for (const property of node.id.properties) {
        if (property.type !== 'Property' || property.key.type !== 'Identifier')
          continue

        const imported = property.key.name
        const local = property.value.type === 'Identifier' ? property.value.name : undefined

        if (local !== undefined && names.has(imported))
          aliases.set(local, imported)
      }
    },
  }).visit(program)

  return aliases
}

function authoringCallee(callee: Expression, aliases: Map<string, string>, names = authoringNames): string | undefined {
  if (callee.type === 'Identifier')
    return aliases.get(callee.name)

  if (callee.type === 'MemberExpression') {
    const property = callee.property
    const name = property.type === 'Identifier'
      ? property.name
      : property.type === 'Literal' && typeof property.value === 'string' ? property.value : undefined
    return name !== undefined && names.has(name) ? name : undefined
  }

  return undefined
}

/**
 * Wrap compiler-owned authoring calls with source metadata. The wrapper is a
 * comma expression, so runtime semantics and return types are unchanged; a
 * VanityError raised synchronously can recover the exact authored property.
 * Token-builder chains register all seed/stage paths as one source context.
 */
function applySourceLocations(
  source: string,
  fileName: string,
  root: string,
  ambientAliases?: ReadonlyMap<string, string>,
): string {
  const parsed = parseSync(fileName, source, { range: true })

  if (parsed.errors.some(error => error.severity === 'Error'))
    return source

  const aliases = authoringAliases(parsed.program, sourceAuthoringNames, ambientAliases)
  const calls: Array<{ node: CallExpression, name: string }> = []

  new Visitor({
    CallExpression(node) {
      const name = authoringCallee(node.callee, aliases, sourceAuthoringNames)
      if (name !== undefined && (!tokenBuilderMethodNames.has(name) || isTokenBuilderChain(node, aliases)))
        calls.push({ node, name })
    },
  }).visit(parsed.program)

  const outermost = calls.filter(({ node }) => !calls.some(({ node: other }) =>
    other !== node && other.start === node.start && other.end > node.end))
  const relativeFile = normalizePath(posix.relative(normalizePath(root), normalizePath(fileName)))
  const file = relativeFile.startsWith('..') ? normalizePath(fileName) : relativeFile
  const pointAt = sourcePointFactory(source)
  const edits: Array<{ at: number, text: string }> = []

  for (const { node, name } of outermost) {
    const locations: Record<string, Array<{ line: number, column: number }>> = {}
    collectCallLocations(node, name, aliases, locations, pointAt)
    const meta = { file, call: pointAt(node.start), locations }
    const key = `${file}:${node.start}`
    const json = JSON.stringify(meta)

    edits.push({
      at: node.start,
      text: `globalThis[Symbol.for('vanity.withSource')](${json},${JSON.stringify(key)},()=>`,
    })
    edits.push({ at: node.end, text: ')' })
  }

  return applyInsertions(source, edits)
}

function isTokenBuilderChain(call: CallExpression, aliases: Map<string, string>): boolean {
  const name = authoringCallee(call.callee, aliases, sourceAuthoringNames)

  if (name === 'defineTokens')
    return true

  return name !== undefined
    && tokenBuilderMethodNames.has(name)
    && call.callee.type === 'MemberExpression'
    && call.callee.object.type === 'CallExpression'
    && isTokenBuilderChain(call.callee.object, aliases)
}

function collectCallLocations(
  call: CallExpression,
  name: string,
  aliases: Map<string, string>,
  locations: Record<string, Array<{ line: number, column: number }>>,
  pointAt: (offset: number) => { line: number, column: number },
): void {
  if (call.callee.type === 'MemberExpression' && call.callee.object.type === 'CallExpression') {
    const base = call.callee.object
    const baseName = authoringCallee(base.callee, aliases, sourceAuthoringNames)
    if (baseName !== undefined)
      collectCallLocations(base, baseName, aliases, locations, pointAt)
  }

  const expression = sourceObjectForCall(call, name)
  if (expression !== undefined)
    collectObjectLocations(expression, [], locations, pointAt)
}

function sourceObjectForCall(call: CallExpression, name: string): ObjectExpression | undefined {
  const argumentIndex = name === 'globalCss' ? 1 : 0
  const argument = call.arguments[argumentIndex]

  if (argument === undefined || argument.type === 'SpreadElement')
    return undefined

  const expression = unwrapSource(argument)

  if (expression.type === 'ObjectExpression')
    return expression

  if ((name === 'add' || name === 'derive') && (expression.type === 'ArrowFunctionExpression' || expression.type === 'FunctionExpression')) {
    if (expression.body !== null && expression.body.type !== 'BlockStatement') {
      const body = unwrapSource(expression.body)
      return body.type === 'ObjectExpression' ? body : undefined
    }

    if (expression.body === null)
      return undefined

    for (const statement of expression.body.body) {
      if (statement.type === 'ReturnStatement' && statement.argument !== null) {
        const returned = unwrapSource(statement.argument)
        if (returned.type === 'ObjectExpression')
          return returned
      }
    }
  }

  return undefined
}

function collectObjectLocations(
  object: ObjectExpression,
  prefix: string[],
  locations: Record<string, Array<{ line: number, column: number }>>,
  pointAt: (offset: number) => { line: number, column: number },
): void {
  for (const property of object.properties) {
    if (property.type !== 'Property')
      continue

    const key = sourcePropertyName(property)
    if (key === undefined)
      continue

    const path = [...prefix, key]
    const joined = path.join('.')
    const points = locations[joined] ?? []
    points.push(pointAt(property.key.start))
    locations[joined] = points

    const value = unwrapSource(property.value)
    if (value.type === 'ObjectExpression')
      collectObjectLocations(value, path, locations, pointAt)
  }
}

function sourcePropertyName(property: ObjectProperty): string | undefined {
  const { key } = property

  if (key.type === 'Identifier')
    return key.name

  if (key.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number'))
    return String(key.value)

  return undefined
}

function unwrapSource(expression: Expression): Expression {
  let value = expression
  const wrappers = new Set(['ParenthesizedExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSInstantiationExpression'])

  while (wrappers.has(value.type) && 'expression' in value)
    value = value.expression as Expression

  return value
}

function sourcePointFactory(source: string): (offset: number) => { line: number, column: number } {
  const starts = [0]

  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10)
      starts.push(index + 1)
  }

  return (offset) => {
    let low = 0
    let high = starts.length - 1

    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (starts[middle] <= offset)
        low = middle
      else high = middle - 1
    }

    return { line: low + 1, column: offset - starts[low] + 1 }
  }
}

function hasObjectKey(object: ObjectExpression, key: string): boolean {
  return object.properties.some((property) => {
    if (property.type !== 'Property')
      return false

    return property.key.type === 'Identifier'
      ? property.key.name === key
      : property.key.type === 'Literal' && property.key.value === key
  })
}

function applyInsertions(source: string, edits: Array<{ at: number, text: string }>): string {
  let output = source

  for (const edit of edits.sort((a, b) => b.at - a.at))
    output = `${output.slice(0, edit.at)}${edit.text}${output.slice(edit.at)}`

  return output
}

// ─── Introspection: the manifest and the audits ride the build plane ─────────

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
