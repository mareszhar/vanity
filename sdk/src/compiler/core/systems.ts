/** Compiler-owned system source normalization and namespace identity rules. */

import type { VanityCompilerOptions, VanitySystemSource } from '../../config'
import type { VanityInspectRecord } from '../../introspect/records'
import type { VanityInProcessSystemContract, VanityPortableSystem } from '../../system/contract'
import { readFile } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { VanityError } from '../../diagnostics'
import { containsVanityAuthoring } from '../modules/source'
import {
  getExportModuleFilesFromFile,
  normalizeModuleIdentity,
  resolveConfiguredModuleSource,
  resolveModuleIdentity,
} from '../projection/exportNames'
import { normalizePath } from './path'

export interface NormalizedSystemSource {
  /** The spelling selected by the user or adapter, retained for diagnostics. */
  configuredEntry: string
  /** The canonical physical module selected for compiler evaluation. */
  entry: string
  artifact?: string
  packageName?: string
  exportName?: string
  dependencies: Set<string>
}

export interface EvaluatedSystem {
  portable: VanityPortableSystem
  contract: VanityInProcessSystemContract
  exportNames: readonly string[]
  contractExport: string
  /** Compiler-only exports reused while evaluating importing style modules. */
  buildExports: Record<string, unknown>
  /**
   * Export namespace for each module in the configured entry's re-export
   * graph. The namespaces share one evaluation, but remain addressable by
   * their own resolved module identity.
   */
  moduleExports: ReadonlyMap<string, Record<string, unknown>>
  /** Inspection records captured while evaluating and projecting the system. */
  records: VanityInspectRecord[]
  /** Transformed CSS owned by the system identity. */
  css: string
}

/** Generation-local cache for configured-entry export graph facts. */
export interface ConfiguredSystemResolutionCache {
  /** Configured entry → canonical files reached by its static re-export graph. */
  readonly exportedFilesByEntry: Map<string, ReadonlySet<string>>
}

/** Create an empty cache for one resolved compiler configuration generation. */
export function createConfiguredSystemResolutionCache(): ConfiguredSystemResolutionCache {
  return {
    exportedFilesByEntry: new Map(),
  }
}

/** Invalidate cached resolution facts after a graph/configuration change. */
export function clearConfiguredSystemResolutionCache(
  cache: ConfiguredSystemResolutionCache,
): void {
  cache.exportedFilesByEntry.clear()
}

export function normalizeSystemSources(
  input: VanityCompilerOptions['system'],
  root: string,
  resolvedEntries: ReadonlyMap<string, string> = new Map(),
): NormalizedSystemSource[] {
  const values = input === undefined ? [] : Array.isArray(input) ? input : [input]
  return values.map((value) => {
    const source: VanitySystemSource = typeof value === 'string' ? { entry: value } : value
    return {
      configuredEntry: source.entry,
      entry: normalizePath(resolveModuleIdentity(
        resolvedEntries.get(source.entry) ?? normalizeSystemPath(source.entry, root),
        root,
      )),
      ...(source.artifact === undefined
        ? {}
        : { artifact: normalizeSystemPath(source.artifact, root) }),
      ...(source.packageName === undefined ? {} : { packageName: source.packageName }),
      ...(source.exportName === undefined ? {} : { exportName: source.exportName }),
      dependencies: new Set<string>(),
    }
  })
}

function normalizeSystemPath(file: string, root: string): string {
  return normalizePath(resolveConfiguredModuleSource(file, root, 'compiler.system').file)
}

/**
 * Return the canonical static re-export files for one configured entry.
 * The host computes this set once for a graph generation and invalidates it
 * when a configured entry or one of its dependencies changes.
 */
export function getConfiguredSystemModuleFiles(
  system: NormalizedSystemSource,
  root: string,
  cache?: ConfiguredSystemResolutionCache,
): ReadonlySet<string> {
  const cached = cache?.exportedFilesByEntry.get(system.entry)
  if (cached !== undefined)
    return cached

  let files: ReadonlySet<string>
  try {
    files = new Set(getExportModuleFilesFromFile(system.entry, root))
  }
  catch {
    files = new Set()
  }
  cache?.exportedFilesByEntry.set(system.entry, files)
  return files
}

export interface ConfiguredSystemMembers {
  readonly byFile: Map<string, NormalizedSystemSource>
  readonly basenames: Set<string>
}

