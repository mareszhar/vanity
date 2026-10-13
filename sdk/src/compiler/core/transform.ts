/** Compiler-owned Vanity style-module transformation and CSS virtual output. */

import type { VanityIdentifierMode } from '../../config'
import type { VanityDiagnosticInput } from '../../diagnostics'
import type { VanityInspectRecord } from '../../introspect/records'
import type { VanityPortableSystem } from '../../system/contract'
import type { CompilerHmrHost } from '../hmr/host'
import type {
  BuiltStyleModule,
  BundleExternalModule,
  BundleStyleModuleParams,
} from '../modules/build'
import type { EvaluatedStyleModule } from '../modules/evaluate'
import type { StyleModuleHost } from '../modules/resolution'
import type { EvaluatedSystem, NormalizedSystemSource } from './systems'
import { Buffer } from 'node:buffer'
import { isAbsolute, resolve } from 'node:path'
import { substrate } from '../../substrate'
import {
  getStyleCssVirtualId,
  getSystemCssVirtualId,
  replaceEntryVirtualIds,
} from '../hmr/state'
import { readCompilerBaseline } from '../modules/baseline'
import { evaluateStyleModule } from '../modules/evaluate'
import { enrichStyleEvaluationError } from '../modules/resolution'
import { normalizePath } from './path'
import { assertNamespaceOwnership, isSameAuthoredFile, removeNamespaceOwners } from './systems'

export interface StyleAutoImportInjection {
  readonly aliases: ReadonlyMap<string, string>
  readonly path: string
}

export interface StyleTransformContext extends StyleModuleHost {
  readonly root: string
  readonly getStyleModuleGeneration: (file: string) => number
  readonly baseline?: string
  readonly baselineRoot?: string
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
  readonly rememberStyleSystems: (entry: string, systems: Iterable<string>) => void
  readonly rememberDependencies: (entry: string, files: Iterable<string>, preserveKnown: boolean) => Set<string>
  readonly rememberPendingCssResponse: (id: string, contents: string) => void
  readonly clearPendingCssResponse: (id: string) => void
  readonly clearRetiredCssModules: (ids: ReadonlySet<string>) => void
  readonly addWatchFile: (file: string) => void
  readonly buildFailureFiles: (error: unknown, root: string) => string[]
  readonly createStyleBuildError: (error: unknown, entry: string, root: string) => unknown
  readonly reportFailure: (error: unknown) => void
  readonly reportWarning?: (diagnostic: VanityDiagnosticInput) => void
  readonly getIdentifierOption: () => VanityIdentifierMode
  readonly scheduleManifest: () => void
  readonly prefixCss: (css: string) => string
  readonly loadSubstrateCss?: (source: string) => Promise<string>
}

/** Content queries are distinct from Vite's import and HMR request stamps. */
export function getStyleCssQuery(id: string): { readonly raw: boolean, readonly inline: boolean, readonly url: boolean, readonly direct: boolean, readonly css: boolean } {
  const query = id.slice(id.indexOf('?') + 1)
  const parameters = id.includes('?') ? new URLSearchParams(query) : new URLSearchParams()
  return {
    raw: /[?&]raw(?:&|$)/.test(id),
    inline: /[?&]inline\b/.test(id),
    url: /[?&]url(?:&|$)/.test(id),
    direct: /[?&]direct\b/.test(id),
    css: /[?&](?:inline|direct|transform-only)\b/.test(id)
      || /[?&]url(?:&|$)/.test(id)
      || (parameters.has('vue') && parameters.get('type') === 'style'),
  }
}

