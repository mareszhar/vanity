import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compilerProjection } from '../src/plugin.ts'
import {
  appRoot,
  copyMutableFixture,
  fileContaining,
  importFresh,
  joinedByExtension,
  mainSystem,
  occurrences,
  readTree,
  runNode,
  temporaryDirectory,
} from './helpers.ts'

describe('one plain contract serves style, browser, SSR, and tool consumers', () => {
  let clientOutput = ''
  let clientArtifacts = ''
  let clientFiles = new Map<string, string>()
  let clientHarness: ReturnType<typeof compilerProjection>

  beforeAll(async () => {
    const work = await temporaryDirectory('client')
    clientOutput = join(work, 'dist')
    clientArtifacts = join(work, 'artifacts')
    clientHarness = compilerProjection({
      contracts: [mainSystem],
      target: 'browser',
      layerOrder: ['vendor', 'neutral'],
      artifactDirectory: clientArtifacts,
    })

    await build({
      root: appRoot,
      configFile: false,
      logLevel: 'silent',
      plugins: [clientHarness.plugin],
      build: {
        outDir: clientOutput,
        emptyOutDir: true,
        manifest: true,
        cssCodeSplit: true,
        cssMinify: false,
        minify: false,
        modulePreload: { polyfill: false },
      },
    })
    clientFiles = await readTree(clientOutput)
  })

  afterAll(() => {
    delete (globalThis as Record<string, unknown>).__projectionProbe
    delete (globalThis as Record<string, unknown>).__loadProjectionLazy
  })

  it('a plain tool executes the full contract without a compiler or stylesheet scope', async () => {
    const fixture = await copyMutableFixture()
    const before = await readTree(fixture.root)
    const result = JSON.parse(await runNode(join(fixture.app, 'tool.ts'))) as {
      buildPlaneMarker: string
      hasBuildClosure: boolean
      tokenNames: string[]
    }

    expect(result).toMatchObject({
      buildPlaneMarker: 'BUILD_PLANE_SENTINEL',
      hasBuildClosure: true,
      tokenNames: ['brand', 'space'],
    })
    expect(await readTree(fixture.root)).toEqual(before)
  })

  it('many style importers emit one system artifact and keep lazy styles split', () => {
    const css = joinedByExtension(clientFiles, '.css')
    expect(occurrences(css, '--projection-system-artifact')).toBe(1)
    expect(occurrences(css, '--projection-style-artifact')).toBe(3)

    const [, mainCss] = fileContaining(clientFiles, '--projection-style-artifact: "one"')
    const [lazyFile, lazyCss] = fileContaining(clientFiles, '--projection-style-artifact: "lazy-panel"')
    expect(mainCss).toContain('"two"')
    expect(mainCss).toContain('--projection-system-artifact')
    expect(lazyCss).not.toContain('--projection-system-artifact')
    expect(lazyFile).toMatch(/\.css$/)
    expect(mainCss).not.toContain('"lazy-panel"')
  })

  it('the compiler-owned cascade prelude is the first stylesheet', async () => {
    const html = await readFile(join(clientOutput, 'index.html'), 'utf8')
    const stylesheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)]
      .map(match => match[1])

    expect(stylesheets[0]).toBe('/assets/cascade.css')
    expect(await readFile(join(clientOutput, 'assets/cascade.css'), 'utf8'))
      .toBe('@layer vendor, neutral;\n')

    const [lazyFile] = fileContaining(clientFiles, '--projection-style-artifact: "lazy-panel"')
    expect(html).not.toContain(lazyFile)
    expect(joinedByExtension(clientFiles, '.js')).toContain(lazyFile)
  })

  it('the browser graph receives a working facade and no build-plane code', async () => {
    const javascript = joinedByExtension(clientFiles, '.js')
    expect(javascript).toContain('RUNTIME_FACADE_SENTINEL')
    expect(javascript).not.toContain('BUILD_PLANE_SENTINEL')
    expect(javascript).not.toContain('BUILD_PLUGIN_SENTINEL')
    expect(javascript).not.toContain('compiler-projection-spike')
    expect(javascript).not.toContain('node:crypto')

    const [entryFile] = fileContaining(clientFiles, 'RUNTIME_FACADE_SENTINEL')
    await importFresh(join(clientOutput, entryFile))
    expect((globalThis as Record<string, unknown>).__projectionProbe).toMatchObject({
      plane: 'RUNTIME_FACADE_SENTINEL',
      classes: ['one', 'two'],
    })
  })

  it('unused runtime exports tree-shake away', () => {
    const javascript = joinedByExtension(clientFiles, '.js')
    expect(javascript).not.toContain('UNUSED_RUNTIME_SENTINEL')
  })

  it('emits a manifest with all four independent identities', async () => {
    const manifest = JSON.parse(await readFile(clientHarness.snapshot().manifestFile, 'utf8')) as {
      systems: Array<{ identities: Record<string, string> }>
    }
    expect(Object.keys(manifest.systems[0]!.identities).sort()).toEqual([
      'compatibility',
      'css',
      'docs',
      'runtime',
    ])
  })

  it('the SSR build imports the same module through a DOM-free projection', async () => {
    const work = await temporaryDirectory('ssr')
    const output = join(work, 'dist')
    const harness = compilerProjection({
      contracts: [mainSystem],
      target: 'ssr',
      layerOrder: ['vendor', 'neutral'],
      artifactDirectory: join(work, 'artifacts'),
    })

    await build({
      root: appRoot,
      configFile: false,
      logLevel: 'silent',
      plugins: [harness.plugin],
      build: {
        outDir: output,
        emptyOutDir: true,
        minify: false,
        ssr: join(appRoot, 'entry-server.ts'),
      },
    })

    const files = await readTree(output)
    const javascript = joinedByExtension(files, '.js')
    expect(javascript).toContain('SSR_FACADE_SENTINEL')
    expect(javascript).not.toContain('document')
    expect(javascript).not.toContain('BUILD_PLANE_SENTINEL')
    expect([...files.keys()]).not.toContain('assets/cascade.css')

    const [entryFile] = fileContaining(files, 'SSR_FACADE_SENTINEL')
    const module = await importFresh<{ renderSnapshot: () => {
      plane: string
      snapshot: string
    } }>(join(output, entryFile))
    expect(module.renderSnapshot()).toMatchObject({
      plane: 'SSR_FACADE_SENTINEL',
    })
    expect(JSON.parse(module.renderSnapshot().snapshot)).toMatchObject({
      values: { brand: '#ffffff' },
    })
  })
})
