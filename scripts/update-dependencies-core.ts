/** Pure catalog/update-selection helpers used by the dependency updater. */

export interface ProtectedCatalogEntry {
  readonly name: string
  readonly range: string
  readonly pattern: RegExp
  readonly label: string
}

function indentationOf(line: string): number {
  return line.length - line.trimStart().length
}

function unquoteKey(key: string): string {
  const first = key[0]
  const last = key.at(-1)

  if ((first === '\'' && last === '\'') || (first === '"' && last === '"'))
    return key.slice(1, -1)

  return key
}

function catalogSection(source: string): readonly string[] {
  const lines = source.split(/\r?\n/)
  let start = -1
  let baseIndent = 0

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    if (line.trim() !== 'catalog:')
      continue

    start = index + 1
    baseIndent = indentationOf(line)
    break
  }

  if (start === -1)
    throw new Error('Unable to find the default dependency catalog.')

  const entries: string[] = []
  const entryIndent = baseIndent + 2
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!
    const trimmed = line.trim()

    if (trimmed !== '' && !trimmed.startsWith('#') && indentationOf(line) <= baseIndent)
      break

    if (indentationOf(line) !== entryIndent)
      continue

    const separator = line.indexOf(':')
    if (separator === -1 || line.slice(separator + 1).trim() === '')
      continue

    entries.push(unquoteKey(line.slice(0, separator).trim()))
  }

  return entries
}

/** Return default-catalog package names in their authored order. */
export function defaultCatalogNames(source: string): readonly string[] {
  return catalogSection(source)
}

/** Exclude deliberate compatibility-policy exceptions from pnpm's selectors. */
export function catalogUpdateTargets(
  names: readonly string[],
  protectedNames: ReadonlySet<string>,
): readonly string[] {
  return names.filter(name => !protectedNames.has(name))
}

/** Return the named peer catalog block that defines the published contract. */
export function namedPeerCatalog(source: string): string {
  const start = source.indexOf('catalogs:\n')
  const end = source.indexOf('\nblockExoticSubdeps:', start)

  if (start === -1 || end === -1)
    throw new Error('Unable to preserve the published peer compatibility catalog.')

  return source.slice(start, end)
}

/** Restore workspace policies that the updater is not allowed to change. */
export function restoreProtectedCatalogEntries(
  source: string,
  originalPeerCatalog: string,
  protectedEntries: readonly ProtectedCatalogEntry[],
): string {
  let restoredSource = source.replace(namedPeerCatalog(source), originalPeerCatalog)

  for (const entry of protectedEntries) {
    if (!entry.pattern.test(restoredSource))
      throw new Error(`Unable to preserve the ${entry.label}.`)

    restoredSource = restoredSource.replace(entry.pattern, `$1 ${entry.range}`)
  }

  return restoredSource
}

export interface DependencyUpdateReconciliation {
  readonly hasChanges: boolean
  readonly shouldWriteWorkspace: boolean
}

/** Separate persistence of policy restoration from the semantic change check. */
export function reconcileDependencyUpdate(input: {
  readonly originalSource: string
  readonly source: string
  readonly guardedSource: string
  readonly lockfileChanged: boolean
}): DependencyUpdateReconciliation {
  return {
    hasChanges: input.guardedSource !== input.originalSource || input.lockfileChanged,
    shouldWriteWorkspace: input.guardedSource !== input.source,
  }
}
