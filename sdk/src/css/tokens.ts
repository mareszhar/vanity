/**
 * CSS emission for resolved token modules.
 *
 * Token resolution computes semantic values and emission plans. This module
 * owns the translation of those plans into CSS declarations and layers; the
 * substrate adapter is the only lower-level owner of the registration API.
 */

import type { TokenGraph } from '../tokens/module'
import { substrate } from '../substrate'
import { getPhaseLayer, planTokenEmission } from '../tokens/module'

const CONTRAST_COLOR_SUPPORT = '(color: contrast-color(red))'

export function emitTokenCss(graph: TokenGraph): void {
  if (graph.nodes.size === 0)
    return

  interface EmissionGroup {
    readonly root: string
    readonly layer?: string
    readonly media?: string
    readonly supports?: string
    readonly container?: string
    readonly scopes?: readonly string[]
    readonly vars: Record<string, string>
    readonly upgrades: Record<string, string>
    hasSchemePairs: boolean
  }

  const baseGroups = new Map<string, EmissionGroup>()
  const conditionalGroups = new Map<string, EmissionGroup>()
  let hasSchemePairs = false

  // Preserve authored top-level declaration order while grouping by the
  // selector/layer context required by CSS emission.
  const topOrder = new Map<string, number>()
  for (const node of graph.nodes.values()) {
    const top = node.key.split('.')[0]!
    if (!topOrder.has(top))
      topOrder.set(top, topOrder.size)
  }
  const orderedNodes = [...graph.nodes.values()].map((node, index) => ({ node, index })).sort((a, b) => {
    const group = topOrder.get(a.node.key.split('.')[0]!)! - topOrder.get(b.node.key.split('.')[0]!)!
    return group === 0 ? a.index - b.index : group
  })

  const plans = orderedNodes.map(({ node }) => planTokenEmission(node, graph))

  for (const plan of plans) {
    const { node } = plan
    if (plan.registration)
      substrate.css.registerCustomProperty({ name: node.name as `--${string}`, registration: plan.registration })

    if (node.layer !== undefined && graph.phaseLayers && node.layer !== graph.phaseLayers.root)
      substrate.css.emitLayer({ name: node.layer })

    if (Object.keys(plan.baseVars).length > 0) {
      const layer = getPhaseLayer(graph, node, 'base')
      const group = getEmissionGroup(baseGroups, {
        root: node.root,
        layer,
        ...(node.scopes === undefined ? {} : { scopes: node.scopes }),
      })
      Object.assign(group.vars, plan.baseVars)
      if (plan.upgrade !== undefined)
        group.upgrades[node.name] = plan.upgrade
      if (Object.values(plan.baseVars).some(value => value.includes('light-dark('))) {
        hasSchemePairs = true
        group.hasSchemePairs = true
      }
    }
  }

  for (const axis of graph.axes?.order ?? []) {
    const entries = plans.flatMap(plan => plan.axisDeclarations.filter(entry => entry.axis === axis))
      .sort((a, b) => a.priority - b.priority || a.modeOrder - b.modeOrder || a.tokenOrder - b.tokenOrder)
    for (const entry of entries) {
      const layer = getPhaseLayer(graph, entry.node, 'axis', axis)
      const group = getEmissionGroup(conditionalGroups, {
        root: entry.root,
        layer,
        ...(entry.media === undefined ? {} : { media: entry.media }),
        ...(entry.supports === undefined ? {} : { supports: entry.supports }),
        ...(entry.container === undefined ? {} : { container: entry.container }),
        ...(entry.scopes === undefined ? {} : { scopes: entry.scopes }),
      })
      group.vars[entry.name] = entry.value
    }
  }

  const cases = plans.flatMap(plan => plan.caseDeclarations)
    .sort((a, b) => a.priority - b.priority || a.tokenOrder - b.tokenOrder)
  for (const entry of cases) {
    const layer = getPhaseLayer(graph, entry.node, 'case')
    const group = getEmissionGroup(conditionalGroups, {
      root: entry.root,
      layer,
      ...(entry.media === undefined ? {} : { media: entry.media }),
      ...(entry.supports === undefined ? {} : { supports: entry.supports }),
      ...(entry.container === undefined ? {} : { container: entry.container }),
      ...(entry.scopes === undefined ? {} : { scopes: entry.scopes }),
    })
    group.vars[entry.name] = entry.value
  }

  const schemeRoots = new Set<string>()
  for (const group of [...baseGroups.values(), ...conditionalGroups.values()]) {
    if (group.hasSchemePairs && !schemeRoots.has(group.root)) {
      schemeRoots.add(group.root)
      substrate.css.emitGlobalRule({ selector: group.root, rule: { colorScheme: 'light dark' } })
    }

    emitGroup(group)
  }

  if (hasSchemePairs) {
    for (const root of schemeRoots) {
      substrate.css.emitGlobalRule({ selector: `:is(${root})[data-scheme='light']`, rule: { colorScheme: 'light' } })
      substrate.css.emitGlobalRule({ selector: `:is(${root})[data-scheme='dark']`, rule: { colorScheme: 'dark' } })
    }
  }

  function emitGroup(group: EmissionGroup): void {
    let rule: Record<string, unknown> = { vars: group.vars }
    if (Object.keys(group.upgrades).length > 0) {
      rule = {
        ...rule,
        '@supports': {
          [CONTRAST_COLOR_SUPPORT]: { vars: group.upgrades },
        },
      }
    }
    if (group.container !== undefined)
      rule = { '@container': { [group.container]: rule } }
    if (group.supports !== undefined)
      rule = { '@supports': { [group.supports]: rule } }
    if (group.media !== undefined)
      rule = { '@media': { [group.media]: rule } }
    for (const scope of [...group.scopes ?? []].reverse())
      rule = { '@scope': { [scope]: rule } }
    if (group.layer !== undefined)
      rule = { '@layer': { [group.layer]: rule } }

    substrate.css.emitGlobalRule({ selector: group.root, rule })
  }
}

function getEmissionGroup(
  groups: Map<string, {
    readonly root: string
    readonly layer?: string
    readonly media?: string
    readonly supports?: string
    readonly container?: string
    readonly scopes?: readonly string[]
    readonly vars: Record<string, string>
    readonly upgrades: Record<string, string>
    hasSchemePairs: boolean
  }>,
  context: {
    readonly root: string
    readonly layer?: string
    readonly media?: string
    readonly supports?: string
    readonly container?: string
    readonly scopes?: readonly string[]
  },
) {
  const key = JSON.stringify([
    context.root,
    context.layer,
    context.media,
    context.supports,
    context.container,
    context.scopes,
  ])
  let group = groups.get(key)
  if (!group) {
    group = { ...context, vars: {}, upgrades: {}, hasSchemePairs: false }
    groups.set(key, group)
  }
  return group
}
