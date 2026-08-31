/**
 * The build evidence dimension: `*.css.ts` modules are evaluated at build time and leave
 * nothing behind — static CSS out, serialized exports in the bundle, zero
 * authoring code shipped ([patterns.md §1], principle 6). Locked against
 * a real Vite build over the fixture app, a real dev server for the HMR
 * contract (stable ids, in-place swaps), and the debug-name transform as a
 * unit.
 */

import type { AddressInfo } from 'node:net'
import type { Rollup, ViteDevServer } from 'vite'
import { Buffer } from 'node:buffer'
import { cp, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyDebugNames,
  styleAutoImportDeclarations,
  styleExportNames,
  vanityPlugin,
} from '@mszr/vanity/vite'
import { VanityError } from '@test/legacy'
import { build, createLogger, createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { planAutoImportDeclarations } from './prepare'

function local(path: string) {
  return fileURLToPath(new URL(path, import.meta.url))
}

const aliases = {
  '@test/legacy': local('./test-support/legacy.ts'),
  '@mszr/vanity/runtime': local('./runtime.ts'),
  '@mszr/vanity': local('./index.ts'),
}

describe('the vite build', () => {
  async function buildFixture() {
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      root: local('./test-support/vite-app'),
      plugins: [vanityPlugin({
        compiler: {
          identifiers: 'debug',
          system: local('./test-support/vite-app/system.ts'),
        },
      })],
      resolve: { alias: aliases },
      build: {
        write: false,
        minify: false,
        lib: {
          entry: local('./test-support/vite-app/entry.ts'),
          formats: ['es'],
          fileName: 'entry',
        },
      },
    })

    const { output } = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const chunk = output.find(item => item.type === 'chunk')
    const css = output
      .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
      .map(asset => String(asset.source))
      .join('\n')

    return { js: chunk?.type === 'chunk' ? chunk.code : '', css }
  }

  it('shares the .css.ts convention with raw vanilla-extract modules', async () => {
    const root = local('./test-support/vite-app')

    const result = await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({ compiler: { identifiers: 'debug' } })],
      resolve: { alias: aliases },
      build: {
        write: false,
        minify: false,
        lib: { entry: join(root, 'raw-extract.css.ts'), formats: ['es'], fileName: 'entry' },
      },
    })
    const { output } = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const chunk = output.find(item => item.type === 'chunk')
    const asset = output.find(item => item.type === 'asset' && item.fileName.endsWith('.css'))

    expect(chunk?.type === 'chunk' ? chunk.code : '').toMatch(/raw__[\w-]+/)
    expect(asset?.type === 'asset' ? String(asset.source) : '').toContain('color: rebeccapurple')
  })

  it('keeps the raw vanilla-extract compiler transportless', async () => {
    const root = local('./test-support/vite-app')
    const errors: string[] = []
    const logger = createLogger('silent')
    logger.error = message => errors.push(message)
    const blocker = createHttpServer()
    let ownsDefaultPort = false

    await new Promise<void>((resolve, reject) => {
      blocker.once('error', (error) => {
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE')
          resolve()
        else
          reject(error)
      })
      blocker.listen(24678, () => {
        ownsDefaultPort = true
        resolve()
      })
    })

    try {
      await build({
        configFile: false,
        customLogger: logger,
        logLevel: 'silent',
        root,
        plugins: [vanityPlugin({ compiler: { identifiers: 'debug' } })],
        resolve: { alias: aliases },
        build: {
          write: false,
          minify: false,
          lib: { entry: join(root, 'raw-extract.css.ts'), formats: ['es'], fileName: 'entry' },
        },
      })
    }
    finally {
      if (ownsDefaultPort)
        await new Promise(resolve => blocker.close(resolve))
    }

    expect(errors).not.toContainEqual(expect.stringContaining('WebSocket server error'))
  })

  it('does not transform the retired .style.ts suffix', async () => {
    const compiler = vanityPlugin({ compiler: { identifiers: 'debug' } })[0] as import('vite').Plugin
    const transform = typeof compiler.transform === 'object'
      ? compiler.transform.handler
      : compiler.transform

    await expect(transform!.call({} as never, 'export const untouched = true', '/fixture/legacy.style.ts'))
      .resolves
      .toBeNull()
  })

  it('emits static CSS with declaration-name debug ids — no explicit id in the fixture', async () => {
    const { css } = await buildFixture()

    expect(css).toMatch(/\.track__[\w-]+ \{/)
    expect(css).toMatch(/\.fill__[\w-]+ \{/)

    // The export name reached the emitted variable via the debug-name
    // transform, and the default rides the var() reference.
    expect(css).toMatch(/inline-size: calc\(var\(--vanity-fraction__[\w-]+, 0\) \* 100%\)/)
    expect(css).toMatch(/background: var\(--vanity-tint__[\w-]+, var\(--vanity-color-brand\)\)/)
    expect(css).toContain('html {')
    expect(css).toContain('body {')
  })

  it('emits recipe classes per arm, named for the recipe', async () => {
    const { css } = await buildFixture()

    expect(css).toMatch(/\.button__[\w-]+ \{/)
    expect(css).toMatch(/\.button_intent_ghost__[\w-]+ \{/)
    expect(css).toMatch(/\.button_pill__[\w-]+ \{/)

    // The module-local published port got its declaration name too.
    expect(css).toMatch(/padding-inline: var\(--vanity-paddingX__[\w-]+, var\(--vanity-space-sm\)\)/)
  })

  it('ships no build-only authoring code: exports are serialized and handles restored from tables', async () => {
    const { js } = await buildFixture()

    expect(js).toMatch(/track__[\w-]+/)
    expect(js).toMatch(/--vanity-fraction__[\w-]+/)
    expect(js).toContain('restoreRecipe')

    // No build-only implementation survives into application code.
    expect(js).not.toContain('setFileScope')
    expect(js).not.toContain('setAdapter')
    expect(js).not.toContain('createSystem')
    expect(js).not.toContain('@vanilla-extract')
  })

  it('a restored recipe resolves at runtime: classes, defaults, published ports', async () => {
    const { js } = await buildFixture()
    const bundle = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

    expect(bundle.ghostPill).toMatch(/^button__[\w-]+ button_intent_ghost__[\w-]+ button_pill__[\w-]+$/)
    expect(bundle.button()).toMatch(/^button__[\w-]+ button_intent_brand__[\w-]+$/)
    expect(bundle.button.variants).toEqual({ intent: ['brand', 'ghost'] })
    expect(Object.keys(bundle.themedPadding)[0]).toMatch(/^--vanity-paddingX__[\w-]+$/)
  })

  it('restored atoms resolve at runtime from their precompiled tables', async () => {
    const { js } = await buildFixture()
    const bundle = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

    expect(bundle.stackedGap).toMatch(/^atoms_stack__[\w-]+ atoms_gap_sm__[\w-]+$/)
    expect(bundle.atoms({ gap: 'sm' })).toMatch(/^atoms_gap_sm__[\w-]+$/)
  })

  it('restores runtime services and semantic handles in app code', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-runtime-environment-')))
    await writeFile(join(root, 'package.json'), '{ "name": "vanity-runtime-environment", "type": "module" }')
    await writeFile(join(root, 'system.ts'), `import { colorSchemes, createSystem } from '@test/legacy'
const open = createSystem().addAxis('scheme', colorSchemes({ locality: 'root' }))
const positive = { '~standard': { version: 1, vendor: 'fixture', validate: input => typeof input === 'number' && input > 0 ? { value: Math.round(input * 10) / 10 } : { issues: [{ message: 'positive only' }] } } }
const tokens = open.defineTokens({
    color: {
      brand: open.tdef.color({ val: 'red', mutable: true, axes: { scheme: { dark: null } } }),
    },
    ratio: open.tdef.number({ mutable: true, validate: { id: 'positive', schema: positive, runtime: 'always' } }),
})
export const ds = open.addTokens(tokens).consolidate({ prefix: 'app', root: '#app' })
export const { t, runtime, runtimeStyle, runtimeProps, reconcileRuntimeSnapshot } = ds
`)
    await writeFile(join(root, 'entry.ts'), `import { runtime, runtimeProps } from './system'
export function exercise() {
  const values = new Map()
  const attributes = new Map()
  const target = {
    style: {
      setProperty: (name, value) => values.set(name, value),
      removeProperty: name => { const value = values.get(name) ?? ''; values.delete(name); return value },
      getPropertyValue: name => values.get(name) ?? '',
    },
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    getAttribute: name => attributes.get(name) ?? null,
    matches: selector => selector === '#app',
  }
  const positive = { '~standard': { version: 1, vendor: 'fixture', validate: input => typeof input === 'number' && input > 0 ? { value: Math.round(input * 10) / 10 } : { issues: [{ message: 'positive only' }] } } }
  const bound = runtime({ within: target, validators: { positive } })
  bound.t.color.brand.$axes.scheme.dark.$set('black')
  bound.t.ratio.$set(1.26)
  bound.axes.scheme.$switchTo('dark')
  return { snapshot: bound.snapshot(), props: runtimeProps(bound.snapshot()), values: [...values], attributes: [...attributes] }
}
`)
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({ compiler: { identifiers: 'debug', system: join(root, 'system.ts') } })],
      resolve: { alias: aliases },
      build: {
        write: false,
        minify: false,
        lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
      },
    })
    const { output } = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const chunk = output.find(item => item.type === 'chunk')
    const js = chunk?.type === 'chunk' ? chunk.code : ''
    const bundle = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
    const exercised = bundle.exercise()

    expect(exercised.snapshot.overrides).toEqual([expect.objectContaining({
      token: ['color', 'brand'],
      address: { kind: 'axis', axis: 'scheme', mode: 'dark' },
      val: 'black',
    }), expect.objectContaining({ token: ['ratio'], address: { kind: 'base' }, val: '1.3' })])
    expect(exercised.props.$system.attributes).toEqual({ 'data-scheme': 'dark' })
    expect(exercised.values[0][0]).toMatch(/^--app-v-/)
    expect(js).not.toContain('@vanilla-extract')
  })

  it('serializes a whole system for explicit app-side imports', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-system-projection-')))
    await writeFile(join(root, 'package.json'), '{ "name": "vanity-system-projection", "type": "module" }')
    await writeFile(join(root, 'system.ts'), `import { createSystem } from '@test/legacy'
const open = createSystem()
export const ds = open
  .addTokens({ space: { sm: '8px' } })
  .consolidate({ prefix: 'app' })
`)
    await writeFile(join(root, 'entry.ts'), `import { ds } from './system'
export const token = ds.t.space.sm
export const className = ds.class
export const runtime = ds.runtime
`)

    const result = await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({ compiler: { identifiers: 'debug', system: join(root, 'system.ts') } })],
      resolve: { alias: aliases },
      build: {
        write: false,
        minify: false,
        lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
      },
    })
    const { output } = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const chunk = output.find(item => item.type === 'chunk')
    const js = chunk?.type === 'chunk' ? chunk.code : ''
    const bundle = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

    expect(bundle.token()).toBe('var(--app-space-sm)')
    expect(typeof bundle.runtime).toBe('function')
    expect(() => bundle.className({})).toThrow('VANITY_STYLE_MODULE_MISUSE: class belongs in a *.css.ts style module')
  })

  it('writes the manifest beside the CSS — .vanity/manifest.json, versioned', async () => {
    // A copy, so the build artifact never lands in the source tree.
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-manifest-')))
    await cp(local('./test-support/vite-app'), root, { recursive: true })
    await writeFile(join(root, 'package.json'), '{ "name": "vanity-manifest-fixture", "type": "module" }')

    await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({
        compiler: {
          identifiers: 'debug',
          system: join(root, 'system.ts'),
        },
      })],
      resolve: { alias: aliases },
      build: {
        write: false,
        lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
      },
    })

    const manifest = JSON.parse(await readFile(join(root, '.vanity', 'manifest.json'), 'utf-8'))

    expect(manifest.version).toBe(3)
    expect(manifest.system.tokens['color.brand'].name).toBe('--vanity-color-brand')
    expect(manifest.system.tokens['color.brand']).toMatchObject({
      declaredAt: { file: 'system.ts', line: 7, column: 14 },
    })
    const modules = Object.values(manifest.modules) as any[]
    expect((modules.flatMap(module => Object.values(module.recipes))
      .find((recipe: any) => recipe.name === 'button') as any).variants.intent).toEqual(['brand', 'ghost'])
    expect(modules.flatMap(module => Object.keys(module.ports))).toContain('progress.fraction')
    expect(modules.flatMap(module => Object.values(module.styles)).find((style: any) => style.name === 'track')).toMatchObject({
      declaredAt: { file: 'progress.css.ts', line: 10, column: 22 },
      tokens: ['color.surface', 'space.sm'],
    })
  })
})

