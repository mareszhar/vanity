/** Compiler-owned Vanity style-module transformation and CSS virtual output. */

import type { VanityIdentifierMode } from '../../config'
import type { VanityInspectRecord } from '../../introspect/records'
import type { VanityPortableSystem } from '../../system/contract'
import type { CompilerHmrHost } from '../hmr/host'
import type {
  BuiltStyleModule,
  BundleExternalModule,
  BundleStyleModuleParams,
} from '../modules/build'
import type { EvaluatedStyleModule } from '../modules/evaluate'
import type { EvaluatedSystem, NormalizedSystemSource } from './systems'
import { isAbsolute, resolve } from 'node:path'
import { substrate } from '../../substrate'
import {
  getSystemCssVirtualId,
  replaceEntryVirtualIds,
} from '../hmr/state'
import { evaluateStyleModule } from '../modules/evaluate'
import { normalizePath } from './path'
import { assertNamespaceOwnership, isSameAuthoredFile } from './systems'

export interface StyleAutoImportInjection {
  readonly aliases: ReadonlyMap<string, string>
  readonly path: string
}

export interface StyleTransformContext {
  readonly root: string
  readonly styleFileFilter: RegExp
  readonly virtualExtension: string
  readonly isDev: boolean
  readonly host: CompilerHmrHost
  readonly systemSources: readonly NormalizedSystemSource[]
  readonly namespaceOwners: Map<string, Map<string, VanityPortableSystem>>
  readonly recordsByFile: Map<string, VanityInspectRecord[]>
  readonly cssByVirtualId: Map<string, string>
  readonly cssVirtualIdsByEntry: Map<string, Set<string>>
  readonly cssOwnersByVirtualId: Map<string, Set<string>>
  readonly exportSignatures: Map<string, string>
  readonly failedStyleEntries: Set<string>
  readonly setStyleModuleOwnership: (filePath: string, owned: boolean) => void
  readonly ensureConfiguredSystem: (source: NormalizedSystemSource) => Promise<EvaluatedSystem>
  readonly injectShimFor: (filePath: string) => Promise<StyleAutoImportInjection | undefined>
  readonly buildStyleModule: (params: BundleStyleModuleParams) => Promise<BuiltStyleModule>
  readonly alias: Record<string, string>
  readonly rememberStyleSystems: (entry: string, systems: Iterable<string>) => void
  readonly rememberDependencies: (entry: string, files: Iterable<string>, preserveKnown: boolean) => Set<string>
  readonly rememberPendingCssResponse: (id: string, contents: string) => void
  readonly clearPendingCssResponse: (id: string) => void
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
  transformOptions: { readonly ssr?: boolean } | undefined,
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
  let evaluatedSystems: Array<{ source: NormalizedSystemSource, system: EvaluatedSystem }> = []

  try {
    evaluatedSystems = await Promise.all(context.systemSources.map(async (systemSource) => {
      // An auto-import barrel may be the only route from a style module to
      // the configured system. Ensure that route still receives the same
      // evaluated build-time external as an explicit system import.
      const system = await context.ensureConfiguredSystem(systemSource)
      return { source: systemSource, system }
    }))
    externalSystems = evaluatedSystems.flatMap(({ source: systemSource, system }, systemIndex) => {
      const namespaces = system.moduleExports.size > 0
        ? [...system.moduleExports]
        : [[systemSource.entry, system.buildExports] as const]
      return namespaces.map(([moduleFile, exports], moduleIndex) => ({
        id: `vanity:build-system:${systemIndex}:${moduleIndex}`,
        moduleFile,
        source: systemSource,
        exports,
      }))
    })
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
    const retired = replaceEntryVirtualIds(
      filePath,
      new Set(),
      context.cssVirtualIdsByEntry,
      context.cssByVirtualId,
      context.cssOwnersByVirtualId,
      `style:${filePath}`,
      context.rememberPendingCssResponse,
    )
    clearRetiredCss(context, retired)
    return null
  }
  context.setStyleModuleOwnership(filePath, true)

  const portableSystems = records.flatMap(record =>
    record.kind === 'system' && record.portable !== undefined
      ? [record.portable]
      : [])

