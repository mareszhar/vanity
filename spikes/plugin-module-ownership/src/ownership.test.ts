import type { Plugin, ViteDevServer } from 'vite'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build, createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
const servers: ViteDevServer[] = []
const watchers: Array<{ close: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(watchers.splice(0).map(watcher => watcher.close()))
  await Promise.all(servers.splice(0).map(server => server.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 50,
  })))
})

async function createProject(name: string): Promise<string> {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), `vanity-module-ownership-${name}-`)))
  roots.push(root)
  await writeFile(path.join(root, 'index.html'), '<!doctype html><script type="module" src="/src/main.js"></script>')
  await mkdir(path.join(root, 'src'), { recursive: true })
  return root
}

async function writeProjectFile(root: string, file: string, contents: string): Promise<string> {
  const absolutePath = path.join(root, file)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, contents)
  return absolutePath
}

async function writeInstalledPackage(root: string, name: string, files: Record<string, string>): Promise<void> {
  const packageRoot = path.join(root, 'node_modules', name)
  for (const [file, contents] of Object.entries(files)) {
    const absolutePath = path.join(packageRoot, file)
    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, contents)
  }
}

async function configureServerFor(root: string, plugins: Plugin[], options: Record<string, unknown> = {}): Promise<ViteDevServer> {
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins,
    server: { port: 0, strictPort: false },
    ...options,
  })
  servers.push(server)
  return server
}

async function createServerFor(root: string, plugins: Plugin[], options: Record<string, unknown> = {}): Promise<ViteDevServer> {
  const server = await configureServerFor(root, plugins, options)
  await server.listen()
  return server
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createProjectionPlugin(member: string, calls: string[]): Plugin {
  const memberPath = path.resolve(member)
  return {
    name: 'neutral-module-projection',
    load(id) {
      calls.push(id)
      const [file] = id.split('?')
      if (path.resolve(file) !== memberPath)
        return null

      return {
        code: 'export const answer = 42; export const projected = true;\n',
        map: { mappings: '' },
      }
    },
  }
}

type NarrowingStrategy = 'per-host' | 'growing-union'

interface NarrowingPluginState {
  calls: string[]
  devFilterCompiled: { load: boolean, resolveId: boolean }
  filterHistory: Array<{ filter: object | undefined, members: string[] }>
  holds: { load: boolean, resolveId: boolean }
  loadHook: { filter?: { id: RegExp }, handler: (this: { environment: { mode: string } }, id: string) => string | null }
  plugin: Plugin
  resolveCalls: string[]
  resolveHook: { filter?: { id: RegExp }, handler: (this: { environment: { mode: string } }, source: string, importer?: string) => string | null }
  sourceMembers: Set<string>
}

function createNarrowingPlugin(strategy: NarrowingStrategy, waitAfterNarrowing?: (root: string) => Promise<void>): NarrowingPluginState {
  const calls: string[] = []
  const resolveCalls: string[] = []
  const sourceMembers = new Set<string>()
  const narrowedMembers = new Set<string>()
  const filterHistory: NarrowingPluginState['filterHistory'] = []
  const holds = { load: false, resolveId: false }
  const devFilterCompiled = { load: false, resolveId: false }
  const loadHook: NarrowingPluginState['loadHook'] = {
    handler(id) {
      calls.push(id)
      if (this.environment.mode === 'dev' && !devFilterCompiled.load) {
        devFilterCompiled.load = true
        holds.load = false
      }
      if (!sourceMembers.has(path.resolve(id.split('?')[0])))
        return null

      return 'export const source = "projected";\n'
    },
  }
  const resolveHook: NarrowingPluginState['resolveHook'] = {
    handler(source, importer) {
      resolveCalls.push(`${importer ?? ''} -> ${source}`)
      if (this.environment.mode === 'dev' && !devFilterCompiled.resolveId) {
        devFilterCompiled.resolveId = true
        holds.resolveId = false
      }
      if (source === 'virtual:neutral-noop' && importer)
        return path.join(path.dirname(importer), 'noop.js')
      return null
    },
  }

  const plugin: Plugin = {
    name: `neutral-narrowing-${strategy}`,
    enforce: 'pre',
    config(config, environment) {
      if (config.build?.watch) {
        holds.load = true
        holds.resolveId = true
        loadHook.filter = undefined
      }
      else if (environment.command === 'serve') {
        if (!devFilterCompiled.load)
          holds.load = true
        loadHook.filter = undefined
        if (!devFilterCompiled.resolveId)
          holds.resolveId = true
        resolveHook.filter = undefined
      }
      if (config.build?.watch) {
        loadHook.filter = undefined
        resolveHook.filter = undefined
      }
    },
    load: loadHook as Plugin['load'],
    resolveId: resolveHook as Plugin['resolveId'],
    async configResolved(config) {
      const member = path.join(config.root, 'src/member.js')
      sourceMembers.add(member)

      if (config.command !== 'build' || config.build.watch)
        return

      if (!holds.resolveId)
        resolveHook.filter = { id: /^virtual:neutral-noop$/ }

      if (strategy === 'per-host')
        narrowedMembers.clear()
      narrowedMembers.add(member)

      const members = [...narrowedMembers]
      if (!holds.load) {
        loadHook.filter = { id: new RegExp(`^(?:${members.map(escapeRegex).join('|')})(?:\\?.*)?$`) }
        filterHistory.push({ filter: loadHook.filter, members })
      }
      await waitAfterNarrowing?.(config.root)
    },
  }

  return { calls, devFilterCompiled, filterHistory, holds, loadHook, plugin, resolveCalls, resolveHook, sourceMembers }
}

async function createBuildProject(name: string): Promise<{ member: string, plain: string, root: string }> {
  const root = await createProject(name)
  const member = await writeProjectFile(root, 'src/member.js', `export const source = "${name}-disk";\n`)
  const plain = await writeProjectFile(root, 'src/plain.js', `export const plain = "${name}-plain";\n`)
  await writeProjectFile(root, 'src/noop.js', 'export {};\n')
  await writeProjectFile(root, 'src/main.js', 'import "virtual:neutral-noop"; import { source } from "./member.js"; import { plain } from "./plain.js"; export { source, plain };\n')
  return { member, plain, root }
}

async function buildProject(root: string, ssr: boolean, plugins: Plugin[] = []): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins,
    build: {
      write: false,
      minify: false,
      ...(ssr ? { ssr: 'src/main.js' } : { lib: { entry: 'src/main.js', formats: ['es'] } }),
    },
  })
  return collectBuildOutput(result).map(chunk => chunk.code).join('\n')
}

