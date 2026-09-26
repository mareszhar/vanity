import type { Rollup, ViteDevServer } from 'vite'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSystem } from '@mszr/vanity'
import { vanityPlugin } from '@mszr/vanity/vite'
import { build, createLogger, createServer } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSystemContract, getSystemContract } from '../../system/contract'

const sdkRoot = fileURLToPath(new URL('../../../', import.meta.url))
const aliases = {
  '@mszr/vanity/runtime': join(sdkRoot, 'dist/runtime.mjs'),
  '@mszr/vanity': join(sdkRoot, 'dist/index.mjs'),
}
const roots: string[] = []
const servers: ViteDevServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })))
})

type PackageKind = 'precompiled' | 'source'
type ModuleKind = 'member' | 'style'
type EnvironmentModule = ViteDevServer['environments']['client']['moduleGraph']['idToModuleMap'] extends Map<string, infer Module>
  ? Module
  : never

async function put(root: string, file: string, contents: string): Promise<string> {
  const path = join(root, file)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents)
  return path
}

async function writePortableArtifact(path: string): Promise<void> {
  const portable = getSystemContract(createSystem()
    .addTokens({ color: { brand: '#123456' } })
    .consolidate({ prefix: 'installed', root: ':root' }))!.portable
  const { source: _source, identities: _identities, ...portableInput } = portable
  void _source
  void _identities
  const sourceLess = createSystemContract({ ...portableInput, emit: () => {} }).portable
  await writeFile(path, `${JSON.stringify(sourceLess, null, 2)}\n`)
}

interface InstalledFixture {
  readonly artifact?: string
  readonly member: string
  readonly packageRoot: string
  readonly root: string
  readonly style: string
  readonly systemEntry: string
}

async function writeInstalledFixture(kind: PackageKind, moduleKind: ModuleKind): Promise<InstalledFixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-physical-package-')))
  roots.push(root)
  await put(root, 'package.json', JSON.stringify({
    name: 'vanity-installed-consumer',
    type: 'module',
    dependencies: { '@mszr/vanity': '0.6.1', 'installed-design': '1.0.0' },
  }))
  const packageRoot = join(root, 'node_modules/installed-design')
  const systemName = kind === 'source' ? 'system.ts' : 'system.js'
  const systemEntry = 'installed-design/barrel'
  const member = await put(packageRoot, systemName, `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'installed', root: ':root' })
`)
  const style = await put(packageRoot, 'card.css.ts', `import { ds } from './${systemName}'
export const card = ds.class({ color: ds.t.color.brand, padding: '8px' })
`)
  await put(packageRoot, 'barrel.ts', `export { ds as theme } from './${systemName}'\n`)
  const artifact = kind === 'precompiled' ? join(packageRoot, 'system.vanity.json') : undefined
  if (artifact !== undefined)
    await writePortableArtifact(artifact)
  await put(packageRoot, 'package.json', JSON.stringify({
    name: 'installed-design',
    version: '1.0.0',
    type: 'module',
    exports: {
      './system': `./${systemName}`,
      './barrel': './barrel.ts',
      './card.css': './card.css.ts',
    },
    dependencies: { '@mszr/vanity': '0.6.1' },
  }, null, 2))
  await mkdir(join(root, 'node_modules/@mszr'), { recursive: true })
  await symlink(sdkRoot, join(root, 'node_modules/@mszr/vanity'), 'dir')

  await put(root, 'src/main.ts', moduleKind === 'member'
    ? `import { theme } from 'installed-design/barrel'
import { ds } from 'installed-design/system'
export const sharedRuntime = theme === ds
export const brandName = ds.t.color.brand.$name
`
    : `import { card } from 'installed-design/card.css'
export { card }
`)

  return { artifact, member, packageRoot, root, style, systemEntry }
}