  for (const portable of portableSystems) {
    // A configured barrel can expose a contract whose honest authored source
    // is its leaf module. Namespace ownership follows the configured
    // compiler entry, while this record's source remains the consolidation
    // site for diagnostics and introspection.
    const configuredOwner = evaluatedSystems.find(({ system }) =>
      system.portable === portable
      || (
        system.portable.identities.css === portable.identities.css
        && system.portable.identities.compatibility === portable.identities.compatibility
        && system.portable.identities.runtime === portable.identities.runtime
      ))?.source.entry
    assertNamespaceOwnership(
      configuredOwner ?? normalizePath(isAbsolute(portable.source ?? filePath)
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
    const fileScope = substrate.backend.parseFileScope(serializedFileScope)
    const system = portableSystems.find(portable =>
      !isSameAuthoredFile(fileScope.filePath, filePath, root)
      && isSameAuthoredFile(fileScope.filePath, portable.source, root))
    const scopePath = normalizePath(isAbsolute(fileScope.filePath)
      ? fileScope.filePath
      : resolve(root, fileScope.filePath))
    const virtualId = system === undefined
      ? `${scopePath}${context.virtualExtension}`
      : getSystemCssVirtualId(system.identities.css, root, context.virtualExtension)
    // Provenance in dev: the stylesheet names its style module up front.
    const served = context.isDev ? `/* ${fileScope.filePath} · vanity */\n${css}` : css
    const previousCss = context.cssByVirtualId.get(virtualId)
    const changed = previousCss !== undefined && previousCss !== served

    context.cssByVirtualId.set(virtualId, served)
    context.clearPendingCssResponse(virtualId)
    nextVirtualIds.add(virtualId)
    cssImports.push(`import '${context.host.resolveBrowserModuleUrl(virtualId)}';`)

    // The id is stable, so update both halves of the HMR contract: mark
    // Vite's file-change walk already invalidated this virtual module via
    // its importer before the style transform runs. At that point its
    // self-accepting metadata is intentionally blank, so `reloadModule`
    // cannot rediscover an update boundary. Notify the client of the
    // known-safe CSS module directly; fetching its stable URL re-runs
    // Vite's CSS wrapper and replaces the existing style tag in place.
    // Dependency fan-out otherwise refreshes the in-memory bytes without
    // ever asking the browser to fetch them.
    if (changed && context.isDev)
      context.host.updateCssModule(virtualId)
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
    const virtualId = getSystemCssVirtualId(
      evaluatedSystem.portable.identities.css,
      root,
      context.virtualExtension,
    )
    if (!context.cssByVirtualId.has(virtualId) || nextVirtualIds.has(virtualId))
      continue
    nextVirtualIds.add(virtualId)
    cssImports.unshift(`import '${context.host.resolveBrowserModuleUrl(virtualId)}';`)
  }

  const retired = replaceEntryVirtualIds(
    filePath,
    nextVirtualIds,
    context.cssVirtualIdsByEntry,
    context.cssByVirtualId,
    context.cssOwnersByVirtualId,
    `style:${filePath}`,
    context.rememberPendingCssResponse,
  )
  clearRetiredCss(context, retired)

  if (context.isDev)
    context.scheduleManifest()

  let code = substrate.backend.serializeStyleModule(cssImports, exports, unusedCompositionRegex)

  if (context.isDev && !transformOptions?.ssr) {
    const signature = Object.keys(exports).sort().join('\0')
    const previous = context.exportSignatures.get(filePath)
    context.exportSignatures.set(filePath, signature)

    // Stable export names → values are serialized contracts whose CSS can
    // update in place. Added/removed/renamed exports leave importers with
    // stale bindings, so exactly one full reload restores truth.
    if (previous !== undefined && previous !== signature) {
      context.host.sendFullReload()
    }

    code += '\nif (import.meta.hot) { import.meta.hot.accept() }\n'
  }

  return { code, map: { mappings: '' } }
}

function clearRetiredCss(
  context: StyleTransformContext,
  retired: ReadonlySet<string>,
): void {
  if (retired.size === 0)
    return

  context.host.removeCssModules(retired)
}
