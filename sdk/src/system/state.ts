/**
 * Persistent state contracts for one open system.
 *
 * These interfaces describe ownership, not the implementation of any one
 * registry. The open-system facade stores immutable snapshots of these
 * facets and projects them into authoring and locked surfaces.
 */

import type { DtcgCodecRegistry } from '../values/codecs'
import type { VanityValueKernel } from '../values/kernel'
import type { VanityAxisRegistry } from './axes'
import type { VanityConditionInput } from './conditions'
import type { VanityOverwriteProvenance } from './contract'
import type { VanityUtilTree } from './definitions'
import type { PluginRegistry } from './plugins'
import type { VanityPolicies } from './policies'
import type { VanitySystemRule } from './rules'

export type TokenModule = object
export type AxisRegistry = VanityAxisRegistry
export type ConditionRegistry = Readonly<Record<string, VanityConditionInput>>
export type ConstRegistry = Readonly<Record<string, unknown>>
export type UtilRegistry = VanityUtilTree
export type SystemRuleRegistry = Readonly<Record<string, VanitySystemRule>>
export interface SystemProvenance {
  readonly owners: Readonly<Record<string, { readonly kind: 'plugin', readonly id: string }>>
  readonly overwrites: readonly VanityOverwriteProvenance[]
  readonly sources: Readonly<Record<string, string>>
}

export interface SystemRevisions {
  readonly singularAdds: number
  readonly restrictions: Readonly<Record<string, number>>
  readonly tokens: Readonly<Record<string, number>>
}

/** The sole immutable source of truth for an open system snapshot. */
export interface OpenSystemState {
  readonly values: VanityValueKernel
  readonly tokens: TokenModule
  readonly axes: AxisRegistry
  readonly policies: VanityPolicies
  readonly conditions: ConditionRegistry
  readonly consts: ConstRegistry
  readonly utils: UtilRegistry
  readonly rules: SystemRuleRegistry
  readonly plugins: PluginRegistry
  readonly codecs: DtcgCodecRegistry
  readonly provenance: SystemProvenance
  readonly sequence: number
  readonly revisions: SystemRevisions
}

/** The sole internal bridge from a public open-system facade to its snapshot. */
export const VANITY_OPEN_SYSTEM_STATE = Symbol.for('vanity.openSystem.state')

export function getOpenSystemState(value: unknown): OpenSystemState | undefined {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    return undefined
  return (value as Record<PropertyKey, unknown>)[VANITY_OPEN_SYSTEM_STATE] as OpenSystemState | undefined
}

export function createSystemProvenance(): SystemProvenance {
  return Object.freeze({
    owners: Object.freeze({}),
    overwrites: Object.freeze([]),
    sources: Object.freeze({}),
  })
}

export function createSystemRevisions(): SystemRevisions {
  return Object.freeze({
    singularAdds: 0,
    restrictions: Object.freeze({}),
    tokens: Object.freeze({}),
  })
}
