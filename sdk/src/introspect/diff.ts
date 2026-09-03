import type { VanityManifest } from './manifest'

export type VanityChangeCategory = 'compatibility' | 'css' | 'runtime' | 'docs'
export type VanityChangeOperation = 'added' | 'removed' | 'changed'

export interface VanityManifestChange {
  readonly category: VanityChangeCategory
  readonly operation: VanityChangeOperation
  readonly path: readonly string[]
  readonly before?: unknown
  readonly after?: unknown
}

export interface VanityManifestDiff {
  readonly format: 'vanity.manifest-diff/1'
  readonly version: 1
  readonly identities: Readonly<Record<VanityChangeCategory, {
    readonly changed: boolean
    readonly before: string
    readonly after: string
  }>>
  readonly changes: readonly VanityManifestChange[]
}

/** Categorized semantic diff over the four independent system identities. */
export function diffManifests(before: VanityManifest, after: VanityManifest): VanityManifestDiff {
  const identities = {
    compatibility: getIdentityDiff(before, after, 'compatibility'),
    css: getIdentityDiff(before, after, 'css'),
    runtime: getIdentityDiff(before, after, 'runtime'),
    docs: getIdentityDiff(before, after, 'docs'),
  }
  const changes: VanityManifestChange[] = []

  compareRecord(changes, ['system', 'layers'], mapRecordsById(before.system.layers), mapRecordsById(after.system.layers), getChangedSystemCategories(identities, ['compatibility', 'css']))
  compareRecord(changes, ['system', 'conditions'], before.system.conditions, after.system.conditions, getChangedSystemCategories(identities, ['compatibility', 'css']))
  compareRecord(changes, ['system', 'axes'], before.system.axes, after.system.axes, getChangedSystemCategories(identities, ['compatibility', 'css', 'runtime']))
  compareRecord(changes, ['system', 'roots'], before.system.roots, after.system.roots, getChangedSystemCategories(identities, ['runtime']))
  compareRecord(changes, ['system', 'tokens'], before.system.tokens, after.system.tokens, getChangedSystemCategories(identities, ['compatibility', 'css', 'runtime', 'docs']))
  compareRecord(changes, ['system', 'plugins'], before.system.plugins, after.system.plugins, getChangedSystemCategories(identities, ['compatibility', 'docs']))
  compareRecord(changes, ['system', 'extensions'], before.system.extensions, after.system.extensions, getChangedSystemCategories(identities, ['compatibility', 'docs']))
  compareRecord(changes, ['system', 'consts'], before.system.consts, after.system.consts, getChangedSystemCategories(identities, ['runtime', 'docs']))
  compareRecord(changes, ['system', 'constructors'], before.system.constructors, after.system.constructors, getChangedSystemCategories(identities, ['compatibility']))
  compareRecord(changes, ['system', 'utilities'], before.system.utilities, after.system.utilities, getChangedSystemCategories(identities, ['compatibility', 'docs']))
  compareRecord(changes, ['system', 'audits'], before.system.audits, after.system.audits, ['docs'])
  compareList(changes, ['system', 'overwrites'], before.system.overwrites, after.system.overwrites, getChangedSystemCategories(identities, ['compatibility', 'docs']))

  const moduleIds = new Set([...Object.keys(before.modules), ...Object.keys(after.modules)])
  for (const moduleId of [...moduleIds].sort()) {
    const left = before.modules[moduleId]
    const right = after.modules[moduleId]
    if (!left || !right) {
      const operation = left ? 'removed' : 'added'
      const value = left ?? right
      changes.push({ category: 'docs', operation, path: ['modules', moduleId], ...(left ? { before: value } : { after: value }) })
      continue
    }
    compareRecord(changes, ['modules', moduleId, 'recipes'], left.recipes, right.recipes, ['compatibility', 'docs'])
    compareRecord(changes, ['modules', moduleId, 'ports'], left.ports, right.ports, ['compatibility', 'runtime', 'docs'])
    compareRecord(changes, ['modules', moduleId, 'styles'], left.styles, right.styles, ['css', 'docs'])
    compareList(changes, ['modules', moduleId, 'escapes'], left.escapes, right.escapes, ['css', 'docs'])
    compareList(changes, ['modules', moduleId, 'contrast'], left.contrast, right.contrast, ['docs'])
    compareRecord(changes, ['modules', moduleId, 'tokenUsage'], left.tokenUsage, right.tokenUsage, ['docs'])
  }

  return Object.freeze({
    format: 'vanity.manifest-diff/1',
    version: 1,
    identities: Object.freeze(identities),
    changes: Object.freeze(changes.sort((left, right) =>
      `${left.category}:${left.path.join('.')}`.localeCompare(`${right.category}:${right.path.join('.')}`))),
  })
}

/** Format a semantic manifest diff for terminals and review output: `formatManifestDiff(diff)`. */
export function formatManifestDiff(diff: VanityManifestDiff): string {
  const header = (Object.keys(diff.identities) as VanityChangeCategory[])
    .map(category => `${diff.identities[category].changed ? '●' : '○'} ${category}`)
    .join('  ')
  if (diff.changes.length === 0)
    return `${header}\nNo semantic changes.`
  return [
    header,
    ...diff.changes.map(change =>
      `${change.operation === 'added' ? '+' : change.operation === 'removed' ? '-' : '~'} [${change.category}] ${change.path.join('.')}`),
  ].join('\n')
}

function getIdentityDiff(
  before: VanityManifest,
  after: VanityManifest,
  category: VanityChangeCategory,
): { changed: boolean, before: string, after: string } {
  const left = before.system.identities[category]
  const right = after.system.identities[category]
  return Object.freeze({ changed: left !== right, before: left, after: right })
}

function getChangedSystemCategories(
  identities: VanityManifestDiff['identities'],
  candidates: readonly VanityChangeCategory[],
): VanityChangeCategory[] {
  return candidates.filter(category => identities[category].changed)
}

function mapRecordsById(values: readonly { id: string }[]): Record<string, unknown> {
  return Object.fromEntries(values.map(value => [value.id, value]))
}

function compareList(
  changes: VanityManifestChange[],
  path: readonly string[],
  before: readonly unknown[],
  after: readonly unknown[],
  categories: readonly VanityChangeCategory[],
): void {
  compareRecord(
    changes,
    path,
    Object.fromEntries(before.map((value: any, index) => [value?.id ?? String(index), value])),
    Object.fromEntries(after.map((value: any, index) => [value?.id ?? String(index), value])),
    categories,
  )
}

function compareRecord(
  changes: VanityManifestChange[],
  path: readonly string[],
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  categories: readonly VanityChangeCategory[],
): void {
  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const left = before[key]
    const right = after[key]
    if (serializeStable(left) === serializeStable(right))
      continue
    const operation: VanityChangeOperation = left === undefined ? 'added' : right === undefined ? 'removed' : 'changed'
    for (const category of categories) {
      changes.push({
        category,
        operation,
        path: [...path, key],
        ...(left === undefined ? {} : { before: left }),
        ...(right === undefined ? {} : { after: right }),
      })
    }
  }
}

function serializeStable(value: unknown): string {
  return JSON.stringify(value)
}
