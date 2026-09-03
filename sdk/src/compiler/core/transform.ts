/** Compiler-owned Vanity style-module transformation and CSS virtual output. */

import type { TransformOptions, ViteDevServer } from 'vite'
import type { VanityIdentifierMode } from '../../config'
import type { VanityInspectRecord } from '../../introspect/records'
import type { VanityPortableSystemV2 } from '../../system/contract'
import type {
  BuiltStyleModule,
  BundleExternalModule,
  BundleStyleModuleParams,
} from '../modules/build'
import type { EvaluatedStyleModule } from '../modules/evaluate'
import type { EvaluatedSystem, NormalizedSystemSource } from './systems'
import { isAbsolute, join, posix, resolve } from 'node:path'
import { substrate } from '../../substrate'
import { replaceEntryVirtualIds, sendCssUpdate } from '../hmr/update'
import { evaluateStyleModule } from '../modules/evaluate'
import { normalizePath } from '../path'
import { assertNamespaceOwnership, isSameAuthoredFile } from './systems'

export interface StyleAutoImportInjection {
  readonly aliases: ReadonlyMap<string, string>
  readonly path: string
}

export interface StyleTransformContext {
  readonly root: string
  readonly styleFileFilter: RegExp
  readonly virtualExtension: string
  readonly server?: ViteDevServer
  readonly clientServer?: ViteDevServer
  readonly systemSources: readonly NormalizedSystemSource[]
  readonly namespaceOwners: Map<string, Map<string, VanityPortableSystemV2>>
  readonly recordsByFile: Map<string, VanityInspectRecord[]>
  readonly cssByVirtualId: Map<string, string>
  readonly cssVirtualIdsByEntry: Map<string, Set<string>>
  readonly exportSignatures: Map<string, string>
  readonly failedStyleEntries: Set<string>
  readonly setStyleModuleOwnership: (filePath: string, owned: boolean) => void
  readonly ensureConfiguredSystem: (source: NormalizedSystemSource) => Promise<EvaluatedSystem>
  readonly injectShimFor: (filePath: string) => Promise<StyleAutoImportInjection | undefined>
  readonly buildStyleModule: (params: BundleStyleModuleParams) => Promise<BuiltStyleModule>
  readonly alias: Record<string, string>
  readonly rememberStyleSystems: (entry: string, systems: Iterable<string>) => void
  readonly rememberDependencies: (entry: string, files: Iterable<string>, preserveKnown: boolean) => Set<string>
  readonly addWatchFile: (file: string) => void
  readonly buildFailureFiles: (error: unknown, root: string) => string[]
  readonly createStyleBuildError: (error: unknown, entry: string, root: string) => unknown
  readonly reportFailure: (error: unknown) => void
  readonly getIdentifierOption: () => VanityIdentifierMode
  readonly scheduleManifest: () => void
}

