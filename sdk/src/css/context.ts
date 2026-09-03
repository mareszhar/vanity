import type { VanityPropertyAliasMap, VanityPropertyAliasMode } from './types'
import { VanityError } from '../diagnostics'
import { checkLayer } from './rule'

/** Neutral inputs shared by the canonical CSS emitters. */
export interface VanitySystemContext {
  conditions: Map<string, readonly import('../system/conditions').VanityConditionArm[]>
  layers: readonly string[]
  defaultLayer: string
  globalDefaultLayer: string
  layerRoot: string
  propertyAliases?: {
    aliases: VanityPropertyAliasMap
    expose: VanityPropertyAliasMode
  }
}

export function createLayerContext(system: VanitySystemContext, name: string): VanitySystemContext {
  const diagnostic = checkLayer(name, system.layers)
  if (diagnostic !== undefined)
    throw new VanityError(diagnostic)
  return { ...system, defaultLayer: name, globalDefaultLayer: name }
}
