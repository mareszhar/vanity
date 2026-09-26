/** Installed packages that reach Vanity, and the Vite declarations that route them through it. */

import type { Buffer } from 'node:buffer'
import type { UserConfig } from 'vite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  findDepPkgJsonPath,
  isDepExcluded,
  isDepExternaled,
  isDepIncluded,
  isDepNoExternaled,
  pkgNeedsOptimization,
} from 'vitefu'
import { VanityError } from '../../diagnostics'

const vanityPackageName = '@mszr/vanity'
const lockfileNames = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb'] as const
const declarationCacheName = 'source-packages.json'

interface PackageJson {
  name?: unknown
  version?: unknown
  private?: unknown
  type?: unknown
  module?: unknown
  main?: unknown
  exports?: unknown
  dependencies?: unknown
  peerDependencies?: unknown
  devDependencies?: unknown
}

interface PackageNode {
  readonly path: string
  readonly packageJson: PackageJson
  readonly dependencies: Map<string, string>
  readonly directVanityDependency: boolean
}

export interface DeclaredPackageSet {
  /** Package names whose dependency graph reaches Vanity. */
  readonly names: ReadonlySet<string>
  /** Declared package names whose selected package entry is CommonJS. */
  readonly commonJsNames: ReadonlySet<string>
  /** Deep CommonJS includes required below declared packages. */
  readonly optimizeDepsIncludes: ReadonlySet<string>
  /** Dependencies below declared packages that SSR externalizes in development. */
  readonly ssrExternalNames: ReadonlySet<string>
}

interface VitePackageDeclarations {
  readonly optimizeDeps: {
    include: string[]
    exclude: string[]
  }
  readonly ssr: {
    noExternal: string[]
    external: string[]
  }
}

/** Read the installed SDK version used to invalidate persisted package roles. */
export function readSdkVersion(): string {
  const metadata = createRequire(import.meta.url)(`${vanityPackageName}/package.json`) as { version?: unknown }
  if (typeof metadata.version !== 'string')
    throw new TypeError('Vanity package metadata does not contain a version.')
  return metadata.version
}

interface PersistedPackageSet {
  readonly version: 1
  readonly key: string
  readonly names: string[]
  readonly commonJsNames: string[]
  readonly optimizeDepsIncludes: string[]
  readonly ssrExternalNames: string[]
}

/**
 * Create a per-plugin declaration loader. A plugin instance shares the in-memory
 * result across Vite's client and SSR hosts; later starts can reuse the small
 * on-disk result when their lockfile, root manifest, workspace root, and SDK
 * version match.
 */
export function createDeclaredPackageLoader(
  sdkVersion: string,
): (root: string, workspaceRoot?: string) => Promise<DeclaredPackageSet> {
  const pendingByRoot = new Map<string, Promise<DeclaredPackageSet>>()

  return (root, workspaceRoot = root) => {
    const normalizedRoot = resolve(root)
    const normalizedWorkspaceRoot = resolve(workspaceRoot)
    const cacheId = `${normalizedRoot}\0${normalizedWorkspaceRoot}`
    let pending = pendingByRoot.get(cacheId)
    if (pending === undefined) {
      pending = loadDeclaredPackages(normalizedRoot, normalizedWorkspaceRoot, sdkVersion)
      pendingByRoot.set(cacheId, pending)
    }
    return pending
  }
}

/**
 * Apply Vanity's package roles to Vite's optimizer and SSR configuration.
 * The role and all host declarations come from one complete installed-graph
 * walk, including peer dependency edges.
 */
