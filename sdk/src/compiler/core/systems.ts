/** Compiler-owned system source normalization and namespace identity rules. */

import type { VanityCompilerOptions, VanitySystemSource } from '../../config'
import type { VanityInspectRecord } from '../../introspect/records'
import type { VanityInProcessSystemContract, VanityPortableSystem } from '../../system/contract'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { VanityError } from '../../diagnostics'
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
  /** Resolved module identity → configured owner, including safe misses. */
  readonly systemMatchesByFile: Map<string, NormalizedSystemSource | null>
  /** Configured entry → canonical files reached by its static re-export graph. */
  readonly exportedFilesByEntry: Map<string, ReadonlySet<string>>
}

/** A host-resolved module request matched to one configured system owner. */
export interface ResolvedConfiguredSystemImport {
  readonly system: NormalizedSystemSource
  /** Canonical physical module whose namespace was requested. */
  readonly moduleFile: string
}

/** Create an empty cache for one resolved compiler configuration generation. */
export function createConfiguredSystemResolutionCache(): ConfiguredSystemResolutionCache {
  return {
    systemMatchesByFile: new Map(),
    exportedFilesByEntry: new Map(),
  }
}

/** Invalidate cached resolution facts after a graph/configuration change. */
export function clearConfiguredSystemResolutionCache(
  cache: ConfiguredSystemResolutionCache,
): void {
  cache.systemMatchesByFile.clear()
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

/** Resolve an import to one of the explicitly configured system sources. */
export function resolveConfiguredSystemImport(
  source: string,
  importer: string | undefined,
  systems: readonly NormalizedSystemSource[],
  root: string,
  cache?: ConfiguredSystemResolutionCache,
): ResolvedConfiguredSystemImport | undefined {
  if (systems.length === 0 || source.startsWith('\0') || source.startsWith('virtual:'))
    return undefined
  const clean = source.replace(/[?#].*$/, '')
  const candidates: string[] = []
  if (isAbsolute(clean)) {
    // Vite also presents root-relative URLs as `/src/foo`. Try that host
    // spelling before treating the value as a physical filesystem path.
    if (clean.startsWith('/') && !clean.startsWith('//'))
      candidates.push(resolveModuleIdentity(join(root, clean.slice(1)), root))
    candidates.push(resolveModuleIdentity(clean, root))
  }
  else if (clean.startsWith('.') && importer) {
    candidates.push(resolveModuleIdentity(resolve(dirname(importer.replace(/[?#].*$/, '')), clean), root))
  }
  else {
    try {
      candidates.push(normalizeModuleIdentity(createRequire(importer ?? join(root, 'package.json')).resolve(clean)))
    }
    catch {
      return undefined
    }
  }
  for (const candidate of candidates) {
    const match = findConfiguredSystemInModuleGraph(candidate, systems, root, cache)
    if (match)
      return { system: match, moduleFile: candidate }
  }
  return undefined
}

/** Match a host-resolved module id to one configured system physical identity. */
/**
 * Match either the resolved module itself or a configured entry's static
 * re-export graph. The bundler remains responsible for the initial
 * resolution; this small graph read only explains a barrel's role without
 * treating an unrelated consumer authoring barrel as the configured system.
 */
export function findConfiguredSystemInModuleGraph(
  resolved: string | undefined,
  systems: readonly NormalizedSystemSource[],
  root: string,
  cache?: ConfiguredSystemResolutionCache,
): NormalizedSystemSource | undefined {
  if (resolved === undefined || systems.length === 0)
    return undefined

  const canonical = normalizeModuleIdentity(resolved.replace(/[?#].*$/, ''))
  if (cache?.systemMatchesByFile.has(canonical))
    return cache.systemMatchesByFile.get(canonical) ?? undefined

  const direct = systems.find(system => system.entry === canonical)
  if (direct !== undefined) {
    cache?.systemMatchesByFile.set(canonical, direct)
    return direct
  }

  for (const system of systems) {
    const exportedFiles = getConfiguredSystemModuleFiles(system, root, cache)
    if (exportedFiles.has(canonical)) {
      cache?.systemMatchesByFile.set(canonical, system)
      return system
    }
  }
  cache?.systemMatchesByFile.set(canonical, null)
  return undefined
}

/**
 * Return the canonical static re-export files for one configured entry.
 * Missing/unreadable graphs are safe misses for this generation and are
 * retried after the host invalidates the cache for a source change.
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
