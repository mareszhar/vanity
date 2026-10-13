/** Request-based Node adaptation of a host's client resolution. */
import type { SourceMapPayload } from 'node:module'
import type { ModuleInputs } from './graph'
import { readFile } from 'node:fs/promises'
import { isBuiltin, SourceMap } from 'node:module'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { VanityError } from '../../diagnostics'
import { findModuleInput } from './graph'

export interface StyleModuleHost {
  readonly resolve: (specifier: string, importer: string) => Promise<{ readonly id: string, readonly external?: boolean | 'absolute' | 'relative' } | null | undefined>
  readonly load: (id: string) => Promise<string | { readonly code: string } | null | undefined>
}

interface PackageMetadata {
  readonly name?: string
  readonly browser?: unknown
  readonly exports?: unknown
}
interface ResolvedPackage {
  readonly directory: string
  readonly metadata: PackageMetadata
}
export interface ResolvedStyleImport {
  readonly specifier: string
  readonly importer: string
  readonly file: string
}

export function getImportedPackageName(request: string): string | undefined {
  if (!/^(?:@[\w.-]+\/[\w.-]+|[\w.-]+)(?:\/|$)/.test(request) || request.startsWith('.') || isBuiltin(request))
    return undefined
  return request.startsWith('@') ? request.split('/').slice(0, 2).join('/') : request.split('/')[0]
}

export function getResolvedPackage(file: string, cache?: Map<string, Promise<ResolvedPackage | undefined>>): Promise<ResolvedPackage | undefined> {
  const directory = dirname(file.replace(/[?#].*$/, ''))
  const existing = cache?.get(directory)
  if (existing !== undefined)
    return existing
  const result = readResolvedPackage(file)
  cache?.set(directory, result)
  return result
}

async function readResolvedPackage(file: string): Promise<ResolvedPackage | undefined> {
  if (!isAbsolute(file))
    return undefined
  let directory = dirname(file.replace(/[?#].*$/, ''))
  for (;;) {
    try {
      return { directory, metadata: JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as PackageMetadata }
    }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw error
    }
    if (directory === parse(directory).root)
      return undefined
    directory = dirname(directory)
  }
}

/** The named package's own browser disable applies to stubs, files and host errors. */
export function isBrowserDisabledPackageRequest(request: string, file: string, pkg: ResolvedPackage | undefined): boolean {
  if (pkg === undefined || pkg.metadata.name === undefined || pkg.metadata.name !== getImportedPackageName(request))
    return false
  const browser = pkg.metadata.browser
  if (browser && typeof browser === 'object' && Object.entries(browser).some(([key, value]) => value === false && resolve(pkg.directory, key) === file))
    return true
  const subpath = request === pkg.metadata.name ? '.' : `.${request.slice(pkg.metadata.name.length)}`
  let exports = pkg.metadata.exports
  if (exports && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some(key => key.startsWith('.'))) {
    const entries = exports as Record<string, unknown>
    const patterns = Object.keys(entries).filter(key => key.includes('*') && subpath.startsWith(key.split('*')[0]!) && subpath.endsWith(key.split('*')[1]!)).sort((a, b) => b.split('*')[0]!.length - a.split('*')[0]!.length || b.length - a.length)
    exports = Object.hasOwn(entries, subpath) ? entries[subpath] : entries[patterns[0]!]
  }
  const isBrowserDisabledExport = (value: unknown, browserCondition = false): boolean => {
    if (value === null)
      return browserCondition
    if (Array.isArray(value))
      return value.some(child => isBrowserDisabledExport(child, browserCondition))
    if (!value || typeof value !== 'object')
      return false
    for (const [condition, child] of Object.entries(value)) {
      if (['browser', 'import', 'default'].includes(condition))
        return isBrowserDisabledExport(child, browserCondition || condition === 'browser')
    }
    return false
  }
  return isBrowserDisabledExport(exports)
}

function isBrowserPackageFile(file: string, pkg: ResolvedPackage): boolean {
  const relative = `./${file.slice(pkg.directory.length + 1)}`
  const matches = (target: unknown): boolean => typeof target === 'string' && new RegExp(`^${target.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(relative)
  const hasBrowserExport = (value: unknown, browser = false): boolean => typeof value === 'string'
    ? browser && matches(value)
    : Array.isArray(value)
      ? value.some(child => hasBrowserExport(child, browser))
      : !!value && typeof value === 'object' && Object.entries(value).some(([key, child]) => hasBrowserExport(child, browser || key === 'browser'))
  const browser = pkg.metadata.browser
  return hasBrowserExport(pkg.metadata.exports) || matches(browser) || (!!browser && typeof browser === 'object' && Object.values(browser).some(matches))
}

/** Attribute an actual failure through the same recorded graph ownership uses. */
export async function enrichStyleEvaluationError(
  error: unknown,
  bundle: { readonly sourceMap: SourceMapPayload, readonly clientImports: readonly ResolvedStyleImport[], readonly inputs: ModuleInputs },
  root: string,
): Promise<unknown> {
  if (!(error instanceof Error) || error instanceof VanityError)
    return error
  const map = new SourceMap(bundle.sourceMap)
  let throwingFile: string | undefined
  for (const location of error.stack?.matchAll(/<anonymous>:(\d+):(\d+)/g) ?? []) {
    const frame = map.findEntry(Number(location[1]) - 3, Number(location[2]) - 1)
    if (!('originalSource' in frame) || !frame.originalSource)
      continue
    throwingFile = findModuleInput(frame.originalSource, join(root, 'package.json'), root, bundle.inputs)
    if (throwingFile !== undefined)
      break
  }

  const ancestors = new Set<string>()
  const queue = throwingFile === undefined ? [] : [throwingFile]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (ancestors.has(current))
      continue
    ancestors.add(current)
    for (const [importer, input] of bundle.inputs) {
      if (input.imports.some(edge => !edge.external && findModuleInput(edge.path, importer, root, bundle.inputs) === current))
        queue.push(importer)
    }
  }

  const candidates = new Map<string, ResolvedStyleImport>()
  const packages = new Map<string, Promise<ResolvedPackage | undefined>>()
  for (const imported of bundle.clientImports) {
    const file = findModuleInput(imported.file, imported.importer, root, bundle.inputs)
    if (file === undefined || (throwingFile !== undefined && !ancestors.has(file)))
      continue
    const pkg = await getResolvedPackage(file, packages)
    if (pkg !== undefined && isBrowserPackageFile(file, pkg))
      candidates.set(JSON.stringify([file, imported.importer, imported.specifier]), { ...imported, file })
  }
  if (candidates.size === 0)
    return error

  const repair = 'import the package by name in the style module'
  const sites = [...candidates.values()].sort((left, right) => left.file.localeCompare(right.file) || left.importer.localeCompare(right.importer) || left.specifier.localeCompare(right.specifier))
  const details = sites.map(site => `'${site.specifier}' imported by '${site.importer}': client resolution selected the package browser file '${site.file}'; ${repair}`).join('\n')
  return new VanityError({
    code: 'VANITY_VITE_BUILD_FAILED',
    message: throwingFile === undefined
      ? `${error.message}\nPossible causes (the stack did not identify a bundled module):\n${details}`
      : `Cannot evaluate '${throwingFile}': ${error.message}\n${details}`,
    file: sites[0]!.importer,
    fix: repair,
  }, { cause: error })
}