describe('source-local build diagnostics', () => {
  async function buildBrokenFixture(
    files: Record<string, string>,
    diagnostics?: import('./diagnostics').VanityDiagnosticSink,
    compiler: import('./vite').VanityCompilerOptions = {},
    autoImports?: import('./config').VanityAutoImports,
  ): Promise<unknown> {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-diagnostic-')))

    await writeFile(join(root, 'package.json'), '{ "name": "vanity-diagnostic-fixture", "type": "module" }')

    for (const [file, source] of Object.entries(files))
      await writeFile(join(root, file), source)

    try {
      await build({
        configFile: false,
        logLevel: 'silent',
        root,
        plugins: [vanityPlugin({
          compiler: {
            identifiers: 'debug',
            diagnostics,
            ...compiler,
          },
          ...(autoImports === undefined ? {} : { autoImports }),
        })],
        resolve: { alias: aliases },
        build: {
          write: false,
          lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
        },
      })
    }
    catch (error) {
      return error
    }

    throw new Error('Expected the fixture build to fail')
  }

  function findVanityError(error: unknown): VanityError | undefined {
    const pending = [error]

    for (let depth = 0; depth < 16 && pending.length > 0; depth++) {
      const current = pending.shift()

      if (current === null || typeof current !== 'object')
        continue

      // The evaluated bundle carries its own ESM copy of vanity, so class
      // identity differs even though the structured public error is intact.
      if (current instanceof VanityError || ('name' in current && current.name === 'VanityError' && 'diagnostics' in current))
        return current as VanityError

      if ('cause' in current)
        pending.push(current.cause)

      if ('errors' in current && Array.isArray(current.errors))
        pending.push(...current.errors)
    }

    return undefined
  }

  it('points an invalid declaration at its authored property', async () => {
    const reported: import('./diagnostics').VanityDiagnostic[] = []
    const error = await buildBrokenFixture({
      'entry.ts': 'export { broken } from \'./broken.css\'\n',
      'system.ts': `import { createSystem } from '@test/legacy'
const open = createSystem()
export const ds = open
  .addTokens({ color: { brand: '#635bff' } })
  .consolidate()
`,
      'broken.css.ts': `import { ds } from './system'

export const broken = ds.class({
  borderRadius: '8pxx',
})
`,
    }, diagnostic => reported.push(diagnostic))
    const vanityError = findVanityError(error)
    const diagnostic = vanityError?.diagnostics[0]

    expect(diagnostic).toMatchObject({
      code: 'VANITY_CSS_INVALID_VALUE',
      file: 'broken.css.ts',
      path: ['borderRadius'],
      line: 4,
      column: 3,
    })
    expect(String(error)).toContain('at broken.css.ts:4:3')
    expect(vanityError?.stack).toContain('at vanity.borderRadius (broken.css.ts:4:3)')
    expect(reported).toContainEqual(expect.objectContaining({
      code: 'VANITY_CSS_INVALID_VALUE',
      severity: 'error',
      path: ['borderRadius'],
      fix: expect.objectContaining({ message: expect.any(String) }),
    }))
  })

  it('traces an ambient style alias to its authored property', async () => {
    const error = await buildBrokenFixture({
      'entry.ts': 'export { broken } from \'./broken.css\'\n',
      'system.ts': `import { createSystem } from '@test/legacy'
export const ds = createSystem()
  .addTokens({ color: { brand: '#635bff' } })
  .consolidate()
`,
      'authoring.ts': `import { ds } from './system'
export { ds }
export const { class: mk } = ds
`,
      'broken.css.ts': `export const broken = mk({
  borderRadius: '8pxx',
})
`,
    }, undefined, {
      system: './system.ts',
    }, { style: './authoring.ts' })
    const vanityError = findVanityError(error)
    const diagnostic = vanityError?.diagnostics[0]

    expect(diagnostic).toMatchObject({
      code: 'VANITY_CSS_INVALID_VALUE',
      file: 'broken.css.ts',
      path: ['borderRadius'],
      line: 2,
      column: 3,
    })
    expect(String(error)).toContain('at broken.css.ts:2:3')
  })

  it('traces a composed token failure to the module that defines it', async () => {
    const error = await buildBrokenFixture({
      'entry.ts': 'export { marker } from \'./marker.css\'\n',
      'palette.tokens.ts': `import { createSystem } from '@test/legacy'

const open = createSystem()
export const palette = open.defineTokens({ color: { base: open.oklch(0.7, 0, 0) } })
  .add(m => ({
    color: {
      onBase: open.legibleOn(m.color.base),
    },
  }))
`,
      'system.ts': `import { createSystem } from '@test/legacy'
import { palette } from './palette.tokens'

const open = createSystem()
export const ds = open.addTokens(palette).consolidate()
`,
      'marker.css.ts': `import { ds } from './system'
export const marker = ds.class({ color: ds.t.color.base })
`,
    })
    const vanityError = findVanityError(error)
    const diagnostic = vanityError?.diagnostics[0]

    expect(diagnostic).toMatchObject({
      code: 'VANITY_TOKENS_CONTRAST',
      file: 'palette.tokens.ts',
      path: ['color', 'onBase'],
      line: 7,
      column: 7,
    })
    expect(String(error)).toContain('at palette.tokens.ts:7:7')
    expect(vanityError?.stack).toContain('at vanity.color.onBase (palette.tokens.ts:7:7)')
  })

  it('wraps a substrate syntax error with a structured authored frame and cause', async () => {
    const error = await buildBrokenFixture({
      'entry.ts': 'export { broken } from \'./broken.css\'\n',
      'broken-value.ts': 'export const color =\n',
      'broken.css.ts': `import { createSystem } from '@test/legacy'
import { color } from './broken-value'

const ds = createSystem().consolidate()
export const broken = ds.class({ color })
`,
    })
    const vanityError = findVanityError(error)

    expect(vanityError?.diagnostics[0]).toMatchObject({
      code: 'VANITY_VITE_BUILD_FAILED',
      file: 'broken-value.ts',
      line: 2,
      column: 1,
      fix: { message: expect.stringContaining('same dev server') },
      related: [{
        message: 'style entry that imports this source',
        file: 'broken.css.ts',
      }],
    })
    expect(vanityError?.stack).toContain('at vanity.VANITY_VITE_BUILD_FAILED (broken-value.ts:2:1)')
    expect(vanityError?.cause).toBeDefined()
    expect(vanityError?.message).not.toContain('esbuild')
  })
})

