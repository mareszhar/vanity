/** Vite-specific URL and module-graph protocol for compiler-owned CSS HMR. */

import type { ViteDevServer } from 'vite'
import type { CompilerHmrHost } from '../hmr/host'
import { readFile } from 'node:fs/promises'
import { posix, resolve } from 'node:path'
import { normalizePath } from '../core/path'

/**
 * Return the base-less URL used by Vite's module graph for a compiler-owned
 * stylesheet ID. HMR payloads use this spelling. Style source paths are not
 * owned addresses and go through the host hook's own adapter below.
 */
export function getViteGraphModuleUrl(
  id: string,
  root: string,
  graphUrl?: string,
): string {
  const cleanGraphUrl = graphUrl?.replace(/[?#].*$/, '')
  const cleanId = normalizeViteFilePath(id.replace(/[?#].*$/, ''))
  const normalizedRoot = normalizeViteFilePath(resolve(root)).replace(/\/$/, '')
  if (cleanGraphUrl !== undefined && cleanGraphUrl.startsWith('/')) {
    const normalizedGraphFile = normalizeViteFilePath(cleanGraphUrl)
    if (!normalizedGraphFile.startsWith(`${normalizedRoot}/`))
      return cleanGraphUrl
    return getViteUrlForFileId(normalizedGraphFile, normalizedRoot)
  }

  return getViteUrlForFileId(cleanId, normalizedRoot)
}

/**
 * Return the base-less URL Vite's module graph uses for a style source file.
 *
 * A source file legitimately lives outside the root, so an out-of-root path
 * keeps Vite's own filesystem spelling instead of raising the owned-address
 * guard: that guard is for generated stylesheets with no file, not for real
 * files on disk.
 */
function getViteSourceModuleUrl(sourcePath: string, root: string, graphUrl?: string): string {
  const cleanGraphUrl = graphUrl?.replace(/[?#].*$/, '')
  if (cleanGraphUrl !== undefined && cleanGraphUrl.startsWith('/'))
    return cleanGraphUrl
  const normalized = normalizeViteFilePath(sourcePath.replace(/[?#].*$/, ''))
  const normalizedRoot = normalizeViteFilePath(resolve(root)).replace(/\/$/, '')
  const relative = posix.relative(normalizedRoot, normalized)
  // Built the way the host builds it: `posix.join` keeps the separator on
  // both platforms, where the two hand-concatenations each fail on one. The
  // inputs are already resolved, so its collapsing is what is wanted here.
  return relative.length > 0 && !relative.startsWith('..') && !posix.isAbsolute(relative)
    ? `/${relative}`
    : posix.join('/@fs/', normalized)
}

function getViteUrlForFileId(file: string, normalizedRoot: string): string {
  const relative = posix.relative(normalizedRoot, file)
  if (relative.length === 0 || relative.startsWith('..') || posix.isAbsolute(relative))
    throw new TypeError(`Vanity cannot address a stylesheet outside the build root: ${file}`)
  return `/${relative}`
}

/**
 * Normalize a physical Vite file ID or path. The input is a module ID, never a
 * browser request URL.
 */
export function normalizeViteFilePath(file: string): string {
  const normalized = normalizePath(file)
  return /^\/[a-z]:\//i.test(normalized) ? normalized.slice(1) : normalized
}

/**
 * Return the browser request/import URL for a compiler-owned module.
 *
 * The public base is applied here only. It must not be passed to a Vite graph
 * lookup or HMR payload because Vite's client applies its base at that edge.
 */
export function getViteBrowserModuleUrl(
  id: string,
  root: string,
  base = '/',
  graphUrl?: string,
): string {
  const graphPath = getViteGraphModuleUrl(id, root, graphUrl)
  const normalizedBase = normalizeViteBase(base)
  if (normalizedBase === '/')
    return graphPath
  return `${normalizedBase}${graphPath === '/' ? '' : graphPath}` || '/'
}

/** Resolve a browser request URL to its compiler-owned virtual ID, or `undefined` when Vanity owns no such address. */
export function resolveViteVirtualId(
  filePath: string,
  root: string,
  base = '/',
): string | undefined {
  const normalizedRoot = normalizePath(resolve(root)).replace(/\/$/, '')
  const ownedPrefix = `${normalizedRoot}/.vanity/virtual/`
  const clean = filePath.replace(/[?#].*$/, '')
  const withoutIdPrefix = clean.replace(/^\/?@id\//, '')
  const normalizedBase = normalizeViteBase(base)
  const withoutBase = normalizedBase !== '/' && (withoutIdPrefix === normalizedBase || withoutIdPrefix.startsWith(`${normalizedBase}/`))
    ? withoutIdPrefix.slice(normalizedBase.length) || '/'
    : withoutIdPrefix

  let unwrapped = withoutBase
  if (/^\/[a-z]:\//i.test(unwrapped))
    unwrapped = unwrapped.slice(1)

  // An owned address is recognized by the namespace Vanity owns, never by
  // the shape of the string — so parsing an ID returns it unchanged.
  if (unwrapped.startsWith(ownedPrefix))
    return normalizePath(unwrapped)
  if (unwrapped.startsWith('/.vanity/virtual/'))
    return normalizePath(posix.join(normalizedRoot, unwrapped))
  return undefined
}

function normalizeViteBase(base: string): string {
  const clean = base.replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '')
  return clean.length === 0 ? '/' : `/${clean}/`.replace(/\/$/, '')
}

/** Keep bounded CSS bytes for browser requests already in flight during retirement. */
export function createVitePendingCssResponseCache() {
  const responses = new Map<string, { readonly contents: string, readonly expiresAt: number }>()
  const lifetimeMs = 30_000
  const responseLimit = 64

  const removeExpiredCssResponses = (): void => {
    const now = Date.now()
    for (const [id, response] of responses) {
      if (response.expiresAt <= now)
        responses.delete(id)
    }
    while (responses.size > responseLimit) {
      const oldest = responses.keys().next().value as string | undefined
      if (oldest === undefined)
        break
      responses.delete(oldest)
    }
  }

  const remember = (id: string, contents: string): void => {
    removeExpiredCssResponses()
    responses.delete(id)
    responses.set(id, { contents, expiresAt: Date.now() + lifetimeMs })
    removeExpiredCssResponses()
  }

  const clear = (id: string): void => {
    responses.delete(id)
  }

  const read = (id: string): string | undefined => {
    removeExpiredCssResponses()
    return responses.get(id)?.contents
  }

  const addMiddleware = (server: ViteDevServer, root: string, base: string): void => {
    server.middlewares.use((request, response, next) => {
      if (
        (request.method !== 'GET' && request.method !== 'HEAD')
        || !request.headers.accept?.includes('text/css')
      ) {
        next()
        return
      }

      const virtualId = resolveViteVirtualId(request.url ?? '/', root, base)
      if (virtualId === undefined) {
        next()
        return
      }
      const contents = read(virtualId)
      if (contents === undefined) {
        next()
        return
      }

      response.statusCode = 200
      response.setHeader('Cache-Control', 'no-cache')
      response.setHeader('Content-Type', 'text/css')
      response.end(request.method === 'HEAD' ? undefined : contents)
    })
  }

  return { remember, clear, addMiddleware }
}

/** Build the Vite adapter for compiler-owned style and graph HMR. */
export function createViteHmrHost(options: {
  readonly root: string
  readonly base: string
  readonly server?: ViteDevServer
  readonly clientServer?: ViteDevServer
}): CompilerHmrHost {
  const servers = [...new Set([options.server, options.clientServer]
    .filter((server): server is ViteDevServer => server !== undefined))]
  const getAllViteModuleGraphs = () => [...new Set(servers.flatMap(getViteModuleGraphs))]
  const updateServer = options.server ?? options.clientServer
  const transport = options.clientServer ?? options.server

  return {
    resolveBrowserModuleUrl: id => getViteBrowserModuleUrl(id, options.root, options.base),
    updateCssModule: (id) => {
      if (transport === undefined)
        return
      for (const graph of getAllViteModuleGraphs()) {
        for (const module of graph.getModulesByFile(id) ?? [])
          graph.invalidateModule(module)
      }
      const clientGraph = getClientModuleGraph(transport)
      const graphUrl = [...clientGraph.getModulesByFile(id) ?? []][0]?.url
      sendViteCssUpdateMessage(transport, getViteGraphModuleUrl(id, options.root, graphUrl), Date.now())
    },
    removeCssModules: (ids) => {
      for (const server of servers) {
        for (const id of ids)
          removeRetiredCssModules(server, id)
      }
    },
    sendFullReload: () => {
      transport?.hot.send({ type: 'full-reload' })
    },
    // Vite's handleHotUpdate hook must return the nodes exposed by its
    // compatibility graph. Vite 8 adapts those nodes back into the client and
    // SSR graphs; returning an EnvironmentModuleNode directly is ignored by
    // that public hook contract.
    findModulesByFile: file => [...getServerModuleGraph(requireServer(updateServer)).getModulesByFile(file) ?? []],
    findModulesById: (id) => {
      const module = getServerModuleGraph(requireServer(updateServer)).getModuleById(id)
      return module === undefined ? [] : [module]
    },
    markModulesInvalidById: (id) => {
      const invalidated = new Set<object>()
      for (const graph of getAllViteModuleGraphs()) {
        const module = graph.getModuleById(id)
        if (module === undefined)
          continue
        graph.invalidateModule(module)
        invalidated.add(module)
      }
      return [...invalidated]
    },
    findModulesByUrl: async (url) => {
      const module = await getServerModuleGraph(requireServer(updateServer)).getModuleByUrl(url)
      return module === undefined ? [] : [module]
    },
    ensureEntryFromUrl: url => getServerModuleGraph(requireServer(updateServer)).ensureEntryFromUrl(url),
    markModuleInvalid: module => getServerModuleGraph(requireServer(updateServer)).invalidateModule(module as never),
    getModuleUrl: module => getModuleUrl(module),
    getGraphModuleUrl: (sourcePath, graphUrl) => getViteSourceModuleUrl(sourcePath, options.root, graphUrl),
    compileStyle: async (file) => {
      const server = requireServer(options.server ?? options.clientServer)
      const environments = getViteEnvironments(server)
      const transform = environments?.client?.pluginContainer?.transform
        ?? getServerPluginContainer(server)?.transform
      if (transform === undefined)
        throw new TypeError('Vanity cannot recompile a style: the Vite client plugin container is unavailable')
      await transform.call(
        environments?.client?.pluginContainer ?? getServerPluginContainer(server),
        await readFile(file, 'utf8'),
        file,
      )
    },
  }
}

function sendViteCssUpdateMessage(server: ViteDevServer, url: string, timestamp: number): void {
  server.hot.send({
    type: 'update',
    updates: [{
      type: 'js-update',
      timestamp,
      path: url,
      acceptedPath: url,
      explicitImportRequired: false,
      isWithinCircularImport: false,
    }],
  })
}

type ViteModuleGraph = ViteDevServer['moduleGraph']
type ViteEnvironmentMap = Readonly<Record<string, {
  readonly moduleGraph: ViteModuleGraph
  readonly pluginContainer?: { transform?: (source: string, id: string) => Promise<unknown> }
}>>

function getViteEnvironments(server: ViteDevServer): ViteEnvironmentMap | undefined {
  return (server as unknown as { environments?: ViteEnvironmentMap }).environments
}

function getViteModuleGraphs(server: ViteDevServer): ViteModuleGraph[] {
  const environments = getViteEnvironments(server)
  const environmentGraphs = Object.values(environments ?? {}).map(environment => environment.moduleGraph)
  const serverGraph = server.moduleGraph
  const serverGraphIsDirect = isDirectViteModuleGraph(serverGraph)
  return [...new Set([
    ...(serverGraphIsDirect ? [serverGraph] : []),
    ...environmentGraphs,
  ].filter((graph): graph is ViteModuleGraph => graph !== undefined))]
}

function isDirectViteModuleGraph(value: unknown): value is ViteModuleGraph {
  const graph = value as Partial<RetiredModuleGraph> | undefined
  return graph !== undefined
    && graph.urlToModuleMap instanceof Map
    && graph.idToModuleMap instanceof Map
    && graph.etagToModuleMap instanceof Map
    && graph.fileToModulesMap instanceof Map
    && graph._unresolvedUrlToModuleMap instanceof Map
    && graph._hasResolveFailedErrorModules instanceof Set
}

function getClientModuleGraph(server: ViteDevServer): ViteModuleGraph {
  return getViteEnvironments(server)?.client?.moduleGraph ?? server.moduleGraph
}

function getServerModuleGraph(server: ViteDevServer): ViteModuleGraph {
  return server.moduleGraph
}

function getServerPluginContainer(server: ViteDevServer) {
  return (server as unknown as {
    pluginContainer?: { transform?: (source: string, id: string) => Promise<unknown> }
  }).pluginContainer
}

function requireServer(server: ViteDevServer | undefined): ViteDevServer {
  if (server === undefined)
    throw new TypeError('Vanity cannot use a Vite graph operation outside a development server')
  return server
}

function getModuleUrl(module: object): string | undefined {
  const url = (module as { url?: unknown }).url
  return typeof url === 'string' ? url : undefined
}

/**
 * Retire a semantic CSS module from every Vite environment graph.
 *
 * Vite's supported peer range is `^5 || ^6 || ^7 || ^8`, but it exposes no
 * public “remove module” operation. The client/SSR graph maps used here are
 * therefore a narrow private seam, exercised against real graphs in
 * `viteGraph.compat.test.ts`; keep it isolated and fail loudly if a future
 * host removes it rather than leaving a stale CSS node that SSR can re-emit.
 */
export function removeRetiredCssModules(
  server: ViteDevServer,
  virtualId: string,
): void {
  for (const graph of getViteModuleGraphs(server))
    removeModuleFromViteGraph(graph, virtualId)
}

interface RetiredModuleNode {
  readonly id: string | null
  readonly url: string
  readonly file: string | null
  readonly importers: Set<RetiredModuleNode>
  readonly importedModules: Set<RetiredModuleNode>
  readonly acceptedHmrDeps: Set<RetiredModuleNode>
  readonly transformResult: { readonly etag?: string } | null
  invalidationState?: unknown
}

interface RetiredModuleGraph {
  readonly urlToModuleMap: Map<string, RetiredModuleNode>
  readonly idToModuleMap: Map<string, RetiredModuleNode>
  readonly etagToModuleMap: Map<string, RetiredModuleNode>
  readonly fileToModulesMap: Map<string, Set<RetiredModuleNode>>
  readonly _unresolvedUrlToModuleMap: Map<string, RetiredModuleNode | Promise<RetiredModuleNode>>
  readonly _hasResolveFailedErrorModules: Set<RetiredModuleNode>
  readonly getModulesByFile: (file: string) => Set<RetiredModuleNode> | undefined
  readonly invalidateModule: (module: RetiredModuleNode) => void
}

function removeModuleFromViteGraph(
  graphValue: unknown,
  virtualId: string,
): void {
  const graph = graphValue as Partial<RetiredModuleGraph>
  if (
    !(graph.urlToModuleMap instanceof Map)
    || !(graph.idToModuleMap instanceof Map)
    || !(graph.etagToModuleMap instanceof Map)
    || !(graph.fileToModulesMap instanceof Map)
    || typeof graph.getModulesByFile !== 'function'
    || typeof graph.invalidateModule !== 'function'
    || !(graph._unresolvedUrlToModuleMap instanceof Map)
    || !(graph._hasResolveFailedErrorModules instanceof Set)
  ) {
    throw new TypeError('Vanity cannot retire a compiler module: the installed Vite module-graph seam is unsupported')
  }

  const unresolvedUrlToModuleMap = graph._unresolvedUrlToModuleMap!
  const modules = [...graph.getModulesByFile!(virtualId) ?? []]
  for (const module of modules) {
    const importers = [...module.importers]
    const etag = module.transformResult?.etag
    // Let Vite clear etags, transform results, SSR state, invalidation state,
    // and importer invalidation before the node is detached from its maps.
    graph.invalidateModule(module)

    for (const importer of module.importers) {
      importer.importedModules.delete(module)
      importer.acceptedHmrDeps.delete(module)
    }
    for (const imported of module.importedModules)
      imported.importers.delete(module)
    module.importers.clear()
    module.importedModules.clear()
    graph._hasResolveFailedErrorModules.delete(module)
    module.invalidationState = undefined

    // Some Vite versions expose a mixed or compatibility node from the
    // lookup above. Re-invalidate the captured importers after detachment so
    // the graph that will serve the next browser request cannot retain a
    // transform produced with the retired namespace URL.
    for (const importer of importers)
      graph.invalidateModule(importer)

    if (graph.urlToModuleMap.get(module.url) === module)
      graph.urlToModuleMap.delete(module.url)
    if (module.id !== null && graph.idToModuleMap.get(module.id) === module)
      graph.idToModuleMap.delete(module.id)
    if (etag && graph.etagToModuleMap.get(etag) === module)
      graph.etagToModuleMap.delete(etag)
    const file = module.file ?? virtualId
    const fileModules = graph.fileToModulesMap.get(file)
    fileModules?.delete(module)
    if (fileModules?.size === 0)
      graph.fileToModulesMap.delete(file)

    for (const [url, candidate] of unresolvedUrlToModuleMap) {
      if (candidate === module) {
        unresolvedUrlToModuleMap.delete(url)
      }
      else if (candidate instanceof Promise) {
        void candidate.then((resolved) => {
          if (resolved === module && unresolvedUrlToModuleMap.get(url) === candidate)
            unresolvedUrlToModuleMap.delete(url)
        }, () => {})
      }
    }
  }
}