/** Compute the authored physical members for one configured graph generation. */
export async function computeConfiguredSystemMembers(
  sources: readonly NormalizedSystemSource[],
  root: string,
  cache: ConfiguredSystemResolutionCache,
  authoredByFile: Map<string, boolean>,
): Promise<ConfiguredSystemMembers> {
  const byFile = new Map<string, NormalizedSystemSource>()
  const basenames = new Set<string>()

  for (const source of sources) {
    for (const file of getConfiguredSystemModuleFiles(source, root, cache)) {
      const canonicalFile = normalizePath(normalizeModuleIdentity(file))
      let authored = authoredByFile.get(canonicalFile)
      if (authored === undefined) {
        try {
          authored = containsVanityAuthoring(await readFile(canonicalFile, 'utf8'), canonicalFile)
        }
        catch {
          // A file Vite resolved but Vanity cannot read remains the host's
          // ordinary load error rather than becoming an owned projection.
          authored = false
        }
        authoredByFile.set(canonicalFile, authored)
      }
      if (!authored)
        continue

      byFile.set(canonicalFile, source)
      basenames.add(basename(canonicalFile))
    }
  }

  return { basenames, byFile }
}

/** Return physical member IDs added to or removed from a configured graph. */
export function computeConfiguredSystemMemberChanges(
  previous: Iterable<string>,
  next: Iterable<string>,
): Set<string> {
  const previousFiles = new Set(previous)
  const nextFiles = new Set(next)
  return new Set([
    ...[...previousFiles].filter(file => !nextFiles.has(file)),
    ...[...nextFiles].filter(file => !previousFiles.has(file)),
  ])
}

export function assertFreshPortablePair(
  source: NormalizedSystemSource,
  build: VanityPortableSystem,
  portable: VanityPortableSystem,
  owner: string,
): void {
  const mismatches = (Object.keys(build.identities) as Array<keyof typeof build.identities>)
    .filter(kind => build.identities[kind] !== portable.identities[kind])
  if (mismatches.length === 0)
    return

  throw new VanityError({
    code: 'VANITY_VITE_BUILD_FAILED',
    message: `the build JS and portable system artifact for package '${owner}' are stale`,
    file: source.artifact,
    detail: mismatches.map(kind =>
      `${kind}: build ${build.identities[kind]} · portable ${portable.identities[kind]}`),
    fix: `rebuild '${owner}' so its system JS and portable JSON are published from the same source state`,
  })
}

function getNamespaceKey(system: VanityPortableSystem): string {
  return `${system.prefix}\0${system.root}\0${system.layerRoot}`
}

export function assertNamespaceOwnership(
  owner: string,
  system: VanityPortableSystem,
  owners: Map<string, Map<string, VanityPortableSystem>>,
): void {
  const key = getNamespaceKey(system)
  const namespace = owners.get(key) ?? new Map<string, VanityPortableSystem>()
  for (const [otherOwner, other] of namespace) {
    if (
      otherOwner !== owner
      && other.identities.css !== system.identities.css
    ) {
      throw new VanityError({
        code: 'VANITY_VITE_BUILD_FAILED',
        message: `two systems claim CSS namespace '${system.prefix}' at '${system.root}' with different output`,
        file: system.source,
        detail: [
          `${otherOwner}: ${other.identities.css}`,
          `${owner}: ${system.identities.css}`,
        ],
        fix: 'give the systems distinct prefix/root ownership, or install semantically identical package builds',
      })
    }
  }
  namespace.set(owner, system)
  owners.set(key, namespace)
}

/** Clone namespace state so a candidate can be validated before publication. */
export function cloneNamespaceOwners(
  owners: ReadonlyMap<string, ReadonlyMap<string, VanityPortableSystem>>,
): Map<string, Map<string, VanityPortableSystem>> {
  return new Map([...owners].map(([key, namespace]) => [key, new Map(namespace)]))
}

/** Remove entries that are about to be replaced from a validation snapshot. */
export function removeNamespaceOwners(
  owners: Map<string, Map<string, VanityPortableSystem>>,
  entries: Iterable<string>,
): void {
  const replacing = new Set(entries)
  for (const [key, namespace] of owners) {
    for (const entry of replacing)
      namespace.delete(entry)
    if (namespace.size === 0)
      owners.delete(key)
  }
}

export function getRuntimeIdentity(system: VanityPortableSystem): string {
  // The generated application backing contains the runtime projection, not
  // build-only compatibility facts such as named-rule CSS fingerprints. A
  // CSS-only rule edit must therefore keep the backing controller stable.
  return system.identities.runtime
}

export function isSameAuthoredFile(left: string, right: string | undefined, root: string): boolean {
  if (right === undefined)
    return false
  // Provenance records file paths, not configured module sources. Their bare
  // `system.ts` spelling remains root-relative inside one compiler graph.
  const normalizeAuthoredPath = (file: string) => normalizePath(isAbsolute(file) ? file : resolve(root, file))
  return normalizeAuthoredPath(left) === normalizeAuthoredPath(right)
}
