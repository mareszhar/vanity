import type { ViteDevServer } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  createVitePendingCssResponseCache,
  getViteBrowserModuleUrl,
  getViteGraphModuleUrl,
  removeRetiredCssModules,
  resolveViteVirtualId,
} from '../hosts/viteHmr'
import { getStyleCssVirtualId, getSystemCssVirtualId, replaceEntryVirtualIds } from './state'

/**
 * Decode a style address back to its root-relative source path, independently
 * of the encoder: fixed namespace prefix, leading up-level count, remainder.
 */
function decodeStyleAddress(id: string, root: string, extension: string): string {
  const prefix = `${root}/.vanity/virtual/style/`
  expect(id.startsWith(prefix)).toBe(true)
  const [ups, ...rest] = id.slice(prefix.length, -extension.length).split('/')
  return ups === '0' ? rest.join('/') : `${'../'.repeat(Number(ups))}${rest.join('/')}`
}

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
    // An out-of-root source is addressed under the root like any other: the
    // emitted URL is root-relative with no filesystem escape hatch.
    const outOfRoot = getStyleCssVirtualId('../../packages/ui/Button.css.ts', '/app', '.vanity.css')
    const outOfRootUrl = getViteGraphModuleUrl(outOfRoot, '/app')
    expect(outOfRootUrl.startsWith('/.vanity/virtual/style/')).toBe(true)
    expect(outOfRootUrl.endsWith('Button.css.ts.vanity.css')).toBe(true)
    // An address outside the root is a contract violation, not a case.
    // Style source paths are a different domain and go through the host
    // hook's own adapter instead of this function.
    expect(() => getViteGraphModuleUrl('/outside/card.css.ts.vanity.css', '/app')).toThrow(TypeError)
    expect(getViteGraphModuleUrl(
      '/app/.vanity/virtual/system/css-id.vanity.css',
      '/app',
      '/app/.vanity/virtual/system/css-id.vanity.css?t=123',
    )).toBe('/.vanity/virtual/system/css-id.vanity.css')
    expect(getViteBrowserModuleUrl(
      '/app/.vanity/virtual/system/css-id.vanity.css',
      '/app',
      '/_nuxt/',
      '/app/.vanity/virtual/system/css-id.vanity.css',
    )).toBe('/_nuxt/.vanity/virtual/system/css-id.vanity.css')
  })

  it('addresses style sources under the artifact directory by root-relative path', () => {
    expect(getStyleCssVirtualId('src/components/Button.css.ts', '/app', '.vanity.css'))
      .toBe('/app/.vanity/virtual/style/0/src/components/Button.css.ts.vanity.css')
    expect(getStyleCssVirtualId('../../packages/ui/Button.css.ts', '/base/apps/web', '.vanity.css'))
      .toBe('/base/apps/web/.vanity/virtual/style/2/packages/ui/Button.css.ts.vanity.css')
    // A path that names no file would address every such source identically.
    expect(() => getStyleCssVirtualId('/app', '/app', '.vanity.css')).toThrow(TypeError)
  })

  it('names the same address however a source path is spelled', () => {
    expect(getStyleCssVirtualId('/app/src/Local.css.ts', '/app', '.vanity.css'))
      .toBe(getStyleCssVirtualId('src/Local.css.ts', '/app', '.vanity.css'))
    expect(getStyleCssVirtualId('/packages/ui/Button.css.ts', '/app', '.vanity.css'))
      .toBe(getStyleCssVirtualId('../packages/ui/Button.css.ts', '/app', '.vanity.css'))
  })

  it('reproduces identical addresses from different checkout locations', () => {
    const one = getStyleCssVirtualId('/checkout-a/packages/ui/Button.css.ts', '/checkout-a/apps/web', '.vanity.css')
    const two = getStyleCssVirtualId('/checkout-b/packages/ui/Button.css.ts', '/checkout-b/apps/web', '.vanity.css')
    expect(one.replace('/checkout-a/', '/')).toBe(two.replace('/checkout-b/', '/'))
  })

  it('round-trips every style address back to its source path', () => {
    const cases: Array<[string, string, string]> = [
      ['src/Local.css.ts', '/app', 'src/Local.css.ts'],
      ['../../packages/ui/Button.css.ts', '/base/apps/web', '../../packages/ui/Button.css.ts'],
      ['/packages/ui/Button.css.ts', '/app', '../packages/ui/Button.css.ts'],
    ]
    for (const [source, root, normalized] of cases) {
      const id = getStyleCssVirtualId(source, root, '.vanity.css')
      expect(decodeStyleAddress(id, root, '.vanity.css')).toBe(normalized)
    }
  })

  it('keeps the in-root and out-of-root namespaces disjoint over identical tails', () => {
    const inner = getStyleCssVirtualId('src/Button.css.ts', '/app', '.vanity.css')
    const outer = getStyleCssVirtualId('../other/src/Button.css.ts', '/app', '.vanity.css')
    expect(inner).not.toBe(outer)
    expect(decodeStyleAddress(inner, '/app', '.vanity.css')).toBe('src/Button.css.ts')
    expect(decodeStyleAddress(outer, '/app', '.vanity.css')).toBe('../other/src/Button.css.ts')
  })

  it('round-trips and idempotently resolves every compiler-owned address at every base', () => {
    const root = '/app'
    const sources = ['src/components/Button.css.ts', '../../packages/ui/Button.css.ts']
    for (const base of ['/', '/_nuxt/', '/sub/', '.']) {
      for (const source of sources) {
        const id = getStyleCssVirtualId(source, root, '.vanity.css')
        expect(id.startsWith(`${root}/`), `${source}: ${id}`).toBe(true)
        const url = getViteBrowserModuleUrl(id, root, base)
        expect(resolveViteVirtualId(url, root, base), `round trip ${source} at base ${base}: ${url}`).toBe(id)
        expect(resolveViteVirtualId(id, root, base), `idempotence ${source} at base ${base}`).toBe(id)
      }
      const systemId = getSystemCssVirtualId('css-id', root, '.vanity.css')
      const systemUrl = getViteBrowserModuleUrl(systemId, root, base)
      expect(resolveViteVirtualId(systemUrl, root, base), `round trip system at base ${base}: ${systemUrl}`).toBe(systemId)
      expect(resolveViteVirtualId(systemId, root, base), `idempotence system at base ${base}`).toBe(systemId)
    }
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

  it('serves a retired out-of-root stylesheet at a non-root base', () => {
    const root = '/app'
    const id = getStyleCssVirtualId('../../packages/ui/Button.css.ts', root, '.vanity.css')
    // The request URL comes from the emitter, never from a hand-written
    // constant: it is the address the browser is really given.
    const url = getViteBrowserModuleUrl(id, root, '/_nuxt/')
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

    cache.remember(id, '.button { color: var(--outside-color-brand); }')
    cache.addMiddleware(server, root, '/_nuxt/')
    if (middleware === undefined)
      throw new Error('Vite CSS response middleware was not registered')
    middleware(
      { method: 'GET', url, headers: { accept: 'text/css' } },
      response,
      () => { forwarded = true },
    )

    expect(response.statusCode).toBe(200)
    expect(response.body).toBe('.button { color: var(--outside-color-brand); }')
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
