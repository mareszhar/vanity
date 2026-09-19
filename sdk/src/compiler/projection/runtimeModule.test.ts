import type { Rollup, ViteDevServer } from 'vite'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vanityPlugin } from '@mszr/vanity/vite'
import { build, createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { resolveViteVirtualId } from '../hosts/viteHmr'

const vanityRoot = fileURLToPath(new URL('../../', import.meta.url))
const alias = {
  '@mszr/vanity/runtime': join(vanityRoot, 'runtime.ts'),
  '@mszr/vanity': join(vanityRoot, 'index.ts'),
}

async function put(root: string, file: string, contents: string): Promise<string> {
  const path = join(root, file)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents)
  return path
}

async function hotUpdate(server: ViteDevServer, file: string): Promise<unknown> {
  const plugin = server.config.plugins.find(entry => entry.name === 'vanity-css-ts')
  if (plugin === undefined)
    throw new Error('missing Vanity Vite plugin')

  const modules = [...server.moduleGraph.getModulesByFile(file) ?? []]
  server.moduleGraph.onFileChange(file)
  for (const environment of Object.values(server.environments))
    environment.moduleGraph.onFileChange(file)

  const hook = typeof plugin.handleHotUpdate === 'object'
    ? plugin.handleHotUpdate.handler
    : plugin.handleHotUpdate
  return (hook as (context: object) => Promise<unknown>)({
    file,
    server,
    modules,
    timestamp: Date.now(),
    read: () => readFile(file, 'utf8'),
  })
}

describe('configured system module namespaces', () => {
  it('preserves leaf and ordinary barrel namespaces during style evaluation', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-exports-')))

    try {
      await put(root, 'package.json', '{ "name": "system-exports", "type": "module" }')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'exports' })
`)
      await put(root, 'constants.ts', 'export const unrelated = "kept"\n')
      await put(root, 'barrel.ts', `export { ds as theme } from './system'
export { unrelated as renamedUnrelated } from './constants'
`)
      await put(root, 'style.css.ts', `import { theme, renamedUnrelated } from './barrel'
import { ds } from './system'
export const fromBarrel = theme.class({ color: theme.t.color.brand })
export const fromLeaf = ds.class({ color: ds.t.color.brand })
export const proof = renamedUnrelated
`)
      const entry = await put(root, 'entry.ts', `export { fromBarrel, fromLeaf, proof } from './style.css.ts'
`)

      const result = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        build: {
          write: false,
          minify: false,
          lib: { entry, formats: ['es'], fileName: 'entry' },
        },
      })
      const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
      const css = output.output
        .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
        .map(asset => String(asset.source))
        .join('\n')
      const chunk = output.output.find((item): item is Rollup.OutputChunk => item.type === 'chunk')

      expect(css).toContain('--exports-color-brand:')
      expect(chunk?.code).toContain('kept')
      expect(chunk?.code).toMatch(/fromBarrel|fromLeaf/)
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('projects a one-file system and its destructured members by value identity', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-exports-one-file-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "system-exports-one-file", "type": "module" }')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'one-file' })
export const { class: cls, rules, t } = ds
`)
      await put(root, 'style.css.ts', `import { cls, t } from './system'
export const card = cls({ color: t.color.brand })
`)
      const entry = await put(root, 'entry.ts', `import { ds, cls, rules, t } from './system'
import { card } from './style.css.ts'
export const result = {
  classMember: cls === ds.class,
  rulesMember: rules === ds.rules,
  tokenMember: t === ds.t,
  token: t.color.brand.$name,
  card,
}
`)
      const browserResult = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        build: {
          write: false,
          minify: false,
          lib: { entry, formats: ['es'], fileName: 'entry' },
        },
      })
      const browserOutput = (Array.isArray(browserResult) ? browserResult[0] : browserResult) as Rollup.RollupOutput
      const browserCss = browserOutput.output
        .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
        .map(asset => String(asset.source))
        .join('\n')
      const browserChunk = browserOutput.output.find(
        (item): item is Rollup.OutputChunk => item.type === 'chunk',
      )
      expect(browserCss).toContain('--one-file-color-brand:')
      expect(browserChunk?.code).not.toContain('createSystem')
      expect(browserChunk?.code).not.toContain('addTokens')

      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      const transformed = await server.transformRequest('/entry.ts', { ssr: true })
      expect(transformed?.code).not.toContain('createSystem')
      expect(transformed?.code).not.toContain('addTokens')
      const loaded = await server.ssrLoadModule('/entry.ts') as {
        result: {
          classMember: boolean
          rulesMember: boolean
          tokenMember: boolean
          token: string
          card: string
        }
      }
      expect(loaded.result).toEqual({
        classMember: true,
        rulesMember: true,
        tokenMember: true,
        token: '--one-file-color-brand',
        card: expect.any(String),
      })
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('diagnoses unrelated exports and accepts the same fixture with only type exports', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-exports-diagnostic-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "system-exports-diagnostic", "type": "module" }')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const theme = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'diagnostic' })
export const label = 'ordinary'
`)
      const entry = await put(root, 'entry.ts', `import { label, theme } from './system'
