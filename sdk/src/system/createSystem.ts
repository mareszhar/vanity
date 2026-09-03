/** Create the immutable open system and its initial authoritative state. */

import type { VanityValueOperationContext } from '../values/kernel'
import type { ProjectSystemShape, VanityOpenSystem, VanitySystemShape } from './open'
import type { VanityPolicies } from './policies'
import type { OpenSystemState } from './state'
import { defineTokenModule } from '../tokens/module'
import { createDtcgCodecRegistry } from '../values/codecs'
import { defaultValueKernel } from '../values/defaults'
import { EMPTY_AXIS_REGISTRY } from './axes'
import { materializeOpen } from './open'
import { createPluginRegistry } from './plugins'
import { createPolicyState, resolvePolicies } from './policies'
import { getSystemTokenModuleRequirement } from './shape'
import { createSystemProvenance, createSystemRevisions } from './state'

/**
 * Create an immutable open system. Add tokens, conditions, policies, plugins,
 * and other capabilities before calling `consolidate()` for the locked system.
 */
export function createSystem(): VanityOpenSystem
export function createSystem<
  const Config extends VanityPolicies,
>(
  policies: Config,
): VanityOpenSystem<ProjectSystemShape<VanitySystemShape, Config>>
export function createSystem(
  policies?: VanityPolicies,
): any {
  const authoredPolicies = createPolicyState()
  const initialState = {
    values: defaultValueKernel,
    tokens: undefined as never,
    axes: EMPTY_AXIS_REGISTRY,
    policies: authoredPolicies,
    conditions: Object.freeze({}),
    consts: Object.freeze({}),
    utils: Object.freeze({}),
    rules: Object.freeze({}),
    plugins: createPluginRegistry(),
    codecs: createDtcgCodecRegistry(),
    provenance: createSystemProvenance(),
    sequence: 0,
    revisions: createSystemRevisions(),
  } as OpenSystemState
  const resolvedPolicies = resolvePolicies(authoredPolicies)
  const valueContext = {
    values: initialState.values,
    support: resolvedPolicies.support,
    policies: resolvedPolicies,
  } satisfies VanityValueOperationContext
  const tokenPolicy = Object.freeze({
    reference: resolvedPolicies.tokens.reference,
    emit: resolvedPolicies.tokens.emit,
  })
  const state = {
    ...initialState,
    tokens: defineTokenModule(
      getSystemTokenModuleRequirement(initialState.values, valueContext, initialState.axes),
      tokenPolicy,
      {},
    ),
  } as OpenSystemState
  const open = materializeOpen(state)
  return policies === undefined ? open : (open as any).addPolicies(policies)
}

export { definePlugin } from './open'
