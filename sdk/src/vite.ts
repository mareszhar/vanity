/**
 * The vanity Vite plugin — evaluates `*.css.ts` at build time and emits
 * static CSS ([patterns.md §1], [workspace.md §3]). App code never
 * sees an authoring call: a style module's exports arrive as serialized
 * classes, ports, recipes, and metadata, and its CSS arrives as a virtual
 * `.vanity.css` module the bundler treats like any stylesheet.
 *
 * Vanity owns authored members of configured systems at their physical file
 * IDs; Vite loads each module and receives its projection under that same ID.
 * Hooks are narrowed to the IDs they serve wherever that set is fixed, and
 * decide ownership before doing work wherever it can change.
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
} from './compiler/core/systems'
import type { StyleAutoImportInjection } from './compiler/core/transform'
import type { RuntimeMemberHmrRecord } from './compiler/hmr/update'
import type { DeclaredPackageSet } from './compiler/hosts/vitePackages'
import type {
  VanityAppAutoImports,
  VanityConfig,
} from './config'
import type { VanityDiagnosticInput, VanityDiagnosticSink } from './diagnostics'
import type { VanityInspectRecord } from './introspect/records'
import type { VanityPortableSystem } from './system/contract'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { cwd } from 'node:process'
import autoImportVite from 'unplugin-auto-import/vite'
import { searchForWorkspaceRoot } from 'vite'
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
import { normalizePath } from './compiler/core/path'
import {
  createSystemRecordFromPortable,
  createSystemRegistrationQueue,
} from './compiler/core/registration'
import {
  assertFreshPortablePair,
  clearConfiguredSystemResolutionCache,
  computeConfiguredSystemMemberChanges,
  computeConfiguredSystemMembers,
  createConfiguredSystemResolutionCache,
  getConfiguredSystemModuleFiles,
  getRuntimeIdentity,
  normalizeSystemSources,
} from './compiler/core/systems'
import { transformStyleModule } from './compiler/core/transform'
import { handleHotUpdate } from './compiler/hmr/update'
import {
  createViteHmrHost,
  createVitePendingCssResponseCache,
  normalizeViteFilePath,
  resolveViteVirtualId,
} from './compiler/hosts/viteHmr'
import { vanityViteHost } from './compiler/hosts/viteHost'
import {
  createDeclaredPackageLoader,
  createVitePackageDeclarations,
  filterDeclaredPackageIncludes,
  findDeclaredPackageOverrides,
  readSdkVersion,
} from './compiler/hosts/vitePackages'
import { buildStyleModule, convertViteAliasesToEsbuild } from './compiler/modules/build'
import { executeBundle } from './compiler/modules/evaluate'
import {
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
import { formatVanityDiagnostic, reportDiagnostics, VanityError } from './diagnostics'
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
const styleFileFilter = /\.css\.(?:js|cjs|mjs|jsx|ts|tsx)(?:\?.*)?$/
const vanillaExtractVirtualFilter = /\.vanilla\.css(?:\?.*)?$/

/** The stable virtual stylesheet a compiled style module imports; content lives in the store. */
const virtualExt = '.vanity.css'
const runtimeVirtualPrefix = '\0vanity:system-runtime:'
const runtimeScanPrefix = '\0vanity:system-scan:'
const cascadeUrl = '/__vanity/cascade.css'
const cascadeFileName = 'assets/vanity-cascade.css'

type RuntimeTarget = 'browser' | 'ssr'

/** The part of a Vite 6+ hook environment the adapter reads. */
interface HookEnvironment {
  readonly mode?: string
  readonly config: ResolvedConfig & { readonly consumer?: 'client' | 'server' }
  getTopLevelConfig: () => ResolvedConfig
}

interface HookEnvironmentContext {
  readonly environment?: HookEnvironment
}

/** Vite 5 hook contexts have no environment; later majors provide one. */
function getHookEnvironment(context: HookEnvironmentContext | undefined): HookEnvironment | undefined {
  return context?.environment
}

interface ViteHostState {
  readonly group: ViteHostGroup
  readonly config: ResolvedConfig
  readonly target: RuntimeTarget
  systemSources: NormalizedSystemSource[]
  systemResolutionCache: ReturnType<typeof createConfiguredSystemResolutionCache>
  systemMembersReady: Promise<void>
  readonly membersByFile: Map<string, NormalizedSystemSource>
  readonly memberBasenames: Set<string>
  readonly preserveSymlinks: boolean
  readonly readinessFailures: Map<string, unknown>
  server?: ViteDevServer
}

