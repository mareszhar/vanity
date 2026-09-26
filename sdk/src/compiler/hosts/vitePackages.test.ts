import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createLogger, createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { VanityError } from '../../diagnostics'
import { vanityPlugin } from '../../vite'
import {
  createDeclaredPackageLoader,
  createVitePackageDeclarations,
  filterDeclaredPackageIncludes,
  findDeclaredPackageOverrides,
} from './vitePackages'

const roots: string[] = []
const servers: ViteDevServer[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 50,
  })))
})

async function createRoot(name: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), `vanity-vite-packages-${name}-`)))
  roots.push(root)
  await put(root, 'package.json', JSON.stringify({ name, type: 'module' }))
  return root
}

async function put(root: string, file: string, contents: string): Promise<string> {
  const path = join(root, file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
  return path
}

async function putPackage(root: string, name: string, packageJson: Record<string, unknown>): Promise<void> {
  await put(root, `node_modules/${name}/package.json`, JSON.stringify({ name, version: '1.0.0', ...packageJson }))
}

describe('installed-package declarations', () => {
  it('walks private workspace development dependencies using vitefu resolution', async () => {
    const root = await createRoot('workspace-dev-dependencies')
    await put(root, 'package.json', JSON.stringify({
      name: 'workspace-root',
      private: true,
      dependencies: { 'workspace-shell': 'workspace:*' },
    }))
    const shell = await put(root, 'packages/workspace-shell/package.json', JSON.stringify({
      name: 'workspace-shell',
      private: true,
      devDependencies: { '@acme/design': 'workspace:*' },
    }))
    const design = await put(root, 'packages/design/package.json', JSON.stringify({
      name: '@acme/design',
      dependencies: { '@mszr/vanity': '0.6.1' },
    }))
    await putPackage(root, '@mszr/vanity', {})
    await mkdir(join(root, 'node_modules/@acme'), { recursive: true })
    await symlink(dirname(shell), join(root, 'node_modules/workspace-shell'))
    await symlink(dirname(design), join(root, 'node_modules/@acme/design'))

    const result = await createVitePackageDeclarations(root, {
      isBuild: false,
      userConfig: {},
      getDeclaredPackages: createDeclaredPackageLoader('0.6.1'),
      workspaceRoot: root,
    })

    expect(await realpath(join(root, 'node_modules/workspace-shell/package.json'))).toBe(shell)
    expect(await realpath(design)).toBe(design)
    expect([...result.declaredPackages.names].sort()).toEqual(['@acme/design', 'workspace-shell'])
    expect(result.declarations.optimizeDeps.exclude).toEqual(['@acme/design', 'workspace-shell'])
    expect(result.declarations.ssr.noExternal).toEqual(['@acme/design', 'workspace-shell'])
  })

  it('propagates roles through dependency and peer edges across a cycle', async () => {
    const root = await createRoot('whole-graph')
    await put(root, 'package.json', JSON.stringify({
      name: 'whole-graph',
      dependencies: { 'app-shell': '1.0.0', 'commonjs-design': '1.0.0' },
    }))
    await putPackage(root, '@mszr/vanity', {})
    await putPackage(root, 'app-shell', { dependencies: { 'component-kit': '1.0.0' } })
    await putPackage(root, 'component-kit', { peerDependencies: { '@acme/design': '1.0.0' } })
    await putPackage(root, '@acme/design', {
      type: 'module',
      module: './index.js',
      dependencies: { '@mszr/vanity': '0.6.1', 'component-kit': '1.0.0', 'commonjs-leaf': '1.0.0' },
    })
    await putPackage(root, 'commonjs-leaf', { main: './index.js' })
    await put(root, 'node_modules/commonjs-leaf/index.js', 'module.exports = {}\n')
    await putPackage(root, 'commonjs-design', {
      main: './system.cjs',
      dependencies: { '@mszr/vanity': '0.6.1' },
    })
    await put(root, 'node_modules/commonjs-design/system.cjs', 'exports.ds = {}\n')

    const result = await createVitePackageDeclarations(root, {
      isBuild: false,
      userConfig: {},
      getDeclaredPackages: createDeclaredPackageLoader('0.6.1'),
      workspaceRoot: root,
    })

    expect([...result.declaredPackages.names].sort()).toEqual([
      '@acme/design',
      'app-shell',
      'commonjs-design',
      'component-kit',
    ])
    expect([...result.declaredPackages.commonJsNames]).toEqual(['commonjs-design'])
    expect(result.declarations.optimizeDeps.exclude).toEqual([
      '@acme/design',
      'app-shell',
      'commonjs-design',
      'component-kit',
    ])
    expect(result.declarations.optimizeDeps.include)
      .toContain('app-shell > component-kit > @acme/design > commonjs-leaf')
    expect(result.declarations.ssr.noExternal).toEqual([
      '@acme/design',
      'app-shell',
      'component-kit',
    ])
    expect(result.declarations.ssr.external).toContain('commonjs-leaf')
  })

  it('reuses the persisted set until the nearest lockfile changes', async () => {
    const root = await createRoot('lock-cache')
    await put(root, 'package.json', JSON.stringify({
      name: 'lock-cache',
      dependencies: { '@acme/design': '1.0.0' },
    }))
    await put(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n')
    await putPackage(root, '@mszr/vanity', {})
    await putPackage(root, '@acme/design', { dependencies: { '@mszr/vanity': '0.6.1' } })

    const cold = await createDeclaredPackageLoader('0.6.1')(root)
    expect(cold.names.has('@acme/design')).toBe(true)
    const cachePath = join(root, 'node_modules/.vanity/source-packages.json')
    const originalCache = await readFile(cachePath, 'utf8')

    await putPackage(root, '@acme/design', {})
    const warm = await createDeclaredPackageLoader('0.6.1')(root)
    expect(warm.names.has('@acme/design')).toBe(true)
    expect(await readFile(cachePath, 'utf8')).toBe(originalCache)

    await put(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n# dependency graph changed\n')
    const refreshed = await createDeclaredPackageLoader('0.6.1')(root)
    expect(refreshed.names.has('@acme/design')).toBe(false)

    await putPackage(root, '@acme/design', { dependencies: { '@mszr/vanity': '0.6.1' } })
    await put(root, 'package.json', JSON.stringify({
      name: 'lock-cache',
      description: 'root manifest changed',
      dependencies: { '@acme/design': '1.0.0' },
    }))
    const rootManifestChanged = await createDeclaredPackageLoader('0.6.1')(root)
    expect(rootManifestChanged.names.has('@acme/design')).toBe(true)

    await putPackage(root, '@acme/design', {})
    const sdkVersionChanged = await createDeclaredPackageLoader('0.6.2')(root)
    expect(sdkVersionChanged.names.has('@acme/design')).toBe(false)
  })

  it('never reads or writes a persistent set when no lockfile exists in the workspace root', async () => {
    const parent = await createRoot('no-lock-cache-parent')
    const root = join(parent, 'app')
    await mkdir(root)
    await put(root, 'package.json', JSON.stringify({
      name: 'no-lock-cache',
      dependencies: { '@acme/design': '1.0.0' },
    }))
    await put(parent, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n')
    await putPackage(root, '@mszr/vanity', {})
    await putPackage(root, '@acme/design', { dependencies: { '@mszr/vanity': '0.6.1' } })
    const cachePath = join(root, 'node_modules/.vanity/source-packages.json')
    const staleCache = JSON.stringify({
      version: 1,
      key: 'stale',
      names: ['stale-design'],
      commonJsNames: [],
    })
    await put(root, 'node_modules/.vanity/source-packages.json', staleCache)

    const first = await createDeclaredPackageLoader('0.6.1')(root)
    expect(first.names.has('@acme/design')).toBe(true)
    expect(first.names.has('stale-design')).toBe(false)
    expect(await readFile(cachePath, 'utf8')).toBe(staleCache)

    await putPackage(root, '@acme/design', {})
    const second = await createDeclaredPackageLoader('0.6.1')(root)
    expect(second.names.has('@acme/design')).toBe(false)
    expect(await readFile(cachePath, 'utf8')).toBe(staleCache)
  })

  it('reports malformed installed package metadata with an actionable Vanity diagnostic', async () => {
    const root = await createRoot('malformed-package-metadata')
    await put(root, 'package.json', JSON.stringify({
      name: 'malformed-package-metadata',
      dependencies: { 'broken-package': '1.0.0' },
    }))
    const metadataFile = await put(root, 'node_modules/broken-package/package.json', '{')

    let failure: unknown
    try {
      await createDeclaredPackageLoader('0.6.1')(root)
    }
    catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(VanityError)
    expect(failure).toMatchObject({
      code: 'VANITY_VITE_BUILD_FAILED',
      message: expect.stringContaining(metadataFile),
      cause: expect.any(SyntaxError),
    })
    expect((failure as VanityError).diagnostics[0]?.fix?.message)
      .toContain('reinstall dependencies')
  })

  it('matches host overrides by package name, including globs below the package', async () => {
    const declared = new Set(['@acme/design', '@acme/design-system', 'vanity-tokens'])
    const includes = [
      '@acme/design/authoring',
      '@acme/design/components/**/*.vue',
      '@acme/design-system',
      'app-shell > @acme/design',
      'app-shell > commonjs-leaf',
      'vanity-*',
      'vanity-tokens/components/**/*.vue',
      'unrelated-package',
    ]

    expect(findDeclaredPackageOverrides(includes, declared)).toEqual([
      { packageName: '@acme/design', entry: '@acme/design/authoring' },
      { packageName: '@acme/design', entry: '@acme/design/components/**/*.vue' },
      { packageName: '@acme/design-system', entry: '@acme/design-system' },
      { packageName: '@acme/design', entry: 'app-shell > @acme/design' },
      { packageName: 'vanity-tokens', entry: 'vanity-tokens/components/**/*.vue' },
    ])
    expect(filterDeclaredPackageIncludes(includes, declared)).toEqual([
      'app-shell > commonjs-leaf',
      'vanity-*',
      'unrelated-package',
    ])
  })

  it('does not confuse a deep CommonJS include with an override of its declared parent', async () => {
    const declared = new Set(['@acme/design'])
    expect(findDeclaredPackageOverrides(['@acme/design > commonjs-leaf'], declared)).toEqual([])
  })

  it('warns once when a subpath override bypasses a declared package across shared hosts', async () => {
    const root = await createRoot('override-warning')
    await put(root, 'package.json', JSON.stringify({
      name: 'override-warning',
      dependencies: { '@acme/design': '1.0.0' },
    }))
    await putPackage(root, '@acme/design', { dependencies: { '@mszr/vanity': '0.6.1' } })
    const messages: string[] = []
    const logger = createLogger('silent')
    logger.warn = message => messages.push(message)
    const sharedPlugin = vanityPlugin()
    const client = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      optimizeDeps: { include: ['@acme/design/authoring'] },
      plugins: sharedPlugin,
      customLogger: logger,
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    })
    const ssr = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      optimizeDeps: { include: ['@acme/design/authoring'] },
      plugins: sharedPlugin,
      customLogger: logger,
      build: { ssr: true },
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    })
    servers.push(client, ssr)

    expect(client.config.optimizeDeps.exclude).toContain('@acme/design')
    expect(client.config.ssr.noExternal).toContain('@acme/design')
    const vanityWarnings = messages.filter(message => message.includes('VANITY_VITE_SOURCE_PACKAGE_BYPASSED'))
    expect(vanityWarnings).toHaveLength(1)
    expect(vanityWarnings[0]).toContain('@acme/design/authoring')
    expect(vanityWarnings[0]).toContain('build-time code instead of passing through Vanity')
  })

  it('warns for an optimizer include added by another plugin', async () => {
    const root = await createRoot('plugin-override-warning')
    await put(root, 'package.json', JSON.stringify({
      name: 'plugin-override-warning',
      dependencies: { '@acme/design': '1.0.0' },
    }))
    await putPackage(root, '@acme/design', { dependencies: { '@mszr/vanity': '0.6.1' } })
    const messages: string[] = []
    const logger = createLogger('silent')
    logger.warn = message => messages.push(message)
    const server = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [
        ...vanityPlugin(),
        { name: 'host-source-package-override', config: () => ({ optimizeDeps: { include: ['@acme/design'] } }) },
      ],
      customLogger: logger,
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    })
    servers.push(server)

    const vanityWarnings = messages.filter(message => message.includes('VANITY_VITE_SOURCE_PACKAGE_BYPASSED'))
    expect(vanityWarnings).toHaveLength(1)
    expect(vanityWarnings[0]).toContain('Configuration entry "@acme/design"')
  })

  it('keeps a deep CommonJS include and ssr.external true free of source-package warnings', async () => {
    const root = await createRoot('deep-include-no-warning')
    await put(root, 'package.json', JSON.stringify({
      name: 'deep-include-no-warning',
      dependencies: { '@acme/design': '1.0.0' },
    }))
    await putPackage(root, '@acme/design', {
      type: 'module',
      module: './index.js',
      dependencies: { '@mszr/vanity': '0.6.1', 'commonjs-leaf': '1.0.0' },
    })
    await putPackage(root, 'commonjs-leaf', { main: './index.js' })
    await put(root, 'node_modules/commonjs-leaf/index.js', 'module.exports = {}\n')
    const messages: string[] = []
    const logger = createLogger('silent')
    logger.warn = message => messages.push(message)
    const server = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      optimizeDeps: { include: ['@acme/design > commonjs-leaf'] },
      ssr: { external: true },
      plugins: vanityPlugin(),
      customLogger: logger,
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    })
    servers.push(server)

    expect(messages).toEqual([])
    expect(server.config.optimizeDeps.exclude).toContain('@acme/design')
  })

  it('sends a consumer override warning to the configured diagnostics sink', async () => {
    const root = await createRoot('diagnostics-sink')
    await put(root, 'package.json', JSON.stringify({
      name: 'diagnostics-sink',
      dependencies: { '@acme/design': '1.0.0' },
    }))
    await putPackage(root, '@acme/design', { dependencies: { '@mszr/vanity': '0.6.1' } })
    const diagnostics: Array<{ code: string, message: string }> = []
    const loggerMessages: string[] = []
    const logger = createLogger('silent')
    logger.warn = message => loggerMessages.push(message)
    const server = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      optimizeDeps: { include: ['@acme/design'] },
      plugins: vanityPlugin({ compiler: { diagnostics: diagnostic => diagnostics.push(diagnostic) } }),
      customLogger: logger,
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    })
    servers.push(server)

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      code: 'VANITY_VITE_SOURCE_PACKAGE_BYPASSED',
      severity: 'warning',
      message: expect.stringContaining('@acme/design'),
      fix: { message: expect.stringContaining('Remove "@acme/design"') },
    })
    expect(loggerMessages.filter(message => message.includes('VANITY_VITE_SOURCE_PACKAGE_BYPASSED'))).toEqual([])
  })

  it('adds the runtime entry to optimizer includes only when a system is configured', async () => {
    const root = await createRoot('runtime-include')
    const configuredPlugin = vanityPlugin({ compiler: { system: './system.ts' } })[0] as Plugin
    const plainPlugin = vanityPlugin()[0] as Plugin
    const configuredHook = typeof configuredPlugin.config === 'object'
      ? configuredPlugin.config.handler
      : configuredPlugin.config
    const plainHook = typeof plainPlugin.config === 'object'
      ? plainPlugin.config.handler
      : plainPlugin.config
    if (configuredHook === undefined || plainHook === undefined)
      throw new Error('Vanity is missing its Vite config hook')

    const configured = await Reflect.apply(configuredHook, {}, [
      { root },
      { command: 'serve', mode: 'development' },
    ]) as { optimizeDeps?: { include?: string[] } }
    const plain = await Reflect.apply(plainHook, {}, [
      { root },
      { command: 'serve', mode: 'development' },
    ]) as { optimizeDeps?: { include?: string[] } }

    expect(configured.optimizeDeps?.include).toContain('@mszr/vanity/runtime')
    expect(plain.optimizeDeps?.include).not.toContain('@mszr/vanity/runtime')
  })

  it('fails with a focused error when Vite resolves a different root', async () => {
    const configuredRoot = await createRoot('configured-root')
    const resolvedRoot = await createRoot('resolved-root')
    const plugin = vanityPlugin()[0] as Plugin
    const configHook = typeof plugin.config === 'object' ? plugin.config.handler : plugin.config
    const configResolvedHook = typeof plugin.configResolved === 'object'
      ? plugin.configResolved.handler
      : plugin.configResolved
    if (configHook === undefined || configResolvedHook === undefined)
      throw new Error('Vanity is missing a Vite lifecycle hook')
    await Reflect.apply(configHook, {}, [
      { root: configuredRoot },
      { command: 'serve', mode: 'development' },
    ])

    await expect(Reflect.apply(configResolvedHook, {}, [{ root: resolvedRoot } as ResolvedConfig]))
      .rejects
      .toThrow(`Vanity's installed-package declarations were computed from ${configuredRoot}`)
  })

  it('does not warn for a declared package with no conflicting host entry', async () => {
    const root = await createRoot('no-override-warning')
    await put(root, 'package.json', JSON.stringify({
      name: 'no-override-warning',
      dependencies: { '@acme/design': '1.0.0' },
    }))
    await putPackage(root, '@acme/design', { dependencies: { '@mszr/vanity': '0.6.1' } })
    const messages: string[] = []
    const logger = createLogger('silent')
    logger.warn = message => messages.push(message)
    const server = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: vanityPlugin(),
      customLogger: logger,
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    })
    servers.push(server)

    expect(messages.filter(message => message.includes('VANITY_VITE_SOURCE_PACKAGE_BYPASSED'))).toEqual([])
  })
})
