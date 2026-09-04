/** Compiler projection from an evaluated system to runtime module source. */

import type { EvaluatedSystem } from '../core/systems'
import { projectRuntimeToken } from '../../system/contract'

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
  const buildMembers = [
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
  ]
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
    ...buildMembers.map(name => `  ${name}: restoreStyleAuthoringStub({ name: ${JSON.stringify(name)} }),`),
    `  introspect: restoreStyleAuthoringStub({ name: "introspect" }),`,
    `});`,
  ]

  const emitted = new Set<string>()
  const exportValue = (name: string, value: string) => {
    if (!/^[$A-Z_][$\w]*$/i.test(name) || emitted.has(name))
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
    else if (buildMembers.includes(name))
      exportValue(name, `_system.${name}`)
  }
  if (sourceExports.has('default'))
    lines.push('export default _system;')
  lines.push('')
  return lines.join('\n')
}
