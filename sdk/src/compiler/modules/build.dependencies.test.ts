import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vanityPlugin } from '@mszr/vanity/vite'
import { createServer } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { createPromiseGate } from '../../test-support/promises'
import { invokeVanityHotUpdate } from '../../test-support/vite'
import { resolveViteVirtualId } from '../hosts/viteHmr'
import * as styleBuild from './build'
import { buildStyleModule } from './build'

const alias = {
  '@mszr/vanity/runtime': join(process.cwd(), 'src/runtime.ts'),
  '@mszr/vanity': join(process.cwd(), 'src/index.ts'),
}
const require = createRequire(import.meta.url)

async function put(root: string, file: string, contents: string): Promise<string> {
  const path = join(root, file)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents)
  return path
}

describe('style dependency ownership', () => {
  const overlaps = ['menu', 'caption'].flatMap(role => ['before', 'during'].flatMap(order => [false, true].flatMap(first => [false, true].flatMap(ssr => [false, true].map(ambient => ({ role, order, first, ssr, ambient }))))))
  it.each(overlaps)('uses current $role exports: save $order bundle, first=$first, SSR=$ssr, ambient=$ambient', async ({ role, order, first, ssr, ambient }) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-overlapping-system-')))
    let server: ViteDevServer | undefined
    let requestOptions: { ssr: boolean }
    const diagnostics: unknown[] = []
    const systemFile = join(root, 'system.ts')
    const styleFile = join(root, 'style.css.ts')
    const system = (font: string, menu = false) => `import { createSystem } from '@mszr/vanity'
const open = createSystem()
const tokens = open.defineTokens({ text: { caption: { fontSize: '12px' }${menu ? ', menu: { fontSize: \'14px\' }' : ''} } })
export const ds = open.addTokens(tokens).consolidate({ prefix: 'overlap' })
export const font = '${font}'
`
    const style = (role: string) => `${ambient ? '' : 'import { ds, font } from \'./system\''}
export const card = ds.class({ ...ds.t.text.${role}.$dec, fontSize: font })
export const proof = font
`
    const styleReady = createPromiseGate()
    const systemReady = createPromiseGate()
    const styleGate = createPromiseGate()
    const systemGate = createPromiseGate()
    let holdStyle = false
    let holdSystem = false
    const build = styleBuild.buildStyleModule
    const spy = vi.spyOn(styleBuild, 'buildStyleModule').mockImplementation(async (params) => {
      const result = await build(params)
      if (params.filePath === styleFile && holdStyle) {
        holdStyle = false
        styleReady.resolve()
        await styleGate.promise
      }
      if (params.filePath === systemFile && holdSystem) {
        holdSystem = false
        systemReady.resolve()
        await systemGate.promise
      }
      return result
    })

    try {
      await put(root, 'package.json', '{ "name": "overlapping-system", "type": "module" }')
      await writeFile(systemFile, system('12px'))
      await writeFile(styleFile, style('caption'))
      await put(root, 'authoring.ts', 'export { ds, font } from \'./system\'\n')
      await put(root, 'initial.css.ts', 'import { ds } from \'./system\'; export const initial = ds.class({ padding: \'1px\' })\n')
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({
          compiler: { system: './system.ts', diagnostics: diagnostic => diagnostics.push(diagnostic) },
          ...(ambient ? { autoImports: { shared: './authoring.ts' } } : {}),
        })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        optimizeDeps: { noDiscovery: true },
      })
      requestOptions = { ssr }
      await server.transformRequest(first ? '/initial.css.ts' : '/style.css.ts', requestOptions)
      await writeFile(styleFile, style(role))
      server.moduleGraph.onFileChange(styleFile)
      for (const environment of Object.values(server.environments))
        environment.moduleGraph.onFileChange(styleFile)
      holdStyle = order === 'during'
      const requestStyle = () => server!.transformRequest('/style.css.ts', requestOptions).then(value => ({ value }), error => ({ error }))
      let outcome = order === 'during' ? requestStyle() : undefined
      if (order === 'during')
        await styleReady.promise
      await writeFile(systemFile, system('14px', true))
      holdSystem = true
      const update = invokeVanityHotUpdate(server, systemFile)
      const updated = update.then(() => ({}), error => ({ error }))
      await systemReady.promise
      outcome ??= requestStyle()
      styleGate.resolve()
      // Complete the known system attempt; no timer or future save is required.
      systemGate.resolve()
      const result = await outcome
      expect(result).not.toHaveProperty('error')
      expect(await updated).not.toHaveProperty('error')
      expect(diagnostics).toEqual([])
      const transformed = 'value' in result ? result.value : undefined
      expect(transformed?.code).toContain('card')
      expect(transformed?.code).toContain('14px')
      const urls = [...transformed!.code.matchAll(/(?:import\s+|__vite_ssr_import__\(\s*)['"]([^'"]+\/style\/[^'"]+\.vanity\.css)['"]/g)].map(match => match[1])
      expect(urls).toHaveLength(1)
      const css = (await Promise.all(urls.map(url => server!.transformRequest(url)))).map(result => result?.code).join('\n')
      expect(css).toMatch(/font-size:\s*14px/)
      expect(css).not.toMatch(/font-size:\s*12px/)
    }
    finally {
      styleGate.resolve()
      systemGate.resolve()
      await server?.close()
      spy.mockRestore()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('loads application tokens from the known pending system instead of accepted exports', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-pending-projection-')))
    const systemFile = join(root, 'system.ts')
    let server: ViteDevServer | undefined
    const ready = createPromiseGate()
    const gate = createPromiseGate()
    const requestReady = createPromiseGate()
    let hold = false
    let observe = false
    const build = styleBuild.buildStyleModule
    const spy = vi.spyOn(styleBuild, 'buildStyleModule').mockImplementation(async (params) => {
      const result = await build(params)
      if (hold && params.filePath === systemFile) {
        hold = false
        ready.resolve()
        await gate.promise
      }
      return result
    })
    const system = (menu: boolean) => `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ text: { caption: { fontSize: '12px' }${menu ? ', menu: { fontSize: \'14px\' }' : ''} } }).consolidate({ prefix: 'pending' })
`
    try {
      await put(root, 'package.json', '{ "name": "pending-projection", "type": "module" }')
      await writeFile(systemFile, system(false))
      await put(root, 'initial.css.ts', 'import { ds } from \'./system\'; export const initial = ds.class({ padding: \'1px\' })\n')
      await put(root, 'entry.ts', 'import { ds } from \'./system\'; export const name = ds.t.text.menu.fontSize.$name\n')
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          { name: 'observe-projection-request', enforce: 'pre', load(id) {
            if (observe && id === systemFile)
              requestReady.resolve()
          } },
          vanityPlugin({ compiler: { system: './system.ts' } }),
        ],
        resolve: { alias },
        optimizeDeps: { noDiscovery: true },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      await server.transformRequest('/initial.css.ts')
      await writeFile(systemFile, system(true))
      hold = true
      const update = invokeVanityHotUpdate(server, systemFile)
      await ready.promise
      observe = true
      const request = server.ssrLoadModule('/entry.ts').then(value => ({ value }), error => ({ error }))
      await requestReady.promise
      gate.resolve()
      await update
      const result = await request
      expect(result).not.toHaveProperty('error')
      expect('value' in result && result.value.name).toBe('--pending-text-menu-font-size')
    }
    finally {
      gate.resolve()
      await server?.close()
      spy.mockRestore()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it.each([false, true])('follows a newer valid system after an outdated attempt, failed=%s', async (failed) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-overlapping-attempt-')))
    const systemFile = join(root, 'system.ts')
    const diagnostics: unknown[] = []
    let server: ViteDevServer | undefined
    const ready = createPromiseGate()
    const gate = createPromiseGate()
    let hold = false
    const build = styleBuild.buildStyleModule
    const spy = vi.spyOn(styleBuild, 'buildStyleModule').mockImplementation(async (params) => {
      const result = await build(params)
      if (hold && params.filePath === systemFile) {
        hold = false
        ready.resolve()
        await gate.promise
      }
      return result
    })
    const system = (font: string) => `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().consolidate({ prefix: 'overlapping' })
export const font = '${font}'
`
    try {
      await put(root, 'package.json', '{ "name": "overlapping-attempt", "type": "module" }')
      await writeFile(systemFile, system('12px'))
      const styleFile = await put(root, 'style.css.ts', 'import { ds, font } from \'./system\'; export const card = ds.class({ fontSize: font }); export const proof = font\n')
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system: './system.ts', diagnostics: diagnostic => diagnostics.push(diagnostic) } })],
        resolve: { alias },
        optimizeDeps: { noDiscovery: true },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      await server.transformRequest('/style.css.ts')
      await writeFile(systemFile, failed ? `${system('13px')}\nthrow new Error('outdated system failure')\n` : system('13px'))
      hold = true
      const priorUpdate = invokeVanityHotUpdate(server, systemFile).then(() => ({}), error => ({ error }))
      await ready.promise
      server.moduleGraph.onFileChange(styleFile)
      for (const environment of Object.values(server.environments))
        environment.moduleGraph.onFileChange(styleFile)
      const request = server.transformRequest('/style.css.ts').then(value => ({ value }), error => ({ error }))
      await writeFile(systemFile, system('14px'))
      await invokeVanityHotUpdate(server, systemFile)
      gate.resolve()
      expect(await priorUpdate).not.toHaveProperty('error')
      const result = await request
      expect(result).not.toHaveProperty('error')
      expect('value' in result && result.value?.code).toContain('14px')
      expect(diagnostics).toEqual([])
    }
    finally {
      gate.resolve()
      await server?.close()
      spy.mockRestore()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('tracks data and user inputs without inheriting engine implementation files', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-dependency-contract-')))

    try {
      await put(root, 'package.json', '{ "name": "dependency-contract", "type": "module" }')
      await put(root, 'color.json', '{ "color": "red" }')
      await put(root, 'helper.ts', 'export const padding = "1px"\n')
      await put(root, 'node_modules/@fixture/palette/package.json', JSON.stringify({
        name: '@fixture/palette',
        type: 'module',
        exports: './index.ts',
      }))
      const installedSource = await put(root, 'node_modules/@fixture/palette/index.ts', 'export const installedColor = "blue"\n')
      await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().consolidate({ prefix: 'dependency' })
`)
      const entry = await put(root, 'style.css.ts', `import config from './color.json'
import { padding } from './helper'
import { installedColor } from '@fixture/palette'
import { ds } from './system'
export const card = ds.class({ color: config.color, background: installedColor, padding })
`)

      const built = await buildStyleModule({ root, filePath: entry, alias })
      const normalized = built.watchFiles

      expect(normalized).toContain(join(root, 'color.json'))
      expect(normalized).toContain(join(root, 'helper.ts'))
      expect(normalized).toContain(installedSource)
      expect(normalized.filter(file => file.includes('/node_modules/')))
        .toEqual([installedSource])
      for (const packageName of ['culori', 'known-css-properties'])
        expect(normalized).not.toContain(require.resolve(packageName))

      // Keep the fixture's data input observable to make the assertion above
      // resistant to a loader that accidentally reads a stale file.
      expect(await readFile(join(root, 'color.json'), 'utf8')).toContain('red')
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('updates a JSON dependency through the same dev server', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-data-hmr-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "data-hmr", "type": "module" }')
      await put(root, 'color.json', '{ "color": "#112233" }')
      await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().consolidate({ prefix: 'data-hmr' })
`)
      await put(root, 'style.css.ts', `import config from './color.json'
import { ds } from './system'
export const card = ds.class({ color: config.color })
`)
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system: join(root, 'system.ts') } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })

      const accepted = await server.transformRequest('/style.css.ts')
      const cssUrl = accepted?.code.match(/import "([^"]*\/style\/[^"]+\.vanity\.css)"/)?.[1]
      expect(cssUrl).toBeDefined()
      const virtualId = resolveViteVirtualId(cssUrl!, root)
      expect(virtualId).toBeDefined()
      expect((await server.transformRequest(virtualId!))?.code).toContain('#112233')

      const data = join(root, 'color.json')
      await writeFile(data, '{ "color": "#445566" }')
      await invokeVanityHotUpdate(server, data)
      expect((await server.transformRequest(virtualId!))?.code).toContain('#445566')

      const vanityEngineDependency = require.resolve('known-css-properties')
      expect(await invokeVanityHotUpdate(server, vanityEngineDependency)).toBeUndefined()
      expect((await server.transformRequest(virtualId!))?.code).toContain('#445566')
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('tracks every input in a configured static re-export graph', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-dependency-')))

    try {
      await put(root, 'package.json', '{ "name": "system-dependency", "type": "module" }')
      const data = await put(root, 'constants.ts', 'export const unrelated = "kept"\n')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().consolidate({ prefix: 'system-dependency' })
`)
      const barrel = await put(root, 'barrel.ts', `export { ds as theme } from './system'
export { unrelated as renamedUnrelated } from './constants'
`)

      const built = await buildStyleModule({
        root,
        filePath: barrel,
        alias,
        namespaceFiles: [barrel, system, data],
      })

      expect(built.watchFiles).toContain(data)
      expect(built.watchFiles).toContain(system)
      expect(built.watchFiles).toContain(barrel)
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })
})
