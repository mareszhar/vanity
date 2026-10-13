/** One compiler-owned baseline reader, shared by application hosts and check. */
import type { VanityDeclarationFinding, VanityFindingFinalization } from '../../css/findings'
import type { VanityDiagnosticCode } from '../../diagnostics'
import type { VanityInspectionCapture } from '../../introspect/records'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { serializeDeclarationNumber } from '../../css/validation'
import { VanityError } from '../../diagnostics'
import { normalizePath } from '../core/path'
import { normalizeModuleIdentity } from '../projection/exportNames'

const baselineCodes = new Set<VanityDiagnosticCode>(['VANITY_DECLARATION_RAW', 'VANITY_DECLARATION_DERIVED', 'VANITY_DECLARATION_PRIMITIVE', 'VANITY_TOKEN_RESTRICTED'])
export interface VanityBaselineEntry {
  code: VanityDiagnosticCode
  module: string
  style: { export?: string, name?: string }
  property: string
  condition: string[]
  value: string
  count: number
}
export interface VanityBaseline {
  format: 'vanity.baseline/1'
  entries: VanityBaselineEntry[]
}
export interface BaselineFinding {
  finding: VanityDeclarationFinding
  identity: VanityBaselineEntry
  accepted: boolean
}
export interface BaselineModule {
  module: string
  capture?: VanityInspectionCapture
  findings: BaselineFinding[]
  finalization: VanityFindingFinalization & { collectCapture: (capture: VanityInspectionCapture) => void }
}

function getBaselineSourceId(file: string, root: string): string {
  if (!isAbsolute(file))
    return normalizePath(file)
  let local = relative(root, file)
  if (local.startsWith('..'))
    local = relative(normalizeModuleIdentity(root), normalizeModuleIdentity(file))
  return normalizePath(local.startsWith('..') ? file : local)
}
function getBaselineIdentityKey(entry: VanityBaselineEntry): string {
  return JSON.stringify([entry.code, entry.module, entry.style.export ?? null, entry.style.name ?? null, entry.property, entry.condition, entry.value])
}
function getBaselineIdentity(finding: VanityDeclarationFinding, file: string, root: string, sourceRoot: string): VanityBaselineEntry {
  const declaration = finding.declaration
  return {
    code: finding.diagnostic.code,
    module: getBaselineSourceId(finding.diagnostic.file === undefined ? resolve(root, file) : resolve(sourceRoot, finding.diagnostic.file), root),
    style: {
      ...(finding.exports?.[0] ? { export: finding.exports[0] } : {}),
      ...(finding.style === undefined ? {} : { name: finding.style }),
    },
    property: declaration.property,
    condition: declaration.conditionPath ?? [],
    value: declaration.normalizedValue ?? (typeof declaration.value === 'number' ? serializeDeclarationNumber(declaration.property, declaration.value) : declaration.value.trim()),
    count: 1,
  }
}

function throwInvalidBaseline(file: string, message: string): never {
  throw new VanityError({ code: 'VANITY_BASELINE_INVALID', file, message, fix: 'baseline only declarations-policy or token-restriction findings; regenerate with vanity check --write-baseline' })
}
function isBaselineObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function hasOnlyBaselineKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}
function validate(value: unknown, file: string): VanityBaseline {
  if (!isBaselineObject(value) || !hasOnlyBaselineKeys(value, ['format', 'entries']) || value.format !== 'vanity.baseline/1' || !Array.isArray(value.entries))
    throwInvalidBaseline(file, 'expected vanity.baseline/1 with an entries array')
  for (const [index, entry] of value.entries.entries()) {
    if (!isBaselineObject(entry) || !hasOnlyBaselineKeys(entry, ['code', 'module', 'style', 'property', 'condition', 'value', 'count'])
      || typeof entry.code !== 'string' || !baselineCodes.has(entry.code as VanityDiagnosticCode)
      || typeof entry.module !== 'string' || !entry.module.length
      || typeof entry.property !== 'string' || !entry.property.length
      || typeof entry.value !== 'string'
      || !Array.isArray(entry.condition) || !entry.condition.every(key => typeof key === 'string')
      || !Number.isSafeInteger(entry.count) || (entry.count as number) < 1
      || !isBaselineObject(entry.style) || !hasOnlyBaselineKeys(entry.style, ['export', 'name'])
      || Object.values(entry.style).some(value => typeof value !== 'string')) {
      throwInvalidBaseline(file, `entries.${index} is not a policy-finding identity with a positive repeat count`)
    }
  }
  return value as unknown as VanityBaseline
}

