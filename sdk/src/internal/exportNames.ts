import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { parseSync } from 'oxc-parser'

const moduleExtensions = ['.mts', '.cts', '.ts', '.tsx', '.mjs', '.cjs', '.js', '.jsx']

/**
 * Read named value exports from one module and its `export *` graph. This is
 * intentionally static: discovering an auto-import source must not execute
 * user code during configuration.
 */
export function exportNamesFromFile(filePath: string): string[] {
  return [...collectExportNames(resolveModuleFile(filePath), new Set<string>())].sort()
}

function collectExportNames(filePath: string, seen: Set<string>): Set<string> {
  const resolved = resolveModuleFile(filePath)
  if (seen.has(resolved))
    return new Set()
  seen.add(resolved)

  const source = readFileSync(resolved, 'utf8')
  const parsed = parseSync(resolved, source)
  const names = new Set<string>()

  if (parsed.errors.some(error => error.severity === 'Error'))
    return names

  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      if (entry.isType)
        continue

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
      )) {
        names.add(nested)
      }
    }
  }

  return names
}

function resolveModuleRequest(specifier: string, importer: string): string {
  if (specifier.startsWith('.') || specifier.startsWith('/'))
    return resolve(dirname(importer), specifier)

  return createRequire(importer).resolve(specifier)
}

function resolveModuleFile(filePath: string): string {
  if (existsSync(filePath) && extname(filePath) !== '')
    return resolve(filePath)

  if (existsSync(filePath) && !extname(filePath)) {
    for (const extension of moduleExtensions) {
      if (existsSync(`${filePath}${extension}`))
        return resolve(`${filePath}${extension}`)
    }
  }

  for (const extension of moduleExtensions) {
    if (existsSync(`${filePath}${extension}`))
      return resolve(`${filePath}${extension}`)
  }

  for (const extension of moduleExtensions) {
    const index = join(filePath, `index${extension}`)
    if (existsSync(index))
      return resolve(index)
  }

  if (isAbsolute(filePath))
    return resolve(filePath)

  return createRequire(resolve(process.cwd(), 'package.json')).resolve(filePath)
}
