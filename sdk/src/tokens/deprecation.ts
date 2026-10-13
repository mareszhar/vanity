import type { TokenGraph, TokenNode } from './module'

/** Suggestions follow authored deprecated.use paths; equal values imply nothing. */
export function resolveTokenReplacement(node: TokenNode, graph: TokenGraph): TokenNode {
  const seen = new Set<TokenNode>()
  while (!seen.has(node)) {
    seen.add(node)
    const deprecated = node.contract.deprecated
    const target = typeof deprecated === 'object' && deprecated.use ? graph.nodes.get(deprecated.use) : undefined
    // Incomplete migrations and cycles cannot establish another preferred
    // role. Retain the known role instead of guessing from value equality.
    if (!target)
      break
    node = target
  }
  return node
}
