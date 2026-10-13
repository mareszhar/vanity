import type { VanityDiagnosticInput } from '../diagnostics'
import type { TokenGraph } from '../tokens/module'
import { parse, walk } from 'css-tree'
import { VanityError } from '../diagnostics'
import { getNodeDependencyPaths } from '../tokens/module'

/** Check declared mode responsibilities on the final token graph, including later group leaves. */
export function assertAxisCoverage(graph: TokenGraph): void {
  const diagnostics: VanityDiagnosticInput[] = []
  const nativeSelection = new Map<string, boolean>()
  const hasNativeSchemeSelection = (path: string): boolean => {
    const cached = nativeSelection.get(path)
    if (cached !== undefined)
      return cached
    const node = graph.nodes.get(path)
    const value = graph.results.get(path)?.emitted
    if (!node || !value)
      return false
    let ast
    try {
      ast = parse(value, { context: 'value' })
    }
    catch (error) {
      // Malformed authored text proves no native selection; CSS validation owns validity.
      if (error instanceof Error && error.name === 'SyntaxError')
        return false
      throw error
    }
    let selects = false
    const references = new Set<string>()
    walk(ast, (entry) => {
      if (entry.type !== 'Function')
        return
      if (entry.name === 'light-dark')
        selects = true
      if (entry.name === 'var') {
        const name = entry.children.first
        if (name?.type === 'Identifier')
          references.add(name.name)
        // A fallback does not establish selection when the primary value can win.
        return walk.skip
      }
    })
    nativeSelection.set(path, false)
    const result = selects || [...getNodeDependencyPaths(node)].some((dependency) => {
      const target = graph.nodes.get(dependency)
      return target !== undefined && references.has(target.name) && hasNativeSchemeSelection(dependency)
    })
    nativeSelection.set(path, result)
    return result
  }
  for (const axis of graph.axes?.order ?? []) {
    const definition = graph.axes!.definitions[axis]!
    if (definition.covers === undefined)
      continue
    const getTokenLeaves = (paths: readonly string[], field: 'covers' | 'shared'): Set<string> => {
      const leaves = new Set<string>()
      for (const path of paths) {
        const matches = [...graph.nodes.keys()].filter(leaf => leaf === path || leaf.startsWith(`${path}.`))
        if (!matches.length) {
          diagnostics.push({
            code: 'VANITY_AXIS_UNCOVERED',
            message: `${axis}.${field} '${path}' matches no token leaf or group`,
            path: ['axes', axis, field],
            file: graph.file,
            fix: 'name an existing token leaf or group, including any added before consolidation',
          })
        }
        matches.forEach(leaf => leaves.add(leaf))
      }
      return leaves
    }
    const covered = getTokenLeaves(definition.covers, 'covers')
    const shared = getTokenLeaves(definition.shared ?? [], 'shared')
    for (const mode of definition.modeOrder) {
      const accounted = new Map<string, boolean>()
      const isAccountedFor = (path: string, visiting = new Set<string>()): boolean => {
        const cached = accounted.get(path)
        if (cached !== undefined)
          return cached
        const node = graph.nodes.get(path)
        if (!node || visiting.has(path))
          return false
        visiting.add(path)
        const own = (mode === definition.defaultMode && node.definition.kind !== 'none')
          || node.branches.some(branch => branch.kind === 'axis' && branch.axis === axis && branch.mode === mode && branch.definition.kind !== 'none')
        // An intersection case does not claim a whole mode; coverage is per axis.
        const result = own || [...getNodeDependencyPaths(node)].some(dependency => isAccountedFor(dependency, visiting))
        visiting.delete(path)
        accounted.set(path, result)
        return result
      }
      for (const path of covered) {
        const native = definition.native?.kind === 'scheme'
          && (mode === definition.native.light || mode === definition.native.dark)
          && hasNativeSchemeSelection(path)
        if (shared.has(path) || isAccountedFor(path) || native)
          continue
        const dependencies = [...getNodeDependencyPaths(graph.nodes.get(path)!)]
        diagnostics.push({
          code: 'VANITY_AXIS_UNCOVERED',
          message: `${axis}.${mode} leaves '${path}' unaccounted for${dependencies.length ? `; its dependencies (${dependencies.join(', ')}) provide no mode arm` : ''}`,
          path: ['axes', axis, 'covers', path, mode],
          file: graph.file,
          fix: `add a '${axis}.${mode}' arm to '${path}'${dependencies.length ? ' or a dependency (derived roles are covered through their dependencies)' : ''}, or list '${path}' in '${axis}.shared'`,
        })
      }
    }
  }
  if (diagnostics.length)
    throw new VanityError(diagnostics)
}
