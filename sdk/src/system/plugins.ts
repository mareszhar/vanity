/**
 * Installed plugin records belong to the system state, not to the value
 * kernel. The registry is deliberately data-only so plugin identity,
 * ownership, and policy contributions survive consolidation as one facet.
 */

import type { VanityPolicyJson } from './policies'
import { VanityError } from '../diagnostics'

export interface PluginRegistration {
  readonly id: string
  readonly version: string | number
  readonly fingerprint?: string
  readonly capabilitySignature?: string
  readonly policy?: VanityPolicyJson
  readonly owners: readonly string[]
}

export interface PluginRegistry {
  readonly [id: string]: PluginRegistration
}

export function createPluginRegistry(): PluginRegistry {
  return Object.freeze({})
}

export function hasPlugin(registry: PluginRegistry, id: string): boolean {
  return Object.hasOwn(registry, id)
}

export function registerPlugin(
  registry: PluginRegistry,
  registration: PluginRegistration,
): PluginRegistry {
  if (hasPlugin(registry, registration.id)) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_COLLISION',
      message: `plugin '${registration.id}' is already installed`,
      path: ['plugins', registration.id],
      fix: 'install each plugin id only once, or choose a different id',
    })
  }

  return Object.freeze({
    ...registry,
    [registration.id]: Object.freeze({
      ...registration,
      owners: Object.freeze([...registration.owners]),
    }),
  })
}

export function getPluginIds(registry: PluginRegistry): readonly string[] {
  return Object.freeze(Object.keys(registry).sort())
}
