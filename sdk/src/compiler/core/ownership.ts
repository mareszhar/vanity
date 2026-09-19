/** Host-neutral ownership and generation operations for compiler artifacts. */

import type { VanityPortableSystem } from '../../system/contract'
import type { EvaluatedSystem, NormalizedSystemSource } from './systems'
import { getSystemCssVirtualId, replaceEntryVirtualIds } from '../hmr/state'
import { normalizePath } from './path'
import {
  assertNamespaceOwnership,
  cloneNamespaceOwners,
  getRuntimeIdentity,
  removeNamespaceOwners,
} from './systems'

export interface CompilerOwnershipMaps {
  readonly cssByVirtualId: Map<string, string>
  readonly cssOwnersByVirtualId: Map<string, Set<string>>
  readonly systemCssVirtualIdsByEntry: Map<string, Set<string>>
  readonly systemsByEntry: Map<string, EvaluatedSystem>
  readonly systemsByRuntimeId: Map<string, EvaluatedSystem>
}

export interface SystemOwnershipCandidate {
  readonly source: NormalizedSystemSource
  readonly evaluated: EvaluatedSystem
}

export interface SystemOwnershipUpdate {
  readonly nextSystems: Map<string, EvaluatedSystem>
  readonly nextSystemCssIds: Map<string, Set<string>>
  readonly nextCss: Map<string, string>
  readonly nextCssOwners: Map<string, Set<string>>
  readonly cssUpdates: readonly { id: string, previous: string | undefined, next: string }[]
  readonly retiredCssIds: ReadonlySet<string>
  readonly pendingCssResponses: ReadonlyMap<string, string>
}

/** Validate a complete replacement set against one shared namespace snapshot. */
export function prepareNamespaceOwnership(
  owners: ReadonlyMap<string, ReadonlyMap<string, VanityPortableSystem>>,
  candidates: readonly SystemOwnershipCandidate[],
): Map<string, Map<string, VanityPortableSystem>> {
  const next = cloneNamespaceOwners(owners)
  removeNamespaceOwners(next, candidates.map(candidate => candidate.source.entry))
  for (const candidate of candidates)
    assertNamespaceOwnership(candidate.source.entry, candidate.evaluated.portable, next)
  return next
}

/** Re-index accepted systems by their runtime-compatible identity. */
function updateRuntimeIndex(
  systemsByEntry: ReadonlyMap<string, EvaluatedSystem>,
  systemsByRuntimeId: Map<string, EvaluatedSystem>,
): void {
  systemsByRuntimeId.clear()
  for (const [, system] of [...systemsByEntry].sort(([left], [right]) => left.localeCompare(right))) {
    const runtimeId = getRuntimeIdentity(system.portable)
    if (!systemsByRuntimeId.has(runtimeId))
      systemsByRuntimeId.set(runtimeId, system)
  }
}

/** Replace a configured system's dependency edges, including its entry/artifact. */
export function rememberSystemDependencies(
  source: NormalizedSystemSource,
  files: Iterable<string>,
  systemDependentsByFile: Map<string, Set<string>>,
): void {
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

/** Replace one style's resolved input edges while retaining failed inputs when requested. */
export function rememberStyleDependencies(
  entry: string,
  files: Iterable<string>,
  preserveKnown: boolean,
  dependenciesByEntry: Map<string, Set<string>>,
  dependentsByFile: Map<string, Set<string>>,
): Set<string> {
  const previous = dependenciesByEntry.get(entry) ?? new Set<string>()
  const next = new Set(preserveKnown ? previous : [])

  for (const file of files) {
    const normalized = normalizePath(file)
    if (normalized !== entry)
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
    const dependents = dependentsByFile.get(dependency) ?? new Set<string>()
    dependents.add(entry)
    dependentsByFile.set(dependency, dependents)
  }

  return next
}

/** Replace a style's configured-system edges without conflating them with source provenance. */
export function rememberStyleSystems(
  entry: string,
  systems: Iterable<string>,
  systemsByStyleEntry: Map<string, Set<string>>,
  styleEntriesBySystem: Map<string, Set<string>>,
): void {
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

/** Prepare the accepted CSS/system maps without mutating the current generation. */
export function prepareSystemOwnership(
  maps: Pick<
    CompilerOwnershipMaps,
    'cssByVirtualId' | 'cssOwnersByVirtualId'
    | 'systemCssVirtualIdsByEntry' | 'systemsByEntry'
  >,
  candidates: readonly SystemOwnershipCandidate[],
  root: string,
  virtualExtension: string,
): SystemOwnershipUpdate {
  const nextSystems = new Map(maps.systemsByEntry)
  const nextSystemCssIds = new Map([...maps.systemCssVirtualIdsByEntry]
    .map(([entry, ids]) => [entry, new Set(ids)] as const))
  const nextCss = new Map(maps.cssByVirtualId)
  const nextCssOwners = new Map([...maps.cssOwnersByVirtualId]
    .map(([id, owners]) => [id, new Set(owners)] as const))
  const pendingCssResponses = new Map<string, string>()
  const cssUpdates: Array<{ id: string, previous: string | undefined, next: string }> = []
  const retiredCssIds = new Set<string>()

  for (const candidate of candidates) {
    const virtualId = getSystemCssVirtualId(
      candidate.evaluated.portable.identities.css,
      root,
      virtualExtension,
    )
    cssUpdates.push({
      id: virtualId,
      previous: maps.cssByVirtualId.get(virtualId),
      next: candidate.evaluated.css,
    })
    nextSystems.set(candidate.source.entry, candidate.evaluated)
    for (const retired of replaceEntryVirtualIds(
      candidate.source.entry,
      new Set([virtualId]),
      nextSystemCssIds,
      nextCss,
      nextCssOwners,
      `system:${candidate.source.entry}`,
      (id, contents) => pendingCssResponses.set(id, contents),
    ))
      retiredCssIds.add(retired)
    nextCss.set(virtualId, candidate.evaluated.css)
  }

  return {
    nextSystems,
    nextSystemCssIds,
    nextCss,
    nextCssOwners,
    cssUpdates,
    retiredCssIds,
    pendingCssResponses,
  }
}

/** Swap a prepared system ownership generation into the accepted maps. */
export function applySystemOwnershipUpdate(
  maps: Pick<
    CompilerOwnershipMaps,
    'cssByVirtualId' | 'cssOwnersByVirtualId'
    | 'systemCssVirtualIdsByEntry' | 'systemsByEntry' | 'systemsByRuntimeId'
  >,
  update: SystemOwnershipUpdate,
): void {
  maps.systemsByEntry.clear()
  for (const [entry, system] of update.nextSystems)
    maps.systemsByEntry.set(entry, system)
  maps.systemCssVirtualIdsByEntry.clear()
  for (const [entry, ids] of update.nextSystemCssIds)
    maps.systemCssVirtualIdsByEntry.set(entry, ids)
  maps.cssByVirtualId.clear()
  for (const [id, css] of update.nextCss)
    maps.cssByVirtualId.set(id, css)
  maps.cssOwnersByVirtualId.clear()
  for (const [id, owners] of update.nextCssOwners)
    maps.cssOwnersByVirtualId.set(id, owners)
  updateRuntimeIndex(maps.systemsByEntry, maps.systemsByRuntimeId)
}
