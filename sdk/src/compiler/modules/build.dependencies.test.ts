import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vanityPlugin } from '@mszr/vanity/vite'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'
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

describe('style dependency ownership', () => {
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
      const style = await put(root, 'style.css.ts', `import config from './color.json'
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

      await server.transformRequest('/style.css.ts')
      const virtualId = `${style}.vanity.css`
      expect((await server.transformRequest(virtualId))?.code).toContain('#112233')

      const data = join(root, 'color.json')
      await writeFile(data, '{ "color": "#445566" }')
      await hotUpdate(server, data)
      expect((await server.transformRequest(virtualId))?.code).toContain('#445566')

      const vanityEngineDependency = require.resolve('known-css-properties')
      expect(await hotUpdate(server, vanityEngineDependency)).toBeUndefined()
      expect((await server.transformRequest(virtualId))?.code).toContain('#445566')
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