export async function createVitePackageDeclarations(
  root: string,
  options: {
    readonly isBuild: boolean
    readonly userConfig: UserConfig
    readonly getDeclaredPackages: (root: string, workspaceRoot?: string) => Promise<DeclaredPackageSet>
    readonly workspaceRoot?: string
  },
): Promise<{
  readonly declarations: VitePackageDeclarations
  readonly declaredPackages: DeclaredPackageSet
}> {
  const declaredPackages = await options.getDeclaredPackages(
    resolve(root),
    options.workspaceRoot === undefined ? resolve(root) : resolve(options.workspaceRoot),
  )
  const declarations: VitePackageDeclarations = {
    optimizeDeps: { include: [], exclude: [] },
    ssr: { noExternal: [], external: [] },
  }

  const optimizeIncludes = options.userConfig.optimizeDeps?.include ?? []
  const optimizeExcludes = options.userConfig.optimizeDeps?.exclude ?? []
  const ssrExternals = options.userConfig.ssr?.external ?? []
  const ssrNoExternal = options.userConfig.ssr?.noExternal ?? []

  // This walk decides every package role and declaration; vitefu's matchers
  // apply consumer overrides with Vite's own semantics.
  for (const packageName of declaredPackages.names) {
    if (!isDepIncluded(packageName, optimizeIncludes)
      && !declarations.optimizeDeps.exclude.includes(packageName)) {
      declarations.optimizeDeps.exclude.push(packageName)
    }
    if (!declaredPackages.commonJsNames.has(packageName)
      && !isDepExternaled(packageName, ssrExternals)
      && !declarations.ssr.noExternal.includes(packageName)) {
      declarations.ssr.noExternal.push(packageName)
    }
  }
  for (const include of declaredPackages.optimizeDepsIncludes) {
    if (!isDepExcluded(include, optimizeExcludes)
      && !isDepIncluded(include, optimizeIncludes)
      && !declarations.optimizeDeps.include.includes(include)) {
      declarations.optimizeDeps.include.push(include)
    }
  }
  if (!options.isBuild) {
    for (const name of declaredPackages.ssrExternalNames) {
      if (!isDepNoExternaled(name, ssrNoExternal)
        && !isDepExternaled(name, ssrExternals)
        && !declarations.ssr.external.includes(name)) {
        declarations.ssr.external.push(name)
      }
    }
  }
  declarations.optimizeDeps.include.sort()
  declarations.ssr.external.sort()
  declarations.optimizeDeps.exclude.sort()
  declarations.ssr.noExternal.sort()

  return { declarations, declaredPackages }
}

/** Find declared package names used by explicit optimizer or SSR overrides. */
export function findDeclaredPackageOverrides(
  entries: readonly string[],
  declaredNames: ReadonlySet<string>,
): Array<{ readonly packageName: string, readonly entry: string }> {
  const overrides: Array<{ packageName: string, entry: string }> = []

  for (const entry of entries) {
    const target = entry.slice(entry.lastIndexOf('>') + 1).trim()
    const matchingNames = [...declaredNames].filter(name => matchesPackageTarget(target, name))
    for (const packageName of matchingNames)
      overrides.push({ packageName, entry })
  }

  return overrides
}

/** Keep only delegate includes that do not target packages Vanity declares. */
export function filterDeclaredPackageIncludes(
  includes: readonly string[],
  declaredNames: ReadonlySet<string>,
): string[] {
  return includes.filter((include) => {
    const target = include.slice(include.lastIndexOf('>') + 1).trim()
    return ![...declaredNames].some(name => matchesPackageTarget(target, name))
  })
}

async function loadDeclaredPackages(
  root: string,
  workspaceRoot: string,
  sdkVersion: string,
): Promise<DeclaredPackageSet> {
  const [rootManifest, lockfile] = await Promise.all([
    readOptionalFile(join(root, 'package.json')),
    findNearestLockfile(root, workspaceRoot),
  ])
  const cacheKey = lockfile === undefined
    ? undefined
    : createCacheKey(rootManifest ?? '', workspaceRoot, sdkVersion, lockfile.name, lockfile.contents)
  const cachePath = join(root, 'node_modules', '.vanity', declarationCacheName)

  // No lockfile means fixtures and package-manager-less consumers may rewrite
  // node_modules without changing a reliable input. Never read or write a
  // persistent set in that case.
  if (cacheKey !== undefined) {
    const cached = await readDeclarationCache(cachePath, cacheKey)
    if (cached !== undefined)
      return cached
  }

  const declaredPackages = await walkDeclaredPackageGraph(root, rootManifest, workspaceRoot)
  if (cacheKey !== undefined) {
    await writeDeclarationCache(cachePath, {
      version: 1,
      key: cacheKey,
      names: [...declaredPackages.names].sort(),
      commonJsNames: [...declaredPackages.commonJsNames].sort(),
      optimizeDepsIncludes: [...declaredPackages.optimizeDepsIncludes].sort(),
      ssrExternalNames: [...declaredPackages.ssrExternalNames].sort(),
    })
  }
  return declaredPackages
}

