import type { Rollup, ViteDevServer } from 'vite'
import { Buffer } from 'node:buffer'
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vanityPlugin } from '@mszr/vanity/vite'
import { build as esbuild } from 'esbuild'
import { build, createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'

function local(path: string) {
  return fileURLToPath(new URL(path, import.meta.url))
}

const canary = local('../../../sandbox/canary')
const system = local('../../../sandbox/canary/src/system.ts')
const aliases = {
  '@mszr/vanity/runtime': local('../runtime.ts'),
  '@mszr/vanity': local('../index.ts'),
}

const buildOnlyProjectionNames = [
  'class',
  'rules',
  'raw',
  'fragment',
  'tdec',
  'keyframes',
  'fontFace',
  'recipe',
  'anatomy',
  'port',
  'atoms',
  'inLayer',
  'tokensOf',
  'namesOf',
  'varsOf',
  'explain',
  'serialize',
  'introspect',
] as const

function outputOf(result: Awaited<ReturnType<typeof build>>): Rollup.OutputAsset[] | Rollup.OutputChunk[] {
  const build = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
  return build.output as Rollup.OutputAsset[] | Rollup.OutputChunk[]
}

async function temporaryApp(name: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), `vanity-${name}-`)))
  await writeFile(join(root, 'package.json'), '{ "name": "projection-fixture", "type": "module" }\n')
  return root
}

function fixtureSystem(color: string, prefix = 'fixture', ruleMarker?: string): string {
  const rule = ruleMarker === undefined
    ? ''
    : `  .addRule('base', { layer: 'reset', css: { body: { '--${ruleMarker}': 'present' } } })\n`

  return `import { createSystem } from '@mszr/vanity'
const open = createSystem()
export const ds = open
  .addTokens({ color: { brand: ${JSON.stringify(color)} } })
${rule}  .consolidate({ prefix: ${JSON.stringify(prefix)} })
`
}

async function buildLibrary(root: string, plugin: ReturnType<typeof vanityPlugin>, entry = 'entry.ts') {
  return build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins: [plugin],
    resolve: { alias: aliases },
    build: {
      write: false,
      minify: false,
      cssMinify: false,
      cssCodeSplit: true,
      lib: {
        entry: join(root, entry),
        formats: ['es'],
        fileName: () => 'entry.js',
      },
    },
  })
}