function collectBuildOutput(output: unknown): Array<{ code: string, fileName: string, map?: { mappings: string } }> {
  const outputs = (Array.isArray(output) ? output : [output]) as Array<{ output: Array<{ type: string, code?: string, fileName: string, map?: { mappings: string } }> }>
  return outputs.flatMap(result => result.output)
    .filter((item): item is typeof item & { code: string, fileName: string } => item.type === 'chunk' && item.code !== undefined)
}

describe('module ownership', () => {
  it('measures invocation counts and build times for owned and unowned graph shapes', async () => {
    const root = await createProject('host-tax')
    const count = 80
    const modules = Array.from({ length: count }, (_, index) => `./plain/m${index}.js`)
    for (let index = 0; index < count; index++) {
      const next = index + 1 < count ? `import { value as next } from './m${index + 1}.js';\n` : ''
      await writeProjectFile(root, `src/plain/m${index}.js`, `${next}export const value = ${index}${next ? ' + next' : ''};\n`)
    }
    await writeProjectFile(root, 'src/style.css.ts', 'export const style = { color: "red" };\n')
    await writeProjectFile(root, 'src/main.js', `${modules.map((file, index) => `import { value as value${index} } from '${file}';`).join('\n')}\nimport { style } from './style.css.ts';\nconsole.log(style, ${modules.map((_, index) => `value${index}`).join(' + ')});\n`)

    const unownedPrefix = path.join(root, 'src', 'plain')
    const timings: Record<string, number> = {}
    const counts: Record<string, number> = {}
    const run = async (name: string, plugin?: Plugin) => {
      const started = performance.now()
      await build({
        configFile: false,
        logLevel: 'silent',
        root,
        plugins: plugin ? [plugin] : [],
        build: { write: false, minify: false, rollupOptions: { input: path.join(root, 'index.html') } },
      })
      timings[name] = Math.round(performance.now() - started)
    }

    let nestedResolveCalls = 0
    const resolutionSamples: string[] = []
    await run('nested resolve', {
      name: 'nested-resolution',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (importer?.startsWith(root)) {
          nestedResolveCalls++
          if (resolutionSamples.length < 3)
            resolutionSamples.push(`${importer} -> ${source}`)
          await this.resolve(source, importer, { ...options, skipSelf: true })
        }
        return null
      },
    })
    counts['nested resolve'] = nestedResolveCalls

    let unfilteredLoads = 0
    await run('unfiltered load', {
      name: 'unfiltered-load',
      load(id) {
        if (id.startsWith(unownedPrefix))
          unfilteredLoads++
        return null
      },
    })
    counts['unfiltered load'] = unfilteredLoads

    let filteredLoads = 0
    await run('native filter', {
      name: 'native-filtered-load',
      load: {
        filter: { id: /^\0vanity(?:[:/]|$)/ },
        handler() {
          filteredLoads++
          return null
        },
      },
    })
    counts['native filter'] = filteredLoads

    await run('no plugin')
    counts['no plugin'] = 0

    console.info('MO1 unowned handler invocations:', counts)
    console.info('MO1 nested resolve samples:', resolutionSamples)
    console.info('MO1 build times (ms, informational):', timings)
    expect(counts['nested resolve']).toBeGreaterThan(0)
    expect(counts['unfiltered load']).toBe(count)
    expect(counts['native filter']).toBe(0)
    expect(counts['no plugin']).toBe(0)
  }, 60_000)

  it('holds narrowing until the first dev call, then narrows builds while dev servers keep the absent cache', async () => {
    const state = createNarrowingPlugin('growing-union')
    const firstDev = await createBuildProject('first-dev-cache')
    const firstServer = await configureServerFor(firstDev.root, [state.plugin], { optimizeDeps: { noDiscovery: true } })
    expect(state.holds.load).toBe(true)
    expect(state.holds.resolveId).toBe(true)
    expect(state.loadHook.filter).toBeUndefined()
    expect(state.resolveHook.filter).toBeUndefined()

    // This build starts in the one window where a dev host has configured the
    // plugin but has not yet made the hook call that proves its cache is safe.
    const unfilteredBuild = await createBuildProject('before-first-dev-call')
    const beforeFirstCall = state.calls.length
    const unfilteredCode = await buildProject(unfilteredBuild.root, false, [state.plugin])
    const exceptionCalls = state.calls.slice(beforeFirstCall)
    expect(unfilteredCode).toContain('projected')
    expect(exceptionCalls.some(id => path.resolve(id.split('?')[0]) === unfilteredBuild.member)).toBe(true)
    expect(exceptionCalls.some(id => path.resolve(id.split('?')[0]) === unfilteredBuild.plain)).toBe(true)
    expect(state.loadHook.filter).toBeUndefined()
    expect(state.resolveHook.filter).toBeUndefined()
    expect(state.holds.load).toBe(true)
    expect(state.holds.resolveId).toBe(true)

    const firstMember = await firstServer.transformRequest('/src/member.js')
    expect(firstMember?.code).toContain('projected')
    expect(state.devFilterCompiled.load).toBe(true)
    expect(state.devFilterCompiled.resolveId).toBe(true)
    expect(state.holds.load).toBe(false)
    expect(state.holds.resolveId).toBe(false)

    const followingBuild = await createBuildProject('build-after-first-dev-call')
    const beforeNarrowBuild = state.calls.length
    const buildCode = await buildProject(followingBuild.root, false, [state.plugin])
    const narrowedBuildCalls = state.calls.slice(beforeNarrowBuild)
    expect(buildCode).toContain('projected')
    expect(narrowedBuildCalls.length).toBeGreaterThan(0)
    expect(narrowedBuildCalls.every(id => path.resolve(id.split('?')[0]) === followingBuild.member)).toBe(true)
    expect(state.loadHook.filter?.id.test(followingBuild.member)).toBe(true)
    // The build that ran under the development hold still joins the union,
    // although its own hooks remained unfiltered.
    expect(state.loadHook.filter?.id.test(unfilteredBuild.member)).toBe(true)
    expect(state.resolveHook.filter?.id.test('virtual:neutral-noop')).toBe(true)

    const laterDev = await createBuildProject('later-dev-cache')
    const laterServer = await configureServerFor(laterDev.root, [state.plugin], { optimizeDeps: { noDiscovery: true } })
    const betweenConfigAndRequest = await createBuildProject('between-later-config-and-request')
    const beforeLaterBuild = state.calls.length
    const laterBuildCode = await buildProject(betweenConfigAndRequest.root, false, [state.plugin])
    const laterBuildCalls = state.calls.slice(beforeLaterBuild)
    expect(laterBuildCode).toContain('projected')
    expect(laterBuildCalls.every(id => path.resolve(id.split('?')[0]) === betweenConfigAndRequest.member)).toBe(true)
    expect(state.loadHook.filter?.id.test(betweenConfigAndRequest.member)).toBe(true)
    expect(state.loadHook.filter?.id.test(laterDev.plain)).toBe(false)

    const beforeLaterDev = state.calls.length
    const laterPlain = await laterServer.transformRequest('/src/plain.js')
    expect(laterPlain?.code).toContain('later-dev-cache-plain')
    // The build narrowed the shared hook after this server was configured,
    // but Vite reuses the absent filter compiled by the first dev server.
    expect(state.calls.slice(beforeLaterDev).some(id => path.resolve(id.split('?')[0]) === laterDev.plain)).toBe(true)
    const laterMember = await laterServer.transformRequest('/src/member.js')
    expect(laterMember?.code).toContain('projected')
    expect(state.calls.some(id => path.resolve(id.split('?')[0]) === laterDev.member)).toBe(true)

    const lastDev = await createBuildProject('last-dev-cache')
    const lastServer = await configureServerFor(lastDev.root, [state.plugin], { optimizeDeps: { noDiscovery: true } })
    const lastBuild = await createBuildProject('build-before-last-dev-call')
    const lastBuildCode = await buildProject(lastBuild.root, false, [state.plugin])
    expect(lastBuildCode).toContain('projected')
    expect(state.loadHook.filter?.id.test(lastDev.plain)).toBe(false)
    const beforeLastDev = state.calls.length
    const lastPlain = await lastServer.transformRequest('/src/plain.js')
    expect(lastPlain?.code).toContain('last-dev-cache-plain')
    expect(state.calls.slice(beforeLastDev).some(id => path.resolve(id.split('?')[0]) === lastDev.plain)).toBe(true)
  }, 60_000)

  it('narrows sequential client and SSR builds to a growing filter union', async () => {
    const state = createNarrowingPlugin('growing-union')
    const client = await createBuildProject('sequential-client')
    const beforeClient = state.calls.length
    const clientCode = await buildProject(client.root, false, [state.plugin])
    const clientCalls = state.calls.slice(beforeClient)
    expect(clientCode).toContain('projected')
    expect(clientCalls.length).toBeGreaterThan(0)
    expect(clientCalls.every(id => path.resolve(id.split('?')[0]) === client.member)).toBe(true)

    const ssr = await createBuildProject('sequential-ssr')
    const beforeSsr = state.calls.length
    const ssrCode = await buildProject(ssr.root, true, [state.plugin])
    const ssrCalls = state.calls.slice(beforeSsr)
    expect(ssrCode).toContain('projected')
    expect(ssrCalls.length).toBeGreaterThan(0)
    expect(ssrCalls.every(id => path.resolve(id.split('?')[0]) === ssr.member)).toBe(true)
    expect(state.filterHistory.map(entry => entry.members)).toEqual([[client.member], [client.member, ssr.member]])
    expect(state.filterHistory[0].filter).not.toBe(state.filterHistory[1].filter)
  }, 60_000)

  it('shows the per-host race and keeps concurrent client and SSR builds projected with a growing union', async () => {
    const runConcurrent = async (strategy: NarrowingStrategy, label: string) => {
      const client = await createBuildProject(`${label}-client`)
      const ssr = await createBuildProject(`${label}-ssr`)
      let releaseSsr!: () => void
      let clientAtConfig!: () => void
      const ssrReleased = new Promise<void>((resolve) => {
        releaseSsr = resolve
      })
      const clientConfigured = new Promise<void>((resolve) => {
        clientAtConfig = resolve
      })
      const state = createNarrowingPlugin(strategy, async (root) => {
        if (root === client.root) {
          clientAtConfig()
          await ssrReleased
        }
        else if (root === ssr.root) {
          await clientConfigured
          releaseSsr()
        }
      })

      const clientBuild = buildProject(client.root, false, [state.plugin])
      const clientCodeStarted = clientConfigured
      await clientCodeStarted
      const ssrBuild = buildProject(ssr.root, true, [state.plugin])
      const [clientCode, ssrCode] = await Promise.all([clientBuild, ssrBuild])
      return { client, clientCode, calls: state.calls, filterHistory: state.filterHistory, ssr, ssrCode }
    }

    const perHost = await runConcurrent('per-host', 'per-host-race')
    expect(perHost.clientCode).toContain('per-host-race-client-disk')
    expect(perHost.clientCode).not.toContain('projected')
    expect(perHost.ssrCode).toContain('projected')
    expect(perHost.calls.some(id => path.resolve(id.split('?')[0]) === perHost.client.member)).toBe(false)
    expect(perHost.calls.some(id => path.resolve(id.split('?')[0]) === perHost.ssr.member)).toBe(true)

    const union = await runConcurrent('growing-union', 'growing-union')
    expect(union.clientCode).toContain('projected')
    expect(union.ssrCode).toContain('projected')
    expect(union.calls.some(id => path.resolve(id.split('?')[0]) === union.client.member)).toBe(true)
    expect(union.calls.some(id => path.resolve(id.split('?')[0]) === union.ssr.member)).toBe(true)
    expect(union.filterHistory.map(entry => entry.members)).toEqual([[union.client.member], [union.client.member, union.ssr.member]])
    expect(union.filterHistory[0].filter).not.toBe(union.filterHistory[1].filter)
  }, 60_000)

  it('snapshots hook filters once for a watch host, across hook calls and rebuilds', async () => {
    const root = await createBuildProject('watch-filter-cache')
    await writeProjectFile(root.root, 'src/main.js', 'import { source } from "./member.js"; import { plain } from "./plain.js"; export { source, plain };\n')
    const calls: string[] = []
    const hook: { filter: { id: RegExp }, handler: (id: string) => null } = {
      filter: { id: /member\.js(?:\?.*)?$/ },
      handler(id) {
        calls.push(id)
        hook.filter = { id: /plain\.js(?:\?.*)?$/ }
        return null
      },
    }
    let finishInitialBuild!: () => void
    const initialBuildFinished = new Promise<void>((resolve) => {
      finishInitialBuild = resolve
    })
    const plugin: Plugin = {
      name: 'neutral-watch-filter-cache',
      load: hook as Plugin['load'],
    }

    const output = await build({
      configFile: false,
      logLevel: 'silent',
      root: root.root,
      plugins: [plugin],
      build: {
        write: false,
        minify: false,
        watch: { watcher: { usePolling: true, pollInterval: 50 } },
        lib: { entry: 'src/main.js', formats: ['es'] },
      },
    })
    const watcher = output as unknown as {
      close: () => Promise<void>
      on: (event: 'event', callback: (event: { code: string }) => void) => void
    }
    watchers.push(watcher)
    watcher.on('event', (event) => {
      if (event.code === 'END')
        finishInitialBuild()
    })
    await initialBuildFinished
    expect(calls.some(id => path.resolve(id.split('?')[0]) === root.member)).toBe(true)
    expect(calls.some(id => path.resolve(id.split('?')[0]) === root.plain)).toBe(false)
    expect(hook.filter.id.test(root.plain)).toBe(true)

    let finishRebuild!: () => void
    const rebuilt = new Promise<void>((resolve) => {
      finishRebuild = resolve
    })
    watcher.on('event', (event) => {
      if (event.code === 'END')
        finishRebuild()
    })
    await writeProjectFile(root.root, 'src/main.js', 'import { source } from "./member.js"; import { plain } from "./plain.js"; console.log(source, plain);\n')
    await rebuilt

    expect(calls.some(id => path.resolve(id.split('?')[0]) === root.member)).toBe(true)
    expect(calls.some(id => path.resolve(id.split('?')[0]) === root.plain)).toBe(false)
    expect(hook.filter.id.test(root.plain)).toBe(true)
  }, 60_000)

  it('lets the dependency scanner read authored member source but stops at a virtual scan ID', async () => {
    const root = await createProject('scan-shield')
    const member = await writeProjectFile(root, 'src/member.js', 'import "scan-visible"; import "virtual:scan-stop"; export const value = "authored";\n')
    await writeProjectFile(root, 'src/scan-stop.js', 'import "scan-hidden"; export {};\n')
    await writeProjectFile(root, 'src/main.js', 'import { value } from "./member.js"; console.log(value);\n')
    await writeInstalledPackage(root, 'scan-visible', {
      'package.json': JSON.stringify({ name: 'scan-visible', version: '1.0.0', type: 'module', exports: './index.js' }),
      'index.js': 'export const visible = true;\n',
    })
    await writeInstalledPackage(root, 'scan-hidden', {
      'package.json': JSON.stringify({ name: 'scan-hidden', version: '1.0.0', type: 'module', exports: './index.js' }),
      'index.js': 'export const hidden = true;\n',
    })
    const scanResolutions: Array<{ importer?: string, source: string }> = []
    const loads: string[] = []
    const plugin: Plugin = {
      name: 'neutral-scan-shield',
      enforce: 'pre',
      resolveId(source, importer, options) {
        const scan = (options as typeof options & { scan?: boolean }).scan
        if (scan)
          scanResolutions.push({ importer, source })
        if (source === 'virtual:scan-stop')
          return scan ? '\0scan-stop' : path.join(root, 'src/scan-stop.js')
        return null
      },
      load(id) {
        loads.push(id)
        if (path.resolve(id.split('?')[0]) === member)
          return 'export const value = "projected";\n'
        return null
      },
    }
    const server = await createServerFor(root, [plugin], {
      optimizeDeps: { entries: ['src/main.js'], force: true },
    })
    await server.environments.client.depsOptimizer?.scanProcessing
    const discovered = server.environments.client.depsOptimizer?.metadata.discovered ?? {}
    expect(Object.keys(discovered)).toContain('scan-visible')
    expect(Object.keys(discovered)).not.toContain('scan-hidden')
    expect(scanResolutions.some(call => call.source === './member.js' && call.importer?.endsWith('/src/main.js'))).toBe(true)
    expect(scanResolutions.some(call => call.source === 'virtual:scan-stop')).toBe(true)
    expect(loads.some(id => path.resolve(id.split('?')[0]) === member)).toBe(false)

    const transformed = await server.transformRequest('/src/member.js')
    expect(transformed?.code).toContain('value = "projected"')
    expect(loads.some(id => path.resolve(id.split('?')[0]) === member)).toBe(true)
  }, 60_000)

  it('pre-bundles physical packages by default and honors exclusions and explicit subpath includes', async () => {
    const makeFixture = async (name: string) => {
      const root = await createProject(name)
      await writeProjectFile(root, 'src/main.js', 'import { parent } from "installed-parent"; console.log(parent);\n')
      await writeInstalledPackage(root, 'installed-parent', {
        'package.json': JSON.stringify({ name: 'installed-parent', version: '1.0.0', type: 'module', exports: './index.js' }),
        'index.js': 'import { child } from "excluded-child"; export const parent = child;\n',
      })
      await writeInstalledPackage(root, 'excluded-child', {
        'package.json': JSON.stringify({ name: 'excluded-child', version: '1.0.0', type: 'module', exports: { '.': './index.js', './subpath': './subpath.js' } }),
        'index.js': 'export const child = 1;\n',
        'subpath.js': 'export const subpath = 2;\n',
      })
      return root
    }
    const makePlugin = (exclude: string[], include: string[] = []) => {
      const resolveCalls: Array<{ scan: boolean, source: string }> = []
      const loadedPackages: string[] = []
      const plugin: Plugin = {
        name: `neutral-optimizer-${exclude.join('-') || 'default'}`,
        enforce: 'pre',
        config(config) {
          config.optimizeDeps ??= {}
          config.optimizeDeps.exclude = [...config.optimizeDeps.exclude ?? [], ...exclude]
          config.optimizeDeps.include = [...config.optimizeDeps.include ?? [], ...include]
        },
        resolveId(source, _importer, options) {
          if (source === 'installed-parent' || source.startsWith('excluded-child'))
            resolveCalls.push({ scan: Boolean((options as typeof options & { scan?: boolean }).scan), source })
          return null
        },
        load(id) {
          if (id.includes('/node_modules/installed-parent/'))
            loadedPackages.push(id)
          return null
        },
      }
      return { loadedPackages, plugin, resolveCalls }
    }
    const waitForOptimized = async (server: ViteDevServer, id: string) => {
      const started = Date.now()
      while (Date.now() - started < 5_000) {
        const info = server.environments.client.depsOptimizer?.metadata.optimized[id]
        if (info)
          return info
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      throw new Error(`dependency ${id} was not optimized`)
    }

    const defaultRoot = await makeFixture('optimizer-default')
    const defaultPlugin = makePlugin([])
    const defaultServer = await createServerFor(defaultRoot, [defaultPlugin.plugin], {
      optimizeDeps: { entries: ['src/main.js'], force: true },
    })
    await defaultServer.environments.client.depsOptimizer?.scanProcessing
    const defaultMain = await defaultServer.transformRequest('/src/main.js')
    expect(defaultMain?.code).toContain('/node_modules/.vite/deps/installed-parent.js')
    expect(defaultPlugin.resolveCalls.some(call => call.scan && call.source === 'installed-parent')).toBe(true)
    expect(defaultPlugin.resolveCalls.some(call => !call.scan && call.source === 'installed-parent')).toBe(true)
    expect(defaultPlugin.loadedPackages).toEqual([])
    const optimizedParent = await waitForOptimized(defaultServer, 'installed-parent')
    const optimizedParentCode = await readFile(optimizedParent.file, 'utf8')
    expect(optimizedParentCode).not.toContain('from "excluded-child"')

    const childExcludedRoot = await makeFixture('optimizer-child-excluded')
    const childExcludedPlugin = makePlugin(['excluded-child'])
    const childExcludedServer = await createServerFor(childExcludedRoot, [childExcludedPlugin.plugin], {
      optimizeDeps: { entries: ['src/main.js'], force: true },
    })
    await childExcludedServer.environments.client.depsOptimizer?.scanProcessing
    const childExcludedParent = await waitForOptimized(childExcludedServer, 'installed-parent')
    const childExcludedCode = await readFile(childExcludedParent.file, 'utf8')
    expect(childExcludedCode).toContain('from "excluded-child"')
    expect(childExcludedServer.environments.client.depsOptimizer?.metadata.optimized['excluded-child']).toBeUndefined()

    const parentExcludedRoot = await makeFixture('optimizer-parent-excluded')
    const parentExcludedPlugin = makePlugin(['installed-parent'])
    const parentExcludedServer = await createServerFor(parentExcludedRoot, [parentExcludedPlugin.plugin], {
      optimizeDeps: { entries: ['src/main.js'], force: true },
    })
    await parentExcludedServer.environments.client.depsOptimizer?.scanProcessing
    const parentExcludedMain = await parentExcludedServer.transformRequest('/src/main.js')
    expect(parentExcludedServer.environments.client.depsOptimizer?.metadata.optimized['installed-parent']).toBeUndefined()
    expect(parentExcludedMain?.code).toContain('/node_modules/installed-parent/index.js')
    await parentExcludedServer.transformRequest('/node_modules/installed-parent/index.js')
    expect(parentExcludedPlugin.loadedPackages.some(id => path.resolve(id.split('?')[0]).endsWith('/node_modules/installed-parent/index.js'))).toBe(true)

    const subpathRoot = await makeFixture('optimizer-excluded-subpath-included')
    const subpathPlugin = makePlugin(['installed-parent', 'excluded-child'], ['excluded-child/subpath'])
    const subpathServer = await createServerFor(subpathRoot, [subpathPlugin.plugin], {
      optimizeDeps: { entries: ['src/main.js'], force: true },
    })
    await subpathServer.environments.client.depsOptimizer?.scanProcessing
    await waitForOptimized(subpathServer, 'excluded-child/subpath')
    expect(subpathServer.environments.client.depsOptimizer?.metadata.optimized['installed-parent']).toBeUndefined()
  }, 60_000)

  it('routes installed JavaScript through load only when SSR externalization is disabled', async () => {
    const makeFixture = async (name: string) => {
      const root = await createProject(name)
      const packageEntry = path.join(root, 'node_modules/installed-ssr/index.js')
      await writeProjectFile(root, 'src/main.js', 'import { source } from "installed-ssr"; export { source };\n')
      await writeInstalledPackage(root, 'installed-ssr', {
        'package.json': JSON.stringify({ name: 'installed-ssr', version: '1.0.0', type: 'module', exports: './index.js' }),
        'index.js': 'export const source = "disk";\n',
      })
      return { packageEntry, root }
    }
    const makePlugin = (packageEntry: string, disableExternalization: boolean) => {
      const resolveCalls: string[] = []
      const loadCalls: string[] = []
      const plugin: Plugin = {
        name: `neutral-ssr-${disableExternalization ? 'no-external' : 'external'}`,
        config(config) {
          if (!disableExternalization)
            return
          config.ssr ??= {}
          const noExternal = config.ssr.noExternal
          config.ssr.noExternal = noExternal === true
            ? true
            : [...Array.isArray(noExternal) ? noExternal : noExternal ? [noExternal] : [], 'installed-ssr']
        },
        resolveId(source) {
          if (source === 'installed-ssr')
            resolveCalls.push(source)
          return null
        },
        load(id) {
          if (path.resolve(id.split('?')[0]) !== packageEntry)
            return null
          loadCalls.push(id)
          return 'export const source = "projected";\n'
        },
      }
      return { loadCalls, plugin, resolveCalls }
    }

    const externalFixture = await makeFixture('ssr-external-default')
    const externalProbe = makePlugin(externalFixture.packageEntry, false)
    const externalServer = await createServerFor(externalFixture.root, [externalProbe.plugin])
    externalProbe.resolveCalls.length = 0
    const externalModule = await externalServer.ssrLoadModule('/src/main.js')
    expect(externalModule.source).toBe('disk')
    expect(externalProbe.resolveCalls).not.toContain('installed-ssr')
    expect(externalProbe.loadCalls).toEqual([])

    const bundledFixture = await makeFixture('ssr-no-external-dev')
    const bundledProbe = makePlugin(bundledFixture.packageEntry, true)
    const bundledServer = await createServerFor(bundledFixture.root, [bundledProbe.plugin])
    const bundledModule = await bundledServer.ssrLoadModule('/src/main.js')
    expect(bundledModule.source).toBe('projected')
    expect(bundledProbe.loadCalls.some(id => path.resolve(id.split('?')[0]) === bundledFixture.packageEntry)).toBe(true)

    const externalBuildFixture = await makeFixture('ssr-external-build')
    const externalBuildProbe = makePlugin(externalBuildFixture.packageEntry, false)
    const externalBuild = await build({
      configFile: false,
      logLevel: 'silent',
      root: externalBuildFixture.root,
      plugins: [externalBuildProbe.plugin],
      build: { ssr: 'src/main.js', write: false, minify: false },
    })
    const externalBuildCode = collectBuildOutput(externalBuild).map(chunk => chunk.code).join('\n')
    expect(externalBuildCode).toMatch(/from ["']installed-ssr["']/)
    expect(externalBuildProbe.resolveCalls).not.toContain('installed-ssr')
    expect(externalBuildProbe.loadCalls).toEqual([])

    const bundledBuildFixture = await makeFixture('ssr-no-external-build')
    const bundledBuildProbe = makePlugin(bundledBuildFixture.packageEntry, true)
    const bundledBuild = await build({
      configFile: false,
      logLevel: 'silent',
      root: bundledBuildFixture.root,
      plugins: [bundledBuildProbe.plugin],
      build: { ssr: 'src/main.js', write: false, minify: false },
    })
    const bundledBuildCode = collectBuildOutput(bundledBuild).map(chunk => chunk.code).join('\n')
    expect(bundledBuildCode).toContain('source = "projected"')
    expect(bundledBuildCode).not.toMatch(/from ["']installed-ssr["']/)
    expect(bundledBuildProbe.loadCalls.some(id => path.resolve(id.split('?')[0]) === bundledBuildFixture.packageEntry)).toBe(true)
  }, 60_000)

  it('filters a substituted member from client and SSR HMR and reloads it on the next request', async () => {
    const root = await createProject('hmr-projection')
    const member = await writeProjectFile(root, 'src/member.js', 'export const value = "authored";\n')
    await writeProjectFile(root, 'src/main.js', 'import { value } from "./member.js"; export { value };\n')
    let loadCount = 0
    let resolveUpdate!: () => void
    const hotUpdateFiles: string[] = []
    const updateHandled = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`handleHotUpdate did not run; observed ${hotUpdateFiles.join(', ') || 'no update hook calls'}`)), 3_000)
      resolveUpdate = () => {
        clearTimeout(timeout)
        resolve()
      }
    })
    let updatedModules: string[] = []
    const plugin: Plugin = {
      name: 'neutral-hmr-projection',
      load(id) {
        if (path.resolve(id.split('?')[0]) !== member)
          return null
        loadCount++
        return `export const value = "projection-${loadCount}";\n`
      },
      handleHotUpdate(context) {
        hotUpdateFiles.push(context.file)
        if (path.resolve(context.file) !== member)
          return
        updatedModules = context.modules.flatMap(module => module.id ? [module.id] : [])
        resolveUpdate()
        return []
      },
    }
    const server = await createServerFor(root, [plugin], { optimizeDeps: { noDiscovery: true } })
    await server.transformRequest('/src/main.js')
    const clientMember = await server.transformRequest('/src/member.js')
    const ssrMain = await server.ssrLoadModule('/src/main.js')
    const clientNode = await server.environments.client.moduleGraph.getModuleByUrl('/src/member.js')
    const ssrNode = await server.environments.ssr.moduleGraph.getModuleByUrl('/src/member.js')
    expect(clientMember?.code).toContain('projection-1')
    expect(ssrMain.value).toBe('projection-2')
    expect(clientNode?.id).toBe(member)
    expect(ssrNode?.id).toBe(member)
    expect(loadCount).toBe(2)

    await writeFile(member, 'export const value = "changed authored source";\n')
    const watcher = server.watcher as unknown as { emit: (event: 'change', file: string) => void }
    watcher.emit('change', member)
    await updateHandled
    expect(updatedModules).toContain(member)

    const nextClientMember = await server.transformRequest('/src/member.js')
    const nextSsrMain = await server.ssrLoadModule('/src/main.js')
    expect(nextClientMember?.code).toContain('projection-3')
    expect(nextSsrMain.value).toBe('projection-4')
    expect(loadCount).toBe(4)
  }, 60_000)

  it('serves generated exports under the physical module ID in client and SSR graphs', async () => {
    const root = await createProject('projection')
    const member = await writeProjectFile(root, 'src/member.js', 'export const answer = "authoring implementation";\n')
    await writeProjectFile(root, 'src/main.js', 'import { answer } from "./member.js"; console.log(answer); export { answer };\n')
    const calls: string[] = []
    const projection = createProjectionPlugin(member, calls)
    const client = await createServerFor(root, [projection], { optimizeDeps: { noDiscovery: true } })
    const clientMain = await client.transformRequest('/src/main.js')
    const clientMember = await client.transformRequest('/src/member.js')
    expect(clientMain?.code).toContain('/src/member.js')
    expect(clientMember?.code).toContain('answer = 42')
    expect(clientMember?.code).not.toContain('authoring implementation')
    const clientNode = await client.environments.client.moduleGraph.getModuleByUrl('/src/member.js')
    expect(clientNode?.id).toBe(member)

    const ssrExports = await client.ssrLoadModule('/src/main.js')
    expect(ssrExports.answer).toBe(42)
    const ssrNode = await client.environments.ssr.moduleGraph.getModuleByUrl('/src/member.js')
    expect(ssrNode?.id).toBe(member)

    let buildMemberId: string | undefined
    let buildMemberCode: string | null | undefined
    const buildOutput = await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [projection, {
        name: 'capture-build-module',
        generateBundle() {
          buildMemberId = [...this.getModuleIds()].find(id => path.resolve(id.split('?')[0]) === member)
          buildMemberCode = buildMemberId ? this.getModuleInfo(buildMemberId)?.code : undefined
        },
      }],
      build: { write: false, minify: false, rollupOptions: { input: path.join(root, 'index.html') } },
    })
    expect(buildMemberId).toBe(member)
    expect(buildMemberCode).toContain('answer = 42')
    const clientChunk = collectBuildOutput(buildOutput).map(chunk => chunk.code).join('\n')
    expect(clientChunk).toContain('42')

    let ssrBuildMemberId: string | undefined
    const ssrBuild = await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [projection, {
        name: 'capture-ssr-build-module',
        generateBundle() {
          ssrBuildMemberId = [...this.getModuleIds()].find(id => path.resolve(id.split('?')[0]) === member)
        },
      }],
      build: { ssr: 'src/main.js', write: false, minify: false },
    })
    expect(ssrBuildMemberId).toBe(member)
    expect(collectBuildOutput(ssrBuild).map(chunk => chunk.code).join('\n')).toContain('42')
    expect(calls.some(id => path.resolve(id.split('?')[0]) === member)).toBe(true)
  }, 60_000)

  it('observes query-bearing load IDs and keeps raw and URL requests host-owned', async () => {
    const root = await createProject('query-domain')
    const member = await writeProjectFile(root, 'src/member.js', 'export const answer = "authored text";\n')
    const calls: string[] = []
    const plugin: Plugin = {
      name: 'neutral-query-probe',
      load(id) {
        calls.push(id)
        const [file, query = ''] = id.split('?')
        if (path.resolve(file) !== member || /(?:^|&)raw(?:=|&|$)|(?:^|&)url(?:=|&|$)/.test(query))
          return null
        return { code: 'export const answer = 42;\n', map: { mappings: '' } }
      },
    }
    const server = await createServerFor(root, [plugin], { optimizeDeps: { noDiscovery: true } })
    const base = server.resolvedUrls?.local?.[0]
    expect(base).toBeTruthy()
    const normal = await fetch(new URL('/src/member.js', base))
    const raw = await fetch(new URL('/src/member.js?raw', base))
    const url = await fetch(new URL('/src/member.js?url', base))
    const imported = await server.environments.client.pluginContainer.load(`${member}?import`)
    const timestamped = await server.transformRequest('/src/member.js?t=123')
    const versioned = await server.transformRequest('/src/member.js?v=123')
    expect((await normal.text())).toContain('answer = 42')
    expect((await raw.text())).toContain('authored text')
    expect((await url.text())).toContain('export default')
    expect(imported).toMatchObject({ code: expect.stringContaining('answer = 42') })
    expect(timestamped?.code).toContain('answer = 42')
    expect(versioned?.code).toContain('answer = 42')
    console.info('MO3 load IDs for normal, raw, URL, import, timestamp, and version requests:', calls)
    expect(calls.some(id => path.resolve(id.split('?')[0]) === member)).toBe(true)
    expect(calls.some(id => id.includes('?import'))).toBe(true)
    expect(calls.some(id => id.includes('?t=123'))).toBe(true)
    expect(calls.some(id => id.includes('?v=123'))).toBe(true)
    expect(calls.some(id => id.includes('?raw'))).toBe(false)
    expect(calls.some(id => id.includes('?url'))).toBe(false)
  }, 60_000)
})
