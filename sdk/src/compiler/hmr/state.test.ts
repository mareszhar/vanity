import type { ViteDevServer } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  createVitePendingCssResponseCache,
  getViteBrowserModuleUrl,
  getViteGraphModuleUrl,
  removeRetiredCssModules,
} from '../hosts/viteHmr'
import { getSystemCssVirtualId, replaceEntryVirtualIds } from './state'

describe('compiler CSS ownership state', () => {
  it('keeps shared CSS alive while any style or system owner remains', () => {
    const css = new Map([['/app/.vanity/virtual/system/css-id.vanity.css', 'body {}']])
    const owners = new Map([[
      '/app/.vanity/virtual/system/css-id.vanity.css',
      new Set(['system:/design/one.ts', 'system:/design/two.ts']),
    ]])
    const systems = new Map<string, Set<string>>([
      ['/design/one.ts', new Set(['/app/.vanity/virtual/system/css-id.vanity.css'])],
      ['/design/two.ts', new Set(['/app/.vanity/virtual/system/css-id.vanity.css'])],
    ])

    replaceEntryVirtualIds(
      '/design/one.ts',
      new Set(),
      systems,
      css,
      owners,
      'system:/design/one.ts',
    )
    expect(css.has('/app/.vanity/virtual/system/css-id.vanity.css')).toBe(true)

    replaceEntryVirtualIds(
      '/design/one.ts',
      new Set(),
      systems,
      css,
      owners,
      'system:/design/one.ts',
    )
    expect(css.has('/app/.vanity/virtual/system/css-id.vanity.css')).toBe(true)

    replaceEntryVirtualIds(
      '/design/two.ts',
      new Set(),
      systems,
      css,
      owners,
      'system:/design/two.ts',
    )
    expect(css.has('/app/.vanity/virtual/system/css-id.vanity.css')).toBe(false)
  })

  it('retains a previous system artifact during a style transition', () => {
    const oldId = '/app/.vanity/virtual/system/old.vanity.css'
    const nextId = '/app/.vanity/virtual/system/next.vanity.css'
    const css = new Map([[oldId, 'old'], [nextId, 'next']])
    const owners = new Map([[oldId, new Set(['system:/design.ts', 'style:/app/card.css.ts'])]])
    const systems = new Map<string, Set<string>>([
      ['/design.ts', new Set([oldId])],
      ['/app/card.css.ts', new Set([oldId])],
    ])

    replaceEntryVirtualIds(
      '/design.ts',
      new Set([nextId]),
      systems,
      css,
      owners,
      'system:/design.ts',
    )
    expect(css.has(oldId)).toBe(true)
    expect(owners.get(oldId)).toEqual(new Set(['style:/app/card.css.ts']))

    replaceEntryVirtualIds(
      '/app/card.css.ts',
      new Set([nextId]),
      systems,
      css,
      owners,
      'style:/app/card.css.ts',
    )
    expect(css.has(oldId)).toBe(false)
    expect(owners.get(nextId)).toEqual(new Set(['system:/design.ts', 'style:/app/card.css.ts']))
  })

  it('remembers response bytes after the final stylesheet owner leaves', () => {
    const id = '/app/.vanity/virtual/system/css-id.vanity.css'
    const css = new Map([[id, ':root { --brand: blue; }']])
    const owners = new Map([[id, new Set(['style:/app/card.css.ts'])]])
    const byEntry = new Map([['/app/card.css.ts', new Set([id])]])
    const pending = new Map<string, string>()

    const retired = replaceEntryVirtualIds(
      '/app/card.css.ts',
      new Set(),
      byEntry,
      css,
      owners,
      'style:/app/card.css.ts',
      (retiredId, contents) => pending.set(retiredId, contents),
    )

    expect(retired).toEqual(new Set([id]))
    expect(css.has(id)).toBe(false)
    expect(owners.has(id)).toBe(false)
    expect(pending.get(id)).toBe(':root { --brand: blue; }')
  })

  it('uses stable semantic ids and host-aware browser URLs', () => {
    expect(getSystemCssVirtualId('css-id', '/app', '.vanity.css'))
      .toBe('/app/.vanity/virtual/system/css-id.vanity.css')
    expect(getViteGraphModuleUrl('/app/.vanity/virtual/system/css-id.vanity.css', '/app'))
      .toBe('/.vanity/virtual/system/css-id.vanity.css')
    expect(getViteGraphModuleUrl('/outside/card.css.ts.vanity.css', '/app'))
      .toBe('/@fs//outside/card.css.ts.vanity.css')
    expect(getViteGraphModuleUrl('/app/card.css.ts.vanity.css', '/app', '/card.css.ts.vanity.css'))
      .toBe('/card.css.ts.vanity.css')
    expect(getViteGraphModuleUrl(
      '/app/.vanity/virtual/system/css-id.vanity.css',
      '/app',
      '/app/.vanity/virtual/system/css-id.vanity.css?t=123',
    )).toBe('/.vanity/virtual/system/css-id.vanity.css')
    expect(getViteGraphModuleUrl(
      '/packages/design/.vanity/virtual/system/css-id.vanity.css',
      '/app',
      '/packages/design/.vanity/virtual/system/css-id.vanity.css',
    )).toBe('/@fs//packages/design/.vanity/virtual/system/css-id.vanity.css')
    expect(getViteBrowserModuleUrl('/app/card.css.ts.vanity.css', '/app', '/dashboard/', '/card.css.ts.vanity.css'))
      .toBe('/dashboard/card.css.ts.vanity.css')
    expect(getViteBrowserModuleUrl(
      '/app/.vanity/virtual/system/css-id.vanity.css',
      '/app',
      '/_nuxt/',
      '/app/.vanity/virtual/system/css-id.vanity.css',
    )).toBe('/_nuxt/.vanity/virtual/system/css-id.vanity.css')
  })

  it('serves a pending CSS response under the browser base without restoring ownership', () => {
    const id = '/app/.vanity/virtual/system/css-id.vanity.css'
    const cache = createVitePendingCssResponseCache()
    type TestMiddleware = (request: unknown, response: unknown, next: () => void) => void
    let middleware: TestMiddleware | undefined
    const server = {
      middlewares: {
        use: (handler: unknown) => {
          middleware = handler as TestMiddleware
        },
      },
    } as unknown as ViteDevServer
    const headers = new Map<string, string>()
    const response = {
      statusCode: 0,
      body: '',
      setHeader(name: string, value: string) {
        headers.set(name, value)
      },
      end(contents?: string) {
        this.body = contents ?? ''
      },
    }
    let forwarded = false

    cache.remember(id, ':root { --brand: blue; }')
    cache.addMiddleware(server, '/app', '/_nuxt/')
    if (middleware === undefined)
      throw new Error('Vite CSS response middleware was not registered')
    middleware(
      { method: 'GET', url: '/_nuxt/app/.vanity/virtual/system/css-id.vanity.css', headers: { accept: 'text/css' } },
      response,
      () => { forwarded = true },
    )

    expect(response.statusCode).toBe(200)
    expect(response.body).toBe(':root { --brand: blue; }')
    expect(headers.get('Content-Type')).toBe('text/css')
    expect(forwarded).toBe(false)
  })

  it('detaches retired virtual CSS from every host environment graph', () => {
    const virtualId = '/app/.vanity/virtual/system/old.vanity.css'

    const createGraph = () => {
      const module = {
        id: virtualId,
        url: '/.vanity/virtual/system/old.vanity.css',
        file: virtualId,
        importers: new Set<GraphModule>(),
        importedModules: new Set<GraphModule>(),
        acceptedHmrDeps: new Set<GraphModule>(),
        transformResult: { etag: 'old-etag' },
      } as GraphModule
      const importer = {
        id: '/app/card.css.ts',
        url: '/card.css.ts',
        file: '/app/card.css.ts',
        importers: new Set<GraphModule>(),
        importedModules: new Set([module]),
        acceptedHmrDeps: new Set([module]),
        transformResult: null,
      } as GraphModule
      module.importers.add(importer)

      const fileModules = new Map([[virtualId, new Set([module])]])
      const graph = {
        urlToModuleMap: new Map([[module.url, module]]),
        idToModuleMap: new Map([[virtualId, module]]),
        etagToModuleMap: new Map([['old-etag', module]]),
        fileToModulesMap: fileModules,
        _unresolvedUrlToModuleMap: new Map([[module.url, module]]),
        _hasResolveFailedErrorModules: new Set([module]),
        getModulesByFile: (file: string) => fileModules.get(file),
        invalidateModule: (node: GraphModule) => { node.invalidationState = 'HARD_INVALIDATED' },
      }
      return { graph, module, importer }
    }

    const client = createGraph()
    const ssr = createGraph()
    const server = {
      environments: {
        client: { moduleGraph: client.graph },
        ssr: { moduleGraph: ssr.graph },
      },
    } as never

    removeRetiredCssModules(server, virtualId)

    for (const { graph, module, importer } of [client, ssr]) {
      expect(graph.urlToModuleMap.has(module.url)).toBe(false)
      expect(graph.idToModuleMap.has(virtualId)).toBe(false)
      expect(graph.etagToModuleMap.has('old-etag')).toBe(false)
      expect(graph.fileToModulesMap.has(virtualId)).toBe(false)
      expect(importer.importedModules.has(module)).toBe(false)
      expect(importer.acceptedHmrDeps.has(module)).toBe(false)
      expect(module.importers.has(importer)).toBe(false)
    }
  })
})

interface GraphModule {
  readonly id: string
  readonly url: string
  readonly file: string
  readonly importers: Set<GraphModule>
  readonly importedModules: Set<GraphModule>
  readonly acceptedHmrDeps: Set<GraphModule>
  readonly transformResult: { readonly etag: string } | null
  invalidationState?: unknown
}