interface ViteHostGroup {
  readonly config: ResolvedConfig
  readonly targets: Map<RuntimeTarget, ViteHostState>
  clientServer?: ViteDevServer
  cascadeCss: string
  /** The manifest as last written, so unchanged builds skip the write. */
  writtenManifest?: string
  manifestTimer?: ReturnType<typeof setTimeout>
  shimContent?: string
  systemSource?: string
  systemDeps: Set<string>
  appAutoImportSourceFiles: Set<string>
}

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
  const loadDeclaredPackages = createDeclaredPackageLoader(readSdkVersion())
  const getDeclaredPackages = (root: string, workspaceRoot = searchForWorkspaceRoot(root)) =>
    loadDeclaredPackages(root, workspaceRoot)
  /** Each resolved top-level config owns its target-specific host state. */
  const hostGroups = new Map<ResolvedConfig, ViteHostGroup>()
  const hostStateInitializations = new WeakMap<ViteHostState, Promise<void>>()
  let activeVite5Host: ViteHostGroup | undefined
  const createHostState = (group: ViteHostGroup, target: RuntimeTarget): ViteHostState => {
    const existing = group.targets.get(target)
    if (existing !== undefined)
      return existing

    const state: ViteHostState = {
      group,
      config: group.config,
      target,
      systemSources: [],
      systemResolutionCache: createConfiguredSystemResolutionCache(),
      systemMembersReady: Promise.resolve(),
      membersByFile: new Map(),
      memberBasenames: new Set(),
      preserveSymlinks: group.config.resolve.preserveSymlinks,
      readinessFailures: new Map(),
    }
    group.targets.set(target, state)
    return state
  }
  const getHostState = (
    context: unknown,
    hostServer?: ViteDevServer,
    ssrOption?: boolean,
  ): ViteHostState => {
    // Hook contexts differ by hook; only environment-owned hooks on Vite 6+
    // carry an environment, and every other lookup names its server instead.
    const environment = getHookEnvironment(context as HookEnvironmentContext | undefined)
    const group = environment === undefined
      ? hostServer === undefined
        ? activeVite5Host
        : hostGroups.get(hostServer.config) ?? activeVite5Host
      : hostGroups.get(environment.getTopLevelConfig())
    if (group === undefined)
      throw new TypeError('host state was requested before configResolved')

    const consumer = environment?.config.consumer
    const target: RuntimeTarget = consumer === 'server'
      || (consumer === undefined && (ssrOption === true || group.config.build.ssr === true))
      ? 'ssr'
      : 'browser'
    return createHostState(group, target)
  }

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
  /** Module projections last served under each physical member ID and target. */
  const runtimeMemberIdsByEntry = new Map<string, Map<string, RuntimeMemberHmrRecord>>()
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
  const declarationConfigRoots = new Set<string>()
  const warnedSourcePackages = new Set<string>()
  const filterState = createLateHookFilterState()
  /** `.css.ts` entries claimed by Vanity rather than raw vanilla-extract. */
  const vanityOwnedStyleModules = new Set<string>()
  /** Style module → configured build-time systems it imports. */
  const systemsByStyleEntry = new Map<string, Set<string>>()
  /** Configured build-time system → style modules that import it. */
  const styleEntriesBySystem = new Map<string, Set<string>>()
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

  const serializeManifestJson = (state: ViteHostState): string => {
    const records = [...recordsByFile.keys()].sort().flatMap(file => recordsByFile.get(file)!)
    const css = [...cssByVirtualId.values()].join('\n')
    return `${JSON.stringify(buildManifest(records, css, { root: state.config.root }), null, 2)}\n`
  }

  const writeManifest = async (state: ViteHostState): Promise<void> => {
    // A failed first evaluation has no trustworthy canonical system map.
    // Preserve the original compiler diagnostic instead of masking it with a
    // secondary manifest-construction failure; last-good artifacts remain.
    if (![...recordsByFile.values()].flat().some(record =>
      record.kind === 'system' && record.portable !== undefined)) {
      return
    }
    const json = serializeManifestJson(state)

    if (json === state.group.writtenManifest)
      return

    const path = join(state.config.root, '.vanity', 'manifest.json')
    await writeFileArtifacts([{ file: path, contents: json }])
    state.group.writtenManifest = json
  }

  /** Dev regenerates on change, debounced across a save's fan-out of transforms. */
  const scheduleManifest = (state: ViteHostState): void => {
    clearTimeout(state.group.manifestTimer)
    state.group.manifestTimer = setTimeout(() => void writeManifest(state).catch(() => {}), 50)
  }

  const getIdentifierOption = (hostConfig: ResolvedConfig) =>
    compiler.identifiers ?? (hostConfig.mode === 'production' ? 'short' : 'debug')

  const getArtifactDirectory = (hostConfig: ResolvedConfig) => resolve(
    hostConfig.root,
    compiler.artifactDirectory ?? '.vanity',
  )

  const createHmrHost = (
    state: ViteHostState,
    activeServer = state.server,
    activeClientServer = state.group.clientServer,
  ) => createViteHmrHost({
    root: state.config.root,
    base: state.config.base,
    server: activeServer,
    clientServer: activeClientServer,
  })

  /**
   * Let Vite resolve configured entries before the compiler assigns physical
   * identities. Node remains the fallback for hosts that cannot resolve a
   * source during configuration, while aliases/export conditions/symlinks
   * observed by Vite win whenever it returns a physical module.
   */
  const resolveConfiguredSystemSources = async (state: ViteHostState): Promise<void> => {
    const hostConfig = state.config
    const previousDependencies = new Map(state.systemSources.map(source => [source.entry, source.dependencies]))
    const values = compiler.system === undefined
      ? []
      : Array.isArray(compiler.system) ? compiler.system : [compiler.system]
    const resolvedEntries = new Map<string, string>()
    const hostResolver = hostConfig.createResolver({ asSrc: true })

    for (const value of values) {
      const configuredEntry = typeof value === 'string' ? value : value.entry
      const resolved = await hostResolver(
        configuredEntry,
        join(hostConfig.root, 'package.json'),
        false,
        state.target === 'ssr',
      )
      const physical = getPhysicalResolvedPath(resolved)
      if (physical !== undefined)
        resolvedEntries.set(configuredEntry, physical)
    }

    state.systemSources = normalizeSystemSources(compiler.system, hostConfig.root, resolvedEntries)
    for (const source of state.systemSources) {
      for (const dependency of previousDependencies.get(source.entry) ?? [])
        source.dependencies.add(dependency)
    }
    state.systemResolutionCache = createConfiguredSystemResolutionCache()

    const members = await computeConfiguredSystemMembers(
      state.systemSources,
      hostConfig.root,
      state.systemResolutionCache,
      systemAuthoringByFile,
    )
    state.membersByFile.clear()
    for (const [file, source] of members.byFile)
      state.membersByFile.set(file, source)
    state.memberBasenames.clear()
    for (const file of members.basenames)
      state.memberBasenames.add(file)
  }

  const sendSystemCssUpdate = (
    state: ViteHostState,
    virtualId: string,
    previous: string | undefined,
    next: string,
  ): void => {
    if (previous === undefined || previous === next || state.group.clientServer === undefined)
      return

    createHmrHost(state).updateCssModule(virtualId)
  }

  const clearRetiredCss = (state: ViteHostState, virtualIds: ReadonlySet<string>): void => {
    if (virtualIds.size === 0)
      return

    createHmrHost(state).removeCssModules(virtualIds)
  }

  const prepareConfiguredSystem = async (
    state: ViteHostState,
    source: NormalizedSystemSource,
  ): Promise<PreparedSystem> => {
    const generation = (systemGenerationsByEntry.get(source.entry) ?? 0) + 1
    systemGenerationsByEntry.set(source.entry, generation)
    let dependencies: string[] = []

    try {
      const bundled = await buildStyleModule({
        filePath: source.entry,
        root: state.config.root,
        alias: convertViteAliasesToEsbuild(state.config),
        namespaceFiles: [...getConfiguredSystemModuleFiles(source, state.config.root, state.systemResolutionCache)],
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
        getIdentifierOption(state.config),
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
          dependencies.length > 0 ? dependencies : buildFailureFiles(error, state.config.root),
          systemDependentsByFile,
        )
      }
      const failure = createStyleBuildError(error, source.entry, state.config.root)
      reportFailure(failure)
      throw failure
    }
  }

  const registerSystems = async (
    state: ViteHostState,
    candidates: readonly PreparedSystem[],
  ): Promise<EvaluatedSystem[]> => {
    const result = await registerSystemCandidates(candidates, {
      root: state.config.root,
      artifactDirectory: getArtifactDirectory(state.config),
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
      scheduleManifest(state)
      for (const id of result.ownershipUpdate.nextCss.keys())
        pendingCssResponseCache.clear(id)
      for (const [id, contents] of result.ownershipUpdate.pendingCssResponses)
        pendingCssResponseCache.remember(id, contents)
      clearRetiredCss(state, result.ownershipUpdate.retiredCssIds)
      for (const update of result.ownershipUpdate.cssUpdates)
        sendSystemCssUpdate(state, update.id, update.previous, update.next)
    }

    return [...result.systems]
  }

  const evaluateConfiguredSystem = async (
    state: ViteHostState,
    source: NormalizedSystemSource,
  ): Promise<EvaluatedSystem> => {
    const [accepted] = await registerSystems(state, [await prepareConfiguredSystem(state, source)])
    return accepted!
  }

  const evaluateConfiguredSystems = async (
    state: ViteHostState,
    sources: readonly NormalizedSystemSource[],
  ): Promise<EvaluatedSystem[]> => {
    const unique = [...new Map(sources.map(source => [source.entry, source])).values()]
    return registerSystems(state, await Promise.all(unique.map(source => prepareConfiguredSystem(state, source))))
  }

  const ensureConfiguredSystem = (state: ViteHostState, source: NormalizedSystemSource): Promise<EvaluatedSystem> => {
    const accepted = systemsByEntry.get(source.entry)
    if (accepted !== undefined) {
      systemReadinessFailures.delete(source.entry)
      return Promise.resolve(accepted)
    }

    const pending = pendingSystemsByEntry.get(source.entry)
    if (pending !== undefined)
      return pending

    const evaluation = evaluateConfiguredSystem(state, source)
    pendingSystemsByEntry.set(source.entry, evaluation)
    void evaluation.then(() => {}, () => {}).finally(() => {
      if (pendingSystemsByEntry.get(source.entry) === evaluation)
        pendingSystemsByEntry.delete(source.entry)
    })
    return evaluation
  }

  const startHostState = (state: ViteHostState): Promise<void> => {
    const existing = hostStateInitializations.get(state)
    if (existing !== undefined)
      return existing

    const ready = (async () => {
      await resolveConfiguredSystemSources(state)
      for (const source of state.systemSources) {
        void ensureConfiguredSystem(state, source).catch((error: unknown) => {
          state.readinessFailures.set(source.entry, error)
          systemReadinessFailures.set(source.entry, error)
        })
      }
    })()
    hostStateInitializations.set(state, ready)
    state.systemMembersReady = ready
    return ready
  }

  const findMemberCandidate = (
    state: ViteHostState,
    id: string,
  ): { readonly file?: string, readonly symlinkPath?: string, readonly source?: NormalizedSystemSource } | undefined => {
    const queryStart = id.indexOf('?')
    const fileId = queryStart === -1 ? id : id.slice(0, queryStart)
    const query = queryStart === -1 ? '' : id.slice(queryStart + 1)
    if (fileId === undefined || !isModuleSelfQuery(query))
      return undefined

    const normalizedId = normalizeViteFilePath(fileId)
    if (state.preserveSymlinks) {
      if (!state.memberBasenames.has(basename(normalizedId)))
        return undefined
      return { symlinkPath: normalizedId }
    }

    const source = state.membersByFile.get(normalizedId)
    return source === undefined ? undefined : { file: normalizedId, source }
  }

  const resolveSymlinkMember = async (
    state: ViteHostState,
    candidate: { readonly symlinkPath: string },
  ): Promise<{ readonly file: string, readonly source: NormalizedSystemSource } | undefined> => {
    try {
      const file = normalizePath(await realpath(candidate.symlinkPath))
      const source = state.membersByFile.get(file)
      return source === undefined ? undefined : { file, source }
    }
    catch {
      return undefined
    }
  }

  /**
   * Resolve the auto-import inject shim ([spec-vue.md §4]): a one-line
   * module re-exporting the system's names, handed to esbuild's `inject` so
   * unbound identifiers resolve to the system while explicit imports stay
   * untouched. Re-detected per transform, so a new system export is picked up
   * by the next save. The system module and everything it imports are skipped:
   * a file upstream of the system cannot use the system's bindings — injecting
   * there would only manufacture a cycle.
   */
  const injectShimFor = async (
    state: ViteHostState,
    filePath: string,
  ): Promise<StyleAutoImportInjection | undefined> => {
    if (styleImportSources.length === 0)
      return undefined

    const stylePlan = await planStyleAutoImports(styleImportSources, compiler.system, state.config.root)
    if (stylePlan === undefined)
      return undefined

    const { sources, names } = stylePlan
    const sourceTexts = new Map(await Promise.all(sources.map(async source =>
      [source.file, await readFile(source.file, 'utf-8')] as const,
    )))
    const source = [...sourceTexts.values()].join('\n')

    if (nativeTypeHost !== 'nuxt')
      await writeAutoImportDeclarationFiles([stylePlan.declaration, stylePlan.bridge])

    if (source !== state.group.systemSource) {
      const bundles = await Promise.all(sources.map(source => buildStyleModule({
        filePath: source.file,
        root: state.config.root,
        alias: convertViteAliasesToEsbuild(state.config),
      })))

      state.group.systemSource = source
      state.group.systemDeps = new Set([
        ...sources.map(source => source.file),
        ...bundles.flatMap(bundle => bundle.watchFiles.map(normalizePath)),
      ])
    }

    if (state.group.systemDeps.has(filePath))
      return undefined

    const ambientAliases = new Map(sources.flatMap(source =>
      [...getStyleAutoImportAliases(sourceTexts.get(source.file)!, source.file, source.imports)],
    ))

    const shim = join(state.config.root, 'node_modules', '.vanity', 'vanity-style-auto-imports.mjs')
    const content = names.length === 0
      ? 'export {}\n'
      : `${sources.map(source => `export { ${source.imports.join(', ')} } from '${source.from}'`).join('\n')}\n`
    if (content !== state.group.shimContent) {
      await mkdir(dirname(shim), { recursive: true })
      await writeFile(shim, content)
      state.group.shimContent = content
    }

    return names.length === 0 ? undefined : { aliases: ambientAliases, path: shim }
  }

  const rememberAppAutoImportSourceFiles = (
    state: ViteHostState,
    plan: Awaited<ReturnType<typeof writeAutoImportDeclarations>>['plan'],
  ): void => {
    const files = new Set<string>()

    for (const source of plan.app?.sources ?? []) {
      if (isPackageSpecifier(source.from))
        continue

      for (const file of getExportModuleFilesFromFile(source.from, state.config.root))
        files.add(normalizePath(file))
    }

    state.group.appAutoImportSourceFiles = files
  }

  const cssTsPlugin: Plugin = {
    name: 'vanity-css-ts',
    enforce: 'pre',

    async config(userConfig, env) {
      const root = resolve(userConfig.root ?? cwd())
      declarationConfigRoots.add(root)
      filterState.configure(env.command, Boolean(userConfig.build?.watch))
      const { declarations } = await createVitePackageDeclarations(root, {
        isBuild: env.command === 'build',
        userConfig,
        getDeclaredPackages,
        workspaceRoot: searchForWorkspaceRoot(root),
      })
      const includes = new Set(declarations.optimizeDeps.include)
      if (compiler.system !== undefined)
        includes.add('@mszr/vanity/runtime')

      return {
        ...declarations,
        optimizeDeps: {
          ...declarations.optimizeDeps,
          include: [...includes],
        },
      }
    },

    async configResolved(resolvedConfig) {
      const resolvedRoot = resolve(resolvedConfig.root)
      if (!declarationConfigRoots.has(resolvedRoot)) {
        const configuredRoots = [...declarationConfigRoots]
        const configuredRootSummary = configuredRoots.length === 0
          ? 'no root'
          : configuredRoots.join(', ')
        throw new VanityError({
          code: 'VANITY_VITE_BUILD_FAILED',
          message: `Vanity's installed-package declarations were computed from ${configuredRootSummary}, not Vite root ${resolvedRoot}.`,
          path: ['Vite root', resolvedRoot],
          fix: 'restart Vite with one consistent project root',
        })
      }
      filterState.recordHostCapability(resolvedConfig)
      // Vite 5 has no environments, so its hooks cannot name their host.
      const isVite5Host = !('environments' in resolvedConfig)
      if (isVite5Host && activeVite5Host !== undefined && activeVite5Host.config !== resolvedConfig) {
        throw new VanityError({
          code: 'VANITY_VITE_BUILD_FAILED',
          message: 'One vanityPlugin() instance cannot serve two concurrent Vite 5 hosts.',
          path: ['Vite 5 host', resolvedRoot],
          fix: 'create one vanityPlugin() instance for each concurrent Vite 5 host',
        })
      }
      const group: ViteHostGroup = {
        config: resolvedConfig,
        targets: new Map(),
        cascadeCss: '',
        systemDeps: new Set(),
        appAutoImportSourceFiles: new Set(),
      }
      hostGroups.set(resolvedConfig, group)
      if (isVite5Host)
        activeVite5Host = group
      const target: RuntimeTarget = resolvedConfig.build.ssr ? 'ssr' : 'browser'
      const state = createHostState(group, target)
      const isWatchBuild = resolvedConfig.command === 'build' && Boolean(resolvedConfig.build.watch)
      const targets: RuntimeTarget[] = resolvedConfig.command === 'serve'
        ? ['browser', 'ssr']
        : [target]
      const declaredPackages = await getDeclaredPackages(
        resolvedConfig.root,
        searchForWorkspaceRoot(resolvedConfig.root),
      )
      reportDeclaredPackageOverrides(resolvedConfig, declaredPackages, compiler.diagnostics, warnedSourcePackages)
      systemReadinessFailures.clear()
      await Promise.all(targets.map((hostTarget) => {
        const targetState = createHostState(group, hostTarget)
        targetState.readinessFailures.clear()
        return startHostState(targetState)
      }))
      if (resolvedConfig.command === 'build' && !isWatchBuild) {
        for (const file of state.membersByFile.keys()) {
          filterState.addBuildMember(file, state.preserveSymlinks)
        }
        filterState.applyBuildHookFilters()
      }
    },

    configureServer(devServer) {
      // Vite gives this lifecycle hook its configured server directly.
      const state = getHostState(undefined, devServer)
      state.server = devServer

      if (devServer.config.build.ssr !== true) {
        state.group.clientServer = devServer
        pendingCssResponseCache.addMiddleware(devServer, state.config.root, state.config.base)
      }

      // The manifest, live — what the DevTools tab (and any tool) reads.
      devServer.middlewares.use('/__vanity', (req, res, next) => {
        const [path] = (req.url ?? '/').split('?')

        if (path === '/cascade.css') {
          res.setHeader('Content-Type', 'text/css')
          res.end(state.group.cascadeCss)
          return
        }

        if (path === '/manifest.json') {
          res.setHeader('Content-Type', 'application/json')
          res.end(serializeManifestJson(state))
          return
        }

        if (path === '/' || path === '/index.html') {
          res.setHeader('Content-Type', 'text/html')
          res.end(renderDevtoolsPage(state.config.root))
          return
        }

        next()
      })

      void state.systemMembersReady.then(() => {
        for (const source of state.systemSources)
          devServer.watcher.add([source.entry, ...(source.artifact ? [source.artifact] : [])])
      }, () => {
        // buildStart/transform owns the actionable configuration error; the
        // watcher setup must not create a second unhandled rejection.
      })
    },

    async buildStart() {
      // Vite 6+ exposes the host through this hook's environment; Vite 5 has
      // one active configResolved-to-closeBundle host on this plugin instance.
      const state = getHostState(this)
      if (nativeTypeHost !== 'nuxt') {
        const result = await writeAutoImportDeclarations(options, { root: state.config.root })
        rememberAppAutoImportSourceFiles(state, result.plan)
      }

      for (const source of state.systemSources) {
        if (state.readinessFailures.has(source.entry)) {
          // A dev server must stay alive so its first source repair can be
          // handled by HMR. A production build has no repair boundary and
          // should fail its buildStart hook with the original diagnostic.
          if (!state.server)
            throw state.readinessFailures.get(source.entry)
          continue
        }
        let system: EvaluatedSystem
        try {
          system = await ensureConfiguredSystem(state, source)
        }
        catch (error) {
          state.readinessFailures.set(source.entry, error)
          systemReadinessFailures.set(source.entry, error)
          if (!state.server)
            throw error
          continue
        }
        for (const dependency of source.dependencies) {
          this.addWatchFile(dependency)
          state.server?.watcher.add(dependency)
        }
        recordsByFile.set(source.entry, system.records.length > 0
          ? system.records
          : [createSystemRecordFromPortable(system.portable)])
      }

      state.group.cascadeCss = renderCascadePrelude(
        compiler.layerOrder
        ?? [...new Set([...systemsByEntry.values()].map(system => system.portable.layerRoot))],
      )
      // `emitFile()` belongs to Rollup's build graph. Vite invokes buildStart
      // in serve mode too, where the cascade is served by /__vanity instead.
      if (state.group.cascadeCss && state.config.command === 'build' && state.target !== 'ssr') {
        this.emitFile({
          type: 'asset',
          fileName: cascadeFileName,
          source: state.group.cascadeCss,
        })
      }
    },

    transformIndexHtml: {
      order: 'pre',
      handler(_html, context) {
        // Vite supplies a dev server in the transform context and a build
        // environment on the plugin context for HTML generated by a build.
        const state = getHostState(this, context?.server)
        if (!state.group.cascadeCss || state.target === 'ssr')
          return undefined
        const href = state.server
          ? cascadeUrl
          : `${state.config.base}${state.config.base.endsWith('/') ? '' : '/'}${cascadeFileName}`
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
      const state = getHostState(this)
      if (!state.server)
        await writeManifest(state)
    },

    closeWatcher() {
      if (this.meta.watchMode !== true)
        return
      filterState.finishWatch()
      // Vite 5 does not call closeBundle for the watch host's lifetime end.
      // Releasing this slot here lets the same instance serve a later build.
      if (activeVite5Host !== undefined) {
        hostGroups.delete(activeVite5Host.config)
        activeVite5Host = undefined
      }
    },

    closeBundle() {
      // Only a Vite 5 host occupies this slot; Vite 6+ hooks name their host
      // through the environment that owns them.
      if (activeVite5Host !== undefined) {
        hostGroups.delete(activeVite5Host.config)
        activeVite5Host = undefined
      }
    },

    transform: {
      filter: { id: styleFileFilter },
      async handler(code, id, transformOptions) {
        const [validId] = id.split('?')
        if (!styleFileFilter.test(validId))
          return null
        // This transform runs in an environment-owned Rollup hook.
        const state = getHostState(this)
        return transformStyleModule(code, id, transformOptions, {
          root: state.config.root,
          styleFileFilter,
          virtualExtension: virtualExt,
          isDev: state.server !== undefined,
          host: createHmrHost(state),
          systemSources: state.systemSources,
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
          ensureConfiguredSystem: source => ensureConfiguredSystem(state, source),
          injectShimFor: filePath => injectShimFor(state, filePath),
          buildStyleModule,
          alias: convertViteAliasesToEsbuild(state.config),
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
          getIdentifierOption: () => getIdentifierOption(state.config),
          scheduleManifest: () => scheduleManifest(state),
        })
      },
    },

    async handleHotUpdate({ file, server: devServer, modules }) {
      // Vite passes the owning dev server on the update context.
      const state = getHostState(this, devServer)
      const targetStates = [...state.group.targets.values()]
      const normalizedFile = normalizePath(file)
      const generatedArtifactDirectory = normalizePath(getArtifactDirectory(state.config)).replace(/\/$/, '')
      const allSources = targetStates.flatMap(targetState => targetState.systemSources)
      const isConfiguredArtifact = allSources.some(source => source.artifact === normalizedFile)
      if (
        !isConfiguredArtifact
        && (normalizedFile === normalizePath(join(state.config.root, '.vanity', 'manifest.json'))
          || normalizedFile.startsWith(`${generatedArtifactDirectory}/`))
      ) {
        // Compiler-owned writes are already published before the accepted
        // generation is swapped. Letting Vite treat their watcher events as
        // ordinary source edits can reload an application in the middle of a
        // system transition, before its member projections are invalidated.
        return []
      }
      const memberSetChanges = new Set<string>()
      for (const targetState of targetStates) {
        const affected = targetState.systemSources.some(source =>
          source.entry === normalizedFile || source.dependencies.has(normalizedFile))
        if (!affected)
          continue

        const previousMembers = new Set(targetState.membersByFile.keys())
        // A changed source may add/remove a re-export without changing the
        // configured entry spelling. Resolve the next graph generation for
        // each target before comparing its physical member set.
        clearConfiguredSystemResolutionCache(targetState.systemResolutionCache)
        systemAuthoringByFile.clear()
        await resolveConfiguredSystemSources(targetState)
        for (const memberFile of computeConfiguredSystemMemberChanges(previousMembers, targetState.membersByFile.keys()))
          memberSetChanges.add(memberFile)
      }
      return await handleHotUpdate({ file, modules }, {
        host: createHmrHost(state, devServer, state.group.clientServer),
        runtimeVirtualPrefix,
        systemSources: allSources,
        systemDependentsByFile,
        systemsByEntry,
        dependentsByFile,
        styleEntriesBySystem,
        runtimeVirtualIds,
        runtimeMemberIdsByEntry,
        memberSetChanges,
        getRuntimeMemberIdentity: (system, moduleFile) =>
          getRuntimeSystemNamespaceProjection(system, moduleFile)?.identity,
        failedStyleEntries,
        refreshAppAutoImports: nativeTypeHost !== 'nuxt' && appAutoImports !== undefined
          && state.group.appAutoImportSourceFiles.size > 0
          ? async () => {
            const normalizedFile = normalizePath(file)
            if (!state.group.appAutoImportSourceFiles.has(normalizedFile))
              return
            const result = await writeAutoImportDeclarations(options, { root: state.config.root })
            rememberAppAutoImportSourceFiles(state, result.plan)
          }
          : undefined,
        evaluateConfiguredSystems: async (sources) => {
          const unique = [...new Map(sources.map(source => [source.entry, source])).values()]
          const sourcesByState = new Map<ViteHostState, NormalizedSystemSource[]>()
          for (const source of unique) {
            const sourceState = targetStates.find(targetState =>
              targetState.systemSources.some(candidate => candidate.entry === source.entry)) ?? state
            const group = sourcesByState.get(sourceState) ?? []
            group.push(source)
            sourcesByState.set(sourceState, group)
          }

          const evaluatedByEntry = new Map<string, EvaluatedSystem>()
          for (const [sourceState, stateSources] of sourcesByState) {
            // Accept systems that share a namespace as one generation. A
            // per-entry registration would compare the first updated owner
            // against the second owner's still-current output and reject it.
            const evaluated = await evaluateConfiguredSystems(sourceState, stateSources)
            for (const [index, system] of evaluated.entries()) {
              const source = stateSources[index]
              if (source !== undefined)
                evaluatedByEntry.set(source.entry, system)
            }
          }
          return unique.map(source => evaluatedByEntry.get(source.entry)!)
        },
      }) as ModuleNode[] | undefined
    },

    watchChange(id) {
      // Rollup supplies the host environment for this graph event.
      const state = getHostState(this)
      const normalizedId = normalizePath(id)
      if (state.systemSources.some(source =>
        source.entry === normalizedId
        || source.dependencies.has(normalizedId))) {
        // Rollup/Vite reports create and delete events here as well as source
        // updates. Member ownership follows the static re-export graph, so
        // additions, removals, and repairs begin a fresh graph generation.
        clearConfiguredSystemResolutionCache(state.systemResolutionCache)
        systemAuthoringByFile.clear()
        return resolveConfiguredSystemSources(state)
      }
    },

    resolveId: filterState.createResolveIdHook(async function (source, importer, resolveOptions) {
      filterState.recordDevelopmentHookCall('resolveId', getHookEnvironment(this)?.mode)
      // The environment tells Vite 6+ the top-level config; Vite 5's one
      // active host is selected between configResolved and closeBundle.
      const state = getHostState(this, undefined, (resolveOptions as { ssr?: boolean } | undefined)?.ssr)
      const [validId, query = ''] = source.split('?', 2)

      if (validId === undefined)
        return null

      if (validId.startsWith(runtimeVirtualPrefix))
        return validId

      const scan = (resolveOptions as typeof resolveOptions & { scan?: boolean } | undefined)?.scan === true
      if (scan) {
        if (compiler.system === undefined)
          return null
        const resolvedId = (await this.resolve(source, importer, { ...resolveOptions, skipSelf: true }))?.id
        if (resolvedId === undefined || resolvedId.startsWith('\0'))
          return null
        let resolved = normalizePath(resolvedId.replace(/[?#].*$/, ''))
        if (state.preserveSymlinks) {
          if (!state.memberBasenames.has(basename(resolved)))
            return null
          try {
            resolved = normalizePath(await realpath(resolved))
          }
          catch {
            return null
          }
        }
        if (!state.membersByFile.has(resolved))
          return null
        return `${runtimeScanPrefix}${encodeURIComponent(resolved)}`
      }

      // Application imports are resolved by Vite as usual. Only Vanity's own
      // virtual runtime and stylesheet addresses belong to this hook.
      if (!validId.endsWith(virtualExt))
        return null

      const absoluteId = resolveViteVirtualId(validId, state.config.root, state.config.base)
      if (absoluteId === undefined || !cssByVirtualId.has(absoluteId))
        return null

      // Keep the query — Vite's HMR timestamps ride it.
      return query ? `${absoluteId}?${query}` : absoluteId
    }),

    load: filterState.createLoadHook(async function (id, loadOptions) {
      const environment = getHookEnvironment(this)
      filterState.recordDevelopmentHookCall('load', environment?.mode)
      // The environment and load options identify this hook's host and target.
      const state = getHostState(this, undefined, loadOptions?.ssr)
      const [validId] = id.split('?', 2)
      if (validId === undefined)
        return null

      if (validId.startsWith(runtimeScanPrefix)) {
        throw new VanityError({
          code: 'VANITY_VITE_BUILD_FAILED',
          message: 'Vite attempted to load a dependency-scan shield ID.',
          path: ['dependency scan', validId],
          fix: 'keep the shield ID inside dependency scanning so it cannot become an application module',
        })
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

      if (validId.endsWith(virtualExt)) {
        const absoluteId = resolveViteVirtualId(validId, state.config.root, state.config.base)
        return absoluteId === undefined ? null : cssByVirtualId.get(absoluteId) ?? null
      }

      const candidate = findMemberCandidate(state, id)
      if (candidate === undefined)
        return null
      const member = candidate.file !== undefined && candidate.source !== undefined
        ? { file: candidate.file, source: candidate.source }
        : candidate.symlinkPath === undefined
          ? undefined
          : await resolveSymlinkMember(state, { symlinkPath: candidate.symlinkPath })
      if (member === undefined)
        return null

      const system = await ensureConfiguredSystem(state, member.source)
      const namespace = getRuntimeSystemNamespaceProjection(system, member.file)
      if (namespace === undefined)
        return null

      const runtimeId = getRuntimeIdentity(system.portable)
      const target = state.target
      const backingId = `${runtimeVirtualPrefix}${target}:${runtimeId}`
      runtimeVirtualIds.add(backingId)
      const memberRecords = runtimeMemberIdsByEntry.get(member.source.entry) ?? new Map()
      const recordKey = `${target}\0${member.file}`
      memberRecords.set(recordKey, {
        moduleFile: member.file,
        target,
        identity: namespace.identity,
        runtimeId,
      })
      runtimeMemberIdsByEntry.set(member.source.entry, memberRecords)

      const code = buildRuntimeSystemNamespaceModule(system, member.file, backingId)
      const isDev = environment?.mode === 'dev'
        || state.config.command === 'serve'
      const relativeMember = normalizePath(relative(state.config.root, member.file))
      const withComment = isDev
        ? `/* ${relativeMember} · vanity; build-time authoring runs in the compiler */\n${code}`
        : code
      return { code: withComment, map: { mappings: '' } }
    }),
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

    const resolveHook = plugin.resolveId
    const substrateResolveId = typeof resolveHook === 'function'
      ? resolveHook
      : resolveHook?.handler
    const loadHook = plugin.load
    const substrateLoad = typeof loadHook === 'function'
      ? loadHook
      : loadHook?.handler
    const substrateTransform = typeof plugin.transform === 'object'
      ? plugin.transform.handler
      : plugin.transform

    return {
      ...plugin,
      // Its transform already initializes and memoizes the compiler. Avoid an
      // eager private Vite server in projects that contain only Vanity styles.
      buildStart: undefined,
      resolveId: substrateResolveId === undefined
        ? undefined
        : {
            filter: { id: vanillaExtractVirtualFilter },
            handler(source, importer, resolveOptions) {
              if (!vanillaExtractVirtualFilter.test(source))
                return null
              return substrateResolveId.call(this, source, importer, resolveOptions)
            },
          },
      load: substrateLoad === undefined
        ? undefined
        : {
            filter: { id: vanillaExtractVirtualFilter },
            handler(id, loadOptions) {
              if (!vanillaExtractVirtualFilter.test(id))
                return null
              return substrateLoad.call(this, id, loadOptions)
            },
          },
      transform: {
        filter: { id: styleFileFilter },
        async handler(code, id, transformOptions) {
          if (!styleFileFilter.test(id))
            return null
          const [validId] = id.split('?')
          if (vanityOwnedStyleModules.has(normalizePath(validId)))
            return null
          return substrateTransform.call(this, code, id, transformOptions)
        },
      },
    } satisfies Plugin
  })

  const applicationPlugins = appAutoImports === undefined
    ? []
    : normalizeAutoImportPlugins(createApplicationAutoImportPlugin(appAutoImports, getDeclaredPackages))

  const authoringImportGuard: Plugin = {
    name: 'vanity:authoring-import-guard',
    enforce: 'pre',
    apply(config) {
      // Vitest's plugin is merged into the user's Vite config before this host check.
      // Inspect nested plugin arrays so the exemption stays scoped to that host.
      const hasVitestPlugin = (plugins: unknown): boolean => Array.isArray(plugins)
        ? plugins.some(hasVitestPlugin)
        : typeof plugins === 'object'
          && plugins !== null
          && 'name' in plugins
          && plugins.name === 'vitest'

      return !hasVitestPlugin(config.plugins)
    },
    resolveId: {
      filter: { id: /^@mszr\/vanity$/ },
      handler(source, importer, resolveOptions) {
        // Vite 5 does not apply resolve filters. Keep this comparison first.
        if (source !== '@mszr/vanity')
          return null
        if (('scan' in resolveOptions && resolveOptions.scan === true) || importer === undefined)
          return null

        throw new VanityError({
          code: 'VANITY_AUTHORING_IN_APP_MODULE',
          message: `Application module '${importer}' imports Vanity's authoring entry '@mszr/vanity'.`,
          file: importer,
          fix: 'Move Vanity authoring into compiler.system or a *.css.ts style module, then import the configured system in application code.',
        })
      },
    },
  }

  return [cssTsPlugin, substrateCompilerTransport, ...wrappedSubstratePlugins, ...applicationPlugins, authoringImportGuard]
}

function createApplicationAutoImportPlugin(
  value: VanityAppAutoImports,
  getDeclaredPackages: (root: string) => Promise<DeclaredPackageSet>,
): Plugin {
  let delegate: AutoImportPlugin | undefined
  let delegateRoot: string | undefined
  const autoImportExcludes = [styleFileFilter, /[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/]
  const transformHook: Extract<NonNullable<Plugin['transform']>, { handler: unknown }> = {
    filter: undefined,
    handler(
      code: string,
      id: string,
      transformOptions?: Parameters<PluginHookFunction<NonNullable<AutoImportPlugin['transform']>>>[2],
    ) {
      if (delegate === undefined || delegate.transformInclude?.call(this, id) !== true)
        return

      return invokePluginHook(delegate, 'transform', this, code, id, transformOptions)
    },
  }

  const setDelegateTransformFilter = (): void => {
    const hook = delegate?.transform
    if (typeof hook === 'object' && hook !== null && 'filter' in hook) {
      // Unplugin's filter also accepts patterns Vite's native HookFilter type cannot express.
      transformHook.filter = hook.filter as typeof transformHook.filter
    }
  }

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
      exclude: autoImportExcludes,
      vueTemplate: true,
    }) as AutoImportPlugin
    delegateRoot = normalizedRoot
    return delegate
  }

  return {
    name: 'vanity:app-auto-imports',
    enforce: 'post',
    async config(config, env) {
      const root = resolve(config.root ?? cwd())
      const delegateResult = await invokePluginHook(createDelegate(root), 'config', this, config, env)
      setDelegateTransformFilter()
      if (delegateResult === undefined || delegateResult === null)
        return delegateResult

      const includes = delegateResult.optimizeDeps?.include
      if (!Array.isArray(includes))
        return delegateResult

      const declaredPackages = await getDeclaredPackages(root)
      return {
        ...delegateResult,
        optimizeDeps: {
          ...delegateResult.optimizeDeps,
          include: filterDeclaredPackageIncludes(includes, declaredPackages.names),
        },
      }
    },
    configResolved(config) {
      const resolvedDelegate = createDelegate(config.root)
      setDelegateTransformFilter()
      return invokePluginHook(resolvedDelegate, 'configResolved', this, config)
    },
    transform: transformHook,
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

function reportDeclaredPackageOverrides(
  resolvedConfig: ResolvedConfig,
  declaredPackages: DeclaredPackageSet,
  diagnostics: VanityDiagnosticSink | undefined,
  warnedPackages: Set<string>,
): void {
  const includeEntries = [
    ...getOptimizeDepIncludes(resolvedConfig.optimizeDeps),
    ...Object.values(resolvedConfig.environments ?? {}).flatMap(environment =>
      getOptimizeDepIncludes(environment.optimizeDeps)),
  ]
  const external = resolvedConfig.ssr.external
  const externalEntries = Array.isArray(external)
    ? external.filter((entry): entry is string => typeof entry === 'string')
    : typeof external === 'string' ? [external] : []
  const serverEnvironmentExternalEntries = Object.values(resolvedConfig.environments ?? {})
    .filter(environment => environment.consumer === 'server')
    .flatMap(environment => Array.isArray(environment.resolve.external)
      ? environment.resolve.external
      : [])
  const overrides = findDeclaredPackageOverrides(
    [...includeEntries, ...externalEntries, ...serverEnvironmentExternalEntries],
    declaredPackages.names,
  )

  for (const { packageName, entry } of overrides) {
    if (warnedPackages.has(packageName))
      continue
    warnedPackages.add(packageName)
    reportAdapterWarning(resolvedConfig, diagnostics, {
      code: 'VANITY_VITE_SOURCE_PACKAGE_BYPASSED',
      severity: 'warning',
      message: `Configuration entry "${entry}" includes ${packageName}. Vanity source in or beneath ${packageName} will run as build-time code instead of passing through Vanity.`,
      fix: `Remove "${entry}". If it was added for a CommonJS dependency, list that dependency as "${packageName} > <dependency>" instead.`,
    })
  }

  for (const packageName of declaredPackages.commonJsNames) {
    if (warnedPackages.has(packageName))
      continue
    warnedPackages.add(packageName)
    reportAdapterWarning(resolvedConfig, diagnostics, {
      code: 'VANITY_VITE_SOURCE_PACKAGE_BYPASSED',
      severity: 'warning',
      message: `${packageName} is CommonJS, so the host cannot route it through the SSR pipeline, and Vanity source reached through it may run as build-time code in SSR development.`,
      fix: `Publish ${packageName} as ESM; this change belongs to the package author.`,
    })
  }
}

/** Send a non-error adapter diagnostic to the sink, or to Vite's logger when none is configured. */
function reportAdapterWarning(
  resolvedConfig: ResolvedConfig,
  diagnostics: VanityDiagnosticSink | undefined,
  diagnostic: VanityDiagnosticInput,
): void {
  if (diagnostics !== undefined) {
    reportDiagnostics(diagnostics, diagnostic)
    return
  }
  resolvedConfig.logger.warn(formatVanityDiagnostic(diagnostic))
}

function getOptimizeDepIncludes(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('include' in value))
    return []
  const includes = value.include
  return Array.isArray(includes)
    ? includes.filter((entry): entry is string => typeof entry === 'string')
    : []
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

/** Resolve configured entries to their canonical physical modules at config time. */
function getPhysicalResolvedPath(resolved: string | undefined): string | undefined {
  if (resolved === undefined || resolved.startsWith('\0'))
    return undefined

  const clean = resolved.replace(/[?#].*$/, '')
  return isAbsolute(clean) ? normalizeModuleIdentity(clean) : undefined
}

/** Vite's cache, HMR, and import stamps, which still name the module itself. */
const moduleSelfQueryKeys = new Set(['import', 't', 'v'])

/** Whether a load query still refers to the source module itself. */
function isModuleSelfQuery(query: string): boolean {
  if (query.length === 0)
    return true

  return query.split('&').every((part) => {
    const [key = ''] = part.split('=', 1)
    try {
      return moduleSelfQueryKeys.has(decodeURIComponent(key.replace(/^\?/, '')))
    }
    catch {
      return false
    }
  })
}

type LateLoadHook = Extract<NonNullable<Plugin['load']>, { handler: unknown }>
type LateResolveIdHook = Extract<NonNullable<Plugin['resolveId']>, { handler: unknown }>

/** Owns the two host-dependent hook filters and their named lifecycle transitions. */
function createLateHookFilterState() {
  let loadHook: LateLoadHook | undefined
  let resolveIdHook: LateResolveIdHook | undefined
  const memberUnion = new Map<string, { readonly file: string, readonly preserveSymlinks: boolean }>()
  let developmentFilterCacheSupported: boolean | undefined
  let loadDevelopmentHold = false
  let resolveDevelopmentHold = false
  let loadDevelopmentCallSeen = false
  let resolveDevelopmentCallSeen = false
  let watchHoldCount = 0
  let loadFilterAssigned = false
  let resolveIdFilterAssigned = false
  let unionGrewSinceNarrowing = false

  const createLoadHook = (handler: LateLoadHook['handler']): LateLoadHook => {
    const hook: LateLoadHook = { handler }
    loadHook = hook
    return hook
  }

  const createResolveIdHook = (handler: LateResolveIdHook['handler']): LateResolveIdHook => {
    const hook: LateResolveIdHook = { handler }
    resolveIdHook = hook
    return hook
  }

  const removeHostDependentFilters = (): void => {
    if (loadHook !== undefined)
      loadHook.filter = undefined
    if (resolveIdHook !== undefined)
      resolveIdHook.filter = undefined
    loadFilterAssigned = false
    resolveIdFilterAssigned = false
  }

  const configure = (command: string, watch: boolean): void => {
    if (command === 'serve') {
      removeHostDependentFilters()
      // The version capability is learned in configResolved. Until then, hold
      // conservatively; Vite 5 releases both holds before its server starts.
      if (developmentFilterCacheSupported !== false) {
        loadDevelopmentHold ||= !loadDevelopmentCallSeen
        resolveDevelopmentHold ||= !resolveDevelopmentCallSeen
      }
    }
    if (command === 'build' && watch) {
      removeHostDependentFilters()
      watchHoldCount++
    }
  }

  const recordHostCapability = (config: ResolvedConfig): void => {
    // Vite 6+ has environments and caches development filters by plugin object.
    if (developmentFilterCacheSupported !== undefined)
      return
    developmentFilterCacheSupported = 'environments' in config
    if (!developmentFilterCacheSupported) {
      loadDevelopmentHold = false
      resolveDevelopmentHold = false
    }
  }

  const recordDevelopmentHookCall = (hook: 'load' | 'resolveId', mode: string | undefined): void => {
    if (mode !== 'dev' || !developmentFilterCacheSupported)
      return
    if (hook === 'load') {
      loadDevelopmentCallSeen = true
      loadDevelopmentHold = false
    }
    else {
      resolveDevelopmentCallSeen = true
      resolveDevelopmentHold = false
    }
  }

  const addBuildMember = (file: string, preserveSymlinks: boolean): void => {
    const key = `${preserveSymlinks ? 'symlink' : 'real'}\0${file}`
    if (memberUnion.has(key))
      return
    memberUnion.set(key, { file, preserveSymlinks })
    unionGrewSinceNarrowing = true
  }

  const applyBuildHookFilters = (): void => {
    if (watchHoldCount > 0)
      return
    const loadHeld = loadDevelopmentHold
    const resolveIdHeld = resolveDevelopmentHold
    if (loadHook !== undefined && !loadHeld && (unionGrewSinceNarrowing || !loadFilterAssigned)) {
      // Some hosts compile filters by object identity. A concurrent host may
      // read while this union grows, so publish a new filter object each time.
      loadHook.filter = { id: createServedIdFilter([...memberUnion.values()]) }
      loadFilterAssigned = true
    }
    if (resolveIdHook !== undefined && !resolveIdHeld && (unionGrewSinceNarrowing || !resolveIdFilterAssigned)) {
      resolveIdHook.filter = { id: createServedIdFilter() }
      resolveIdFilterAssigned = true
    }
    unionGrewSinceNarrowing = false
  }

  const finishWatch = (): void => {
    watchHoldCount = Math.max(0, watchHoldCount - 1)
  }

  return {
    createLoadHook,
    createResolveIdHook,
    configure,
    recordHostCapability,
    recordDevelopmentHookCall,
    addBuildMember,
    applyBuildHookFilters,
    finishWatch,
  }
}

/**
 * Match the IDs a late-narrowed hook serves: Vanity's own addresses plus the
 * given members. Vite hands these hooks resolved virtual IDs after adding
 * `\0`, so a bare `vanity:` specifier never reaches them.
 */
function createServedIdFilter(
  members: readonly { readonly file: string, readonly preserveSymlinks: boolean }[] = [],
): RegExp {
  const memberPatterns = members.map(({ file, preserveSymlinks }) => preserveSymlinks
    ? `(?:^|[\\\\/])${encodeRegexLiteral(basename(file))}`
    : encodeRegexLiteral(normalizePath(file)))
  const addressPatterns = ['\\0vanity:[^?\\r\\n]*', `[^?\\r\\n]*${encodeRegexLiteral(virtualExt)}`]
  return new RegExp(`^(?:${[...addressPatterns, ...memberPatterns].join('|')})(?:\\?[^\\r\\n]*)?$`)
}

function encodeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