describe('the permanent plain-system projection canary', () => {
  it('deduplicates system CSS, splits lazy CSS, and ships no build-only code', async () => {
    const output = outputOf(await build({
      configFile: false,
      logLevel: 'silent',
      root: canary,
      plugins: [vanityPlugin({
        compiler: {
          identifiers: 'debug',
          system,
          layerOrder: ['vendor', 'canary'],
        },
      })],
      resolve: { alias: aliases },
      build: {
        write: false,
        minify: false,
        cssMinify: false,
        cssCodeSplit: true,
      },
    }))
    const assets = output.filter((item): item is Rollup.OutputAsset => item.type === 'asset')
    const chunks = output.filter((item): item is Rollup.OutputChunk => item.type === 'chunk')
    const css = assets.filter(item => item.fileName.endsWith('.css'))
    const allCss = css.map(item => String(item.source)).join('\n')
    const javascript = chunks.map(chunk => chunk.code).join('\n')
    const mainCss = css.find(item => String(item.source).includes('--canary-color-brand:'))
    const lazyCss = css.find(item => String(item.source).includes('lazyPanel'))

    expect(allCss.match(/@layer canary\.tokens;/g)).toHaveLength(1)
    expect(mainCss).toBeDefined()
    expect(lazyCss).toBeDefined()
    expect(String(lazyCss!.source)).not.toContain('--canary-color-brand:')
    expect(String(mainCss!.source)).not.toContain('lazyPanel')
    expect(javascript).not.toContain('createSystem')
    expect(javascript).not.toContain('consolidate')
    expect(javascript).not.toContain('@vanilla-extract')
    expect(javascript).not.toContain('node:buffer')
    expect(javascript).not.toContain('child_process')
    for (const name of buildOnlyProjectionNames)
      expect(javascript).toContain(`${name}: restoreStyleAuthoringStub({ name: "${name}" })`)

    const html = String(assets.find(item => item.fileName === 'index.html')?.source)
    const prelude = html.indexOf('/assets/vanity-cascade.css')
    const entryCss = html.indexOf('.css', prelude + '/assets/vanity-cascade.css'.length)
    expect(prelude).toBeGreaterThan(-1)
    expect(entryCss).toBeGreaterThan(prelude)
    expect(html).not.toContain(lazyCss!.fileName)
  })

  it('projects the same contract into DOM-free SSR and the manifest', async () => {
    const output = outputOf(await build({
      configFile: false,
      logLevel: 'silent',
      root: canary,
      plugins: [vanityPlugin({ compiler: { identifiers: 'debug', system } })],
      resolve: { alias: aliases },
      build: {
        write: false,
        minify: false,
        ssr: local('../../../sandbox/canary/src/entry-server.ts'),
      },
    }))
    const chunk = output.find((item): item is Rollup.OutputChunk => item.type === 'chunk')
    expect(chunk).toBeDefined()
    expect(chunk!.code).not.toContain('createSystem')
    expect(chunk!.code).not.toContain('@vanilla-extract')
    expect(chunk!.code).not.toContain('node:')
    for (const name of buildOnlyProjectionNames)
      expect(chunk!.code).toContain(`${name}: restoreStyleAuthoringStub({ name: "${name}" })`)

    const module = await import(
      `data:text/javascript;base64,${Buffer.from(chunk!.code).toString('base64')}`,
    ) as { renderCanarySeed: () => { snapshot: { modes: object }, props: { attributes: object } } }
    expect(module.renderCanarySeed()).toMatchObject({
      snapshot: { modes: { scheme: 'dark' } },
      props: { $system: { attributes: { 'data-scheme': 'dark' } } },
    })

    const manifest = JSON.parse(await readFile(
      local('../../../sandbox/canary/.vanity/manifest.json'),
      'utf-8',
    ))
    const artifact = JSON.parse(await readFile(
      local(`../../../sandbox/canary/.vanity/systems/${manifest.system.identities.compatibility}.json`),
      'utf-8',
    ))
    expect(manifest.system.format).toBe('vanity.introspection/2')
    expect(artifact.format).toBe('vanity.system/2')
    expect(manifest.system.identities).toEqual(artifact.identities)
    expect(Object.keys(manifest.system.identities).sort()).toEqual([
      'compatibility',
      'css',
      'docs',
      'runtime',
    ])
  })

  it('rejects a stale package build-JS/portable pair by package name', async () => {
    const root = await temporaryApp('stale-system')
    const systemFile = join(root, 'system.ts')
    await writeFile(systemFile, fixtureSystem('red'))
    await writeFile(join(root, 'entry.ts'), `import { ds } from './system'\nexport const name = ds.t.color.brand.$name\n`)

    await buildLibrary(root, vanityPlugin({ compiler: { system: systemFile } }))
    const manifest = JSON.parse(await readFile(join(root, '.vanity/manifest.json'), 'utf-8'))
    const portableFile = join(root, 'portable.json')
    const generatedArtifact = JSON.parse(await readFile(
      join(root, '.vanity', 'systems', `${manifest.system.identities.compatibility}.json`),
      'utf-8',
    ))
    await writeFile(portableFile, `${JSON.stringify(generatedArtifact, null, 2)}\n`)
    await writeFile(systemFile, fixtureSystem('blue'))

    await expect(buildLibrary(root, vanityPlugin({
      compiler: {
        system: {
          entry: systemFile,
          artifact: portableFile,
          packageName: '@fixture/stale',
        },
      },
    }))).rejects.toThrow(/@fixture\/stale.*stale|stale.*@fixture\/stale/)
  })

  it('rejects two different systems that claim one CSS namespace', async () => {
    const root = await temporaryApp('namespace-collision')
    const one = join(root, 'one.ts')
    const two = join(root, 'two.ts')
    await writeFile(one, fixtureSystem('red', 'owned'))
    await writeFile(two, fixtureSystem('blue', 'owned'))
    await writeFile(join(root, 'entry.ts'), `import { ds as one } from './one'\nimport { ds as two } from './two'\nexport const names = [one.t.color.brand.$name, two.t.color.brand.$name]\n`)

    await expect(buildLibrary(root, vanityPlugin({
      compiler: { system: [one, two] },
    }))).rejects.toThrow(/claim CSS namespace 'owned'/)
  })

  it('deduplicates semantically identical physical system copies', async () => {
    const root = await temporaryApp('duplicate-system')
    const one = join(root, 'one.ts')
    const two = join(root, 'two.ts')
    await writeFile(one, fixtureSystem('rebeccapurple', 'duplicate'))
    await writeFile(two, fixtureSystem('rebeccapurple', 'duplicate'))
    await writeFile(join(root, 'one.css.ts'), `import { ds } from './one'\nexport const one = ds.class({ color: ds.t.color.brand })\n`)
    await writeFile(join(root, 'two.css.ts'), `import { ds } from './two'\nexport const two = ds.class({ borderColor: ds.t.color.brand })\n`)
    await writeFile(join(root, 'entry.ts'), `export { one } from './one.css.ts'\nexport { two } from './two.css.ts'\nimport { ds as one } from './one'\nimport { ds as two } from './two'\nexport const same = one.t.color.brand.$name === two.t.color.brand.$name\n`)

    const output = outputOf(await buildLibrary(root, vanityPlugin({ compiler: { system: [one, two] } })))
    const css = output
      .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
      .map(item => String(item.source))
      .join('\n')
    expect(css.match(/--duplicate-color-brand:/g)).toHaveLength(1)

    const manifest = JSON.parse(await readFile(join(root, '.vanity/manifest.json'), 'utf-8'))
    expect(Object.keys(manifest.systems)).toHaveLength(0)
  })

  it('owns named system rules once across multiple style modules', async () => {
    const root = await temporaryApp('system-rules')
    const systemFile = join(root, 'system.ts')
    await writeFile(systemFile, fixtureSystem('rebeccapurple', 'rules', 'rules-once'))
    await writeFile(join(root, 'one.css.ts'), `import { ds } from './system'\nexport const one = ds.class({ color: ds.t.color.brand })\n`)
    await writeFile(join(root, 'two.css.ts'), `import { ds } from './system'\nexport const two = ds.class({ borderColor: ds.t.color.brand })\n`)
    await writeFile(join(root, 'entry.ts'), `export { one } from './one.css.ts'\nexport { two } from './two.css.ts'\n`)

    const output = outputOf(await buildLibrary(root, vanityPlugin({ compiler: { system: systemFile } })))
    const css = output
      .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
      .map(item => String(item.source))
      .join('\n')

    expect(css.match(/--rules-once:\s*present/g)).toHaveLength(1)
  })

  it('evaluates one configured build-time system once across its style modules', async () => {
    const root = await temporaryApp('single-system-evaluation')
    const systemFile = join(root, 'system.ts')
    const counter = '__vanityProjectionSystemEvaluations'
    await writeFile(systemFile, `
globalThis.${counter} = (globalThis.${counter} ?? 0) + 1
${fixtureSystem('rebeccapurple', 'single-evaluation')}
`)
    await writeFile(join(root, 'one.css.ts'), `import { ds } from './system'\nexport const one = ds.class({ color: ds.t.color.brand })\n`)
    await writeFile(join(root, 'two.css.ts'), `import { ds } from './system'\nexport const two = ds.class({ borderColor: ds.t.color.brand })\n`)
    await writeFile(join(root, 'entry.ts'), `export { one } from './one.css.ts'\nexport { two } from './two.css.ts'\n`)

    try {
      await buildLibrary(root, vanityPlugin({ compiler: { system: systemFile } }))
      expect((globalThis as Record<string, unknown>)[counter]).toBe(1)
    }
    finally {
      delete (globalThis as Record<string, unknown>)[counter]
    }
  })

  it('consumes package build JS together with its adjacent portable JSON', async () => {
    const root = await temporaryApp('precompiled-system')
    const source = join(root, 'source.ts')
    const distribution = join(root, 'dist')
    const built = join(distribution, 'system.js')
    await mkdir(distribution)
    await writeFile(source, fixtureSystem('hotpink', 'precompiled'))
    await esbuild({
      entryPoints: [source],
      outfile: built,
      bundle: false,
      format: 'esm',
      platform: 'node',
    })
    await writeFile(join(root, 'card.css.ts'), `import { ds } from './dist/system.js'\nexport const card = ds.class({ color: ds.t.color.brand })\n`)
    await writeFile(join(root, 'entry.ts'), `export { card } from './card.css.ts'\nimport { ds } from './dist/system.js'\nexport const token = ds.t.color.brand.$name\n`)

    await buildLibrary(root, vanityPlugin({ compiler: { system: built } }))
    const firstManifest = JSON.parse(await readFile(join(root, '.vanity/manifest.json'), 'utf-8'))
    const portable = join(distribution, 'system.vanity.json')
    const generated = JSON.parse(await readFile(
      join(root, '.vanity', 'systems', `${firstManifest.system.identities.compatibility}.json`),
      'utf-8',
    ))
    await writeFile(portable, `${JSON.stringify(generated, null, 2)}\n`)

    const output = outputOf(await buildLibrary(root, vanityPlugin({
      compiler: {
        system: {
          entry: built,
          artifact: portable,
          packageName: '@fixture/precompiled',
        },
      },
    })))
    const javascript = output
      .filter((item): item is Rollup.OutputChunk => item.type === 'chunk')
      .map(chunk => chunk.code)
      .join('\n')
    const css = output
      .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
      .map(asset => String(asset.source))
      .join('\n')

    expect(css.match(/--precompiled-color-brand:/g)).toHaveLength(1)
    expect(javascript).not.toContain('createSystem')
    expect(javascript).not.toContain('@vanilla-extract')
  })
})