async function walkDeclaredPackageGraph(
  root: string,
  rootManifest: string | undefined,
  workspaceRoot: string,
): Promise<DeclaredPackageSet> {
  if (rootManifest === undefined)
    return createEmptyDeclaredPackageSet()

  const parsedRoot = parsePackageJson(rootManifest, join(root, 'package.json'))
  const nodes = new Map<string, PackageNode>()
  const queue: string[] = []
  const rootPackageEdges = new Map<string, string>()
  const queuedPaths = new Set<string>()
  const packageJsonByPath = new Map<string, Promise<PackageJson>>()
  const readPackage = (path: string): Promise<PackageJson> => {
    let pending = packageJsonByPath.get(path)
    if (pending === undefined) {
      pending = readFile(path, 'utf8').then(contents => parsePackageJson(contents, path))
      packageJsonByPath.set(path, pending)
    }
    return pending
  }

  // Start from every package the application declares: dependencies,
  // development dependencies, and peers, since an application may install an
  // integration host while declaring it as a peer.
  const rootDependencyNames = extractPackageNames(
    parsedRoot.dependencies,
    parsedRoot.devDependencies,
    parsedRoot.peerDependencies,
  )
  const rootDependencyPaths = await Promise.all(rootDependencyNames.map(name => findDepPkgJsonPath(name, root)))
  for (const [index, packageJsonPath] of rootDependencyPaths.entries()) {
    if (packageJsonPath === undefined)
      continue
    const path = resolve(packageJsonPath)
    rootPackageEdges.set(rootDependencyNames[index]!, path)
    if (!queuedPaths.has(path)) {
      queuedPaths.add(path)
      queue.push(path)
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const path = resolve(queue[cursor]!)
    if (nodes.has(path))
      continue

    const packageJson = await readPackage(path)
    const includeWorkspaceDevDependencies = isPrivateWorkspacePackage(path, packageJson, workspaceRoot)
    const dependencyRecords = [packageJson.dependencies, packageJson.peerDependencies]
    if (includeWorkspaceDevDependencies)
      dependencyRecords.push(packageJson.devDependencies)
    const dependencies = extractPackageNames(...dependencyRecords)
    const dependencyResults = await Promise.all(dependencies.map(async (dependency) => {
      const dependencyPath = await findDepPkgJsonPath(dependency, dirname(path))
      if (dependencyPath === undefined)
        return undefined
      const normalizedPath = resolve(dependencyPath)
      const dependencyPackageJson = await readPackage(normalizedPath)
      return { path: normalizedPath, name: dependencyPackageJson.name }
    }))
    const dependencyPaths = new Map(dependencies.flatMap((dependency, index) => {
      const result = dependencyResults[index]
      return result === undefined ? [] : [[dependency, result.path] as const]
    }))
    const directVanityDependency = dependencies.includes(vanityPackageName)
      || dependencyResults.some(result => result?.name === vanityPackageName)

    nodes.set(path, {
      path,
      packageJson,
      dependencies: dependencyPaths,
      directVanityDependency,
    })
    for (const dependencyPath of dependencyPaths.values()) {
      if (!queuedPaths.has(dependencyPath)) {
        queuedPaths.add(dependencyPath)
        queue.push(dependencyPath)
      }
    }
  }

  // Propagate the role backwards to a fixed point. This handles dependency
  // cycles without recursive memoization and makes every depth use one rule.
  const declaredPaths = new Set<string>()
  for (const node of nodes.values()) {
    if (node.packageJson.name !== vanityPackageName && node.directVanityDependency)
      declaredPaths.add(node.path)
  }

  let changed = true
  while (changed) {
    changed = false
    for (const node of nodes.values()) {
      if (node.packageJson.name === vanityPackageName || declaredPaths.has(node.path))
        continue
      if ([...node.dependencies.values()].some(dependency => declaredPaths.has(dependency))) {
        declaredPaths.add(node.path)
        changed = true
      }
    }
  }

  const names = new Set<string>()
  const commonJsNames = new Set<string>()
  for (const path of declaredPaths) {
    const node = nodes.get(path)!
    if (typeof node.packageJson.name !== 'string' || node.packageJson.name === vanityPackageName)
      continue
    names.add(node.packageJson.name)
    if (await pkgNeedsOptimization(node.packageJson, path))
      commonJsNames.add(node.packageJson.name)
  }

  const optimizeDepsIncludes = new Set<string>()
  const ssrExternalNames = new Set<string>()
  const walkDeclaredDependencies = async (
    nodePath: string,
    packageChain: readonly string[],
    visitedPaths: ReadonlySet<string>,
  ): Promise<void> => {
    const node = nodes.get(nodePath)
    if (node === undefined)
      return

    await Promise.all([...node.dependencies].map(async ([specifier, dependencyPath]) => {
      if (visitedPaths.has(dependencyPath))
        return
      const dependency = nodes.get(dependencyPath)
      if (dependency === undefined)
        return
      if (declaredPaths.has(dependencyPath)) {
        await walkDeclaredDependencies(
          dependencyPath,
          [...packageChain, specifier],
          new Set([...visitedPaths, dependencyPath]),
        )
        return
      }

      if (await pkgNeedsOptimization(dependency.packageJson, dependencyPath))
        optimizeDepsIncludes.add([...packageChain, specifier].join(' > '))
      ssrExternalNames.add(specifier)
    }))
  }

  for (const [specifier, dependencyPath] of rootPackageEdges) {
    if (declaredPaths.has(dependencyPath))
      await walkDeclaredDependencies(dependencyPath, [specifier], new Set([dependencyPath]))
  }

  return { names, commonJsNames, optimizeDepsIncludes, ssrExternalNames }
}

function isPrivateWorkspacePackage(path: string, packageJson: PackageJson, workspaceRoot: string): boolean {
  if (packageJson.private !== true || /[/\\]node_modules[/\\]/.test(path))
    return false
  return isPathWithin(workspaceRoot, path)
}

function isPathWithin(root: string, path: string): boolean {
  const fromRoot = relative(root, path)
  return fromRoot === '' || (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
}

function matchesPackageTarget(target: string, packageName: string): boolean {
  const [first, second] = target.split('/')
  const targetPackageName = first?.startsWith('@')
    ? second === undefined ? undefined : `${first}/${second}`
    : first
  return targetPackageName === packageName
}

function extractPackageNames(...dependencyRecords: unknown[]): string[] {
  return [...new Set(dependencyRecords.flatMap(record =>
    isRecord(record) ? Object.keys(record) : [],
  ))].sort()
}

function parsePackageJson(contents: string, file: string): PackageJson {
  try {
    const parsed: unknown = JSON.parse(contents)
    if (!isRecord(parsed))
      throw new TypeError('expected a JSON object')
    return parsed as PackageJson
  }
  catch (error) {
    throw new VanityError({
      code: 'VANITY_VITE_BUILD_FAILED',
      message: `Unable to parse package metadata at ${file}.`,
      path: ['package.json', file],
      fix: 'reinstall dependencies to restore the package metadata, then restart Vite',
    }, { cause: error })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  }
  catch (error) {
    if (isMissingFileError(error))
      return undefined
    throw error
  }
}

async function findNearestLockfile(root: string, workspaceRoot: string): Promise<{ name: string, contents: Buffer } | undefined> {
  let directory = resolve(root)
  const workspace = resolve(workspaceRoot)
  // Vite's workspace root bounds the project search. A lockfile belonging to
  // an unrelated parent directory must not make an isolated fixture persistent.
  const boundary = isPathWithin(workspace, directory) ? workspace : directory
  while (true) {
    for (const name of lockfileNames) {
      try {
        const contents = await readFile(join(directory, name))
        return { name, contents }
      }
      catch (error) {
        if (!isMissingFileError(error))
          throw error
      }
    }
    if (directory === boundary)
      return undefined
    const parent = dirname(directory)
    if (parent === directory)
      return undefined
    directory = parent
  }
}

function createCacheKey(
  rootManifest: string,
  workspaceRoot: string,
  sdkVersion: string,
  lockfileName: string,
  lockfileContents: Buffer,
): string {
  return createHash('sha256')
    .update(sdkVersion)
    .update('\0')
    .update(workspaceRoot)
    .update('\0')
    .update(rootManifest)
    .update('\0')
    .update(lockfileName)
    .update('\0')
    .update(lockfileContents)
    .digest('hex')
}

async function readDeclarationCache(path: string, key: string): Promise<DeclaredPackageSet | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (!isRecord(parsed)
      || parsed.version !== 1
      || parsed.key !== key
      || !isStringArray(parsed.names)
      || !isStringArray(parsed.commonJsNames)
      || !isStringArray(parsed.optimizeDepsIncludes)
      || !isStringArray(parsed.ssrExternalNames)) {
      return undefined
    }
    return {
      names: new Set(parsed.names),
      commonJsNames: new Set(parsed.commonJsNames),
      optimizeDepsIncludes: new Set(parsed.optimizeDepsIncludes),
      ssrExternalNames: new Set(parsed.ssrExternalNames),
    }
  }
  catch (error) {
    if (isMissingFileError(error) || error instanceof SyntaxError)
      return undefined
    throw error
  }
}

async function writeDeclarationCache(path: string, cache: PersistedPackageSet): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(cache)}\n`)
    await rename(temporaryPath, path)
  }
  finally {
    await rm(temporaryPath, { force: true })
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string')
}

function createEmptyDeclaredPackageSet(): DeclaredPackageSet {
  return {
    names: new Set(),
    commonJsNames: new Set(),
    optimizeDepsIncludes: new Set(),
    ssrExternalNames: new Set(),
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
