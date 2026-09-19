/** Compiler projection from an evaluated system to runtime module source. */

import type { EvaluatedSystem } from '../core/systems'
import { VanityError } from '../../diagnostics'
import { getSystemContract, projectRuntimeToken } from '../../system/contract'

const BUILD_SYSTEM_MEMBERS = [
  'class',
  'rules',
  'raw',
  'fragment',
  'tdec',
  'keyframes',
  'fontFace',
  'recipe',
  'anatomy',
  'port',
  'atoms',
  'inLayer',
  'tokensOf',
  'namesOf',
  'varsOf',
  'explain',
  'serialize',
] as const

const APPLICATION_SYSTEM_MEMBERS = [
  't',
  ...BUILD_SYSTEM_MEMBERS,
  'runtime',
  'snapshotFrom',
  'reconcileRuntimeSnapshot',
  'runtimeStyle',
  'runtimeProps',
  'conditions',
  'layers',
  'consts',
  'introspect',
] as const

/** A build-time module namespace member projected into browser/SSR code. */
export interface RuntimeSystemNamespaceMember {
  readonly name: string
  readonly kind: 'system' | 'ordinary'
  /** The corresponding member on the shared generated system backing. */
  readonly systemMember?: string
}

/** The resolved module namespace and its application projection identity. */
export interface RuntimeSystemNamespaceProjection {
  readonly identity: string
  readonly members: readonly RuntimeSystemNamespaceMember[]
}

/**
 * Generate the browser/SSR module restored from a system's portable contract.
 * The generated module contains only serialized data and runtime restoration
 * calls; it never executes the build-time authoring implementation.
 */
export function buildRuntimeSystemModule(system: EvaluatedSystem, target: 'browser' | 'ssr'): string {
  const portable = system.portable
  const tokens = portable.tokens.map(projectRuntimeToken)
  const runtimeContract = {
    ...portable.runtime,
    tokens: portable.runtime.tokens.map(token => ({
      token: token.token,
      name: token.name,
      rootPath: token.rootPath,
      root: token.root,
      ...(token.scopes === undefined ? {} : { scopes: token.scopes }),
      type: token.type,
      reference: token.reference,
      emit: token.emit,
      mutable: token.mutable,
      ...(token.validation === undefined ? {} : { validation: token.validation }),
      ...(token.baseSlot === undefined ? {} : { baseSlot: token.baseSlot }),
      branches: token.branches.map(branch => ({
        address: branch.address,
        ...(branch.slot === undefined ? {} : { slot: branch.slot }),
      })),
    })),
  }
  const sourceExports = new Set(system.exportNames)
  const lines = [
    `import { restoreStyleAuthoringStub, restoreRuntimeControllerFactory, restoreRuntimeProps, restoreRuntimeReconciler, restoreRuntimeStyle, restoreSnapshotFrom, restoreToken } from '@mszr/vanity/runtime';`,
    `const _runtimeContract = ${JSON.stringify(runtimeContract)};`,
    `const _tokenRecords = ${JSON.stringify(tokens)};`,
    `const _t = {};`,
    `for (const _meta of _tokenRecords) {`,
    `  const _parts = _meta.path.split('.');`,
    `  let _target = _t;`,
    `  for (let _index = 0; _index < _parts.length - 1; _index++) _target = _target[_parts[_index]] ||= {};`,
    `  _target[_parts.at(-1)] = restoreToken(_meta);`,
    `}`,
    `const _runtime = restoreRuntimeControllerFactory(_runtimeContract);`,
    `const _snapshotFrom = restoreSnapshotFrom(_runtimeContract);`,
    `const _reconcileRuntimeSnapshot = restoreRuntimeReconciler(_runtimeContract);`,
    `const _runtimeStyle = restoreRuntimeStyle(_runtimeContract);`,
    `const _runtimeProps = restoreRuntimeProps(_runtimeContract);`,
    `const _system = Object.freeze({`,
    `  t: Object.freeze(_t),`,
    `  runtime: _runtime, snapshotFrom: _snapshotFrom,`,
    `  reconcileRuntimeSnapshot: _reconcileRuntimeSnapshot,`,
    `  runtimeStyle: _runtimeStyle, runtimeProps: _runtimeProps,`,
    `  conditions: Object.freeze(${JSON.stringify(portable.conditions)}),`,
    `  layers: Object.freeze(${JSON.stringify(portable.layers)}),`,
    `  consts: Object.freeze(${JSON.stringify(portable.consts)}),`,
    `  environment: ${JSON.stringify(target)},`,
    ...BUILD_SYSTEM_MEMBERS.map(name => `  ${name}: restoreStyleAuthoringStub({ name: ${JSON.stringify(name)} }),`),
    `  introspect: restoreStyleAuthoringStub({ name: "introspect" }),`,
    `});`,
    // Namespace projections import this private object so aliases from a
    // configured barrel and its leaf retain shared runtime identity without
    // substituting one module's exports for another's.
    `export const __vanitySystem = _system;`,
  ]

  const emitted = new Set<string>()
  const exportValue = (name: string, value: string) => {
    // A name this module cannot declare is simply not re-exported here; the
    // namespace projection still serves it through an export alias.
    if (!canBindExportName(name) || emitted.has(name))
      return
    emitted.add(name)
    lines.push(`export const ${name} = ${value};`)
  }

  exportValue(system.contractExport, '_system')
  for (const name of sourceExports) {
    if (name === 'default' || name === system.contractExport)
      continue
    if (name === 't')
      exportValue(name, '_system.t')
    else if (['runtime', 'snapshotFrom', 'reconcileRuntimeSnapshot', 'runtimeStyle', 'runtimeProps', 'conditions', 'layers', 'consts'].includes(name))
      exportValue(name, `_system.${name}`)
    else if (BUILD_SYSTEM_MEMBERS.includes(name as typeof BUILD_SYSTEM_MEMBERS[number]))
      exportValue(name, `_system.${name}`)
  }
  if (sourceExports.has('default'))
    lines.push('export default _system;')
  lines.push('')
  return lines.join('\n')
}