describe('hmr', () => {
  let server: ViteDevServer | undefined

  afterEach(async () => {
    await server?.close()
    server = undefined
  })

  async function serveFixtureCopy() {
    // realpath: Vite resolves modules to real paths; macOS tmpdir is a symlink.
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-hmr-')))
    await cp(local('./test-support/vite-app'), root, { recursive: true })
    // The substrate walks up for a named package.json; the copy needs its own.
    await writeFile(join(root, 'package.json'), '{ "name": "vanity-hmr-fixture", "type": "module" }')

    const warnings: string[] = []
    const logger = createLogger('silent')
    logger.warn = message => warnings.push(message)

    server = await createServer({
      configFile: false,
      customLogger: logger,
      root,
      plugins: [vanityPlugin({
        compiler: {
          identifiers: 'debug',
          system: join(root, 'system.ts'),
        },
      })],
      resolve: { alias: aliases },
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      optimizeDeps: { noDiscovery: true },
    })

    return { root, server, warnings }
  }

  /** The changed file's HMR pass, deterministically: our hook + invalidation. */
  async function hotUpdate(devServer: ViteDevServer, file: string) {
    // The instance wired into the server holds the dependency index.
    const wired = devServer.config.plugins.find(entry => entry.name === 'vanity-css-ts')!
    const modules = [...devServer.moduleGraph.getModulesByFile(file) ?? []]
    devServer.moduleGraph.onFileChange(file)
    for (const environment of Object.values(devServer.environments))
      environment.moduleGraph.onFileChange(file)
    const handler = (typeof wired.handleHotUpdate === 'object'
      ? wired.handleHotUpdate.handler
      : wired.handleHotUpdate) as unknown as (ctx: object) => Promise<unknown> | unknown
    const affected = await handler({
      file,
      server: devServer,
      modules,
      timestamp: Date.now(),
      read: () => readFile(file, 'utf-8'),
    })

    return affected as Array<{ file: string | null }> | undefined
  }

  it('a style edit serves fresh CSS under the same virtual id — swap in place, never stack', async () => {
    const { root, server: devServer } = await serveFixtureCopy()
    const styleUrl = '/progress.css.ts'
    const virtualId = `${join(root, 'progress.css.ts')}.vanity.css`

    const first = await devServer.transformRequest(styleUrl)
    // Vite serves the stable id root-relative — no content hash in the URL.
    expect(first?.code).toContain('import "/progress.css.ts.vanity.css"')
    expect(first?.code).toContain('import.meta.hot.accept()')

    // Browser requests use Vite's root-relative spelling (and Nuxt prefixes
    // it with `/_nuxt/`). It must resolve to the absolute store key too; the
    // An absolute-only resolver would make every SSR stylesheet link return 404.
    expect((await devServer.transformRequest('/progress.css.ts.vanity.css'))?.code)
      .toContain('block-size: 100%')
    expect((await devServer.transformRequest(virtualId))?.code).toContain('block-size: 100%')

    const file = join(root, 'progress.css.ts')
    await writeFile(file, (await readFile(file, 'utf-8')).replace('\'100%\'', '\'50%\''))
    await hotUpdate(devServer, file)

    const second = await devServer.transformRequest(styleUrl)
    // The import is the same stable id — the client's style tag gets replaced.
    expect(second?.code).toContain('import "/progress.css.ts.vanity.css"')

    const refreshed = await devServer.transformRequest(virtualId)
    expect(refreshed?.code).toContain('block-size: 50%')
    expect(refreshed?.code).not.toContain('block-size: 100%')
  })

  it('serves the cascade without invoking build-only asset emission', async () => {
    const { server: devServer, warnings } = await serveFixtureCopy()

    await devServer.transformRequest('/progress.css.ts')

    expect(warnings).not.toContainEqual(
      expect.stringContaining('context method emitFile() is not supported in serve mode'),
    )
  })

  it('dev CSS names its style module, and /__vanity serves the live manifest', async () => {
    const { root, server: devServer } = await serveFixtureCopy()

    await devServer.transformRequest('/progress.css.ts')

    // Provenance: the served stylesheet opens with its origin.
    const served = await devServer.transformRequest(`${join(root, 'progress.css.ts')}.vanity.css`)
    expect(served?.code).toContain('progress.css.ts · vanity')

    // The manifest endpoint reflects what dev has evaluated so far.
    const httpServer = createHttpServer(devServer.middlewares)
    await new Promise<void>(resolve => httpServer.listen(0, resolve))

    try {
      const { port } = httpServer.address() as AddressInfo
      const manifest = await (await fetch(`http://localhost:${port}/__vanity/manifest.json`)).json()

      expect(manifest.version).toBe(3)
      expect(Object.values(manifest.modules as Record<string, any>)
        .flatMap(module => Object.keys(module.ports))).toContain('progress.fraction')

      const page = await (await fetch(`http://localhost:${port}/__vanity/`)).text()
      expect(page).toContain('<title>vanity</title>')
    }
    finally {
      await new Promise(resolve => httpServer.close(resolve))
    }
  })

  it('editing a bundled dependency hot-updates every style module built on it', async () => {
    const { root, server: devServer } = await serveFixtureCopy()

    await devServer.transformRequest('/progress.css.ts')
    await devServer.transformRequest('/button.css.ts')

    const systemFile = join(root, 'system.ts')
    await writeFile(systemFile, (await readFile(systemFile, 'utf-8')).replace('#635bff', '#ff0000'))

    const affected = await hotUpdate(devServer, systemFile)
    const affectedFiles = (affected ?? []).map(moduleNode => moduleNode.file)

    // Both dependents re-evaluate; their fresh CSS lands under the same ids.
    expect(affectedFiles).toContain(join(root, 'progress.css.ts'))
    expect(affectedFiles).toContain(join(root, 'button.css.ts'))

    const transformed = await devServer.transformRequest('/progress.css.ts')
    if (transformed?.code === undefined)
      throw new Error('missing transformed progress module')
    const systemCssUrl = transformed.code.match(/import "([^"]+\.vanity\.css)"/)?.[1]
    expect(systemCssUrl).toBeDefined()
    const refreshed = await devServer.transformRequest(systemCssUrl!)
    expect(refreshed?.code).toContain('#ff0000')
  })

  it('recovers after a successful entry hits a dependency error and preserves last-good CSS', async () => {
    const { root, server: devServer } = await serveFixtureCopy()
    const dependency = join(root, 'lifecycle-value.ts')
    const entry = join(root, 'lifecycle.css.ts')
    const virtualId = `${entry}.vanity.css`

    await writeFile(dependency, 'export const color = \'#635bff\'\n')
    await writeFile(join(root, 'lifecycle-system.ts'), `import { createSystem } from '@test/legacy'
export const ds = createSystem().consolidate({ prefix: 'lifecycle' })
`)
    await writeFile(entry, `import { ds } from './lifecycle-system'
import { color } from './lifecycle-value'

export const lifecycle = ds.class({ color })
`)

    await devServer.transformRequest('/lifecycle.css.ts')
    const lastGood = await devServer.transformRequest(virtualId)
    expect(lastGood?.code).toContain('#635bff')

    await writeFile(dependency, 'export const color =\n')
    await expect(hotUpdate(devServer, dependency)).rejects.toThrow()

    // A failed attempt never replaces the bytes served by the stable CSS id.
    expect((await devServer.transformRequest(virtualId))?.code).toContain('#635bff')

    await writeFile(dependency, 'export const color = \'#00aa55\'\n')
    const affected = await hotUpdate(devServer, dependency)
    expect((affected ?? []).map(moduleNode => moduleNode.file).filter(file => file?.includes('.css.'))).toEqual([entry])

    expect((await devServer.transformRequest(virtualId))?.code).toContain('#00aa55')
  })

  it('recovers a first-ever failed style transform when its dependency is fixed', async () => {
    const { root, server: devServer } = await serveFixtureCopy()
    const dependency = join(root, 'first-value.ts')
    const entry = join(root, 'first.css.ts')

    await writeFile(dependency, 'export const color =\n')
    await writeFile(join(root, 'first-system.ts'), `import { createSystem } from '@test/legacy'
export const ds = createSystem().consolidate({ prefix: 'first' })
`)
    await writeFile(entry, `import { ds } from './first-system'
import { color } from './first-value'

export const first = ds.class({ color })
`)

    await expect(devServer.transformRequest('/first.css.ts')).rejects.toThrow()

    await writeFile(dependency, 'export const color = \'rebeccapurple\'\n')
    const affected = await hotUpdate(devServer, dependency)
    expect((affected ?? []).map(moduleNode => moduleNode.file)).toEqual([entry])

    await expect(devServer.transformRequest('/first.css.ts')).resolves.toBeTruthy()
    const css = await devServer.transformRequest(`${entry}.vanity.css`)
    expect(css?.code).toContain('color: rebeccapurple')
  })
})

