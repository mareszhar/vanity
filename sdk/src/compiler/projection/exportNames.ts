import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { parseSync } from 'oxc-parser'
import { VanityError } from '../../diagnostics'
import { normalizePath } from '../core/path'

const moduleExtensions = ['.mts', '.cts', '.ts', '.tsx', '.mjs', '.cjs', '.js', '.jsx']
const styleModuleFile = /\.css\.(?:js|cjs|mjs|jsx|ts|tsx)$/

/**
 * Read named value exports from one module and its `export *` graph. This is
 * intentionally static: discovering an auto-import source must not execute
 * user code during configuration.
 */
export function getExportNamesFromFile(filePath: string, baseDir = process.cwd()): string[] {
  return [...collectExportNames(resolveModuleIdentity(filePath, baseDir), new Set<string>())].sort()
}

/** Return every value re-export module reached while discovering a source's exports. */
export function getExportModuleFilesFromFile(filePath: string, baseDir = process.cwd()): string[] {
  const files = new Set<string>()
  collectExportNames(resolveModuleIdentity(filePath, baseDir), new Set<string>(), files, new Set<string>())
  return [...files].sort()
}

/** Whether a resolved module is a Vanity/vanilla-extract style module. */
export function isStyleModuleFile(filePath: string): boolean {
  return styleModuleFile.test(filePath)
}

/** The single config-source grammar: paths are explicit; every other string is a package. */
export function isPackageSpecifier(value: string): boolean {
  return !value.startsWith('.')
    && !value.startsWith('/')
    && !value.startsWith('~')
    && !/^[a-z]:[\\/]/i.test(value)
}

/**
 * Resolve a module named in Vanity configuration without changing the source
 * provenance used in generated declarations. Package sources remain bare;
 * local paths retain the caller's filesystem spelling; physical identity is
 * canonicalized separately when the compiler builds its evaluation index.
 */
export function resolveConfiguredModuleSource(
  value: string,
  baseDir: string,
  owner: string,
): { from: string, file: string } {
  if (value.startsWith('~')) {
    throw new VanityError({
      code: 'VANITY_COMPILER_INVALID_INPUT',
      message: `${owner} cannot resolve '${value}' outside a framework alias`,
      path: [owner],
      fix: 'use a project-relative path or package specifier',
    })
  }

  if (!isPackageSpecifier(value)) {
    const file = resolve(baseDir, value)
    return { from: file, file }
  }

  try {
    return { from: value, file: resolveModuleIdentity(value, baseDir) }
  }
  catch (error) {
    if (isBarePath(value)) {
      throw new VanityError({
        code: 'VANITY_COMPILER_INVALID_INPUT',
        message: `no package '${value}' is installed — did you mean './${value}'?`,
        path: [owner],
        fix: `install '${value}' or use './${value}' for a project-relative source`,
      }, { cause: error })
    }
    throw new VanityError({
      code: 'VANITY_COMPILER_INVALID_INPUT',
      message: `cannot resolve package '${value}' configured as ${owner}`,
      path: [owner],
      fix: `install '${value}' or point ${owner} at a resolvable package`,
    }, { cause: error })
  }
}

function collectExportNames(
  filePath: string,
  seen: Set<string>,
  files?: Set<string>,
  reexportSeen = new Set<string>(),
): Set<string> {
  const resolved = resolveModuleIdentity(filePath)
  if (seen.has(resolved))
    return new Set()
  seen.add(resolved)
  files?.add(resolved)

  const source = readFileSync(resolved, 'utf8')
  const parsed = parseSync(resolved, source)
  const names = new Set<string>()

  if (parsed.errors.some(error => error.severity === 'Error'))
    return names

  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      if (entry.isType)
        continue

      // `export { value } from './barrel'` already names its value export, so
      // name discovery need not open the target. File discovery does: an app
      // source must still expose that re-export's full value graph to its
      // safety checks and HMR ownership.
      if (files !== undefined && entry.importName.kind !== 'AllButDefault' && entry.moduleRequest?.value !== undefined) {
        collectReexportFiles(
          resolveModuleRequest(entry.moduleRequest.value, resolved),
          reexportSeen,
          files,
        )
      }

      const name = entry.exportName.name
      if (name !== null && name !== 'default' && entry.exportName.kind === 'Name') {
        names.add(name)
        continue
      }

      if (entry.importName.kind !== 'AllButDefault' || entry.moduleRequest?.value === undefined)
        continue

      for (const nested of collectExportNames(
        resolveModuleRequest(entry.moduleRequest.value, resolved),
        seen,
        files,
        reexportSeen,
      )) {
        names.add(nested)
      }
    }
  }

  return names
}

/** Collect value re-export files without changing export-name resolution. */
function collectReexportFiles(
  filePath: string,
  seen: Set<string>,
  files: Set<string>,
): void {
  const resolved = resolveModuleIdentity(filePath)
  if (seen.has(resolved))
    return
  seen.add(resolved)
  files.add(resolved)

  const source = readFileSync(resolved, 'utf8')
  const parsed = parseSync(resolved, source)
  if (parsed.errors.some(error => error.severity === 'Error'))
    return

  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      if (!entry.isType && entry.moduleRequest?.value !== undefined)
        collectReexportFiles(resolveModuleRequest(entry.moduleRequest.value, resolved), seen, files)
    }
  }
}

function resolveModuleRequest(specifier: string, importer: string): string {
  if (specifier.startsWith('.') || specifier.startsWith('/'))
    return resolve(dirname(importer), specifier)

  return createRequire(importer).resolve(specifier)
}

/**
 * Return the physical module identity without pretending a missing path has
 * already been resolved. Symlink spelling is useful in diagnostics, but one
 * evaluated module must have one identity when the host follows the link.
 */
export function normalizeModuleIdentity(filePath: string): string {
  const absolute = resolve(filePath)

  try {
    return normalizePath(realpathSync(absolute))
  }
  catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error
      && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return normalizePath(absolute)
    }
    throw error
  }
}

/** Resolve a physical or package request using the compiler's Node fallback. */
export function resolveModuleIdentity(filePath: string, baseDir = process.cwd()): string {
  if (existsSync(filePath) && extname(filePath) !== '')
    return normalizeModuleIdentity(filePath)

  if (existsSync(filePath) && !extname(filePath)) {
    for (const extension of moduleExtensions) {
      if (existsSync(`${filePath}${extension}`))
        return normalizeModuleIdentity(`${filePath}${extension}`)
    }
  }

  for (const extension of moduleExtensions) {
    if (existsSync(`${filePath}${extension}`))
      return normalizeModuleIdentity(`${filePath}${extension}`)
  }

  for (const extension of moduleExtensions) {
    const index = join(filePath, `index${extension}`)
    if (existsSync(index))
      return normalizeModuleIdentity(index)
  }

  if (isAbsolute(filePath))
    return normalizeModuleIdentity(filePath)

  return normalizeModuleIdentity(createRequire(resolve(baseDir, 'package.json')).resolve(filePath))
}

function isBarePath(value: string): boolean {
  return value.includes('/') && !value.startsWith('@') && /\.[cm]?[jt]sx?$/.test(value)
}