describe('the permanent plain-system HMR canary', () => {
  let server: ViteDevServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  async function serveCanaryCopy(
    prepare?: (root: string) => Promise<void>,
  ): Promise<{ root: string, system: string, server: ViteDevServer }> {
    const root = await temporaryApp('projection-hmr')
    await cp(join(canary, 'src'), join(root, 'src'), { recursive: true })
    await prepare?.(root)
    const system = join(root, 'src/system.ts')
    server = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({ compiler: { identifiers: 'debug', system } })],
      resolve: { alias: aliases },
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true },
    })
    return { root, system, server }
  }

  async function hotUpdate(devServer: ViteDevServer, file: string) {
    const wired = devServer.config.plugins.find(entry => entry.name === 'vanity-css-ts')!
    const modules = [...devServer.moduleGraph.getModulesByFile(file) ?? []]
    devServer.moduleGraph.onFileChange(file)
    for (const environment of Object.values(devServer.environments))
      environment.moduleGraph.onFileChange(file)
    const handler = (typeof wired.handleHotUpdate === 'object'
      ? wired.handleHotUpdate.handler
      : wired.handleHotUpdate) as unknown as (context: object) => Promise<unknown> | unknown
    return await handler({
      file,
      server: devServer,
      modules,
      timestamp: Date.now(),
      read: () => readFile(file, 'utf-8'),
    }) as Array<{ file: string | null }> | undefined
  }

  function systemCssImport(code: string | undefined): string {
    const match = code?.match(/import "([^"]+vanity-css[^"]+\.vanity\.css)"/)
    if (!match)
      throw new Error('plain-system style transform did not import semantic system CSS')
    return match[1]!
  }

  it('preserves last-good system CSS through dependency failure and repair', async () => {
    const { root, server: devServer } = await serveCanaryCopy(async (copy) => {
      const systemFile = join(copy, 'src/system.ts')
      const source = await readFile(systemFile, 'utf-8')
      await writeFile(join(copy, 'src/theme.ts'), 'export const brand = \'#635bff\'\n')
      await writeFile(
        systemFile,
        `import { brand } from './theme'\n${source.replace('\'#635bff\'', 'brand')}`,
      )
    })
    const theme = join(root, 'src/theme.ts')
    const styleUrl = '/src/shell.css.ts'
    const initial = await devServer.transformRequest(styleUrl)
    const initialCssId = systemCssImport(initial?.code)

    expect((await devServer.transformRequest(initialCssId))?.code).toContain('#635bff')

    await writeFile(theme, 'export const brand =\n')
    await expect(hotUpdate(devServer, theme)).rejects.toThrow()
    expect((await devServer.transformRequest(initialCssId))?.code).toContain('#635bff')

    await writeFile(theme, 'export const brand = \'#2563eb\'\n')
    await expect(hotUpdate(devServer, theme)).resolves.toBeDefined()
    const repaired = await devServer.transformRequest(styleUrl)
    const repairedCssId = systemCssImport(repaired?.code)
    expect((await devServer.transformRequest(repairedCssId))?.code).toContain('#2563eb')
  })

  it('recovers a first-ever failed style entry after its dependency is repaired', async () => {
    const { root, server: devServer } = await serveCanaryCopy()
    const dependency = join(root, 'src/first-value.ts')
    const entry = join(root, 'src/first.css.ts')
    await writeFile(dependency, 'export const color =\n')
    await writeFile(entry, `import { color } from './first-value'
import { ds } from './system'

export const first = ds.class({ color })
`)

    await expect(devServer.transformRequest('/src/first.css.ts')).rejects.toThrow()

    await writeFile(dependency, 'export const color = \'rebeccapurple\'\n')
    const affected = await hotUpdate(devServer, dependency)
    expect((affected ?? []).map(module => module.file)).toContain(entry)
    await expect(devServer.transformRequest('/src/first.css.ts')).resolves.toBeTruthy()
    expect((await devServer.transformRequest(`${entry}.vanity.css`))?.code)
      .toContain('color: rebeccapurple')
  })
})
