/** Compiler-owned dependency fan-out and stable CSS HMR updates. */

import type { EvaluatedSystem, NormalizedSystemSource } from '../core/systems'
import type { CompilerHmrHost } from './host'
import { normalizePath } from '../core/path'
import { getRuntimeIdentity } from '../core/systems'

export interface StyleHotUpdateContext {
  readonly file: string
  readonly modules: readonly object[]
}

/** A resolved application namespace projection for one system. */
export interface RuntimeNamespaceHmrRecord {
  readonly id: string
  readonly moduleFile: string
  readonly identity: string
  readonly runtimeId: string
}

export interface StyleHotUpdateState {
  readonly host: CompilerHmrHost
  readonly runtimeVirtualPrefix: string
  readonly systemSources: readonly NormalizedSystemSource[]
  readonly systemDependentsByFile: Map<string, Set<string>>
  readonly systemsByEntry: Map<string, EvaluatedSystem>
  readonly dependentsByFile: Map<string, Set<string>>
  readonly styleEntriesBySystem: Map<string, Set<string>>
  readonly runtimeVirtualIds: Set<string>
  readonly runtimeNamespaceIdsByEntry: Map<string, Map<string, RuntimeNamespaceHmrRecord>>
  readonly clearRuntimeNamespaceProjection: (id: string) => void
  readonly getRuntimeNamespaceIdentity: (system: EvaluatedSystem, moduleFile: string) => string | undefined
  readonly failedStyleEntries: Set<string>
  readonly refreshAppAutoImports?: () => Promise<void>
  readonly evaluateConfiguredSystems: (sources: readonly NormalizedSystemSource[]) => Promise<EvaluatedSystem[]>
}

/** Recompile affected style entries and invalidate dependent runtime modules. */
export async function handleHotUpdate(
  context: StyleHotUpdateContext,
  state: StyleHotUpdateState,
): Promise<object[] | undefined> {
  const normalizedFile = normalizePath(context.file)
  await state.refreshAppAutoImports?.()

  const affectedSystems = [...state.systemDependentsByFile.get(normalizedFile) ?? []]
  const invalidatedRuntimeIdentities = new Set<string>()
  const invalidatedRuntimeNamespaceIds = new Set<string>()
  const failures: unknown[] = []
  const affected = new Set(context.modules)
  const affectedSources = affectedSystems.flatMap((entry) => {
    const source = state.systemSources.find(candidate => candidate.entry === entry)
    return source === undefined ? [] : [source]
  })
  const previousSystems = new Map(affectedSources.map(source => [
    source.entry,
    state.systemsByEntry.get(source.entry),
  ]))

  if (affectedSources.length > 0) {
    try {
      const systems = await state.evaluateConfiguredSystems(affectedSources)
      for (const [index, system] of systems.entries()) {
        const source = affectedSources[index]
        const previous = source === undefined ? undefined : previousSystems.get(source.entry)
        if (
          previous !== undefined
          && getRuntimeIdentity(previous.portable) !== getRuntimeIdentity(system.portable)
        ) {
          invalidatedRuntimeIdentities.add(getRuntimeIdentity(previous.portable))
        }
        if (source === undefined)
          continue
        const namespaceRecords = state.runtimeNamespaceIdsByEntry.get(source.entry)
        if (namespaceRecords === undefined)
          continue
        const nextRuntimeId = getRuntimeIdentity(system.portable)
        for (const record of namespaceRecords.values()) {
          const nextIdentity = state.getRuntimeNamespaceIdentity(system, record.moduleFile)
          if (record.runtimeId !== nextRuntimeId || record.identity !== nextIdentity) {
            invalidatedRuntimeNamespaceIds.add(record.id)
            namespaceRecords.delete(record.id)
          }
        }
        if (namespaceRecords.size === 0)
          state.runtimeNamespaceIdsByEntry.delete(source.entry)
      }
    }
    catch (error) {
      // Keep the last accepted generation live; the failed candidate must not
      // invalidate the application's existing runtime or CSS projection.
      failures.push(error)
    }
  }

  const dependents = state.dependentsByFile.get(normalizedFile)
  if (!dependents?.size && affectedSystems.length === 0)
    return undefined

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
    for (const runtimeModule of state.host.findModulesById(id)) {
      state.host.markModuleInvalid(runtimeModule)
      affected.add(runtimeModule)
    }
    for (const runtimeModule of state.host.markModulesInvalidById(id))
      affected.add(runtimeModule)
  }

  if (invalidatedRuntimeNamespaceIds.size > 0) {
    state.host.removeRuntimeModules(invalidatedRuntimeNamespaceIds)
    for (const id of invalidatedRuntimeNamespaceIds)
      state.clearRuntimeNamespaceProjection(id)
  }
  if (invalidatedRuntimeNamespaceIds.size > 0) {
    // Application namespace value/interface changes cannot be applied through
    // the stable system CSS update channel. Reload so every importer resolves
    // the new module-specific namespace and keeps shared runtime identity.
    state.host.sendFullReload()
  }

  for (const dependent of entries) {
    const dependentModules = new Set(state.host.findModulesByFile(dependent))
    const firstModule = dependentModules.values().next().value as object | undefined
    const graphUrl = state.host.getGraphModuleUrl(
      dependent,
      firstModule === undefined ? undefined : state.host.getModuleUrl(firstModule),
    )

    for (const entryModule of await state.host.findModulesByUrl(graphUrl))
      dependentModules.add(entryModule)

    // Vite does not retain a healthy node after a failed first transform. Keep
    // the attempted entry separately so a repaired dependency can materialize
    // the graph address and recover without a server restart.
    if (dependentModules.size === 0 && state.failedStyleEntries.has(dependent))
      dependentModules.add(await state.host.ensureEntryFromUrl(graphUrl))

    for (const dependentModule of dependentModules) {
      state.host.markModuleInvalid(dependentModule)
      affected.add(dependentModule)
    }
  }

  // Bundled edges are intentionally absent from Vite's source graph, so
  // invalidate and re-run each known consumer through the active host pipeline.
  for (const dependent of entries) {
    try {
      await state.host.compileStyle(dependent)
    }
    catch (error) {
      failures.push(error)
    }
  }

  if (failures.length > 0)
    throw failures[0]

  const returnedByUrl = new Map<string, object>()
  const withoutUrl: object[] = []
  for (const module of affected) {
    const url = state.host.getModuleUrl(module)
    if (url === undefined) {
      withoutUrl.push(module)
      continue
    }
    if (!returnedByUrl.has(url))
      returnedByUrl.set(url, module)
  }
  return [...returnedByUrl.values(), ...withoutUrl]
}
