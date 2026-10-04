/** Invoke Vanity's real compiler hook without Vite's fallback reload for a bundled file. */
import type { ViteDevServer } from 'vite'
import { readFile } from 'node:fs/promises'

export async function invokeVanityHotUpdate(server: ViteDevServer, file: string): Promise<unknown> {
  const plugin = server.config.plugins.find(entry => entry.name === 'vanity-css-ts')
  if (plugin === undefined)
    throw new Error('missing Vanity Vite plugin')
  const modules = [...server.moduleGraph.getModulesByFile(file) ?? []]
  server.moduleGraph.onFileChange(file)
  for (const environment of Object.values(server.environments ?? {}))
    environment.moduleGraph.onFileChange(file)
  const hook = typeof plugin.handleHotUpdate === 'object'
    ? plugin.handleHotUpdate.handler
    : plugin.handleHotUpdate
  if (hook === undefined)
    throw new Error('missing Vanity hot-update hook')
  return Reflect.apply(hook, {}, [{
    file,
    server,
    modules,
    timestamp: Date.now(),
    read: () => readFile(file, 'utf8'),
  }])
}
