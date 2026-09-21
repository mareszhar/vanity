import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { vanityPlugin } from '@mszr/vanity/vite'
import { describe, expect, it } from 'vitest'
import { createViteHmrHost, resolveViteVirtualId } from './viteHmr'

const vanityRoot = fileURLToPath(new URL('../../', import.meta.url))
const alias = {
  '@mszr/vanity/runtime': join(vanityRoot, 'runtime.ts'),
  '@mszr/vanity': join(vanityRoot, 'index.ts'),
}

async function loadViteRuntime(): Promise<typeof import('vite')> {
  const entry = process.env.VANITY_VITE_TEST_ENTRY
  return entry === undefined
    ? import('vite')
    : await import(pathToFileURL(entry).href) as typeof import('vite')
}

async function put(root: string, file: string, contents: string): Promise<string> {
  const path = join(root, file)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents)
  return path
}

function graphEnvironments(server: ViteDevServer) {
  const environments = Object.entries((server as ViteDevServer & {
    environments?: Record<string, { moduleGraph: ViteDevServer['moduleGraph'] }>
  }).environments ?? {}).map(([name, environment]) => ({
    name,
    moduleGraph: environment.moduleGraph,
  }))
  return environments.length === 0
    ? [{ name: 'default', moduleGraph: server.moduleGraph }]
    : environments
}

describe('vite virtual CSS graph compatibility', () => {
  it('caches repeated configured imports and invalidates them for a new source generation', async () => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-resolver-cache-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "vite-resolver-cache", "type": "module" }')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#123456' } }).consolidate()
