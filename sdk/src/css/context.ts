import type { VanityFileScope } from '../substrate'
import type { VanityPropertyAliasMap, VanityPropertyAliasMode } from './types'
import { VanityError } from '../diagnostics'
import { substrate } from '../substrate'
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

/** Return the active style-module file scope for authoring-time CSS operations. */
export function getStyleModuleFile(): VanityFileScope | undefined {
  return substrate.css.getStyleModuleFile()
}

/** Report whether authoring-time CSS currently runs inside a style-module scope. */
export function hasStyleModuleFile(): boolean {
  return substrate.css.hasStyleModuleFile()
}

/**
 * Require the active style-module file for a CSS authoring operation.
 *
 * This is a Vanity authoring-context contract; the selected substrate only supplies the scope.
 */
export function requireStyleModuleFile(surface: string): string {
  const file = getStyleModuleFile()?.filePath
  if (file === undefined) {
    throw new VanityError({
      code: 'VANITY_VITE_PLUGIN_MISSING',
      message: `${surface} ran outside a style-module build — the vanity plugin is not wired up`,
      detail: [
        'Style modules are evaluated at build time; nothing here can run as ordinary app code.',
      ],
      fix: 'add vanityPlugin() from \'@mszr/vanity/vite\' to vite plugins (or the \'@mszr/vanity/nuxt\' module), and keep this call inside a *.css.ts file',
    })
  }
  return file
}
