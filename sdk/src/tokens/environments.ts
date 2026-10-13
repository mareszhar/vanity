import type { VanityAxisDefinition } from '../system/axes'
import type { TokenGraph } from './module'
import { getNodeDependencyPaths } from './module'

/** Axis/case environments reached by a declaration or a declared pairing. */
export function getTokenContexts(graph: TokenGraph | undefined, paths: readonly string[]): Record<string, string>[] {
  if (!graph?.axes)
    return [{}]
  const relevant = new Set<string>()
  const seen = new Set<string>()
  const visit = (path: string): void => {
    if (seen.has(path))
      return
    seen.add(path)
    const node = graph.nodes.get(path)
    if (!node)
      return
    for (const branch of node.branches) {
      if (branch.kind === 'axis')
        relevant.add(branch.axis)
      else Object.keys(branch.when).forEach(axis => relevant.add(axis))
    }
    getNodeDependencyPaths(node).forEach(visit)
  }
  paths.forEach(visit)
  let contexts: Record<string, string>[] = [{}]
  for (const axis of graph.axes.order) {
    if (relevant.has(axis))
      contexts = contexts.flatMap(when => Object.keys(graph.axes!.definitions[axis]!.modes).map(mode => ({ ...when, [axis]: mode })))
  }
  return contexts
}

/** Native schemes select their own axis arm; other axes cross both schemes. */
export function getTokenEnvironments(graph: TokenGraph, paths: readonly string[]) {
  const axes: Readonly<Record<string, VanityAxisDefinition>> = graph.axes?.definitions ?? {}
  const native = Object.entries(axes).find(([, axis]) => axis.native?.kind === 'scheme')
  return getTokenContexts(graph, paths).flatMap(when => (['light', 'dark'] as const)
    .filter(scheme => !native || !when[native[0]] || when[native[0]] === native[1].native![scheme])
    .map(scheme => ({ when: native ? { ...when, [native[0]]: native[1].native![scheme] } : when, scheme })))
}
