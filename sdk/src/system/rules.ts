/** System-owned CSS rule records and their detached authoring shape. */

import type { VanityRuleInput } from '../css/types'

export interface VanitySystemRule<
  Condition extends string = never,
  Layer extends string = string,
> {
  /** Explicit selector → rule map emitted once with the system. */
  readonly css: Readonly<Record<string, VanityRuleInput<Condition>>>
  readonly description?: string
  readonly layer?: Layer
  readonly order?: number
}

/**
 * The resolved cascade position of one named system rule.
 *
 * This is intentionally shared by contract projection and emission. Keeping
 * the effective layer and numeric order together prevents a portable identity
 * from describing a different rule position than the CSS emitter uses.
 */
export interface VanityResolvedSystemRulePosition {
  /** Effective layer, or absent only when the system declares no layers. */
  readonly layer?: string
  /** Effective numeric order within the layer. */
  readonly order: number
  /** Source registration order used as the final stable tie-breaker. */
  readonly registration: number
}

/** A rule paired with its effective, sorted cascade position. */
export interface VanityOrderedSystemRule<Rule> {
  readonly rule: Rule
  readonly position: VanityResolvedSystemRulePosition
}

/**
 * Resolve and sort named system rules by their effective cascade position.
 *
 * An omitted layer belongs to the global rule layer: `reset` when declared,
 * otherwise the first declared layer. An omitted order is zero. Registration
 * order is the final tie-breaker. Emitters and identity projections both use
 * this function so they cannot describe different cascade orderings.
 */
export function orderSystemRules<Rule extends Pick<VanitySystemRule, 'layer' | 'order'>>(
  rules: readonly Rule[],
  layers: readonly string[],
): readonly VanityOrderedSystemRule<Rule>[] {
  const layerIndex = new Map(layers.map((layer, index) => [layer, index]))
  return rules
    .map((rule, registration) => {
      const layer = rule.layer ?? (layers.includes('reset') ? 'reset' : layers[0])
      const position: VanityResolvedSystemRulePosition = {
        ...(layer === undefined ? {} : { layer }),
        order: rule.order ?? 0,
        registration,
      }
      return {
        rule,
        position,
        layerIndex: layerIndex.get(layer ?? '') ?? Number.MAX_SAFE_INTEGER,
      }
    })
    .sort((left, right) => left.layerIndex - right.layerIndex
      || left.position.order - right.position.order
      || left.position.registration - right.position.registration)
    .map(({ rule, position }) => ({ rule, position }))
}