function pluginFor(fixture: InstalledFixture): ReturnType<typeof vanityPlugin> {
  return vanityPlugin({
    compiler: {
      system: fixture.artifact === undefined
        ? fixture.systemEntry
        : { entry: fixture.systemEntry, artifact: fixture.artifact, packageName: 'installed-design' },
    },
  })
}

function sourcePackageImports(code: string): string[] {
  return moduleImports(code)
    .filter(specifier => specifier.includes('installed-design') || specifier.includes('installed_design'))
}

function moduleImports(code: string): string[] {
  return [...code.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)]
    .map(match => match[1]!)
}

function linkedStylesheets(code: string): string[] {
  return [...code.matchAll(/["']([^"']+\.vanity\.css(?:\?[^"']*)?)["']/g)]
    .map(match => match[1]!)
}

function graphNode(server: ViteDevServer, file: string, ssr: boolean): EnvironmentModule | undefined {
  const moduleGraph = ssr ? server.environments.ssr.moduleGraph : server.environments.client.moduleGraph
  return [...moduleGraph.idToModuleMap.values()].find(module => module.id?.split('?')[0] === file)
}

async function devHttpBase(server: ViteDevServer): Promise<string> {
  await server.listen()
  const url = server.resolvedUrls?.local?.[0]
  if (url === undefined)
    throw new Error('Vite did not report a local HTTP URL')
  return new URL('/', url).href
}

const cases = (['source', 'precompiled'] as const).flatMap(packageKind =>
  (['member', 'style'] as const).flatMap(moduleKind =>
    (['client dev', 'SSR dev', 'client build', 'SSR build'] as const)
      .map(host => ({ host, moduleKind, packageKind }))))

describe.sequential('physically installed packages in client and SSR graphs', () => {
  it.each(cases)('$packageKind package $moduleKind module in $host', async ({ host, moduleKind, packageKind }) => {
    const fixture = await writeInstalledFixture(packageKind, moduleKind)
    const plugin = pluginFor(fixture)

    if (host === 'client dev') {
      const server = await createServer({
        configFile: false,
        logLevel: 'silent',
        root: fixture.root,
        plugins: [plugin],
        resolve: { alias: aliases },
        server: { port: 0, strictPort: false },
      })
      servers.push(server)
      const base = await devHttpBase(server)
      const entryResponse = await fetch(new URL('src/main.ts', base))
      expect(entryResponse.status).toBe(200)
      const entryCode = await entryResponse.text()
      const imports = sourcePackageImports(entryCode)

      // The source package is requested from its installed path, not an
      // optimizer copy. That path keeps the package's authored module identity.
      expect(imports.length).toBeGreaterThan(0)
      expect(imports.every(specifier => !specifier.includes('/.vite/deps/'))).toBe(true)
      const moduleRequest = imports.find(specifier => specifier.includes(moduleKind === 'member' ? 'system' : 'card.css'))
      expect(moduleRequest).toBeDefined()
      const moduleResponse = await fetch(new URL(moduleRequest!, base))
      expect(moduleResponse.status).toBe(200)
      const moduleCode = await moduleResponse.text()

      if (moduleKind === 'member') {
        expect(new URL(moduleRequest!, base).pathname).toContain('/node_modules/installed-design/system.')
        expect(new URL(moduleRequest!, base).pathname).not.toContain('/.vite/deps/')
        expect(moduleCode).not.toMatch(/createSystem|addTokens|consolidate/)
        const runtimeRequest = moduleImports(moduleCode)
          .find(specifier => specifier.includes('vanity:system-runtime'))
        expect(runtimeRequest).toBeDefined()
        const runtimeResponse = await fetch(new URL(runtimeRequest!, base))
        expect(runtimeResponse.status).toBe(200)
        const runtimeCode = await runtimeResponse.text()
        expect(runtimeCode).not.toMatch(/createSystem|addTokens|consolidate/)
        expect(runtimeCode).toContain('--installed-color-brand')
        const optimizedRuntimeRequest = moduleImports(runtimeCode)
          .find(specifier => specifier.includes('@mszr_vanity_runtime') || specifier.includes('@mszr/vanity/runtime'))
        expect(optimizedRuntimeRequest).toBeDefined()
        const optimizedRuntimeResponse = await fetch(new URL(optimizedRuntimeRequest!, base))
        expect(optimizedRuntimeResponse.status).toBe(200)
      }
      else {
        const cssUrls = linkedStylesheets(moduleCode)
        expect(cssUrls.length).toBeGreaterThan(0)
        const cssResponses = await Promise.all(cssUrls.map(url => fetch(new URL(url, base))))
        expect(cssResponses.every(response => response.status === 200)).toBe(true)
        const css = (await Promise.all(cssResponses.map(response => response.text()))).join('\n')
        expect(css).toContain('--installed-color-brand:')
        expect(css).toContain('var(--installed-color-brand)')
      }
      return
    }

    if (host === 'SSR dev') {
      const server = await createServer({
        configFile: false,
        logLevel: 'silent',
        root: fixture.root,
        plugins: [plugin],
        resolve: { alias: aliases },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      servers.push(server)
      const loaded = await server.ssrLoadModule('/src/main.ts') as Record<string, unknown>

      if (moduleKind === 'member') {
        expect(loaded.brandName).toBe('--installed-color-brand')
        expect(loaded.sharedRuntime).toBe(true)
      }
      else {
        const cardNode = graphNode(server, fixture.style, true)
        expect(cardNode).toBeDefined()
        const cssUrls = linkedStylesheets(cardNode?.transformResult?.code ?? '')
        expect(cssUrls.length).toBeGreaterThan(0)
        const stylesheets = await Promise.all(cssUrls.map(url => server.transformRequest(url)))
        const css = stylesheets.map(stylesheet => stylesheet?.code ?? '').join('\n')
        expect(css).toContain('--installed-color-brand:')
        expect(css).toContain('var(--installed-color-brand)')
      }
      return
    }

    const result = await build({
      configFile: false,
      logLevel: 'silent',
      root: fixture.root,
      plugins: [plugin],
      resolve: { alias: aliases },
      build: {
        write: false,
        minify: false,
        ...(host === 'SSR build'
          ? { ssr: 'src/main.ts' }
          : { lib: { entry: join(fixture.root, 'src/main.ts'), formats: ['es'], fileName: 'entry' } }),
      },
    })
    const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const chunks = output.output.filter((item): item is Rollup.OutputChunk => item.type === 'chunk')
    const code = chunks.map(chunk => chunk.code).join('\n')

    if (moduleKind === 'member') {
      expect(code).toContain('--installed-color-brand')
      expect(code).not.toMatch(/createSystem|addTokens|consolidate/)
      if (host === 'SSR build')
        expect(moduleImports(code)).not.toContain('installed-design/system')
    }
    else if (host === 'client build') {
      const css = output.output
        .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
        .map(asset => String(asset.source))
        .join('\n')
      expect(css).toContain('--installed-color-brand:')
      expect(css).toContain('var(--installed-color-brand)')
    }
    else {
      // SSR builds keep the style export in the server graph; the client build
      // and dev cells prove the linked stylesheet bytes themselves.
      expect(code).toMatch(/(?:var|const) card = ["'][^"']+["']/)
      expect(code).not.toMatch(/createSystem|addTokens|consolidate/)
    }
  }, 120_000)

  it('serves an installed kit style through a design package beneath an application shell', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-nested-installed-package-')))
    roots.push(root)
    await put(root, 'package.json', JSON.stringify({
      name: 'vanity-nested-installed-consumer',
      type: 'module',
      dependencies: { 'app-shell': '1.0.0' },
    }))
    await put(root, 'node_modules/@acme/design/system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#123456' } }).consolidate({ prefix: 'nested-installed' })
`)
    const style = await put(root, 'node_modules/@acme/components/card.css.ts', `import { ds } from '@acme/design/system'
export const card = ds.class({ color: ds.t.color.brand, padding: '8px' })
`)
    await put(root, 'node_modules/app-shell/package.json', JSON.stringify({
      name: 'app-shell',
      version: '1.0.0',
      type: 'module',
      exports: { '.': './index.js' },
      dependencies: { '@acme/components': '1.0.0' },
    }))
    await put(root, 'node_modules/app-shell/index.js', `export { card } from '@acme/components'
`)
    await put(root, 'node_modules/@acme/components/package.json', JSON.stringify({
      name: '@acme/components',
      version: '1.0.0',
      type: 'module',
      exports: { '.': './index.js' },
      dependencies: { '@acme/design': '1.0.0' },
    }))
    await put(root, 'node_modules/@acme/components/index.js', `export { card } from './card.css.ts'
`)
    await put(root, 'node_modules/@acme/design/package.json', JSON.stringify({
      name: '@acme/design',
      version: '1.0.0',
      type: 'module',
      exports: { './system': './system.ts' },
      dependencies: { '@mszr/vanity': '0.6.1' },
    }))
    await put(root, 'src/main.ts', `import { card } from 'app-shell'
export { card }
`)

    const server = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({ compiler: { system: '@acme/design/system' } })],
      resolve: { alias: aliases },
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    })
    servers.push(server)

    const loaded = await server.ssrLoadModule('/src/main.ts') as Record<string, unknown>
    expect(typeof loaded.card).toBe('string')
    expect(server.config.optimizeDeps.exclude).toEqual(expect.arrayContaining([
      'app-shell',
      '@acme/components',
      '@acme/design',
    ]))
    expect(server.config.ssr.noExternal).toEqual(expect.arrayContaining([
      'app-shell',
      '@acme/components',
      '@acme/design',
    ]))

    const styleNode = graphNode(server, style, true)
    expect(styleNode).toBeDefined()
    const cssUrls = linkedStylesheets(styleNode?.transformResult?.code ?? '')
    expect(cssUrls.length).toBeGreaterThan(0)
    const stylesheets = await Promise.all(cssUrls.map(url => server.transformRequest(url)))
    const css = stylesheets.map(stylesheet => stylesheet?.code ?? '').join('\n')
    expect(css).toContain('var(--nested-installed-color-brand)')
    expect(css).toContain('--nested-installed-color-brand:')
  }, 60_000)

  it('leaves a CommonJS source package external and warns that its source can bypass Vanity', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-cjs-package-')))
    roots.push(root)
    await put(root, 'package.json', JSON.stringify({
      name: 'vanity-cjs-consumer',
      type: 'module',
      dependencies: { '@mszr/vanity': '0.6.1', 'commonjs-design': '1.0.0' },
    }))
    await put(root, 'node_modules/commonjs-design/package.json', JSON.stringify({
      name: 'commonjs-design',
      version: '1.0.0',
      main: './system.cjs',
      dependencies: { '@mszr/vanity': '0.6.1' },
    }))
    await put(root, 'node_modules/commonjs-design/system.cjs', `
const { createSystem } = require('@mszr/vanity')
exports.ds = createSystem().addTokens({ color: { brand: '#123456' } }).consolidate({ prefix: 'commonjs-design' })
`)
    const warning = vi.fn((_message: string) => {})
    const logger = createLogger('silent')
    logger.warn = warning
    const server = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin()],
      resolve: { alias: aliases },
      customLogger: logger,
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    })
    servers.push(server)

    const noExternal = server.config.ssr.noExternal
    expect(noExternal === true ? [] : noExternal).not.toContain('commonjs-design')
    expect(warning).toHaveBeenCalledOnce()
    expect(warning.mock.calls[0]?.[0]).toContain('commonjs-design is CommonJS')
    expect(warning.mock.calls[0]?.[0]).toContain('Publish commonjs-design as ESM')
  }, 60_000)
})