describe('auto-imports', () => {
  it('styleExportNames reads every export form', () => {
    const source = `
      import { createEngine } from '@test/legacy'
      const de = createEngine()
      export const { t, css, recipe: makeRecipe } = de.createSystem({ tokens: {} })
      export const brand = '#635bff'
      export function helper() {}
      const local = 1
      export { local, local as alias }
      export { external as refracted } from './external'
      export type { VanityProps } from '@test/legacy'
      // export const phantom = 1
      const text = 'export const alsoPhantom = 1'
    `

    expect(styleExportNames(source).sort())
      .toEqual(['alias', 'brand', 'css', 'helper', 'local', 'makeRecipe', 'refracted', 't'])
  })

  it('export discovery follows syntax through multiline destructuring and defaults', () => {
    const source = `
      export const {
        t,
        css: style,
        recipe: makeRecipe = fallback,
      } = de.createSystem({ tokens: {} })
      export interface TypesOnly {}
      export type Alias = string
    `

    expect(styleExportNames(source).sort()).toEqual(['makeRecipe', 'style', 't'])
  })

  it('generates exact ambient aliases with a stable self-describing banner', () => {
    expect(styleAutoImportDeclarations([{ from: '/design/authoring.ts', imports: ['ds', 'css'] }])).toBe(
      `/* generated by vanity — do not edit */
/* eslint-disable vars-on-top */
declare global {
  /** Auto-imported from /design/authoring.ts. */
  var css: typeof import("/design/authoring.ts").css
  /** Auto-imported from /design/authoring.ts. */
  var ds: typeof import("/design/authoring.ts").ds
}

export {}
`,
    )
  })

  it('an unbound locked system in a style module resolves through generated auto-imports', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-auto-')))
    await cp(local('./test-support/vite-app/system.ts'), join(root, 'system.ts'))
    await writeFile(join(root, 'package.json'), '{ "name": "vanity-auto-fixture", "type": "module" }')
    // No imports at all — `ds` arrives through the auto-import shim.
    await writeFile(join(root, 'card.css.ts'), 'export const card = ds.class({ padding: ds.t.space.sm })\n')
    await writeFile(join(root, 'entry.ts'), 'export { card } from \'./card.css\'\n')

    const result = await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({
        compiler: {
          identifiers: 'debug',
          system: join(root, 'system.ts'),
        },
        autoImports: { style: '$system' },
      })],
      resolve: { alias: aliases },
      build: {
        write: false,
        minify: false,
        lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
      },
    })

    const { output } = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const css = output
      .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
      .map(asset => String(asset.source))
      .join('\n')

    expect(css).toMatch(/\.card__[\w-]+ \{/)
    expect(css).toContain('padding: var(--vanity-space-sm)')
    const declarations = await readFile(join(root, '.vanity/types/vanity-style-auto-imports.d.ts'), 'utf-8')
    const registration = await readFile(join(root, 'node_modules/@types/vanity-style-auto-imports/index.d.ts'), 'utf-8')
    expect(declarations).toContain('var ds: typeof import("../../system.ts").ds')
    expect(registration).toContain('<reference path="../../../.vanity/types/vanity-style-auto-imports.d.ts" />')

    const plan = await planAutoImportDeclarations({
      compiler: {
        system: join(root, 'system.ts'),
      },
      autoImports: { style: '$system' },
    }, { root })
    expect(declarations).toBe(plan.style?.declaration.text)
  })

  it('projects one shared authoring barrel into both Vite module roles', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-style-barrel-')))
    const system = join(root, 'system.ts')
    const authoring = join(root, 'authoring.ts')

    await cp(local('./test-support/vite-app/system.ts'), system)
    await writeFile(join(root, 'package.json'), '{ "name": "vanity-style-barrel", "type": "module" }')
    await writeFile(authoring, `import { ds } from './system'
export { ds }
export const { class: mk, t } = ds
export const appHelper = 'shared barrel'
`)
    await writeFile(join(root, 'styles.css.ts'), 'export const card = mk({ padding: t.space.sm })\n')
    await writeFile(join(root, 'entry.ts'), 'export { card } from \'./styles.css\'\nexport const shared = appHelper\n')

    const result = await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({
        compiler: {
          identifiers: 'debug',
          system,
        },
        autoImports: { shared: authoring },
      })],
      resolve: { alias: aliases },
      build: {
        write: false,
        minify: false,
        lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
      },
    })

    const { output } = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const css = output
      .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
      .map(asset => String(asset.source))
      .join('\n')

    expect(css).toMatch(/\.card__[\w-]+ \{/)
    expect(css).toContain('padding: var(--vanity-space-sm)')
    const chunk = output.find((item): item is Rollup.OutputChunk => item.type === 'chunk')
    expect(chunk?.code).toContain('shared barrel')
    const declarations = await readFile(join(root, '.vanity/types/vanity-style-auto-imports.d.ts'), 'utf-8')
    expect(declarations).toContain('var mk: typeof import("../../authoring.ts").mk')
    expect(declarations).toContain('var t: typeof import("../../authoring.ts").t')
    const appDeclarations = await readFile(join(root, '.vanity/types/vanity-app-auto-imports.d.ts'), 'utf-8')
    expect(appDeclarations).toContain('var appHelper: typeof import("../../authoring.ts").appHelper')
  })

  it('regenerates exact globals when system exports are added and removed', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-auto-watch-')))
    const system = join(root, 'system.ts')
    const card = join(root, 'card.css.ts')
    const original = await readFile(local('./test-support/vite-app/system.ts'), 'utf-8')

    await writeFile(join(root, 'package.json'), '{ "name": "vanity-auto-watch-fixture", "type": "module" }')
    await writeFile(system, original)
    await writeFile(card, 'export const card = ds.class({ padding: ds.t.space.sm })\n')

    const server = await createServer({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({
        compiler: {
          identifiers: 'debug',
          system,
        },
        autoImports: { style: system },
      })],
      resolve: { alias: aliases },
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true },
    })
    const declarations = join(root, '.vanity/types/vanity-style-auto-imports.d.ts')
    const retransform = async () => {
      for (const moduleNode of server.moduleGraph.getModulesByFile(card) ?? [])
        server.moduleGraph.invalidateModule(moduleNode)
      await server.transformRequest('/card.css.ts')
      return readFile(declarations, 'utf-8')
    }

    try {
      expect(await retransform()).not.toContain('const brand:')

      await writeFile(system, `${original}\nexport const brand = ds.t.color.brand\n`)
      expect(await retransform()).toContain('var brand: typeof import("../../system.ts").brand')

      await writeFile(system, original)
      expect(await retransform()).not.toContain('const brand:')
    }
    finally {
      await server.close()
    }
  })

  it('filters style auto-imports while reusing the configured system', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-style-auto-filter-')))
    const system = join(root, 'system.ts')
    const card = join(root, 'card.css.ts')
    const original = await readFile(local('./test-support/vite-app/system.ts'), 'utf-8')

    await writeFile(join(root, 'package.json'), '{ "name": "vanity-style-auto-filter", "type": "module" }')
    await writeFile(system, `${original}\nexport const helper = ds.t.space.sm\n`)
    await writeFile(card, 'export const card = ds.class({ padding: ds.t.space.sm })\n')
    await writeFile(join(root, 'entry.ts'), 'export { card } from \'./card.css\'\n')

    const result = await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({
        compiler: {
          identifiers: 'debug',
          system,
        },
        autoImports: { style: { include: ['ds'] } },
      })],
      resolve: { alias: aliases },
      build: {
        write: false,
        minify: false,
        lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
      },
    })

    const { output } = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const css = output
      .filter((item): item is Rollup.OutputAsset => item.type === 'asset' && item.fileName.endsWith('.css'))
      .map(asset => String(asset.source))
      .join('\n')

    expect(css).toContain('padding: var(--vanity-space-sm)')
    const declarations = await readFile(join(root, '.vanity/types/vanity-style-auto-imports.d.ts'), 'utf-8')
    expect(declarations).toContain('var ds: typeof import("../../system.ts").ds')
    expect(declarations).not.toContain('const helper:')
  })

  it('injects runtime presets and curated application barrels through one plugin', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-runtime-auto-')))
    const helpers = join(root, 'helpers.ts')
    const styles = join(root, 'styles.ts')

    await writeFile(join(root, 'package.json'), '{ "name": "vanity-runtime-auto-fixture", "type": "module" }')
    await writeFile(helpers, `
export function visuallyHidden() {
  return { position: 'absolute', clipPath: 'inset(50%)' }
}
export function minTarget() {
  return { minInlineSize: '44px' }
}
`)
    await writeFile(styles, `export * from './helpers.ts'\n`)
    await writeFile(join(root, 'entry.ts'), `
export const hidden = visuallyHidden()
export const merged = ports()
`)

    const result = await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({
        autoImports: {
          app: {
            presets: ['core'],
            sources: [{ from: './styles.ts', include: ['visuallyHidden'] }],
          },
        },
      })],
      resolve: { alias: aliases },
      build: {
        write: false,
        minify: false,
        lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
      },
    })

    const { output } = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const chunk = output.find((item): item is Rollup.OutputChunk => item.type === 'chunk')

    expect(chunk?.code).toContain('position: "absolute"')
    expect(chunk?.code).toContain('Object.assign')
    expect(chunk?.code).not.toContain('minInlineSize')
    const declarations = await readFile(join(root, '.vanity/types/vanity-app-auto-imports.d.ts'), 'utf8')
    expect(declarations).toContain('var ports:')
    expect(declarations).toContain('var visuallyHidden:')
    expect(declarations).not.toContain('var minTarget:')
  })

  it('scans every named export from an unfiltered local application barrel', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-runtime-barrel-')))
    const helpers = join(root, 'helpers.ts')
    const styles = join(root, 'styles.ts')

    await writeFile(join(root, 'package.json'), '{ "name": "vanity-runtime-barrel-fixture", "type": "module" }')
    await writeFile(helpers, `
export const visuallyHidden = 'visually-hidden'
export const minTarget = 'min-target'
`)
    await writeFile(styles, `export * from './helpers.ts'\n`)
    await writeFile(join(root, 'entry.ts'), `
export const classes = [visuallyHidden, minTarget]
`)

    const result = await build({
      configFile: false,
      logLevel: 'silent',
      root,
      plugins: [vanityPlugin({ autoImports: { app: './styles.ts' } })],
      build: {
        write: false,
        minify: false,
        lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
      },
    })

    const { output } = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const chunk = output.find((item): item is Rollup.OutputChunk => item.type === 'chunk')

    expect(chunk?.code).toContain('visually-hidden')
    expect(chunk?.code).toContain('min-target')
    const declarations = await readFile(join(root, '.vanity/types/vanity-app-auto-imports.d.ts'), 'utf8')
    expect(declarations).toContain('var visuallyHidden:')
    expect(declarations).toContain('var minTarget:')
  })
})

