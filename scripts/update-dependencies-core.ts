/** Pure catalog/update-selection helpers used by the dependency updater. */

export interface ProtectedCatalogEntry {
  readonly name: string
  readonly range: string
  readonly pattern: RegExp
  readonly label: string
}

export interface CatalogUpdateChoice {
  readonly name: string
  readonly current: string
  readonly latest: string
  readonly dependentPackageCount: number
}

export type SemverChangeKind = 'major' | 'minor' | 'patch'

export interface SemverChangeParts {
  readonly kind: SemverChangeKind
  readonly commonPrefix: string
  readonly changedSuffix: string
}

interface ParsedSemver {
  readonly prefix: string
  readonly major: string
  readonly minor: string
  readonly patch: string
  readonly suffix: string
}

function parseSemver(version: string): ParsedSemver | undefined {
  const match = /^(v?)(\d+)\.(\d+)\.(\d+)([-+].*)?$/.exec(version)
  if (match === null)
    return undefined

  return {
    prefix: match[1]!,
    major: match[2]!,
    minor: match[3]!,
    patch: match[4]!,
    suffix: match[5] ?? '',
  }
}

/** Split a standard version into the plain prefix and the changed target suffix. */
export function semverChangeParts(current: string, latest: string): SemverChangeParts | undefined {
  const currentVersion = parseSemver(current)
  const latestVersion = parseSemver(latest)
  if (currentVersion === undefined || latestVersion === undefined)
    return undefined

  if (currentVersion.prefix !== latestVersion.prefix || currentVersion.suffix !== latestVersion.suffix)
    return undefined

  const currentParts = [currentVersion.major, currentVersion.minor, currentVersion.patch]
  const latestParts = [latestVersion.major, latestVersion.minor, latestVersion.patch]
  const firstChangedPart = currentParts.findIndex((part, index) => part !== latestParts[index])
  if (firstChangedPart === -1)
    return undefined

  const kind: SemverChangeKind = firstChangedPart === 0
    ? 'major'
    : firstChangedPart === 1
      ? 'minor'
      : 'patch'
  const commonParts = latestParts.slice(0, firstChangedPart)

  return {
    kind,
    commonPrefix: firstChangedPart === 0
      ? latestVersion.prefix
      : `${latestVersion.prefix}${commonParts.join('.')}.`,
    changedSuffix: `${latestParts.slice(firstChangedPart).join('.')}${latestVersion.suffix}`,
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function outdatedRecord(source: string): Record<string, unknown> {
  const trimmedSource = source.trim()
  if (trimmedSource === '')
    return {}

  // pnpm normally keeps diagnostics separate from --format json output, but
  // some reporters can prefix a warning (for example, a slow registry
  // request) to the JSON stream. Find the object before parsing so a benign
  // diagnostic cannot make the machine-readable report unusable.
  const objectStart = trimmedSource.indexOf('{')
  const jsonSource = objectStart === -1 ? trimmedSource : trimmedSource.slice(objectStart)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonSource)
  }
  catch (error) {
    throw new Error('Unable to read pnpm outdated output as JSON.', { cause: error })
  }

  if (!isRecord(parsed))
    throw new Error('The pnpm outdated JSON output must be an object.')

  return parsed
}

function requiredString(record: Record<string, unknown>, key: string, packageName: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value === '')
    throw new Error(`The pnpm outdated entry for ${packageName} has no ${key} version.`)

  return value
}

/** Turn pnpm's machine-readable report into one choice for each catalog package. */
export function catalogUpdateChoices(
  names: readonly string[],
  source: string,
): readonly CatalogUpdateChoice[] {
  const entries = outdatedRecord(source)

  return names.flatMap((name) => {
    const value = entries[name]
    if (!isRecord(value))
      return []

    const current = requiredString(value, 'current', name)
    const latest = requiredString(value, 'latest', name)
    if (current === latest)
      return []

    const dependentPackages = value.dependentPackages
    return [{
      name,
      current,
      latest,
      dependentPackageCount: Array.isArray(dependentPackages) ? dependentPackages.length : 0,
    }]
  })
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
