import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import ts from 'typescript'

export const MAX_DEPENDENCY_FILES = 64

function resolveLocalImport(importer: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.'))
    return undefined

  const base = resolve(dirname(importer), specifier)
  const candidates = extname(base)
    ? [base]
    : [base, `${base}.ts`, `${base}.js`, `${base}.mts`, `${base}.mjs`, resolve(base, 'index.ts'), resolve(base, 'index.js')]

  return candidates.find(candidate => existsSync(candidate))
}

export function discoverLocalDependencies(entry: string): string[] {
  const seen = new Set<string>()
  const pending = [resolve(entry)]

  while (pending.length > 0) {
    const file = pending.pop()!
    if (seen.has(file))
      continue
    if (seen.size >= MAX_DEPENDENCY_FILES)
      throw new Error(`[projection] dependency graph exceeded ${MAX_DEPENDENCY_FILES} files`)

    seen.add(file)
    const source = readFileSync(file, 'utf8')
    const imports = ts.preProcessFile(source, true, true).importedFiles

    for (const imported of imports) {
      const dependency = resolveLocalImport(file, imported.fileName)
      if (dependency && !seen.has(dependency))
        pending.push(dependency)
    }
  }

  return [...seen]
}