describe('applyDebugNames', () => {
  it('injects the export name into a bare port() call', () => {
    expect(applyDebugNames('export const fraction = port(0)'))
      .toBe('export const fraction = port(0, { label: \'fraction\' })')
  })

  it('injects into the system-bound form', () => {
    expect(applyDebugNames('export const gap = system.port(t.space.sm)'))
      .toBe('export const gap = system.port(t.space.sm, { label: \'gap\' })')
  })

  it('labels module-local ports — the published-ports pattern', () => {
    expect(applyDebugNames('const paddingX = port(t.space.md)'))
      .toBe('const paddingX = port(t.space.md, { label: \'paddingX\' })')
  })

  it('merges into existing options', () => {
    expect(applyDebugNames('export const factor = port(0, { validate: factorValidation })'))
      .toBe('export const factor = port(0, { label: \'factor\', validate: factorValidation })')
  })

  it('respects an explicit label', () => {
    const source = 'export const x = port(0, { label: \'custom\' })'
    expect(applyDebugNames(source)).toBe(source)
  })

  it('respects a quoted explicit label key', () => {
    const source = 'export const x = port(0, { \'label\': \'custom\' })'
    expect(applyDebugNames(source)).toBe(source)
  })

  it('appends debug ids to css, recipe, anatomy, and keyframes calls', () => {
    expect(applyDebugNames('export const card = css({ padding: 8 })'))
      .toBe('export const card = css({ padding: 8 }, \'card\')')
    expect(applyDebugNames('const { class: cls } = ds\nexport const card = cls({ padding: 8 })'))
      .toBe('const { class: cls } = ds\nexport const card = cls({ padding: 8 }, \'card\')')
    expect(applyDebugNames('export const button = recipe({ base: {} })'))
      .toBe('export const button = recipe({ base: {} }, \'button\')')
    expect(applyDebugNames('const dialog = anatomy({ parts: [\'root\'] })'))
      .toBe('const dialog = anatomy({ parts: [\'root\'] }, \'dialog\')')
    expect(applyDebugNames('const fade = system.keyframes({ from: { opacity: 0 } })'))
      .toBe('const fade = system.keyframes({ from: { opacity: 0 } }, \'fade\')')
  })

  it('does not infer an unbound non-canonical authoring name', () => {
    const source = 'export const card = cls({ padding: 8 })'
    expect(applyDebugNames(source)).toBe(source)
  })

  it('respects an explicit debug id', () => {
    const source = 'export const card = css({ padding: 8 }, \'Card\')'
    expect(applyDebugNames(source)).toBe(source)
  })

  it('handles nested parens and strings in arguments', () => {
    // eslint-disable-next-line no-template-curly-in-string
    const template = 'export const w = port(`calc(${x} * (1 + 2))`)'
    // eslint-disable-next-line no-template-curly-in-string
    const labeled = 'export const w = port(`calc(${x} * (1 + 2))`, { label: \'w\' })'

    expect(applyDebugNames(template)).toBe(labeled)
    expect(applyDebugNames('export const s = port(\'a) b\')'))
      .toBe('export const s = port(\'a) b\', { label: \'s\' })')
    expect(applyDebugNames('export const c = css({ content: \'","\' })'))
      .toBe('export const c = css({ content: \'","\' }, \'c\')')
  })

  it('names several declarations in one module', () => {
    const source = 'export const a = port(0), c = recipe({})\nconst b = css({})\n'
    expect(applyDebugNames(source))
      .toBe('export const a = port(0, { label: \'a\' }), c = recipe({}, \'c\')\nconst b = css({}, \'b\')\n')
  })

  it('tracks imported and destructured aliases without touching comments or strings', () => {
    const source = `import { port as makePort, css as style } from './system'
const { recipe: makeRecipe } = system
const gap = makePort(0)
const card = style({ content: 'const fake = port(0)' })
const button = makeRecipe({})
// const phantom = port(0)
`
    const expected = `import { port as makePort, css as style } from './system'
const { recipe: makeRecipe } = system
const gap = makePort(0, { label: 'gap' })
const card = style({ content: 'const fake = port(0)' }, 'card')
const button = makeRecipe({}, 'button')
// const phantom = port(0)
`

    expect(applyDebugNames(source)).toBe(expected)
  })

  it('handles computed bound calls and preserves non-object option expressions', () => {
    expect(applyDebugNames('const gap = system[\'port\'](0)'))
      .toBe('const gap = system[\'port\'](0, { label: \'gap\' })')
    const source = 'const gap = port(0, options)'
    expect(applyDebugNames(source)).toBe(source)
  })

  it('leaves unrelated calls alone', () => {
    const source = 'export const system = createSystem({ tokens: {} })\nconst n = Math.max(1, 2)\n'
    expect(applyDebugNames(source)).toBe(source)
  })
})
