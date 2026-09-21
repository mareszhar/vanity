import type { Rollup, ViteDevServer } from 'vite'
import type { VanityPortableSystem, VanitySystemIdentities } from './contract'
import { Buffer } from 'node:buffer'
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vanityPlugin } from '@mszr/vanity/vite'
import { build as esbuild } from 'esbuild'
import { build, createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { createSystemContract } from './contract'

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

async function readPortableSystemArtifact(
  root: string,
  identities: VanitySystemIdentities,
): Promise<VanityPortableSystem> {
  const directory = join(root, '.vanity', 'systems')
  for (const file of await readdir(directory)) {
    const portable = JSON.parse(await readFile(join(directory, file), 'utf-8')) as VanityPortableSystem
    if (
      portable.identities.compatibility === identities.compatibility
      && portable.identities.css === identities.css
      && portable.identities.runtime === identities.runtime
      && portable.identities.docs === identities.docs
    ) {
      return portable
    }
  }

  throw new Error(`no generated system artifact matches ${identities.compatibility}`)
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

    const canaryRoot = local('../../../sandbox/canary')
    const manifest = JSON.parse(await readFile(join(canaryRoot, '.vanity/manifest.json'), 'utf-8'))
    const artifact = await readPortableSystemArtifact(canaryRoot, manifest.system.identities)
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

  it('keeps configured system CSS lazy for a plain-system-only build entry', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-css-laziness-')))

    try {
      await writeFile(join(root, 'package.json'), '{ "name": "system-css-laziness", "type": "module" }\n')
      const systemFile = join(root, 'system.ts')
      await writeFile(systemFile, fixtureSystem('#123456', 'tool'))
      await writeFile(join(root, 'entry.ts'), `import { ds } from './system'
export const token = ds.t.color.brand.$name
`)

      const output = outputOf(await buildLibrary(root, vanityPlugin({ compiler: { system: systemFile } })))
      const css = output
        .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
        .map(item => String(item.source))
        .join('\n')

      // The global layer prelude is intentional; unreachable system tokens are not.
      expect(css).not.toContain('--tool-color-brand:')
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('rejects a stale package build-JS/portable pair by package name', async () => {
    const root = await temporaryApp('stale-system')
    const systemFile = join(root, 'system.ts')
    await writeFile(systemFile, fixtureSystem('red'))
    await writeFile(join(root, 'entry.ts'), `import { ds } from './system'\nexport const name = ds.t.color.brand.$name\n`)

    await buildLibrary(root, vanityPlugin({ compiler: { system: systemFile } }))
    const manifest = JSON.parse(await readFile(join(root, '.vanity/manifest.json'), 'utf-8'))
    const portableFile = join(root, 'portable.json')
    const generatedArtifact = await readPortableSystemArtifact(root, manifest.system.identities)
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

  it('rejects a portable artifact whose docs identity predates a description-only edit', async () => {
    const root = await temporaryApp('stale-description-system')
    const systemFile = join(root, 'system.ts')
    const portableFile = join(root, 'portable.json')
    const source = `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addRule('baseline', {
    description: 'old documentation',
    css: { body: { '--description-artifact': 'stable' } },
  })
  .consolidate({ prefix: 'description-artifact' })
`
    await writeFile(systemFile, source)
    await writeFile(join(root, 'card.css.ts'), `import { ds } from './system'
export const card = ds.class({ color: 'var(--description-artifact)' })
`)
    await writeFile(join(root, 'entry.ts'), `export { card } from './card.css.ts'
`)

    await buildLibrary(root, vanityPlugin({ compiler: { system: systemFile } }))
    const manifest = JSON.parse(await readFile(join(root, '.vanity/manifest.json'), 'utf8'))
    const artifact = await readPortableSystemArtifact(root, manifest.system.identities)
    await writeFile(portableFile, `${JSON.stringify(artifact, null, 2)}\n`)
    await writeFile(systemFile, source.replace('old documentation', 'new documentation'))

    await expect(buildLibrary(root, vanityPlugin({
      compiler: {
        system: {
          entry: systemFile,
          artifact: portableFile,
          packageName: '@fixture/description-artifact',
        },
      },
    }))).rejects.toThrow(/docs: build vanity-docs-1-|@fixture\/description-artifact.*stale|stale.*@fixture\/description-artifact/)
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

  it('accepts equivalent system owners with different descriptions without a namespace conflict', async () => {
    const root = await temporaryApp('equivalent-system-docs')
    const one = join(root, 'one.ts')
    const two = join(root, 'two.ts')
    const systemSource = (description: string) => `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addRules({ reset: { description: ${JSON.stringify(description)}, css: { body: { '--shared-rule': 'yes' } } } })
  .consolidate({ prefix: 'shared-docs' })
`

    await writeFile(one, systemSource('first explanation'))
    await writeFile(two, systemSource('second explanation'))
    await writeFile(join(root, 'one.css.ts'), `import { ds } from './one'
export const first = ds.class({ padding: '1px' })
`)
    await writeFile(join(root, 'two.css.ts'), `import { ds } from './two'
export const second = ds.class({ margin: '2px' })
`)
    await writeFile(join(root, 'entry-one.ts'), `export { first } from './one.css.ts'\n`)
    await writeFile(join(root, 'entry-two.ts'), `export { second } from './two.css.ts'\n`)
    await writeFile(join(root, 'entry-both.ts'), `export { first } from './one.css.ts'\nexport { second } from './two.css.ts'\n`)

    await buildLibrary(root, vanityPlugin({ compiler: { system: one } }), 'entry-one.ts')
    const firstManifest = JSON.parse(await readFile(join(root, '.vanity/manifest.json'), 'utf-8'))
    await buildLibrary(root, vanityPlugin({ compiler: { system: two } }), 'entry-two.ts')
    const secondManifest = JSON.parse(await readFile(join(root, '.vanity/manifest.json'), 'utf-8'))
    expect(firstManifest.system.identities.compatibility).toBe(secondManifest.system.identities.compatibility)
    expect(firstManifest.system.identities.css).toBe(secondManifest.system.identities.css)
    expect(firstManifest.system.identities.runtime).toBe(secondManifest.system.identities.runtime)
    expect(firstManifest.system.identities.docs).not.toBe(secondManifest.system.identities.docs)

    const output = outputOf(await buildLibrary(
      root,
      vanityPlugin({ compiler: { system: [one, two] } }),
      'entry-both.ts',
    ))
    const css = output
      .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
      .map(item => String(item.source))
      .join('\n')
    expect(css.match(/--shared-rule:\s*yes/g)).toHaveLength(1)

    const directory = join(root, '.vanity', 'systems')
    expect((await readdir(directory)).filter(file => file.endsWith('.json'))).toHaveLength(1)
    const artifact = await readPortableSystemArtifact(root, firstManifest.system.identities)
    expect(artifact.identities.docs).toBe(firstManifest.system.identities.docs)
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
    const generated = await readPortableSystemArtifact(root, firstManifest.system.identities)
    const { source: authoredSource, identities: previousIdentities, ...portableInput } = generated
    void authoredSource
    void previousIdentities
    const sourceLessArtifact = createSystemContract({
      ...portableInput,
      emit: () => {},
    }).portable
    expect(sourceLessArtifact.source).toBeUndefined()
    await writeFile(portable, `${JSON.stringify(sourceLessArtifact, null, 2)}\n`)

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
    expect(repairedCssId).not.toBe(initialCssId)
    await expect(devServer.transformRequest(initialCssId)).rejects.toThrow()
    expect((await devServer.transformRequest(repairedCssId))?.code).toContain('#2563eb')
  })

  it('keeps CSS stable for a description-only system edit while refreshing manifest docs', async () => {
    const root = await temporaryApp('description-hmr')
    const systemFile = join(root, 'system.ts')
    const styleFile = join(root, 'card.css.ts')
    await writeFile(systemFile, `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addRule('baseline', {
    description: 'old description',
    css: { body: { '--description-stable': 'yes' } },
  })
  .consolidate({ prefix: 'description' })
`)
    await writeFile(styleFile, `import { ds } from './system'
export const card = ds.class({ color: 'var(--description-stable)' })
`)
    await writeFile(join(root, 'entry.ts'), `export { card } from './card.css.ts'
`)
    server = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({ compiler: { identifiers: 'debug', system: systemFile } })],
      resolve: { alias: aliases },
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true },
    })

    const initial = await server.transformRequest('/card.css.ts')
    const cssId = systemCssImport(initial?.code)
    const initialCss = await server.transformRequest(cssId)
    const initialCssCode = initialCss?.code
    const manifestFile = join(root, '.vanity/manifest.json')
    await new Promise(resolve => setTimeout(resolve, 100))
    const before = JSON.parse(await readFile(manifestFile, 'utf8'))

    const sent: unknown[] = []
    const hot = server.hot
    const originalSend = hot.send
    hot.send = ((payload: Parameters<typeof hot.send>[0]) => {
      sent.push(payload)
    }) as typeof hot.send
    try {
      await writeFile(systemFile, (await readFile(systemFile, 'utf8'))
        .replace('old description', 'new description'))
      await expect(hotUpdate(server, systemFile)).resolves.toBeDefined()
    }
    finally {
      hot.send = originalSend
    }

    expect(systemCssImport((await server.transformRequest('/card.css.ts'))?.code)).toBe(cssId)
    expect((await server.transformRequest(cssId))?.code).toBe(initialCssCode)
    expect(sent).toEqual([])

    await new Promise(resolve => setTimeout(resolve, 100))
    const after = JSON.parse(await readFile(manifestFile, 'utf8'))
    expect(after.system.identities.css).toBe(before.system.identities.css)
    expect(after.system.identities.docs).not.toBe(before.system.identities.docs)
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
    const accepted = await devServer.transformRequest('/src/first.css.ts')
    expect(accepted).toBeTruthy()
    const cssUrl = accepted?.code.match(/import "([^"]*\/style\/[^"]+\.vanity\.css)"/)?.[1]
    expect(cssUrl).toBeDefined()
    expect((await devServer.transformRequest(cssUrl!))?.code)
      .toContain('color: rebeccapurple')
  })

  it('updates equivalent configured system owners together after a shared dependency edit', async () => {
    const root = await temporaryApp('batch-system-hmr')
    const theme = join(root, 'theme.ts')
    const one = join(root, 'one-system.ts')
    const two = join(root, 'two-system.ts')
    const systemSource = `import { brand } from './theme'
import { createSystem } from '@mszr/vanity'

export const ds = createSystem()
  .addTokens({ color: { brand } })
  .consolidate({ prefix: 'batch' })
`

    await writeFile(theme, 'export const brand = \'rebeccapurple\'\n')
    await writeFile(one, systemSource)
    await writeFile(two, systemSource)
    await writeFile(join(root, 'one.css.ts'), `import { ds } from './one-system'
export const one = ds.class({ color: ds.t.color.brand })
`)
    await writeFile(join(root, 'two.css.ts'), `import { ds } from './two-system'
export const two = ds.class({ color: ds.t.color.brand })
`)
    server = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({ compiler: { identifiers: 'debug', system: [one, two] } })],
      resolve: { alias: aliases },
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true },
    })

    const firstOne = await server.transformRequest('/one.css.ts')
    const firstTwo = await server.transformRequest('/two.css.ts')
    const firstOneCss = systemCssImport(firstOne?.code)
    const firstTwoCss = systemCssImport(firstTwo?.code)
    expect(firstOneCss).toBe(firstTwoCss)
    expect((await server.transformRequest(firstOneCss))?.code).toContain('rebeccapurple')

    await writeFile(theme, 'export const brand = \'royalblue\'\n')
    await expect(hotUpdate(server, theme)).resolves.toBeDefined()

    const secondOne = await server.transformRequest('/one.css.ts')
    const secondTwo = await server.transformRequest('/two.css.ts')
    const secondOneCss = systemCssImport(secondOne?.code)
    const secondTwoCss = systemCssImport(secondTwo?.code)
    expect(secondOneCss).toBe(secondTwoCss)
    expect(secondOneCss).not.toBe(firstOneCss)
    expect((await server.transformRequest(secondOneCss))?.code).toContain('royalblue')
  })
})