/** Transform one `*.css.ts` module and update its stable CSS virtual modules. */
export async function transformStyleModule(
  _code: string,
  id: string,
  transformOptions: TransformOptions | undefined,
  context: StyleTransformContext,
): Promise<{ code: string, map: { mappings: string } } | null> {
  const [validId] = id.split('?')

  if (!context.styleFileFilter.test(validId))
    return null

  const root = context.root
  const filePath = normalizePath(validId)

  let source: string
  let watchFiles: string[]
  let externalSystems: readonly BundleExternalModule[] = []
  let externalSystemEntries: readonly string[] = []

  try {
    externalSystems = await Promise.all(context.systemSources.map(async (systemSource, index) => {
      // An auto-import barrel may be the only route from a style module to
      // the configured system. Ensure that route still receives the same
      // evaluated build-time external as an explicit system import.
      const system = await context.ensureConfiguredSystem(systemSource)
      return {
        id: `vanity:build-system:${index}`,
        source: systemSource,
        exports: system.buildExports,
      }
    }))
    const injection = await context.injectShimFor(filePath)
    const bundled = await context.buildStyleModule({
      filePath,
      root,
      alias: context.alias,
      inject: injection?.path,
      ambientAliases: injection?.aliases,
      externalModules: externalSystems,
    })
    source = bundled.source
    watchFiles = bundled.watchFiles
    externalSystemEntries = bundled.externalSystemEntries
    context.rememberStyleSystems(filePath, externalSystemEntries)
  }
  catch (error) {
    context.failedStyleEntries.add(filePath)
    const failureFiles = context.buildFailureFiles(error, root)
    const dependencies = context.rememberDependencies(filePath, failureFiles, true)
    for (const dependency of dependencies)
      context.addWatchFile(dependency)
    const failure = context.createStyleBuildError(error, filePath, root)
    context.reportFailure(failure)
    throw failure
  }

  context.failedStyleEntries.delete(filePath)
  const dependencies = context.rememberDependencies(filePath, watchFiles, false)
  for (const dependency of dependencies)
    context.addWatchFile(dependency)

  let evaluated: EvaluatedStyleModule
  try {
    evaluated = evaluateStyleModule(
      source,
      filePath,
      context.getIdentifierOption(),
      new Map(externalSystems.map(system => [system.id, system.exports])),
    )
  }
  catch (error) {
    context.failedStyleEntries.add(filePath)
    const failure = context.createStyleBuildError(error, filePath, root)
    context.reportFailure(failure)
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
    context.setStyleModuleOwnership(filePath, false)
    context.failedStyleEntries.delete(filePath)
    context.rememberDependencies(filePath, [], false)
    context.recordsByFile.delete(filePath)
    replaceEntryVirtualIds(filePath, new Set(), context.cssVirtualIdsByEntry, context.cssByVirtualId)
    return null
  }
  context.setStyleModuleOwnership(filePath, true)

  const portableSystems = records.flatMap(record =>
    record.kind === 'system' && record.portable !== undefined
      ? [record.portable]
      : [])

  for (const portable of portableSystems) {
    const configuredOwner = context.systemSources.find(systemSource =>
      isSameAuthoredFile(systemSource.entry, portable.source, root))
    assertNamespaceOwnership(
      configuredOwner?.entry ?? normalizePath(isAbsolute(portable.source ?? filePath)
        ? portable.source ?? filePath
        : resolve(root, portable.source ?? filePath)),
      portable,
      context.namespaceOwners,
    )
  }

  // Replace each evaluated file's inspection records — the bundle carries
  // its whole import graph, so records for dependencies arrive here too.
  const recordedFiles = new Set<string>()
  for (const record of records)
    recordedFiles.add(record.file ?? normalizePath(filePath))
  for (const file of recordedFiles)
    context.recordsByFile.set(file, records.filter(record => (record.file ?? normalizePath(filePath)) === file))

  const cssImports: string[] = []
  const nextVirtualIds = new Set<string>()

  for (const [serializedFileScope, css] of cssByFileScope) {
    const fileScope = substrate.modules.parseFileScope(serializedFileScope)
    const system = portableSystems.find(portable =>
      !isSameAuthoredFile(fileScope.filePath, filePath, root)
      && isSameAuthoredFile(fileScope.filePath, portable.source, root))
    const virtualId = system === undefined
      ? `${normalizePath(join(root, fileScope.filePath))}${context.virtualExtension}`
      : normalizePath(join(
          root,
          '.vanity',
          'virtual',
          'system',
          `${system.identities.css}${context.virtualExtension}`,
        ))
    // Provenance in dev: the stylesheet names its style module up front.
    const served = context.server ? `/* ${fileScope.filePath} · vanity */\n${css}` : css
    const previousCss = context.cssByVirtualId.get(virtualId)
    const changed = previousCss !== undefined && previousCss !== served

    context.cssByVirtualId.set(virtualId, served)
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
    if (changed && context.clientServer) {
      const url = `/${posix.relative(normalizePath(root), virtualId)}`
      for (const virtualModule of context.clientServer.moduleGraph.getModulesByFile(virtualId) ?? [])
        context.clientServer.moduleGraph.invalidateModule(virtualModule)
      sendCssUpdate(context.clientServer, url, Date.now())
    }
  }

  // A configured system is evaluated once and reused by every importing
  // style module. Its CSS therefore emits only on the first build-time
  // access, but every importer must retain the stable semantic stylesheet
  // edge so a later re-transform cannot orphan or delete that shared CSS.
  for (const entry of externalSystemEntries) {
    const system = context.systemSources.find(source => source.entry === entry)
    if (!system)
      continue
    const evaluatedSystem = await context.ensureConfiguredSystem(system)
    const virtualId = normalizePath(join(
      root,
      '.vanity',
      'virtual',
      'system',
      `${evaluatedSystem.portable.identities.css}${context.virtualExtension}`,
    ))
    if (!context.cssByVirtualId.has(virtualId) || nextVirtualIds.has(virtualId))
      continue
    nextVirtualIds.add(virtualId)
    cssImports.unshift(`import '${virtualId}';`)
  }

  replaceEntryVirtualIds(filePath, nextVirtualIds, context.cssVirtualIdsByEntry, context.cssByVirtualId)

  if (context.server)
    context.scheduleManifest()

  let code = substrate.modules.serializeStyleModule(cssImports, exports, unusedCompositionRegex)

  if (context.server && !transformOptions?.ssr) {
    const signature = Object.keys(exports).sort().join('\0')
    const previous = context.exportSignatures.get(filePath)
    context.exportSignatures.set(filePath, signature)

    // Stable export names → values are serialized contracts whose CSS can
    // update in place. Added/removed/renamed exports leave importers with
    // stale bindings, so exactly one full reload restores truth.
    if (previous !== undefined && previous !== signature) {
      const hotServer = context.clientServer ?? context.server
      hotServer.hot.send({ type: 'full-reload' })
    }

    code += '\nif (import.meta.hot) { import.meta.hot.accept() }\n'
  }

  return { code, map: { mappings: '' } }
}
