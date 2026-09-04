/** Compiler-owned system source normalization and namespace identity rules. */

import type { VanityCompilerOptions, VanitySystemSource } from '../../config'
import type { VanityPortableSystem } from '../../system/contract'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { VanityError } from '../../diagnostics'
import { resolveConfiguredModuleSource } from '../projection/exportNames'
import { normalizePath } from './path'

export interface NormalizedSystemSource {
  entry: string
  artifact?: string
  packageName?: string
  exportName?: string
  dependencies: Set<string>
}

export interface EvaluatedSystem {
  portable: VanityPortableSystem
  exportNames: readonly string[]
  contractExport: string
  /** Compiler-only exports reused while evaluating importing style modules. */
  buildExports: Record<string, unknown>
}

export function normalizeSystemSources(
  input: VanityCompilerOptions['system'],
  root: string,
): NormalizedSystemSource[] {
  const values = input === undefined ? [] : Array.isArray(input) ? input : [input]
  return values.map((value) => {
    const source: VanitySystemSource = typeof value === 'string' ? { entry: value } : value
    return {
      entry: normalizeSystemPath(source.entry, root),
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
): NormalizedSystemSource | undefined {
  if (source.startsWith('\0') || source.startsWith('virtual:'))
    return undefined
  const clean = source.replace(/[?#].*$/, '')
  let resolved: string
  if (isAbsolute(clean)) {
    resolved = normalizePath(clean)
  }
  else if (clean.startsWith('/') && !clean.startsWith('//')) {
    resolved = normalizePath(join(root, clean.slice(1)))
  }
  else if (clean.startsWith('.') && importer) {
    resolved = normalizePath(resolve(dirname(importer.replace(/[?#].*$/, '')), clean))
  }
  else {
    try {
      resolved = normalizePath(createRequire(importer ?? join(root, 'package.json')).resolve(clean))
    }
    catch {
      return undefined
    }
  }
  return systems.find(system =>
    system.entry === resolved
    || system.entry.replace(/\.[cm]?[jt]sx?$/, '') === resolved)
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

export function getRuntimeIdentity(system: VanityPortableSystem): string {
  return `${system.identities.compatibility}:${system.identities.runtime}`
}

export function isSameAuthoredFile(left: string, right: string | undefined, root: string): boolean {
  if (right === undefined)
    return false
  // Provenance records file paths, not configured module sources. Their bare
  // `system.ts` spelling remains root-relative inside one compiler graph.
  const normalizeAuthoredPath = (file: string) => normalizePath(isAbsolute(file) ? file : resolve(root, file))
  return normalizeAuthoredPath(left) === normalizeAuthoredPath(right)
}
