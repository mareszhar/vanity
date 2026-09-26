/** Compiler-owned dependency fan-out and stable CSS HMR updates. */

import type { EvaluatedSystem, NormalizedSystemSource } from '../core/systems'
import type { CompilerHmrHost } from './host'
import { normalizePath } from '../core/path'
import { getRuntimeIdentity } from '../core/systems'

export interface StyleHotUpdateContext {
  readonly file: string
  readonly modules: readonly object[]
}

/** A physical system-member projection last served in one host environment. */
export interface RuntimeMemberHmrRecord {
  readonly moduleFile: string
  readonly target: 'browser' | 'ssr'
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
  readonly runtimeMemberIdsByEntry: Map<string, Map<string, RuntimeMemberHmrRecord>>
  readonly memberSetChanges?: ReadonlySet<string>
  readonly getRuntimeMemberIdentity: (system: EvaluatedSystem, moduleFile: string) => string | undefined
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
  const invalidatedRuntimeMemberFiles = new Set(state.memberSetChanges ?? [])
  const projectedMemberFiles = new Set<string>()
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
        const memberRecords = state.runtimeMemberIdsByEntry.get(source.entry)
        if (memberRecords === undefined)
          continue
        const nextRuntimeId = getRuntimeIdentity(system.portable)
        for (const [key, record] of memberRecords) {
          if (state.memberSetChanges?.has(record.moduleFile)) {
            // A departing member is absent from this generation, so it has no
            // namespace identity to compare. The membership transition below
            // invalidates it and reloads the application without this check.
            memberRecords.delete(key)
            continue
          }
          projectedMemberFiles.add(record.moduleFile)
          const nextIdentity = state.getRuntimeMemberIdentity(system, record.moduleFile)
          if (record.runtimeId !== nextRuntimeId || record.identity !== nextIdentity) {
            invalidatedRuntimeMemberFiles.add(record.moduleFile)
            memberRecords.delete(key)
          }
        }
        if (memberRecords.size === 0)
          state.runtimeMemberIdsByEntry.delete(source.entry)
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

  const suppressedMemberModules = new Set<object>()
  for (const file of projectedMemberFiles) {
    for (const module of state.host.findModulesByFile(file))
      suppressedMemberModules.add(module)
  }
  for (const file of invalidatedRuntimeMemberFiles) {
    for (const module of state.host.findModulesByFile(file)) {
      state.host.markModuleInvalid(module)
      suppressedMemberModules.add(module)
    }
  }
  if (invalidatedRuntimeMemberFiles.size > 0) {
    // The changed projection belongs to a real graph node. Invalidate it in
    // every environment, then let the browser re-request the physical ID.
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

  // A member-set transition already sent the one full reload needed to
  // replace application bindings. Returning changed modules as well would
  // let Vite propagate a second ordinary update for the same source event.
  if (invalidatedRuntimeMemberFiles.size > 0)
    return []

  const returnedByUrl = new Map<string, object>()
  const withoutUrl: object[] = []
  for (const module of affected) {
    if (suppressedMemberModules.has(module))
      continue
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
