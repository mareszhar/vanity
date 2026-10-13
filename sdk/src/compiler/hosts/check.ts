/** Acquire exactly one configured client pipeline without an application build. */
import type { Plugin, ViteDevServer } from 'vite'
import type { VanityConfig } from '../../config'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { VanityError } from '../../diagnostics'
import { loadVanityConfig } from '../../prepare'
import { getViteStyleModuleHost } from './viteStyleModules'

function findHostConfigFile(root: string, name: string): string | undefined {
  return ['ts', 'mts', 'js', 'mjs'].map(extension => join(root, `${name}.config.${extension}`)).find(existsSync)
}
export async function createCheckHost(root: string, config?: string) {
  if (!existsSync(root))
    throw new VanityError({ code: 'VANITY_CONFIG_INVALID', message: `project root does not exist: ${root}`, fix: 'pass --root with an existing project directory' })
  if (findHostConfigFile(root, 'nuxt')) {
    throw new VanityError({
      code: 'VANITY_CONFIG_INVALID',
      message: 'vanity check does not support Nuxt: its configured Vite client pipeline is assembled only during a framework build',
      fix: 'use the Nuxt build for compiler diagnostics; check does not run a framework build',
    })
  }
  const headless = { mode: 'production', server: { middlewareMode: true as const, hmr: false as const, ws: false as const, watch: null }, optimizeDeps: { noDiscovery: true }, logLevel: 'silent' as const }
  let server: ViteDevServer | undefined
  let close: (() => Promise<void>) | undefined
  try {
    if (findHostConfigFile(root, 'wxt')) {
      const { createServer } = await import('wxt')
      const capture: Plugin = {
        name: 'vanity-check-host',
        configureServer(value) {
          server = value
        },
      }
      const createHeadlessViteConfig = () => ({ ...headless, plugins: [capture] })
      const wxt = await createServer({ root, mode: 'production', webExt: { disabled: true }, vite: createHeadlessViteConfig })
      close = () => wxt.stop()
    }
    else if (!findHostConfigFile(root, 'vite') && findHostConfigFile(root, 'vitest')) {
      const { createVitest } = await import('vitest/node')
      const vitest = await createVitest({ root, config: findHostConfigFile(root, 'vitest'), watch: false, api: false }, { root, ...headless })
      server = vitest.vite
      close = () => vitest.close()
    }
    else {
      const { createServer } = await import('vite')
      server = await createServer({ root, ...headless })
      close = () => server!.close()
    }
    if (!server)
      throw new VanityError({ code: 'VANITY_CONFIG_INVALID', message: 'the host did not expose its client Vite server', fix: 'use a supported Vite or WXT client configuration' })
    const hostOptions = server.config.plugins.find(plugin => plugin.name === 'vanity-css-ts')?.api?.vanityConfig as VanityConfig | undefined
    const shared = join(root, 'vanity.config.ts')
    const options = config !== undefined ? await loadVanityConfig(config, { root }) : hostOptions ?? (existsSync(shared) ? await loadVanityConfig(shared, { root }) : {})
    return { server, options, host: getViteStyleModuleHost(server), close: close! }
  }
  catch (error) {
    await close?.()
    throw error
  }
}
