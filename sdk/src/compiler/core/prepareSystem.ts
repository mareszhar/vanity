/** One preparation path for a configured system in every compiler host. */
import type { VanityIdentifierMode } from '../../config'
import type { VanityDiagnosticInput } from '../../diagnostics'
import type { BaselineModule } from '../modules/baseline'
import type { StyleModuleHost } from '../modules/resolution'
import type { ConfiguredSystemResolutionCache, EvaluatedSystem, NormalizedSystemSource } from './systems'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { substrate } from '../../substrate'
import { assertPortableSystem } from '../../system/contract'
import { readCompilerBaseline } from '../modules/baseline'
import { buildStyleModule } from '../modules/build'
import { evaluateSystemModule } from '../modules/evaluateSystem'
import { enrichStyleEvaluationError } from '../modules/resolution'
import { emitSystemCss } from '../projection/systemCss'
import { assertFreshPortablePair, getConfiguredSystemModuleFiles } from './systems'

export async function prepareSystemSource({ source, root, host, cache, identifiers, baseline: configuredBaseline, baselineRoot, reportWarning, collectCapture, trackDependencies }: {
  source: NormalizedSystemSource
  root: string
  host: StyleModuleHost
  cache: ConfiguredSystemResolutionCache
  identifiers: VanityIdentifierMode
  baseline?: string
  baselineRoot?: string
  reportWarning?: (diagnostic: VanityDiagnosticInput) => void
  collectCapture?: (module: BaselineModule) => void
  trackDependencies?: (files: string[]) => void
}): Promise<{ evaluated: EvaluatedSystem, dependencies: string[] }> {
  const baseline = readCompilerBaseline(baselineRoot ?? root, configuredBaseline, root, file => trackDependencies?.([file]))
  const session = baseline.createModuleSession(source.entry)
  collectCapture?.(session)
  const bundled = await buildStyleModule({
    filePath: source.entry,
    root,
    ...host,
    namespaceFiles: [...getConfiguredSystemModuleFiles(source, root, cache)],
    preserveAuthoredSource: source.artifact !== undefined,
  })
  const files = [...bundled.watchFiles, baseline.file]
  trackDependencies?.(files)
  let inProcess: EvaluatedSystem
  try {
    inProcess = evaluateSystemModule(bundled.source, source.entry, reportWarning, session.finalization)
  }
  catch (error) {
    throw await enrichStyleEvaluationError(error, bundled, root)
  }
  let portable = inProcess.portable
  if (source.artifact) {
    const parsed: unknown = JSON.parse(await readFile(source.artifact, 'utf-8'))
    assertPortableSystem(parsed)
    const owner = source.packageName ?? substrate.backend.getPackageName(dirname(source.entry)) ?? source.entry
    assertFreshPortablePair(source, inProcess.portable, parsed, owner)
    portable = parsed
  }
  const projected = emitSystemCss(inProcess.contract, {
    filePath: source.entry,
    ...(source.packageName === undefined ? {} : { packageName: source.packageName }),
  }, identifiers, reportWarning, session.finalization)
  return {
    dependencies: files,
    evaluated: { ...inProcess, portable, contractExport: source.exportName ?? inProcess.contractExport, records: [...inProcess.records, ...projected.records], css: projected.css },
  }
}
