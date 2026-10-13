/** Shared configured-system evaluation; application hosts and check use one compiler. */
import type { VanityFindingFinalization } from '../../css/findings'
import type { VanityDiagnosticInput } from '../../diagnostics'
import type { VanityInspectionCapture } from '../../introspect/records'
import type { EvaluatedSystem } from '../core/systems'
import { resolveDeclarationFindings } from '../../css/findings'
import { VanityError } from '../../diagnostics'
import { collectInspection } from '../../introspect/records'
import { getSystemContract } from '../../system/contract'
import { normalizePath } from '../core/path'
import { executeBundle } from './evaluate'

export function evaluateSystemModule(source: string, filePath: string, warning?: (diagnostic: VanityDiagnosticInput) => void, finalization?: VanityFindingFinalization & { collectCapture?: (capture: VanityInspectionCapture) => void }): EvaluatedSystem {
  const { result: exports, records, findings, warnings } = collectInspection(() => executeBundle(source, filePath), finalization?.collectCapture)
  resolveDeclarationFindings(findings, warning, finalization, warnings)
  const entryExports = isRecord(exports.__vanityEntry) ? exports.__vanityEntry : exports
  const moduleExports = isRecord(exports.__vanityModules)
    ? new Map(Object.entries(exports.__vanityModules)
        .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
        .map(([file, value]) => [normalizePath(file), value]))
    : new Map([[normalizePath(filePath), entryExports]])
  const contracts = Object.entries(entryExports)
    .map(([name, value]) => ({ name, value, contract: getSystemContract(value) }))
    .filter((entry): entry is {
      name: string
      value: object
      contract: NonNullable<ReturnType<typeof getSystemContract>>
    } =>
      entry.contract !== undefined)

  if (contracts.length === 0) {
    throw new VanityError({
      code: 'VANITY_VITE_BUILD_FAILED',
      message: `${filePath} does not export a consolidated Vanity system`,
      file: filePath,
      fix: 'export the result of createSystem().addTokens(...).consolidate() from this plain system module',
    })
  }
  // Count systems, not export names: one system exported under several names is
  // an ordinary alias, while two systems in one entry leaves no way to say which
  // one this configuration means.
  const distinctSystems = new Set(contracts.map(entry => entry.value))
  if (distinctSystems.size > 1) {
    throw new VanityError({
      code: 'VANITY_VITE_BUILD_FAILED',
      message: `${filePath} exports ${distinctSystems.size} different consolidated Vanity systems`,
      file: filePath,
      detail: contracts.map(entry => `system export: ${entry.name}`),
      fix: 'give each consolidated system its own system module and configure them separately',
    })
  }

  const [entry] = contracts
  return {
    portable: entry.contract.portable,
    contract: entry.contract,
    exportNames: Object.keys(entryExports).sort(),
    contractExport: entry.name,
    buildExports: entryExports,
    moduleExports,
    records,
    css: '',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
