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