`)
      const style = await put(root, 'style.css.ts', 'export const style = true\n')
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })

      const plugin = server.config.plugins.find(entry => entry.name === 'vanity-css-ts')
      if (plugin === undefined)
        throw new Error('missing Vanity Vite plugin')
      const resolveId = typeof plugin.resolveId === 'object'
        ? plugin.resolveId.handler
        : plugin.resolveId
      const watchChange = typeof plugin.watchChange === 'object'
        ? plugin.watchChange.handler
        : plugin.watchChange
      if (resolveId === undefined || watchChange === undefined)
        throw new Error('the Vanity plugin is missing its resolver or watch invalidation hook')

      let resolveCalls = 0
      const context = {
        resolve: async () => {
          resolveCalls++
          return { id: system }
        },
      }
      const callResolve = (resolveId as unknown as (
        this: typeof context,
        source: string,
        importer: string,
        options: object,
      ) => Promise<unknown>).bind(context)

      const first = await callResolve('./system', style, {})
      const repeated = await callResolve('./system', style, {})
      expect(first).toBe(repeated)
      expect(resolveCalls).toBe(1)

      const invalidateWatchFacts = watchChange as unknown as (this: object, id: string) => unknown
      invalidateWatchFacts.call({}, system)
      const afterInvalidation = await callResolve('./system', style, {})
      expect(afterInvalidation).toBe(first)
      expect(resolveCalls).toBe(2)
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('skips configured-system resolution entirely when no systems are configured', async () => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-no-system-resolution-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "vite-no-system-resolution", "type": "module" }')
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin()],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })

      const plugin = server.config.plugins.find(entry => entry.name === 'vanity-css-ts')
      if (plugin === undefined)
        throw new Error('missing Vanity Vite plugin')
      const resolveId = typeof plugin.resolveId === 'object'
        ? plugin.resolveId.handler
        : plugin.resolveId
      if (resolveId === undefined)
        throw new Error('the Vanity plugin is missing its resolver hook')

      let resolveCalls = 0
      const context = {
        resolve: async () => {
          resolveCalls++
          throw new Error('configured-system lookup should be bypassed')
        },
      }
      const result = await (resolveId as unknown as (
        this: typeof context,
        source: string,
        importer: string,
        options: object,
      ) => Promise<unknown>).call(context, './ordinary.ts', join(root, 'main.ts'), {})

      expect(result).toBeNull()
      expect(resolveCalls).toBe(0)
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('retires an old system identity from the actual client and SSR graphs', async () => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-graph-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "vite-graph-compat", "type": "module" }')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'graph-compat' })
`)
      await put(root, 'style.css.ts', `import { ds } from './system'
export const card = ds.class({ color: ds.t.color.brand })
`)

      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })

      const first = await server.transformRequest('/style.css.ts')
      const firstSystemUrl = first?.code.match(/import ['"]([^'"]+\.vanity\.css)['"]/)?.[1]
      if (firstSystemUrl === undefined)
        throw new Error('expected a semantic system CSS import')
      expect((await server.transformRequest(firstSystemUrl))?.code).toContain('#123456')
      await server.transformRequest(firstSystemUrl, { ssr: true })

      const firstVirtualId = resolveViteVirtualId(firstSystemUrl, root)
      expect(firstVirtualId).toBeDefined()
      const graphs = graphEnvironments(server)
      expect(graphs.map(({ name, moduleGraph }) => ({
        name,
        loaded: (moduleGraph.getModulesByFile(firstVirtualId!)?.size ?? 0) > 0,
      }))).toEqual(graphs.map(({ name }) => ({ name, loaded: true })))

      await writeFile(system, (await readFile(system, 'utf8')).replace('#123456', '#445566'))
      const plugin = server.config.plugins.find(entry => entry.name === 'vanity-css-ts')
      if (plugin === undefined)
        throw new Error('missing Vanity Vite plugin')
      const modules = [...server.moduleGraph.getModulesByFile(system) ?? []]
      const compatibilityGraph = server.moduleGraph as typeof server.moduleGraph & {
        onFileChange?: (file: string) => void
      }
      compatibilityGraph.onFileChange?.(system)
      for (const { moduleGraph } of graphs) {
        const graph = moduleGraph as typeof moduleGraph & { onFileChange?: (file: string) => void }
        graph.onFileChange?.(system)
      }
      const hook = typeof plugin.handleHotUpdate === 'object'
        ? plugin.handleHotUpdate.handler
        : plugin.handleHotUpdate
      await (hook as (context: object) => Promise<unknown>)({
        file: system,
        server,
        modules,
        timestamp: Date.now(),
        read: () => readFile(system, 'utf8'),
      })

      expect(graphs.map(({ name, moduleGraph }) => ({
        name,
        retired: moduleGraph.getModulesByFile(firstVirtualId!)?.size ?? 0,
      }))).toEqual(graphs.map(({ name }) => ({ name, retired: 0 })))

      const next = await server.transformRequest('/style.css.ts')
      const nextSystemUrl = next?.code.match(/import ['"]([^'"]+\.vanity\.css)['"]/)?.[1]
      expect(nextSystemUrl).toBeDefined()
      expect(nextSystemUrl).not.toBe(firstSystemUrl)
      expect((await server.transformRequest(nextSystemUrl!))?.code).toContain('#445566')
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('addresses style source paths for graph lookup inside and outside the root', () => {
    const host = createViteHmrHost({ root: '/app', base: '/' })
    expect(host.getGraphModuleUrl('/app/entry.css.ts', undefined)).toBe('/entry.css.ts')
    // A URL the host already holds passes through verbatim on every route.
    expect(host.getGraphModuleUrl('/app/entry.css.ts', '/app/entry.css.ts')).toBe('/app/entry.css.ts')
    expect(host.getGraphModuleUrl('/packages/ui/card.css.ts', undefined))
      .toBe(posix.join('/@fs/', '/packages/ui/card.css.ts'))
    expect(host.getGraphModuleUrl('/packages/ui/card.css.ts', '/@fs/packages/ui/card.css.ts'))
      .toBe('/@fs/packages/ui/card.css.ts')
    // The shape that breaks: a node seeded by an absolute-path transform
    // carries its own absolute path as its URL, and the lookup must keep it.
    expect(host.getGraphModuleUrl('/packages/ui/card.css.ts', '/packages/ui/card.css.ts'))
      .toBe('/packages/ui/card.css.ts')
    expect(host.getGraphModuleUrl('C:/ws/packages/ui/card.css.ts', undefined))
      .toBe(posix.join('/@fs/', 'C:/ws/packages/ui/card.css.ts'))
  })
})
