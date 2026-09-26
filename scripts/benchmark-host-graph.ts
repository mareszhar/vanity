// Measure plain Vite versus Vanity on a deterministic mixed graph; preserve timings as local signals, not per-module budgets.
import type { Plugin, PluginOption } from 'vite'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

const APPLICATION_MODULES = 3_000
const INSTALLED_DEPENDENCY_MODULES = 128

export interface HostGraphMeasurement {
  readonly applicationModules: number
  readonly buildMs: {
    readonly plain: number
    readonly vanity: number
  }
  readonly declarationMs: {
    readonly cold: number
    readonly warm: number
  }
  readonly installedDependencyModules: number
  readonly overheadMs: number
}

interface VanityModule {
  vanityPlugin: (options?: {
    autoImports?: { app?: string }
    compiler?: { system?: string }
  }) => PluginOption
}

async function writeFixture(root: string, path: string, source: string): Promise<string> {
  const file = join(root, path)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, source)
  return file
}

function flattenPlugins(option: PluginOption): Plugin[] {
  const plugins: Plugin[] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const child of value)
        visit(child)
    }
    else if (typeof value === 'object' && value !== null && 'name' in value) {
      plugins.push(value as Plugin)
    }
  }
  visit(option)
  return plugins
}

async function measureDeclarationConfig(
  vanityPlugin: VanityModule['vanityPlugin'],
  root: string,
): Promise<number> {
  const plugins = flattenPlugins(vanityPlugin({ compiler: {} }))
  const plugin = plugins.find(candidate => candidate.name === 'vanity-css-ts')
  const configHook = plugin?.config
  const handler = typeof configHook === 'function'
    ? configHook
    : configHook?.handler
  if (handler === undefined)
    throw new Error('The host plugin is missing its config hook')

  const started = performance.now()
  await Reflect.apply(handler, {}, [{ root }, { command: 'serve', mode: 'development' }])
  return Math.round(performance.now() - started)
}

async function timedBuild(root: string, entry: string, plugins: PluginOption[]): Promise<number> {
  const started = performance.now()
  await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins,
    build: {
      write: false,
      minify: false,
      lib: { entry: join(root, entry), formats: ['es'], fileName: 'entry' },
    },
  })
  return Math.round(performance.now() - started)
}

function removeFinderMetadata(directory: string): void {
  if (!existsSync(directory))
    return

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      removeFinderMetadata(path)
    else if (entry.name === '.DS_Store')
      rmSync(path, { force: true })
  }
}

async function resetGeneratedDirectory(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(directory, { recursive: true, force: true })
      return
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOTEMPTY' || attempt === 4)
        throw error
      removeFinderMetadata(directory)
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 20))
    }
  }
}

/** Measure the host tax on a deterministic graph containing owned and plain modules. */
export async function measureHostGraph(
  workspaceDir: string,
): Promise<HostGraphMeasurement> {
  const applicationModules = APPLICATION_MODULES
  const installedDependencyModules = INSTALLED_DEPENDENCY_MODULES
  const root = join(workspaceDir, '.vanity/benchmarks/host-graph')
  await resetGeneratedDirectory(root)
  mkdirSync(root, { recursive: true })
  await writeFixture(root, 'package.json', '{ "name": "vanity-host-graph", "type": "module" }\n')

  const packageScope = join(root, 'node_modules/@mszr')
  const packageLink = join(packageScope, 'vanity')
  mkdirSync(packageScope, { recursive: true })
  if (!existsSync(packageLink))
    symlinkSync(join(workspaceDir, 'sdk'), packageLink, 'dir')

  await writeFixture(root, 'src/plain/shared.ts', 'export const shared = (value: number) => value + 1\n')
  for (let index = 0; index < applicationModules; index++) {
    const dependencies = [index + 1, index + 2, index + 3]
      .filter(next => next < applicationModules)
    const imports = dependencies.map((next, position) =>
      `import { value as next${position} } from './module-${String(next).padStart(4, '0')}.ts'`,
    ).join('\n')
    const calls = dependencies.map((_, position) => ` + next${position}(value)`).join('')
    await writeFixture(
      root,
      `src/plain/module-${String(index).padStart(4, '0')}.ts`,
      `${imports}${imports ? '\n' : ''}import { shared } from './shared.ts'\nexport const value = (value: number) => shared(value)${calls}\n`,
    )
  }

  const dependencyRoot = join(root, 'node_modules/host-graph-dependency')
  await writeFixture(dependencyRoot, 'package.json', JSON.stringify({
    name: 'host-graph-dependency',
    type: 'module',
    exports: './index.js',
  }, null, 2))
  for (let index = 0; index < installedDependencyModules; index++) {
    const next = index + 1 < installedDependencyModules
      ? `import { value as next } from './module-${String(index + 1).padStart(3, '0')}.js'\n`
      : ''
    await writeFixture(
      dependencyRoot,
      `module-${String(index).padStart(3, '0')}.js`,
      `${next}export const value = (value) => value + ${index}${next ? ' + next(value)' : ''}\n`,
    )
  }
  await writeFixture(dependencyRoot, 'index.js', 'export { value } from "./module-000.js"\n')

  const system = await writeFixture(root, 'src/system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#635bff' } })
  .consolidate({ prefix: 'host-graph' })
`)
  await writeFixture(root, 'src/card.css.ts', `import { ds } from './system.ts'
export const card = ds.class({ color: ds.t.color.brand, padding: '8px' })
`)
  await writeFixture(root, 'src/auto.ts', 'export const hostGraphAutoImport = () => "host graph"\n')
  await writeFixture(root, 'src/plain-entry.ts', `import { value as appValue } from './plain/module-0000.ts'
import { value as dependencyValue } from 'host-graph-dependency'
export const graph = appValue(1) + dependencyValue(1)
`)
  await writeFixture(root, 'src/main.ts', `import { value as appValue } from './plain/module-0000.ts'
import { value as dependencyValue } from 'host-graph-dependency'
import { card } from './card.css.ts'
import { ds } from './system.ts'
export const graph = [appValue(1), dependencyValue(1), card, ds.t.color.brand.$name, hostGraphAutoImport()]
`)

  const plainBuildMs = await timedBuild(root, 'src/plain-entry.ts', [])
  const [{ vanityPlugin }] = await Promise.all([
    import(pathToFileURL(join(workspaceDir, 'sdk/dist/vite.mjs')).href) as Promise<VanityModule>,
  ])
  const declarationRoot = join(workspaceDir, 'sandbox/demo-main')
  const declarationCache = join(declarationRoot, 'node_modules/.vanity/source-packages.json')
  rmSync(declarationCache, { force: true })
  const coldDeclarationMs = await measureDeclarationConfig(vanityPlugin, declarationRoot)
  const warmDeclarationMs = await measureDeclarationConfig(vanityPlugin, declarationRoot)
  const plugins = flattenPlugins(vanityPlugin({
    autoImports: { app: './src/auto.ts' },
    compiler: { system },
  }))
  const vanityBuildMs = await timedBuild(root, 'src/main.ts', plugins)

  return {
    applicationModules,
    buildMs: { plain: plainBuildMs, vanity: vanityBuildMs },
    declarationMs: { cold: coldDeclarationMs, warm: warmDeclarationMs },
    installedDependencyModules,
    overheadMs: vanityBuildMs - plainBuildMs,
  }
}