export const result = [label, theme.t.color.brand.$name]
`)

      const create = () => createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      server = await create()
      let failure: unknown
      try {
        await server.ssrLoadModule('/entry.ts')
      }
      catch (error) {
        failure = error
      }
      expect(String(failure)).toContain('VANITY_APP_EXPORT_IN_SYSTEM_MODULE')
      expect(String(failure)).toContain('label')
      expect(String(failure)).toContain('theme')
      expect(String(failure)).toContain('which is not part of')
      expect(String(failure)).toContain('It is ordinary application code')
      expect(String(failure)).toContain('move')
      expect(String(failure)).not.toContain('`ds`')
      const diagnostic = (failure as { diagnostics?: readonly { line?: number, column?: number }[] }).diagnostics?.[0]
      expect(diagnostic?.line).toBeUndefined()
      expect(diagnostic?.column).toBeUndefined()

      await server.close()
      server = undefined
      await writeFile(system, `import { createSystem } from '@mszr/vanity'
export const theme = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'diagnostic' })
export type ThemeName = string
`)
      await writeFile(entry, `import { theme } from './system'
export const result = theme.t.color.brand.$name
`)
      server = await create()
      const loaded = await server.ssrLoadModule('/entry.ts') as { result: string }
      expect(loaded.result).toBe('--diagnostic-color-brand')
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('keeps the export diagnostic grammatical for several unrelated exports', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-exports-diagnostic-count-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "system-exports-diagnostic-count", "type": "module" }')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const theme = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'diagnostic-count' })
export const label = 'ordinary'
export const other = 'also ordinary'
`)
      await put(root, 'entry.ts', `import { label, other, theme } from './system'
export const result = [label, other, theme.t.color.brand.$name]
`)
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })

      let failure: unknown
      try {
        await server.ssrLoadModule('/entry.ts')
      }
      catch (error) {
        failure = error
      }

      expect(String(failure)).toContain('VANITY_APP_EXPORT_IN_SYSTEM_MODULE')
      expect(String(failure)).toContain('`label`, `other`, which are not part of')
      expect(String(failure)).toContain('They are ordinary application code')
      expect(String(failure)).not.toContain('which is not part of')
      expect(String(failure)).not.toContain('It is ordinary application code')
      const diagnostic = (failure as { diagnostics?: readonly { line?: number, column?: number }[] }).diagnostics?.[0]
      expect(diagnostic?.line).toBeUndefined()
      expect(diagnostic?.column).toBeUndefined()
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  for (const configured of [false, true]) {
    it(`preserves ordinary object aliases through a configured barrel (configured=${configured})`, async () => {
      const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-exports-object-')))
      let server: ViteDevServer | undefined

      try {
        await put(root, 'package.json', '{ "name": "system-exports-object", "type": "module" }')
        await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'exports-object' })
`)
        await put(root, 'values.ts', `export const value = { label: 'kept' }
export const alias = value
`)
        const barrel = await put(root, 'barrel.ts', `export { ds as theme } from './system'
export { value as renamed } from './values'
`)
        await put(root, 'entry.ts', `import { renamed } from './barrel'
import { value, alias } from './values'

renamed.label = 'mutated'
export const same = renamed === value && value === alias
export const sharedMutation = value.label === 'mutated' && alias.label === 'mutated'
`)

        server = await createServer({
          root,
          configFile: false,
          logLevel: 'silent',
          plugins: configured ? [vanityPlugin({ compiler: { system: barrel } })] : [],
          resolve: { alias },
          server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        })
        const loaded = await server.ssrLoadModule('/entry.ts') as {
          same: boolean
          sharedMutation: boolean
        }
        expect(loaded).toMatchObject({ same: true, sharedMutation: true })
      }
      finally {
        await server?.close()
        await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
      }
    })

    it(`preserves an ordinary callable re-export and unused function (configured=${configured})`, async () => {
      const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-exports-function-')))
      let server: ViteDevServer | undefined

      try {
        await put(root, 'package.json', '{ "name": "system-exports-function", "type": "module" }')
        await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'exports-function' })
`)
        await put(root, 'values.ts', `export const value = () => 'kept'
export const unused = () => 'unused'
`)
        const barrel = await put(root, 'barrel.ts', `export { ds as theme } from './system'
export { value as renamed } from './values'
export { unused } from './values'
`)
        await put(root, 'entry.ts', `import { renamed } from './barrel'
export const result = renamed()
`)

        server = await createServer({
          root,
          configFile: false,
          logLevel: 'silent',
          plugins: configured ? [vanityPlugin({ compiler: { system: barrel } })] : [],
          resolve: { alias },
          server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        })
        const loaded = await server.ssrLoadModule('/entry.ts') as { result: string }
        expect(loaded.result).toBe('kept')
      }
      finally {
        await server?.close()
        await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
      }
    })
  }

  it('preserves live ordinary bindings across a configured re-export edge', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-exports-live-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "system-exports-live", "type": "module" }')
      await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'exports-live' })