/**
 * Describe one resolved module's application-safe exports without executing
 * its build-time source in the browser or SSR graph.
 *
 * A configured entry and a re-exported leaf are distinct JavaScript module
 * namespaces even when they expose the same consolidated system object. The
 * compiler projects the actual system members onto generated runtime backing
 * and keeps ordinary modules in the host graph. Keeping that source edge
 * preserves live bindings, reference identity, closures, and module
 * evaluation semantics without reconstructing application values.
 */
export function getRuntimeSystemNamespaceProjection(
  system: EvaluatedSystem,
  moduleFile: string,
): RuntimeSystemNamespaceProjection | undefined {
  const exports = getEvaluatedModuleExports(system, moduleFile)
  const members = Object.entries(exports).map(([name, value]) => {
    if (isSystemContract(value, system))
      return { name, kind: 'system' as const }

    const systemMember = getSystemMemberName(system, value)
    if (systemMember !== undefined)
      return { name, kind: 'system' as const, systemMember }

    return { name, kind: 'ordinary' as const }
  })
  if (!members.some(member => member.kind === 'system'))
    return undefined

  const fingerprint = JSON.stringify(members.map(member => [
    member.name,
    member.kind,
    member.systemMember,
  ]))

  return {
    identity: `namespace-${hashNamespace(fingerprint)}`,
    members,
  }
}

