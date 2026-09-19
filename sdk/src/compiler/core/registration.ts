/** Host-neutral acceptance of complete configured-system generations. */

import type { VanityInspectRecord } from '../../introspect/records'
import type { VanityPortableSystem } from '../../system/contract'
import type { CompilerOwnershipMaps, SystemOwnershipUpdate } from './ownership'
import type { EvaluatedSystem, NormalizedSystemSource } from './systems'
import { join } from 'node:path'
import { VanityError } from '../../diagnostics'
import { serializePortableSystem } from '../../system/contract'
import { writeFileArtifacts } from '../publication'
import {
  applySystemOwnershipUpdate,
  prepareNamespaceOwnership,
  prepareSystemOwnership,
  rememberSystemDependencies,
} from './ownership'

export interface PreparedSystem {
  readonly source: NormalizedSystemSource
  readonly evaluated: EvaluatedSystem
  readonly generation: number
  readonly dependencies: readonly string[]
}

export interface SystemRegistrationState {
  readonly ownership: CompilerOwnershipMaps
  readonly namespaceOwners: Map<string, Map<string, VanityPortableSystem>>
  readonly systemGenerationsByEntry: ReadonlyMap<string, number>
  readonly systemDependentsByFile: Map<string, Set<string>>
  readonly readinessFailures: Map<string, unknown>
  readonly recordsByFile: Map<string, VanityInspectRecord[]>
}

export interface SystemRegistrationOptions {
  readonly root: string
  readonly artifactDirectory: string
  readonly virtualExtension: string
  readonly state: SystemRegistrationState
}

export interface SystemRegistrationResult {
  readonly systems: readonly EvaluatedSystem[]
  readonly ownershipUpdate?: SystemOwnershipUpdate
  /** False means an already-accepted/newer generation won without a swap. */
  readonly committed: boolean
}

export type RegisterSystemCandidates = (
  candidates: readonly PreparedSystem[],
  options: SystemRegistrationOptions,
) => Promise<SystemRegistrationResult>

/** Serialize accepted-generation swaps without coupling ownership to a host. */
export function createSystemRegistrationQueue(): RegisterSystemCandidates {
  let commitTail: Promise<void> = Promise.resolve()

  return (candidates, options) => {
    const commit = commitTail
      .catch(() => {})
      .then(() => applySystemCandidates(candidates, options))
    commitTail = commit.then(() => {}, () => {})
    return commit
  }
}

function applySystemCandidates(
  candidates: readonly PreparedSystem[],
  options: SystemRegistrationOptions,
): Promise<SystemRegistrationResult> {
  const { state } = options
  const ordered = [...candidates].sort((left, right) =>
    left.source.entry.localeCompare(right.source.entry))
  const isCurrent = (candidate: PreparedSystem) =>
    state.systemGenerationsByEntry.get(candidate.source.entry) === candidate.generation
  const getCurrentSystems = () => ordered.map(candidate =>
    state.ownership.systemsByEntry.get(candidate.source.entry))

  if (ordered.some(candidate => !isCurrent(candidate))) {
    const accepted = getCurrentSystems()
    if (accepted.every((system): system is EvaluatedSystem => system !== undefined)) {
      return Promise.resolve({
        systems: candidates.map(candidate => state.ownership.systemsByEntry.get(candidate.source.entry)!),
        committed: false,
      })
    }
    return Promise.reject(createSupersededError(ordered[0]?.source.entry))
  }

  // Validate the batch against one snapshot with every replaced owner removed.
  const nextNamespaces = prepareNamespaceOwnership(state.namespaceOwners, ordered)
  const ownershipUpdate = prepareSystemOwnership(
    state.ownership,
    ordered,
    options.root,
    options.virtualExtension,
  )
  // The local restoration index is keyed by compatibility. If several
  // equivalent owners differ only in documentation/provenance, persist one
  // deterministic representative; owner-specific inspection records remain
  // separate in recordsByFile and the manifest.
  const canonicalSystems = new Map<string, EvaluatedSystem>()
  for (const [, system] of [...ownershipUpdate.nextSystems]
    .sort(([left], [right]) => left.localeCompare(right))) {
    const compatibility = system.portable.identities.compatibility
    if (!canonicalSystems.has(compatibility))
      canonicalSystems.set(compatibility, system)
  }
  const artifacts = [...canonicalSystems].map(([compatibility, system]) => ({
    file: join(options.artifactDirectory, 'systems', `${compatibility}.json`),
    contents: serializePortableSystem(system.portable),
  }))

  return writeFileArtifacts(artifacts, () => ordered.every(isCurrent), () => {
    // The publication helper invokes this synchronous swap only after every
    // artifact is ready and this complete generation remains current.
    state.namespaceOwners.clear()
    for (const [key, owners] of nextNamespaces)
      state.namespaceOwners.set(key, owners)
    applySystemOwnershipUpdate(state.ownership, ownershipUpdate)

    for (const candidate of ordered) {
      rememberSystemDependencies(
        candidate.source,
        candidate.dependencies,
        state.systemDependentsByFile,
      )
      state.readinessFailures.delete(candidate.source.entry)
      state.recordsByFile.set(
        candidate.source.entry,
        candidate.evaluated.records.length > 0
          ? candidate.evaluated.records
          : [createSystemRecordFromPortable(candidate.evaluated.portable)],
      )
    }
  }).then((published) => {
    if (!published) {
      const accepted = getCurrentSystems()
      if (accepted.every((system): system is EvaluatedSystem => system !== undefined)) {
        return {
          systems: candidates.map(candidate => state.ownership.systemsByEntry.get(candidate.source.entry)!),
          committed: false,
        }
      }
      throw createSupersededError(ordered[0]?.source.entry)
    }

    return {
      systems: candidates.map(candidate => state.ownership.systemsByEntry.get(candidate.source.entry)!),
      ownershipUpdate,
      committed: true,
    }
  })
}

function createSupersededError(file: string | undefined): VanityError {
  return new VanityError({
    code: 'VANITY_VITE_BUILD_FAILED',
    message: 'a newer system evaluation completed before publication',
    ...(file === undefined ? {} : { file }),
    fix: 'retry the style or system request after the latest source change has settled',
  })
}

export function createSystemRecordFromPortable(system: VanityPortableSystem): VanityInspectRecord {
  return {
    kind: 'system',
    file: system.source,
    prefix: system.prefix,
    root: system.root,
    ...(system.tokenLayer === undefined ? {} : { tokenLayer: system.tokenLayer }),
    capabilitySignature: system.capabilities.signature,
    supportTarget: system.capabilities.supportTarget,
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