`)
      await put(root, 'values.ts', `export let live = 'v1'
export const setLive = (value: string) => { live = value }
`)
      const barrel = await put(root, 'barrel.ts', `export { ds as theme } from './system'
export { live as renamedLive } from './values'
`)
      await put(root, 'entry.ts', `import { renamedLive } from './barrel'
import { live, setLive } from './values'

setLive('v2')
export const direct = live
export const throughBarrel = renamedLive
`)

      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system: barrel } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      const loaded = await server.ssrLoadModule('/entry.ts') as {
        direct: string
        throughBarrel: string
      }
      expect(loaded).toMatchObject({ direct: 'v2', throughBarrel: 'v2' })
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('preserves barrel and leaf namespaces in browser and SSR application projections', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-exports-app-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "system-exports-app", "type": "module" }')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'exports-app' })
`)
      await put(root, 'constants.ts', 'export const unrelated = "kept"\n')
      await put(root, 'barrel.ts', `export { ds as theme } from './system'
export { unrelated as renamedUnrelated } from './constants'
`)
      const entry = await put(root, 'entry.ts', `import { theme, renamedUnrelated } from './barrel'
import { ds } from './system'

export const barrelName = theme.t.color.brand.$name
export const leafName = ds.t.color.brand.$name
export const sharedRuntime = theme === ds
export const unrelated = renamedUnrelated
`)

      const browserResult = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        build: {
          write: false,
          minify: false,
          lib: { entry, formats: ['es'], fileName: 'entry' },
        },
      })
      const browserOutput = (Array.isArray(browserResult) ? browserResult[0] : browserResult) as Rollup.RollupOutput
      const browserChunk = browserOutput.output.find(
        (item): item is Rollup.OutputChunk => item.type === 'chunk',
      )
      expect(browserChunk?.code).toContain('kept')
      expect(browserChunk?.code).not.toContain('createSystem')

      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      const ssrEntry = await server.transformRequest('/entry.ts', { ssr: true })
      expect(ssrEntry?.code).not.toContain('createSystem')
      expect(ssrEntry?.code).not.toContain('addTokens')
      const loaded = await server.ssrLoadModule('/entry.ts') as {
        barrelName: string
        leafName: string
        sharedRuntime: boolean
        unrelated: string
      }
      expect(loaded).toMatchObject({
        barrelName: '--exports-app-color-brand',
        leafName: '--exports-app-color-brand',
        sharedRuntime: true,
        unrelated: 'kept',
      })
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('keeps ordinary barrel values current through same-server edits', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-exports-hmr-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "system-exports-hmr", "type": "module" }')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'exports-hmr' })
`)
      const constants = await put(root, 'constants.ts', 'export const unrelated = "kept"\n')
      const barrelSource = `export { ds as theme } from './system'
export { unrelated as renamedUnrelated } from './constants'
`
      const barrel = await put(root, 'barrel.ts', barrelSource)
      await put(root, 'entry.ts', `import { theme, renamedUnrelated } from './barrel'
import { ds } from './system'
import * as applicationNamespace from './barrel'
export const shared = theme === ds
export const unrelated = renamedUnrelated
export const added = Reflect.get(applicationNamespace, 'added') ?? null
`)
      await put(root, 'style.css.ts', `import { theme, renamedUnrelated } from './barrel'