/** Transform one `*.css.ts` module and update its stable CSS virtual modules. */
export async function transformStyleModule(
  _code: string,
  id: string,
  transformOptions: { readonly ssr?: boolean, readonly css?: boolean } | undefined,
  context: StyleTransformContext,
): Promise<{ code: string, map: { mappings: string } } | null> {
  const [validId] = id.split('?')

  if (!context.styleFileFilter.test(validId))
    return null

  const query = getStyleCssQuery(id)
  if (query.raw)
    return null

  const root = context.root
  const filePath = normalizePath(validId)
  const generation = context.getStyleModuleGeneration(filePath)
  const isCurrent = () => generation === context.getStyleModuleGeneration(filePath)

  let bundled: BuiltStyleModule
  let source: string
  let watchFiles: string[]
  let externalSystems: readonly BundleExternalModule[] = []
  let externalSystemEntries: readonly string[] = []
  let evaluatedSystems: Array<{ source: NormalizedSystemSource, system: EvaluatedSystem }> = []

  try {
    for (;;) {
      evaluatedSystems = await Promise.all(context.systemSources.map(async (systemSource) => {
        // Ambient barrels and explicit imports share one system snapshot.
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
      bundled = await context.buildStyleModule({
        filePath,
        root,
        resolve: context.resolve,
        load: context.load,
        inject: injection?.path,
        ambientAliases: injection?.aliases,
        externalModules: externalSystems,
      })
      if (!isCurrent())
        return { code: '', map: { mappings: '' } }
      source = bundled.source
      watchFiles = bundled.watchFiles
      externalSystemEntries = bundled.externalSystemEntries
      context.rememberStyleSystems(filePath, externalSystemEntries)
      // Bundling yields to the host. Rebuild against a completed newer system
      // before either evaluating an outdated expression or publishing its CSS.
      const currentSystems = await Promise.all(evaluatedSystems.map(({ source }) => context.ensureConfiguredSystem(source)))
      if (currentSystems.every((system, index) => system === evaluatedSystems[index]!.system))
        break
    }
  }
  catch (error) {
    if (!isCurrent())
      return { code: '', map: { mappings: '' } }
    context.failedStyleEntries.add(filePath)
    const failureFiles = context.buildFailureFiles(error, root)
    const dependencies = context.rememberDependencies(filePath, failureFiles, true)
    for (const dependency of dependencies)
      context.addWatchFile(dependency)
    const failure = context.createStyleBuildError(error, filePath, root)
    context.reportFailure(failure)
    throw failure
  }

  if (!isCurrent())
    return { code: '', map: { mappings: '' } }
  context.failedStyleEntries.delete(filePath)
  const baseline = readCompilerBaseline(context.baselineRoot ?? root, context.baseline, root)
  const baselineSession = baseline.createModuleSession(filePath)
  const dependencies = context.rememberDependencies(filePath, [...watchFiles, baseline.file], false)
  for (const dependency of dependencies)
    context.addWatchFile(dependency)

  let evaluated: EvaluatedStyleModule
  try {
    evaluated = evaluateStyleModule(
      source,
      filePath,
      context.getIdentifierOption(),
      new Map(externalSystems.map(system => [system.id, system.exports])),
      context.reportWarning,
      baselineSession.finalization,
    )
  }
  catch (error) {
    const enriched = await enrichStyleEvaluationError(error, bundled!, root)
    if (!isCurrent())
      return { code: '', map: { mappings: '' } }
    context.failedStyleEntries.add(filePath)
    const failure = context.createStyleBuildError(enriched, filePath, root)
    context.reportFailure(failure)
    throw failure
  }
  const { exports, cssByFileScope, unusedCompositionRegex, records } = evaluated

  // The bundled substrate plugin preserves raw vanilla-extract class naming.
  // Its output still belongs to this pipeline: keep stylesheet ownership until
  // that transform replaces it, independently of inspection records.
  if (records.length === 0) {
    context.setStyleModuleOwnership(filePath, false)
    context.recordsByFile.delete(filePath)
    if (!context.systemSources.some(source => source.entry === filePath))
      removeNamespaceOwners(context.namespaceOwners, [filePath])
    context.exportSignatures.delete(filePath)
    return transformOptions?.css && context.loadSubstrateCss !== undefined
      ? { code: await context.loadSubstrateCss(filePath), map: { mappings: '' } }
      : null
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
  const recordedFiles = new Map<string, VanityInspectRecord[]>()
  for (const record of records) {
    const authoredFile = record.file ?? filePath
    const file = normalizePath(isAbsolute(authoredFile) ? authoredFile : resolve(root, authoredFile))
    const fileRecords = recordedFiles.get(file) ?? []
    fileRecords.push(record)
    recordedFiles.set(file, fileRecords)
  }
  for (const [file, fileRecords] of recordedFiles)
    context.recordsByFile.set(file, fileRecords)

  const cssImports: Array<{ readonly id: string, readonly code: string }> = []
  const nextVirtualIds = new Set<string>()

  for (const [serializedFileScope, css] of cssByFileScope) {
    const fileScope = substrate.backend.parseFileScope(serializedFileScope)
    const system = portableSystems.find(portable =>
      !isSameAuthoredFile(fileScope.filePath, filePath, root)
      && isSameAuthoredFile(fileScope.filePath, portable.source, root))
    const virtualId = system === undefined
      ? getStyleCssVirtualId(fileScope.filePath, root, context.virtualExtension)
      : getSystemCssVirtualId(system.identities.css, root, context.virtualExtension)
    // Provenance in dev: the stylesheet names its style module up front.
    const served = context.isDev ? `/* ${fileScope.filePath} · vanity */\n${css}` : css
    const previousCss = context.cssByVirtualId.get(virtualId)
    const changed = previousCss !== undefined && previousCss !== served

    context.cssByVirtualId.set(virtualId, served)
    context.clearPendingCssResponse(virtualId)
    nextVirtualIds.add(virtualId)
    cssImports.push({ id: virtualId, code: `import '${context.host.resolveBrowserModuleUrl(virtualId)}';` })

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
    const evaluatedSystem = evaluatedSystems.find(({ source }) => source.entry === entry)?.system
    if (!evaluatedSystem)
      continue
    const virtualId = getSystemCssVirtualId(
      evaluatedSystem.portable.identities.css,
      root,
      context.virtualExtension,
    )
    if (!context.cssByVirtualId.has(virtualId) || nextVirtualIds.has(virtualId))
      continue
    nextVirtualIds.add(virtualId)
    cssImports.unshift({ id: virtualId, code: `import '${context.host.resolveBrowserModuleUrl(virtualId)}';` })
  }

  const previousVirtualIds = context.cssVirtualIdsByEntry.get(filePath)
  const importsChanged = previousVirtualIds !== undefined
    && (previousVirtualIds.size !== nextVirtualIds.size || [...nextVirtualIds].some(id => !previousVirtualIds.has(id)))
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

  if (transformOptions?.css) {
    const css = cssImports
      .map(({ id }) => context.prefixCss(context.cssByVirtualId.get(id) ?? ''))
      .join('\n')
    return { code: css, map: { mappings: '' } }
  }

  let code = substrate.backend.serializeStyleModule(cssImports.map(({ code }) => code), exports, unusedCompositionRegex)

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

    // A new CSS identity is imported by the source wrapper. Stable CSS has
    // its own update; the host waits for both installation paths before prune.
    if (importsChanged)
      context.host.sendStyleModuleUpdate(context.host.getGraphModuleUrl(filePath))

    code += '\nif (import.meta.hot) { import.meta.hot.accept() }\n'
  }

  return { code, map: { mappings: '' } }
}

/** Retire one source using the same ownership replacement and CSS graph cleanup as a transform. */
export function removeStyleModule(filePath: string, context: StyleTransformContext): void {
  context.setStyleModuleOwnership(filePath, false)
  context.failedStyleEntries.delete(filePath)
  context.rememberDependencies(filePath, [], false)
  context.rememberStyleSystems(filePath, [])
  context.recordsByFile.delete(filePath)
  if (!context.systemSources.some(source => source.entry === filePath))
    removeNamespaceOwners(context.namespaceOwners, [filePath])
  context.exportSignatures.delete(filePath)
  const retired = replaceEntryVirtualIds(
    filePath,
    new Set(),
    context.cssVirtualIdsByEntry,
    context.cssByVirtualId,
    context.cssOwnersByVirtualId,
    `style:${filePath}`,
    context.rememberPendingCssResponse,
  )
  context.cssVirtualIdsByEntry.delete(filePath)
  clearRetiredCss(context, retired)
}

function clearRetiredCss(
  context: StyleTransformContext,
  retired: ReadonlySet<string>,
): void {
  if (retired.size === 0)
    return

  context.clearRetiredCssModules(retired)
}

/** Load a stylesheet view through the same evaluation, capture and ownership path. */
export async function loadStyleModuleCss(
  source: string,
  id: string,
  options: { readonly ssr?: boolean } | undefined,
  context: StyleTransformContext,
): Promise<{ code: string, map: { mappings: string } } | null> {
  const query = getStyleCssQuery(id)
  // The host's CSS URL hook owns build assets and its transform-only request.
  if (query.url && !context.isDev)
    return null
  const result = await transformStyleModule('', source, { ...options, css: true }, context)
  if (result === null || !query.url)
    return result
  const url = query.inline
    ? `data:text/css;base64,${Buffer.from(result.code).toString('base64')}`
    : context.host.resolveBrowserModuleUrl(id.split('?')[0]!)
      + id.slice(id.indexOf('?')).replace(/([?&])url(?:&|$)/, (_, separator: string) => separator).replace(/[?&]$/, '')
  return { code: `export default ${JSON.stringify(url)}`, map: { mappings: '' } }
}
