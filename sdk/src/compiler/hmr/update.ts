/** Compiler-owned dependency fan-out and stable CSS HMR updates. */

import type { ModuleNode, ViteDevServer } from 'vite'
import type { VanityInspectRecord } from '../../introspect/records'
import type { VanityPortableSystem } from '../../system/contract'
import type { EvaluatedSystem, NormalizedSystemSource } from '../core/systems'
import { readFile } from 'node:fs/promises'
import { posix } from 'node:path'
import { normalizePath } from '../core/path'
import { getRuntimeIdentity } from '../core/systems'
import { replaceEntryVirtualIds as replaceVirtualIds } from './state'

export interface StyleHotUpdateContext {
  readonly file: string
  readonly server: ViteDevServer
  readonly modules: readonly ModuleNode[]
}

export interface StyleHotUpdateState {
  readonly root: string
  readonly runtimeVirtualPrefix: string
  readonly systemSources: readonly NormalizedSystemSource[]
  readonly systemDependentsByFile: Map<string, Set<string>>
  readonly systemsByEntry: Map<string, EvaluatedSystem>
  readonly recordsByFile: Map<string, VanityInspectRecord[]>
  readonly dependentsByFile: Map<string, Set<string>>
  readonly styleEntriesBySystem: Map<string, Set<string>>
  readonly runtimeVirtualIds: Set<string>
  readonly failedStyleEntries: Set<string>
  readonly refreshAppAutoImports?: () => Promise<void>
  readonly evaluateConfiguredSystem: (source: NormalizedSystemSource) => Promise<EvaluatedSystem>
  readonly createSystemRecord: (system: VanityPortableSystem) => VanityInspectRecord
}

/** Recompile affected style entries and invalidate dependent runtime modules. */
export async function handleHotUpdate(
  context: StyleHotUpdateContext,
  state: StyleHotUpdateState,
): Promise<ModuleNode[] | undefined> {
  const normalizedFile = normalizePath(context.file)
  await state.refreshAppAutoImports?.()

  const affectedSystems = [...state.systemDependentsByFile.get(normalizedFile) ?? []]
  const invalidatedRuntimeIdentities = new Set<string>()
  const failures: unknown[] = []

  for (const entry of affectedSystems) {
    const source = state.systemSources.find(candidate => candidate.entry === entry)
    if (!source)
      continue
    try {
      const previous = state.systemsByEntry.get(entry)
      const system = await state.evaluateConfiguredSystem(source)
      state.recordsByFile.set(source.entry, [state.createSystemRecord(system.portable)])
      if (
        previous !== undefined
        && getRuntimeIdentity(previous.portable) !== getRuntimeIdentity(system.portable)
      ) {
        invalidatedRuntimeIdentities.add(getRuntimeIdentity(previous.portable))
      }
    }
    catch (error) {
      // Preserve the last-good application projection, CSS, artifact, and manifest. The
      // changed entry/style transform reports the fresh compiler error.
      failures.push(error)
    }
  }

  const dependents = state.dependentsByFile.get(normalizedFile)
  if (!dependents?.size && affectedSystems.length === 0)
    return undefined

  // A bundled dependency changed: every style module built on it
  // re-evaluates, so its fresh CSS lands under the same stable ids.
  const affected = new Set(context.modules)
  const entries = new Set(dependents ?? [])
  for (const system of affectedSystems) {
    for (const entry of state.styleEntriesBySystem.get(system) ?? [])
      entries.add(entry)
  }

  for (const id of state.runtimeVirtualIds) {
    const payload = id.slice(state.runtimeVirtualPrefix.length)
    const runtimeId = payload.slice(payload.indexOf(':') + 1)
    if (!invalidatedRuntimeIdentities.has(runtimeId))
      continue
    const runtimeModule = context.server.moduleGraph.getModuleById(id)
    if (runtimeModule) {
      context.server.moduleGraph.invalidateModule(runtimeModule)
      affected.add(runtimeModule)
    }
  }

  for (const dependent of entries) {
    const url = `/${posix.relative(normalizePath(state.root), dependent)}`
    let dependentModules = [...context.server.moduleGraph.getModulesByFile(dependent) ?? []]
    const urlModule = await context.server.moduleGraph.getModuleByUrl(url)
    if (urlModule !== undefined && !dependentModules.includes(urlModule))
      dependentModules.push(urlModule)

    // Vite 8's compatibility graph and environment graphs do not always
    // share invalidation state for dependencies bundled outside Vite.
    // Invalidate the concrete environment entry as well as the wrapper.
    for (const environment of Object.values(context.server.environments)) {
      const environmentModule = await environment.moduleGraph.getModuleByUrl(url)
      if (environmentModule !== undefined)
        environment.moduleGraph.invalidateModule(environmentModule)
    }

    // A first-ever failed transform may not have a healthy module-graph
    // node. Materialize one from the attempted entry we track outside
    // Vite's graph so the repaired dependency can invalidate/retry it on
    // this same server.
    if (dependentModules.length === 0 && state.failedStyleEntries.has(dependent))
      dependentModules = [await context.server.moduleGraph.ensureEntryFromUrl(url)]

    for (const dependentModule of dependentModules) {
      // Bundled dependencies are deliberately invisible to Vite's import
      // graph, so its ordinary file walk cannot invalidate this entry for
      // us. Clear the cached transform here before returning the boundary.
      context.server.moduleGraph.invalidateModule(dependentModule)
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
      await context.server.environments.client.pluginContainer.transform(source, dependent)
    }
    catch (error) {
      failures.push(error)
    }
  }

  if (failures.length > 0)
    throw failures[0]

  return [...affected]
}

/** Send a stable virtual CSS update that replaces the browser's existing style tag. */
export function sendCssUpdate(server: ViteDevServer, url: string, timestamp: number): void {
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

export { replaceVirtualIds as replaceEntryVirtualIds }