import { ds } from './system'
export const fromBarrel = theme.class({ color: theme.t.color.brand })
export const fromLeaf = ds.class({ color: ds.t.color.brand })
export const proof = renamedUnrelated
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
      expect(first?.code).toContain('kept')
      expect(first?.code).toContain('fromBarrel')
      expect(first?.code).toContain('fromLeaf')
      const firstSystemImport = first?.code.match(/import ['"]([^'"]+\.vanity\.css)['"]/)?.[1]
      expect(firstSystemImport).toBeDefined()
      expect((await server.transformRequest(firstSystemImport!))?.code).toContain('#123456')
      await server.transformRequest(firstSystemImport!, { ssr: true })
      const firstVirtualId = resolveViteVirtualId(firstSystemImport!, root)
      expect(Object.values(server.environments).every(environment =>
        (environment.moduleGraph.getModulesByFile(firstVirtualId)?.size ?? 0) > 0)).toBe(true)

      const firstApplication = await server.ssrLoadModule('/entry.ts') as {
        shared: boolean
        unrelated: string
        added: string | null
      }
      expect(firstApplication).toMatchObject({ shared: true, unrelated: 'kept', added: null })

      await writeFile(constants, 'export const unrelated = "updated"\n')
      await expect(hotUpdate(server, constants)).resolves.toBeDefined()
      const updatedApplication = await server.ssrLoadModule('/entry.ts?constant-update') as {
        shared: boolean
        unrelated: string
        added: string | null
      }
      expect(updatedApplication).toMatchObject({ shared: true, unrelated: 'updated', added: null })

      await writeFile(barrel, `${barrelSource}export const added = "interface-change"\n`)
      await expect(hotUpdate(server, barrel)).resolves.toBeDefined()
      const interfaceApplication = await server.ssrLoadModule('/entry.ts?interface-update') as {
        shared: boolean
        unrelated: string
        added: string | null
      }
      expect(interfaceApplication).toMatchObject({
        shared: true,
        unrelated: 'updated',
        added: 'interface-change',
      })

      await writeFile(system, (await readFile(system, 'utf8')).replace('#123456', '#445566'))
      await expect(hotUpdate(server, system)).resolves.toBeDefined()

      const second = await server.transformRequest('/style.css.ts')
      expect(second?.code).toContain('updated')
      expect(second?.code).toContain('fromBarrel')
      expect(second?.code).toContain('fromLeaf')
      expect(second?.code).not.toContain('undefined')
      const secondSystemImport = second?.code.match(/import ['"]([^'"]+\.vanity\.css)['"]/)?.[1]
      expect(secondSystemImport).toBeDefined()
      expect(secondSystemImport).not.toBe(firstSystemImport)
      expect((await server.transformRequest(secondSystemImport!))?.code).toContain('#445566')
      expect(Object.values(server.environments).every(environment =>
        (environment.moduleGraph.getModulesByFile(firstVirtualId)?.size ?? 0) === 0)).toBe(true)
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('addresses namespaces without machine paths and never emits an unbindable name', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-exports-addressing-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "system-exports-addressing", "type": "module" }')
      // `class` is a locked-system member and a reserved word: a valid export
      // alias that no generated module may declare as a binding.
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
const system = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'addressing' })
export { system as ds, system as theme, system as class }
`)
      const entry = await put(root, 'entry.ts', `import { ds, theme } from './system'
export const result = { aliased: ds === theme, token: ds.t.color.brand.$name }
`)
      const built = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        build: {
          write: false,
          minify: false,
          lib: { entry, formats: ['es'], fileName: 'entry' },
        },
      })
      const output = (Array.isArray(built) ? built[0] : built) as Rollup.RollupOutput
      const chunk = output.output.find((item): item is Rollup.OutputChunk => item.type === 'chunk')
      expect(chunk?.code).toBeDefined()

      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      const transformed = await server.transformRequest('/entry.ts', { ssr: true })
      // A virtual ID that carried an absolute path would bake one machine's
      // directories into the graph, sourcemaps, and bundler output.
      expect(transformed?.code).toContain('system-namespace')
      expect(transformed?.code).not.toContain(encodeURIComponent(root))
      expect(transformed?.code).not.toContain(root)

      const loaded = await server.ssrLoadModule('/entry.ts') as {
        result: { aliased: boolean, token: string }
      }
      expect(loaded.result).toEqual({ aliased: true, token: '--addressing-color-brand' })
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)
})