// Re-reading a changed file happens here too: hosts never maintain separate baseline I/O.
const reads = new Map<string, { stamp: string, baseline: VanityBaseline }>()
export function readCompilerBaseline(root: string, configured?: string, sourceRoot = root, attempted?: (file: string) => void) {
  const file = resolve(root, configured ?? 'vanity.baseline.json')
  attempted?.(file)
  let baseline: VanityBaseline = { format: 'vanity.baseline/1', entries: [] }
  if (existsSync(file)) {
    const stat = statSync(file)
    const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`
    const cached = reads.get(file)
    if (cached?.stamp === stamp) {
      baseline = cached.baseline
    }
    else {
      let parsed: unknown
      try {
        parsed = JSON.parse(readFileSync(file, 'utf8'))
      }
      catch (error) { throwInvalidBaseline(file, `could not read baseline: ${String(error)}`) }
      baseline = validate(parsed, file)
      reads.set(file, { stamp, baseline })
    }
  }
  else if (configured !== undefined) {
    throwInvalidBaseline(file, 'the configured baseline file does not exist')
  }
  const accepted = new Map<string, number>()
  for (const entry of baseline.entries)
    accepted.set(getBaselineIdentityKey(entry), (accepted.get(getBaselineIdentityKey(entry)) ?? 0) + entry.count)

  return {
    file,
    baseline,
    createModuleSession(filePath: string): BaselineModule {
      const observed = new Map<string, number>()
      const session: BaselineModule = {
        module: getBaselineSourceId(filePath, root),
        findings: [],
        finalization: {
          isAccepted(finding) {
            if (!baselineCodes.has(finding.diagnostic.code))
              return false
            const key = getBaselineIdentityKey(getBaselineIdentity(finding, filePath, root, sourceRoot))
            const count = (observed.get(key) ?? 0) + 1
            observed.set(key, count)
            return count <= (accepted.get(key) ?? 0)
          },
          collectFinding(finding, accepted) { session.findings.push({ finding, identity: getBaselineIdentity(finding, filePath, root, sourceRoot), accepted }) },
          collectCapture(capture) {
            const prior = session.capture
            session.capture = prior
              ? {
                  records: [...prior.records, ...capture.records],
                  findings: [...prior.findings, ...capture.findings],
                  warnings: [...prior.warnings, ...capture.warnings],
                  complete: prior.complete && capture.complete,
                  ...(!prior.complete ? { error: prior.error } : !capture.complete ? { error: capture.error } : {}),
                }
              : capture
          },
        },
      }
      return session
    },
    reconcile(modules: readonly BaselineModule[]) {
      const observed = new Map<string, VanityBaselineEntry>()
      // A body can throw before the host finalizer: its earlier policy findings still count.
      for (const module of modules) {
        const occurrences = new Map<string, VanityBaselineEntry>()
        for (const finding of module.capture?.findings ?? module.findings.map(row => row.finding)) {
          if (!baselineCodes.has(finding.diagnostic.code))
            continue
          const entry = getBaselineIdentity(finding, module.module, root, sourceRoot)
          const key = getBaselineIdentityKey(entry)
          const prior = occurrences.get(key)
          occurrences.set(key, { ...entry, count: (prior?.count ?? 0) + 1 })
        }
        // Each bundle may execute the same imported source. Its authored
        // occurrences count once; partial captures can only establish a prefix.
        for (const [key, entry] of occurrences)
          observed.set(key, { ...entry, count: Math.max(entry.count, observed.get(key)?.count ?? 0) })
      }
      const resolved: VanityBaselineEntry[] = []
      const unevaluated: Array<{ entry: VanityBaselineEntry, reason: string }> = []
      for (const entry of baseline.entries) {
        const module = modules.find(module => module.module === entry.module)
        const current = observed.get(getBaselineIdentityKey(entry))
        if (!module?.capture?.complete) {
          unevaluated.push({ entry, reason: module?.capture?.error === undefined ? 'module was not evaluated or was blocked by a failing system' : String(module.capture.error) })
          observed.set(getBaselineIdentityKey(entry), { ...entry, count: Math.max(entry.count, current?.count ?? 0) })
        }
        else if (!current || current.count < entry.count) {
          resolved.push({ ...entry, count: entry.count - (current?.count ?? 0) })
        }
      }
      return { entries: [...observed.values()].sort((a, b) => getBaselineIdentityKey(a).localeCompare(getBaselineIdentityKey(b))), resolved, unevaluated }
    },
  }
}
