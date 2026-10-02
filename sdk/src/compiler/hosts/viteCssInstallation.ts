/**
 * Development only: retire a compiler stylesheet from a page once that page has
 * installed its replacement, so an edit never leaves a gap or a stale sheet.
 *
 * Each page reports three facts over Vite's native hot channel: the CSS revision
 * it installed (`vanity:css-installed`), the CSS a style source actually imports
 * (`vanity:source-installed`), and when a source leaves the page
 * (`vanity:source-pruned`). A retired URL is pruned for one client only after
 * every source that imported it has installed its current CSS.
 */
import type { HotPayload, ViteDevServer, WebSocketClient } from 'vite'
import { createHash } from 'node:crypto'

interface InstalledSource {
  /** The CSS the source imports now. */
  ids: Set<string>
  /** Every CSS ID the source has imported on this page, so a retired ID finds its sources. */
  readonly history: Set<string>
}

interface CssClient {
  readonly sources: Map<string, InstalledSource>
  readonly installed: Map<string, { readonly revision: string, readonly url: string }>
  readonly retiring: Map<string, { readonly url: string, readonly sources: Set<string> }>
}

export function getCssInstallationRevision(css: string): string {
  return createHash('sha256').update(css).digest('hex')
}

/** A graph node alone cannot establish which page needs which replacement. */
export function createViteCssInstallation(options: {
  readonly server: ViteDevServer
  readonly idsBySource: ReadonlyMap<string, ReadonlySet<string>>
  readonly readCss: (id: string) => string | undefined
  readonly resolveCssId: (url: string) => string | undefined
}) {
  const clients = new Map<WebSocketClient, CssClient>()
  const { server } = options
  const getClient = (client: WebSocketClient): CssClient => {
    let state = clients.get(client)
    if (state === undefined) {
      state = { sources: new Map(), installed: new Map(), retiring: new Map() }
      clients.set(client, state)
      client.socket.once('close', () => clients.delete(client))
    }
    return state
  }

  const finish = (client: WebSocketClient, state: CssClient): void => {
    const paths: string[] = []
    for (const [id, retiring] of state.retiring) {
      if (![...retiring.sources].some(source => state.sources.has(source)))
        continue
      const ready = [...retiring.sources].every((source) => {
        const expected = options.idsBySource.get(source)
        const installedSource = state.sources.get(source)
        if (installedSource === undefined)
          return true
        if (expected === undefined || expected.has(id)
          || expected.size !== installedSource.ids.size
          || [...expected].some(cssId => !installedSource.ids.has(cssId))) {
          return false
        }
        return [...expected].every((cssId) => {
          const css = options.readCss(cssId)
          return css !== undefined && state.installed.get(cssId)?.revision === getCssInstallationRevision(css)
        })
      })
      if (!ready)
        continue
      paths.push(retiring.url)
      state.retiring.delete(id)
      state.installed.delete(id)
      for (const source of state.sources.values())
        source.history.delete(id)
    }
    if (paths.length > 0)
      client.send({ type: 'prune', paths })
  }

  const rememberRetirements = (state: CssClient): void => {
    // Shared CSS wrappers are cached before every importer is known. Actual
    // evaluated source edges, rather than server owners, establish relevance.
    for (const [id, css] of state.installed) {
      const sources = new Set([...state.sources].filter(([, source]) => source.history.has(id)).map(([entry]) => entry))
      if (sources.size > 0 && [...sources].some(source => !options.idsBySource.get(source)?.has(id)))
        state.retiring.set(id, { url: css.url, sources })
    }
  }

  const handleCssInstalled = (data: { id: string, revision: string, url: string }, client: WebSocketClient): void => {
    if (typeof data?.id !== 'string' || typeof data.revision !== 'string' || typeof data.url !== 'string')
      return
    if (options.resolveCssId(data.url) !== data.id)
      return
    const state = getClient(client)
    state.installed.set(data.id, { revision: data.revision, url: data.url })
    // The load snapshot retains the native URL even after graph detachment.
    // Source evaluation follows its CSS dependencies and establishes edges.
    finish(client, state)
  }
  const handleSourceInstalled = (data: { entry: string, ids: string[] }, client: WebSocketClient): void => {
    if (!options.idsBySource.has(data?.entry) || !Array.isArray(data.ids)
      || data.ids.some(id => typeof id !== 'string')) {
      return
    }
    const state = getClient(client)
    const previous = state.sources.get(data.entry)
    const ids = new Set(data.ids)
    state.sources.set(data.entry, { ids, history: new Set([...(previous?.history ?? []), ...ids]) })
    rememberRetirements(state)
    finish(client, state)
  }
  const handleSourcePruned = (data: { entry: string }, client: WebSocketClient): void => {
    const state = clients.get(client)
    if (state === undefined)
      return
    state.sources.delete(data?.entry)
    for (const [id, retiring] of state.retiring) {
      retiring.sources.delete(data?.entry)
      if (retiring.sources.size === 0) {
        client.send({ type: 'prune', paths: [retiring.url] })
        state.retiring.delete(id)
      }
    }
    finish(client, state)
    for (const id of state.installed.keys()) {
      if (![...state.sources.values()].some(source => source.history.has(id)))
        state.installed.delete(id)
    }
  }
  const collectRetirement = (id: string, urls: readonly string[]): void => {
    for (const [client, state] of clients) {
      if (!state.installed.has(id))
        continue
      const sources = new Set([...state.sources].filter(([, source]) => source.history.has(id)).map(([entry]) => entry))
      if (sources.size === 0)
        continue
      for (const url of urls)
        state.retiring.set(id, { url, sources })
      finish(client, state)
    }
  }

  // Overlapping native import-analysis passes can rediscover a detached
  // import and broadcast a premature prune. Compiler CSS retirement still
  // belongs to this projection; every other native payload passes through.
  const nativeSend = server.ws.send
  const send: typeof server.ws.send = (payload: HotPayload | string, data?: unknown): void => {
    if (typeof payload === 'string') {
      nativeSend.call(server.ws, payload, data)
      return
    }
    if (payload.type === 'full-reload')
      clients.clear()
    if (payload.type === 'prune') {
      const otherPaths: string[] = []
      for (const url of payload.paths) {
        const id = options.resolveCssId(url)
        if (id === undefined)
          otherPaths.push(url)
        else
          collectRetirement(id, [url])
      }
      if (otherPaths.length > 0)
        (nativeSend as (payload: HotPayload) => void).call(server.ws, { ...payload, paths: otherPaths })
      return
    }
    ;(nativeSend as (payload: HotPayload) => void).call(server.ws, payload)
  }
  server.ws.send = send

  server.ws.on('vanity:css-installed', handleCssInstalled)
  server.ws.on('vanity:source-installed', handleSourceInstalled)
  server.ws.on('vanity:source-pruned', handleSourcePruned)

  const clear = (): void => clients.clear()
  const removeInstallation = (): void => {
    if (server.ws.send === send)
      server.ws.send = nativeSend
    server.ws.off('vanity:css-installed', handleCssInstalled)
    server.ws.off('vanity:source-installed', handleSourceInstalled)
    server.ws.off('vanity:source-pruned', handleSourcePruned)
    clear()
  }
  server.httpServer?.once('close', removeInstallation)

  return {
    removeInstallation,
    collectRetirement,
    renderSourceCode: (code: string, entry: string, ids: ReadonlySet<string>): string => `${code}\nif (import.meta.hot) {\nimport.meta.hot.send('vanity:source-installed', ${JSON.stringify({ entry, ids: [...ids] })});\nimport.meta.hot.prune(() => import.meta.hot.send('vanity:source-pruned', ${JSON.stringify({ entry })}));\n}`,
  }
}