/** Generate one resolved module's namespace over a shared runtime backing. */
export function buildRuntimeSystemNamespaceModule(
  system: EvaluatedSystem,
  moduleFile: string,
  backingId: string,
): string {
  const projection = getRuntimeSystemNamespaceProjection(system, moduleFile)
  if (projection === undefined) {
    throw new VanityError({
      code: 'VANITY_VITE_BUILD_FAILED',
      message: `configured system module '${moduleFile}' has no runtime system exports`,
      file: moduleFile,
      fix: 'let ordinary application modules remain in the host module graph instead of requesting a system projection',
    })
  }
  const ordinaryMembers = projection.members.filter(member => member.kind === 'ordinary')
  if (ordinaryMembers.length > 0) {
    const systemExport = projection.members.find(member =>
      member.kind === 'system' && member.systemMember === undefined)?.name ?? system.contractExport
    const exports = ordinaryMembers.map(member => formatExportName(member.name)).join(', ')
    const verb = ordinaryMembers.length === 1 ? 'is' : 'are'
    const fixStatement = ordinaryMembers.length === 1
      ? 'It is ordinary application code and needs no Vanity configuration.'
      : 'They are ordinary application code and need no Vanity configuration.'
    throw new VanityError({
      code: 'VANITY_APP_EXPORT_IN_SYSTEM_MODULE',
      message: `${moduleFile} exports ${exports}, which ${verb} not part of the system exported as ${formatExportName(systemExport)}.`,
      detail: [
        `Application code receives a generated projection of a system module, so this file can export ${formatExportName(systemExport)} and values taken from it, and nothing else.`,
      ],
      file: moduleFile,
      fix: `move ${exports} into any other .ts module and import it normally. ${fixStatement}`,
    })
  }
  const lines = [
    `import { __vanitySystem } from ${JSON.stringify(backingId)};`,
  ]

  for (const [index, member] of projection.members.entries()) {
    if (member.kind !== 'system')
      continue

    const value = member.systemMember === undefined
      ? '__vanitySystem'
      : `__vanitySystem.${member.systemMember}`

    // Export under the author's own name wherever JavaScript allows it, so the
    // generated module reads like the source it stands in for. A reserved word
    // or exotic string is still a valid export alias, but not a binding name.
    if (member.name === 'default')
      lines.push(`export default ${value};`)
    else if (canBindExportName(member.name))
      lines.push(`export const ${member.name} = ${value};`)
    else
      lines.push(`const __vanityExport${index} = ${value};`, `export { __vanityExport${index} as ${JSON.stringify(member.name)} };`)
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Words JavaScript refuses as a binding name. An export alias may be any of
 * them, so a reserved name keeps the generated indirection.
 */
const reservedBindingNames = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

/** Whether the generated module can declare this export name as a binding. */
function canBindExportName(name: string): boolean {
  return /^[$A-Z_][$\w]*$/i.test(name)
    && !reservedBindingNames.has(name)
    && name !== '__vanitySystem'
}

function formatExportName(name: string): string {
  return `\`${name}\``
}

function getEvaluatedModuleExports(
  system: EvaluatedSystem,
  moduleFile: string,
): Record<string, unknown> {
  const exports = system.moduleExports.get(moduleFile)
  if (exports !== undefined)
    return exports

  throw new VanityError({
    code: 'VANITY_VITE_BUILD_FAILED',
    message: `configured system module '${moduleFile}' has no evaluated export namespace`,
    file: moduleFile,
    fix: 'export the module through the configured system entry so Vanity can preserve its application namespace',
  })
}

function isSystemContract(value: unknown, system: EvaluatedSystem): boolean {
  const contract = getSystemContract(value)
  if (contract === undefined)
    return false

  return contract.portable.identities.compatibility === system.contract.portable.identities.compatibility
    && contract.portable.identities.css === system.contract.portable.identities.css
    && contract.portable.identities.runtime === system.contract.portable.identities.runtime
}

function getSystemMemberName(system: EvaluatedSystem, value: unknown): string | undefined {
  const systemValue = system.buildExports[system.contractExport]
  if ((typeof systemValue !== 'object' && typeof systemValue !== 'function') || systemValue === null)
    return undefined

  for (const name of APPLICATION_SYSTEM_MEMBERS) {
    if (Object.hasOwn(systemValue, name)
      && (systemValue as Record<string, unknown>)[name] === value) {
      return name
    }
  }
  return undefined
}

function hashNamespace(value: string): string {
  let hash = 0x811C9DC5
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
