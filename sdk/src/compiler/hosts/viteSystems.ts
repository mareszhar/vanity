/** Configuration-time source discovery shared by Vite and the headless host. */
import type { ResolvedConfig } from 'vite'
import type { VanityCompilerOptions } from '../../config'
import { isAbsolute, join } from 'node:path'
import { getSystemSources, normalizeSystemSources } from '../core/systems'
import { normalizeModuleIdentity } from '../projection/exportNames'

export async function resolveViteSystemSources(config: ResolvedConfig, input: VanityCompilerOptions['system'], ssr = false) {
  const resolvedEntries = new Map<string, string>()
  const resolver = config.createResolver({ asSrc: true })
  for (const value of getSystemSources(input)) {
    const entry = typeof value === 'string' ? value : value.entry
    const resolved = await resolver(entry, join(config.root, 'package.json'), false, ssr)
    if (resolved !== undefined && !resolved.startsWith('\0')) {
      const file = resolved.replace(/[?#].*$/, '')
      if (isAbsolute(file))
        resolvedEntries.set(entry, normalizeModuleIdentity(file))
    }
  }
  return normalizeSystemSources(input, config.root, resolvedEntries)
}
