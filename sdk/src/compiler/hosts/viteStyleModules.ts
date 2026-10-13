/** Reuse the host's existing client pipeline for compiler-owned imports. */
import type { ViteDevServer } from 'vite'
import type { StyleModuleHost } from '../modules/resolution'
import { isAbsolute } from 'node:path'

const compilerRequest = { 'vanity:style-module': true }

interface BuildContext {
  resolve: (specifier: string, importer: string, options: { custom: typeof compilerRequest }) => ReturnType<StyleModuleHost['resolve']>
  load: (options: { id: string }) => Promise<unknown>
  getModuleInfo: (id: string) => { readonly code: string | null } | null
}

export function getViteStyleModuleHost(server: ViteDevServer | undefined, context?: BuildContext): StyleModuleHost {
  if (server !== undefined) {
    const client = server.environments.client
    const container = client.pluginContainer
    return {
      resolve: async (specifier, importer) => {
        const answer = await container.resolveId(specifier, importer, { custom: compilerRequest })
        if (answer === null)
          return null
        let id = getStyleModuleId(answer.id)
        const optimizer = client.depsOptimizer
        if (optimizer?.isOptimizedDepFile(id)) {
          const file = id.replace(/[?#].*$/, '')
          const entry = [...Object.values(optimizer.metadata.optimized), ...Object.values(optimizer.metadata.discovered)].find(entry => entry.file === file)
          // A host can discover an entry before its cache file exists. Its live
          // metadata must still identify the source; evaluating the cache would
          // silently substitute browser prebundle semantics for authored code.
          if (entry?.src === undefined)
            throw new Error(`Optimizer metadata has no original source for '${specifier}' imported by '${importer}' (${answer.id}); style compilation cannot evaluate the optimizer cache`)
          id = entry.src
        }
        return { ...answer, id }
      },
      load: async id => (await container.load(id)) ?? null,
    }
  }
  if (context === undefined)
    throw new TypeError('build style resolution needs its hook context')
  // Retained build contexts share Rolldown's custom-options receipt table.
  // Overlapping compiler calls can reuse a released receipt and lose the
  // authoring marker; finish each request before issuing the next one.
  let pendingResolution: Promise<unknown> = Promise.resolve()
  return {
    resolve: async (specifier, importer) => {
      const resolution = pendingResolution.then(() => context.resolve(specifier, importer, { custom: compilerRequest }))
      pendingResolution = resolution.catch(() => {})
      const answer = await resolution
      return answer == null ? null : { ...answer, id: getStyleModuleId(answer.id) }
    },
    load: async (id) => {
      await context.load({ id })
      return context.getModuleInfo(id)?.code
    },
  }
}

export function isStyleModuleRequest(custom: Record<string, unknown> | undefined): boolean {
  return custom?.['vanity:style-module'] === true
}

/** Vite's cache, HMR, and import stamps still name the authored module itself. */
const moduleSelfQueryKeys = new Set(['import', 't', 'v'])

export function isModuleSelfQuery(query: string): boolean {
  if (query.length === 0)
    return true
  return query.split('&').every((part) => {
    const [key = ''] = part.split('=', 1)
    try {
      return moduleSelfQueryKeys.has(decodeURIComponent(key.replace(/^\?/, '')))
    }
    catch {
      return false
    }
  })
}

function getStyleModuleId(id: string): string {
  const queryStart = id.indexOf('?')
  // Loading a stamped physical system through the host would request its
  // application projection while that same system is still being evaluated.
  // Semantic queries and virtual ids retain the host's loading behavior.
  return isAbsolute(id) && queryStart !== -1 && isModuleSelfQuery(id.slice(queryStart + 1))
    ? id.slice(0, queryStart)
    : id
}
